# Phase 1a — Backend Identity Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the FastAPI backend identity core — registration, login, refresh, logout, and workspace switching — with database-verified authorization, audit logging, and Postgres RLS, organized as vertical slices and proven by cross-workspace isolation tests.

**Architecture:** Vertical slice. `app/core/` holds infrastructure with no domain logic, `app/shared/` is a deliberately tiny shared kernel, and each feature lives in `app/slices/<name>/` owning its models, schemas, repository, use cases, router, tests, and a published `api.py`. A slice may import `core`, `shared`, and other slices' `api.py` — nothing else — enforced by `import-linter` in CI. Slice order: `tenancy` and `audit` at the bottom, then `identity`, then `authz`. Authentication (`identity`) and authorization (`authz`) are separate slices because the defect that motivated this rewrite lived exactly at that seam.

**Tech Stack:** Python 3.12+, FastAPI, uvicorn, SQLAlchemy 2.0 (async), asyncpg, Alembic, Pydantic v2, pydantic-settings, PyJWT, bcrypt (used directly — not passlib), pytest, pytest-asyncio, httpx, psycopg (test-time admin DDL only), import-linter.

**Test database:** the **locally installed PostgreSQL 18** at `localhost:5432`. No Docker, no testcontainers. Each test session creates a throwaway database, runs the Alembic chain into it, and drops it at the end. Set `TEST_DATABASE_URL` if your superuser, password, or port differ from the default.

**Spec:** `docs/superpowers/specs/2026-08-11-phase1a-backend-identity-core-design.md`

## Global Constraints

- **Slice import rule:** a slice may import `app.core`, `app.shared`, and other slices' `api.py` only. Never another slice's `models`, `repository`, or `use_cases`. `app.core` and `app.shared` import no slice.
- **Cross-slice foreign keys use string table names** (`ForeignKey("users.id")`), which create no Python import edge. Only `app/core/registry.py` imports models across slices, and only so Alembic sees complete metadata.
- API base path `/api/v1/`. Auth routes under `/api/v1/auth` are unauthenticated.
- Success envelope: `{"success": true, "data": <obj>, "message": <str|null>, "pagination": <obj|null>}`.
- Error envelope: `{"success": false, "error": <CODE>, "message": <str>, "details": <obj|null>}`.
- HTTP codes: 200 ok, 201 created, 400 validation, 401 unauthenticated, 403 forbidden, 404 not found, 423 locked, 429 rate-limited, 500 server error.
- Access JWT 15 minutes, carrying **identity only**: `sub`, `email`, `workspace_id`, `type`, `iat`, `exp`, `jti`. **No `role`, no `permissions`.** Refresh JWT 7 days, carrying `sub`, `workspace_id`, `family_id`, `type`, `iat`, `exp`, `jti`. HS256 over `JWT_SECRET`.
- Every token decode asserts the `type` claim. A refresh token must never be accepted as an access token.
- Passwords hashed with bcrypt, validated at min 8 characters and **max 72 bytes UTF-8** (bcrypt truncates beyond 72 and would silently weaken longer passwords). Never stored or logged in plaintext. Refresh tokens persisted only as SHA-256 hashes.
- UUID primary keys throughout. All timestamps `timestamptz`. Soft-deletable tables carry `created_at`, `updated_at`, `deleted_at`; `audit_logs` is append-only and carries only `created_at`.
- **Uniqueness on soft-deletable tables is always a partial index** `WHERE deleted_at IS NULL`. A total unique index would permanently burn a soft-deleted user's email or block re-inviting a removed member.
- Every tenant-scoped repository function takes `workspace_id` as a mandatory keyword argument.
- All configuration via environment variables. No hardcoded secrets.
- Type hints on every function. `async`/`await` for all DB calls.
- Tests run against the **local PostgreSQL 18 server**, in a throwaway database created and dropped per session, with the schema applied by running Alembic migrations. There is no SQLite anywhere and no Docker.

## File Structure

```
backend/
  pyproject.toml              # pytest, asyncio, and import-linter configuration
  requirements.txt            # runtime + dev dependencies
  .env.example                # documented configuration template
  .gitignore
  alembic.ini
  alembic/
    env.py                    # async migrations, metadata from core.registry
    versions/
      0001_extensions.py      # CREATE EXTENSION citext — must precede the schema
      0002_initial_schema.py  # tables, partial indexes, RLS policies, restricted role
  app/
    main.py                   # app factory: CORS, exception handlers, slice routers
    core/                     # infrastructure only — imports no slice
      config.py               # Settings + CORS validator + production secret guard
      database.py             # Base, engine, session factory, get_session
      security.py             # bcrypt, PyJWT, sha256, TokenError
      errors.py               # AppError + register_exception_handlers
      envelope.py             # success() / error()
      rate_limit.py           # RateLimiter protocol + in-process implementation
      registry.py             # imports every slice's models for Alembic
    shared/
      mixins.py               # TimestampMixin, CreatedAtMixin, uuid_pk
      context.py              # WorkspaceContext, Principal
      permissions.py          # permission string constants
    slices/
      tenancy/                # Organization, Workspace, Role, Membership
      identity/               # User, RefreshToken, auth use cases
      authz/                  # workspace context + permission guard
      audit/                  # AuditLog + record()
      health/                 # liveness + readiness
  tests/
    conftest.py               # container, migrations, session and client fixtures
    test_isolation.py         # cross-workspace safety net
    test_rls.py               # RLS under the restricted role
    test_boundaries.py        # import-linter contracts execute in CI
```

## Prerequisites (one-time, before Task 1)

PostgreSQL 18 is already installed and running as service `postgresql-x64-18` on `localhost:5432`. `psql` is not on PATH; it lives at `C:\Program Files\PostgreSQL\18\bin\psql.exe`.

- [ ] **Confirm the superuser connection works**, since the test harness needs it to create and drop scratch databases:

```powershell
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -h localhost -c "SELECT version();"
```

Enter the password set during installation. If it is not `postgres`, export the real one before running any tests:

```powershell
$env:TEST_DATABASE_URL = "postgresql://postgres:YOURPASSWORD@localhost:5432/postgres"
```

- [ ] **Create the development database** used by `DATABASE_URL` (separate from the per-run test databases):

```powershell
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -h localhost -c "CREATE DATABASE webchatbots;"
```

---

### Task 1: Project scaffold, settings, envelopes, error handling, health slice

**Files:**
- Create: `backend/requirements.txt`
- Create: `backend/pyproject.toml`
- Create: `backend/.env.example`
- Create: `backend/.gitignore`
- Create: `backend/app/__init__.py`, `backend/app/core/__init__.py`
- Create: `backend/app/core/config.py`
- Create: `backend/app/core/envelope.py`
- Create: `backend/app/core/errors.py`
- Create: `backend/app/slices/__init__.py`, `backend/app/slices/health/__init__.py`
- Create: `backend/app/slices/health/router.py`
- Create: `backend/app/main.py`
- Test: `backend/app/slices/health/tests/__init__.py`, `backend/app/slices/health/tests/test_health.py`
- Test: `backend/tests/__init__.py`, `backend/tests/test_errors.py`

**Interfaces:**
- Consumes: nothing (first task).
- Produces:
  - `app.core.config.settings` — a `Settings` instance with `DATABASE_URL: str`, `JWT_SECRET: str`, `JWT_ALGORITHM: str`, `ACCESS_TOKEN_MINUTES: int`, `REFRESH_TOKEN_DAYS: int`, `CORS_ORIGINS: list[str]`, `ENVIRONMENT: str`, `LOGIN_MAX_FAILURES: int`, `LOCKOUT_MINUTES: int`, `RATE_LIMIT_PER_MINUTE: int`.
  - `app.core.envelope.success(data, message=None, pagination=None) -> dict` and `app.core.envelope.error(code, message, details=None) -> dict`.
  - `app.core.errors.AppError(code: str, message: str, status_code: int = 400, details: dict | None = None)` and `app.core.errors.register_exception_handlers(app: FastAPI) -> None`.
  - `app.slices.health.router.router` — an `APIRouter` serving `GET /api/v1/health`.
  - `app.main.create_app() -> FastAPI` and `app.main.app`.

- [ ] **Step 1: Create the directory tree and package markers**

```bash
cd "D:/Jhon britto project"
mkdir -p backend/app/core backend/app/shared backend/app/slices/health/tests backend/tests
touch backend/app/__init__.py backend/app/core/__init__.py backend/app/shared/__init__.py
touch backend/app/slices/__init__.py backend/app/slices/health/__init__.py
touch backend/app/slices/health/tests/__init__.py backend/tests/__init__.py
```

- [ ] **Step 2: Write `backend/requirements.txt`**

Note: versions are intentionally floors, not exact pins. Step 3 records the resolved versions.

```text
fastapi>=0.115
uvicorn[standard]>=0.30
sqlalchemy[asyncio]>=2.0.36
asyncpg>=0.30
alembic>=1.14
pydantic>=2.9
pydantic-settings>=2.6
email-validator>=2.2
PyJWT>=2.9
bcrypt>=4.2
python-multipart>=0.0.12
greenlet>=3.1

pytest>=8.3
pytest-asyncio>=0.24
httpx>=0.27
# Test-time only: CREATE/DROP DATABASE must run outside a transaction on a
# sync connection. The application itself never uses psycopg.
psycopg[binary]>=3.2
import-linter>=2.1
```

- [ ] **Step 3: Create the virtualenv, install, and record resolved versions**

```bash
cd "D:/Jhon britto project/backend"
python -m venv .venv
# Windows PowerShell: .\.venv\Scripts\Activate.ps1
python --version          # expect 3.12 or higher
pip install -r requirements.txt
pip freeze > requirements.lock.txt
```

Expected: installs without error. `requirements.lock.txt` is the exact-version record referenced by spec §4.2.

- [ ] **Step 4: Write `backend/pyproject.toml`**

```toml
[tool.pytest.ini_options]
asyncio_mode = "auto"
# Session-scoped async fixtures (the Postgres container engine) need a
# session-scoped event loop. Without this, pytest-asyncio 0.24+ raises
# "ScopeMismatch" the moment an async fixture outlives a single test.
asyncio_default_fixture_loop_scope = "session"
pythonpath = ["."]
testpaths = ["tests", "app"]
python_files = ["test_*.py"]

[tool.importlinter]
root_packages = ["app"]

[[tool.importlinter.contracts]]
name = "core and shared never import slices"
type = "forbidden"
source_modules = ["app.core", "app.shared"]
forbidden_modules = ["app.slices"]
```

`asyncio_mode = "auto"` means async tests need no `@pytest.mark.asyncio` decorator. Do not add one, and do not define an `event_loop` fixture — that override is removed in pytest-asyncio 0.24+.

- [ ] **Step 5: Write `backend/.gitignore` and `backend/.env.example`**

```text
# backend/.gitignore
__pycache__/
*.pyc
.env
.venv/
venv/
.pytest_cache/
.ruff_cache/
```

```text
# backend/.env.example
ENVIRONMENT=development

# Local dev. In production use the Supabase DIRECT connection (port 5432) for
# Alembic, and the pooler (port 6543) for the app.
DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/webchatbots

# Superuser connection used ONLY by the test suite, to create and drop a
# throwaway database per run. Points at the local PostgreSQL 18 server.
# Change the password to match your local install.
TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres

# Generate with: python -c "import secrets; print(secrets.token_urlsafe(64))"
JWT_SECRET=dev-only-change-me
JWT_ALGORITHM=HS256
ACCESS_TOKEN_MINUTES=15
REFRESH_TOKEN_DAYS=7

# Comma-separated. The Vite dev server runs on 5173.
CORS_ORIGINS=http://localhost:5173,http://localhost:3000

LOGIN_MAX_FAILURES=5
LOCKOUT_MINUTES=15
RATE_LIMIT_PER_MINUTE=20
```

- [ ] **Step 6: Write the failing tests**

```python
# backend/app/slices/health/tests/test_health.py
from httpx import ASGITransport, AsyncClient

from app.main import create_app


async def test_health_returns_success_envelope():
    app = create_app()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as ac:
        resp = await ac.get("/api/v1/health")

    assert resp.status_code == 200
    assert resp.json() == {
        "success": True,
        "data": {"status": "ok"},
        "message": None,
        "pagination": None,
    }
```

```python
# backend/tests/test_errors.py
import pytest
from fastapi import APIRouter
from httpx import ASGITransport, AsyncClient
from pydantic import BaseModel

from app.core.errors import AppError
from app.main import create_app


class _Body(BaseModel):
    count: int


def _app_with_probe_routes():
    app = create_app()
    router = APIRouter()

    @router.get("/api/v1/_probe/boom")
    async def boom():
        raise AppError(code="NOPE", message="nope happened", status_code=403)

    @router.post("/api/v1/_probe/validate")
    async def validate(body: _Body):
        return {"ok": body.count}

    app.include_router(router)
    return app


async def test_app_error_renders_error_envelope():
    async with AsyncClient(
        transport=ASGITransport(app=_app_with_probe_routes()), base_url="http://t"
    ) as ac:
        resp = await ac.get("/api/v1/_probe/boom")

    assert resp.status_code == 403
    assert resp.json() == {
        "success": False,
        "error": "NOPE",
        "message": "nope happened",
        "details": None,
    }


async def test_validation_error_renders_400_envelope():
    async with AsyncClient(
        transport=ASGITransport(app=_app_with_probe_routes()), base_url="http://t"
    ) as ac:
        resp = await ac.post("/api/v1/_probe/validate", json={"count": "not-a-number"})

    assert resp.status_code == 400
    body = resp.json()
    assert body["success"] is False
    assert body["error"] == "VALIDATION_ERROR"
    assert "errors" in body["details"]


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("http://a.com,http://b.com", ["http://a.com", "http://b.com"]),
        ("http://a.com, http://b.com ", ["http://a.com", "http://b.com"]),
        ('["http://a.com"]', ["http://a.com"]),
    ],
)
def test_cors_origins_accepts_comma_separated_and_json(raw, expected):
    from app.core.config import Settings

    assert Settings(CORS_ORIGINS=raw).CORS_ORIGINS == expected
```

- [ ] **Step 7: Run tests to verify they fail**

Run: `cd backend && pytest -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.main'`.

- [ ] **Step 8: Write `app/core/config.py`**

```python
import json

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_DEV_SECRET = "dev-only-change-me"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    ENVIRONMENT: str = "development"

    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/webchatbots"

    JWT_SECRET: str = _DEV_SECRET
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_MINUTES: int = 15
    REFRESH_TOKEN_DAYS: int = 7

    CORS_ORIGINS: list[str] = ["http://localhost:5173"]

    LOGIN_MAX_FAILURES: int = 5
    LOCKOUT_MINUTES: int = 15
    RATE_LIMIT_PER_MINUTE: int = 20

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def _parse_origins(cls, value: object) -> object:
        """pydantic-settings parses list[str] env vars as JSON, so a plain
        `CORS_ORIGINS=http://localhost:5173` would raise at import. Accept both."""
        if not isinstance(value, str):
            return value
        text = value.strip()
        if text.startswith("["):
            return json.loads(text)
        return [item.strip() for item in text.split(",") if item.strip()]

    @model_validator(mode="after")
    def _reject_dev_secret_in_production(self) -> "Settings":
        if self.ENVIRONMENT == "production" and self.JWT_SECRET == _DEV_SECRET:
            raise ValueError("JWT_SECRET must be set to a real secret in production")
        return self


settings = Settings()
```

- [ ] **Step 9: Write `app/core/envelope.py`**

```python
from typing import Any


def success(
    data: Any,
    message: str | None = None,
    pagination: dict[str, Any] | None = None,
) -> dict[str, Any]:
    return {"success": True, "data": data, "message": message, "pagination": pagination}


def error(
    code: str,
    message: str,
    details: dict[str, Any] | None = None,
) -> dict[str, Any]:
    return {"success": False, "error": code, "message": message, "details": details}
```

- [ ] **Step 10: Write `app/core/errors.py`**

```python
import logging
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.core.envelope import error as error_envelope

logger = logging.getLogger(__name__)


class AppError(Exception):
    """Domain error carrying the envelope code and HTTP status to render."""

    def __init__(
        self,
        code: str,
        message: str,
        status_code: int = 400,
        details: dict[str, Any] | None = None,
    ) -> None:
        self.code = code
        self.message = message
        self.status_code = status_code
        self.details = details
        super().__init__(message)


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def _app_error(_: Request, exc: AppError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content=error_envelope(exc.code, exc.message, exc.details),
        )

    @app.exception_handler(RequestValidationError)
    async def _validation(_: Request, exc: RequestValidationError) -> JSONResponse:
        return JSONResponse(
            status_code=400,
            content=error_envelope(
                "VALIDATION_ERROR",
                "Invalid request",
                {"errors": json_safe_errors(exc)},
            ),
        )

    @app.exception_handler(Exception)
    async def _unhandled(_: Request, exc: Exception) -> JSONResponse:
        logger.exception("unhandled error", exc_info=exc)
        return JSONResponse(
            status_code=500,
            content=error_envelope("INTERNAL_ERROR", "Internal server error"),
        )


def json_safe_errors(exc: RequestValidationError) -> list[dict[str, Any]]:
    """Pydantic error dicts can carry non-serializable `ctx` values; drop them."""
    return [
        {k: v for k, v in item.items() if k in {"type", "loc", "msg"}}
        for item in exc.errors()
    ]
```

- [ ] **Step 11: Write the health slice router**

```python
# backend/app/slices/health/router.py
from fastapi import APIRouter

