"""initial schema

Revision ID: 001
Revises:
Create Date: 2026-05-07
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("hashed_password", sa.String(255), nullable=False),
        sa.Column("full_name", sa.String(255), nullable=False),
        sa.Column("role", sa.Enum("admin", "lead_operator", "operator", "observer", name="userrole"), nullable=False),
        sa.Column("totp_secret", sa.String(64), nullable=True),
        sa.Column("totp_enabled", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("last_login", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    op.create_table(
        "engagements",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("target_domain", sa.String(255), nullable=False),
        sa.Column("scope", postgresql.JSONB, nullable=False),
        sa.Column("status", sa.Enum("setup", "active", "paused", "complete", "archived", name="engagementstatus"), nullable=False),
        sa.Column("current_phase", sa.Integer, nullable=False, server_default="0"),
        sa.Column("operator_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("loa_path", sa.String(512), nullable=True),
        sa.Column("roe_path", sa.String(512), nullable=True),
        sa.Column("authorization_confirmed", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("emergency_contact", sa.String(255), nullable=True),
        sa.Column("rules_of_engagement", postgresql.JSONB, nullable=True),
        sa.Column("folder_path", sa.String(512), nullable=True),
        sa.Column("start_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("end_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("notes", sa.Text, nullable=True),
    )

    op.create_table(
        "phases",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("engagement_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("engagements.id"), nullable=False),
        sa.Column("phase_number", sa.Integer, nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("status", sa.Enum("pending", "in_progress", "complete", "skipped", name="phasestatus"), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("operator_sign_off", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("sign_off_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("signed_off_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("summary", sa.Text, nullable=True),
        sa.Column("executive_summary", sa.Text, nullable=True),
    )
    op.create_index("ix_phases_engagement_id", "phases", ["engagement_id"])

    op.create_table(
        "findings",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("engagement_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("engagements.id"), nullable=False),
        sa.Column("phase_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("phases.id"), nullable=False),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("severity", sa.Enum("critical", "high", "medium", "low", "info", name="severity"), nullable=False),
        sa.Column("status", sa.Enum("open", "accepted", "resolved", name="findingstatus"), nullable=False, server_default="open"),
        sa.Column("owasp_category", sa.String(100), nullable=True),
        sa.Column("attack_technique", sa.String(50), nullable=True),
        sa.Column("attack_chain", postgresql.JSONB, nullable=True),
        sa.Column("description", sa.Text, nullable=False),
        sa.Column("evidence", sa.Text, nullable=True),
        sa.Column("proof_of_concept", sa.Text, nullable=True),
        sa.Column("cvss_score", sa.Float, nullable=True),
        sa.Column("cve_ids", postgresql.JSONB, nullable=True),
        sa.Column("tool", sa.String(100), nullable=True),
        sa.Column("phase", sa.String(50), nullable=True),
        sa.Column("confirmed_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("confirmed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("remediation", sa.Text, nullable=True),
        sa.Column("operator_notes", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_findings_engagement_id", "findings", ["engagement_id"])

    op.create_table(
        "audit_logs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("engagement_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("engagements.id"), nullable=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("action", sa.String(100), nullable=False),
        sa.Column("resource_type", sa.String(50), nullable=False),
        sa.Column("resource_id", sa.String(100), nullable=True),
        sa.Column("details", postgresql.JSONB, nullable=True),
        sa.Column("ip_address", sa.String(45), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_audit_logs_engagement_id", "audit_logs", ["engagement_id"])
    op.create_index("ix_audit_logs_created_at", "audit_logs", ["created_at"])

    op.create_table(
        "artifact_logs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("engagement_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("engagements.id"), nullable=False),
        sa.Column("phase_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("phases.id"), nullable=False),
        sa.Column("artifact_type", sa.Enum("web_shell", "backdoor_account", "stored_xss", "file_read", "db_access", name="artifacttype"), nullable=False),
        sa.Column("target_host", sa.String(255), nullable=False),
        sa.Column("target_location", sa.String(512), nullable=False),
        sa.Column("payload_type", sa.String(100), nullable=False),
        sa.Column("deployed_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("deployed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("status", sa.Enum("active", "closed", name="artifactstatus"), nullable=False, server_default="active"),
        sa.Column("removal_phase", sa.Integer, nullable=True),
        sa.Column("removed_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("removed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("removal_verified", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("verification_method", sa.String(255), nullable=True),
        sa.Column("evidence_ref", sa.String(512), nullable=True),
    )
    op.create_index("ix_artifact_logs_engagement_id", "artifact_logs", ["engagement_id"])

    # Immutable audit log — prevent UPDATE and DELETE at DB level
    op.execute("""
        CREATE RULE no_update_audit AS ON UPDATE TO audit_logs DO INSTEAD NOTHING;
        CREATE RULE no_delete_audit AS ON DELETE TO audit_logs DO INSTEAD NOTHING;
    """)


def downgrade() -> None:
    op.execute("DROP RULE IF EXISTS no_delete_audit ON audit_logs;")
    op.execute("DROP RULE IF EXISTS no_update_audit ON audit_logs;")
    op.drop_table("artifact_logs")
    op.drop_table("audit_logs")
    op.drop_table("findings")
    op.drop_table("phases")
    op.drop_table("engagements")
    op.drop_table("users")
    op.execute("DROP TYPE IF EXISTS artifactstatus;")
    op.execute("DROP TYPE IF EXISTS artifacttype;")
    op.execute("DROP TYPE IF EXISTS findingstatus;")
    op.execute("DROP TYPE IF EXISTS severity;")
    op.execute("DROP TYPE IF EXISTS phasestatus;")
    op.execute("DROP TYPE IF EXISTS engagementstatus;")
    op.execute("DROP TYPE IF EXISTS userrole;")
