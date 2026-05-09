import uuid
import enum
from datetime import datetime
from sqlalchemy import String, DateTime, Enum as SAEnum, ForeignKey, func, Text
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.postgresql import UUID, JSONB
from app.database import Base


class C2ChannelType(str, enum.Enum):
    interactsh   = "interactsh"
    ssrf_callback = "ssrf_callback"
    xxe_oob      = "xxe_oob"
    blind_xss    = "blind_xss"
    custom       = "custom"


class C2Status(str, enum.Enum):
    active     = "active"
    terminated = "terminated"


class C2Session(Base):
    __tablename__ = "c2_sessions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    engagement_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("engagements.id"), nullable=False, index=True
    )
    phase_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("phases.id"), nullable=False
    )

    channel_type: Mapped[C2ChannelType] = mapped_column(SAEnum(C2ChannelType), nullable=False)
    label: Mapped[str] = mapped_column(String(255), nullable=False)
    callback_url: Mapped[str] = mapped_column(String(1024), nullable=False)

    status: Mapped[C2Status] = mapped_column(
        SAEnum(C2Status), nullable=False, default=C2Status.active
    )

    # List of {ts, source_ip, method, data_preview, size_bytes}
    interactions: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)

    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    terminated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
