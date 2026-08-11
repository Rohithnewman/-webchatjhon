# Phase 1 — Backend Foundation + Auth Implementation Plan

> # ⛔ SUPERSEDED — DO NOT IMPLEMENT
>
> **Superseded 2026-08-11** by `docs/superpowers/specs/2026-08-11-phase1a-backend-identity-core-design.md`. A replacement plan is being written from that spec.
>
> Review found defects that would ship a broken authorization layer. The most serious: `require_permission` (Task 9) declares `ctx: WorkspaceContext = None` with no `Depends(...)`, so FastAPI cannot inject it — the guard's test passed only by bypassing FastAPI. Also: `python-jose` carries known CVEs; `passlib==1.7.4` crashes on `bcrypt>=4.1`; Alembic autogenerates against the SQLite default URL; soft delete collides with total unique constraints; the duplicate-email check is a read-then-write race; login leaks account existence by timing; rate limiting and audit logging are absent. Full list in the new spec, §1.
>
> Retained for reference only.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the FastAPI backend foundation with async SQLAlchemy, migrations, and a complete custom-JWT auth system (register → login → refresh → logout → switch-workspace) enforcing Organization→Workspace isolation and RBAC.

**Architecture:** Layered `api → services → repositories`. FastAPI owns identity (bcrypt + HS256 JWT). Postgres accessed via the Supabase service key; tenant isolation enforced in the service/repository layer (every tenant-scoped repo method requires `workspace_id`). Registration atomically creates an organization, a default workspace, the user, and an owner membership. Refresh tokens are stored as SHA-256 hashes and rotated on use.

**Tech Stack:** Python 3.11+, FastAPI, SQLAlchemy 2.0 (async), asyncpg, Alembic, Pydantic v2, pydantic-settings, passlib[bcrypt], python-jose[cryptography], pytest + pytest-asyncio + httpx.

## Global Constraints

- API base path: `/api/v1/`. Auth routes live under `/api/v1/auth` and are unauthenticated.
- Standard success envelope: `{"success": true, "data": <obj>, "message": <str|null>, "pagination": <obj|null>}`.
- Standard error envelope: `{"success": false, "error": <CODE>, "message": <str>, "details": <obj|null>}`.
- HTTP codes: 200 ok, 201 created, 400 validation, 401 unauthenticated, 403 unauthorized, 404 not found, 429 rate-limited, 500 server error.
- Access JWT expiry: 15 minutes. Refresh JWT expiry: 7 days. Algorithm HS256, signed with `JWT_SECRET`.
- Passwords hashed with bcrypt. Never store or log plaintext passwords. Refresh tokens stored only as SHA-256 hashes.
- UUID primary keys everywhere. Every tenant table carries `workspace_id`. All tables carry `created_at`, `updated_at`, `deleted_at` (nullable, soft delete).
- All secrets/config via environment variables — never hardcoded.
- Type hints on every function. `async`/`await` for all DB and external calls.
- No tenant-scoped repository method may run without a `workspace_id` argument.

## Prerequisites (one-time, before Task 1)

- [ ] Initialize git in the repo root if not already a repo:

```bash
cd "D:/Jhon britto project"
git init
printf "__pycache__/\n*.pyc\n.env\n.venv/\nvenv/\n.pytest_cache/\n" > backend/.gitignore
```

- [ ] Create and activate a virtualenv, then confirm Python:

```bash
cd "D:/Jhon britto project/backend"
python -m venv .venv
# Windows PowerShell: .venv\Scripts\Activate.ps1
python --version   # expect Python 3.11 or higher
```

---

### Task 1: Project scaffold, settings, and FastAPI app with health check

**Files:**
- Create: `backend/requirements.txt`
- Create: `backend/app/__init__.py`
- Create: `backend/app/core/__init__.py`
- Create: `backend/app/core/config.py`
- Create: `backend/app/main.py`
- Create: `backend/tests/__init__.py`
- Create: `backend/tests/conftest.py`
- Test: `backend/tests/test_health.py`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: `app.core.config.settings` (a `Settings` instance with `DATABASE_URL: str`, `JWT_SECRET: str`, `JWT_ALGORITHM: str`, `ACCESS_TOKEN_MINUTES: int`, `REFRESH_TOKEN_DAYS: int`, `CORS_ORIGINS: list[str]`). `app.main.app` (FastAPI instance). `app.main.create_app() -> FastAPI`.

- [ ] **Step 1: Write requirements.txt**

```text
fastapi==0.111.0
uvicorn[standard]==0.30.1
sqlalchemy[asyncio]==2.0.31
asyncpg==0.29.0
alembic==1.13.2
pydantic==2.8.2
pydantic-settings==2.3.4
passlib[bcrypt]==1.7.4
python-jose[cryptography]==3.3.0
python-multipart==0.0.9
pytest==8.2.2
pytest-asyncio==0.23.7
httpx==0.27.0
aiosqlite==0.20.0
greenlet==3.0.3
```

- [ ] **Step 2: Install dependencies**

Run: `pip install -r requirements.txt`
Expected: installs without error.

- [ ] **Step 3: Write the failing test**

```python
# backend/tests/test_health.py
import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app


@pytest.mark.asyncio
async def test_health_returns_envelope():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.get("/api/v1/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    assert body["data"]["status"] == "ok"
```

- [ ] **Step 4: Add empty package markers and pytest config**

```python
# backend/app/__init__.py
```
```python
# backend/app/core/__init__.py
```
```python
# backend/tests/__init__.py
```
```python
# backend/tests/conftest.py
import asyncio
import pytest


@pytest.fixture(scope="session")
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()
```
Create `backend/pytest.ini`:
```ini
[pytest]
asyncio_mode = auto
pythonpath = .
```

- [ ] **Step 5: Run test to verify it fails**

Run: `pytest tests/test_health.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.main'` (or import error on config).

- [ ] **Step 6: Write settings**

```python
# backend/app/core/config.py
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    DATABASE_URL: str = "sqlite+aiosqlite:///./dev.db"
    JWT_SECRET: str = "change-me-in-env"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_MINUTES: int = 15
    REFRESH_TOKEN_DAYS: int = 7
    CORS_ORIGINS: list[str] = ["http://localhost:3000"]


settings = Settings()
```

- [ ] **Step 7: Write the FastAPI app + health route**

```python
# backend/app/main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings


def create_app() -> FastAPI:
    app = FastAPI(title="WebChatBots Builder API", version="1.0.0")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/api/v1/health")
    async def health() -> dict:
        return {"success": True, "data": {"status": "ok"}, "message": None, "pagination": None}

    return app


app = create_app()
```

- [ ] **Step 8: Run test to verify it passes**

