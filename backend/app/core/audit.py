import uuid
from typing import Any
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.audit import AuditLog


async def log(
    db: AsyncSession,
    action: str,
    resource_type: str,
    resource_id: str | None = None,
    engagement_id: uuid.UUID | None = None,
    user_id: uuid.UUID | None = None,
    details: dict[str, Any] | None = None,
    ip_address: str | None = None,
) -> None:
    """Append an immutable audit entry. Never call update or delete on AuditLog."""
    entry = AuditLog(
        action=action,
        resource_type=resource_type,
        resource_id=str(resource_id) if resource_id else None,
        engagement_id=engagement_id,
        user_id=user_id,
        details=details,
        ip_address=ip_address,
    )
    db.add(entry)
    # Flush to DB immediately — audit entries should persist even if outer
    # transaction rolls back for unrelated reasons.
    await db.flush()
