import uuid
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.models.user import User, UserRole
from app.models.audit import AuditLog
from app.schemas.audit import AuditLogResponse
from app.api.deps import get_current_user

router = APIRouter(prefix="/api/audit", tags=["audit"])


@router.get("", response_model=list[AuditLogResponse])
async def get_audit_log(
    engagement_id: uuid.UUID | None = Query(None),
    limit: int = Query(100, le=500),
    offset: int = Query(0),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(AuditLog).order_by(AuditLog.created_at.desc()).limit(limit).offset(offset)

    # Non-admins can only see their own engagements' logs
    if current_user.role != UserRole.admin:
        if not engagement_id:
            return []
        query = query.where(AuditLog.engagement_id == engagement_id)
    elif engagement_id:
        query = query.where(AuditLog.engagement_id == engagement_id)

    result = await db.execute(query)
    return result.scalars().all()
