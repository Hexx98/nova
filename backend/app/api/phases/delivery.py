"""Phase 3 — Delivery API endpoints."""
from __future__ import annotations

import hashlib
import json
import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, field_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import DeliveryConfig, DeliveryStatus, AuthMethod, Phase, Engagement
from app.models.user import User
from app.core.audit import log as audit_log
from app.api.deps import require_auth, require_operator
from app.worker import build_signed_kwargs

router = APIRouter(prefix="/api/engagements/{engagement_id}/phases/3")


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class AuthConfigForm(BaseModel):
    login_url: str = ""
    username_field: str = "username"
    password_field: str = "password"
    username: str = ""
    password: str = ""
    success_pattern: str = ""   # regex to detect successful login


class AuthConfigCookie(BaseModel):
    cookie_header: str = ""


class AuthConfigBearer(BaseModel):
    token: str = ""


class AuthConfigBasic(BaseModel):
    username: str = ""
    password: str = ""


class DeliveryConfigRequest(BaseModel):
    auth_method: AuthMethod = AuthMethod.none
    auth_config: dict[str, Any] = {}
    seed_urls: list[str] = []
    include_patterns: list[str] = []
    exclude_patterns: list[str] = []
    max_depth: int = 5
    max_pages: int = 500
    render_js: bool = False
    custom_headers: dict[str, str] = {}

    @field_validator("max_depth")
    @classmethod
    def clamp_depth(cls, v: int) -> int:
        return max(1, min(v, 20))

    @field_validator("max_pages")
    @classmethod
    def clamp_pages(cls, v: int) -> int:
        return max(10, min(v, 5000))


class ApproveRequest(BaseModel):
    notes: str | None = None
    # Operator can exclude specific URLs before approval
    excluded_urls: list[str] = []


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _get_engagement(engagement_id: uuid.UUID, db: AsyncSession) -> Engagement:
    eng = await db.get(Engagement, engagement_id)
    if not eng:
        raise HTTPException(status_code=404, detail="Engagement not found")
    return eng


async def _get_phase3(engagement_id: uuid.UUID, db: AsyncSession) -> Phase:
    result = await db.execute(
        select(Phase).where(Phase.engagement_id == engagement_id, Phase.phase_number == 3)
    )
    phase = result.scalar_one_or_none()
    if not phase:
        raise HTTPException(status_code=404, detail="Phase 3 not found")
    return phase


async def _get_config(engagement_id: uuid.UUID, phase_id: uuid.UUID, db: AsyncSession) -> DeliveryConfig | None:
    result = await db.execute(
        select(DeliveryConfig).where(
            DeliveryConfig.engagement_id == engagement_id,
            DeliveryConfig.phase_id == phase_id,
        )
    )
    return result.scalar_one_or_none()


async def _require_config(engagement_id: uuid.UUID, phase_id: uuid.UUID, db: AsyncSession) -> DeliveryConfig:
    cfg = await _get_config(engagement_id, phase_id, db)
    if not cfg:
        raise HTTPException(status_code=404, detail="No delivery config found. Save config first.")
    return cfg


def _scope_hash(scope: Any) -> str:
    return hashlib.sha256(json.dumps(scope, sort_keys=True).encode()).hexdigest()


def _serialise_config(cfg: DeliveryConfig) -> dict:
    return {
        "id": str(cfg.id),
        "auth_method": cfg.auth_method,
        "auth_config": _redact_auth(cfg.auth_method, cfg.auth_config),
        "seed_urls": cfg.seed_urls,
        "include_patterns": cfg.include_patterns,
        "exclude_patterns": cfg.exclude_patterns,
        "max_depth": cfg.max_depth,
        "max_pages": cfg.max_pages,
        "render_js": cfg.render_js,
        "custom_headers": cfg.custom_headers,
        "status": cfg.status,
        "crawl_stats": cfg.crawl_stats,
        "discovered_urls": cfg.discovered_urls,
        "approved_by": str(cfg.approved_by) if cfg.approved_by else None,
        "approved_at": cfg.approved_at,
        "started_at": cfg.started_at,
        "completed_at": cfg.completed_at,
        "operator_notes": cfg.operator_notes,
    }


