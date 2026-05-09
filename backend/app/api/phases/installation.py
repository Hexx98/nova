"""Phase 5 — Installation API endpoints.

Tracks artifacts (web shells, backdoor accounts, stored XSS, etc.)
deployed during exploitation. Every artifact must be logged and
confirmed removed before sign-off.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Phase, ArtifactLog
from app.models.audit import ArtifactStatus, ArtifactType
from app.models.user import User
from app.core.audit import log as audit_log
from app.api.deps import require_auth, require_operator

router = APIRouter(prefix="/api/engagements/{engagement_id}/phases/5")


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class ArtifactCreate(BaseModel):
    artifact_type: ArtifactType
    target_host: str
    target_location: str
    payload_type: str
    notes: str | None = None


class ArtifactRemove(BaseModel):
    verification_method: str
    evidence_ref: str | None = None


class SignOffRequest(BaseModel):
    notes: str | None = None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _get_phase5(engagement_id: uuid.UUID, db: AsyncSession) -> Phase:
    from sqlalchemy import select
    result = await db.execute(
        select(Phase).where(Phase.engagement_id == engagement_id, Phase.phase_number == 5)
    )
    phase = result.scalar_one_or_none()
    if not phase:
        raise HTTPException(status_code=404, detail="Phase 5 not found")
    return phase


def _serialise(a: ArtifactLog) -> dict:
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
        "evidence_ref":        a.evidence_ref,
    }


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get("/artifacts")
async def list_artifacts(
    engagement_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_auth),
):
    phase = await _get_phase5(engagement_id, db)
    result = await db.execute(
        select(ArtifactLog)
        .where(ArtifactLog.phase_id == phase.id)
        .order_by(ArtifactLog.deployed_at)
    )
    artifacts = result.scalars().all()
    active_count   = sum(1 for a in artifacts if a.status == ArtifactStatus.active)
    verified_count = sum(1 for a in artifacts if a.removal_verified)
    return {
        "artifacts":      [_serialise(a) for a in artifacts],
        "active_count":   active_count,
        "verified_count": verified_count,
        "phase_status":   phase.status.value,
    }


@router.post("/artifacts", status_code=status.HTTP_201_CREATED)
async def log_artifact(
    engagement_id: uuid.UUID,
    body: ArtifactCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_operator),
):
    phase = await _get_phase5(engagement_id, db)
    if phase.status.value == "complete":
        raise HTTPException(status_code=409, detail="Phase 5 is already signed off.")

    artifact = ArtifactLog(
        id=uuid.uuid4(),
        engagement_id=engagement_id,
        phase_id=phase.id,
        artifact_type=body.artifact_type,
        target_host=body.target_host,
        target_location=body.target_location,
        payload_type=body.payload_type,
        deployed_by=current_user.id,
        deployed_at=datetime.now(timezone.utc),
        status=ArtifactStatus.active,
        removal_phase=7,
    )
    db.add(artifact)

    await audit_log(
        db, action="artifact.logged", resource_type="artifact_log",
        resource_id=str(artifact.id), user_id=str(current_user.id),
        details={"type": body.artifact_type, "location": body.target_location},
    )
    await db.commit()
    await db.refresh(artifact)

    return {"artifact": _serialise(artifact)}


@router.post("/artifacts/{artifact_id}/remove")
async def mark_artifact_removed(
    engagement_id: uuid.UUID,
    artifact_id: uuid.UUID,
    body: ArtifactRemove,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_operator),
):
    artifact = await db.get(ArtifactLog, artifact_id)
    if not artifact or artifact.engagement_id != engagement_id:
        raise HTTPException(status_code=404, detail="Artifact not found")
    if artifact.status == ArtifactStatus.closed:
        raise HTTPException(status_code=409, detail="Artifact already marked removed")

    artifact.status = ArtifactStatus.closed
    artifact.removed_by = current_user.id
    artifact.removed_at = datetime.now(timezone.utc)
    artifact.removal_verified = True
    artifact.verification_method = body.verification_method
    artifact.evidence_ref = body.evidence_ref

    await audit_log(
        db, action="artifact.removed", resource_type="artifact_log",
        resource_id=str(artifact_id), user_id=str(current_user.id),
        details={"method": body.verification_method},
    )
    await db.commit()
    await db.refresh(artifact)

    return {"artifact": _serialise(artifact)}


@router.post("/sign-off")
async def sign_off_installation(
    engagement_id: uuid.UUID,
    body: SignOffRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_operator),
):
    """Sign off Phase 5. All active artifacts must be documented (removal not required here — some persist into C2)."""
    phase = await _get_phase5(engagement_id, db)

    if phase.status.value == "complete":
        raise HTTPException(status_code=409, detail="Phase 5 already signed off.")

    result = await db.execute(
        select(ArtifactLog).where(ArtifactLog.phase_id == phase.id)
    )
    artifacts = result.scalars().all()

    if not artifacts:
        raise HTTPException(
            status_code=422,
            detail="No artifacts logged. Log at least one artifact before signing off.",
        )

    phase.status = "complete"
    phase.operator_sign_off = True
    phase.sign_off_at = datetime.now(timezone.utc)
    phase.signed_off_by = current_user.id
    if body.notes:
        phase.summary = body.notes

    await audit_log(
        db, action="installation.signed_off", resource_type="phase",
        resource_id=str(phase.id), user_id=str(current_user.id),
        details={"artifact_count": len(artifacts), "notes": body.notes},
    )
    await db.commit()

    return {"signed_off": True, "artifact_count": len(artifacts)}
