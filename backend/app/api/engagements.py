import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.models.user import User, UserRole
from app.models.engagement import Engagement, EngagementStatus
from app.models.phase import Phase, PhaseStatus, PHASE_NAMES
from app.models.finding import Finding
from app.core import audit as audit_log
from app.core.engagements import create_engagement_folder
from app.schemas.engagement import (
    EngagementCreate, EngagementUpdate, EngagementResponse, PhaseSignOff,
    ChecklistUpdate, DEFAULT_CHECKLIST, CHECKLIST_KEYS,
)
from app.schemas.finding import FindingCreate, FindingUpdate, FindingConfirm, FindingResponse
from app.api.deps import get_current_user, require_operator, require_lead
from app.config import get_settings
import magic
import os
import shutil

_ALLOWED_DOC_EXTENSIONS = {".pdf", ".doc", ".docx", ".png", ".jpg", ".jpeg"}
_ALLOWED_DOC_MIMES = {
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "image/png",
    "image/jpeg",
}
_MAX_DOC_BYTES = 20 * 1024 * 1024  # 20 MB

router = APIRouter(prefix="/api/engagements", tags=["engagements"])
settings = get_settings()


@router.get("", response_model=list[EngagementResponse])
async def list_engagements(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if current_user.role == UserRole.admin:
        result = await db.execute(select(Engagement))
    else:
        result = await db.execute(select(Engagement).where(Engagement.operator_id == current_user.id))
    return result.scalars().all()


@router.post("", response_model=EngagementResponse, status_code=status.HTTP_201_CREATED)
async def create_engagement(
    body: EngagementCreate,
    current_user: User = Depends(require_operator),
    db: AsyncSession = Depends(get_db),
):
    engagement = Engagement(
        name=body.name,
        target_domain=body.target_domain,
        scope={"entries": [e.model_dump() for e in body.scope]},
        operator_id=current_user.id,
        emergency_contact=body.emergency_contact,
        notes=body.notes,
        checklist=dict(DEFAULT_CHECKLIST),
    )
    db.add(engagement)
    await db.flush()

    # Initialize phases 0-7
    for num in range(8):
        db.add(Phase(
            engagement_id=engagement.id,
            phase_number=num,
            name=PHASE_NAMES[num],
        ))

    # Create engagement folder on disk
    folder = create_engagement_folder(
        str(engagement.id), body.target_domain, settings.engagement_base_path
    )
    engagement.folder_path = folder

    await audit_log.log(
        db, "engagement_created", "engagement", str(engagement.id),
        engagement_id=engagement.id, user_id=current_user.id,
        details={"name": body.name, "target": body.target_domain},
    )

    await db.refresh(engagement)
    return engagement


@router.get("/{engagement_id}", response_model=EngagementResponse)
async def get_engagement(
    engagement_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    engagement = await _get_engagement_or_404(db, engagement_id, current_user)
    return engagement


@router.patch("/{engagement_id}", response_model=EngagementResponse)
async def update_engagement(
    engagement_id: uuid.UUID,
    body: EngagementUpdate,
    current_user: User = Depends(require_operator),
    db: AsyncSession = Depends(get_db),
):
    engagement = await _get_engagement_or_404(db, engagement_id, current_user)

    for field, value in body.model_dump(exclude_none=True).items():
        setattr(engagement, field, value)

    await audit_log.log(
        db, "engagement_updated", "engagement", str(engagement_id),
        engagement_id=engagement_id, user_id=current_user.id,
        details=body.model_dump(exclude_none=True),
    )
    return engagement


# ── Authorization documents ───────────────────────────────────────────────────

@router.post("/{engagement_id}/loa")
async def upload_loa(
    engagement_id: uuid.UUID,
    file: UploadFile = File(...),
    current_user: User = Depends(require_lead),
    db: AsyncSession = Depends(get_db),
):
    engagement = await _get_engagement_or_404(db, engagement_id, current_user)
    path = _save_auth_doc(engagement, file, "loa")
    engagement.loa_path = path
    checklist = dict(engagement.checklist or DEFAULT_CHECKLIST)
    checklist["loa_uploaded"] = True
    engagement.checklist = checklist
    await audit_log.log(db, "loa_uploaded", "engagement", str(engagement_id),
                        engagement_id=engagement_id, user_id=current_user.id)
    return {"path": path}


@router.post("/{engagement_id}/roe")
async def upload_roe(
    engagement_id: uuid.UUID,
    file: UploadFile = File(...),
    current_user: User = Depends(require_lead),
    db: AsyncSession = Depends(get_db),
):
    engagement = await _get_engagement_or_404(db, engagement_id, current_user)
    path = _save_auth_doc(engagement, file, "roe")
    engagement.roe_path = path
    checklist = dict(engagement.checklist or DEFAULT_CHECKLIST)
    checklist["roe_uploaded"] = True
    engagement.checklist = checklist
    await audit_log.log(db, "roe_uploaded", "engagement", str(engagement_id),
                        engagement_id=engagement_id, user_id=current_user.id)
    return {"path": path}


@router.post("/{engagement_id}/authorize")
async def confirm_authorization(
    engagement_id: uuid.UUID,
    current_user: User = Depends(require_lead),
    db: AsyncSession = Depends(get_db),
):
    engagement = await _get_engagement_or_404(db, engagement_id, current_user)

    if not engagement.loa_path or not engagement.roe_path:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="LoA and RoE must be uploaded before authorization can be confirmed",
        )

    engagement.authorization_confirmed = True
    await audit_log.log(db, "authorization_confirmed", "engagement", str(engagement_id),
                        engagement_id=engagement_id, user_id=current_user.id)
    return {"authorized": True}


# ── Phases ─────────────────────────────────────────────────────────────────────

@router.get("/{engagement_id}/phases")
async def list_phases(
    engagement_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_engagement_or_404(db, engagement_id, current_user)
    result = await db.execute(
        select(Phase)
        .where(Phase.engagement_id == engagement_id)
        .order_by(Phase.phase_number)
    )
    return result.scalars().all()


@router.post("/{engagement_id}/phases/{phase_number}/start")
async def start_phase(
    engagement_id: uuid.UUID,
    phase_number: int,
    current_user: User = Depends(require_operator),
    db: AsyncSession = Depends(get_db),
):
    engagement = await _get_engagement_or_404(db, engagement_id, current_user)

    if not engagement.authorization_confirmed and phase_number > 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Authorization must be confirmed before starting Phase 1+",
        )

    phase = await _get_phase_or_404(db, engagement_id, phase_number)

    if phase.status == PhaseStatus.in_progress:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Phase already in progress")

    phase.status = PhaseStatus.in_progress
    phase.started_at = datetime.now(timezone.utc)
    engagement.current_phase = phase_number

    await audit_log.log(
        db, "phase_started", "phase", str(phase.id),
        engagement_id=engagement_id, user_id=current_user.id,
        details={"phase_number": phase_number, "phase_name": phase.name},
    )
    return {"phase": phase_number, "status": "in_progress"}


@router.post("/{engagement_id}/phases/{phase_number}/sign-off")
async def sign_off_phase(
    engagement_id: uuid.UUID,
    phase_number: int,
    body: PhaseSignOff,
    current_user: User = Depends(require_lead),
    db: AsyncSession = Depends(get_db),
):
    phase = await _get_phase_or_404(db, engagement_id, phase_number)

    phase.status = PhaseStatus.complete
    phase.completed_at = datetime.now(timezone.utc)
    phase.operator_sign_off = True
    phase.sign_off_at = datetime.now(timezone.utc)
    phase.signed_off_by = current_user.id
    if body.notes:
        phase.summary = body.notes

    await audit_log.log(
        db, "phase_signed_off", "phase", str(phase.id),
        engagement_id=engagement_id, user_id=current_user.id,
        details={"phase_number": phase_number},
    )
    return {"phase": phase_number, "status": "complete", "signed_off_by": str(current_user.id)}


# ── Findings ───────────────────────────────────────────────────────────────────

@router.get("/{engagement_id}/findings", response_model=list[FindingResponse])
async def list_findings(
    engagement_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_engagement_or_404(db, engagement_id, current_user)
    result = await db.execute(
        select(Finding)
        .where(Finding.engagement_id == engagement_id)
        .order_by(Finding.severity, Finding.created_at)
    )
    return result.scalars().all()


@router.post("/{engagement_id}/phases/{phase_number}/findings",
             response_model=FindingResponse, status_code=status.HTTP_201_CREATED)
async def create_finding(
    engagement_id: uuid.UUID,
    phase_number: int,
    body: FindingCreate,
    current_user: User = Depends(require_operator),
    db: AsyncSession = Depends(get_db),
):
    phase = await _get_phase_or_404(db, engagement_id, phase_number)

    finding = Finding(
        engagement_id=engagement_id,
        phase_id=phase.id,
        **body.model_dump(),
    )
    db.add(finding)
    await db.flush()

    await audit_log.log(
        db, "finding_created", "finding", str(finding.id),
        engagement_id=engagement_id, user_id=current_user.id,
        details={"title": body.title, "severity": body.severity},
    )
    await db.refresh(finding)
    return finding


@router.patch("/{engagement_id}/findings/{finding_id}", response_model=FindingResponse)
async def update_finding(
    engagement_id: uuid.UUID,
    finding_id: uuid.UUID,
    body: FindingUpdate,
    current_user: User = Depends(require_operator),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Finding).where(Finding.id == finding_id, Finding.engagement_id == engagement_id)
    )
    finding = result.scalar_one_or_none()
    if not finding:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Finding not found")

    for field, value in body.model_dump(exclude_none=True).items():
        setattr(finding, field, value)

    await audit_log.log(
        db, "finding_updated", "finding", str(finding_id),
        engagement_id=engagement_id, user_id=current_user.id,
    )
    return finding


@router.post("/{engagement_id}/findings/{finding_id}/confirm", response_model=FindingResponse)
async def confirm_finding(
    engagement_id: uuid.UUID,
    finding_id: uuid.UUID,
    body: FindingConfirm,
    current_user: User = Depends(require_operator),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Finding).where(Finding.id == finding_id, Finding.engagement_id == engagement_id)
    )
    finding = result.scalar_one_or_none()
    if not finding:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Finding not found")

    finding.confirmed_by = current_user.id
    finding.confirmed_at = datetime.now(timezone.utc)
    if body.operator_notes:
        finding.operator_notes = body.operator_notes

    await audit_log.log(
        db, "finding_confirmed", "finding", str(finding_id),
        engagement_id=engagement_id, user_id=current_user.id,
    )
    return finding


