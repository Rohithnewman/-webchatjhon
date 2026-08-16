"""Create the background job queue.

Replaces the Celery + Redis broker from architecture section 3.7. Redis has no
official Windows build and Docker is unavailable on the target machine, so the
queue lives in Postgres and is claimed with FOR UPDATE SKIP LOCKED.

Revision ID: 0005_jobs
Revises: 0004_core_builder
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0005_jobs"
down_revision = "0004_core_builder"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "jobs",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        # Nullable: platform work belongs to no tenant.
        sa.Column("workspace_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("kind", sa.String(length=80), nullable=False),
        sa.Column(
            "payload",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
        sa.Column("status", sa.String(length=20), server_default="queued", nullable=False),
        sa.Column("attempts", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("max_attempts", sa.Integer(), server_default=sa.text("3"), nullable=False),
        sa.Column("error", sa.String(length=2000), nullable=True),
        sa.Column(
            "run_after",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("locked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("locked_by", sa.String(length=120), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "status IN ('queued', 'running', 'succeeded', 'failed')", name="ck_jobs_status"
        ),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_jobs_workspace_id", "jobs", ["workspace_id"])
    op.create_index("ix_jobs_kind", "jobs", ["kind"])
    op.create_index("ix_jobs_status", "jobs", ["status"])
    # Matches the claim query's filter and ordering.
    op.create_index("ix_jobs_claimable", "jobs", ["status", "run_after"])

    op.execute("ALTER TABLE jobs ENABLE ROW LEVEL SECURITY")
    op.execute(
        "CREATE POLICY jobs_tenant_isolation ON jobs "
        "USING (workspace_id = "
        "NULLIF(current_setting('app.workspace_id', true), '')::uuid)"
    )
    op.execute("GRANT SELECT ON jobs TO app_restricted")


def downgrade() -> None:
    op.execute("REVOKE ALL ON jobs FROM app_restricted")
    op.execute("DROP POLICY IF EXISTS jobs_tenant_isolation ON jobs")
    op.execute("ALTER TABLE jobs DISABLE ROW LEVEL SECURITY")
    op.drop_index("ix_jobs_claimable", table_name="jobs")
    op.drop_index("ix_jobs_status", table_name="jobs")
    op.drop_index("ix_jobs_kind", table_name="jobs")
    op.drop_index("ix_jobs_workspace_id", table_name="jobs")
    op.drop_table("jobs")
