"""
Nova → Titanux export service.

Assembles a complete engagement export document from all phase data.
The export is self-contained JSON — it can be downloaded or pushed
directly to a Titanux instance via its /api/nova-import endpoint.

Export format version: 1.0
"""
from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.engagement import Engagement
from app.models.phase import Phase
from app.models.finding import Finding, Severity
from app.models.attack_plan import AttackPlan
from app.models.delivery_config import DeliveryConfig
from app.models.audit import ArtifactLog, ArtifactStatus
from app.models.c2_session import C2Session
from app.models.objectives import EngagementObjectives
from app.models.user import User
from app.services.masking import apply as mask

EXPORT_VERSION = "1.0"

_SEVERITY_ORDER = ["critical", "high", "medium", "low", "info"]


# ---------------------------------------------------------------------------
# Assembly
# ---------------------------------------------------------------------------

async def build_export(engagement_id: str, db: AsyncSession) -> dict[str, Any]:
    """Assemble the full export document for one engagement."""
    from uuid import UUID
    eid = UUID(engagement_id)

    eng = await db.get(Engagement, eid)
    if not eng:
        raise ValueError(f"Engagement {engagement_id} not found")

    operator = await db.get(User, eng.operator_id)

    phases_result = await db.execute(
        select(Phase).where(Phase.engagement_id == eid).order_by(Phase.phase_number)
    )
    phases = phases_result.scalars().all()

    phase_map = {p.phase_number: p for p in phases}

    # Phase 2 — attack plan
    plan_result = await db.execute(
        select(AttackPlan).where(AttackPlan.engagement_id == eid)
    )
    plan = plan_result.scalar_one_or_none()

    # Phase 3 — delivery config
    delivery_result = await db.execute(
        select(DeliveryConfig).where(DeliveryConfig.engagement_id == eid)
    )
    delivery = delivery_result.scalar_one_or_none()

    # Phase 4 — findings (non-FP only)
    phase4 = phase_map.get(4)
    findings: list[Finding] = []
    if phase4:
        findings_result = await db.execute(
            select(Finding)
            .where(Finding.phase_id == phase4.id, Finding.false_positive.is_(False))
            .order_by(Finding.severity)
        )
        findings = findings_result.scalars().all()

    # Phase 5 — artifacts
    phase5 = phase_map.get(5)
    artifacts: list[ArtifactLog] = []
    if phase5:
        art_result = await db.execute(
            select(ArtifactLog).where(ArtifactLog.phase_id == phase5.id)
        )
        artifacts = art_result.scalars().all()

    # Phase 6 — C2 sessions
    phase6 = phase_map.get(6)
    sessions: list[C2Session] = []
    if phase6:
        c2_result = await db.execute(
            select(C2Session).where(C2Session.phase_id == phase6.id)
        )
        sessions = c2_result.scalars().all()

    # Phase 7 — objectives
    obj_result = await db.execute(
        select(EngagementObjectives).where(EngagementObjectives.engagement_id == eid)
    )
    objectives = obj_result.scalar_one_or_none()

    # Finding severity summary
    sev_counts: dict[str, int] = {s: 0 for s in _SEVERITY_ORDER}
    for f in findings:
        sev_counts[f.severity.value] = sev_counts.get(f.severity.value, 0) + 1

    return {
        "nova_export_version": EXPORT_VERSION,
        "exported_at":         datetime.now(timezone.utc).isoformat(),
        "engagement":          _export_engagement(eng, operator),
        "phases":              [_export_phase(p) for p in phases],
        "summary":             _export_summary(objectives, sev_counts, phases),
        "attack_plan":         _export_attack_plan(plan),
        "recon": {
            "tech_stack": (phase_map.get(1) and phase_map[1].context or {}).get("tech_stack", []),
            "cve_report": plan.cve_report if plan else None,
        },
        "attack_surface": {
            "total_urls":     len(delivery.discovered_urls) if delivery else 0,
            "crawl_stats":    delivery.crawl_stats if delivery else {},
            "approved_urls":  [
                u for u in (delivery.discovered_urls or [])
                if u.get("in_scope") and not u.get("excluded")
            ][:200] if delivery else [],
        },
        "findings":    [_export_finding(f) for f in findings],
        "artifacts":   [_export_artifact(a) for a in artifacts],
        "c2_sessions": [_export_c2(s) for s in sessions],
        "finding_counts": sev_counts,
    }


