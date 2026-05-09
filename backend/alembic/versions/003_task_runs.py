"""add task_runs table

Revision ID: 003
Revises: 002
Create Date: 2026-05-07
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "003"
down_revision = "002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "task_runs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("engagement_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("engagements.id"), nullable=False),
        sa.Column("phase_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("phases.id"), nullable=False),
        sa.Column("celery_task_id", sa.String(255), nullable=True),
        sa.Column("tool_name", sa.String(100), nullable=False),
        sa.Column("tier", sa.Integer, nullable=False),
        sa.Column(
            "status",
            sa.Enum("pending", "running", "complete", "error", "cancelled", name="taskrunstatus"),
            nullable=False,
            server_default="pending",
        ),
        sa.Column("scope_hash", sa.String(64), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("output_path", sa.String(512), nullable=True),
        sa.Column("error_message", sa.Text, nullable=True),
        sa.Column("findings_count", sa.Integer, nullable=False, server_default="0"),
    )
    op.create_index("ix_task_runs_engagement_id", "task_runs", ["engagement_id"])
    op.create_index("ix_task_runs_celery_task_id", "task_runs", ["celery_task_id"])


def downgrade() -> None:
    op.drop_table("task_runs")
    op.execute("DROP TYPE IF EXISTS taskrunstatus;")
