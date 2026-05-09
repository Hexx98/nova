"""Phase 6 — Command & Control API endpoints.

Documents C2 channels established during exploitation:
interactsh callbacks, SSRF/XXE OOB, blind XSS fires, etc.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Phase, C2Session, C2ChannelType, C2Status
from app.models.user import User
from app.core.audit import log as audit_log
from app.api.deps import require_auth, require_operator

router = APIRouter(prefix="/api/engagements/{engagement_id}/phases/6")


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class C2SessionCreate(BaseModel):
    channel_type: C2ChannelType
    label: str
    callback_url: str
    notes: str | None = None


class InteractionLog(BaseModel):
    source_ip: str = ""
    method: str = "GET"
    data_preview: str = ""
    size_bytes: int = 0


class SignOffRequest(BaseModel):
    notes: str | None = None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _get_phase6(engagement_id: uuid.UUID, db: AsyncSession) -> Phase:
    result = await db.execute(
        select(Phase).where(Phase.engagement_id == engagement_id, Phase.phase_number == 6)
    )
    phase = result.scalar_one_or_none()
    if not phase:
        raise HTTPException(status_code=404, detail="Phase 6 not found")
    return phase


def _serialise(s: C2Session) -> dict:
    return {
        "id":            str(s.id),
        "channel_type":  s.channel_type.value,
        "label":         s.label,
        "callback_url":  s.callback_url,
        "status":        s.status.value,
        "interactions":  s.interactions,
        "notes":         s.notes,
        "created_at":    s.created_at.isoformat(),
        "terminated_at": s.terminated_at.isoformat() if s.terminated_at else None,
    }


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get("/sessions")
async def list_sessions(
    engagement_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_auth),
):
    phase = await _get_phase6(engagement_id, db)
    result = await db.execute(
        select(C2Session)
        .where(C2Session.phase_id == phase.id)
        .order_by(C2Session.created_at)
    )
    sessions = result.scalars().all()
    active = sum(1 for s in sessions if s.status == C2Status.active)
    total_interactions = sum(len(s.interactions or []) for s in sessions)
    return {
        "sessions":           [_serialise(s) for s in sessions],
        "active_count":       active,
        "total_interactions": total_interactions,
        "phase_status":       phase.status.value,
    }


@router.post("/sessions", status_code=status.HTTP_201_CREATED)
async def create_session(
    engagement_id: uuid.UUID,
    body: C2SessionCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_operator),
):
    phase = await _get_phase6(engagement_id, db)
    if phase.status.value == "complete":
        raise HTTPException(status_code=409, detail="Phase 6 is already signed off.")

    session = C2Session(
        id=uuid.uuid4(),
        engagement_id=engagement_id,
        phase_id=phase.id,
        channel_type=body.channel_type,
        label=body.label,
        callback_url=body.callback_url,
        notes=body.notes,
        status=C2Status.active,
        interactions=[],
        created_by=current_user.id,
    )
    db.add(session)

    await audit_log(
        db, action="c2_session.created", resource_type="c2_session",
        resource_id=str(session.id), user_id=str(current_user.id),
        details={"type": body.channel_type, "label": body.label},
    )
    await db.commit()
    await db.refresh(session)

    return {"session": _serialise(session)}


@router.post("/sessions/{session_id}/interaction")
async def log_interaction(
    engagement_id: uuid.UUID,
    session_id: uuid.UUID,
    body: InteractionLog,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_operator),
):
    """Log a callback/interaction event on a C2 session."""
    session = await db.get(C2Session, session_id)
    if not session or session.engagement_id != engagement_id:
        raise HTTPException(status_code=404, detail="Session not found")

    entry = {
        "ts":           datetime.now(timezone.utc).isoformat(),
        "source_ip":    body.source_ip,
        "method":       body.method,
        "data_preview": body.data_preview[:500],
        "size_bytes":   body.size_bytes,
    }
    interactions = list(session.interactions or [])
    interactions.append(entry)
    session.interactions = interactions

    await db.commit()

    return {"interaction": entry, "total_interactions": len(interactions)}


@router.post("/sessions/{session_id}/terminate")
async def terminate_session(
    engagement_id: uuid.UUID,
    session_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_operator),
):
    session = await db.get(C2Session, session_id)
    if not session or session.engagement_id != engagement_id:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.status == C2Status.terminated:
        raise HTTPException(status_code=409, detail="Session already terminated")

    session.status = C2Status.terminated
    session.terminated_at = datetime.now(timezone.utc)

    await audit_log(
        db, action="c2_session.terminated", resource_type="c2_session",
        resource_id=str(session_id), user_id=str(current_user.id), details={},
    )
    await db.commit()

    return {"terminated": True}


@router.post("/sign-off")
async def sign_off_c2(
    engagement_id: uuid.UUID,
    body: SignOffRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_operator),
):
    """Sign off Phase 6. At least one C2 session must be documented."""
    phase = await _get_phase6(engagement_id, db)

    if phase.status.value == "complete":
        raise HTTPException(status_code=409, detail="Phase 6 already signed off.")

    result = await db.execute(
        select(C2Session).where(C2Session.phase_id == phase.id)
    )
    sessions = result.scalars().all()

    if not sessions:
        raise HTTPException(
            status_code=422,
            detail="No C2 sessions documented. Add at least one before signing off.",
        )

    phase.status = "complete"
    phase.operator_sign_off = True
    phase.sign_off_at = datetime.now(timezone.utc)
    phase.signed_off_by = current_user.id
    if body.notes:
        phase.summary = body.notes

    await audit_log(
        db, action="c2.signed_off", resource_type="phase",
        resource_id=str(phase.id), user_id=str(current_user.id),
        details={"session_count": len(sessions), "notes": body.notes},
    )
    await db.commit()

    return {"signed_off": True, "session_count": len(sessions)}
