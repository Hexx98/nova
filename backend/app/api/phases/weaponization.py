"""Phase 2 — Weaponization API endpoints."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import AttackPlan, AttackPlanMode, AttackPlanStatus, Phase, Engagement
from app.models.user import User
from app.services.attack_plan import generate_attack_plan, summarize_plan
from app.services.cve_intel import gather_cve_report
from app.core.audit import log as audit_log
from app.api.deps import require_auth

router = APIRouter(prefix="/api/engagements/{engagement_id}/phases/2")


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class WordlistConfig(BaseModel):
    directory_wordlist: str = "raft_medium_directories"
    password_wordlist: str = "rockyou_top10k"
    username_wordlist: str = "top_usernames"
    custom_paths: list[str] = []
    custom_passwords: list[str] = []


class TaskUpdate(BaseModel):
    id: str
    enabled: bool | None = None
    priority: str | None = None
    params: dict[str, Any] | None = None
    notes: str | None = None


class PlanUpdateRequest(BaseModel):
    items: list[dict[str, Any]] | None = None
    operator_notes: str | None = None
    wordlist_config: WordlistConfig | None = None
    mode: AttackPlanMode | None = None


class ApproveRequest(BaseModel):
    notes: str | None = None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _get_engagement(engagement_id: uuid.UUID, db: AsyncSession) -> Engagement:
    eng = await db.get(Engagement, engagement_id)
    if not eng:
        raise HTTPException(status_code=404, detail="Engagement not found")
    return eng


async def _get_phase2(engagement_id: uuid.UUID, db: AsyncSession) -> Phase:
    result = await db.execute(
        select(Phase).where(
            Phase.engagement_id == engagement_id,
            Phase.phase_number == 2,
        )
    )
    phase = result.scalar_one_or_none()
    if not phase:
        raise HTTPException(status_code=404, detail="Phase 2 not found for this engagement")
    return phase


async def _get_plan(engagement_id: uuid.UUID, phase_id: uuid.UUID, db: AsyncSession) -> AttackPlan | None:
    result = await db.execute(
        select(AttackPlan).where(
            AttackPlan.engagement_id == engagement_id,
            AttackPlan.phase_id == phase_id,
        )
    )
    return result.scalar_one_or_none()


async def _require_plan(engagement_id: uuid.UUID, phase_id: uuid.UUID, db: AsyncSession) -> AttackPlan:
    plan = await _get_plan(engagement_id, phase_id, db)
    if not plan:
        raise HTTPException(status_code=404, detail="No attack plan exists for this phase. Generate one first.")
    return plan


def _extract_tech_stack(phase: Phase) -> list[str]:
    """Pull tech stack from Phase 1 recon results stored in phase findings/context."""
    # Phase stores discovered tech in its context JSON or we fall back to common defaults
    ctx = phase.context or {}
    return ctx.get("tech_stack", ["nginx", "php", "jquery"])


def _extract_scope_hosts(engagement: Engagement) -> list[str]:
    scope = engagement.scope or {}
    entries = scope.get("entries", []) if isinstance(scope, dict) else []
    return [s.get("target", "") for s in entries if isinstance(s, dict) and s.get("type") == "domain"]


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get("/plan")
async def get_attack_plan(
    engagement_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_auth),
):
    """Get the current attack plan for Phase 2. Returns None if not yet generated."""
    await _get_engagement(engagement_id, db)
    phase = await _get_phase2(engagement_id, db)
    plan = await _get_plan(engagement_id, phase.id, db)

    if not plan:
        return {"plan": None, "summary": None}

    return {
        "plan": {
            "id": str(plan.id),
            "mode": plan.mode,
            "status": plan.status,
            "items": plan.items,
            "cve_report": plan.cve_report,
            "wordlist_config": plan.wordlist_config,
            "operator_notes": plan.operator_notes,
            "ai_generated_at": plan.ai_generated_at,
            "approved_by": str(plan.approved_by) if plan.approved_by else None,
            "approved_at": plan.approved_at,
        },
        "summary": summarize_plan(plan.items or []),
    }


@router.post("/plan/generate", status_code=status.HTTP_201_CREATED)
async def generate_plan(
    engagement_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_auth),
):
    """
    Generate (or regenerate) an AI-proposed attack plan.
    Queries NVD for CVEs against the discovered tech stack, then builds the plan.
    Idempotent — calling again replaces the existing draft plan.
    """
    engagement = await _get_engagement(engagement_id, db)
    phase = await _get_phase2(engagement_id, db)

    # Pull Phase 1 recon context for tech stack
    phase1_result = await db.execute(
        select(Phase).where(
            Phase.engagement_id == engagement_id,
            Phase.phase_number == 1,
        )
    )
    phase1 = phase1_result.scalar_one_or_none()
    tech_stack = (phase1.context or {}).get("tech_stack", ["nginx", "php", "jquery"]) if phase1 else ["nginx", "php", "jquery"]
    scope_hosts = _extract_scope_hosts(engagement)

    # Gather CVE intelligence (async, parallel)
    cve_report = await gather_cve_report(tech_stack)

    # Generate AI plan
    items = generate_attack_plan(tech_stack, cve_report, scope_hosts)

    # Upsert plan
    existing = await _get_plan(engagement_id, phase.id, db)
    if existing:
        if existing.status in (AttackPlanStatus.approved, AttackPlanStatus.active):
            raise HTTPException(
                status_code=409,
                detail=f"Cannot regenerate a plan with status '{existing.status}'. Reset to draft first.",
            )
        existing.items = items
        existing.cve_report = cve_report
        existing.mode = AttackPlanMode.ai_proposed
        existing.status = AttackPlanStatus.draft
        existing.ai_generated_at = datetime.now(timezone.utc)
        plan = existing
    else:
        plan = AttackPlan(
            id=uuid.uuid4(),
            engagement_id=engagement_id,
            phase_id=phase.id,
            mode=AttackPlanMode.ai_proposed,
            status=AttackPlanStatus.draft,
            items=items,
            cve_report=cve_report,
            wordlist_config={},
            ai_generated_at=datetime.now(timezone.utc),
        )
        db.add(plan)

    await db.flush()
    await audit_log(
        db,
        action="attack_plan.generated",
        resource_type="attack_plan",
        resource_id=str(plan.id),
        user_id=str(current_user.id),
        details={"tech_stack": tech_stack, "task_count": len(items), "cve_count": cve_report.get("total_cves", 0)},
    )
    await db.commit()
    await db.refresh(plan)

    return {
        "plan": {
            "id": str(plan.id),
            "mode": plan.mode,
            "status": plan.status,
            "items": plan.items,
            "cve_report": plan.cve_report,
            "wordlist_config": plan.wordlist_config,
            "operator_notes": plan.operator_notes,
            "ai_generated_at": plan.ai_generated_at,
        },
        "summary": summarize_plan(plan.items or []),
    }


@router.patch("/plan")
async def update_plan(
    engagement_id: uuid.UUID,
    body: PlanUpdateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_auth),
):
    """Update plan items, notes, wordlist config, or switch mode. Only allowed in draft status."""
    phase = await _get_phase2(engagement_id, db)
    plan = await _require_plan(engagement_id, phase.id, db)

    if plan.status not in (AttackPlanStatus.draft,):
        raise HTTPException(
            status_code=409,
            detail=f"Plan is '{plan.status}' — only draft plans can be edited.",
        )

    if body.items is not None:
        plan.items = body.items
        if plan.mode == AttackPlanMode.ai_proposed:
            plan.mode = AttackPlanMode.customized

    if body.operator_notes is not None:
        plan.operator_notes = body.operator_notes

    if body.wordlist_config is not None:
        plan.wordlist_config = body.wordlist_config.model_dump()

    if body.mode is not None:
        plan.mode = body.mode

    await db.flush()
    await audit_log(
        db,
        action="attack_plan.updated",
        resource_type="attack_plan",
        resource_id=str(plan.id),
        user_id=str(current_user.id),
        details={"mode": plan.mode},
    )
    await db.commit()
    await db.refresh(plan)

    return {"plan": {"id": str(plan.id), "items": plan.items, "mode": plan.mode, "status": plan.status}}


@router.patch("/plan/tasks/{task_id}")
async def update_task(
    engagement_id: uuid.UUID,
    task_id: str,
    body: TaskUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_auth),
):
    """Toggle, re-prioritize, or annotate a single task. Switches mode to customized."""
    phase = await _get_phase2(engagement_id, db)
    plan = await _require_plan(engagement_id, phase.id, db)

    if plan.status not in (AttackPlanStatus.draft,):
        raise HTTPException(status_code=409, detail="Only draft plans can be edited.")

    items = list(plan.items or [])
    idx = next((i for i, t in enumerate(items) if t.get("id") == task_id), None)
    if idx is None:
        raise HTTPException(status_code=404, detail=f"Task {task_id} not found")

    task = dict(items[idx])
    if body.enabled is not None:
        task["enabled"] = body.enabled
    if body.priority is not None:
        task["priority"] = body.priority
    if body.params is not None:
        task["params"] = {**task.get("params", {}), **body.params}
    if body.notes is not None:
        task["operator_notes"] = body.notes

    items[idx] = task
    plan.items = items
    if plan.mode == AttackPlanMode.ai_proposed:
        plan.mode = AttackPlanMode.customized

    await db.flush()
    await db.commit()
    await db.refresh(plan)

    return {"task": task, "mode": plan.mode}


@router.post("/plan/approve")
async def approve_plan(
    engagement_id: uuid.UUID,
    body: ApproveRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_auth),
):
    """
    Operator approves the attack plan, gating Phase 3 (Delivery).
    Plan must have at least one enabled task.
    """
    phase = await _get_phase2(engagement_id, db)
    plan = await _require_plan(engagement_id, phase.id, db)

    if plan.status != AttackPlanStatus.draft:
        raise HTTPException(status_code=409, detail=f"Plan is already '{plan.status}'.")

    enabled_count = sum(1 for t in (plan.items or []) if t.get("enabled", True))
    if enabled_count == 0:
        raise HTTPException(status_code=422, detail="At least one task must be enabled before approval.")

    plan.status = AttackPlanStatus.approved
    plan.approved_by = current_user.id
    plan.approved_at = datetime.now(timezone.utc)
    if body.notes:
        plan.operator_notes = (plan.operator_notes or "") + f"\n[Approval] {body.notes}"

    # Mark Phase 2 complete
    phase.status = "complete"

    await db.flush()
    await audit_log(
        db,
        action="attack_plan.approved",
        resource_type="attack_plan",
        resource_id=str(plan.id),
        user_id=str(current_user.id),
        details={"enabled_tasks": enabled_count, "notes": body.notes},
    )
    await db.commit()

    return {
        "status": plan.status,
        "approved_by": str(current_user.id),
        "approved_at": plan.approved_at,
        "enabled_tasks": enabled_count,
    }


@router.post("/plan/reset")
async def reset_plan(
    engagement_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_auth),
):
    """Reset an approved plan back to draft (requires regeneration or re-approval)."""
    phase = await _get_phase2(engagement_id, db)
    plan = await _require_plan(engagement_id, phase.id, db)

    if plan.status == AttackPlanStatus.active:
        raise HTTPException(status_code=409, detail="Cannot reset an active plan. Pause Phase 3 first.")

    plan.status = AttackPlanStatus.draft
    plan.approved_by = None
    plan.approved_at = None

    await db.flush()
    await audit_log(
        db,
        action="attack_plan.reset",
        resource_type="attack_plan",
        resource_id=str(plan.id),
        user_id=str(current_user.id),
        details={},
    )
    await db.commit()

    return {"status": plan.status}


@router.get("/cve-report")
async def get_cve_report(
    engagement_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_auth),
):
    """Return the stored CVE report from the current plan, or fetch fresh if no plan exists."""
    phase = await _get_phase2(engagement_id, db)
    plan = await _get_plan(engagement_id, phase.id, db)

    if plan and plan.cve_report:
        return plan.cve_report

    # No plan yet — do a quick live fetch based on Phase 1 context
    engagement = await _get_engagement(engagement_id, db)
    phase1_result = await db.execute(
        select(Phase).where(
            Phase.engagement_id == engagement_id,
            Phase.phase_number == 1,
        )
    )
    phase1 = phase1_result.scalar_one_or_none()
    tech_stack = (phase1.context or {}).get("tech_stack", ["nginx", "php", "jquery"]) if phase1 else ["nginx", "php", "jquery"]
    return await gather_cve_report(tech_stack)
