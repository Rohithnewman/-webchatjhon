"""Create the Phase 1 identity schema and tenant RLS policies.

Revision ID: 0002_initial_schema
Revises: 0001_extensions
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0002_initial_schema"
down_revision = "0001_extensions"
branch_labels = None
depends_on = None


def _uuid() -> postgresql.UUID:
    return postgresql.UUID(as_uuid=True)


def _timestamps(*, soft_delete: bool = True) -> list[sa.Column]:
    columns = [
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("clock_timestamp()"),
            nullable=False,
        )
    ]
    if soft_delete:
        columns.extend(
            [
                sa.Column(
                    "updated_at",
                    sa.DateTime(timezone=True),
                    server_default=sa.text("now()"),
                    nullable=False,
                ),
                sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
            ]
        )
    return columns


def _id() -> sa.Column:
    return sa.Column(
        "id",
        _uuid(),
        server_default=sa.text("gen_random_uuid()"),
        nullable=False,
        primary_key=True,
    )


def upgrade() -> None:
    op.create_table(
        "organizations",
        _id(),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("plan", sa.String(length=20), server_default="free", nullable=False),
        *_timestamps(),
    )
    op.create_table(
        "roles",
        _id(),
        sa.Column("name", sa.String(length=50), nullable=False),
        sa.Column(
            "permissions",
            postgresql.ARRAY(sa.String()),
            server_default=sa.text("'{}'::varchar[]"),
            nullable=False,
        ),
        sa.Column(
            "is_system", sa.Boolean(), server_default=sa.text("false"), nullable=False
        ),
        *_timestamps(soft_delete=False),
    )
    op.create_index(
        "uq_role_system_name",
        "roles",
        ["name"],
        unique=True,
        postgresql_where=sa.text("is_system"),
    )
    op.create_table(
        "workspaces",
        _id(),
        sa.Column("organization_id", _uuid(), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column(
            "timezone", sa.String(length=64), server_default="UTC", nullable=False
        ),
        *_timestamps(),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"]),
    )
    op.create_index(
        op.f("ix_workspaces_organization_id"),
        "workspaces",
        ["organization_id"],
    )
    op.create_table(
        "users",
        _id(),
        sa.Column("email", postgresql.CITEXT(), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("full_name", sa.String(length=200), nullable=False),
        sa.Column(
            "is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False
        ),
        sa.Column(
            "failed_login_count",
            sa.Integer(),
            server_default=sa.text("0"),
            nullable=False,
        ),
        sa.Column("locked_until", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_workspace_id", _uuid(), nullable=True),
        *_timestamps(),
        sa.ForeignKeyConstraint(["last_workspace_id"], ["workspaces.id"]),
    )
    op.create_index(
        "uq_user_active_email",
        "users",
        ["email"],
        unique=True,
        postgresql_where=sa.text("deleted_at IS NULL"),
    )
    op.create_table(
        "memberships",
        _id(),
        sa.Column("user_id", _uuid(), nullable=False),
        sa.Column("workspace_id", _uuid(), nullable=False),
        sa.Column("role_id", _uuid(), nullable=False),
        *_timestamps(),
        sa.ForeignKeyConstraint(["role_id"], ["roles.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"]),
    )
    op.create_index(op.f("ix_memberships_role_id"), "memberships", ["role_id"])
    op.create_index(op.f("ix_memberships_user_id"), "memberships", ["user_id"])
    op.create_index(
        op.f("ix_memberships_workspace_id"), "memberships", ["workspace_id"]
    )
    op.create_index(
        "uq_membership_active",
        "memberships",
        ["user_id", "workspace_id"],
        unique=True,
        postgresql_where=sa.text("deleted_at IS NULL"),
    )
    op.create_table(
        "refresh_tokens",
        _id(),
        sa.Column("user_id", _uuid(), nullable=False),
        sa.Column("workspace_id", _uuid(), nullable=False),
        sa.Column("family_id", _uuid(), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        *_timestamps(soft_delete=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"]),
    )
    op.create_index(
        op.f("ix_refresh_tokens_family_id"), "refresh_tokens", ["family_id"]
    )
    op.create_index(op.f("ix_refresh_tokens_user_id"), "refresh_tokens", ["user_id"])
    op.create_index(
        op.f("ix_refresh_tokens_workspace_id"), "refresh_tokens", ["workspace_id"]
    )
    op.create_index(
        op.f("ix_refresh_tokens_token_hash"),
        "refresh_tokens",
        ["token_hash"],
        unique=True,
    )
    op.create_table(
        "audit_logs",
        _id(),
        sa.Column("workspace_id", _uuid(), nullable=True),
        sa.Column("actor_id", _uuid(), nullable=True),
        sa.Column("action", sa.String(length=100), nullable=False),
        sa.Column("target_type", sa.String(length=50), nullable=True),
        sa.Column("target_id", sa.String(length=64), nullable=True),
        sa.Column(
            "metadata",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
        *_timestamps(soft_delete=False),
        sa.ForeignKeyConstraint(["actor_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"]),
    )
    op.create_index(op.f("ix_audit_logs_action"), "audit_logs", ["action"])
    op.create_index(op.f("ix_audit_logs_actor_id"), "audit_logs", ["actor_id"])
    op.create_index(
        op.f("ix_audit_logs_workspace_id"), "audit_logs", ["workspace_id"]
    )

    tenant_tables = {
        "workspaces": "id",
        "memberships": "workspace_id",
        "refresh_tokens": "workspace_id",
        "audit_logs": "workspace_id",
    }
    for table, column in tenant_tables.items():
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        op.execute(
            f"CREATE POLICY {table}_tenant_isolation ON {table} "
            f"USING ({column} = "
            "NULLIF(current_setting('app.workspace_id', true), '')::uuid)"
        )

    op.execute(
        """
        DO $$
        BEGIN
            CREATE ROLE app_restricted NOLOGIN;
        EXCEPTION WHEN duplicate_object THEN
            NULL;
        END
        $$;
        """
    )
    op.execute("GRANT USAGE ON SCHEMA public TO app_restricted")
    op.execute(
        "GRANT SELECT ON workspaces, memberships, refresh_tokens, audit_logs "
        "TO app_restricted"
    )


def downgrade() -> None:
    for table in ("workspaces", "memberships", "refresh_tokens", "audit_logs"):
        op.execute(f"DROP POLICY IF EXISTS {table}_tenant_isolation ON {table}")
        op.execute(f"ALTER TABLE {table} DISABLE ROW LEVEL SECURITY")
    op.execute(
        "REVOKE ALL ON workspaces, memberships, refresh_tokens, audit_logs "
        "FROM app_restricted"
    )
    op.execute("REVOKE USAGE ON SCHEMA public FROM app_restricted")

    op.drop_index(op.f("ix_audit_logs_workspace_id"), table_name="audit_logs")
    op.drop_index(op.f("ix_audit_logs_actor_id"), table_name="audit_logs")
    op.drop_index(op.f("ix_audit_logs_action"), table_name="audit_logs")
    op.drop_table("audit_logs")
    op.drop_index(op.f("ix_refresh_tokens_token_hash"), table_name="refresh_tokens")
    op.drop_index(op.f("ix_refresh_tokens_workspace_id"), table_name="refresh_tokens")
    op.drop_index(op.f("ix_refresh_tokens_user_id"), table_name="refresh_tokens")
    op.drop_index(op.f("ix_refresh_tokens_family_id"), table_name="refresh_tokens")
    op.drop_table("refresh_tokens")
    op.drop_index("uq_membership_active", table_name="memberships")
    op.drop_index(op.f("ix_memberships_workspace_id"), table_name="memberships")
    op.drop_index(op.f("ix_memberships_user_id"), table_name="memberships")
    op.drop_index(op.f("ix_memberships_role_id"), table_name="memberships")
    op.drop_table("memberships")
    op.drop_index("uq_user_active_email", table_name="users")
    op.drop_table("users")
    op.drop_index(op.f("ix_workspaces_organization_id"), table_name="workspaces")
    op.drop_table("workspaces")
    op.drop_index("uq_role_system_name", table_name="roles")
    op.drop_table("roles")
    op.drop_table("organizations")