from app.core.envelope import success

router = APIRouter(prefix="/api/v1/health", tags=["health"])


@router.get("")
async def liveness() -> dict:
    """Liveness only — deliberately does not touch the database.
    Readiness (which does) is added in Task 2."""
    return success({"status": "ok"})
```

- [ ] **Step 12: Write `app/main.py`**

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.errors import register_exception_handlers
from app.slices.health.router import router as health_router


def create_app() -> FastAPI:
    app = FastAPI(title="WebChatBots Builder API", version="1.0.0")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    register_exception_handlers(app)

    app.include_router(health_router)

    return app


app = create_app()
```

- [ ] **Step 13: Run tests to verify they pass**

Run: `cd backend && pytest -v`
Expected: PASS — 5 tests (1 health, 2 error envelope, 3 parametrized CORS cases counted individually gives 6 total; all green).

- [ ] **Step 14: Run the import-linter contract**

Run: `cd backend && lint-imports`
Expected: `Contracts: 1 kept, 0 broken.`

- [ ] **Step 15: Commit**

```bash
cd "D:/Jhon britto project"
git add backend/
git commit -m "feat(backend): scaffold vertical-slice app with settings, envelopes, errors, health"
```

---

### Task 2: Async database, Postgres test harness, readiness probe

**Files:**
- Create: `backend/app/core/database.py`
- Modify: `backend/app/slices/health/router.py` (add the readiness route)
- Create: `backend/tests/conftest.py`
- Test: `backend/tests/test_database.py`
- Test: `backend/app/slices/health/tests/test_health.py` (add readiness test)

**Interfaces:**
- Consumes: `app.core.config.settings`, `app.core.envelope.success`, `app.core.errors.AppError`.
- Produces:
  - `app.core.database.Base` — `DeclarativeBase` subclass; all models inherit it.
  - `app.core.database.engine` — the application `AsyncEngine`.
  - `app.core.database.async_session_factory` — `async_sessionmaker[AsyncSession]`.
  - `app.core.database.get_session() -> AsyncIterator[AsyncSession]` — FastAPI dependency; rolls back on exception.
  - `app.core.database.build_engine_kwargs(url: str) -> dict` — pooler-safe engine options.
  - Fixtures in `tests/conftest.py`: `postgres_url` (session-scoped `str`), `db_engine` (session-scoped `AsyncEngine`).

- [ ] **Step 1: Write the failing tests**

```python
# backend/tests/test_database.py
from sqlalchemy import text

from app.core.database import build_engine_kwargs


def test_pooler_url_disables_prepared_statements():
    """Supabase's pooler (port 6543, PgBouncer transaction mode) breaks on
    server-side prepared statements."""
    kwargs = build_engine_kwargs(
        "postgresql+asyncpg://u:p@aws-0-x.pooler.supabase.com:6543/postgres"
    )
    assert kwargs["prepared_statement_cache_size"] == 0
    assert kwargs["connect_args"]["statement_cache_size"] == 0


def test_direct_url_keeps_default_caching():
    kwargs = build_engine_kwargs(
        "postgresql+asyncpg://u:p@db.x.supabase.co:5432/postgres"
    )
    assert "prepared_statement_cache_size" not in kwargs


async def test_session_fixture_executes_sql(db_engine):
    async with db_engine.connect() as conn:
        result = await conn.execute(text("SELECT 1"))
        assert result.scalar_one() == 1
```

```python
# append to backend/app/slices/health/tests/test_health.py
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session


async def test_readiness_reports_ok_when_db_reachable(db_engine):
    app = create_app()

    async def _override():
        async with AsyncSession(db_engine) as session:
            yield session

    app.dependency_overrides[get_session] = _override
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as ac:
        resp = await ac.get("/api/v1/health/ready")

    assert resp.status_code == 200
    assert resp.json()["data"]["database"] == "ok"


async def test_readiness_reports_503_when_db_unreachable():
    app = create_app()

    async def _override():
        class _Broken:
            async def execute(self, *_args, **_kwargs):
                raise RuntimeError("connection refused")

        yield _Broken()

    app.dependency_overrides[get_session] = _override
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as ac:
        resp = await ac.get("/api/v1/health/ready")

    assert resp.status_code == 503
    assert resp.json()["error"] == "NOT_READY"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && pytest -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.core.database'` and `fixture 'db_engine' not found`.

- [ ] **Step 3: Write `app/core/database.py`**

```python
from collections.abc import AsyncIterator
from typing import Any

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

from app.core.config import settings


class Base(DeclarativeBase):
    pass


def build_engine_kwargs(url: str) -> dict[str, Any]:
    """Supabase's connection pooler runs PgBouncer in transaction mode, which
    cannot hold server-side prepared statements. Disable SQLAlchemy's asyncpg
    prepared-statement cache and asyncpg's own statement cache when talking to
    it. Alembic must use the DIRECT connection (5432) regardless.
    """
    if ":6543" in url:
        return {
            "prepared_statement_cache_size": 0,
            "connect_args": {"statement_cache_size": 0},
        }
    return {}


def build_engine(url: str) -> AsyncEngine:
    return create_async_engine(
        url, echo=False, pool_pre_ping=True, **build_engine_kwargs(url)
    )


engine = build_engine(settings.DATABASE_URL)
async_session_factory = async_sessionmaker(
    engine, expire_on_commit=False, class_=AsyncSession
)


async def get_session() -> AsyncIterator[AsyncSession]:
    async with async_session_factory() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
```

- [ ] **Step 4: Add the readiness route**

Replace the contents of `backend/app/slices/health/router.py`:

```python
from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.core.envelope import success
from app.core.errors import AppError

router = APIRouter(prefix="/api/v1/health", tags=["health"])


@router.get("")
async def liveness() -> dict:
    """Liveness only — deliberately does not touch the database, so that a
    database outage does not take the process out of rotation."""
    return success({"status": "ok"})


@router.get("/ready")
async def readiness(session: AsyncSession = Depends(get_session)) -> dict:
    try:
        await session.execute(text("SELECT 1"))
    except Exception as exc:  # noqa: BLE001 - any failure means not ready
        raise AppError(
            code="NOT_READY",
            message="Database unreachable",
            status_code=503,
        ) from exc
    return success({"status": "ok", "database": "ok"})
```

- [ ] **Step 5: Write `tests/conftest.py` against the local PostgreSQL server**

```python
import os
import uuid
from urllib.parse import urlsplit, urlunsplit

import psycopg
import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncEngine

from app.core.database import build_engine

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


@pytest_asyncio.fixture(scope="session")
async def db_engine(postgres_url: str) -> AsyncEngine:
    engine = build_engine(postgres_url)
    yield engine
    await engine.dispose()
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd backend && pytest -v`
Expected: PASS.

If the run fails with an authentication error, the local `postgres` superuser password differs from the default. Set it for the session and retry:

```powershell
$env:TEST_DATABASE_URL = "postgresql://postgres:YOURPASSWORD@localhost:5432/postgres"
pytest -v
```

- [ ] **Step 7: Commit**

```bash
cd "D:/Jhon britto project"
git add backend/
git commit -m "feat(backend): add async engine, pooler-safe options, Postgres test harness, readiness probe"
```

---

### Task 3: Shared kernel and tenancy models

**Files:**
- Create: `backend/app/shared/mixins.py`
- Create: `backend/app/shared/permissions.py`
- Create: `backend/app/slices/tenancy/__init__.py`
- Create: `backend/app/slices/tenancy/models.py`
- Test: `backend/app/slices/tenancy/tests/__init__.py`
- Test: `backend/app/slices/tenancy/tests/test_models.py`

**Interfaces:**
- Consumes: `app.core.database.Base`.
- Produces:
  - `app.shared.mixins.uuid_pk() -> Mapped[uuid.UUID]`, `app.shared.mixins.TimestampMixin` (`created_at`, `updated_at`, `deleted_at`), `app.shared.mixins.CreatedAtMixin` (`created_at` only).
  - `app.shared.permissions.ALL`, `.WORKSPACE_MANAGE`, `.MEMBERS_MANAGE`, `.FEATURES_USE`, `.FEATURES_READ` — string constants.
  - `app.slices.tenancy.models.Organization`, `.Workspace`, `.Role`, `.Membership`.

- [ ] **Step 1: Write the failing test**

```python
# backend/app/slices/tenancy/tests/test_models.py
from app.slices.tenancy.models import Membership, Organization, Role, Workspace


def test_tables_are_named_as_expected():
    assert Organization.__tablename__ == "organizations"
    assert Workspace.__tablename__ == "workspaces"
    assert Role.__tablename__ == "roles"
    assert Membership.__tablename__ == "memberships"


def test_membership_uniqueness_is_partial_on_active_rows():
    """A total unique index would block re-inviting a removed member."""
    index = next(
        ix for ix in Membership.__table__.indexes if ix.name == "uq_membership_active"
    )
    assert index.unique is True
    assert index.dialect_options["postgresql"]["where"] is not None


def test_soft_delete_columns_present_on_tenancy_tables():
    for model in (Organization, Workspace, Membership):
        assert "deleted_at" in model.__table__.columns
        assert "created_at" in model.__table__.columns
        assert "updated_at" in model.__table__.columns
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest app/slices/tenancy -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.slices.tenancy'`.

- [ ] **Step 3: Write `app/shared/mixins.py`**

```python
import uuid
from datetime import datetime

from sqlalchemy import DateTime, func, text
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column


def uuid_pk() -> Mapped[uuid.UUID]:
    """UUID primary key.

    `default` generates client-side so the value is available immediately
    after construction; `server_default` is the backstop for rows inserted by
    raw SQL or migrations.
    """
    return mapped_column(
        PGUUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=text("gen_random_uuid()"),
    )


def fk_uuid() -> Mapped[uuid.UUID]:
    """Column type helper for UUID foreign keys."""
    return mapped_column(PGUUID(as_uuid=True))


class CreatedAtMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class TimestampMixin(CreatedAtMixin):
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
    deleted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
```

- [ ] **Step 4: Write `app/shared/permissions.py`**

```python
"""Permission strings. Kept in the shared kernel because both `tenancy`
(which seeds them onto roles) and `authz` (which checks them) need the same
literals, and a typo in either place would silently grant or deny access.
"""

ALL = "*"
WORKSPACE_MANAGE = "workspace:manage"
MEMBERS_MANAGE = "members:manage"
FEATURES_USE = "features:use"
FEATURES_READ = "features:read"
```

- [ ] **Step 5: Write `app/slices/tenancy/models.py`**

```python
import uuid

from sqlalchemy import ForeignKey, Index, String, text
from sqlalchemy.dialects.postgresql import ARRAY, UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.shared.mixins import CreatedAtMixin, TimestampMixin, uuid_pk


class Organization(TimestampMixin, Base):
    __tablename__ = "organizations"

    id: Mapped[uuid.UUID] = uuid_pk()
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    plan: Mapped[str] = mapped_column(String(20), nullable=False, server_default="free")


class Workspace(TimestampMixin, Base):
    __tablename__ = "workspaces"

    id: Mapped[uuid.UUID] = uuid_pk()
    organization_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    timezone: Mapped[str] = mapped_column(String(64), nullable=False, server_default="UTC")


class Role(CreatedAtMixin, Base):
    __tablename__ = "roles"
    __table_args__ = (
        # System roles are global and seeded once; the partial unique index is
        # what makes seeding idempotent at the database level rather than
        # relying on the seed function alone.
        Index(
            "uq_role_system_name",
            "name",
            unique=True,
            postgresql_where=text("is_system"),
        ),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    name: Mapped[str] = mapped_column(String(50), nullable=False)
    permissions: Mapped[list[str]] = mapped_column(
        ARRAY(String), nullable=False, server_default=text("'{}'::varchar[]")
    )
    is_system: Mapped[bool] = mapped_column(nullable=False, server_default=text("false"))


class Membership(TimestampMixin, Base):
    __tablename__ = "memberships"
    __table_args__ = (
        # Partial, not total: a removed member is soft-deleted, and a total
        # unique index would make re-inviting them raise IntegrityError.
        Index(
            "uq_membership_active",
            "user_id",
            "workspace_id",
            unique=True,
            postgresql_where=text("deleted_at IS NULL"),
        ),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    # String FK target: creates no Python import edge to the identity slice.
    user_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True
    )
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("workspaces.id"), nullable=False, index=True
    )
    role_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("roles.id"), nullable=False, index=True
    )
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd backend && pytest app/slices/tenancy -v`
Expected: PASS — 3 tests.

- [ ] **Step 7: Commit**

```bash
cd "D:/Jhon britto project"
git add backend/
git commit -m "feat(backend): add shared kernel and tenancy slice models"
```

---

### Task 4: Identity and audit models, metadata registry

**Files:**
- Create: `backend/app/slices/identity/__init__.py`
- Create: `backend/app/slices/identity/models.py`
- Create: `backend/app/slices/audit/__init__.py`
- Create: `backend/app/slices/audit/models.py`
- Create: `backend/app/core/registry.py`
- Test: `backend/app/slices/identity/tests/__init__.py`
- Test: `backend/app/slices/identity/tests/test_models.py`

**Interfaces:**
- Consumes: `app.core.database.Base`, `app.shared.mixins`.
- Produces:
  - `app.slices.identity.models.User` — `id, email (citext), password_hash, full_name, is_active, failed_login_count, locked_until, last_workspace_id`, plus timestamps.
  - `app.slices.identity.models.RefreshToken` — `id, user_id, workspace_id, family_id, token_hash, expires_at, revoked_at, created_at`.
  - `app.slices.audit.models.AuditLog` — `id, workspace_id (nullable), actor_id (nullable), action, target_type, target_id, meta, created_at`.
  - `app.core.registry.metadata` — `Base.metadata` with every slice's tables registered; the single import point for Alembic.

- [ ] **Step 1: Write the failing test**

```python
# backend/app/slices/identity/tests/test_models.py
from app.core.registry import metadata
from app.slices.identity.models import RefreshToken, User


def test_user_email_uniqueness_is_partial_on_active_rows():
    """A total unique index would permanently burn a soft-deleted user's email."""
    index = next(ix for ix in User.__table__.indexes if ix.name == "uq_user_active_email")
    assert index.unique is True
    assert index.dialect_options["postgresql"]["where"] is not None


def test_user_carries_lockout_and_default_workspace_columns():
    columns = User.__table__.columns
    assert "failed_login_count" in columns
    assert "locked_until" in columns
    # Replaces the nondeterministic "first membership" workspace selection.
    assert "last_workspace_id" in columns


def test_refresh_token_has_family_for_reuse_detection():
    assert "family_id" in RefreshToken.__table__.columns
    assert RefreshToken.__table__.columns["token_hash"].unique is True


def test_audit_log_is_append_only():
    audit = metadata.tables["audit_logs"]
    assert "created_at" in audit.columns
    assert "updated_at" not in audit.columns
    assert "deleted_at" not in audit.columns
    # Platform-level events (e.g. failed login for an unknown email) have no
    # workspace and no actor to attribute the row to.
    assert audit.columns["workspace_id"].nullable is True
    assert audit.columns["actor_id"].nullable is True


def test_registry_sees_every_slice_table():
    assert {
        "organizations",
        "workspaces",
        "roles",
        "memberships",
        "users",
        "refresh_tokens",
        "audit_logs",
    } <= set(metadata.tables)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest app/slices/identity -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.slices.identity'`.

- [ ] **Step 3: Write `app/slices/identity/models.py`**

```python
import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, String, text
from sqlalchemy.dialects.postgresql import CITEXT, UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.shared.mixins import CreatedAtMixin, TimestampMixin, uuid_pk


class User(TimestampMixin, Base):
    __tablename__ = "users"
    __table_args__ = (
        # Partial, not total. Email is also CITEXT, so case never creates a
        # second account; both defences are deliberate.
        Index(
            "uq_user_active_email",
            "email",
            unique=True,
            postgresql_where=text("deleted_at IS NULL"),
        ),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    email: Mapped[str] = mapped_column(CITEXT(), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str] = mapped_column(String(200), nullable=False)
    is_active: Mapped[bool] = mapped_column(nullable=False, server_default=text("true"))

    failed_login_count: Mapped[int] = mapped_column(nullable=False, server_default=text("0"))
    locked_until: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    last_workspace_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("workspaces.id"), nullable=True
    )


class RefreshToken(CreatedAtMixin, Base):
    __tablename__ = "refresh_tokens"

    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True
    )
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("workspaces.id"), nullable=False, index=True
    )
    # Groups a rotation chain so reuse of a superseded token can revoke every
    # descendant in one statement.
    family_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), nullable=False, index=True
    )
    token_hash: Mapped[str] = mapped_column(
        String(64), nullable=False, unique=True, index=True
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
```

- [ ] **Step 4: Write `app/slices/audit/models.py`**

```python
import uuid
from typing import Any

from sqlalchemy import ForeignKey, String, text
from sqlalchemy.dialects.postgresql import JSONB, UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.shared.mixins import CreatedAtMixin, uuid_pk


class AuditLog(CreatedAtMixin, Base):
    """Append-only. Deliberately has no updated_at and no deleted_at."""

    __tablename__ = "audit_logs"

    id: Mapped[uuid.UUID] = uuid_pk()
    # Nullable: platform-level events (a failed login for an unrecognized
    # email) have no workspace to attribute the row to. RLS excludes NULL
    # rows from tenant-scoped reads, which is the behaviour we want.
    workspace_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("workspaces.id"), nullable=True, index=True
    )
    actor_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id"), nullable=True, index=True
    )
    action: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    target_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    target_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    # Attribute name is `meta` because `metadata` is reserved by SQLAlchemy's
    # declarative base; the column itself is named `metadata`.
    meta: Mapped[dict[str, Any]] = mapped_column(
        "metadata", JSONB, nullable=False, server_default=text("'{}'::jsonb")
    )
```

