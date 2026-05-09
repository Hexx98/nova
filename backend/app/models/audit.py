import uuid
import enum
from datetime import datetime
from sqlalchemy import String, Boolean, DateTime, Enum as SAEnum, Text, ForeignKey, Integer, func
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.postgresql import UUID, JSONB
from app.database import Base


class AuditLog(Base):
    """Immutable append-only audit log. No update or delete routes exist for this model."""
    __tablename__ = "audit_logs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    engagement_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("engagements.id"), nullable=True, index=True
    )
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )

    action: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    resource_type: Mapped[str] = mapped_column(String(50), nullable=False)
    resource_id: Mapped[str | None] = mapped_column(String(100), nullable=True)

    details: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    ip_address: Mapped[str | None] = mapped_column(String(45), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )


class ArtifactStatus(str, enum.Enum):
    active = "active"
    closed = "closed"


class ArtifactType(str, enum.Enum):
    web_shell = "web_shell"
    backdoor_account = "backdoor_account"
    stored_xss = "stored_xss"
    file_read = "file_read"
    db_access = "db_access"


class ArtifactLog(Base):
    """Deployment log — tracks every artifact deployed in Phase 5/6."""
    __tablename__ = "artifact_logs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    engagement_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("engagements.id"), nullable=False, index=True
    )
    phase_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("phases.id"), nullable=False
    )

    artifact_type: Mapped[ArtifactType] = mapped_column(SAEnum(ArtifactType), nullable=False)
    target_host: Mapped[str] = mapped_column(String(255), nullable=False)
    target_location: Mapped[str] = mapped_column(String(512), nullable=False)
    payload_type: Mapped[str] = mapped_column(String(100), nullable=False)

    deployed_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    deployed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    status: Mapped[ArtifactStatus] = mapped_column(
        SAEnum(ArtifactStatus), nullable=False, default=ArtifactStatus.active
    )
    removal_phase: Mapped[int | None] = mapped_column(Integer, nullable=True)

    removed_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    removed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    removal_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    verification_method: Mapped[str | None] = mapped_column(String(255), nullable=True)
    evidence_ref: Mapped[str | None] = mapped_column(String(512), nullable=True)
