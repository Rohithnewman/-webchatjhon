"""D1: a superadmin has no tenancy — refresh_tokens.workspace_id becomes
nullable so a superadmin's token can be issued with no workspace.

Revision ID: 0012_nullable_token_workspace
Revises: 0011_subscriptions
"""
import sqlalchemy as sa
from alembic import op

revision = "0012_nullable_token_workspace"
down_revision = "0011_subscriptions"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column("refresh_tokens", "workspace_id", nullable=True)


def downgrade() -> None:
    # A superadmin's refresh tokens carry no workspace; restoring NOT NULL
    # would fail on them, so delete rows with a null workspace_id first.
    op.execute(sa.text("DELETE FROM refresh_tokens WHERE workspace_id IS NULL"))
    op.alter_column("refresh_tokens", "workspace_id", nullable=False)