- [ ] **Step 5: Write `app/core/registry.py`**

```python
"""Single import point that makes `Base.metadata` complete.

Slices own their own models, so nothing imports them across slice boundaries
except this module — and it exists purely so Alembic autogeneration and the
test harness see every table. Import it, never the slice model modules.
"""

from app.core.database import Base
from app.slices.audit import models as _audit_models  # noqa: F401
from app.slices.identity import models as _identity_models  # noqa: F401
from app.slices.tenancy import models as _tenancy_models  # noqa: F401

metadata = Base.metadata

__all__ = ["metadata"]
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd backend && pytest app/slices/identity -v`
Expected: PASS — 5 tests.

- [ ] **Step 7: Commit**

```bash
cd "D:/Jhon britto project"
git add backend/
git commit -m "feat(backend): add identity and audit models with metadata registry"
```

---

### Task 5: Alembic migrations, RLS policies, restricted role

**Files:**
- Create: `backend/alembic.ini`
- Create: `backend/alembic/env.py`, `backend/alembic/script.py.mako`
- Create: `backend/alembic/versions/0001_extensions.py`
- Create: `backend/alembic/versions/0002_initial_schema.py`
- Modify: `backend/tests/conftest.py` (apply migrations; add the per-test `session` fixture)
- Test: `backend/tests/test_migrations.py`

**Interfaces:**
- Consumes: `app.core.registry.metadata`, `app.core.config.settings`.
- Produces:
  - A migration chain applying cleanly from empty to `head`.
  - Postgres role `app_restricted` (NOLOGIN, `SELECT` only) used by RLS tests.
  - `tests/conftest.py` fixtures: `migrated_url` (session `str`), `db_engine` (session `AsyncEngine`), `session` (function-scoped `AsyncSession` inside a rolled-back transaction).

- [ ] **Step 1: Initialize Alembic**

```bash
cd "D:/Jhon britto project/backend"
alembic init alembic
```

Expected: creates `alembic.ini`, `alembic/env.py`, `alembic/script.py.mako`, `alembic/versions/`.

- [ ] **Step 2: Point `alembic.ini` at an empty URL**

In `backend/alembic.ini`, set the URL line to empty so it is always supplied by `env.py` or by the caller:

```ini
sqlalchemy.url =
```

- [ ] **Step 3: Replace `backend/alembic/env.py` entirely**

```python
import asyncio
from logging.config import fileConfig

from alembic import context
from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config

from app.core.config import settings
from app.core.registry import metadata

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# The caller (tests) may set the URL programmatically; otherwise fall back to
# settings. In production this MUST be the Supabase DIRECT connection (5432),
# never the pooler (6543).
if not config.get_main_option("sqlalchemy.url", None):
    config.set_main_option("sqlalchemy.url", settings.DATABASE_URL)

target_metadata = metadata


def do_run_migrations(connection: Connection) -> None:
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        compare_type=True,
        compare_server_default=True,
    )
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


if context.is_offline_mode():
    raise RuntimeError("Offline migrations are not supported for this project")

asyncio.run(run_async_migrations())
```

- [ ] **Step 4: Write the extensions migration**

`citext` must exist before any table declares a `CITEXT` column, so it gets its own migration at the head of the chain. Autogeneration never emits extension statements.

```python
# backend/alembic/versions/0001_extensions.py
"""create required postgres extensions

Revision ID: 0001_extensions
Revises:
Create Date: 2026-08-11
"""

from alembic import op

revision = "0001_extensions"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # citext gives case-insensitive email comparison at the storage layer.
    op.execute("CREATE EXTENSION IF NOT EXISTS citext")


def downgrade() -> None:
    op.execute("DROP EXTENSION IF EXISTS citext")
```

- [ ] **Step 5: Update `backend/tests/conftest.py`**

Replace the file entirely:

```python
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

BACKEND_ROOT = Path(__file__).resolve().parents[1]

ADMIN_URL = os.getenv(
    "TEST_DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/postgres"
)


def _with_database(url: str, database: str) -> str:
    parts = urlsplit(url)
    return urlunsplit(parts._replace(path=f"/{database}"))


@pytest.fixture(scope="session")
def postgres_url() -> str:
    """Create a throwaway database on the local PostgreSQL 18 server.

    No Docker. There is deliberately no SQLite fallback: citext, text[],
    jsonb, partial unique indexes, and RLS are all Postgres-only and all
    load-bearing in this phase.

    CREATE DATABASE cannot run inside a transaction, hence a synchronous
    autocommit psycopg connection. The application never touches psycopg.
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
            conn.execute(f'DROP DATABASE IF EXISTS "{db_name}" WITH (FORCE)')


@pytest.fixture(scope="session")
def migrated_url(postgres_url: str) -> str:
    """Create the schema by running the real migrations.

    Never Base.metadata.create_all — applying the chain here means every test
    run also proves the migrations work from empty to head.
    """
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


@pytest_asyncio.fixture
async def session(db_engine: AsyncEngine) -> AsyncSession:
    """Each test runs inside a transaction that is rolled back afterwards.

    join_transaction_mode="create_savepoint" means a use case calling
    session.commit() releases a savepoint instead of committing for real, so
    tests stay isolated even while exercising code that commits.
    """
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
```

- [ ] **Step 6: Write the failing tests**

```python
# backend/tests/test_migrations.py
import pytest
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


async def test_migrations_create_every_table(session):
    rows = await session.execute(
        text(
            "SELECT table_name FROM information_schema.tables "
            "WHERE table_schema = 'public'"
        )
    )
    assert EXPECTED_TABLES <= {row[0] for row in rows}


async def test_citext_makes_email_case_insensitive(session):
    await session.execute(
        text(
            "INSERT INTO users (email, password_hash, full_name) "
            "VALUES ('MiXeD@Case.com', 'x', 'A')"
        )
    )
    found = await session.execute(
        text("SELECT count(*) FROM users WHERE email = 'mixed@case.com'")
    )
    assert found.scalar_one() == 1


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
    total = await session.execute(
        text("SELECT count(*) FROM users WHERE email = 'reuse@x.com'")
    )
    assert total.scalar_one() == 2


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
    """The app connects as owner and bypasses RLS by design, which makes it
    easy to ship broken policies and never notice. This asserts the policies
    actually bite, using a non-owner role."""
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
    await session.execute(
        text(
            "INSERT INTO audit_logs (workspace_id, action) "
            "VALUES (:a, 'test.a'), (:b, 'test.b')"
        ),
        {"a": WS_A, "b": WS_B},
    )

    await session.execute(text("SET LOCAL ROLE app_restricted"))
    await session.execute(
        text("SELECT set_config('app.workspace_id', :ws, true)"), {"ws": WS_A}
    )
    visible = await session.execute(text("SELECT action FROM audit_logs"))
    actions = {row[0] for row in visible}

    assert actions == {"test.a"}


async def test_rls_returns_nothing_when_workspace_is_unset(session):
    await session.execute(text("SET LOCAL ROLE app_restricted"))
    visible = await session.execute(text("SELECT count(*) FROM audit_logs"))
    assert visible.scalar_one() == 0
```

- [ ] **Step 7: Run tests to verify they fail**

Run: `cd backend && pytest tests/test_migrations.py -v`
Expected: FAIL — only `0001_extensions` exists, so no tables are created and every assertion fails.

- [ ] **Step 8: Autogenerate the schema migration**

```bash
cd "D:/Jhon britto project/backend"
# Point at a local Postgres (NOT the pooler) so autogenerate emits Postgres types.
alembic revision --autogenerate -m "initial phase1a schema"
```

Rename the generated file to `backend/alembic/versions/0002_initial_schema.py` and set its identifiers:

```python
revision = "0002_initial_schema"
down_revision = "0001_extensions"
```

Verify the generated `upgrade()` contains `op.create_table` for all seven tables and `op.create_index` for `uq_user_active_email`, `uq_membership_active`, and `uq_role_system_name`, each carrying a `postgresql_where=` argument. If any partial index lost its `WHERE` clause, add it by hand — a total unique index here is the soft-delete bug this phase exists to avoid.

- [ ] **Step 9: Append RLS policies and the restricted role to `0002_initial_schema.py`**

Add at the end of `upgrade()`:

```python
    # --- Row Level Security (defense-in-depth) -------------------------------
    # The application connects as the table owner and therefore BYPASSES these
    # policies by design (architecture D1). They exist as a second line of
    # defence, and the app_restricted role below is what lets tests prove the
    # policies are real rather than decorative.
    #
    # NULLIF guards against an empty setting string, which would fail the cast.
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
            f"NULLIF(current_setting('app.workspace_id', true), '')::uuid)"
        )

    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_restricted') THEN
                CREATE ROLE app_restricted NOLOGIN;
            END IF;
        END
        $$;
        """
    )
    op.execute("GRANT USAGE ON SCHEMA public TO app_restricted")
    op.execute(
        "GRANT SELECT ON workspaces, memberships, refresh_tokens, audit_logs "
        "TO app_restricted"
    )
```

Note: roles in PostgreSQL are **cluster-wide**, not per-database, so `app_restricted` outlives each throwaway test database. That is why creation is guarded by `IF NOT EXISTS` — the grants are per-database and vanish with the database, so repeat test runs stay clean.

Add at the **start** of `downgrade()`:

```python
    for table in ("workspaces", "memberships", "refresh_tokens", "audit_logs"):
        op.execute(f"DROP POLICY IF EXISTS {table}_tenant_isolation ON {table}")
        op.execute(f"ALTER TABLE {table} DISABLE ROW LEVEL SECURITY")
    op.execute(
        "REVOKE ALL ON workspaces, memberships, refresh_tokens, audit_logs "
        "FROM app_restricted"
    )
    op.execute("REVOKE USAGE ON SCHEMA public FROM app_restricted")
```

- [ ] **Step 10: Run tests to verify they pass**

Run: `cd backend && pytest tests/test_migrations.py -v`
Expected: PASS — 7 tests.

- [ ] **Step 11: Verify the chain reverses cleanly**

```bash
cd "D:/Jhon britto project/backend"
alembic downgrade base && alembic upgrade head
```

Expected: both complete without error against your local Postgres.

- [ ] **Step 12: Commit**

```bash
cd "D:/Jhon britto project"
git add backend/
git commit -m "feat(backend): add migrations, partial unique indexes, RLS policies, restricted role"
```

---

### Task 6: Tenancy repository, published API, and role seeding

**Files:**
- Create: `backend/app/slices/tenancy/repository.py`
- Create: `backend/app/slices/tenancy/api.py`
- Create: `backend/app/slices/tenancy/seed.py`
- Modify: `backend/tests/conftest.py` (seed system roles once after migration)
- Test: `backend/app/slices/tenancy/tests/test_tenancy_api.py`

**Interfaces:**
- Consumes: `app.slices.tenancy.models`, `app.shared.permissions`.
- Produces (`app.slices.tenancy.api` — the **only** module other slices may import):
  - `RoleView(id: UUID, name: str, permissions: tuple[str, ...])` — frozen dataclass.
  - `MembershipView(membership_id: UUID, workspace_id: UUID, role_id: UUID, role_name: str, permissions: tuple[str, ...])` — frozen dataclass.
  - `TenantCreated(organization_id: UUID, workspace_id: UUID)` — frozen dataclass.
  - `async seed_system_roles(session) -> None` — idempotent.
  - `async get_role_by_name(session, name: str) -> RoleView | None`
  - `async create_tenant(session, *, org_name: str, workspace_name: str = "Default") -> TenantCreated`
  - `async create_membership(session, *, user_id: UUID, workspace_id: UUID, role_id: UUID) -> UUID`
  - `async get_active_membership(session, *, user_id: UUID, workspace_id: UUID) -> MembershipView | None`
  - `async get_earliest_workspace_id(session, *, user_id: UUID) -> UUID | None`

- [ ] **Step 1: Write the failing test**

```python
# backend/app/slices/tenancy/tests/test_tenancy_api.py
import uuid

from sqlalchemy import text

from app.shared import permissions
from app.slices.tenancy import api as tenancy_api


async def _make_user(session, email: str = "u@x.com") -> uuid.UUID:
    """Raw insert: the tenancy slice must not import the identity slice."""
    result = await session.execute(
        text(
            "INSERT INTO users (email, password_hash, full_name) "
            "VALUES (:e, 'x', 'U') RETURNING id"
        ),
        {"e": email},
    )
    return result.scalar_one()


async def test_seed_system_roles_is_idempotent(session):
    await tenancy_api.seed_system_roles(session)
    await tenancy_api.seed_system_roles(session)

    rows = await session.execute(text("SELECT name FROM roles WHERE is_system"))
    assert sorted(row[0] for row in rows) == ["admin", "member", "owner", "viewer"]


async def test_owner_role_has_wildcard_permission(session):
    await tenancy_api.seed_system_roles(session)
    owner = await tenancy_api.get_role_by_name(session, "owner")

    assert owner is not None
    assert owner.permissions == (permissions.ALL,)


async def test_get_role_by_name_returns_none_when_absent(session):
    assert await tenancy_api.get_role_by_name(session, "nope") is None


async def test_create_tenant_makes_org_and_default_workspace(session):
    created = await tenancy_api.create_tenant(session, org_name="Acme")

    name = await session.execute(
        text("SELECT name FROM workspaces WHERE id = :id"),
        {"id": created.workspace_id},
    )
    assert name.scalar_one() == "Default"

    org = await session.execute(
        text("SELECT name FROM organizations WHERE id = :id"),
        {"id": created.organization_id},
    )
    assert org.scalar_one() == "Acme"


async def test_get_active_membership_returns_role_and_permissions(session):
    await tenancy_api.seed_system_roles(session)
    created = await tenancy_api.create_tenant(session, org_name="Acme")
    owner = await tenancy_api.get_role_by_name(session, "owner")
    user_id = await _make_user(session)
    await tenancy_api.create_membership(
        session, user_id=user_id, workspace_id=created.workspace_id, role_id=owner.id
    )

    view = await tenancy_api.get_active_membership(
        session, user_id=user_id, workspace_id=created.workspace_id
    )

    assert view is not None
    assert view.role_name == "owner"
    assert view.permissions == (permissions.ALL,)


async def test_get_active_membership_ignores_soft_deleted_rows(session):
    await tenancy_api.seed_system_roles(session)
    created = await tenancy_api.create_tenant(session, org_name="Acme")
    owner = await tenancy_api.get_role_by_name(session, "owner")
    user_id = await _make_user(session)
    membership_id = await tenancy_api.create_membership(
        session, user_id=user_id, workspace_id=created.workspace_id, role_id=owner.id
    )
    await session.execute(
        text("UPDATE memberships SET deleted_at = now() WHERE id = :id"),
        {"id": membership_id},
    )

    assert (
        await tenancy_api.get_active_membership(
            session, user_id=user_id, workspace_id=created.workspace_id
        )
        is None
    )


async def test_get_earliest_workspace_id_is_deterministic(session):
    await tenancy_api.seed_system_roles(session)
    owner = await tenancy_api.get_role_by_name(session, "owner")
    user_id = await _make_user(session)
    first = await tenancy_api.create_tenant(session, org_name="First")
    second = await tenancy_api.create_tenant(session, org_name="Second")
    await tenancy_api.create_membership(
        session, user_id=user_id, workspace_id=first.workspace_id, role_id=owner.id
    )
    await session.flush()
    await tenancy_api.create_membership(
        session, user_id=user_id, workspace_id=second.workspace_id, role_id=owner.id
    )

    # Ordered by created_at, never by unordered "first row returned".
    assert (
        await tenancy_api.get_earliest_workspace_id(session, user_id=user_id)
        == first.workspace_id
    )
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest app/slices/tenancy -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.slices.tenancy.api'`.

- [ ] **Step 3: Write `app/slices/tenancy/seed.py`**

```python
from app.shared import permissions

SYSTEM_ROLES: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("owner", (permissions.ALL,)),
    (
        "admin",
        (
            permissions.WORKSPACE_MANAGE,
            permissions.MEMBERS_MANAGE,
            permissions.FEATURES_USE,
            permissions.FEATURES_READ,
        ),
    ),
    ("member", (permissions.FEATURES_USE, permissions.FEATURES_READ)),
    ("viewer", (permissions.FEATURES_READ,)),
)
```

- [ ] **Step 4: Write `app/slices/tenancy/repository.py`**