def _redact_auth(method: AuthMethod, cfg: dict) -> dict:
    """Never return plaintext credentials to the API."""
    if method == AuthMethod.form:
        return {**cfg, "password": "***" if cfg.get("password") else ""}
    if method == AuthMethod.basic:
        return {**cfg, "password": "***" if cfg.get("password") else ""}
    if method == AuthMethod.bearer:
        token = cfg.get("token", "")
        return {"token": token[:6] + "***" if len(token) > 6 else "***"}
    if method == AuthMethod.cookie:
        cookie = cfg.get("cookie_header", "")
        return {"cookie_header": cookie[:20] + "..." if len(cookie) > 20 else cookie}
    return {}


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get("/config")
async def get_delivery_config(
    engagement_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_auth),
):
    """Get current delivery config and crawl results."""
    phase = await _get_phase3(engagement_id, db)
    cfg = await _get_config(engagement_id, phase.id, db)
    if not cfg:
        return {"config": None}
    return {"config": _serialise_config(cfg)}


@router.put("/config", status_code=status.HTTP_200_OK)
async def save_delivery_config(
    engagement_id: uuid.UUID,
    body: DeliveryConfigRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_operator),
):
    """
    Save (create or replace) the delivery config.
    Cannot modify a config while a crawl is running or after approval.
    """
    await _get_engagement(engagement_id, db)
    phase = await _get_phase3(engagement_id, db)
    existing = await _get_config(engagement_id, phase.id, db)

    if existing:
        if existing.status == DeliveryStatus.crawling:
            raise HTTPException(status_code=409, detail="Crawl is running. Stop it before reconfiguring.")
        if existing.status == DeliveryStatus.approved:
            raise HTTPException(status_code=409, detail="Config is approved. Reset to edit.")
        existing.auth_method    = body.auth_method
        existing.auth_config    = body.auth_config
        existing.seed_urls      = body.seed_urls
        existing.include_patterns = body.include_patterns
        existing.exclude_patterns = body.exclude_patterns
        existing.max_depth      = body.max_depth
        existing.max_pages      = body.max_pages
        existing.render_js      = body.render_js
        existing.custom_headers = body.custom_headers
        existing.status         = DeliveryStatus.pending
        existing.discovered_urls = []
        existing.crawl_stats    = {}
        cfg = existing
    else:
        cfg = DeliveryConfig(
            id=uuid.uuid4(),
            engagement_id=engagement_id,
            phase_id=phase.id,
            **body.model_dump(),
        )
        db.add(cfg)

    await db.flush()
    await audit_log(
        db, action="delivery_config.saved", resource_type="delivery_config",
        resource_id=str(cfg.id), user_id=str(current_user.id),
        details={"auth_method": body.auth_method, "seed_urls": body.seed_urls},
    )
    await db.commit()
    await db.refresh(cfg)

    return {"config": _serialise_config(cfg)}


