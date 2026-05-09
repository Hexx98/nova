"""Nova → Titanux export API."""
from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User
from app.api.deps import require_auth, require_operator
from app.core.audit import log as audit_log
from app.config import get_settings
from app.services.export import build_export, push_to_titanux

router = APIRouter(prefix="/api/engagements/{engagement_id}/export", tags=["export"])


class PushRequest(BaseModel):
    titanux_url: str | None = None    # override env config for this push
    api_key: str | None = None        # override env config for this push


@router.get("/preview")
async def get_export_preview(
    engagement_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_auth),
):
    """Return a lightweight preview of what will be exported (counts, not full data)."""
    doc = await build_export(str(engagement_id), db)

    summary     = doc.get("summary", {})
    findings    = doc.get("findings", [])
    artifacts   = doc.get("artifacts", [])
    phases      = doc.get("phases", [])
    attack_plan = doc.get("attack_plan", {})

    settings = get_settings()

    return {
        "engagement":     doc["engagement"],
        "exported_at":    doc["exported_at"],
        "titanux_configured": bool(settings.titanux_url and settings.titanux_api_key),
        "titanux_url":    settings.titanux_url or None,
        "readiness": {
            "phases_complete":     [p["name"] for p in phases if p["status"] == "complete"],
            "phases_incomplete":   [p["name"] for p in phases if p["status"] != "complete"],
            "engagement_complete": doc["engagement"]["status"] == "complete",
        },
        "counts": {
            "findings":       len(findings),
            "finding_counts": summary.get("finding_counts", {}),
            "artifacts":      len(artifacts),
            "c2_sessions":    len(doc.get("c2_sessions", [])),
            "attack_tasks":   attack_plan.get("enabled_tasks", 0),
            "target_urls":    doc.get("attack_surface", {}).get("total_urls", 0),
        },
        "summary": {
            "business_impact":   summary.get("business_impact"),
            "has_executive_summary": bool(summary.get("executive_summary")),
            "objectives_count":  len(summary.get("achieved_objectives", [])),
        },
    }


@router.get("/download")
async def download_export(
    engagement_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_operator),
):
    """Download the full export as a JSON file."""
    doc = await build_export(str(engagement_id), db)

    await audit_log(
        db, action="export.downloaded", resource_type="engagement",
        resource_id=str(engagement_id), user_id=str(current_user.id),
        details={"finding_count": len(doc.get("findings", []))},
    )
    await db.commit()

    filename = (
        f"nova-export-{doc['engagement']['name'].replace(' ', '_')}"
        f"-{datetime.now(timezone.utc).strftime('%Y%m%d')}.json"
    )
    content = json.dumps(doc, indent=2, default=str)

    return Response(
        content=content,
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/push")
async def push_export(
    engagement_id: uuid.UUID,
    body: PushRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_operator),
):
    """Push export directly to a Titanux instance."""
    settings = get_settings()

    titanux_url = body.titanux_url or settings.titanux_url
    api_key     = body.api_key     or settings.titanux_api_key

    if not titanux_url:
        raise HTTPException(
            status_code=400,
            detail="No Titanux URL configured. Set TITANUX_URL in environment or pass titanux_url in the request.",
        )
    if not api_key:
        raise HTTPException(
            status_code=400,
            detail="No Titanux API key configured. Set TITANUX_API_KEY in environment or pass api_key in the request.",
        )

    doc = await build_export(str(engagement_id), db)

    try:
        result = await push_to_titanux(doc, titanux_url, api_key)
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Titanux push failed: {exc}",
        )

    await audit_log(
        db, action="export.pushed_to_titanux", resource_type="engagement",
        resource_id=str(engagement_id), user_id=str(current_user.id),
        details={
            "titanux_url":    titanux_url,
            "finding_count":  len(doc.get("findings", [])),
            "titanux_result": result,
        },
    )
    await db.commit()

    return {
        "pushed": True,
        "titanux_url": titanux_url,
        "titanux_response": result,
        "finding_count": len(doc.get("findings", [])),
        "exported_at": doc["exported_at"],
    }