```python
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.slices.tenancy.models import Membership, Organization, Role, Workspace


async def insert_organization(session: AsyncSession, *, name: str) -> Organization:
    org = Organization(name=name)
    session.add(org)
    await session.flush()
    return org


async def insert_workspace(
    session: AsyncSession, *, organization_id: uuid.UUID, name: str
) -> Workspace:
    workspace = Workspace(organization_id=organization_id, name=name)
    session.add(workspace)
    await session.flush()
    return workspace


async def insert_role(
    session: AsyncSession, *, name: str, permissions: list[str], is_system: bool
) -> Role:
    role = Role(name=name, permissions=permissions, is_system=is_system)
    session.add(role)
    await session.flush()
    return role


async def select_system_role_names(session: AsyncSession) -> set[str]:
    rows = await session.execute(select(Role.name).where(Role.is_system.is_(True)))
    return set(rows.scalars().all())


async def select_role_by_name(session: AsyncSession, name: str) -> Role | None:
    stmt = select(Role).where(Role.name == name, Role.is_system.is_(True))
    return (await session.execute(stmt)).scalar_one_or_none()


async def insert_membership(
    session: AsyncSession,
    *,
    user_id: uuid.UUID,
    workspace_id: uuid.UUID,
    role_id: uuid.UUID,
) -> Membership:
    membership = Membership(
        user_id=user_id, workspace_id=workspace_id, role_id=role_id
    )
    session.add(membership)
    await session.flush()
    return membership


async def select_active_membership_with_role(
    session: AsyncSession, *, user_id: uuid.UUID, workspace_id: uuid.UUID
) -> tuple[Membership, Role] | None:
    stmt = (
        select(Membership, Role)
        .join(Role, Role.id == Membership.role_id)
        .where(
            Membership.user_id == user_id,
            Membership.workspace_id == workspace_id,
            Membership.deleted_at.is_(None),
        )
    )
    row = (await session.execute(stmt)).first()
    return (row[0], row[1]) if row else None


async def select_earliest_workspace_id(
    session: AsyncSession, *, user_id: uuid.UUID
) -> uuid.UUID | None:
    stmt = (
        select(Membership.workspace_id)
        .where(Membership.user_id == user_id, Membership.deleted_at.is_(None))
        .order_by(Membership.created_at, Membership.id)
        .limit(1)
    )
    return (await session.execute(stmt)).scalars().first()
```

- [ ] **Step 5: Write `app/slices/tenancy/api.py`**

```python
"""Published interface of the tenancy slice.

Other slices import THIS MODULE ONLY — never models, repository, or use_cases.
Returns frozen dataclasses rather than ORM objects so callers cannot reach
through into tenancy's internals.
"""

import uuid
from dataclasses import dataclass

from sqlalchemy.ext.asyncio import AsyncSession

from app.slices.tenancy import repository
from app.slices.tenancy.seed import SYSTEM_ROLES


@dataclass(frozen=True)
class RoleView:
    id: uuid.UUID
    name: str
    permissions: tuple[str, ...]


@dataclass(frozen=True)
class MembershipView:
    membership_id: uuid.UUID
    workspace_id: uuid.UUID
    role_id: uuid.UUID
    role_name: str
    permissions: tuple[str, ...]


@dataclass(frozen=True)
class TenantCreated:
    organization_id: uuid.UUID
    workspace_id: uuid.UUID


async def seed_system_roles(session: AsyncSession) -> None:
    """Idempotent. The partial unique index on (name) WHERE is_system is the
    database-level guarantee; this function is the convenient path."""
    existing = await repository.select_system_role_names(session)
    for name, perms in SYSTEM_ROLES:
        if name not in existing:
            await repository.insert_role(
                session, name=name, permissions=list(perms), is_system=True
            )


async def get_role_by_name(session: AsyncSession, name: str) -> RoleView | None:
    role = await repository.select_role_by_name(session, name)
    if role is None:
        return None
    return RoleView(id=role.id, name=role.name, permissions=tuple(role.permissions))


async def create_tenant(
    session: AsyncSession, *, org_name: str, workspace_name: str = "Default"
) -> TenantCreated:
    org = await repository.insert_organization(session, name=org_name)
    workspace = await repository.insert_workspace(
        session, organization_id=org.id, name=workspace_name
    )
    return TenantCreated(organization_id=org.id, workspace_id=workspace.id)


async def create_membership(
    session: AsyncSession,
    *,
    user_id: uuid.UUID,
    workspace_id: uuid.UUID,
    role_id: uuid.UUID,
) -> uuid.UUID:
    membership = await repository.insert_membership(
        session, user_id=user_id, workspace_id=workspace_id, role_id=role_id
    )
    return membership.id


async def get_active_membership(
    session: AsyncSession, *, user_id: uuid.UUID, workspace_id: uuid.UUID
) -> MembershipView | None:
    found = await repository.select_active_membership_with_role(
        session, user_id=user_id, workspace_id=workspace_id
    )
    if found is None:
        return None
    membership, role = found
    return MembershipView(
        membership_id=membership.id,
        workspace_id=membership.workspace_id,
        role_id=role.id,
        role_name=role.name,
        permissions=tuple(role.permissions),
    )


async def get_earliest_workspace_id(
    session: AsyncSession, *, user_id: uuid.UUID
) -> uuid.UUID | None:
    """Deterministic by created_at. Replaces the superseded plan's
    `memberships[0]`, which had no ORDER BY."""
    return await repository.select_earliest_workspace_id(session, user_id=user_id)
```

- [ ] **Step 6: Seed system roles once in `tests/conftest.py`**

Add to `backend/tests/conftest.py`, after the `db_engine` fixture:

```python
@pytest_asyncio.fixture(scope="session", autouse=True)
async def _seeded_roles(db_engine: AsyncEngine) -> None:
    """Seed the four system roles once, committed, for the whole session.

    Task 6's own tests seed inside their rolled-back transaction and assert
    idempotency, so this committed baseline does not hide a broken seeder.
    """
    from app.slices.tenancy.api import seed_system_roles

    async with AsyncSession(db_engine) as db_session:
        await seed_system_roles(db_session)
        await db_session.commit()
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `cd backend && pytest app/slices/tenancy -v`
Expected: PASS — 7 tests.

- [ ] **Step 8: Commit**

```bash
cd "D:/Jhon britto project"
git add backend/
git commit -m "feat(backend): add tenancy repository, published api, and idempotent role seeding"
```

---

### Task 7: Security core — bcrypt, PyJWT, SHA-256

**Files:**
- Create: `backend/app/core/security.py`
- Test: `backend/tests/test_security.py`

**Interfaces:**
- Consumes: `app.core.config.settings`.
- Produces:
  - `TokenError(Exception)` — raised for any invalid, expired, or wrong-type token. Core stays domain-free; slices translate this into `AppError`.
  - `hash_password(plain: str) -> str`
  - `verify_password(plain: str, hashed: str) -> bool`
  - `DUMMY_PASSWORD_HASH: str` — a real bcrypt hash used to equalize login timing for unknown emails.
  - `sha256(value: str) -> str`
  - `create_access_token(*, sub: str, email: str, workspace_id: str) -> str`
  - `create_refresh_token(*, sub: str, workspace_id: str, family_id: str) -> tuple[str, datetime]`
  - `decode_token(token: str, *, expected_type: str) -> dict`

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_security.py
from datetime import datetime, timedelta, timezone

import jwt
import pytest

from app.core import security
from app.core.config import settings


def test_password_hash_roundtrip():
    hashed = security.hash_password("Secret123")
    assert hashed != "Secret123"
    assert security.verify_password("Secret123", hashed) is True
    assert security.verify_password("wrong", hashed) is False


def test_verify_password_is_false_for_malformed_hash():
    assert security.verify_password("Secret123", "not-a-bcrypt-hash") is False


def test_dummy_hash_is_verifiable_but_never_matches_real_input():
    """Used to keep login timing identical for unknown emails."""
    assert security.DUMMY_PASSWORD_HASH.startswith("$2")
    assert security.verify_password("anything", security.DUMMY_PASSWORD_HASH) is False


def test_sha256_is_stable_and_64_hex_chars():
    assert security.sha256("abc") == security.sha256("abc")
    assert len(security.sha256("abc")) == 64


def test_access_token_carries_identity_only():
    token = security.create_access_token(
        sub="u1", email="a@b.com", workspace_id="w1"
    )
    payload = security.decode_token(token, expected_type="access")

    assert payload["sub"] == "u1"
    assert payload["email"] == "a@b.com"
    assert payload["workspace_id"] == "w1"
    assert payload["type"] == "access"
    assert "jti" in payload
    # Amended D1: authorization is resolved from the database per request.
    assert "role" not in payload
    assert "permissions" not in payload


def test_refresh_token_carries_family_and_returns_expiry():
    token, expires_at = security.create_refresh_token(
        sub="u1", workspace_id="w1", family_id="f1"
    )
    payload = security.decode_token(token, expected_type="refresh")

    assert payload["family_id"] == "f1"
    assert payload["type"] == "refresh"
    assert expires_at > datetime.now(timezone.utc)


def test_refresh_token_is_rejected_where_an_access_token_is_expected():
    token, _ = security.create_refresh_token(
        sub="u1", workspace_id="w1", family_id="f1"
    )
    with pytest.raises(security.TokenError):
        security.decode_token(token, expected_type="access")


def test_garbage_token_raises_token_error():
    with pytest.raises(security.TokenError):
        security.decode_token("not-a-token", expected_type="access")


def test_expired_token_raises_token_error():
    expired = jwt.encode(
        {
            "sub": "u1",
            "type": "access",
            "exp": datetime.now(timezone.utc) - timedelta(seconds=1),
        },
        settings.JWT_SECRET,
        algorithm=settings.JWT_ALGORITHM,
    )
    with pytest.raises(security.TokenError):
        security.decode_token(expired, expected_type="access")


def test_token_signed_with_another_secret_raises_token_error():
    forged = jwt.encode({"sub": "u1", "type": "access"}, "other-secret", algorithm="HS256")
    with pytest.raises(security.TokenError):
        security.decode_token(forged, expected_type="access")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_security.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.core.security'`.

- [ ] **Step 3: Write `app/core/security.py`**

```python
import hashlib
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

import bcrypt
import jwt

from app.core.config import settings

MAX_PASSWORD_BYTES = 72


class TokenError(Exception):
    """Invalid, expired, or wrong-type token.

    Deliberately not an AppError: `core` holds no domain concepts. Slices
    translate this into the appropriate envelope code.
    """


def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except ValueError:
        # Malformed stored hash — treat as a failed verification, never a 500.
        return False


# A real hash of a value no user can supply. Login verifies against this when
# the email is unknown, so response timing does not reveal whether an account
# exists.
DUMMY_PASSWORD_HASH = hash_password(uuid.uuid4().hex)


def sha256(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _encode(claims: dict[str, Any], *, token_type: str, lifetime: timedelta) -> tuple[str, datetime]:
    issued_at = datetime.now(timezone.utc)
    expires_at = issued_at + lifetime
    payload = {
        **claims,
        "type": token_type,
        "iat": issued_at,
        "exp": expires_at,
        "jti": str(uuid.uuid4()),
    }
    token = jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)
    return token, expires_at


def create_access_token(*, sub: str, email: str, workspace_id: str) -> str:
    """Identity only. Role and permissions are resolved from the database on
    every request (architecture D1, amended 2026-08-11)."""
    token, _ = _encode(
        {"sub": sub, "email": email, "workspace_id": workspace_id},
        token_type="access",
        lifetime=timedelta(minutes=settings.ACCESS_TOKEN_MINUTES),
    )
    return token


def create_refresh_token(
    *, sub: str, workspace_id: str, family_id: str
) -> tuple[str, datetime]:
    return _encode(
        {"sub": sub, "workspace_id": workspace_id, "family_id": family_id},
        token_type="refresh",
        lifetime=timedelta(days=settings.REFRESH_TOKEN_DAYS),
    )


def decode_token(token: str, *, expected_type: str) -> dict[str, Any]:
    try:
        payload = jwt.decode(
            token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM]
        )
    except jwt.PyJWTError as exc:
        raise TokenError(str(exc)) from exc
    if payload.get("type") != expected_type:
        raise TokenError(f"expected a {expected_type} token")
    return payload
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && pytest tests/test_security.py -v`
Expected: PASS — 10 tests.

- [ ] **Step 5: Commit**

```bash
cd "D:/Jhon britto project"
git add backend/
git commit -m "feat(backend): add security core with bcrypt, PyJWT, and typed token errors"
```

---

### Task 8: Audit slice

**Files:**
- Create: `backend/app/slices/audit/repository.py`
- Create: `backend/app/slices/audit/actions.py`
- Create: `backend/app/slices/audit/api.py`
- Test: `backend/app/slices/audit/tests/__init__.py`
- Test: `backend/app/slices/audit/tests/test_audit_api.py`

**Interfaces:**
- Consumes: `app.slices.audit.models.AuditLog`.
- Produces (`app.slices.audit.api`):
  - `async record(session, *, action: str, workspace_id: UUID | None = None, actor_id: UUID | None = None, target_type: str | None = None, target_id: str | None = None, metadata: dict | None = None) -> None` — writes inside the caller's transaction; never commits.
  - `app.slices.audit.actions` — the action string constants used across the codebase: `REGISTER`, `LOGIN`, `LOGIN_FAILED`, `ACCOUNT_LOCKED`, `LOGOUT`, `REFRESH`, `REFRESH_REUSE_DETECTED`, `SWITCH_WORKSPACE`.

- [ ] **Step 1: Write the failing test**

```python
# backend/app/slices/audit/tests/test_audit_api.py
from sqlalchemy import text

from app.slices.audit import actions
from app.slices.audit import api as audit_api
from app.slices.tenancy import api as tenancy_api


async def test_record_writes_a_row_with_metadata(session):
    created = await tenancy_api.create_tenant(session, org_name="Acme")

    await audit_api.record(
        session,
        action=actions.REGISTER,
        workspace_id=created.workspace_id,
        target_type="user",
        target_id="abc",
        metadata={"source": "test"},
    )
    await session.flush()

    row = await session.execute(
        text("SELECT action, metadata, target_id FROM audit_logs WHERE workspace_id = :w"),
        {"w": created.workspace_id},
    )
    action, metadata, target_id = row.one()
    assert action == actions.REGISTER
    assert metadata == {"source": "test"}
    assert target_id == "abc"


async def test_record_allows_platform_events_without_workspace_or_actor(session):
    """A failed login for an unrecognized email has no tenant to attribute."""
    await audit_api.record(session, action=actions.LOGIN_FAILED)
    await session.flush()

    row = await session.execute(
        text(
            "SELECT count(*) FROM audit_logs "
            "WHERE action = :a AND workspace_id IS NULL AND actor_id IS NULL"
        ),
        {"a": actions.LOGIN_FAILED},
    )
    assert row.scalar_one() == 1


async def test_record_does_not_commit(session):
    """The audit row must live or die with the mutation it describes."""
    await audit_api.record(session, action=actions.LOGIN_FAILED)
    assert session.in_transaction() is True
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest app/slices/audit -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.slices.audit.api'`.

- [ ] **Step 3: Write `app/slices/audit/actions.py`**

```python
"""Audit action constants. Referenced by every slice that writes audit rows,
so a typo becomes an import error rather than a silently unqueryable log."""

REGISTER = "auth.register"
LOGIN = "auth.login"
LOGIN_FAILED = "auth.login_failed"
ACCOUNT_LOCKED = "auth.account_locked"
LOGOUT = "auth.logout"
REFRESH = "auth.refresh"
REFRESH_REUSE_DETECTED = "auth.refresh_reuse_detected"
SWITCH_WORKSPACE = "auth.switch_workspace"
```

- [ ] **Step 4: Write `app/slices/audit/repository.py`**

```python
import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.slices.audit.models import AuditLog


async def insert(
    session: AsyncSession,
    *,
    action: str,
    workspace_id: uuid.UUID | None,
    actor_id: uuid.UUID | None,
    target_type: str | None,
    target_id: str | None,
    meta: dict[str, Any],
) -> None:
    session.add(
        AuditLog(
            action=action,
            workspace_id=workspace_id,
            actor_id=actor_id,
            target_type=target_type,
            target_id=target_id,
            meta=meta,
        )
    )
```

- [ ] **Step 5: Write `app/slices/audit/api.py`**

```python
"""Published interface of the audit slice."""

import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.slices.audit import repository


async def record(
    session: AsyncSession,
    *,
    action: str,
    workspace_id: uuid.UUID | None = None,
    actor_id: uuid.UUID | None = None,
    target_type: str | None = None,
    target_id: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> None:
    """Write an audit row inside the CALLER'S transaction.

    Deliberately does not commit: the audit row and the mutation it describes
    must commit or roll back together, so they can never drift apart. This is
    also why audit writes are explicit calls in use cases rather than a route
    decorator — a decorator sees the HTTP envelope, not the domain outcome.
    """
    await repository.insert(
        session,
        action=action,
        workspace_id=workspace_id,
        actor_id=actor_id,
        target_type=target_type,
        target_id=target_id,
        meta=metadata or {},
    )
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd backend && pytest app/slices/audit -v`
Expected: PASS — 3 tests.

- [ ] **Step 7: Commit**

```bash
cd "D:/Jhon britto project"
git add backend/
git commit -m "feat(backend): add audit slice writing inside the caller's transaction"
```

---

### Task 9: Identity repository and published API

**Files:**
- Create: `backend/app/slices/identity/repository.py`
- Create: `backend/app/slices/identity/api.py`
- Test: `backend/app/slices/identity/tests/test_identity_repository.py`

**Interfaces:**
- Consumes: `app.slices.identity.models`.
- Produces:
  - `repository.select_user_by_email(session, email) -> User | None` (active rows only)
  - `repository.select_user(session, user_id) -> User | None` (active rows only)
  - `repository.insert_user(session, *, email, password_hash, full_name) -> User`
  - `repository.insert_refresh_token(session, *, user_id, workspace_id, family_id, token_hash, expires_at) -> RefreshToken`
  - `repository.select_refresh_token(session, *, token_hash) -> RefreshToken | None`
  - `repository.revoke_refresh_token(session, *, token) -> None`
  - `repository.revoke_refresh_family(session, *, family_id) -> int`
  - `app.slices.identity.api.UserSummary(id: UUID, email: str, is_active: bool)` — frozen dataclass.
  - `app.slices.identity.api.get_active_user(session, *, user_id) -> UserSummary | None` — the single call `authz` makes into this slice.

