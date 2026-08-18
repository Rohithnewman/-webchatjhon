"""Add encrypted, workspace-owned LLM provider credentials.

Revision ID: 0006_provider_credentials
Revises: 0005_jobs
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0006_provider_credentials"
down_revision = "0005_jobs"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "provider_credentials",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("workspace_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("provider", sa.String(length=30), nullable=False),
        sa.Column("label", sa.String(length=120), server_default="", nullable=False),
        sa.Column("encrypted_key", sa.String(length=1000), nullable=False),
        sa.Column("key_last_four", sa.String(length=4), server_default="", nullable=False),
        sa.Column("base_url", sa.String(length=300), nullable=True),
        sa.Column("is_default", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("clock_timestamp()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "provider IN ('openai', 'anthropic', 'gemini', 'groq', 'mistral', 'ollama')",
            name="ck_provider_credentials_provider",
        ),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_provider_credentials_workspace_id", "provider_credentials", ["workspace_id"])
    op.create_index("ix_provider_credentials_provider", "provider_credentials", ["provider"])
    op.create_index("ix_provider_credentials_is_default", "provider_credentials", ["is_default"])
    op.create_index(
        "uq_provider_credential_default",
        "provider_credentials",
        ["workspace_id", "provider"],
        unique=True,
        postgresql_where=sa.text("is_default AND deleted_at IS NULL"),
    )
    op.execute("ALTER TABLE provider_credentials ENABLE ROW LEVEL SECURITY")
    op.execute(
        "CREATE POLICY provider_credentials_tenant_isolation ON provider_credentials "
        "USING (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid)"
    )
    op.execute("GRANT SELECT ON provider_credentials TO app_restricted")


def downgrade() -> None:
    op.execute("REVOKE ALL ON provider_credentials FROM app_restricted")
    op.execute("DROP POLICY IF EXISTS provider_credentials_tenant_isolation ON provider_credentials")
    op.execute("ALTER TABLE provider_credentials DISABLE ROW LEVEL SECURITY")
    op.drop_index("uq_provider_credential_default", table_name="provider_credentials")
    op.drop_index("ix_provider_credentials_is_default", table_name="provider_credentials")
    op.drop_index("ix_provider_credentials_provider", table_name="provider_credentials")
    op.drop_index("ix_provider_credentials_workspace_id", table_name="provider_credentials")
    op.drop_table("provider_credentials")
