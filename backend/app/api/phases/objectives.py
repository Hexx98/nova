"""Phase 7 — Actions on Objectives API endpoints.

Final phase: documents what was achieved, business impact, and
produces the executive summary that feeds the report.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Phase, EngagementObjectives, BusinessImpact
from app.models.finding import Finding, Severity
from app.models.user import User
from app.core.audit import log as audit_log
from app.api.deps import require_auth, require_operator

router = APIRouter(prefix="/api/engagements/{engagement_id}/phases/7")

OBJECTIVE_TYPES = [
    "data_exfil",
    "privilege_escalation",
    "rce",
    "lateral_movement",
    "persistence",
    "credential_access",
    "other",
]


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class ObjectiveEntry(BaseModel):
    type: str
    title: str
    description: str
    evidence_preview: str = ""
    impact: str = ""
    finding_ids: list[str] = []


class ObjectivesUpdate(BaseModel):
    achieved_objectives: list[dict[str, Any]] | None = None
    business_impact: BusinessImpact | None = None
    impact_narrative: str | None = None
    executive_summary: str | None = None
    remediation_plan: list[dict[str, Any]] | None = None
    operator_notes: str | None = None


class SignOffRequest(BaseModel):
    notes: str | None = None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _get_phase7(engagement_id: uuid.UUID, db: AsyncSession) -> Phase:
    result = await db.execute(
        select(Phase).where(Phase.engagement_id == engagement_id, Phase.phase_number == 7)
    )
    phase = result.scalar_one_or_none()
    if not phase:
        raise HTTPException(status_code=404, detail="Phase 7 not found")
    return phase


async def _get_or_create_objectives(
    engagement_id: uuid.UUID, phase_id: uuid.UUID, db: AsyncSession
) -> EngagementObjectives:
    result = await db.execute(
        select(EngagementObjectives).where(EngagementObjectives.engagement_id == engagement_id)
    )
    obj = result.scalar_one_or_none()
    if not obj:
        obj = EngagementObjectives(
            id=uuid.uuid4(),
            engagement_id=engagement_id,
            phase_id=phase_id,
        )
        db.add(obj)
        await db.flush()
    return obj


def _serialise(obj: EngagementObjectives) -> dict:
    return {
        "id":                   str(obj.id),
        "achieved_objectives":  obj.achieved_objectives,
        "business_impact":      obj.business_impact.value if obj.business_impact else None,
        "impact_narrative":     obj.impact_narrative,
        "executive_summary":    obj.executive_summary,
        "remediation_plan":     obj.remediation_plan,
        "operator_notes":       obj.operator_notes,
        "approved_by":          str(obj.approved_by) if obj.approved_by else None,
        "approved_at":          obj.approved_at.isoformat() if obj.approved_at else None,
        "updated_at":           obj.updated_at.isoformat() if obj.updated_at else None,
    }


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get("/objectives")
async def get_objectives(
    engagement_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_auth),
):
    phase = await _get_phase7(engagement_id, db)
    result = await db.execute(
        select(EngagementObjectives).where(EngagementObjectives.engagement_id == engagement_id)
    )
    obj = result.scalar_one_or_none()

    # Attach finding summary from Phase 4 for context
    phase4_result = await db.execute(
        select(Phase).where(Phase.engagement_id == engagement_id, Phase.phase_number == 4)
    )
    phase4 = phase4_result.scalar_one_or_none()
    finding_summary: dict[str, int] = {}
    if phase4:
        findings_result = await db.execute(
            select(Finding).where(
                Finding.phase_id == phase4.id,
                Finding.false_positive.is_(False),
            )
        )
        for f in findings_result.scalars():
            finding_summary[f.severity.value] = finding_summary.get(f.severity.value, 0) + 1

    return {
        "objectives":     _serialise(obj) if obj else None,
        "phase_status":   phase.status.value,
        "finding_summary": finding_summary,
        "objective_types": OBJECTIVE_TYPES,
    }


@router.put("/objectives")
async def save_objectives(
    engagement_id: uuid.UUID,
    body: ObjectivesUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_operator),
):
    phase = await _get_phase7(engagement_id, db)
    if phase.status.value == "complete":
        raise HTTPException(status_code=409, detail="Phase 7 is signed off. Reset to edit.")

    obj = await _get_or_create_objectives(engagement_id, phase.id, db)

    if body.achieved_objectives is not None:
        obj.achieved_objectives = body.achieved_objectives
    if body.business_impact is not None:
        obj.business_impact = body.business_impact
    if body.impact_narrative is not None:
        obj.impact_narrative = body.impact_narrative
    if body.executive_summary is not None:
        obj.executive_summary = body.executive_summary
    if body.remediation_plan is not None:
        obj.remediation_plan = body.remediation_plan
    if body.operator_notes is not None:
        obj.operator_notes = body.operator_notes

    await db.commit()
    await db.refresh(obj)

    return {"objectives": _serialise(obj)}


@router.post("/objectives/auto-populate")
async def auto_populate_objectives(
    engagement_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_operator),
):
    """
    Auto-populate objectives from Phase 4 findings.
    Groups confirmed findings by OWASP category into objective entries.
    Does not overwrite existing objectives.
    """
    phase = await _get_phase7(engagement_id, db)
    obj = await _get_or_create_objectives(engagement_id, phase.id, db)

    if obj.achieved_objectives:
        raise HTTPException(
            status_code=409,
            detail="Objectives already exist. Clear them first to auto-populate.",
        )

    phase4_result = await db.execute(
        select(Phase).where(Phase.engagement_id == engagement_id, Phase.phase_number == 4)
    )
    phase4 = phase4_result.scalar_one_or_none()

    generated: list[dict] = []
    has_critical = False

    if phase4:
        findings_result = await db.execute(
            select(Finding).where(
                Finding.phase_id == phase4.id,
                Finding.false_positive.is_(False),
                Finding.severity.in_([Severity.critical, Severity.high]),
            )
        )
        phase4_findings = findings_result.scalars().all()
        has_critical = any(f.severity == Severity.critical for f in phase4_findings)

        cat_to_type = {
            "injection": "rce",
            "authentication": "credential_access",
            "broken_access_control": "privilege_escalation",
            "vulnerable_components": "rce",
            "ssrf": "lateral_movement",
            "xss": "data_exfil",
            "integrity_failures": "credential_access",
        }

        by_cat: dict[str, list] = {}
        for f in phase4_findings:
            cat = f.owasp_category or "other"
            by_cat.setdefault(cat, []).append(f)

        sev_rank = ["critical", "high", "medium", "low", "info"]
        for cat, cat_findings in by_cat.items():
            worst = sorted(cat_findings, key=lambda x: sev_rank.index(x.severity.value))[0]
            generated.append({
                "type":             cat_to_type.get(cat, "other"),
                "title":            worst.title,
                "description":      worst.description[:500],
                "evidence_preview": (worst.evidence or "")[:200],
                "impact":           f"{len(cat_findings)} finding(s) in {cat.replace('_', ' ')}",
                "finding_ids":      [str(f.id) for f in cat_findings],
            })

    obj.achieved_objectives = generated

    if has_critical:
        obj.business_impact = BusinessImpact.critical
    elif generated:
        obj.business_impact = BusinessImpact.high

    await db.commit()
    await db.refresh(obj)

    return {"objectives": _serialise(obj), "auto_generated": len(generated)}


@router.post("/sign-off")
async def sign_off_objectives(
    engagement_id: uuid.UUID,
    body: SignOffRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_operator),
):
    """
    Final sign-off for the entire engagement.
    Requires: executive summary written + at least one objective documented.
    """
    phase = await _get_phase7(engagement_id, db)

    if phase.status.value == "complete":
        raise HTTPException(status_code=409, detail="Phase 7 already signed off.")

    result = await db.execute(
        select(EngagementObjectives).where(EngagementObjectives.engagement_id == engagement_id)
    )
    obj = result.scalar_one_or_none()

    if not obj:
        raise HTTPException(status_code=422, detail="No objectives record found. Save objectives first.")
    if not obj.executive_summary or len(obj.executive_summary.strip()) < 50:
        raise HTTPException(
            status_code=422,
            detail="Executive summary must be at least 50 characters before final sign-off.",
        )
    if not obj.achieved_objectives:
        raise HTTPException(
            status_code=422,
            detail="Document at least one achieved objective before signing off.",
        )

    obj.approved_by = current_user.id
    obj.approved_at = datetime.now(timezone.utc)

    phase.status = "complete"
    phase.operator_sign_off = True
    phase.sign_off_at = datetime.now(timezone.utc)
    phase.signed_off_by = current_user.id
    if body.notes:
        phase.summary = body.notes

    # Mark engagement complete
    from app.models.engagement import Engagement
    eng = await db.get(Engagement, engagement_id)
    if eng:
        eng.status = "complete"

    await audit_log(
        db, action="objectives.signed_off", resource_type="phase",
        resource_id=str(phase.id), user_id=str(current_user.id),
        details={"objectives_count": len(obj.achieved_objectives), "notes": body.notes},
    )
    await db.commit()

    return {
        "signed_off": True,
        "engagement_complete": True,
        "approved_at": obj.approved_at,
    }
