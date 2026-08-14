"""Create workspace chatbots and immutable flow versions.

Revision ID: 0004_core_builder
Revises: 0003_seed_system_roles
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0004_core_builder"
down_revision = "0003_seed_system_roles"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "chatbots",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("workspace_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("description", sa.String(length=500), server_default="", nullable=False),
        sa.Column("status", sa.String(length=20), server_default="draft", nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("clock_timestamp()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "status IN ('draft', 'published', 'archived')",
            name="ck_chatbots_status",
        ),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_chatbots_workspace_id", "chatbots", ["workspace_id"])
    op.create_index("ix_chatbots_status", "chatbots", ["status"])

    op.create_table(
        "flows",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("workspace_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("chatbot_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("definition", postgresql.JSONB(), nullable=False),
        sa.Column("is_current", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("clock_timestamp()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["chatbot_id"], ["chatbots.id"]),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"]),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_flows_workspace_id", "flows", ["workspace_id"])
    op.create_index("ix_flows_chatbot_id", "flows", ["chatbot_id"])
    op.create_index("ix_flows_created_by", "flows", ["created_by"])
    op.create_index("ix_flows_is_current", "flows", ["is_current"])
    op.create_index(
        "uq_flow_active_version",
        "flows",
        ["chatbot_id", "version"],
        unique=True,
        postgresql_where=sa.text("deleted_at IS NULL"),
    )
    op.create_index(
        "uq_flow_current",
        "flows",
        ["chatbot_id"],
        unique=True,
        postgresql_where=sa.text("is_current AND deleted_at IS NULL"),
    )

    for table in ("chatbots", "flows"):
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        op.execute(
            f"CREATE POLICY {table}_tenant_isolation ON {table} "
            "USING (workspace_id = "
            "NULLIF(current_setting('app.workspace_id', true), '')::uuid)"
        )
    op.execute("GRANT SELECT ON chatbots, flows TO app_restricted")


def downgrade() -> None:
    op.execute("REVOKE ALL ON chatbots, flows FROM app_restricted")
    for table in ("flows", "chatbots"):
        op.execute(f"DROP POLICY IF EXISTS {table}_tenant_isolation ON {table}")
        op.execute(f"ALTER TABLE {table} DISABLE ROW LEVEL SECURITY")
    op.drop_index("uq_flow_current", table_name="flows")
    op.drop_index("uq_flow_active_version", table_name="flows")
    op.drop_index("ix_flows_is_current", table_name="flows")
    op.drop_index("ix_flows_created_by", table_name="flows")
    op.drop_index("ix_flows_chatbot_id", table_name="flows")
    op.drop_index("ix_flows_workspace_id", table_name="flows")
    op.drop_table("flows")
    op.drop_index("ix_chatbots_status", table_name="chatbots")
    op.drop_index("ix_chatbots_workspace_id", table_name="chatbots")
    op.drop_table("chatbots")