# ── Pre-Engagement checklist ───────────────────────────────────────────────────

@router.patch("/{engagement_id}/checklist", response_model=EngagementResponse)
async def update_checklist(
    engagement_id: uuid.UUID,
    body: ChecklistUpdate,
    current_user: User = Depends(require_operator),
    db: AsyncSession = Depends(get_db),
):
    engagement = await _get_engagement_or_404(db, engagement_id, current_user)

    # Only allow known checklist keys
    filtered = {k: bool(v) for k, v in body.items.items() if k in CHECKLIST_KEYS}
    current = dict(engagement.checklist or DEFAULT_CHECKLIST)
    current.update(filtered)
    engagement.checklist = current

    # Auto-sync doc upload status from actual file paths
    current["loa_uploaded"] = bool(engagement.loa_path)
    current["roe_uploaded"] = bool(engagement.roe_path)
    engagement.checklist = current

    await audit_log.log(
        db, "checklist_updated", "engagement", str(engagement_id),
        engagement_id=engagement_id, user_id=current_user.id,
        details={"updated_keys": list(filtered.keys())},
    )
    return engagement


# ── Emergency stop ─────────────────────────────────────────────────────────────

@router.post("/{engagement_id}/emergency-stop")
async def emergency_stop(
    engagement_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Kill all running tasks for this engagement immediately."""
    engagement = await _get_engagement_or_404(db, engagement_id, current_user)
    engagement.status = EngagementStatus.paused

    await audit_log.log(
        db, "emergency_stop", "engagement", str(engagement_id),
        engagement_id=engagement_id, user_id=current_user.id,
        details={"operator": str(current_user.id)},
    )

    # TODO: revoke all active Celery tasks for this engagement
    # from app.worker import celery_app
    # celery_app.control.revoke(task_ids, terminate=True)

    return {"status": "stopped", "engagement_id": str(engagement_id)}


# ── Helpers ────────────────────────────────────────────────────────────────────

async def _get_engagement_or_404(db: AsyncSession, engagement_id: uuid.UUID, user: User) -> Engagement:
    result = await db.execute(select(Engagement).where(Engagement.id == engagement_id))
    engagement = result.scalar_one_or_none()
    if not engagement:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Engagement not found")
    if user.role != UserRole.admin and engagement.operator_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    return engagement


async def _get_phase_or_404(db: AsyncSession, engagement_id: uuid.UUID, phase_number: int) -> Phase:
    result = await db.execute(
        select(Phase).where(Phase.engagement_id == engagement_id, Phase.phase_number == phase_number)
    )
    phase = result.scalar_one_or_none()
    if not phase:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Phase not found")
    return phase


def _save_auth_doc(engagement: Engagement, file: UploadFile, doc_type: str) -> str:
    if not engagement.folder_path:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Engagement folder not initialized")

    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in _ALLOWED_DOC_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File extension '{ext}' not permitted. Allowed: {', '.join(sorted(_ALLOWED_DOC_EXTENSIONS))}",
        )

    header = file.file.read(4096)
    file.file.seek(0)

    if len(header) > _MAX_DOC_BYTES:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="File too large (max 20 MB)")

    detected_mime = magic.from_buffer(header, mime=True)
    if detected_mime not in _ALLOWED_DOC_MIMES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File content type '{detected_mime}' not permitted",
        )

    dest_dir = os.path.join(engagement.folder_path, "pre_engagement")
    os.makedirs(dest_dir, exist_ok=True)
    dest = os.path.join(dest_dir, f"{doc_type}{ext}")
    with open(dest, "wb") as f:
        shutil.copyfileobj(file.file, f)
    return dest