def _export_engagement(eng: Engagement, operator: User | None) -> dict:
    return {
        "id":                   str(eng.id),
        "name":                 eng.name,
        "target_domain":        eng.target_domain,
        "status":               eng.status.value,
        "scope":                eng.scope,
        "start_date":           eng.start_date.isoformat() if eng.start_date else None,
        "end_date":             eng.end_date.isoformat() if eng.end_date else None,
        "emergency_contact":    eng.emergency_contact,
        "rules_of_engagement":  eng.rules_of_engagement,
        "operator":             operator.email if operator else None,
        "created_at":           eng.created_at.isoformat(),
    }


def _export_phase(p: Phase) -> dict:
    return {
        "phase_number":    p.phase_number,
        "name":            p.name,
        "status":          p.status.value,
        "signed_off":      p.operator_sign_off,
        "sign_off_at":     p.sign_off_at.isoformat() if p.sign_off_at else None,
        "started_at":      p.started_at.isoformat() if p.started_at else None,
        "completed_at":    p.completed_at.isoformat() if p.completed_at else None,
        "summary":         p.summary,
    }


def _export_summary(
    objectives: EngagementObjectives | None,
    sev_counts: dict[str, int],
    phases: list[Phase],
) -> dict:
    completed_phases = [p.name for p in phases if p.status.value == "complete"]
    return {
        "business_impact":    objectives.business_impact.value if objectives and objectives.business_impact else None,
        "executive_summary":  objectives.executive_summary if objectives else None,
        "impact_narrative":   objectives.impact_narrative if objectives else None,
        "achieved_objectives": objectives.achieved_objectives if objectives else [],
        "remediation_plan":   objectives.remediation_plan if objectives else [],
        "finding_counts":     sev_counts,
        "total_findings":     sum(sev_counts.values()),
        "completed_phases":   completed_phases,
    }


def _export_attack_plan(plan: AttackPlan | None) -> dict:
    if not plan:
        return {}
    enabled = [t for t in (plan.items or []) if t.get("enabled", True)]
    return {
        "mode":          plan.mode.value,
        "status":        plan.status.value,
        "total_tasks":   len(plan.items or []),
        "enabled_tasks": len(enabled),
        "items":         enabled,
    }


def _export_finding(f: Finding) -> dict:
    return {
        "id":               str(f.id),
        "title":            f.title,
        "url":              f.url,
        "severity":         f.severity.value,
        "cvss_score":       f.cvss_score,
        "status":           f.status.value,
        "owasp_category":   f.owasp_category,
        "cve_ids":          f.cve_ids or [],
        "tool":             f.tool,
        "description":      f.description,
        "evidence":         mask(f.evidence or ""),
        "proof_of_concept": mask(f.proof_of_concept or ""),
        "remediation":      f.remediation,
        "operator_notes":   f.operator_notes,
    }


def _export_artifact(a: ArtifactLog) -> dict:
    return {
        "id":                  str(a.id),
        "artifact_type":       a.artifact_type.value,
        "target_host":         a.target_host,
        "target_location":     a.target_location,
        "payload_type":        a.payload_type,
        "status":              a.status.value,
        "deployed_at":         a.deployed_at.isoformat(),
        "removed_at":          a.removed_at.isoformat() if a.removed_at else None,
        "removal_verified":    a.removal_verified,
        "verification_method": a.verification_method,
    }


def _export_c2(s: C2Session) -> dict:
    return {
        "id":            str(s.id),
        "channel_type":  s.channel_type.value,
        "label":         s.label,
        "callback_url":  s.callback_url,
        "status":        s.status.value,
        "interaction_count": len(s.interactions or []),
        "interactions":  s.interactions or [],
        "notes":         s.notes,
    }


