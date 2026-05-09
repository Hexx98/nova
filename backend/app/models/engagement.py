import uuid
import enum
from datetime import datetime
from sqlalchemy import String, Boolean, DateTime, Enum as SAEnum, Text, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.postgresql import UUID, JSONB
from app.database import Base


class EngagementStatus(str, enum.Enum):
    setup = "setup"
    active = "active"
    paused = "paused"
    complete = "complete"
    archived = "archived"


class Engagement(Base):
    __tablename__ = "engagements"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    target_domain: Mapped[str] = mapped_column(String(255), nullable=False)
    scope: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    status: Mapped[EngagementStatus] = mapped_column(
        SAEnum(EngagementStatus), nullable=False, default=EngagementStatus.setup
    )
    current_phase: Mapped[int] = mapped_column(nullable=False, default=0)

    operator_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )

    # Pre-engagement authorization
    loa_path: Mapped[str | None] = mapped_column(String(512), nullable=True)
    roe_path: Mapped[str | None] = mapped_column(String(512), nullable=True)
    authorization_confirmed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    emergency_contact: Mapped[str | None] = mapped_column(String(255), nullable=True)
    rules_of_engagement: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    # Engagement folder on disk
    folder_path: Mapped[str | None] = mapped_column(String(512), nullable=True)

    # Timing
    start_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    end_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    # Pre-engagement checklist — JSONB dict of item_key → bool
    checklist: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

    # Operator notes (free-form Markdown)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