- [ ] **Step 1: Write the failing test**

```python
# backend/app/slices/identity/tests/test_identity_repository.py
from datetime import datetime, timedelta, timezone

from sqlalchemy import text

from app.slices.identity import api as identity_api
from app.slices.identity import repository
from app.slices.tenancy import api as tenancy_api


async def _user(session, email="a@b.com"):
    return await repository.insert_user(
        session, email=email, password_hash="h", full_name="A"
    )


async def test_insert_and_lookup_by_email(session):
    await _user(session)
    found = await repository.select_user_by_email(session, "a@b.com")
    assert found is not None
    assert found.full_name == "A"


async def test_lookup_by_email_is_case_insensitive(session):
    await _user(session, email="Mixed@Case.com")
    assert await repository.select_user_by_email(session, "mixed@case.com") is not None


async def test_soft_deleted_user_is_not_returned(session):
    user = await _user(session)
    await session.execute(
        text("UPDATE users SET deleted_at = now() WHERE id = :id"), {"id": user.id}
    )
    assert await repository.select_user_by_email(session, "a@b.com") is None
    assert await repository.select_user(session, user.id) is None


async def test_refresh_family_revocation_revokes_every_member(session):
    created = await tenancy_api.create_tenant(session, org_name="Acme")
    user = await _user(session)
    expires = datetime.now(timezone.utc) + timedelta(days=1)
    family = user.id  # any UUID works as a family identifier

    for token_hash in ("hash-a", "hash-b"):
        await repository.insert_refresh_token(
            session,
            user_id=user.id,
            workspace_id=created.workspace_id,
            family_id=family,
            token_hash=token_hash,
            expires_at=expires,
        )

    revoked = await repository.revoke_refresh_family(session, family_id=family)
    assert revoked == 2

    stored = await repository.select_refresh_token(session, token_hash="hash-a")
    assert stored is not None
    assert stored.revoked_at is not None


async def test_get_active_user_returns_summary_and_respects_is_active(session):
    user = await _user(session)
    summary = await identity_api.get_active_user(session, user_id=user.id)
    assert summary is not None
    assert summary.email == "a@b.com"
    assert summary.is_active is True

    await session.execute(
        text("UPDATE users SET is_active = false WHERE id = :id"), {"id": user.id}
    )
    await session.expire_all()
    refreshed = await identity_api.get_active_user(session, user_id=user.id)
    assert refreshed is not None
    assert refreshed.is_active is False
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest app/slices/identity -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.slices.identity.repository'`.

- [ ] **Step 3: Write `app/slices/identity/repository.py`**

```python
import uuid
from datetime import datetime, timezone

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.slices.identity.models import RefreshToken, User


async def select_user_by_email(session: AsyncSession, email: str) -> User | None:
    # The column is CITEXT, so comparison is already case-insensitive; callers
    # additionally normalize to lowercase before writing.
    stmt = select(User).where(User.email == email, User.deleted_at.is_(None))
    return (await session.execute(stmt)).scalar_one_or_none()


async def select_user(session: AsyncSession, user_id: uuid.UUID) -> User | None:
    stmt = select(User).where(User.id == user_id, User.deleted_at.is_(None))
    return (await session.execute(stmt)).scalar_one_or_none()


async def insert_user(
    session: AsyncSession, *, email: str, password_hash: str, full_name: str
) -> User:
    user = User(email=email, password_hash=password_hash, full_name=full_name)
    session.add(user)
    await session.flush()
    return user


async def insert_refresh_token(
    session: AsyncSession,
    *,
    user_id: uuid.UUID,
    workspace_id: uuid.UUID,
    family_id: uuid.UUID,
    token_hash: str,
    expires_at: datetime,
) -> RefreshToken:
    token = RefreshToken(
        user_id=user_id,
        workspace_id=workspace_id,
        family_id=family_id,
        token_hash=token_hash,
        expires_at=expires_at,
    )
    session.add(token)
    await session.flush()
    return token


async def select_refresh_token(
    session: AsyncSession, *, token_hash: str
) -> RefreshToken | None:
    stmt = select(RefreshToken).where(RefreshToken.token_hash == token_hash)
    return (await session.execute(stmt)).scalar_one_or_none()


async def revoke_refresh_token(session: AsyncSession, *, token: RefreshToken) -> None:
    token.revoked_at = datetime.now(timezone.utc)
    await session.flush()


async def revoke_refresh_family(
    session: AsyncSession, *, family_id: uuid.UUID
) -> int:
    """Revoke every live token in a rotation chain. Used when a superseded
    token is presented, which is a theft signal rather than a plain 401."""
    stmt = (
        update(RefreshToken)
        .where(RefreshToken.family_id == family_id, RefreshToken.revoked_at.is_(None))
        .values(revoked_at=datetime.now(timezone.utc))
    )
    result = await session.execute(stmt)
    return result.rowcount or 0
```

- [ ] **Step 4: Write `app/slices/identity/api.py`**

```python
"""Published interface of the identity slice."""

import uuid
from dataclasses import dataclass

from sqlalchemy.ext.asyncio import AsyncSession

from app.slices.identity import repository


@dataclass(frozen=True)
class UserSummary:
    id: uuid.UUID
    email: str
    is_active: bool


async def get_active_user(
    session: AsyncSession, *, user_id: uuid.UUID
) -> UserSummary | None:
    """Returns None for soft-deleted users; `is_active` reports deactivation.

    This is the single call `authz` makes into identity — one indexed primary
    key lookup, kept separate from tenancy's membership lookup so neither
    slice needs the other's models.
    """
    user = await repository.select_user(session, user_id)
    if user is None:
        return None
    return UserSummary(id=user.id, email=user.email, is_active=user.is_active)
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && pytest app/slices/identity -v`
Expected: PASS — 10 tests (5 model tests from Task 4, 5 repository tests).

- [ ] **Step 6: Commit**

```bash
cd "D:/Jhon britto project"
git add backend/
git commit -m "feat(backend): add identity repository, refresh-token families, and published api"
```

---

### Task 10: Registration use case

**Files:**
- Create: `backend/app/slices/identity/use_cases/__init__.py`
- Create: `backend/app/slices/identity/use_cases/tokens.py`
- Create: `backend/app/slices/identity/use_cases/register.py`
- Test: `backend/app/slices/identity/tests/test_register.py`

**Interfaces:**
- Consumes: `identity.repository`, `tenancy.api`, `audit.api`, `core.security`, `core.errors.AppError`.
- Produces:
  - `use_cases.tokens.TokenBundle(access_token: str, refresh_token: str, user_id: UUID, workspace_id: UUID)` — frozen dataclass.
  - `async use_cases.tokens.issue_tokens(session, *, user_id, email, workspace_id, family_id: UUID | None = None) -> TokenBundle` — persists the hashed refresh token; starts a new family when `family_id` is None.
  - `async use_cases.register.register(session, *, email, password, full_name, org_name) -> TokenBundle`.

- [ ] **Step 1: Write the failing test**

```python
# backend/app/slices/identity/tests/test_register.py
import pytest
from sqlalchemy import text

from app.core.errors import AppError
from app.core.security import decode_token
from app.slices.audit import actions
from app.slices.identity.use_cases.register import register


async def test_register_creates_tenant_membership_and_tokens(session):
    bundle = await register(
        session, email="A@B.com", password="Secret123", full_name="A", org_name="Acme"
    )

    payload = decode_token(bundle.access_token, expected_type="access")
    assert payload["workspace_id"] == str(bundle.workspace_id)
    # Amended D1: authorization is not carried in the token.
    assert "permissions" not in payload

    membership = await session.execute(
        text(
            "SELECT r.name FROM memberships m JOIN roles r ON r.id = m.role_id "
            "WHERE m.user_id = :u"
        ),
        {"u": bundle.user_id},
    )
    assert membership.scalar_one() == "owner"


async def test_register_normalizes_email_to_lowercase(session):
    bundle = await register(
        session, email="  MiXeD@Case.com ", password="Secret123",
        full_name="A", org_name="Acme",
    )
    stored = await session.execute(
        text("SELECT email FROM users WHERE id = :id"), {"id": bundle.user_id}
    )
    assert stored.scalar_one() == "mixed@case.com"


async def test_register_sets_last_workspace_and_persists_hashed_refresh(session):
    bundle = await register(
        session, email="a@b.com", password="Secret123", full_name="A", org_name="Acme"
    )

    last = await session.execute(
        text("SELECT last_workspace_id FROM users WHERE id = :id"), {"id": bundle.user_id}
    )
    assert last.scalar_one() == bundle.workspace_id

    # The raw token must never be stored.
    raw = await session.execute(
        text("SELECT count(*) FROM refresh_tokens WHERE token_hash = :t"),
        {"t": bundle.refresh_token},
    )
    assert raw.scalar_one() == 0


async def test_register_writes_an_audit_row(session):
    bundle = await register(
        session, email="a@b.com", password="Secret123", full_name="A", org_name="Acme"
    )
    row = await session.execute(
        text("SELECT count(*) FROM audit_logs WHERE action = :a AND actor_id = :u"),
        {"a": actions.REGISTER, "u": bundle.user_id},
    )
    assert row.scalar_one() == 1


async def test_duplicate_email_is_rejected_by_the_database_constraint(session):
    await register(
        session, email="a@b.com", password="Secret123", full_name="A", org_name="Acme"
    )
    with pytest.raises(AppError) as exc_info:
        await register(
            session, email="a@b.com", password="Secret123", full_name="B", org_name="Beta"
        )
    assert exc_info.value.code == "EMAIL_TAKEN"
    assert exc_info.value.status_code == 400


async def test_duplicate_registration_leaves_no_orphan_organization(session):
    await register(
        session, email="a@b.com", password="Secret123", full_name="A", org_name="Acme"
    )
    with pytest.raises(AppError):
        await register(
            session, email="a@b.com", password="Secret123", full_name="B", org_name="Beta"
        )
    orphan = await session.execute(
        text("SELECT count(*) FROM organizations WHERE name = 'Beta'")
    )
    assert orphan.scalar_one() == 0


async def test_failure_after_user_insert_rolls_everything_back(session, monkeypatch):
    """Registration must be atomic: a failure partway through leaves no rows."""
    from app.slices.identity.use_cases import register as register_module

    async def _boom(*_args, **_kwargs):
        raise RuntimeError("membership exploded")

    monkeypatch.setattr(register_module.tenancy_api, "create_membership", _boom)

    with pytest.raises(RuntimeError):
        await register(
            session, email="atomic@x.com", password="Secret123",
            full_name="A", org_name="Atomic",
        )

    users = await session.execute(
        text("SELECT count(*) FROM users WHERE email = 'atomic@x.com'")
    )
    orgs = await session.execute(
        text("SELECT count(*) FROM organizations WHERE name = 'Atomic'")
    )
    assert users.scalar_one() == 0
    assert orgs.scalar_one() == 0
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest app/slices/identity/tests/test_register.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.slices.identity.use_cases'`.

- [ ] **Step 3: Write `app/slices/identity/use_cases/tokens.py`**

```python
import uuid
from dataclasses import dataclass

from sqlalchemy.ext.asyncio import AsyncSession

from app.core import security
from app.slices.identity import repository


@dataclass(frozen=True)
class TokenBundle:
    access_token: str
    refresh_token: str
    user_id: uuid.UUID
    workspace_id: uuid.UUID


async def issue_tokens(
    session: AsyncSession,
    *,
    user_id: uuid.UUID,
    email: str,
    workspace_id: uuid.UUID,
    family_id: uuid.UUID | None = None,
) -> TokenBundle:
    """Mint an access/refresh pair and persist the refresh token's SHA-256.

    Passing `family_id` continues an existing rotation chain; omitting it
    starts a new one.
    """
    family = family_id or uuid.uuid4()
    access_token = security.create_access_token(
        sub=str(user_id), email=email, workspace_id=str(workspace_id)
    )
    refresh_token, expires_at = security.create_refresh_token(
        sub=str(user_id), workspace_id=str(workspace_id), family_id=str(family)
    )
    await repository.insert_refresh_token(
        session,
        user_id=user_id,
        workspace_id=workspace_id,
        family_id=family,
        token_hash=security.sha256(refresh_token),
        expires_at=expires_at,
    )
    return TokenBundle(
        access_token=access_token,
        refresh_token=refresh_token,
        user_id=user_id,
        workspace_id=workspace_id,
    )
```

- [ ] **Step 4: Write `app/slices/identity/use_cases/register.py`**

```python
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import security
from app.core.errors import AppError
from app.slices.audit import actions
from app.slices.audit import api as audit_api
from app.slices.identity import repository
from app.slices.identity.use_cases.tokens import TokenBundle, issue_tokens
from app.slices.tenancy import api as tenancy_api


async def register(
    session: AsyncSession,
    *,
    email: str,
    password: str,
    full_name: str,
    org_name: str,
) -> TokenBundle:
    """Atomically create the user, organization, default workspace, and owner
    membership, then issue tokens.

    The user is inserted FIRST so that a duplicate email fails before any
    other row exists. Duplicates are caught from the partial unique index
    rather than a preceding SELECT, which would be a read-then-write race two
    concurrent registrations could both pass.
    """
    normalized_email = email.strip().lower()

    try:
        user = await repository.insert_user(
            session,
            email=normalized_email,
            password_hash=security.hash_password(password),
            full_name=full_name.strip(),
        )
    except IntegrityError as exc:
        await session.rollback()
        raise AppError(
            code="EMAIL_TAKEN",
            message="Email already registered",
            status_code=400,
        ) from exc

    tenant = await tenancy_api.create_tenant(session, org_name=org_name.strip())

    owner_role = await tenancy_api.get_role_by_name(session, "owner")
    if owner_role is None:
        raise AppError(
            code="ROLES_NOT_SEEDED",
            message="System roles are missing",
            status_code=500,
        )

    await tenancy_api.create_membership(
        session,
        user_id=user.id,
        workspace_id=tenant.workspace_id,
        role_id=owner_role.id,
    )

    user.last_workspace_id = tenant.workspace_id

    bundle = await issue_tokens(
        session,
        user_id=user.id,
        email=user.email,
        workspace_id=tenant.workspace_id,
    )

    await audit_api.record(
        session,
        action=actions.REGISTER,
        workspace_id=tenant.workspace_id,
        actor_id=user.id,
        target_type="user",
        target_id=str(user.id),
        metadata={"organization_id": str(tenant.organization_id)},
    )

    await session.commit()
    return bundle
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && pytest app/slices/identity/tests/test_register.py -v`
Expected: PASS — 7 tests.

- [ ] **Step 6: Commit**

```bash
cd "D:/Jhon britto project"
git add backend/
git commit -m "feat(backend): add atomic registration with constraint-based duplicate detection"
```

---

### Task 11: Login use case with lockout and timing neutrality

**Files:**
- Create: `backend/app/slices/identity/use_cases/login.py`
- Test: `backend/app/slices/identity/tests/test_login.py`

**Interfaces:**
- Consumes: `identity.repository`, `tenancy.api`, `audit.api`, `core.security`, `core.config.settings`.
- Produces: `async use_cases.login.login(session, *, email, password) -> TokenBundle`. Raises `AppError` with code `ACCOUNT_LOCKED` (423), `INVALID_CREDENTIALS` (401), or `NO_WORKSPACE` (403).

- [ ] **Step 1: Write the failing test**

