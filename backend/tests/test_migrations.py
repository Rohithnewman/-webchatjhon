import os
import uuid
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

import psycopg
import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

EXPECTED_TABLES = {
    "organizations",
    "workspaces",
    "roles",
    "memberships",
    "users",
    "refresh_tokens",
    "audit_logs",
}

ORG_ID = "11111111-1111-1111-1111-111111111111"
WS_A = "aaaaaaaa-0000-0000-0000-000000000001"
WS_B = "bbbbbbbb-0000-0000-0000-000000000002"
BACKEND_ROOT = Path(__file__).resolve().parents[1]
ADMIN_URL = os.getenv(
    "TEST_DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/postgres"
)


def test_migration_chain_reverses_and_reapplies():
    database = f"wcb_migration_{uuid.uuid4().hex[:12]}"
    parts = urlsplit(ADMIN_URL)
    async_url = urlunsplit(parts._replace(path=f"/{database}")).replace(
        "postgresql://", "postgresql+asyncpg://", 1
    )
    with psycopg.connect(ADMIN_URL, autocommit=True) as connection:
        connection.execute(f'CREATE DATABASE "{database}"')
    try:
        config = Config(str(BACKEND_ROOT / "alembic.ini"))
        config.set_main_option("script_location", str(BACKEND_ROOT / "alembic"))
        config.set_main_option("sqlalchemy.url", async_url)
        command.upgrade(config, "head")
        command.downgrade(config, "base")
        command.upgrade(config, "head")
    finally:
        with psycopg.connect(ADMIN_URL, autocommit=True) as connection:
            connection.execute(f'DROP DATABASE IF EXISTS "{database}" WITH (FORCE)')


async def test_migrations_create_every_table(session):
    rows = await session.execute(
        text(
            "SELECT table_name FROM information_schema.tables "
            "WHERE table_schema = 'public'"
        )
    )
    assert EXPECTED_TABLES <= {row[0] for row in rows}


async def test_migrations_seed_required_system_roles(session):
    rows = await session.execute(
        text("SELECT name FROM roles WHERE is_system ORDER BY name")
    )
    assert [row[0] for row in rows] == ["admin", "member", "owner", "viewer"]


async def test_citext_makes_email_case_insensitive(session):
    await session.execute(
        text(
            "INSERT INTO users (email, password_hash, full_name) "
            "VALUES ('MiXeD@Case.com', 'x', 'A')"
        )
    )
    result = await session.execute(
        text("SELECT count(*) FROM users WHERE email = 'mixed@case.com'")
    )
    assert result.scalar_one() == 1


async def test_partial_index_allows_reusing_a_soft_deleted_email(session):
    await session.execute(
        text(
            "INSERT INTO users (email, password_hash, full_name, deleted_at) "
            "VALUES ('reuse@x.com', 'x', 'Old', now())"
        )
    )
    await session.execute(
        text(
            "INSERT INTO users (email, password_hash, full_name) "
            "VALUES ('reuse@x.com', 'x', 'New')"
        )
    )
    result = await session.execute(
        text("SELECT count(*) FROM users WHERE email = 'reuse@x.com'")
    )
    assert result.scalar_one() == 2


async def test_two_active_users_cannot_share_an_email(session):
    await session.execute(
        text(
            "INSERT INTO users (email, password_hash, full_name) "
            "VALUES ('dup@x.com', 'x', 'A')"
        )
    )
    with pytest.raises(IntegrityError):
        await session.execute(
            text(
                "INSERT INTO users (email, password_hash, full_name) "
                "VALUES ('dup@x.com', 'x', 'B')"
            )
        )


async def test_rls_is_enabled_on_tenant_tables(session):
    rows = await session.execute(
        text("SELECT relname FROM pg_class WHERE relrowsecurity = true")
    )
    assert {"workspaces", "memberships", "refresh_tokens", "audit_logs"} <= {
        row[0] for row in rows
    }


async def test_rls_blocks_cross_workspace_reads_under_restricted_role(session):
    await session.execute(
        text("INSERT INTO organizations (id, name) VALUES (:id, 'Acme')"),
        {"id": ORG_ID},
    )
    await session.execute(
        text(
            "INSERT INTO workspaces (id, organization_id, name) "
            "VALUES (:a, :org, 'WS-A'), (:b, :org, 'WS-B')"
        ),
        {"a": WS_A, "b": WS_B, "org": ORG_ID},
    )
    await session.execute(text("SET LOCAL ROLE app_restricted"))
    await session.execute(
        text("SELECT set_config('app.workspace_id', :workspace, true)"),
        {"workspace": WS_A},
    )
    visible = await session.execute(text("SELECT id FROM workspaces ORDER BY id"))
    assert [str(row[0]) for row in visible] == [WS_A]


async def test_restricted_role_sees_nothing_without_workspace_context(session):
    await session.execute(
        text("INSERT INTO organizations (id, name) VALUES (:id, 'Acme')"),
        {"id": ORG_ID},
    )
    await session.execute(
        text(
            "INSERT INTO workspaces (id, organization_id, name) "
            "VALUES (:a, :org, 'WS-A')"
        ),
        {"a": WS_A, "org": ORG_ID},
    )
    await session.execute(text("SET LOCAL ROLE app_restricted"))
    visible = await session.execute(text("SELECT count(*) FROM workspaces"))
    assert visible.scalar_one() == 0
