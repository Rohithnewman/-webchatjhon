"""D3: permission catalogue replaces features:use. Part A rewrites the four
system roles' permission arrays to the fixed catalogue
(bots:manage, inbox:reply, knowledge:manage, analytics:read, members:manage,
workspace:manage, features:read). Part B (roles.organization_id) is added
by a later task in this same file.

Revision ID: 0014_roles_catalogue
Revises: 0013_organization_limits
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

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

    # Part B: roles.organization_id — NULL for the four system roles (which
    # every organisation may assign as templates); set for an organisation's
    # own custom roles. A partial unique index keeps custom role names
    # unique within an organisation without constraining the system roles,
    # which already have their own unique-by-name index above.
    op.add_column(
        "roles",
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_roles_organization_id_organizations",
        "roles",
        "organizations",
        ["organization_id"],
        ["id"],
    )
    op.create_index("ix_roles_organization_id", "roles", ["organization_id"])
    op.create_index(
        "uq_role_organization_name",
        "roles",
        ["organization_id", "name"],
        unique=True,
        postgresql_where=sa.text("organization_id IS NOT NULL"),
    )


def downgrade() -> None:
    # Part B: remove roles.organization_id (and its index/constraint) before
    # part A's restore below.
    op.drop_index("uq_role_organization_name", table_name="roles")
    op.drop_index("ix_roles_organization_id", table_name="roles")
    op.drop_constraint("fk_roles_organization_id_organizations", "roles", type_="foreignkey")
    op.drop_column("roles", "organization_id")

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
