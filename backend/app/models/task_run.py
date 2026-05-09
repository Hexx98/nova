import uuid
import enum
from datetime import datetime
from sqlalchemy import String, DateTime, Enum as SAEnum, Text, ForeignKey, Integer, func
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base


class TaskRunStatus(str, enum.Enum):
    pending   = "pending"
    running   = "running"
    complete  = "complete"
    error     = "error"
    cancelled = "cancelled"


class TaskRun(Base):
    """Tracks every tool execution across all phases."""
    __tablename__ = "task_runs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    engagement_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("engagements.id"), nullable=False, index=True
    )
    phase_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("phases.id"), nullable=False
    )

    celery_task_id: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    tool_name: Mapped[str] = mapped_column(String(100), nullable=False)
    tier: Mapped[int] = mapped_column(Integer, nullable=False)

    status: Mapped[TaskRunStatus] = mapped_column(
        SAEnum(TaskRunStatus), nullable=False, default=TaskRunStatus.pending
    )

    # Scope hash at dispatch time — worker re-validates against this
    scope_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)

    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Path to full output file saved on disk
    output_path: Mapped[str | None] = mapped_column(String(512), nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    findings_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
