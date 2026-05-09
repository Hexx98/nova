"""add url and false_positive to findings

Revision ID: 007
Revises: 006
Create Date: 2026-05-08
"""
from alembic import op
import sqlalchemy as sa

revision = "007"
down_revision = "006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("findings", sa.Column("url", sa.Text, nullable=True))
    op.add_column("findings", sa.Column("false_positive", sa.Boolean, nullable=False, server_default="false"))


def downgrade() -> None:
    op.drop_column("findings", "false_positive")
    op.drop_column("findings", "url")
