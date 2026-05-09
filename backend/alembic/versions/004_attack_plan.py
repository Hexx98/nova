"""add attack_plans table

Revision ID: 004
Revises: 003
Create Date: 2026-05-08
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "004"
down_revision = "003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "attack_plans",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("engagement_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("engagements.id"), nullable=False),
        sa.Column("phase_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("phases.id"), nullable=False),
        sa.Column(
            "mode",
            sa.Enum("ai_proposed", "customized", "manual", name="attackplanmode"),
            nullable=False,
            server_default="ai_proposed",
        ),
        sa.Column(
            "status",
            sa.Enum("draft", "approved", "active", "complete", name="attackplanstatus"),
            nullable=False,
            server_default="draft",
        ),
        sa.Column("items", postgresql.JSONB, nullable=False, server_default="'[]'::jsonb"),
        sa.Column("cve_report", postgresql.JSONB, nullable=True),
        sa.Column("wordlist_config", postgresql.JSONB, nullable=False, server_default="'{}'::jsonb"),
        sa.Column("operator_notes", sa.Text, nullable=True),
        sa.Column("ai_generated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("approved_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_attack_plans_engagement_id", "attack_plans", ["engagement_id"])


def downgrade() -> None:
    op.drop_table("attack_plans")
    op.execute("DROP TYPE IF EXISTS attackplanstatus;")
    op.execute("DROP TYPE IF EXISTS attackplanmode;")
