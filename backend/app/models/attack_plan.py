import uuid
import enum
from datetime import datetime
from sqlalchemy import String, DateTime, Enum as SAEnum, Text, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.postgresql import UUID, JSONB
from app.database import Base


class AttackPlanMode(str, enum.Enum):
    ai_proposed = "ai_proposed"
    customized  = "customized"
    manual      = "manual"


class AttackPlanStatus(str, enum.Enum):
    draft    = "draft"
    approved = "approved"
    active   = "active"
    complete = "complete"


class AttackPlan(Base):
    __tablename__ = "attack_plans"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    engagement_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("engagements.id"), nullable=False, index=True
    )
    phase_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("phases.id"), nullable=False
    )

    mode: Mapped[AttackPlanMode] = mapped_column(
        SAEnum(AttackPlanMode), nullable=False, default=AttackPlanMode.ai_proposed
    )
    status: Mapped[AttackPlanStatus] = mapped_column(
        SAEnum(AttackPlanStatus), nullable=False, default=AttackPlanStatus.draft
    )

    # List of AttackTask dicts
    items: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)

    # CVE report from intelligence gathering
    cve_report: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    # Wordlist configuration
    wordlist_config: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

    operator_notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    ai_generated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    approved_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
