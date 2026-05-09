import uuid
import enum
from datetime import datetime
from sqlalchemy import String, Boolean, DateTime, Enum as SAEnum, Text, ForeignKey, Integer, func
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.postgresql import UUID, JSONB
from app.database import Base


class PhaseStatus(str, enum.Enum):
    pending = "pending"
    in_progress = "in_progress"
    complete = "complete"
    skipped = "skipped"


PHASE_NAMES = {
    0: "Pre-Engagement",
    1: "Reconnaissance",
    2: "Weaponization",
    3: "Delivery",
    4: "Exploitation",
    5: "Installation",
    6: "Command & Control",
    7: "Actions on Objectives",
}


class Phase(Base):
    __tablename__ = "phases"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    engagement_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("engagements.id"), nullable=False, index=True
    )
    phase_number: Mapped[int] = mapped_column(Integer, nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    status: Mapped[PhaseStatus] = mapped_column(
        SAEnum(PhaseStatus), nullable=False, default=PhaseStatus.pending
    )

    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    operator_sign_off: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    sign_off_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    signed_off_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )

    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    executive_summary: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Arbitrary phase-specific data (e.g. tech_stack list from recon)
    context: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
