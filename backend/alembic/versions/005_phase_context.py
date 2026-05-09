"""add context column to phases

Revision ID: 005
Revises: 004
Create Date: 2026-05-08
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "005"
down_revision = "004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "phases",
        sa.Column("context", postgresql.JSONB, nullable=True),
    )


def downgrade() -> None:
    op.drop_column("phases", "context")
