"""D3: permission catalogue replaces features:use. Part A rewrites the four
system roles' permission arrays to the fixed catalogue
(bots:manage, inbox:reply, knowledge:manage, analytics:read, members:manage,
workspace:manage, features:read). Part B (roles.organization_id) is added
by a later task in this same file.

Revision ID: 0014_roles_catalogue
Revises: 0013_organization_limits
"""
from alembic import op

revision = "0014_roles_catalogue"
down_revision = "0013_organization_limits"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Part A: rewrite the four system roles' permissions to the catalogue.
    op.execute(
        """
        UPDATE roles SET permissions = ARRAY['*']::varchar[]
        WHERE is_system AND name = 'owner'
        """
    )
    op.execute(
        """
        UPDATE roles SET permissions = ARRAY[
            'bots:manage',
            'inbox:reply',
            'knowledge:manage',
            'analytics:read',
            'members:manage',
            'workspace:manage',
            'features:read'
        ]::varchar[]
        WHERE is_system AND name = 'admin'
        """
    )
    op.execute(
        """
        UPDATE roles SET permissions = ARRAY[
            'bots:manage',
            'inbox:reply',
            'knowledge:manage',
            'analytics:read',
            'features:read'
        ]::varchar[]
        WHERE is_system AND name = 'member'
        """
    )
    op.execute(
        """
        UPDATE roles SET permissions = ARRAY['analytics:read', 'features:read']::varchar[]
        WHERE is_system AND name = 'viewer'
        """
    )


def downgrade() -> None:
    # Part A: restore the pre-catalogue (features:use) permission arrays.
    op.execute(
        """
        UPDATE roles SET permissions = ARRAY['*']::varchar[]
        WHERE is_system AND name = 'owner'
        """
    )
    op.execute(
        """
        UPDATE roles SET permissions = ARRAY[
            'workspace:manage',
            'members:manage',
            'features:use',
            'features:read'
        ]::varchar[]
        WHERE is_system AND name = 'admin'
        """
    )
    op.execute(
        """
        UPDATE roles SET permissions = ARRAY['features:use', 'features:read']::varchar[]
        WHERE is_system AND name = 'member'
        """
    )
    op.execute(
        """
        UPDATE roles SET permissions = ARRAY['features:read']::varchar[]
        WHERE is_system AND name = 'viewer'
        """
    )