Run: `pytest tests/test_health.py -v`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add backend/
git commit -m "feat(backend): scaffold FastAPI app with settings and health check"
```

---

### Task 2: Async database engine and session dependency

**Files:**
- Create: `backend/app/core/database.py`
- Test: `backend/tests/test_database.py`

**Interfaces:**
- Consumes: `app.core.config.settings`.
- Produces: `app.core.database.Base` (DeclarativeBase). `app.core.database.engine` (AsyncEngine). `app.core.database.get_session() -> AsyncIterator[AsyncSession]` (FastAPI dependency yielding an `AsyncSession`).

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_database.py
import pytest
from sqlalchemy import text
from app.core.database import get_session


@pytest.mark.asyncio
async def test_get_session_yields_working_session():
    gen = get_session()
    session = await gen.__anext__()
    result = await session.execute(text("SELECT 1"))
    assert result.scalar_one() == 1
    await gen.aclose()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_database.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.core.database'`.

- [ ] **Step 3: Write the database module**

```python
# backend/app/core/database.py
from collections.abc import AsyncIterator

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

from app.core.config import settings

engine = create_async_engine(settings.DATABASE_URL, echo=False, future=True)
async_session_factory = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)


class Base(DeclarativeBase):
    pass


async def get_session() -> AsyncIterator[AsyncSession]:
    async with async_session_factory() as session:
        yield session
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/test_database.py -v`
Expected: PASS (uses the sqlite default from settings).

- [ ] **Step 5: Commit**

```bash
git add backend/app/core/database.py backend/tests/test_database.py
git commit -m "feat(backend): add async engine, Base, and session dependency"
```

---

### Task 3: SQLAlchemy models with timestamp/UUID mixins

**Files:**
- Create: `backend/app/models/__init__.py`
- Create: `backend/app/models/mixins.py`
- Create: `backend/app/models/organization.py`
- Create: `backend/app/models/workspace.py`
- Create: `backend/app/models/user.py`
- Create: `backend/app/models/role.py`
- Create: `backend/app/models/membership.py`
- Create: `backend/app/models/refresh_token.py`
- Create: `backend/app/models/audit_log.py`
- Test: `backend/tests/test_models.py`

**Interfaces:**
- Consumes: `app.core.database.Base`.
- Produces: model classes `Organization, Workspace, User, Role, Membership, RefreshToken, AuditLog`. Mixin `TimestampMixin` (`created_at`, `updated_at`, `deleted_at`) and `uuid_pk()` column factory. All exported from `app.models`.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_models.py
import pytest
from sqlalchemy import select
from app.core.database import Base, engine, async_session_factory
from app.models import Organization, Workspace, User, Role, Membership


@pytest.mark.asyncio
async def test_models_create_and_relate():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    async with async_session_factory() as s:
        org = Organization(name="Acme", plan="free")
        s.add(org)
        await s.flush()
        ws = Workspace(organization_id=org.id, name="Default", timezone="UTC")
        s.add(ws)
        await s.flush()
        role = Role(name="owner", permissions=["*"], is_system=True)
        s.add(role)
        user = User(email="a@b.com", password_hash="x", full_name="A", is_active=True)
        s.add(user)
        await s.flush()
        m = Membership(user_id=user.id, workspace_id=ws.id, role_id=role.id)
        s.add(m)
        await s.commit()
        rows = (await s.execute(select(Membership))).scalars().all()
    assert len(rows) == 1
    assert rows[0].workspace_id == ws.id
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_models.py -v`
Expected: FAIL — import error on `app.models`.

- [ ] **Step 3: Write the mixins**

```python
# backend/app/models/mixins.py
import uuid
from datetime import datetime

from sqlalchemy import DateTime, func
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.types import CHAR, TypeDecorator


class GUID(TypeDecorator):
    """Portable UUID: native on Postgres, CHAR(32) elsewhere (sqlite tests)."""
    impl = CHAR
    cache_ok = True

    def load_dialect_impl(self, dialect):
        if dialect.name == "postgresql":
            from sqlalchemy.dialects.postgresql import UUID as PGUUID
            return dialect.type_descriptor(PGUUID(as_uuid=True))
        return dialect.type_descriptor(CHAR(32))

    def process_bind_param(self, value, dialect):
        if value is None:
            return value
        if dialect.name == "postgresql":
            return value
        return uuid.UUID(str(value)).hex

    def process_result_value(self, value, dialect):
        if value is None:
            return value
        if isinstance(value, uuid.UUID):
            return value
        return uuid.UUID(value)


def uuid_pk() -> Mapped[uuid.UUID]:
    return mapped_column(GUID(), primary_key=True, default=uuid.uuid4)


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
```

- [ ] **Step 4: Write the model modules**

```python
# backend/app/models/organization.py
import uuid
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database import Base
from app.models.mixins import TimestampMixin, uuid_pk


class Organization(TimestampMixin, Base):
    __tablename__ = "organizations"
    id: Mapped[uuid.UUID] = uuid_pk()
    name: Mapped[str] = mapped_column(nullable=False)
    plan: Mapped[str] = mapped_column(default="free", nullable=False)
```
```python
# backend/app/models/workspace.py
import uuid
from sqlalchemy import ForeignKey
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database import Base
from app.models.mixins import GUID, TimestampMixin, uuid_pk


class Workspace(TimestampMixin, Base):
    __tablename__ = "workspaces"
    id: Mapped[uuid.UUID] = uuid_pk()
    organization_id: Mapped[uuid.UUID] = mapped_column(GUID(), ForeignKey("organizations.id"), index=True)
    name: Mapped[str] = mapped_column(nullable=False)
    timezone: Mapped[str] = mapped_column(default="UTC", nullable=False)
```
```python
# backend/app/models/user.py
import uuid
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database import Base
from app.models.mixins import TimestampMixin, uuid_pk


