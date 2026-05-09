import uuid
import enum
from datetime import datetime
from sqlalchemy import String, Boolean, DateTime, Enum as SAEnum, Text, ForeignKey, Float, func
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.postgresql import UUID, JSONB, ARRAY
from app.database import Base


class Severity(str, enum.Enum):
    critical = "critical"
    high = "high"
    medium = "medium"
    low = "low"
    info = "info"


class FindingStatus(str, enum.Enum):
    open = "open"
    accepted = "accepted"
    resolved = "resolved"


class Finding(Base):
    __tablename__ = "findings"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    engagement_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("engagements.id"), nullable=False, index=True
    )
    phase_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("phases.id"), nullable=False, index=True
    )

    title: Mapped[str] = mapped_column(String(255), nullable=False)
    url: Mapped[str | None] = mapped_column(Text, nullable=True)
    severity: Mapped[Severity] = mapped_column(SAEnum(Severity), nullable=False)
    status: Mapped[FindingStatus] = mapped_column(
        SAEnum(FindingStatus), nullable=False, default=FindingStatus.open
    )
    false_positive: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    owasp_category: Mapped[str | None] = mapped_column(String(100), nullable=True)
    attack_technique: Mapped[str | None] = mapped_column(String(50), nullable=True)  # ATT&CK T-code
    attack_chain: Mapped[list | None] = mapped_column(JSONB, nullable=True)  # multi-technique chain

    description: Mapped[str] = mapped_column(Text, nullable=False)
    evidence: Mapped[str | None] = mapped_column(Text, nullable=True)
    proof_of_concept: Mapped[str | None] = mapped_column(Text, nullable=True)

    cvss_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    cve_ids: Mapped[list | None] = mapped_column(JSONB, nullable=True)

    tool: Mapped[str | None] = mapped_column(String(100), nullable=True)
    phase: Mapped[str | None] = mapped_column(String(50), nullable=True)  # kill chain phase name

    confirmed_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    remediation: Mapped[str | None] = mapped_column(Text, nullable=True)
    operator_notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
