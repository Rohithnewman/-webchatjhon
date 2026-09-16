"""Organisation subscription status, period, and plan limits.

Revision ID: 0011_subscriptions
Revises: 0010_message_meta
"""
import sqlalchemy as sa
from alembic import op

revision = "0011_subscriptions"
down_revision = "0010_message_meta"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "organizations",
        sa.Column(
            "subscription_status",
            sa.String(length=20),
            server_default="active",
            nullable=False,
        ),
    )
    op.create_check_constraint(
        "ck_organizations_subscription_status",
        "organizations",
        "subscription_status IN ('active', 'suspended')",
    )
    op.add_column(
        "organizations",
        sa.Column(
            "subscription_starts_at",
            sa.Date(),
            server_default=sa.text("CURRENT_DATE"),
            nullable=False,
        ),
    )
    op.add_column(
        "organizations",
        sa.Column("subscription_ends_at", sa.Date(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("organizations", "subscription_ends_at")
    op.drop_column("organizations", "subscription_starts_at")
    op.drop_column("organizations", "subscription_status")
