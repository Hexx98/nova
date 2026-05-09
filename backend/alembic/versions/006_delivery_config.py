"""add delivery_configs table

Revision ID: 006
Revises: 005
Create Date: 2026-05-08
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "006"
down_revision = "005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "delivery_configs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("engagement_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("engagements.id"), nullable=False),
        sa.Column("phase_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("phases.id"), nullable=False),
        sa.Column(
            "auth_method",
            sa.Enum("none", "form", "cookie", "bearer", "basic", name="authmethod"),
            nullable=False,
            server_default="none",
        ),
        sa.Column("auth_config", postgresql.JSONB, nullable=False, server_default="'{}'::jsonb"),
        sa.Column("seed_urls", postgresql.JSONB, nullable=False, server_default="'[]'::jsonb"),
        sa.Column("include_patterns", postgresql.JSONB, nullable=False, server_default="'[]'::jsonb"),
        sa.Column("exclude_patterns", postgresql.JSONB, nullable=False, server_default="'[]'::jsonb"),
        sa.Column("max_depth", sa.Integer, nullable=False, server_default="5"),
        sa.Column("max_pages", sa.Integer, nullable=False, server_default="500"),
        sa.Column("render_js", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("custom_headers", postgresql.JSONB, nullable=False, server_default="'{}'::jsonb"),
        sa.Column(
            "status",
            sa.Enum("pending", "crawling", "complete", "approved", name="deliverystatus"),
            nullable=False,
            server_default="pending",
        ),
        sa.Column("discovered_urls", postgresql.JSONB, nullable=False, server_default="'[]'::jsonb"),
        sa.Column("crawl_stats", postgresql.JSONB, nullable=False, server_default="'{}'::jsonb"),
        sa.Column("approved_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("operator_notes", postgresql.JSONB, nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_delivery_configs_engagement_id", "delivery_configs", ["engagement_id"])


def downgrade() -> None:
    op.drop_table("delivery_configs")
    op.execute("DROP TYPE IF EXISTS deliverystatus;")
    op.execute("DROP TYPE IF EXISTS authmethod;")