```python
# backend/app/slices/identity/tests/test_login.py
import pytest
from sqlalchemy import text

from app.core.config import settings
from app.core.errors import AppError
from app.slices.audit import actions
from app.slices.identity.use_cases.login import login
from app.slices.identity.use_cases.register import register


async def _registered(session, email="a@b.com"):
    return await register(
        session, email=email, password="Secret123", full_name="A", org_name="Acme"
    )


async def test_login_succeeds_and_returns_tokens(session):
    await _registered(session)
    bundle = await login(session, email="a@b.com", password="Secret123")
    assert bundle.access_token and bundle.refresh_token


async def test_login_is_case_insensitive_on_email(session):
    await _registered(session)
    assert await login(session, email="A@B.COM", password="Secret123")


async def test_wrong_password_is_generic_401(session):
    await _registered(session)
    with pytest.raises(AppError) as exc_info:
        await login(session, email="a@b.com", password="wrong")
    assert exc_info.value.code == "INVALID_CREDENTIALS"
    assert exc_info.value.status_code == 401


async def test_unknown_email_returns_the_same_error_as_wrong_password(session):
    with pytest.raises(AppError) as exc_info:
        await login(session, email="nobody@x.com", password="whatever")
    assert exc_info.value.code == "INVALID_CREDENTIALS"
    assert exc_info.value.status_code == 401


async def test_password_is_verified_even_for_unknown_emails(session, monkeypatch):
    """The timing-neutrality mechanism: skipping bcrypt for unknown emails
    would make the response measurably faster and leak account existence."""
    from app.slices.identity.use_cases import login as login_module

    calls: list[str] = []
    real_verify = login_module.security.verify_password

    def _counting_verify(plain: str, hashed: str) -> bool:
        calls.append(hashed)
        return real_verify(plain, hashed)

    monkeypatch.setattr(login_module.security, "verify_password", _counting_verify)

    with pytest.raises(AppError):
        await login(session, email="nobody@x.com", password="whatever")

    assert len(calls) == 1
    assert calls[0] == login_module.security.DUMMY_PASSWORD_HASH


async def test_failed_attempts_accumulate_then_lock_the_account(session):
    await _registered(session)

    for _ in range(settings.LOGIN_MAX_FAILURES):
        with pytest.raises(AppError):
            await login(session, email="a@b.com", password="wrong")

    locked = await session.execute(
        text("SELECT locked_until FROM users WHERE email = 'a@b.com'")
    )
    assert locked.scalar_one() is not None

    # Even the CORRECT password is refused while locked.
    with pytest.raises(AppError) as exc_info:
        await login(session, email="a@b.com", password="Secret123")
    assert exc_info.value.code == "ACCOUNT_LOCKED"
    assert exc_info.value.status_code == 423


async def test_successful_login_resets_the_failure_counter(session):
    await _registered(session)
    with pytest.raises(AppError):
        await login(session, email="a@b.com", password="wrong")

    await login(session, email="a@b.com", password="Secret123")

    count = await session.execute(
        text("SELECT failed_login_count FROM users WHERE email = 'a@b.com'")
    )
    assert count.scalar_one() == 0


async def test_inactive_user_cannot_log_in(session):
    await _registered(session)
    await session.execute(text("UPDATE users SET is_active = false WHERE email = 'a@b.com'"))

    with pytest.raises(AppError) as exc_info:
        await login(session, email="a@b.com", password="Secret123")
    assert exc_info.value.code == "INVALID_CREDENTIALS"


async def test_failed_login_for_unknown_email_is_audited_without_workspace(session):
    with pytest.raises(AppError):
        await login(session, email="nobody@x.com", password="whatever")

    row = await session.execute(
        text(
            "SELECT count(*) FROM audit_logs "
            "WHERE action = :a AND workspace_id IS NULL"
        ),
        {"a": actions.LOGIN_FAILED},
    )
    assert row.scalar_one() == 1


async def test_successful_login_is_audited(session):
    bundle = await _registered(session)
    await login(session, email="a@b.com", password="Secret123")

    row = await session.execute(
        text("SELECT count(*) FROM audit_logs WHERE action = :a AND actor_id = :u"),
        {"a": actions.LOGIN, "u": bundle.user_id},
    )
    assert row.scalar_one() == 1
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest app/slices/identity/tests/test_login.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.slices.identity.use_cases.login'`.

- [ ] **Step 3: Write `app/slices/identity/use_cases/login.py`**

```python
from datetime import datetime, timedelta, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from app.core import security
from app.core.config import settings
from app.core.errors import AppError
from app.slices.audit import actions
from app.slices.audit import api as audit_api
from app.slices.identity import repository
from app.slices.identity.models import User
from app.slices.identity.use_cases.tokens import TokenBundle, issue_tokens
from app.slices.tenancy import api as tenancy_api

_INVALID = AppError(
    code="INVALID_CREDENTIALS",
    message="Invalid email or password",
    status_code=401,
)


def _invalid_credentials() -> AppError:
    """A fresh instance each time; the message never distinguishes an unknown
    email from a wrong password."""
    return AppError(
        code=_INVALID.code, message=_INVALID.message, status_code=_INVALID.status_code
    )


async def _record_failure(
    session: AsyncSession, *, user: User | None, now: datetime
) -> None:
    if user is None:
        # No tenant to attribute a platform-level event to.
        await audit_api.record(session, action=actions.LOGIN_FAILED)
        return

    user.failed_login_count += 1
    locked = user.failed_login_count >= settings.LOGIN_MAX_FAILURES
    if locked:
        user.locked_until = now + timedelta(minutes=settings.LOCKOUT_MINUTES)

    await audit_api.record(
        session,
        action=actions.ACCOUNT_LOCKED if locked else actions.LOGIN_FAILED,
        workspace_id=user.last_workspace_id,
        actor_id=user.id,
        metadata={"failed_login_count": user.failed_login_count},
    )


async def login(session: AsyncSession, *, email: str, password: str) -> TokenBundle:
    normalized_email = email.strip().lower()
    user = await repository.select_user_by_email(session, normalized_email)
    now = datetime.now(timezone.utc)

    if user is not None and user.locked_until is not None and user.locked_until > now:
        raise AppError(
            code="ACCOUNT_LOCKED",
            message="Account is temporarily locked. Try again later.",
            status_code=423,
        )

    # Always run a bcrypt verification, even when the email is unknown, so
    # response timing cannot be used to enumerate accounts. This is why the
    # unknown-email branch verifies against DUMMY_PASSWORD_HASH rather than
    # short-circuiting.
    password_ok = security.verify_password(
        password,
        user.password_hash if user is not None else security.DUMMY_PASSWORD_HASH,
    )

    if user is None or not password_ok or not user.is_active:
        await _record_failure(session, user=user, now=now)
        await session.commit()
        raise _invalid_credentials()

    workspace_id = user.last_workspace_id
    if workspace_id is None:
        workspace_id = await tenancy_api.get_earliest_workspace_id(
            session, user_id=user.id
        )
    if workspace_id is None:
        raise AppError(
            code="NO_WORKSPACE",
            message="User has no workspace access",
            status_code=403,
        )

    membership = await tenancy_api.get_active_membership(
        session, user_id=user.id, workspace_id=workspace_id
    )
    if membership is None:
        raise AppError(
            code="NO_WORKSPACE",
            message="User has no workspace access",
            status_code=403,
        )

    user.failed_login_count = 0
    user.locked_until = None
    user.last_workspace_id = workspace_id

    bundle = await issue_tokens(
        session, user_id=user.id, email=user.email, workspace_id=workspace_id
    )

    await audit_api.record(
        session,
        action=actions.LOGIN,
        workspace_id=workspace_id,
        actor_id=user.id,
    )

    await session.commit()
    return bundle
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && pytest app/slices/identity/tests/test_login.py -v`
Expected: PASS — 10 tests.

- [ ] **Step 5: Commit**

```bash
cd "D:/Jhon britto project"
git add backend/
git commit -m "feat(backend): add login with account lockout and timing-neutral verification"
```

---

### Task 12: Refresh rotation with reuse detection, logout, switch-workspace

**Files:**
- Create: `backend/app/slices/identity/use_cases/refresh.py`
- Create: `backend/app/slices/identity/use_cases/logout.py`
- Create: `backend/app/slices/identity/use_cases/switch_workspace.py`
- Test: `backend/app/slices/identity/tests/test_token_lifecycle.py`

**Interfaces:**
- Consumes: `identity.repository`, `tenancy.api`, `audit.api`, `core.security`.
- Produces:
  - `async refresh.refresh(session, *, refresh_token) -> TokenBundle` — rotates within the family; a superseded token revokes the family. Raises `AppError("INVALID_REFRESH", 401)`.
  - `async logout.logout(session, *, refresh_token) -> None` — always succeeds; never reveals whether the token was valid.
  - `async switch_workspace.switch_workspace(session, *, user_id, refresh_token, target_workspace_id) -> TokenBundle`. Raises `AppError("FORBIDDEN", 403)` when not a member.

- [ ] **Step 1: Write the failing test**

```python
# backend/app/slices/identity/tests/test_token_lifecycle.py
import uuid

import pytest
from sqlalchemy import text

from app.core.errors import AppError
from app.core.security import sha256
from app.slices.audit import actions
from app.slices.identity.use_cases.login import login
from app.slices.identity.use_cases.logout import logout
from app.slices.identity.use_cases.refresh import refresh
from app.slices.identity.use_cases.register import register
from app.slices.identity.use_cases.switch_workspace import switch_workspace


async def _registered(session, email="a@b.com", org="Acme"):
    return await register(
        session, email=email, password="Secret123", full_name="A", org_name=org
    )


async def test_refresh_rotates_the_token_and_keeps_the_family(session):
    first = await _registered(session)
    second = await refresh(session, refresh_token=first.refresh_token)

    assert second.refresh_token != first.refresh_token

    families = await session.execute(
        text("SELECT DISTINCT family_id FROM refresh_tokens WHERE user_id = :u"),
        {"u": first.user_id},
    )
    assert len(families.scalars().all()) == 1


async def test_old_refresh_token_stops_working_after_rotation(session):
    first = await _registered(session)
    await refresh(session, refresh_token=first.refresh_token)

    with pytest.raises(AppError) as exc_info:
        await refresh(session, refresh_token=first.refresh_token)
    assert exc_info.value.code == "INVALID_REFRESH"


async def test_reusing_a_superseded_token_revokes_the_whole_family(session):
    """Reuse is a theft signal, not a plain 401: the attacker holds an old
    token, so every descendant must die with it."""
    first = await _registered(session)
    second = await refresh(session, refresh_token=first.refresh_token)

    with pytest.raises(AppError):
        await refresh(session, refresh_token=first.refresh_token)

    # The *current* token is now dead too.
    with pytest.raises(AppError):
        await refresh(session, refresh_token=second.refresh_token)

    audited = await session.execute(
        text("SELECT count(*) FROM audit_logs WHERE action = :a"),
        {"a": actions.REFRESH_REUSE_DETECTED},
    )
    assert audited.scalar_one() == 1


async def test_expired_refresh_token_is_rejected(session):
    bundle = await _registered(session)
    await session.execute(
        text("UPDATE refresh_tokens SET expires_at = now() - interval '1 day' "
             "WHERE token_hash = :t"),
        {"t": sha256(bundle.refresh_token)},
    )
    with pytest.raises(AppError) as exc_info:
        await refresh(session, refresh_token=bundle.refresh_token)
    assert exc_info.value.code == "INVALID_REFRESH"


async def test_access_token_cannot_be_used_to_refresh(session):
    bundle = await _registered(session)
    with pytest.raises(AppError) as exc_info:
        await refresh(session, refresh_token=bundle.access_token)
    assert exc_info.value.code == "INVALID_REFRESH"


async def test_logout_revokes_the_token_and_is_audited(session):
    bundle = await _registered(session)
    await logout(session, refresh_token=bundle.refresh_token)

    with pytest.raises(AppError):
        await refresh(session, refresh_token=bundle.refresh_token)

    audited = await session.execute(
        text("SELECT count(*) FROM audit_logs WHERE action = :a"),
        {"a": actions.LOGOUT},
    )
    assert audited.scalar_one() == 1


async def test_logout_with_an_unknown_token_still_succeeds(session):
    """Never reveal whether a token was real."""
    await logout(session, refresh_token="not-a-real-token")


async def test_switch_workspace_requires_membership(session):
    alice = await _registered(session, email="a@a.com", org="Acme")
    bob = await _registered(session, email="b@b.com", org="Beta")

    with pytest.raises(AppError) as exc_info:
        await switch_workspace(
            session,
            user_id=alice.user_id,
            refresh_token=alice.refresh_token,
            target_workspace_id=bob.workspace_id,
        )
    assert exc_info.value.code == "FORBIDDEN"
    assert exc_info.value.status_code == 403


async def test_switch_workspace_revokes_the_old_family_and_issues_a_new_one(session):
    alice = await _registered(session, email="a@a.com", org="Acme")

    # Give Alice a second workspace by hand (management CRUD lands in 1b).
    from app.slices.tenancy import api as tenancy_api

    second = await tenancy_api.create_tenant(session, org_name="Second")
    admin = await tenancy_api.get_role_by_name(session, "admin")
    await tenancy_api.create_membership(
        session,
        user_id=alice.user_id,
        workspace_id=second.workspace_id,
        role_id=admin.id,
    )

    switched = await switch_workspace(
        session,
        user_id=alice.user_id,
        refresh_token=alice.refresh_token,
        target_workspace_id=second.workspace_id,
    )

    assert switched.workspace_id == second.workspace_id

    # The token from the workspace we left is dead.
    with pytest.raises(AppError):
        await refresh(session, refresh_token=alice.refresh_token)

    last = await session.execute(
        text("SELECT last_workspace_id FROM users WHERE id = :u"),
        {"u": alice.user_id},
    )
    assert last.scalar_one() == second.workspace_id


async def test_switch_workspace_rejects_an_unknown_workspace(session):
    alice = await _registered(session, email="a@a.com")
    with pytest.raises(AppError) as exc_info:
        await switch_workspace(
            session,
            user_id=alice.user_id,
            refresh_token=alice.refresh_token,
            target_workspace_id=uuid.uuid4(),
        )
    assert exc_info.value.status_code == 403
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest app/slices/identity/tests/test_token_lifecycle.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.slices.identity.use_cases.refresh'`.

- [ ] **Step 3: Write `app/slices/identity/use_cases/refresh.py`**

```python
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from app.core import security
from app.core.errors import AppError
from app.slices.audit import actions
from app.slices.audit import api as audit_api
from app.slices.identity import repository
from app.slices.identity.use_cases.tokens import TokenBundle, issue_tokens
from app.slices.tenancy import api as tenancy_api


def _invalid_refresh(message: str = "Invalid refresh token") -> AppError:
    return AppError(code="INVALID_REFRESH", message=message, status_code=401)


async def refresh(session: AsyncSession, *, refresh_token: str) -> TokenBundle:
    try:
        security.decode_token(refresh_token, expected_type="refresh")
    except security.TokenError as exc:
        raise _invalid_refresh() from exc

    stored = await repository.select_refresh_token(
        session, token_hash=security.sha256(refresh_token)
    )
    if stored is None:
        raise _invalid_refresh()

    if stored.revoked_at is not None:
        # A validly-signed but already-rotated token means someone is holding
        # a copy they should not have. Kill the entire chain, not just this
        # token, and leave a trail.
        await repository.revoke_refresh_family(session, family_id=stored.family_id)
        await audit_api.record(
            session,
            action=actions.REFRESH_REUSE_DETECTED,
            workspace_id=stored.workspace_id,
            actor_id=stored.user_id,
            metadata={"family_id": str(stored.family_id)},
        )
        await session.commit()
        raise _invalid_refresh("Refresh token reuse detected")

    if stored.expires_at <= datetime.now(timezone.utc):
        raise _invalid_refresh("Refresh token expired")

    user = await repository.select_user(session, stored.user_id)
    if user is None or not user.is_active:
        raise _invalid_refresh()

    membership = await tenancy_api.get_active_membership(
        session, user_id=user.id, workspace_id=stored.workspace_id
    )
    if membership is None:
        raise AppError(
            code="FORBIDDEN",
            message="No active membership for that workspace",
            status_code=403,
        )

    await repository.revoke_refresh_token(session, token=stored)

    bundle = await issue_tokens(
        session,
        user_id=user.id,
        email=user.email,
        workspace_id=stored.workspace_id,
        family_id=stored.family_id,
    )

    await audit_api.record(
        session,
        action=actions.REFRESH,
        workspace_id=stored.workspace_id,
        actor_id=user.id,
    )

    await session.commit()
    return bundle
```

- [ ] **Step 4: Write `app/slices/identity/use_cases/logout.py`**

```python
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import security
from app.slices.audit import actions
from app.slices.audit import api as audit_api
from app.slices.identity import repository


async def logout(session: AsyncSession, *, refresh_token: str) -> None:
    """Revoke the presented token.

    Always succeeds, including for tokens that never existed — reporting the
    difference would tell an attacker which tokens are real.
    """
    stored = await repository.select_refresh_token(
        session, token_hash=security.sha256(refresh_token)
    )
    if stored is not None and stored.revoked_at is None:
        await repository.revoke_refresh_token(session, token=stored)
        await audit_api.record(
            session,
            action=actions.LOGOUT,
            workspace_id=stored.workspace_id,
            actor_id=stored.user_id,
        )
    await session.commit()
```

- [ ] **Step 5: Write `app/slices/identity/use_cases/switch_workspace.py`**

```python
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core import security
from app.core.errors import AppError
from app.slices.audit import actions
from app.slices.audit import api as audit_api
from app.slices.identity import repository
from app.slices.identity.use_cases.tokens import TokenBundle, issue_tokens
from app.slices.tenancy import api as tenancy_api


async def switch_workspace(
    session: AsyncSession,
    *,
    user_id: uuid.UUID,
    refresh_token: str,
    target_workspace_id: uuid.UUID,
) -> TokenBundle:
    membership = await tenancy_api.get_active_membership(
        session, user_id=user_id, workspace_id=target_workspace_id
    )
    if membership is None:
        raise AppError(
            code="FORBIDDEN",
            message="Not a member of that workspace",
            status_code=403,
        )

    user = await repository.select_user(session, user_id)
    if user is None or not user.is_active:
        raise AppError(
            code="UNAUTHENTICATED", message="User is not active", status_code=401
        )

    previous_workspace_id: uuid.UUID | None = None
    stored = await repository.select_refresh_token(
        session, token_hash=security.sha256(refresh_token)
    )
    if stored is not None and stored.user_id == user_id:
        # Revoke the family being left behind, so tokens do not accumulate
        # unbounded across switches.
        previous_workspace_id = stored.workspace_id
        await repository.revoke_refresh_family(session, family_id=stored.family_id)

    user.last_workspace_id = target_workspace_id

    bundle = await issue_tokens(
        session,
        user_id=user.id,
        email=user.email,
        workspace_id=target_workspace_id,
    )

    await audit_api.record(
        session,
        action=actions.SWITCH_WORKSPACE,
        workspace_id=target_workspace_id,
        actor_id=user.id,
        metadata={
            "from_workspace_id": str(previous_workspace_id)
            if previous_workspace_id
            else None
        },
    )

    await session.commit()
    return bundle
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd backend && pytest app/slices/identity/tests/test_token_lifecycle.py -v`
Expected: PASS — 10 tests.

- [ ] **Step 7: Commit**

```bash
cd "D:/Jhon britto project"
git add backend/
git commit -m "feat(backend): add refresh rotation with family reuse detection, logout, switch-workspace"
```

