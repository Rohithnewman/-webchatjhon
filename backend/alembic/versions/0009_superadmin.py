"""Platform superadmin flag on users.

Revision ID: 0009_superadmin
Revises: 0008_conversations
"""
import sqlalchemy as sa
from alembic import op

revision = "0009_superadmin"
down_revision = "0008_conversations"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("is_superadmin", sa.Boolean(), server_default=sa.text("false"), nullable=False),
    )


def downgrade() -> None:
    op.drop_column("users", "is_superadmin")