# ---------------------------------------------------------------------------
# Titanux push
# ---------------------------------------------------------------------------

async def push_to_titanux(
    export_doc: dict[str, Any],
    titanux_url: str,
    api_key: str,
) -> dict[str, Any]:
    """
    Push the export document to a Titanux instance.

    Titanux endpoint: POST {titanux_url}/api/nova-import/engagement
    Auth: Bearer token

    Returns the Titanux response (engagement ID, import status).
    """
    if not titanux_url or not api_key:
        raise ValueError("TITANUX_URL and TITANUX_API_KEY must be configured")

    endpoint = titanux_url.rstrip("/") + "/api/nova-import/engagement"

    # Map Nova export to Titanux import schema
    payload = _to_titanux_payload(export_doc)

    timeout = httpx.Timeout(connect=10.0, read=60.0, write=30.0, pool=5.0)
    async with httpx.AsyncClient(timeout=timeout) as client:
        response = await client.post(
            endpoint,
            json=payload,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
                "X-Nova-Export-Version": export_doc.get("nova_export_version", "1.0"),
            },
        )
        response.raise_for_status()
        return response.json()


def _to_titanux_payload(doc: dict[str, Any]) -> dict[str, Any]:
    """
    Map Nova export document to Titanux import schema.

    Titanux expects:
    - project: engagement metadata + scope
    - findings: list with CVSS, OWASP, evidence
    - report: executive summary + objectives
    - artifacts: cleanup tracking
    """
    eng     = doc.get("engagement", {})
    summary = doc.get("summary", {})

    return {
        "source": "nova",
        "nova_export_version": doc.get("nova_export_version"),
        "exported_at": doc.get("exported_at"),

        "project": {
            "name":           eng.get("name"),
            "target":         eng.get("target_domain"),
            "client":         eng.get("name", "").split(" — ")[0] if " — " in eng.get("name", "") else eng.get("name"),
            "start_date":     eng.get("start_date"),
            "end_date":       eng.get("end_date"),
            "scope":          eng.get("scope"),
            "operator":       eng.get("operator"),
            "methodology":    "OWASP Testing Guide / PTES",
            "nova_id":        eng.get("id"),
        },

        "report": {
            "executive_summary":  summary.get("executive_summary"),
            "impact_narrative":   summary.get("impact_narrative"),
            "business_impact":    summary.get("business_impact"),
            "achieved_objectives": summary.get("achieved_objectives", []),
            "remediation_plan":   summary.get("remediation_plan", []),
            "finding_counts":     summary.get("finding_counts", {}),
            "completed_phases":   summary.get("completed_phases", []),
        },

        "findings": [
            {
                "title":          f["title"],
                "severity":       f["severity"],
                "cvss_score":     f.get("cvss_score"),
                "cve_ids":        f.get("cve_ids", []),
                "owasp_category": f.get("owasp_category"),
                "url":            f.get("url"),
                "description":    f.get("description"),
                "evidence":       f.get("evidence"),
                "remediation":    f.get("remediation"),
                "tool":           f.get("tool"),
                "status":         f.get("status", "open"),
                "nova_finding_id": f["id"],
            }
            for f in doc.get("findings", [])
        ],

        "artifacts": doc.get("artifacts", []),

        "metadata": {
            "recon_tech_stack": doc.get("recon", {}).get("tech_stack", []),
            "attack_surface":   {
                "total_urls": doc.get("attack_surface", {}).get("total_urls", 0),
                "crawl_stats": doc.get("attack_surface", {}).get("crawl_stats", {}),
            },
            "cve_report":  doc.get("recon", {}).get("cve_report"),
            "attack_plan": {
                "mode":          doc.get("attack_plan", {}).get("mode"),
                "enabled_tasks": doc.get("attack_plan", {}).get("enabled_tasks", 0),
            },
        },
    }