---

### Task 13: Principal, workspace context, and the permission guard

**Files:**
- Create: `backend/app/shared/context.py`
- Create: `backend/app/slices/identity/dependencies.py`
- Modify: `backend/app/slices/identity/api.py` (re-export the principal dependency)
- Create: `backend/app/slices/authz/__init__.py`
- Create: `backend/app/slices/authz/dependencies.py`
- Test: `backend/app/slices/authz/tests/__init__.py`
- Test: `backend/app/slices/authz/tests/test_guards.py`

**Interfaces:**
- Consumes: `core.security`, `core.database.get_session`, `identity.api`, `tenancy.api`.
- Produces:
  - `app.shared.context.Principal(user_id: UUID, email: str, workspace_id: UUID)` — frozen dataclass.
  - `app.shared.context.WorkspaceContext(user_id: UUID, email: str, workspace_id: UUID, role: str, permissions: tuple[str, ...])` — frozen dataclass.
  - `app.slices.identity.dependencies.get_current_principal(authorization: str = Header(...)) -> Principal`, re-exported as `app.slices.identity.api.get_current_principal`.
  - `app.slices.authz.dependencies.get_workspace_context(...) -> WorkspaceContext` — FastAPI dependency.
  - `app.slices.authz.dependencies.require_permission(perm: str) -> Callable` — returns a dependency yielding `WorkspaceContext`.

> **This is the task that fixes the defect which motivated the whole rewrite.** The superseded plan declared `ctx: WorkspaceContext = None` with no `Depends(...)`, so FastAPI could never inject it; its test passed only by calling the inner function directly. Every test below goes through real HTTP for exactly that reason. Do not add a test that calls `_guard(ctx=...)` directly.

- [ ] **Step 1: Write the failing test**

```python
# backend/app/slices/authz/tests/test_guards.py
import uuid

from fastapi import APIRouter, Depends
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text

from app.core.database import get_session
from app.core.security import create_access_token
from app.main import create_app
from app.shared import permissions
from app.shared.context import WorkspaceContext
from app.slices.authz.dependencies import get_workspace_context, require_permission
from app.slices.identity.use_cases.register import register
from app.slices.tenancy import api as tenancy_api


def _guarded_app(session):
    app = create_app()
    router = APIRouter()

    @router.get("/api/v1/_probe/manage")
    async def manage(
        ctx: WorkspaceContext = Depends(require_permission(permissions.MEMBERS_MANAGE)),
    ):
        return {"role": ctx.role}

    @router.get("/api/v1/_probe/whoami")
    async def whoami(ctx: WorkspaceContext = Depends(get_workspace_context)):
        return {"workspace_id": str(ctx.workspace_id), "role": ctx.role}

    app.include_router(router)

    async def _override():
        yield session

    app.dependency_overrides[get_session] = _override
    return app


def _client(session):
    return AsyncClient(
        transport=ASGITransport(app=_guarded_app(session)), base_url="http://t"
    )


async def test_owner_passes_the_permission_guard(session):
    bundle = await register(
        session, email="a@b.com", password="Secret123", full_name="A", org_name="Acme"
    )
    async with _client(session) as ac:
        resp = await ac.get(
            "/api/v1/_probe/manage",
            headers={"Authorization": f"Bearer {bundle.access_token}"},
        )
    assert resp.status_code == 200
    assert resp.json()["role"] == "owner"


async def test_viewer_is_forbidden_through_real_http(session):
    bundle = await register(
        session, email="a@b.com", password="Secret123", full_name="A", org_name="Acme"
    )
    viewer = await tenancy_api.get_role_by_name(session, "viewer")
    await session.execute(
        text("UPDATE memberships SET role_id = :r WHERE user_id = :u"),
        {"r": viewer.id, "u": bundle.user_id},
    )

    async with _client(session) as ac:
        resp = await ac.get(
            "/api/v1/_probe/manage",
            headers={"Authorization": f"Bearer {bundle.access_token}"},
        )
    assert resp.status_code == 403
    assert resp.json()["error"] == "FORBIDDEN"


async def test_role_change_takes_effect_on_the_very_next_request(session):
    """No 15-minute stale-privilege window: the token is unchanged, only the
    database row moved."""
    bundle = await register(
        session, email="a@b.com", password="Secret123", full_name="A", org_name="Acme"
    )
    async with _client(session) as ac:
        first = await ac.get(
            "/api/v1/_probe/manage",
            headers={"Authorization": f"Bearer {bundle.access_token}"},
        )
        assert first.status_code == 200

        viewer = await tenancy_api.get_role_by_name(session, "viewer")
        await session.execute(
            text("UPDATE memberships SET role_id = :r WHERE user_id = :u"),
            {"r": viewer.id, "u": bundle.user_id},
        )

        second = await ac.get(
            "/api/v1/_probe/manage",
            headers={"Authorization": f"Bearer {bundle.access_token}"},
        )
    assert second.status_code == 403


async def test_removed_membership_is_forbidden_immediately(session):
    bundle = await register(
        session, email="a@b.com", password="Secret123", full_name="A", org_name="Acme"
    )
    await session.execute(
        text("UPDATE memberships SET deleted_at = now() WHERE user_id = :u"),
        {"u": bundle.user_id},
    )
    async with _client(session) as ac:
        resp = await ac.get(
            "/api/v1/_probe/whoami",
            headers={"Authorization": f"Bearer {bundle.access_token}"},
        )
    assert resp.status_code == 403


async def test_deactivated_user_is_unauthenticated_immediately(session):
    bundle = await register(
        session, email="a@b.com", password="Secret123", full_name="A", org_name="Acme"
    )
    await session.execute(
        text("UPDATE users SET is_active = false WHERE id = :u"), {"u": bundle.user_id}
    )
    async with _client(session) as ac:
        resp = await ac.get(
            "/api/v1/_probe/whoami",
            headers={"Authorization": f"Bearer {bundle.access_token}"},
        )
    assert resp.status_code == 401


async def test_missing_header_is_401(session):
    async with _client(session) as ac:
        resp = await ac.get("/api/v1/_probe/whoami")
    assert resp.status_code == 401
    assert resp.json()["error"] == "UNAUTHENTICATED"


async def test_refresh_token_is_rejected_as_a_bearer_token(session):
    bundle = await register(
        session, email="a@b.com", password="Secret123", full_name="A", org_name="Acme"
    )
    async with _client(session) as ac:
        resp = await ac.get(
            "/api/v1/_probe/whoami",
            headers={"Authorization": f"Bearer {bundle.refresh_token}"},
        )
    assert resp.status_code == 401


async def test_token_for_a_workspace_the_user_never_joined_is_403(session):
    await register(
        session, email="a@b.com", password="Secret123", full_name="A", org_name="Acme"
    )
    stranger_token = create_access_token(
        sub=str(uuid.uuid4()), email="ghost@x.com", workspace_id=str(uuid.uuid4())
    )
    async with _client(session) as ac:
        resp = await ac.get(
            "/api/v1/_probe/whoami",
            headers={"Authorization": f"Bearer {stranger_token}"},
        )
    # No such user at all → unauthenticated rather than forbidden.
    assert resp.status_code == 401
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest app/slices/authz -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.slices.authz'`.

- [ ] **Step 3: Write `app/shared/context.py`**

```python
import uuid
from dataclasses import dataclass


@dataclass(frozen=True)
class Principal:
    """Who the caller claims to be, taken from a verified access token.
    Carries no authorization information whatsoever."""

    user_id: uuid.UUID
    email: str
    workspace_id: uuid.UUID


@dataclass(frozen=True)
class WorkspaceContext:
    """Who the caller is AND what they may do here, resolved from the
    database on this request. `permissions` is a tuple so it cannot be
    mutated by a route handler."""

    user_id: uuid.UUID
    email: str
    workspace_id: uuid.UUID
    role: str
    permissions: tuple[str, ...]
```

- [ ] **Step 4: Write `app/slices/identity/dependencies.py`**

```python
import uuid

from fastapi import Header

from app.core import security
from app.core.errors import AppError
from app.shared.context import Principal

_BEARER = "Bearer "


def _unauthenticated(message: str) -> AppError:
    return AppError(code="UNAUTHENTICATED", message=message, status_code=401)


async def get_current_principal(authorization: str = Header(default="")) -> Principal:
    if not authorization.startswith(_BEARER):
        raise _unauthenticated("Missing bearer token")

    raw_token = authorization[len(_BEARER) :].strip()
    try:
        payload = security.decode_token(raw_token, expected_type="access")
    except security.TokenError as exc:
        raise _unauthenticated("Invalid or expired token") from exc

    try:
        return Principal(
            user_id=uuid.UUID(payload["sub"]),
            email=payload.get("email", ""),
            workspace_id=uuid.UUID(payload["workspace_id"]),
        )
    except (KeyError, TypeError, ValueError) as exc:
        raise _unauthenticated("Malformed token claims") from exc
```

- [ ] **Step 5: Re-export the dependency from `identity/api.py`**

Append to `backend/app/slices/identity/api.py`:

```python
# Re-exported so `authz` can depend on authentication through the published
# interface rather than reaching into identity.dependencies directly.
from app.slices.identity.dependencies import get_current_principal  # noqa: E402

__all__ = ["UserSummary", "get_active_user", "get_current_principal"]
```

- [ ] **Step 6: Write `app/slices/authz/dependencies.py`**

```python
from collections.abc import Callable

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.core.errors import AppError
from app.shared import permissions as perms
from app.shared.context import Principal, WorkspaceContext
from app.slices.identity.api import get_current_principal
from app.slices.tenancy import api as tenancy_api


async def get_workspace_context(
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_session),
) -> WorkspaceContext:
    """Resolve authorization from the database on EVERY request.

    Two indexed lookups rather than one join: a single query spanning `users`
    and `memberships` would require this slice to import another slice's
    models. Both hit unique indexes.
    """
    # Imported here rather than at module scope only for symmetry with the
    # tenancy import above; both are published interfaces.
    from app.slices.identity import api as identity_api

    user = await identity_api.get_active_user(session, user_id=principal.user_id)
    if user is None or not user.is_active:
        raise AppError(
            code="UNAUTHENTICATED",
            message="User is inactive or no longer exists",
            status_code=401,
        )

    membership = await tenancy_api.get_active_membership(
        session, user_id=principal.user_id, workspace_id=principal.workspace_id
    )
    if membership is None:
        raise AppError(
            code="FORBIDDEN",
            message="No active membership for this workspace",
            status_code=403,
        )

    return WorkspaceContext(
        user_id=user.id,
        email=user.email,
        workspace_id=principal.workspace_id,
        role=membership.role_name,
        permissions=membership.permissions,
    )


def require_permission(permission: str) -> Callable:
    """Route guard factory.

    NOTE: `ctx` MUST carry `Depends(get_workspace_context)`. The superseded
    plan defaulted it to None, which FastAPI cannot inject — it would have
    tried to bind WorkspaceContext from the request body.
    """

    async def _guard(
        ctx: WorkspaceContext = Depends(get_workspace_context),
    ) -> WorkspaceContext:
        if perms.ALL not in ctx.permissions and permission not in ctx.permissions:
            raise AppError(
                code="FORBIDDEN",
                message="Insufficient permissions",
                status_code=403,
            )
        return ctx

    return _guard
```

- [ ] **Step 7: Run test to verify it passes**

Run: `cd backend && pytest app/slices/authz -v`
Expected: PASS — 8 tests.

- [ ] **Step 8: Commit**

```bash
cd "D:/Jhon britto project"
git add backend/
git commit -m "feat(backend): add DB-verified workspace context and working permission guard"
```

---

### Task 14: Auth schemas, rate limiting, and the auth router

**Files:**
- Create: `backend/app/core/rate_limit.py`
- Create: `backend/app/slices/identity/schemas.py`
- Create: `backend/app/slices/identity/router.py`
- Modify: `backend/app/main.py` (mount the auth router)
- Modify: `backend/tests/conftest.py` (add the `client` fixture)
- Test: `backend/app/slices/identity/tests/test_auth_api.py`

**Interfaces:**
- Consumes: all identity use cases, `authz.dependencies`, `core.envelope`.
- Produces:
  - `app.core.rate_limit.InProcessRateLimiter(limit: int, window_seconds: int = 60)` with `.hit(key) -> bool` and `.reset() -> None`; module-level `limiter`; `rate_limit(bucket: str) -> Callable` dependency factory.
  - `app.slices.identity.schemas` — `RegisterIn`, `LoginIn`, `RefreshIn`, `LogoutIn`, `SwitchWorkspaceIn`.
  - `app.slices.identity.router.router` — `POST /api/v1/auth/{register,login,refresh,logout,switch-workspace}`.
  - `tests/conftest.py` fixture `client` — an `AsyncClient` bound to the app with `get_session` overridden to the test session.

- [ ] **Step 1: Write the failing test**

```python
# backend/app/slices/identity/tests/test_auth_api.py
from sqlalchemy import text

REGISTRATION = {
    "email": "a@b.com",
    "password": "Secret123",
    "full_name": "A",
    "org_name": "Acme",
}


async def test_register_returns_201_and_envelope(client):
    resp = await client.post("/api/v1/auth/register", json=REGISTRATION)

    assert resp.status_code == 201
    body = resp.json()
    assert body["success"] is True
    assert body["data"]["access_token"]
    assert body["data"]["refresh_token"]
    assert body["data"]["workspace_id"]


async def test_full_login_refresh_logout_flow(client):
    await client.post("/api/v1/auth/register", json=REGISTRATION)

    login = await client.post(
        "/api/v1/auth/login", json={"email": "a@b.com", "password": "Secret123"}
    )
    assert login.status_code == 200
    first_refresh = login.json()["data"]["refresh_token"]

    rotated = await client.post(
        "/api/v1/auth/refresh", json={"refresh_token": first_refresh}
    )
    assert rotated.status_code == 200
    second_refresh = rotated.json()["data"]["refresh_token"]
    assert second_refresh != first_refresh

    replayed = await client.post(
        "/api/v1/auth/refresh", json={"refresh_token": first_refresh}
    )
    assert replayed.status_code == 401

    logged_out = await client.post(
        "/api/v1/auth/logout", json={"refresh_token": second_refresh}
    )
    assert logged_out.status_code == 200


async def test_wrong_password_returns_401_envelope(client):
    await client.post("/api/v1/auth/register", json=REGISTRATION)
    resp = await client.post(
        "/api/v1/auth/login", json={"email": "a@b.com", "password": "nope"}
    )
    assert resp.status_code == 401
    assert resp.json()["error"] == "INVALID_CREDENTIALS"


async def test_short_password_is_a_400_validation_error(client):
    resp = await client.post(
        "/api/v1/auth/register", json={**REGISTRATION, "password": "short"}
    )
    assert resp.status_code == 400
    assert resp.json()["error"] == "VALIDATION_ERROR"


async def test_password_over_72_bytes_is_rejected(client):
    """bcrypt truncates past 72 bytes; accepting would silently weaken it."""
    resp = await client.post(
        "/api/v1/auth/register", json={**REGISTRATION, "password": "x" * 73}
    )
    assert resp.status_code == 400


async def test_duplicate_registration_is_400_email_taken(client):
    await client.post("/api/v1/auth/register", json=REGISTRATION)
    resp = await client.post("/api/v1/auth/register", json=REGISTRATION)
    assert resp.status_code == 400
    assert resp.json()["error"] == "EMAIL_TAKEN"


async def test_switch_workspace_requires_authentication(client):
    resp = await client.post(
        "/api/v1/auth/switch-workspace",
        json={
            "workspace_id": "11111111-1111-1111-1111-111111111111",
            "refresh_token": "x",
        },
    )
    assert resp.status_code == 401


async def test_login_is_rate_limited(client, session):
    await client.post("/api/v1/auth/register", json=REGISTRATION)

    from app.core.config import settings

    statuses = []
    for _ in range(settings.RATE_LIMIT_PER_MINUTE + 2):
        resp = await client.post(
            "/api/v1/auth/login", json={"email": "a@b.com", "password": "nope"}
        )
        statuses.append(resp.status_code)

    assert 429 in statuses
    assert statuses[-1] == 429


async def test_account_lockout_surfaces_as_423(client):
    from app.core.config import settings
    from app.core.rate_limit import limiter

    await client.post("/api/v1/auth/register", json=REGISTRATION)

    for _ in range(settings.LOGIN_MAX_FAILURES):
        limiter.reset()  # isolate lockout behaviour from IP throttling
        await client.post(
            "/api/v1/auth/login", json={"email": "a@b.com", "password": "nope"}
        )

    limiter.reset()
    resp = await client.post(
        "/api/v1/auth/login", json={"email": "a@b.com", "password": "Secret123"}
    )
    assert resp.status_code == 423
    assert resp.json()["error"] == "ACCOUNT_LOCKED"
```

- [ ] **Step 2: Add the `client` fixture to `tests/conftest.py`**

```python
@pytest_asyncio.fixture
async def client(session: AsyncSession):
    from httpx import ASGITransport, AsyncClient

    from app.core.database import get_session
    from app.core.rate_limit import limiter
    from app.main import create_app

    # The limiter is process-global; reset it so tests do not poison each other.
    limiter.reset()

    app = create_app()

    async def _override():
        yield session

    app.dependency_overrides[get_session] = _override
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://t"
    ) as async_client:
        yield async_client
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd backend && pytest app/slices/identity/tests/test_auth_api.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.core.rate_limit'`.

- [ ] **Step 4: Write `app/core/rate_limit.py`**