@router.post("/crawl/start", status_code=status.HTTP_202_ACCEPTED)
async def start_crawl(
    engagement_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_operator),
):
    """Dispatch the authenticated crawl Celery task."""
    engagement = await _get_engagement(engagement_id, db)
    phase = await _get_phase3(engagement_id, db)
    cfg = await _require_config(engagement_id, phase.id, db)

    if cfg.status == DeliveryStatus.crawling:
        raise HTTPException(status_code=409, detail="Crawl already running.")
    if cfg.status == DeliveryStatus.approved:
        raise HTTPException(status_code=409, detail="Phase already approved.")

    if not engagement.authorization_confirmed:
        raise HTTPException(status_code=400, detail="Authorization must be confirmed first.")

    scope_h = _scope_hash(engagement.scope)

    kwargs = build_signed_kwargs({
        "engagement_id": str(engagement_id),
        "phase_id":      str(phase.id),
        "delivery_config_id": str(cfg.id),
        "target":        engagement.target_domain,
        "auth_method":   cfg.auth_method,
        "auth_config":   cfg.auth_config,
        "seed_urls":     cfg.seed_urls,
        "include_patterns": cfg.include_patterns,
        "exclude_patterns": cfg.exclude_patterns,
        "max_depth":     cfg.max_depth,
        "max_pages":     cfg.max_pages,
        "render_js":     cfg.render_js,
        "custom_headers": cfg.custom_headers,
        "scope_hash":    scope_h,
    })

    from app.tasks.delivery import run_delivery_crawl
    task = run_delivery_crawl.apply_async(kwargs=kwargs)

    cfg.status = DeliveryStatus.crawling
    cfg.started_at = datetime.now(timezone.utc)
    cfg.discovered_urls = []
    cfg.crawl_stats = {}

    await audit_log(
        db, action="delivery_crawl.started", resource_type="delivery_config",
        resource_id=str(cfg.id), user_id=str(current_user.id),
        details={"celery_task_id": task.id},
    )
    await db.commit()

    return {"status": "crawling", "celery_task_id": task.id}


@router.post("/crawl/stop")
async def stop_crawl(
    engagement_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_operator),
):
    """Cancel the running crawl."""
    phase = await _get_phase3(engagement_id, db)
    cfg = await _require_config(engagement_id, phase.id, db)

    if cfg.status != DeliveryStatus.crawling:
        raise HTTPException(status_code=409, detail="No crawl is running.")

    cfg.status = DeliveryStatus.pending
    cfg.completed_at = datetime.now(timezone.utc)

    await audit_log(
        db, action="delivery_crawl.stopped", resource_type="delivery_config",
        resource_id=str(cfg.id), user_id=str(current_user.id), details={},
    )
    await db.commit()

    return {"stopped": True}


@router.post("/approve")
async def approve_delivery(
    engagement_id: uuid.UUID,
    body: ApproveRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_operator),
):
    """
    Operator reviews discovered URLs, optionally excludes some, then approves Phase 3.
    Unlocks Phase 4 — Exploitation.
    """
    phase = await _get_phase3(engagement_id, db)
    cfg = await _require_config(engagement_id, phase.id, db)

    if cfg.status not in (DeliveryStatus.complete,):
        raise HTTPException(
            status_code=409,
            detail=f"Config status is '{cfg.status}' — run the crawl to completion before approving.",
        )

    in_scope = [u for u in (cfg.discovered_urls or []) if u["url"] not in body.excluded_urls]
    if not in_scope:
        raise HTTPException(status_code=422, detail="No in-scope URLs remain after exclusions.")

    cfg.discovered_urls = [
        {**u, "excluded": u["url"] in body.excluded_urls}
        for u in (cfg.discovered_urls or [])
    ]
    cfg.status = DeliveryStatus.approved
    cfg.approved_by = current_user.id
    cfg.approved_at = datetime.now(timezone.utc)
    cfg.operator_notes = body.notes

    phase.status = "complete"

    await audit_log(
        db, action="delivery.approved", resource_type="delivery_config",
        resource_id=str(cfg.id), user_id=str(current_user.id),
        details={
            "total_urls": len(cfg.discovered_urls),
            "excluded": len(body.excluded_urls),
            "approved_urls": len(in_scope),
            "notes": body.notes,
        },
    )
    await db.commit()

    return {
        "status": cfg.status,
        "approved_urls": len(in_scope),
        "excluded_urls": len(body.excluded_urls),
        "approved_at": cfg.approved_at,
    }


@router.post("/reset")
async def reset_delivery(
    engagement_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_operator),
):
    """Reset approved delivery config back to complete (re-review without re-crawling)."""
    phase = await _get_phase3(engagement_id, db)
    cfg = await _require_config(engagement_id, phase.id, db)

    if cfg.status != DeliveryStatus.approved:
        raise HTTPException(status_code=409, detail="Config is not approved.")

    cfg.status = DeliveryStatus.complete
    cfg.approved_by = None
    cfg.approved_at = None

    await db.commit()
    return {"status": cfg.status}
