"""Seed the system roles required by registration and authorization.

Revision ID: 0003_seed_system_roles
Revises: 0002_initial_schema
"""

from alembic import op

revision = "0003_seed_system_roles"
down_revision = "0002_initial_schema"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        INSERT INTO roles (name, permissions, is_system)
        VALUES
            ('owner', ARRAY['*']::varchar[], true),
            (
                'admin',
                ARRAY[
                    'workspace:manage',
                    'members:manage',
                    'features:use',
                    'features:read'
                ]::varchar[],
                true
            ),
            ('member', ARRAY['features:use', 'features:read']::varchar[], true),
            ('viewer', ARRAY['features:read']::varchar[], true)
        ON CONFLICT (name) WHERE is_system DO NOTHING
        """
    )


def downgrade() -> None:
    # Baseline roles may already be referenced by memberships. The schema
    # migration that follows drops memberships before dropping the roles table.
    pass
