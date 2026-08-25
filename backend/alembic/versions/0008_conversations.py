"""Add conversations and conversation messages for the widget runtime.

Revision ID: 0008_conversations
Revises: 0007_knowledge_base
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0008_conversations"
down_revision = "0007_knowledge_base"
branch_labels = None
depends_on = None


def upgrade() -> None:
    uuid = postgresql.UUID(as_uuid=True)
    op.create_table(
        "conversations",
        sa.Column("id", uuid, server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("workspace_id", uuid, nullable=False),
        sa.Column("chatbot_id", uuid, nullable=False),
        sa.Column("flow_version", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(20), server_default="active", nullable=False),
        sa.Column("current_node_id", sa.String(100)),
        sa.Column("variables", postgresql.JSONB(), server_default=sa.text("'{}'::jsonb"), nullable=False),
        sa.Column("visitor_label", sa.String(40), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("clock_timestamp()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True)),
        sa.CheckConstraint("status IN ('active', 'handoff', 'closed')", name="ck_conversations_status"),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"]),
        sa.ForeignKeyConstraint(["chatbot_id"], ["chatbots.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_conversations_workspace_id", "conversations", ["workspace_id"])
    op.create_index("ix_conversations_chatbot_id", "conversations", ["chatbot_id"])
    op.create_index("ix_conversations_status", "conversations", ["status"])

    op.create_table(
        "conversation_messages",
        sa.Column("id", uuid, server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("workspace_id", uuid, nullable=False),
        sa.Column("conversation_id", uuid, nullable=False),
        sa.Column("ordinal", sa.Integer(), nullable=False),
        sa.Column("role", sa.String(10), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("node_id", sa.String(100)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("clock_timestamp()"), nullable=False),
        sa.CheckConstraint("role IN ('visitor', 'bot', 'agent', 'system')", name="ck_conversation_messages_role"),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"]),
        sa.ForeignKeyConstraint(["conversation_id"], ["conversations.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_conversation_messages_workspace_id", "conversation_messages", ["workspace_id"])
    op.create_index("ix_conversation_messages_conversation_id", "conversation_messages", ["conversation_id"])
    op.create_index(
        "uq_conversation_message_ordinal",
        "conversation_messages",
        ["conversation_id", "ordinal"],
        unique=True,
    )

    for table in ("conversations", "conversation_messages"):
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        op.execute(
            f"CREATE POLICY {table}_tenant_isolation ON {table} "
            "USING (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid)"
        )
    op.execute("GRANT SELECT ON conversations, conversation_messages TO app_restricted")


def downgrade() -> None:
    op.execute("REVOKE ALL ON conversations, conversation_messages FROM app_restricted")
    for table in ("conversation_messages", "conversations"):
        op.execute(f"DROP POLICY IF EXISTS {table}_tenant_isolation ON {table}")
        op.execute(f"ALTER TABLE {table} DISABLE ROW LEVEL SECURITY")
    op.drop_table("conversation_messages")
    op.drop_table("conversations")
