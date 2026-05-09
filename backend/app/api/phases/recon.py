"""
Phase 1 — Reconnaissance API endpoints.

Manages tier execution, tool enable/disable, Tier 5 approval gate,
and phase status.
"""
import hashlib
import json
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update

from app.database import get_db
from app.models.user import User
from app.models.engagement import Engagement
from app.models.phase import Phase, PhaseStatus
from app.models.task_run import TaskRun, TaskRunStatus
from app.core import audit as audit_log
from app.api.deps import get_current_user, require_operator
from app.worker import celery_app, build_signed_kwargs
from app.config_recon import RECON_TIERS, RECON_TIER_MAP
from pydantic import BaseModel

router = APIRouter(prefix="/api/engagements/{engagement_id}/phases/1/recon", tags=["recon"])


class StartReconRequest(BaseModel):
    enabled_tools: dict[str, bool] | None = None  # tool_name → enabled; None = use defaults


class ApproveTier5Request(BaseModel):
    notes: str | None = None


class SignOffRequest(BaseModel):
    tech_stack: list[str] = []
    notes: str | None = None


def _scope_hash(scope: dict) -> str:
    return hashlib.sha256(json.dumps(scope, sort_keys=True).encode()).hexdigest()


@router.get("/config")
async def get_recon_config(
    engagement_id: uuid.UUID,
    _: User = Depends(get_current_user),
):
    """Return the full tier/tool configuration for Phase 1."""
    return {"tiers": RECON_TIERS}