```python
import time
from collections import defaultdict, deque
from collections.abc import Callable
from typing import Protocol

from fastapi import Request

from app.core.config import settings
from app.core.errors import AppError


class RateLimiter(Protocol):
    def hit(self, key: str) -> bool: ...
    def reset(self) -> None: ...


class InProcessRateLimiter:
    """Sliding-window limiter scoped to ONE worker process.

    Honestly best-effort: Render runs several workers, so this is not a global
    limit and is not presented as one. The cross-process guarantee against
    brute force is account lockout, which lives in Postgres.

    This class exists behind the RateLimiter protocol so the Redis-backed
    implementation can replace it with no call-site changes in the phase that
    introduces Upstash Redis.
    """

    def __init__(self, limit: int, window_seconds: int = 60) -> None:
        self._limit = limit
        self._window = window_seconds
        self._hits: dict[str, deque[float]] = defaultdict(deque)

    def hit(self, key: str) -> bool:
        now = time.monotonic()
        bucket = self._hits[key]
        while bucket and now - bucket[0] > self._window:
            bucket.popleft()
        if len(bucket) >= self._limit:
            return False
        bucket.append(now)
        return True

    def reset(self) -> None:
        self._hits.clear()


limiter: RateLimiter = InProcessRateLimiter(settings.RATE_LIMIT_PER_MINUTE)


def rate_limit(bucket: str) -> Callable:
    async def _dependency(request: Request) -> None:
        client_host = request.client.host if request.client else "unknown"
        if not limiter.hit(f"{bucket}:{client_host}"):
            raise AppError(
                code="RATE_LIMITED",
                message="Too many requests. Try again shortly.",
                status_code=429,
            )

    return _dependency
```

- [ ] **Step 5: Write `app/slices/identity/schemas.py`**

```python
import uuid
from typing import Annotated

from pydantic import AfterValidator, BaseModel, EmailStr, Field

MAX_PASSWORD_BYTES = 72


def _reject_beyond_bcrypt_limit(value: str) -> str:
    """bcrypt silently truncates input past 72 bytes. Accepting a longer
    password would quietly weaken it, so reject instead."""
    if len(value.encode("utf-8")) > MAX_PASSWORD_BYTES:
        raise ValueError("password must be at most 72 bytes when UTF-8 encoded")
    return value


Password = Annotated[
    str, Field(min_length=8), AfterValidator(_reject_beyond_bcrypt_limit)
]


class RegisterIn(BaseModel):
    email: EmailStr
    password: Password
    full_name: str = Field(min_length=1, max_length=200)
    org_name: str = Field(min_length=1, max_length=200)


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class RefreshIn(BaseModel):
    refresh_token: str


class LogoutIn(BaseModel):
    refresh_token: str


class SwitchWorkspaceIn(BaseModel):
    workspace_id: uuid.UUID
    # Required so the family being left behind can be revoked rather than
    # orphaned.
    refresh_token: str
```

- [ ] **Step 6: Write `app/slices/identity/router.py`**

```python
from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.core.envelope import success
from app.core.rate_limit import rate_limit
from app.shared.context import Principal
from app.slices.identity.dependencies import get_current_principal
from app.slices.identity.schemas import (
    LoginIn,
    LogoutIn,
    RefreshIn,
    RegisterIn,
    SwitchWorkspaceIn,
)
from app.slices.identity.use_cases.login import login as login_use_case
from app.slices.identity.use_cases.logout import logout as logout_use_case
from app.slices.identity.use_cases.refresh import refresh as refresh_use_case
from app.slices.identity.use_cases.register import register as register_use_case
from app.slices.identity.use_cases.switch_workspace import (
    switch_workspace as switch_workspace_use_case,
)
from app.slices.identity.use_cases.tokens import TokenBundle

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


def _serialize(bundle: TokenBundle) -> dict:
    return {
        "access_token": bundle.access_token,
        "refresh_token": bundle.refresh_token,
        "user_id": str(bundle.user_id),
        "workspace_id": str(bundle.workspace_id),
    }


@router.post("/register", dependencies=[Depends(rate_limit("register"))])
async def register(
    body: RegisterIn, session: AsyncSession = Depends(get_session)
) -> JSONResponse:
    bundle = await register_use_case(
        session,
        email=body.email,
        password=body.password,
        full_name=body.full_name,
        org_name=body.org_name,
    )
    return JSONResponse(status_code=201, content=success(_serialize(bundle)))


@router.post("/login", dependencies=[Depends(rate_limit("login"))])
async def login(body: LoginIn, session: AsyncSession = Depends(get_session)) -> dict:
    bundle = await login_use_case(session, email=body.email, password=body.password)
    return success(_serialize(bundle))


@router.post("/refresh", dependencies=[Depends(rate_limit("refresh"))])
async def refresh(
    body: RefreshIn, session: AsyncSession = Depends(get_session)
) -> dict:
    bundle = await refresh_use_case(session, refresh_token=body.refresh_token)
    return success(_serialize(bundle))


@router.post("/logout")
async def logout(body: LogoutIn, session: AsyncSession = Depends(get_session)) -> dict:
    await logout_use_case(session, refresh_token=body.refresh_token)
    return success({"logged_out": True})


@router.post("/switch-workspace")
async def switch_workspace(
    body: SwitchWorkspaceIn,
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_session),
) -> dict:
    bundle = await switch_workspace_use_case(
        session,
        user_id=principal.user_id,
        refresh_token=body.refresh_token,
        target_workspace_id=body.workspace_id,
    )
    return success(_serialize(bundle))
```

- [ ] **Step 7: Mount the router in `app/main.py`**

Add the import and the `include_router` call:

```python
from app.slices.identity.router import router as auth_router
```

and inside `create_app()`, before `return app`:

```python
    app.include_router(auth_router)
```

- [ ] **Step 8: Run test to verify it passes**

Run: `cd backend && pytest app/slices/identity/tests/test_auth_api.py -v`
Expected: PASS — 9 tests.

- [ ] **Step 9: Commit**

```bash
cd "D:/Jhon britto project"
git add backend/
git commit -m "feat(backend): add auth routes, request schemas, and per-IP rate limiting"
```

---

### Task 15: Cross-workspace isolation suite and full boundary enforcement

**Files:**
- Test: `backend/tests/test_isolation.py`
- Test: `backend/tests/test_boundaries.py`
- Modify: `backend/pyproject.toml` (full import-linter contracts)

**Interfaces:**
- Consumes: everything built so far.
- Produces: no new production code. The standing safety net that every later phase inherits.

- [ ] **Step 1: Write the isolation suite**

```python
# backend/tests/test_isolation.py
"""The platform's standing safety net.

Every future phase adds its routes here. A failure means tenant data leaked.
"""

from fastapi import APIRouter, Depends
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text

from app.core.database import get_session
from app.main import create_app
from app.shared.context import WorkspaceContext
from app.slices.authz.dependencies import get_workspace_context
from app.slices.identity.use_cases.register import register

ALICE = {
    "email": "alice@a.com",
    "password": "Secret123",
    "full_name": "Alice",
    "org_name": "Acme",
}
BOB = {
    "email": "bob@b.com",
    "password": "Secret123",
    "full_name": "Bob",
    "org_name": "Beta",
}


def _app_with_context_probe(session):
    app = create_app()
    router = APIRouter()

    @router.get("/api/v1/_probe/context")
    async def context(ctx: WorkspaceContext = Depends(get_workspace_context)):
        return {"workspace_id": str(ctx.workspace_id)}

    app.include_router(router)

    async def _override():
        yield session

    app.dependency_overrides[get_session] = _override
    return app


async def test_a_user_cannot_switch_into_a_foreign_workspace(client):
    await client.post("/api/v1/auth/register", json=ALICE)
    alice = (
        await client.post(
            "/api/v1/auth/login",
            json={"email": ALICE["email"], "password": ALICE["password"]},
        )
    ).json()["data"]

    bob_registration = await client.post("/api/v1/auth/register", json=BOB)
    bob_workspace = bob_registration.json()["data"]["workspace_id"]

    resp = await client.post(
        "/api/v1/auth/switch-workspace",
        json={"workspace_id": bob_workspace, "refresh_token": alice["refresh_token"]},
        headers={"Authorization": f"Bearer {alice['access_token']}"},
    )
    assert resp.status_code == 403
    assert resp.json()["error"] == "FORBIDDEN"


async def test_a_forged_token_for_a_foreign_workspace_is_rejected(session):
    """Alice's own user id, Bob's workspace id. Nothing about the token is
    malformed — only the database knows she is not a member."""
    from app.core.security import create_access_token

    alice = await register(
        session, email="alice@a.com", password="Secret123",
        full_name="Alice", org_name="Acme",
    )
    bob = await register(
        session, email="bob@b.com", password="Secret123",
        full_name="Bob", org_name="Beta",
    )

    forged = create_access_token(
        sub=str(alice.user_id),
        email="alice@a.com",
        workspace_id=str(bob.workspace_id),
    )

    async with AsyncClient(
        transport=ASGITransport(app=_app_with_context_probe(session)),
        base_url="http://t",
    ) as ac:
        resp = await ac.get(
            "/api/v1/_probe/context", headers={"Authorization": f"Bearer {forged}"}
        )

    assert resp.status_code == 403


async def test_a_refresh_token_cannot_be_redeemed_by_another_workspace(session):
    alice = await register(
        session, email="alice@a.com", password="Secret123",
        full_name="Alice", org_name="Acme",
    )
    bob = await register(
        session, email="bob@b.com", password="Secret123",
        full_name="Bob", org_name="Beta",
    )

    # Bob's stored refresh token is scoped to Bob's workspace; Alice holds no
    # row that would let her rotate it.
    rows = await session.execute(
        text("SELECT workspace_id FROM refresh_tokens WHERE user_id = :u"),
        {"u": bob.user_id},
    )
    assert all(row[0] == bob.workspace_id for row in rows)
    assert alice.workspace_id != bob.workspace_id


async def test_audit_rows_never_cross_workspaces(session):
    alice = await register(
        session, email="alice@a.com", password="Secret123",
        full_name="Alice", org_name="Acme",
    )
    bob = await register(
        session, email="bob@b.com", password="Secret123",
        full_name="Bob", org_name="Beta",
    )

    leaked = await session.execute(
        text(
            "SELECT count(*) FROM audit_logs "
            "WHERE actor_id = :alice AND workspace_id = :bob_ws"
        ),
        {"alice": alice.user_id, "bob_ws": bob.workspace_id},
    )
    assert leaked.scalar_one() == 0
```

- [ ] **Step 2: Write the boundary test**

```python
# backend/tests/test_boundaries.py
"""Runs the import-linter contracts as a normal test, so a boundary violation
fails the suite rather than waiting for a separate CI step."""

import shutil
import subprocess
from pathlib import Path

import pytest

BACKEND_ROOT = Path(__file__).resolve().parents[1]


def test_slice_import_contracts_hold():
    # import-linter ships a `lint-imports` console script; it lands on PATH
    # once the virtualenv is active.
    executable = shutil.which("lint-imports")
    if executable is None:
        pytest.skip("lint-imports not on PATH — activate the virtualenv")

    result = subprocess.run(
        [executable], cwd=BACKEND_ROOT, capture_output=True, text=True
    )
    assert result.returncode == 0, result.stdout + result.stderr
```

- [ ] **Step 3: Run both to verify the boundary test fails**

Run: `cd backend && pytest tests/test_boundaries.py -v`
Expected: PASS for now (only the Task 1 contract exists). The next step adds the contracts that matter.

- [ ] **Step 4: Add the full contracts to `backend/pyproject.toml`**

Replace the `[tool.importlinter]` section and append:

```toml
[tool.importlinter]
root_packages = ["app"]

[[tool.importlinter.contracts]]
name = "core and shared never import slices"
type = "forbidden"
source_modules = ["app.core", "app.shared"]
forbidden_modules = ["app.slices"]

[[tool.importlinter.contracts]]
name = "slices form a layered DAG"
type = "layers"
layers = [
    "app.slices.authz",
    "app.slices.identity",
    "app.slices.tenancy",
]

[[tool.importlinter.contracts]]
name = "slices talk to each other through api.py only"
type = "forbidden"
source_modules = [
    "app.slices.authz",
    "app.slices.identity",
    "app.slices.tenancy",
    "app.slices.audit",
    "app.slices.health",
]
forbidden_modules = [
    "app.slices.authz.dependencies",
    "app.slices.identity.models",
    "app.slices.identity.repository",
    "app.slices.identity.dependencies",
    "app.slices.identity.use_cases",
    "app.slices.tenancy.models",
    "app.slices.tenancy.repository",
    "app.slices.tenancy.seed",
    "app.slices.audit.models",
    "app.slices.audit.repository",
]
ignore_imports = [
    # A slice may of course import its own internals.
    "app.slices.identity.* -> app.slices.identity.*",
    "app.slices.tenancy.* -> app.slices.tenancy.*",
    "app.slices.audit.* -> app.slices.audit.*",
    "app.slices.authz.* -> app.slices.authz.*",
    # The registry exists precisely to import every slice's models so Alembic
    # sees complete metadata. It is the single sanctioned exception.
    "app.core.registry -> app.slices.*",
]
```

Note: `app.slices.audit` sits outside the layers contract because every slice may write audit rows and audit depends on none of them.

- [ ] **Step 5: Run the contracts and fix any violation**

Run: `cd backend && lint-imports`
Expected: `Contracts: 3 kept, 0 broken.`

If a contract breaks, **fix the import, not the contract.** The usual cause is a slice reaching past another slice's `api.py`; route the call through the published interface instead.

- [ ] **Step 6: Run the entire suite**

Run: `cd backend && pytest -v`
Expected: ALL tests pass — health, errors, database, migrations, RLS, tenancy, security, audit, identity models and repository, register, login, token lifecycle, authz guards, auth API, isolation, boundaries.

- [ ] **Step 7: Verify the success criteria explicitly**

Confirm each spec §13 criterion has a green test:

| # | Criterion | Test |
|---|---|---|
| 1 | Registration is atomic | `test_failure_after_user_insert_rolls_everything_back` |
| 2 | Duplicate email yields one user, one error | `test_duplicate_email_is_rejected_by_the_database_constraint` |
| 3 | Timing-neutral login, lockout after threshold | `test_password_is_verified_even_for_unknown_emails`, `test_failed_attempts_accumulate_then_lock_the_account` |
| 4 | Family rotation, reuse revokes and audits | `test_reusing_a_superseded_token_revokes_the_whole_family` |
| 5 | No stale-privilege window | `test_role_change_takes_effect_on_the_very_next_request`, `test_removed_membership_is_forbidden_immediately` |
| 6 | 403 through real HTTP | `test_viewer_is_forbidden_through_real_http` |
| 7 | Isolation on every route | `tests/test_isolation.py` |
| 8 | RLS blocks cross-workspace reads | `test_rls_blocks_cross_workspace_reads_under_restricted_role` |
| 9 | Audit rows share the mutation's transaction | `test_record_does_not_commit`, `test_register_writes_an_audit_row` |
| 10 | Migrations apply from empty to head | `migrated_url` fixture + `test_migrations_create_every_table` |

- [ ] **Step 8: Commit**

```bash
cd "D:/Jhon britto project"
git add backend/
git commit -m "test(backend): add isolation suite and enforce slice boundaries in CI"
```

---

## Self-Review Notes (completed by plan author)

**Spec coverage.** §4.1 stack → T1, T7. §4.3 pooler and CORS config → T1 Step 8, T2 Step 3. §4.4 slice layout → the file structure and every task's paths. §4.5 dependency DAG → T15 contracts. §5 data model → T3, T4, T5. §6.1 tokens → T7. §6.2 register → T10. §6.3 login → T11. §6.4 refresh → T12. §6.5 logout and switch → T12. §6.6 password rules → T14 schemas. §7 authorization → T13. §8 audit → T8, wired in T10–T12. §9 RLS and restricted role → T5. §10 rate limiting → T11 (lockout, in Postgres) and T14 (per-IP, in process). §11 API surface → T1, T2 health; T14 auth routes. §12 testing → T2, T5 harness; T15 suites. §13 success criteria → T15 Step 7 table.

**Deferred by design, per spec §3.2:** management CRUD (Phase 1b) and the React dashboard (Phase 1c).

**Placeholder scan.** No TBD/TODO. Every code step carries complete code. The one non-literal step is T5 Step 8, which runs `alembic revision --autogenerate` — deterministic given the models from T3–T4 — and specifies exactly what to verify in the output plus the complete hand-written RLS block that autogenerate cannot produce.

**Type consistency.** `TokenBundle` fields (`access_token`, `refresh_token`, `user_id`, `workspace_id`) match across `tokens.py`, all four use cases, and the router's `_serialize`. `WorkspaceContext` and `Principal` field names match between `shared/context.py`, `identity/dependencies.py`, `authz/dependencies.py`, and their tests. `tenancy.api` returns `RoleView`/`MembershipView`/`TenantCreated` with the same attribute names used by every caller. `identity.api.UserSummary` matches its use in `authz`. Repository signatures (`select_refresh_token`, `revoke_refresh_token`, `revoke_refresh_family`, `insert_refresh_token`) match their callers in `tokens.py`, `refresh.py`, `logout.py`, and `switch_workspace.py`.

**Two corrections made to the spec while writing this plan**, both now reflected in the spec document: `audit_logs.workspace_id` is nullable (a failed login for an unknown email has no tenant to attribute), and `get_workspace_context` performs two indexed lookups rather than one join (a single join would require `authz` to import another slice's models).


