"""D2: per-organisation limit overrides — seats, chatbots, monthly
conversations. NULL means "use the plan default".

Revision ID: 0013_organization_limits
Revises: 0012_nullable_token_workspace
"""
import sqlalchemy as sa
from alembic import op

revision = "0013_organization_limits"
down_revision = "0012_nullable_token_workspace"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "organizations",
        sa.Column("seat_limit", sa.Integer(), nullable=True),
    )
    op.add_column(
        "organizations",
        sa.Column("chatbot_limit", sa.Integer(), nullable=True),
    )
    op.add_column(
        "organizations",
        sa.Column("conversation_limit", sa.Integer(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("organizations", "conversation_limit")
    op.drop_column("organizations", "chatbot_limit")
    op.drop_column("organizations", "seat_limit")