@router.get("/status")
async def get_recon_status(
    engagement_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return current run status for all task runs in Phase 1."""
    eng = await _get_engagement(db, engagement_id, current_user)
    phase = await _get_phase_1(db, engagement_id)

    runs_result = await db.execute(
        select(TaskRun)
        .where(TaskRun.phase_id == phase.id)
        .order_by(TaskRun.tier, TaskRun.tool_name)
    )
    runs = runs_result.scalars().all()

    # Build status map: tool_name → status
    tool_status = {
        r.tool_name: {
            "status": r.status.value,
            "tier": r.tier,
            "started_at": r.started_at.isoformat() if r.started_at else None,
            "completed_at": r.completed_at.isoformat() if r.completed_at else None,
            "error_message": r.error_message,
            "findings_count": r.findings_count,
        }
        for r in runs
    }

    # Determine if Tier 5 gate is pending
    tier_5_gate = False
    if all(
        tool_status.get(t["name"], {}).get("status") in ("complete", "error", "cancelled")
        for tier_def in RECON_TIERS[:4]
        for t in tier_def["tools"]
        if t["name"] in tool_status
    ) and any(
        tool_status.get(t["name"], {}).get("status") == "pending"
        for t in RECON_TIER_MAP[5]["tools"]
    ):
        tier_5_gate = True

    return {
        "phase_status": phase.status.value,
        "tool_status": tool_status,
        "tier_5_gate": tier_5_gate,
    }


@router.post("/start", status_code=status.HTTP_202_ACCEPTED)
async def start_recon(
    engagement_id: uuid.UUID,
    body: StartReconRequest,
    current_user: User = Depends(require_operator),
    db: AsyncSession = Depends(get_db),
):
    """
    Start Phase 1 reconnaissance.
    Creates TaskRun records for each enabled tool and dispatches Tier 1 tasks.
    Subsequent tiers are chained via Celery.
    """
    eng = await _get_engagement(db, engagement_id, current_user)
    phase = await _get_phase_1(db, engagement_id)

    if not eng.authorization_confirmed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Authorization must be confirmed before Phase 1 can run",
        )

    if phase.status == PhaseStatus.in_progress:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Phase 1 already running")

    scope_h = _scope_hash(eng.scope)
    targets = [e["target"] for e in eng.scope.get("entries", [])]
    if not targets:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No scope targets defined")

    primary_target = eng.target_domain

    # Create TaskRun records for all tools, all tiers
    task_runs_by_tool: dict[str, uuid.UUID] = {}

    for tier_def in RECON_TIERS:
        for tool in tier_def["tools"]:
            enabled = body.enabled_tools.get(tool["name"], tool["enabled_by_default"]) \
                if body.enabled_tools else tool["enabled_by_default"]
            if not enabled:
                continue

            tr = TaskRun(
                engagement_id=engagement_id,
                phase_id=phase.id,
                tool_name=tool["name"],
                tier=tier_def["tier"],
                scope_hash=scope_h,
                status=TaskRunStatus.pending,
            )
            db.add(tr)
            await db.flush()
            task_runs_by_tool[tool["name"]] = tr.id

    # Update phase status
    phase.status = PhaseStatus.in_progress
    phase.started_at = datetime.now(timezone.utc)

    await audit_log.log(
        db, "recon_started", "phase", str(phase.id),
        engagement_id=engagement_id, user_id=current_user.id,
        details={"tools_scheduled": list(task_runs_by_tool.keys()), "primary_target": primary_target},
    )
    await db.commit()

    # Dispatch Tier 1 tasks immediately; subsequent tiers dispatched by the
    # tier_complete signal logic (or via polling — full chaining wired in next iteration)
    for tier_def in RECON_TIERS:
        if tier_def["tier"] == 1:
            for tool in tier_def["tools"]:
                if tool["name"] not in task_runs_by_tool:
                    continue
                task_id = str(task_runs_by_tool[tool["name"]])
                kwargs = build_signed_kwargs({
                    "engagement_id": str(engagement_id),
                    "phase_id": str(phase.id),
                    "task_run_id": task_id,
                    "tool_name": tool["name"],
                    "hexstrike_tool": tool["hexstrike_tool"],
                    "tier": 1,
                    "target": primary_target,
                    "scope_hash": scope_h,
                })
                from app.tasks.recon import run_recon_tool
                run_recon_tool.apply_async(kwargs=kwargs)

    return {"status": "started", "tools_scheduled": len(task_runs_by_tool)}


@router.post("/approve-tier5")
async def approve_tier_5(
    engagement_id: uuid.UUID,
    body: ApproveTier5Request,
    current_user: User = Depends(require_operator),
    db: AsyncSession = Depends(get_db),
):
    """
    Operator approval gate for Tier 5 (active scanning).
    Dispatches Tier 5 Celery tasks after operator review.
    """
    eng = await _get_engagement(db, engagement_id, current_user)
    phase = await _get_phase_1(db, engagement_id)

    primary_target = eng.target_domain
    scope_h = _scope_hash(eng.scope)

    # Find pending Tier 5 task runs
    t5_result = await db.execute(
        select(TaskRun).where(
            TaskRun.phase_id == phase.id,
            TaskRun.tier == 5,
            TaskRun.status == TaskRunStatus.pending,
        )
    )
    t5_runs = t5_result.scalars().all()

    if not t5_runs:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No pending Tier 5 tasks found")

    tier_5_tools = {t["name"]: t for t in RECON_TIER_MAP[5]["tools"]}

    dispatched = 0
    for run in t5_runs:
        tool = tier_5_tools.get(run.tool_name)
        if not tool:
            continue
        kwargs = build_signed_kwargs({
            "engagement_id": str(engagement_id),
            "phase_id": str(phase.id),
            "task_run_id": str(run.id),
            "tool_name": run.tool_name,
            "hexstrike_tool": tool["hexstrike_tool"],
            "tier": 5,
            "target": primary_target,
            "scope_hash": scope_h,
        })
        from app.tasks.recon import run_recon_tool
        run_recon_tool.apply_async(kwargs=kwargs)
        dispatched += 1

    await audit_log.log(
        db, "tier5_approved", "phase", str(phase.id),
        engagement_id=engagement_id, user_id=current_user.id,
        details={"notes": body.notes, "tasks_dispatched": dispatched},
    )
    await db.commit()

    return {"approved": True, "tasks_dispatched": dispatched}


@router.post("/sign-off")
async def sign_off_recon(
    engagement_id: uuid.UUID,
    body: SignOffRequest,
    current_user: User = Depends(require_operator),
    db: AsyncSession = Depends(get_db),
):
    """
    Operator sign-off for Phase 1. Records confirmed tech stack in phase context,
    marks phase complete, and unlocks Phase 2.
    """
    phase = await _get_phase_1(db, engagement_id)

    if phase.status == PhaseStatus.complete:
        raise HTTPException(status_code=409, detail="Phase 1 already signed off.")

    phase.status = PhaseStatus.complete
    phase.operator_sign_off = True
    phase.sign_off_at = datetime.now(timezone.utc)
    phase.signed_off_by = current_user.id
    if body.notes:
        phase.summary = body.notes

    # Persist tech stack for Phase 2 CVE/plan generation
    phase.context = {**(phase.context or {}), "tech_stack": body.tech_stack}

    await audit_log.log(
        db, "recon_signed_off", "phase", str(phase.id),
        engagement_id=engagement_id, user_id=current_user.id,
        details={"tech_stack": body.tech_stack, "notes": body.notes},
    )
    await db.commit()

    return {"signed_off": True, "tech_stack": body.tech_stack}


@router.post("/pause")
async def pause_recon(
    engagement_id: uuid.UUID,
    current_user: User = Depends(require_operator),
    db: AsyncSession = Depends(get_db),
):
    """Revoke all running Celery tasks for Phase 1."""
    phase = await _get_phase_1(db, engagement_id)

    running_result = await db.execute(
        select(TaskRun).where(
            TaskRun.phase_id == phase.id,
            TaskRun.status == TaskRunStatus.running,
        )
    )
    running = running_result.scalars().all()

    for run in running:
        if run.celery_task_id:
            celery_app.control.revoke(run.celery_task_id, terminate=True)
        run.status = TaskRunStatus.cancelled

    await db.commit()

    return {"paused": True, "tasks_cancelled": len(running)}


# ── Helpers ────────────────────────────────────────────────────────────────────

async def _get_engagement(db: AsyncSession, engagement_id: uuid.UUID, user: User) -> Engagement:
    from app.models.user import UserRole
    result = await db.execute(select(Engagement).where(Engagement.id == engagement_id))
    eng = result.scalar_one_or_none()
    if not eng:
        raise HTTPException(status_code=404, detail="Engagement not found")
    if user.role != UserRole.admin and eng.operator_id != user.id:
        raise HTTPException(status_code=403, detail="Access denied")
    return eng


async def _get_phase_1(db: AsyncSession, engagement_id: uuid.UUID) -> Phase:
    result = await db.execute(
        select(Phase).where(Phase.engagement_id == engagement_id, Phase.phase_number == 1)
    )
    phase = result.scalar_one_or_none()
    if not phase:
        raise HTTPException(status_code=404, detail="Phase 1 not found")
    return phase
