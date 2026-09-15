"""Structured payload on conversation messages (options, media, input type).

Revision ID: 0010_message_meta
Revises: 0009_superadmin
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0010_message_meta"
down_revision = "0009_superadmin"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "conversation_messages",
        sa.Column("meta", postgresql.JSONB(), server_default=sa.text("'{}'::jsonb"), nullable=False),
    )


def downgrade() -> None:
    op.drop_column("conversation_messages", "meta")
