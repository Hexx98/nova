import uuid
import enum
from datetime import datetime
from sqlalchemy import Boolean, DateTime, Enum as SAEnum, ForeignKey, Integer, func
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.postgresql import UUID, JSONB
from app.database import Base


class AuthMethod(str, enum.Enum):
    none    = "none"
    form    = "form"
    cookie  = "cookie"
    bearer  = "bearer"
    basic   = "basic"


class DeliveryStatus(str, enum.Enum):
    pending     = "pending"
    crawling    = "crawling"
    complete    = "complete"
    approved    = "approved"


class DeliveryConfig(Base):
    __tablename__ = "delivery_configs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    engagement_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("engagements.id"), nullable=False, index=True
    )
    phase_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("phases.id"), nullable=False
    )

    # Authentication
    auth_method: Mapped[AuthMethod] = mapped_column(
        SAEnum(AuthMethod), nullable=False, default=AuthMethod.none
    )
    # Method-specific auth config — stored encrypted-at-rest in prod
    # form: {login_url, username_field, password_field, username, password, success_pattern}
    # cookie: {cookie_header}
    # bearer: {token}
    # basic: {username, password}
    auth_config: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

    # Crawl scope
    seed_urls: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    include_patterns: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    exclude_patterns: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    max_depth: Mapped[int] = mapped_column(Integer, nullable=False, default=5)
    max_pages: Mapped[int] = mapped_column(Integer, nullable=False, default=500)
    render_js: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    # Custom request headers (e.g. X-Forwarded-For, custom app tokens)
    custom_headers: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

    # Crawl results
    status: Mapped[DeliveryStatus] = mapped_column(
        SAEnum(DeliveryStatus), nullable=False, default=DeliveryStatus.pending
    )
    discovered_urls: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    # {url, method, status_code, content_type, params, forms, in_scope}
    crawl_stats: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

    # Approval gate
    approved_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    operator_notes: Mapped[str | None] = mapped_column(JSONB, nullable=True)

    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
