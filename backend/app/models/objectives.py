import uuid
import enum
from datetime import datetime
from sqlalchemy import String, DateTime, Enum as SAEnum, ForeignKey, func, Text
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.postgresql import UUID, JSONB
from app.database import Base


class BusinessImpact(str, enum.Enum):
    critical = "critical"
    high     = "high"
    medium   = "medium"
    low      = "low"


class EngagementObjectives(Base):
    """Phase 7 — final impact documentation and executive summary."""
    __tablename__ = "engagement_objectives"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    engagement_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("engagements.id"), nullable=False, index=True, unique=True
    )
    phase_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("phases.id"), nullable=False
    )

    # List of {type, title, description, evidence_preview, impact, finding_ids}
    # type: data_exfil | privilege_escalation | rce | lateral_movement | persistence | credential_access | other
    achieved_objectives: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)

    business_impact: Mapped[BusinessImpact | None] = mapped_column(
        SAEnum(BusinessImpact), nullable=True
    )

    # Free-form narrative for the technical audience
    impact_narrative: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Executive summary for non-technical stakeholders
    executive_summary: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Prioritised remediation list [{finding_id, title, priority, effort}]
    remediation_plan: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)

    operator_notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    approved_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