class User(TimestampMixin, Base):
    __tablename__ = "users"
    id: Mapped[uuid.UUID] = uuid_pk()
    email: Mapped[str] = mapped_column(unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(nullable=False)
    full_name: Mapped[str] = mapped_column(nullable=False)
    is_active: Mapped[bool] = mapped_column(default=True, nullable=False)
```
```python
# backend/app/models/role.py
import uuid
from sqlalchemy import JSON
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database import Base
from app.models.mixins import TimestampMixin, uuid_pk


class Role(TimestampMixin, Base):
    __tablename__ = "roles"
    id: Mapped[uuid.UUID] = uuid_pk()
    name: Mapped[str] = mapped_column(nullable=False)
    permissions: Mapped[list[str]] = mapped_column(JSON, default=list)
    is_system: Mapped[bool] = mapped_column(default=False, nullable=False)
```
```python
# backend/app/models/membership.py
import uuid
from sqlalchemy import ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database import Base
from app.models.mixins import GUID, TimestampMixin, uuid_pk


class Membership(TimestampMixin, Base):
    __tablename__ = "memberships"
    __table_args__ = (UniqueConstraint("user_id", "workspace_id", name="uq_user_workspace"),)
    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(GUID(), ForeignKey("users.id"), index=True)
    workspace_id: Mapped[uuid.UUID] = mapped_column(GUID(), ForeignKey("workspaces.id"), index=True)
    role_id: Mapped[uuid.UUID] = mapped_column(GUID(), ForeignKey("roles.id"), index=True)
```
```python
# backend/app/models/refresh_token.py
import uuid
from datetime import datetime
from sqlalchemy import DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database import Base
from app.models.mixins import GUID, TimestampMixin, uuid_pk


class RefreshToken(TimestampMixin, Base):
    __tablename__ = "refresh_tokens"
    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(GUID(), ForeignKey("users.id"), index=True)
    workspace_id: Mapped[uuid.UUID] = mapped_column(GUID(), ForeignKey("workspaces.id"), index=True)
    token_hash: Mapped[str] = mapped_column(unique=True, index=True, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
```
```python
# backend/app/models/audit_log.py
import uuid
from sqlalchemy import JSON, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database import Base
from app.models.mixins import GUID, TimestampMixin, uuid_pk


class AuditLog(TimestampMixin, Base):
    __tablename__ = "audit_logs"
    id: Mapped[uuid.UUID] = uuid_pk()
    workspace_id: Mapped[uuid.UUID] = mapped_column(GUID(), ForeignKey("workspaces.id"), index=True)
    actor_id: Mapped[uuid.UUID] = mapped_column(GUID(), ForeignKey("users.id"), index=True)
    action: Mapped[str] = mapped_column(nullable=False)
    target_type: Mapped[str | None] = mapped_column(nullable=True)
    target_id: Mapped[str | None] = mapped_column(nullable=True)
    meta: Mapped[dict] = mapped_column(JSON, default=dict)
```
```python
# backend/app/models/__init__.py
from app.models.organization import Organization
from app.models.workspace import Workspace
from app.models.user import User
from app.models.role import Role
from app.models.membership import Membership
from app.models.refresh_token import RefreshToken
from app.models.audit_log import AuditLog

__all__ = [
    "Organization", "Workspace", "User", "Role",
    "Membership", "RefreshToken", "AuditLog",
]
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pytest tests/test_models.py -v`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/app/models/ backend/tests/test_models.py
git commit -m "feat(backend): add ORM models with UUID/timestamp/soft-delete mixins"
```

---

### Task 4: Alembic migrations and role seeding

**Files:**
- Create: `backend/alembic.ini`
- Create: `backend/alembic/env.py`
- Create: `backend/alembic/script.py.mako`
- Create: `backend/app/core/seed.py`
- Test: `backend/tests/test_seed.py`

**Interfaces:**
- Consumes: `app.models` metadata, `app.core.database.Base`.
- Produces: `app.core.seed.SYSTEM_ROLES` (list of dicts). `app.core.seed.seed_roles(session) -> None` (idempotent). Alembic configured to autogenerate from `Base.metadata`.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_seed.py
import pytest
from sqlalchemy import select
from app.core.database import Base, engine, async_session_factory
from app.core.seed import seed_roles
from app.models import Role


@pytest.mark.asyncio
async def test_seed_roles_is_idempotent():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    async with async_session_factory() as s:
        await seed_roles(s)
        await seed_roles(s)  # second call must not duplicate
        names = sorted(r.name for r in (await s.execute(select(Role))).scalars().all())
    assert names == ["admin", "member", "owner", "viewer"]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_seed.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.core.seed'`.

- [ ] **Step 3: Write the seed module**

```python
# backend/app/core/seed.py
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models import Role

SYSTEM_ROLES = [
    {"name": "owner", "permissions": ["*"]},
    {"name": "admin", "permissions": ["workspace:manage", "members:manage", "features:use"]},
    {"name": "member", "permissions": ["features:use"]},
    {"name": "viewer", "permissions": ["features:read"]},
]


async def seed_roles(session: AsyncSession) -> None:
    existing = {r.name for r in (await session.execute(select(Role))).scalars().all()}
    for spec in SYSTEM_ROLES:
        if spec["name"] not in existing:
            session.add(Role(name=spec["name"], permissions=spec["permissions"], is_system=True))
    await session.commit()
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/test_seed.py -v`
Expected: PASS.

- [ ] **Step 5: Initialize Alembic and point it at our metadata**

Run: `cd backend && alembic init alembic`
Then replace the generated `alembic/env.py` target metadata section with:

```python
# backend/alembic/env.py  (key edits — full file keeps Alembic boilerplate)
import asyncio
from logging.config import fileConfig
from sqlalchemy.ext.asyncio import async_engine_from_config
from sqlalchemy import pool
from alembic import context

from app.core.config import settings
from app.core.database import Base
import app.models  # noqa: F401  (import registers all tables)

config = context.config
config.set_main_option("sqlalchemy.url", settings.DATABASE_URL)
if config.config_file_name is not None:
    fileConfig(config.config_file_name)
target_metadata = Base.metadata


def do_run_migrations(connection):
    context.configure(connection=connection, target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations():
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


def run_migrations_online():
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    raise RuntimeError("Offline migrations not supported")
else:
    run_migrations_online()
```

- [ ] **Step 6: Generate the initial migration**

Run: `cd backend && alembic revision --autogenerate -m "initial phase1 schema"`
Expected: a new file under `alembic/versions/` containing `create_table` for organizations, workspaces, users, roles, memberships, refresh_tokens, audit_logs.

- [ ] **Step 7: Commit**

```bash
git add backend/alembic.ini backend/alembic/ backend/app/core/seed.py backend/tests/test_seed.py
git commit -m "feat(backend): add alembic migrations and idempotent role seeding"
```

---

### Task 5: Security core — password hashing and JWT

**Files:**
- Create: `backend/app/core/security.py`
- Test: `backend/tests/test_security.py`

**Interfaces:**
- Consumes: `app.core.config.settings`.
- Produces:
  - `hash_password(plain: str) -> str`
  - `verify_password(plain: str, hashed: str) -> bool`
  - `create_access_token(claims: dict) -> str`
  - `create_refresh_token(claims: dict) -> tuple[str, datetime]` (returns raw token + expiry)
  - `decode_token(token: str) -> dict` (raises `jose.JWTError` on invalid/expired)
  - `sha256(value: str) -> str`

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_security.py
import pytest
from jose import JWTError
from app.core import security


def test_password_hash_roundtrip():
    h = security.hash_password("Secret123")
    assert h != "Secret123"
    assert security.verify_password("Secret123", h) is True
    assert security.verify_password("wrong", h) is False


def test_access_token_encodes_and_decodes():
    token = security.create_access_token({"sub": "u1", "workspace_id": "w1"})
    payload = security.decode_token(token)
    assert payload["sub"] == "u1"
    assert payload["workspace_id"] == "w1"
    assert payload["type"] == "access"


def test_decode_rejects_garbage():
    with pytest.raises(JWTError):
        security.decode_token("not-a-token")


def test_sha256_is_stable():
    assert security.sha256("abc") == security.sha256("abc")
    assert len(security.sha256("abc")) == 64
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_security.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.core.security'`.

- [ ] **Step 3: Write the security module**

```python
# backend/app/core/security.py
import hashlib
import uuid
from datetime import datetime, timedelta, timezone

from jose import jwt
from passlib.context import CryptContext

from app.core.config import settings

_pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(plain: str) -> str:
    return _pwd.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    return _pwd.verify(plain, hashed)


def sha256(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def _encode(claims: dict, expires: datetime, token_type: str) -> str:
    payload = {**claims, "type": token_type, "exp": expires, "iat": datetime.now(timezone.utc), "jti": str(uuid.uuid4())}
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def create_access_token(claims: dict) -> str:
    expires = datetime.now(timezone.utc) + timedelta(minutes=settings.ACCESS_TOKEN_MINUTES)
    return _encode(claims, expires, "access")


def create_refresh_token(claims: dict) -> tuple[str, datetime]:
    expires = datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_DAYS)
    return _encode(claims, expires, "refresh"), expires


def decode_token(token: str) -> dict:
    return jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/test_security.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/core/security.py backend/tests/test_security.py
git commit -m "feat(backend): add password hashing and JWT security core"
```

---

### Task 6: Response envelope schemas and global exception handling

**Files:**
- Create: `backend/app/schemas/__init__.py`
- Create: `backend/app/schemas/envelope.py`
- Create: `backend/app/core/errors.py`
- Modify: `backend/app/main.py` (register exception handlers)
- Test: `backend/tests/test_errors.py`

**Interfaces:**
- Consumes: `app.main.create_app`.
- Produces:
  - `app.core.errors.AppError(code: str, message: str, status_code: int = 400, details: dict | None = None)` (exception).
  - `app.schemas.envelope.success(data, message=None, pagination=None) -> dict`
  - `app.schemas.envelope.error(code, message, details=None) -> dict`
  - Registered handlers converting `AppError` and `RequestValidationError` to the error envelope.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_errors.py
import pytest
from httpx import AsyncClient, ASGITransport
from fastapi import APIRouter
from app.main import create_app
from app.core.errors import AppError


@pytest.mark.asyncio
async def test_apperror_renders_error_envelope():
    app = create_app()
    router = APIRouter()

    @router.get("/api/v1/boom")
    async def boom():
        raise AppError(code="NOPE", message="nope happened", status_code=403)

    app.include_router(router)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as ac:
        resp = await ac.get("/api/v1/boom")
    assert resp.status_code == 403
    body = resp.json()
    assert body == {"success": False, "error": "NOPE", "message": "nope happened", "details": None}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_errors.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.core.errors'`.

- [ ] **Step 3: Write envelope helpers**

```python
# backend/app/schemas/__init__.py
```
```python
# backend/app/schemas/envelope.py
from typing import Any


def success(data: Any, message: str | None = None, pagination: dict | None = None) -> dict:
    return {"success": True, "data": data, "message": message, "pagination": pagination}


def error(code: str, message: str, details: dict | None = None) -> dict:
    return {"success": False, "error": code, "message": message, "details": details}
```

- [ ] **Step 4: Write the AppError**

```python
# backend/app/core/errors.py
class AppError(Exception):
    def __init__(self, code: str, message: str, status_code: int = 400, details: dict | None = None):
        self.code = code
        self.message = message
        self.status_code = status_code
        self.details = details
        super().__init__(message)
```

- [ ] **Step 5: Register handlers in main.py**

Add to `create_app()` in `backend/app/main.py`, before `return app`:

```python
    from fastapi import Request
    from fastapi.responses import JSONResponse
    from fastapi.exceptions import RequestValidationError
    from app.core.errors import AppError
    from app.schemas.envelope import error as error_env

    @app.exception_handler(AppError)
    async def _app_error_handler(request: Request, exc: AppError):
        return JSONResponse(status_code=exc.status_code, content=error_env(exc.code, exc.message, exc.details))

    @app.exception_handler(RequestValidationError)
    async def _validation_handler(request: Request, exc: RequestValidationError):
        return JSONResponse(status_code=400, content=error_env("VALIDATION_ERROR", "Invalid request", {"errors": exc.errors()}))
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pytest tests/test_errors.py -v`
Expected: PASS. Also run `pytest tests/test_health.py -v` — still PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/app/schemas/ backend/app/core/errors.py backend/app/main.py backend/tests/test_errors.py
git commit -m "feat(backend): add response envelopes and global error handlers"
```

---

### Task 7: Repositories (workspace-scoped data access)

**Files:**
- Create: `backend/app/repositories/__init__.py`
- Create: `backend/app/repositories/user_repo.py`
- Create: `backend/app/repositories/org_repo.py`
- Create: `backend/app/repositories/workspace_repo.py`
- Create: `backend/app/repositories/membership_repo.py`
- Create: `backend/app/repositories/refresh_token_repo.py`
- Test: `backend/tests/test_repositories.py`
- Create: `backend/tests/db_fixtures.py`

**Interfaces:**
- Consumes: `app.models`, `AsyncSession`.
- Produces (all coroutines taking `session: AsyncSession`):
  - `user_repo.get_by_email(session, email) -> User | None`
  - `user_repo.create(session, *, email, password_hash, full_name) -> User`
  - `org_repo.create(session, *, name, plan="free") -> Organization`
  - `workspace_repo.create(session, *, organization_id, name, timezone="UTC") -> Workspace`
  - `workspace_repo.get_scoped(session, *, workspace_id) -> Workspace | None` (only non-deleted)
  - `membership_repo.create(session, *, user_id, workspace_id, role_id) -> Membership`
  - `membership_repo.get(session, *, user_id, workspace_id) -> Membership | None`
  - `membership_repo.list_for_user(session, *, user_id) -> list[Membership]`
  - `refresh_token_repo.create(session, *, user_id, workspace_id, token_hash, expires_at) -> RefreshToken`
  - `refresh_token_repo.get_active(session, *, token_hash) -> RefreshToken | None` (unexpired, unrevoked)
  - `refresh_token_repo.revoke(session, *, token) -> None`

- [ ] **Step 1: Write a reusable in-memory DB fixture**

```python
# backend/tests/db_fixtures.py
import pytest_asyncio
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from app.core.database import Base
from app.core.seed import seed_roles


@pytest_asyncio.fixture
async def session():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as s:
        await seed_roles(s)
        yield s
    await engine.dispose()
```

- [ ] **Step 2: Write the failing test**

```python
# backend/tests/test_repositories.py
import pytest
from datetime import datetime, timedelta, timezone
from tests.db_fixtures import session  # noqa: F401
from app.repositories import user_repo, org_repo, workspace_repo, membership_repo, refresh_token_repo


@pytest.mark.asyncio
async def test_create_and_scope(session):
    org = await org_repo.create(session, name="Acme")
    ws = await workspace_repo.create(session, organization_id=org.id, name="Default")
    user = await user_repo.create(session, email="a@b.com", password_hash="h", full_name="A")
    await session.commit()

    assert await user_repo.get_by_email(session, "a@b.com") is not None
    assert await workspace_repo.get_scoped(session, workspace_id=ws.id) is not None

    from app.models import Role
    from sqlalchemy import select
    role = (await session.execute(select(Role).where(Role.name == "owner"))).scalar_one()
    m = await membership_repo.create(session, user_id=user.id, workspace_id=ws.id, role_id=role.id)
    await session.commit()
    assert await membership_repo.get(session, user_id=user.id, workspace_id=ws.id) is not None
    assert len(await membership_repo.list_for_user(session, user_id=user.id)) == 1


@pytest.mark.asyncio
async def test_refresh_token_active_and_revoke(session):
    org = await org_repo.create(session, name="Acme")
    ws = await workspace_repo.create(session, organization_id=org.id, name="Default")
    user = await user_repo.create(session, email="a@b.com", password_hash="h", full_name="A")
    await session.commit()
    exp = datetime.now(timezone.utc) + timedelta(days=1)
    rt = await refresh_token_repo.create(session, user_id=user.id, workspace_id=ws.id, token_hash="abc", expires_at=exp)
    await session.commit()
    assert await refresh_token_repo.get_active(session, token_hash="abc") is not None
    await refresh_token_repo.revoke(session, token=rt)
    await session.commit()
    assert await refresh_token_repo.get_active(session, token_hash="abc") is None
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pytest tests/test_repositories.py -v`
Expected: FAIL — import error on `app.repositories`.

- [ ] **Step 4: Write the repositories**

```python
# backend/app/repositories/__init__.py
```
```python
# backend/app/repositories/user_repo.py
import uuid
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models import User


async def get_by_email(session: AsyncSession, email: str) -> User | None:
    stmt = select(User).where(User.email == email, User.deleted_at.is_(None))
    return (await session.execute(stmt)).scalar_one_or_none()


async def create(session: AsyncSession, *, email: str, password_hash: str, full_name: str) -> User:
    user = User(email=email, password_hash=password_hash, full_name=full_name, is_active=True)
    session.add(user)
    await session.flush()
    return user
```
```python
# backend/app/repositories/org_repo.py
from sqlalchemy.ext.asyncio import AsyncSession
from app.models import Organization


async def create(session: AsyncSession, *, name: str, plan: str = "free") -> Organization:
    org = Organization(name=name, plan=plan)
    session.add(org)
    await session.flush()
    return org
```
```python
# backend/app/repositories/workspace_repo.py
import uuid
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models import Workspace


async def create(session: AsyncSession, *, organization_id: uuid.UUID, name: str, timezone: str = "UTC") -> Workspace:
    ws = Workspace(organization_id=organization_id, name=name, timezone=timezone)
    session.add(ws)
    await session.flush()
    return ws


async def get_scoped(session: AsyncSession, *, workspace_id: uuid.UUID) -> Workspace | None:
    stmt = select(Workspace).where(Workspace.id == workspace_id, Workspace.deleted_at.is_(None))
    return (await session.execute(stmt)).scalar_one_or_none()
```
```python
# backend/app/repositories/membership_repo.py
import uuid
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models import Membership


async def create(session: AsyncSession, *, user_id: uuid.UUID, workspace_id: uuid.UUID, role_id: uuid.UUID) -> Membership:
    m = Membership(user_id=user_id, workspace_id=workspace_id, role_id=role_id)
    session.add(m)
    await session.flush()
    return m


async def get(session: AsyncSession, *, user_id: uuid.UUID, workspace_id: uuid.UUID) -> Membership | None:
    stmt = select(Membership).where(
        Membership.user_id == user_id,
        Membership.workspace_id == workspace_id,
        Membership.deleted_at.is_(None),
    )
    return (await session.execute(stmt)).scalar_one_or_none()


async def list_for_user(session: AsyncSession, *, user_id: uuid.UUID) -> list[Membership]:
    stmt = select(Membership).where(Membership.user_id == user_id, Membership.deleted_at.is_(None))
    return list((await session.execute(stmt)).scalars().all())
```
```python
# backend/app/repositories/refresh_token_repo.py
import uuid
from datetime import datetime, timezone
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models import RefreshToken


async def create(session: AsyncSession, *, user_id: uuid.UUID, workspace_id: uuid.UUID, token_hash: str, expires_at: datetime) -> RefreshToken:
    rt = RefreshToken(user_id=user_id, workspace_id=workspace_id, token_hash=token_hash, expires_at=expires_at)
    session.add(rt)
    await session.flush()
    return rt


async def get_active(session: AsyncSession, *, token_hash: str) -> RefreshToken | None:
    now = datetime.now(timezone.utc)
    stmt = select(RefreshToken).where(
        RefreshToken.token_hash == token_hash,
        RefreshToken.revoked_at.is_(None),
        RefreshToken.expires_at > now,
    )
    return (await session.execute(stmt)).scalar_one_or_none()


async def revoke(session: AsyncSession, *, token: RefreshToken) -> None:
    token.revoked_at = datetime.now(timezone.utc)
    await session.flush()
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pytest tests/test_repositories.py -v`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/app/repositories/ backend/tests/test_repositories.py backend/tests/db_fixtures.py
git commit -m "feat(backend): add workspace-scoped repositories"
```

---

### Task 8: Auth service — atomic registration and login

**Files:**
- Create: `backend/app/services/__init__.py`
- Create: `backend/app/services/auth_service.py`
- Test: `backend/tests/test_auth_service.py`

**Interfaces:**
- Consumes: repositories from Task 7, `app.core.security`, `app.core.errors.AppError`.
- Produces:
  - `auth_service.register(session, *, email, password, full_name, org_name) -> dict` — atomically creates org + default workspace + user + owner membership; returns `{"access_token", "refresh_token", "user_id", "workspace_id"}`. Raises `AppError("EMAIL_TAKEN", ..., 400)` on duplicate.
  - `auth_service.login(session, *, email, password) -> dict` — returns same token dict scoped to the user's first membership. Raises `AppError("INVALID_CREDENTIALS", ..., 401)` on bad email/password or inactive user.
  - `auth_service._issue_tokens(session, *, user, workspace_id, role) -> dict` (internal helper; persists hashed refresh token).

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_auth_service.py
import pytest
from tests.db_fixtures import session  # noqa: F401
from app.services import auth_service
from app.core.errors import AppError
from app.core.security import decode_token


@pytest.mark.asyncio
async def test_register_creates_full_tenant_and_tokens(session):
    result = await auth_service.register(
        session, email="a@b.com", password="Secret123", full_name="A", org_name="Acme"
    )
    assert "access_token" in result and "refresh_token" in result
    payload = decode_token(result["access_token"])
    assert payload["role"] == "owner"
    assert payload["workspace_id"] == str(result["workspace_id"])


@pytest.mark.asyncio
async def test_register_rejects_duplicate_email(session):
    await auth_service.register(session, email="a@b.com", password="Secret123", full_name="A", org_name="Acme")
    with pytest.raises(AppError) as ei:
        await auth_service.register(session, email="a@b.com", password="Secret123", full_name="B", org_name="Beta")
    assert ei.value.code == "EMAIL_TAKEN"


@pytest.mark.asyncio
async def test_login_success_and_failure(session):
    await auth_service.register(session, email="a@b.com", password="Secret123", full_name="A", org_name="Acme")
    ok = await auth_service.login(session, email="a@b.com", password="Secret123")
    assert "access_token" in ok
    with pytest.raises(AppError) as ei:
        await auth_service.login(session, email="a@b.com", password="wrong")
    assert ei.value.code == "INVALID_CREDENTIALS"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_auth_service.py -v`
Expected: FAIL — import error on `app.services`.

- [ ] **Step 3: Write the auth service**

```python
# backend/app/services/__init__.py
```
```python
# backend/app/services/auth_service.py
import uuid
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AppError
from app.core import security
from app.models import Role
from app.repositories import (
    user_repo, org_repo, workspace_repo, membership_repo, refresh_token_repo,
)


async def _role_by_name(session: AsyncSession, name: str) -> Role:
    return (await session.execute(select(Role).where(Role.name == name))).scalar_one()


async def _issue_tokens(session: AsyncSession, *, user, workspace_id: uuid.UUID, role: Role) -> dict:
    claims = {
        "sub": str(user.id),
        "email": user.email,
        "workspace_id": str(workspace_id),
        "role": role.name,
        "permissions": role.permissions,
    }
    access = security.create_access_token(claims)
    refresh, expires = security.create_refresh_token({"sub": str(user.id), "workspace_id": str(workspace_id)})
    await refresh_token_repo.create(
        session, user_id=user.id, workspace_id=workspace_id,
        token_hash=security.sha256(refresh), expires_at=expires,
    )
    return {
        "access_token": access,
        "refresh_token": refresh,
        "user_id": user.id,
        "workspace_id": workspace_id,
    }


async def register(session: AsyncSession, *, email: str, password: str, full_name: str, org_name: str) -> dict:
    if await user_repo.get_by_email(session, email):
        raise AppError(code="EMAIL_TAKEN", message="Email already registered", status_code=400)
    org = await org_repo.create(session, name=org_name)
    ws = await workspace_repo.create(session, organization_id=org.id, name="Default")
    user = await user_repo.create(
        session, email=email, password_hash=security.hash_password(password), full_name=full_name
    )
    owner = await _role_by_name(session, "owner")
    await membership_repo.create(session, user_id=user.id, workspace_id=ws.id, role_id=owner.id)
    tokens = await _issue_tokens(session, user=user, workspace_id=ws.id, role=owner)
    await session.commit()
    return tokens


async def login(session: AsyncSession, *, email: str, password: str) -> dict:
    user = await user_repo.get_by_email(session, email)
    if not user or not user.is_active or not security.verify_password(password, user.password_hash):
        raise AppError(code="INVALID_CREDENTIALS", message="Invalid email or password", status_code=401)
    memberships = await membership_repo.list_for_user(session, user_id=user.id)
    if not memberships:
        raise AppError(code="NO_WORKSPACE", message="User has no workspace access", status_code=403)
    m = memberships[0]
    role = (await session.execute(select(Role).where(Role.id == m.role_id))).scalar_one()
    tokens = await _issue_tokens(session, user=user, workspace_id=m.workspace_id, role=role)
    await session.commit()
    return tokens
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/test_auth_service.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/ backend/tests/test_auth_service.py
git commit -m "feat(backend): add auth service with atomic registration and login"
```

---

### Task 9: Auth dependencies — current user, workspace context, permission guard

**Files:**
- Create: `backend/app/dependencies.py`
- Test: `backend/tests/test_dependencies.py`

**Interfaces:**
- Consumes: `app.core.security.decode_token`, `app.core.errors.AppError`, `get_session`.
- Produces:
  - `WorkspaceContext` dataclass: `user_id: str`, `email: str`, `workspace_id: str`, `role: str`, `permissions: list[str]`.
  - `get_current_context(authorization: str = Header(...)) -> WorkspaceContext` — parses `Bearer <token>`, validates it's an access token, raises `AppError("UNAUTHENTICATED", ..., 401)` on any failure.
  - `require_permission(perm: str)` — returns a dependency callable that raises `AppError("FORBIDDEN", ..., 403)` if `perm` (or `"*"`) not in context permissions.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_dependencies.py
import pytest
from app.dependencies import get_current_context, require_permission, WorkspaceContext
from app.core.errors import AppError
from app.core.security import create_access_token, create_refresh_token


@pytest.mark.asyncio
async def test_get_current_context_parses_access_token():
    token = create_access_token({"sub": "u1", "email": "a@b.com", "workspace_id": "w1", "role": "owner", "permissions": ["*"]})
    ctx = await get_current_context(authorization=f"Bearer {token}")
    assert isinstance(ctx, WorkspaceContext)
    assert ctx.workspace_id == "w1"


@pytest.mark.asyncio
async def test_get_current_context_rejects_refresh_token():
    refresh, _ = create_refresh_token({"sub": "u1", "workspace_id": "w1"})
    with pytest.raises(AppError) as ei:
        await get_current_context(authorization=f"Bearer {refresh}")
    assert ei.value.status_code == 401


@pytest.mark.asyncio
async def test_require_permission_allows_and_blocks():
    ctx = WorkspaceContext(user_id="u1", email="a@b.com", workspace_id="w1", role="viewer", permissions=["features:read"])
    dep = require_permission("features:read")
    assert await dep(ctx=ctx) is ctx
    blocked = require_permission("members:manage")
    with pytest.raises(AppError) as ei:
        await blocked(ctx=ctx)
    assert ei.value.status_code == 403
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_dependencies.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.dependencies'`.

- [ ] **Step 3: Write the dependencies**

```python
# backend/app/dependencies.py
from dataclasses import dataclass

from fastapi import Header
from jose import JWTError

from app.core.errors import AppError
from app.core.security import decode_token


@dataclass
class WorkspaceContext:
    user_id: str
    email: str
    workspace_id: str
    role: str
    permissions: list[str]


async def get_current_context(authorization: str = Header(default="")) -> WorkspaceContext:
    if not authorization.startswith("Bearer "):
        raise AppError(code="UNAUTHENTICATED", message="Missing bearer token", status_code=401)
    token = authorization.removeprefix("Bearer ").strip()
    try:
        payload = decode_token(token)
    except JWTError:
        raise AppError(code="UNAUTHENTICATED", message="Invalid or expired token", status_code=401)
    if payload.get("type") != "access":
        raise AppError(code="UNAUTHENTICATED", message="Not an access token", status_code=401)
    return WorkspaceContext(
        user_id=payload["sub"],
        email=payload.get("email", ""),
        workspace_id=payload["workspace_id"],
        role=payload.get("role", ""),
        permissions=payload.get("permissions", []),
    )


def require_permission(perm: str):
    async def _guard(ctx: WorkspaceContext = None) -> WorkspaceContext:  # ctx injected via Depends in routes
        if ctx is None:
            raise AppError(code="UNAUTHENTICATED", message="No context", status_code=401)
        if "*" not in ctx.permissions and perm not in ctx.permissions:
            raise AppError(code="FORBIDDEN", message="Insufficient permissions", status_code=403)
        return ctx
    return _guard
```

> Note for the route wiring in Task 10: `require_permission` guards are attached with `Depends`, and they in turn depend on `get_current_context`. In routes, write `ctx: WorkspaceContext = Depends(get_current_context)` and add `Depends(require_permission("..."))` to the route's `dependencies=[...]` list, OR compose them. The unit test above calls `_guard(ctx=...)` directly.

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/test_dependencies.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/dependencies.py backend/tests/test_dependencies.py
git commit -m "feat(backend): add auth context and permission-guard dependencies"
```

---

### Task 10: Auth API — register, login, refresh, logout, switch-workspace

**Files:**
- Create: `backend/app/schemas/auth.py`
- Create: `backend/app/api/__init__.py`
- Create: `backend/app/api/v1/__init__.py`
- Create: `backend/app/api/v1/auth.py`
- Modify: `backend/app/services/auth_service.py` (add `refresh`, `logout`, `switch_workspace`)
- Modify: `backend/app/main.py` (mount the auth router)
- Test: `backend/tests/test_auth_api.py`

**Interfaces:**
- Consumes: `auth_service`, envelopes, `get_current_context`, `get_session`.
- Produces route handlers under `/api/v1/auth`: `POST /register`, `POST /login`, `POST /refresh`, `POST /logout`, `POST /switch-workspace`. Adds service functions:
  - `auth_service.refresh(session, *, refresh_token) -> dict` — validates active hashed token, rotates it (revoke old + issue new), returns token dict. Raises `AppError("INVALID_REFRESH", ..., 401)`.
  - `auth_service.logout(session, *, refresh_token) -> None` — revokes the token if present.
  - `auth_service.switch_workspace(session, *, user_id, target_workspace_id) -> dict` — verifies membership, issues tokens scoped to target. Raises `AppError("FORBIDDEN", ..., 403)` if not a member.

- [ ] **Step 1: Write request schemas**

```python
# backend/app/schemas/auth.py
from pydantic import BaseModel, EmailStr, Field


class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    full_name: str = Field(min_length=1)
    org_name: str = Field(min_length=1)


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class RefreshIn(BaseModel):
    refresh_token: str


class LogoutIn(BaseModel):
    refresh_token: str


class SwitchWorkspaceIn(BaseModel):
    workspace_id: str
```

- [ ] **Step 2: Write the failing test**

```python
# backend/tests/test_auth_api.py
import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from app.core.database import Base, get_session
from app.core.seed import seed_roles
from app.main import create_app


@pytest_asyncio.fixture
async def client():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as s:
        await seed_roles(s)

    async def _override():
        async with factory() as s:
            yield s

    app = create_app()
    app.dependency_overrides[get_session] = _override
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as ac:
        yield ac
    await engine.dispose()


@pytest.mark.asyncio
async def test_register_login_refresh_logout_flow(client):
    r = await client.post("/api/v1/auth/register", json={
        "email": "a@b.com", "password": "Secret123", "full_name": "A", "org_name": "Acme"})
    assert r.status_code == 201
    data = r.json()["data"]
    assert data["access_token"] and data["refresh_token"]

    r = await client.post("/api/v1/auth/login", json={"email": "a@b.com", "password": "Secret123"})
    assert r.status_code == 200
    refresh = r.json()["data"]["refresh_token"]

    r = await client.post("/api/v1/auth/refresh", json={"refresh_token": refresh})
    assert r.status_code == 200
    new_refresh = r.json()["data"]["refresh_token"]
    assert new_refresh != refresh  # rotated

    # old refresh no longer works
    r = await client.post("/api/v1/auth/refresh", json={"refresh_token": refresh})
    assert r.status_code == 401

    r = await client.post("/api/v1/auth/logout", json={"refresh_token": new_refresh})
    assert r.status_code == 200
    r = await client.post("/api/v1/auth/refresh", json={"refresh_token": new_refresh})
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_login_wrong_password_is_401(client):
    await client.post("/api/v1/auth/register", json={
        "email": "a@b.com", "password": "Secret123", "full_name": "A", "org_name": "Acme"})
    r = await client.post("/api/v1/auth/login", json={"email": "a@b.com", "password": "nope"})
    assert r.status_code == 401
    assert r.json()["error"] == "INVALID_CREDENTIALS"
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pytest tests/test_auth_api.py -v`
Expected: FAIL — auth router not mounted / service functions missing.

- [ ] **Step 4: Add service functions**

Append to `backend/app/services/auth_service.py`:

```python
async def refresh(session: AsyncSession, *, refresh_token: str) -> dict:
    from app.core.security import sha256, decode_token
    from jose import JWTError
    try:
        payload = decode_token(refresh_token)
    except JWTError:
        raise AppError(code="INVALID_REFRESH", message="Invalid refresh token", status_code=401)
    if payload.get("type") != "refresh":
        raise AppError(code="INVALID_REFRESH", message="Not a refresh token", status_code=401)
    stored = await refresh_token_repo.get_active(session, token_hash=sha256(refresh_token))
    if not stored:
        raise AppError(code="INVALID_REFRESH", message="Refresh token expired or revoked", status_code=401)
    await refresh_token_repo.revoke(session, token=stored)
    user = (await session.execute(select_user := _select_user(payload["sub"]))).scalar_one()
    m = await membership_repo.get(session, user_id=user.id, workspace_id=uuid.UUID(payload["workspace_id"]))
    role = await _role_by_id(session, m.role_id)
    tokens = await _issue_tokens(session, user=user, workspace_id=m.workspace_id, role=role)
    await session.commit()
    return tokens


async def logout(session: AsyncSession, *, refresh_token: str) -> None:
    from app.core.security import sha256
    stored = await refresh_token_repo.get_active(session, token_hash=sha256(refresh_token))
    if stored:
        await refresh_token_repo.revoke(session, token=stored)
    await session.commit()


async def switch_workspace(session: AsyncSession, *, user_id: str, target_workspace_id: str) -> dict:
    user = (await session.execute(_select_user(user_id))).scalar_one()
    m = await membership_repo.get(session, user_id=user.id, workspace_id=uuid.UUID(target_workspace_id))
    if not m:
        raise AppError(code="FORBIDDEN", message="Not a member of that workspace", status_code=403)
    role = await _role_by_id(session, m.role_id)
    tokens = await _issue_tokens(session, user=user, workspace_id=m.workspace_id, role=role)
    await session.commit()
    return tokens
```

Also add these helpers near the top of the same file (after `_role_by_name`):

```python
from app.models import User


def _select_user(user_id: str):
    return select(User).where(User.id == uuid.UUID(user_id), User.deleted_at.is_(None))


async def _role_by_id(session: AsyncSession, role_id) -> Role:
    return (await session.execute(select(Role).where(Role.id == role_id))).scalar_one()
```

- [ ] **Step 5: Write the auth router**

```python
# backend/app/api/__init__.py
```
```python
# backend/app/api/v1/__init__.py
```
```python
# backend/app/api/v1/auth.py
from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.dependencies import WorkspaceContext, get_current_context
from app.schemas.auth import RegisterIn, LoginIn, RefreshIn, LogoutIn, SwitchWorkspaceIn
from app.schemas.envelope import success
from app.services import auth_service

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


def _serialize(tokens: dict) -> dict:
    return {
        "access_token": tokens["access_token"],
        "refresh_token": tokens["refresh_token"],
        "user_id": str(tokens["user_id"]),
        "workspace_id": str(tokens["workspace_id"]),
    }


@router.post("/register")
async def register(body: RegisterIn, session: AsyncSession = Depends(get_session)):
    tokens = await auth_service.register(
        session, email=body.email, password=body.password,
        full_name=body.full_name, org_name=body.org_name,
    )
    return JSONResponse(status_code=201, content=success(_serialize(tokens)))


@router.post("/login")
async def login(body: LoginIn, session: AsyncSession = Depends(get_session)):
    tokens = await auth_service.login(session, email=body.email, password=body.password)
    return success(_serialize(tokens))


@router.post("/refresh")
async def refresh(body: RefreshIn, session: AsyncSession = Depends(get_session)):
    tokens = await auth_service.refresh(session, refresh_token=body.refresh_token)
    return success(_serialize(tokens))


@router.post("/logout")
async def logout(body: LogoutIn, session: AsyncSession = Depends(get_session)):
    await auth_service.logout(session, refresh_token=body.refresh_token)
    return success({"logged_out": True})


@router.post("/switch-workspace")
async def switch_workspace(
    body: SwitchWorkspaceIn,
    ctx: WorkspaceContext = Depends(get_current_context),
    session: AsyncSession = Depends(get_session),
):
    tokens = await auth_service.switch_workspace(
        session, user_id=ctx.user_id, target_workspace_id=body.workspace_id
    )
    return success(_serialize(tokens))
```

- [ ] **Step 6: Mount the router in main.py**

Add inside `create_app()` before `return app`:

```python
    from app.api.v1.auth import router as auth_router
    app.include_router(auth_router)
```

- [ ] **Step 7: Run test to verify it passes**

Run: `pytest tests/test_auth_api.py -v`
Expected: PASS (all flow assertions green).

- [ ] **Step 8: Commit**

```bash
git add backend/app/api/ backend/app/schemas/auth.py backend/app/services/auth_service.py backend/app/main.py backend/tests/test_auth_api.py
git commit -m "feat(backend): add auth endpoints (register/login/refresh/logout/switch-workspace)"
```

---

### Task 11: Cross-workspace isolation test (the phase's safety net)

**Files:**
- Test: `backend/tests/test_isolation.py`

**Interfaces:**
- Consumes: the `client` fixture pattern from Task 10, `switch_workspace` endpoint, `get_current_context`.
- Produces: no new code — a guard test proving a user cannot obtain a token for a workspace they don't belong to.

- [ ] **Step 1: Write the isolation test**

```python
# backend/tests/test_isolation.py
import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from app.core.database import Base, get_session
from app.core.seed import seed_roles
from app.main import create_app


@pytest_asyncio.fixture
async def client():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as s:
        await seed_roles(s)

    async def _override():
        async with factory() as s:
            yield s

    app = create_app()
    app.dependency_overrides[get_session] = _override
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as ac:
        yield ac
    await engine.dispose()


@pytest.mark.asyncio
async def test_user_cannot_switch_into_foreign_workspace(client):
    # User A (org Acme, workspace WA)
    ra = await client.post("/api/v1/auth/register", json={
        "email": "a@a.com", "password": "Secret123", "full_name": "A", "org_name": "Acme"})
    a_access = ra.json()["data"]["access_token"]

    # User B (org Beta, workspace WB) — B's workspace id
    rb = await client.post("/api/v1/auth/register", json={
        "email": "b@b.com", "password": "Secret123", "full_name": "B", "org_name": "Beta"})
    b_workspace = rb.json()["data"]["workspace_id"]

    # A tries to switch into B's workspace → must be 403
    resp = await client.post(
        "/api/v1/auth/switch-workspace",
        json={"workspace_id": b_workspace},
        headers={"Authorization": f"Bearer {a_access}"},
    )
    assert resp.status_code == 403
    assert resp.json()["error"] == "FORBIDDEN"


@pytest.mark.asyncio
async def test_unauthenticated_switch_is_401(client):
    r = await client.post("/api/v1/auth/switch-workspace", json={"workspace_id": "x"})
    assert r.status_code == 401
```

- [ ] **Step 2: Run test to verify it passes**

Run: `pytest tests/test_isolation.py -v`
Expected: PASS — confirms cross-workspace access is denied.

- [ ] **Step 3: Run the full suite**

Run: `pytest -v`
Expected: ALL tests pass (health, database, models, seed, security, errors, repositories, auth_service, dependencies, auth_api, isolation).

- [ ] **Step 4: Commit**

```bash
git add backend/tests/test_isolation.py
git commit -m "test(backend): add cross-workspace isolation safety-net tests"
```

---

## Self-Review Notes (completed by plan author)

- **Spec coverage:** FastAPI structure (T1–T2), async DB (T2), models + soft delete + UUID (T3), migrations + RLS-ready schema (T4; RLS policies themselves are a Supabase-console step tracked in Plan 2/deployment), JWT auth register/login/refresh/logout (T5, T8, T10), RBAC dependency (T9), isolation enforcement + test (T7 scoping, T11). Org/workspace/user *management endpoints* and the Next.js shell are intentionally deferred to Plan 2 and Plan 3.
- **Placeholder scan:** No TBD/TODO; every code step shows complete code.
- **Type consistency:** `_issue_tokens` return dict keys (`access_token, refresh_token, user_id, workspace_id`) are consistent across service and router `_serialize`. `WorkspaceContext` field names match between `dependencies.py` and its tests. `get_active`/`revoke`/`create` repo signatures match their callers.
- **Deferred to Plan 2:** live Postgres RLS policies, management CRUD, audit-log write decorator wiring into routes.
