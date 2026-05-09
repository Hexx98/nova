"""add checklist to engagements

Revision ID: 002
Revises: 001
Create Date: 2026-05-07
"""
import json
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "002"
down_revision = "001"
branch_labels = None
depends_on = None

DEFAULT_CHECKLIST = {
    "loa_uploaded": False,
    "roe_uploaded": False,
    "scope_confirmed": False,
    "emergency_contact_confirmed": False,
    "data_handling_acknowledged": False,
    "operator_assigned": False,
    "target_environment_noted": False,
    "notification_requirements_confirmed": False,
    "testing_window_confirmed": False,
    "legal_review_completed": False,
}


def upgrade() -> None:
    op.add_column(
        "engagements",
        sa.Column(
            "checklist",
            postgresql.JSONB,
            nullable=False,
            server_default=sa.text("jsonb_build_object()"),
        ),
    )
    # Backfill existing rows with the default checklist
    op.execute(
        f"UPDATE engagements SET checklist = '{json.dumps(DEFAULT_CHECKLIST)}'::jsonb"
    )


def downgrade() -> None:
    op.drop_column("engagements", "checklist")
