import os
import uuid
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

import psycopg
import pytest
import pytest_asyncio
from alembic import command
from alembic.config import Config
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from app.core.database import build_engine

BACKEND_ROOT = Path(__file__).resolve().parent

# Superuser connection to the LOCAL PostgreSQL 18 server. Override via env
# when the password or port differ.
ADMIN_URL = os.getenv(
    "TEST_DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/postgres"
)


def _with_database(url: str, database: str) -> str:
    parts = urlsplit(url)
    return urlunsplit(parts._replace(path=f"/{database}"))


@pytest.fixture(scope="session")
def postgres_url() -> str:
    """Create a throwaway database on the local server for this test session.

    No Docker. There is also no SQLite fallback: citext, text[], jsonb,
    partial unique indexes, and RLS are all Postgres-only and all
    load-bearing in this phase.

    CREATE DATABASE cannot run inside a transaction, which is why this uses a
    synchronous autocommit psycopg connection. The application itself never
    touches psycopg.
    """
    db_name = f"wcb_test_{uuid.uuid4().hex[:12]}"

    try:
        with psycopg.connect(ADMIN_URL, autocommit=True) as conn:
            conn.execute(f'CREATE DATABASE "{db_name}"')
    except psycopg.OperationalError as exc:
        pytest.fail(
            "Could not reach the local PostgreSQL server.\n"
            "Set TEST_DATABASE_URL to a superuser connection string, e.g.\n"
            "  set TEST_DATABASE_URL="
            "postgresql://postgres:YOURPASSWORD@localhost:5432/postgres\n"
            f"Original error: {exc}"
        )

    try:
        yield _with_database(ADMIN_URL, db_name).replace(
            "postgresql://", "postgresql+asyncpg://", 1
        )
    finally:
        with psycopg.connect(ADMIN_URL, autocommit=True) as conn:
            # FORCE terminates any lingering connections (PostgreSQL 13+).
            conn.execute(f'DROP DATABASE IF EXISTS "{db_name}" WITH (FORCE)')


@pytest.fixture(scope="session")
def migrated_url(postgres_url: str) -> str:
    config = Config(str(BACKEND_ROOT / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND_ROOT / "alembic"))
    config.set_main_option("sqlalchemy.url", postgres_url)
    command.upgrade(config, "head")
    return postgres_url


@pytest_asyncio.fixture(scope="session")
async def db_engine(migrated_url: str) -> AsyncEngine:
    engine = build_engine(migrated_url)
    yield engine
    await engine.dispose()


@pytest_asyncio.fixture(scope="session", autouse=True)
async def _seeded_roles(db_engine: AsyncEngine) -> None:
    from app.slices.tenancy.api import seed_system_roles

    async with AsyncSession(db_engine) as db_session:
        await seed_system_roles(db_session)
        await db_session.commit()


@pytest_asyncio.fixture
async def session(db_engine: AsyncEngine) -> AsyncSession:
    connection = await db_engine.connect()
    transaction = await connection.begin()
    factory = async_sessionmaker(
        bind=connection,
        expire_on_commit=False,
        join_transaction_mode="create_savepoint",
    )
    async with factory() as db_session:
        yield db_session
    await transaction.rollback()
    await connection.close()


@pytest_asyncio.fixture
async def client(session: AsyncSession):
    from httpx import ASGITransport, AsyncClient

    from app.core.database import get_session
    from app.core.rate_limit import limiter
    from app.main import create_app

    limiter.reset()
    app = create_app()

    async def _override():
        yield session

    app.dependency_overrides[get_session] = _override
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as async_client:
        yield async_client
    limiter.reset()
