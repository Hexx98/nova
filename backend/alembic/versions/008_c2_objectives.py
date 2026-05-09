"""add c2_sessions and engagement_objectives tables

Revision ID: 008
Revises: 007
Create Date: 2026-05-08
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "008"
down_revision = "007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "c2_sessions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("engagement_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("engagements.id"), nullable=False),
        sa.Column("phase_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("phases.id"), nullable=False),
        sa.Column(
            "channel_type",
            sa.Enum("interactsh", "ssrf_callback", "xxe_oob", "blind_xss", "custom", name="c2channeltype"),
            nullable=False,
        ),
        sa.Column("label", sa.String(255), nullable=False),
        sa.Column("callback_url", sa.String(1024), nullable=False),
        sa.Column(
            "status",
            sa.Enum("active", "terminated", name="c2status"),
            nullable=False,
            server_default="active",
        ),
        sa.Column("interactions", postgresql.JSONB, nullable=False, server_default="'[]'::jsonb"),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("terminated_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_c2_sessions_engagement_id", "c2_sessions", ["engagement_id"])

    op.create_table(
        "engagement_objectives",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("engagement_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("engagements.id"), nullable=False, unique=True),
        sa.Column("phase_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("phases.id"), nullable=False),
        sa.Column("achieved_objectives", postgresql.JSONB, nullable=False, server_default="'[]'::jsonb"),
        sa.Column(
            "business_impact",
            sa.Enum("critical", "high", "medium", "low", name="businessimpact"),
            nullable=True,
        ),
        sa.Column("impact_narrative", sa.Text, nullable=True),
        sa.Column("executive_summary", sa.Text, nullable=True),
        sa.Column("remediation_plan", postgresql.JSONB, nullable=False, server_default="'[]'::jsonb"),
        sa.Column("operator_notes", sa.Text, nullable=True),
        sa.Column("approved_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("engagement_objectives")
    op.drop_table("c2_sessions")
    op.execute("DROP TYPE IF EXISTS businessimpact;")
    op.execute("DROP TYPE IF EXISTS c2status;")
    op.execute("DROP TYPE IF EXISTS c2channeltype;")
