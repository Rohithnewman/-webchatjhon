# Phase 1a — Backend Identity Core — Design

- **Date:** 2026-08-11
- **Status:** Approved (design); ready for implementation planning
- **Parent:** `2026-07-25-phase1-foundation-design.md`
- **Supersedes:** `docs/superpowers/plans/2026-07-25-phase1-backend-foundation-auth.md`
- **Scope:** The backend identity core — authentication, request-time authorization, audit, and tenant isolation, verified against a real Postgres. No management CRUD (Phase 1b), no frontend (Phase 1c).

---

## 1. Why this document exists

The superseded plan was reviewed and found to have defects that would have shipped a broken authorization layer. This design corrects them and re-scopes Phase 1 into three deliverable slices.

The defects that drove the rewrite:

1. `require_permission` declared `ctx: WorkspaceContext = None` with no `Depends(...)`. FastAPI cannot inject that — it would treat `WorkspaceContext` as a request parameter. The guard's unit test passed only because it bypassed FastAPI and called the inner function directly. **The phase's single security control was never exercised through a route.**
2. `passlib==1.7.4` with an unpinned `bcrypt` crashes on `bcrypt>=4.1` (`AttributeError: module 'bcrypt' has no attribute '__about__'`).
3. `python-jose` is effectively unmaintained and carries CVE-2024-33663 / CVE-2024-33664 — an unacceptable dependency for a JWT-centric phase.
4. Alembic autogeneration ran against the SQLite default `DATABASE_URL`, producing a SQLite-flavoured initial migration; the custom `GUID` TypeDecorator also requires `render_item` configuration that was absent.
5. Soft delete collided with total unique constraints: re-inviting a removed member, or reusing a soft-deleted email, raises `IntegrityError`.
6. The auth dependency never touched the database, contradicting the parent design §6 and leaving a 15-minute window in which deactivation, removal, and demotion have no effect.
7. Duplicate-email prevention was a read-then-write race.
8. Login skipped password verification for unknown emails, leaking account existence through response timing.
9. Rate limiting and the 429 path were specified platform-wide but implemented nowhere — including the one phase where brute force matters.
10. Tests ran on SQLite while production runs Postgres, making the stated RLS success criterion untestable.

## 2. Amendments to approved documents

These override previously approved decisions and are the load-bearing changes in this design.

| Document | Previous decision | Amended decision | Rationale |
|---|---|---|---|
| Architecture **D1** | Access JWT claims include `role` and `permissions` | Access JWT carries identity only: `sub`, `email`, `workspace_id`, `type`, `exp`, `iat`, `jti`. Role and permissions resolve from the database on every request. | Eliminates the stale-privilege window. Deactivation, workspace removal, and role demotion take effect immediately rather than after up to 15 minutes. Also shrinks the token. |
| Architecture §5 (Phase 1), §6 (Deployment); Parent design §9 | Next.js app router, deployed to Vercel with SSR | React SPA — Vite + React 19 + TypeScript, React Router v7 (data mode), TanStack Query, Zustand, React Hook Form + Zod, Tailwind + shadcn/ui. Built to static assets, served from any CDN. | An authenticated dashboard gains nothing from SSR or SEO. Removes server components, route groups, middleware, and Vercel-SSR coupling. All calls go directly to FastAPI over the already-whitelisted CORS origins. |
| Parent design §10 (Testing) | pytest against in-memory SQLite | pytest against real Postgres via `testcontainers`, schema applied by running Alembic migrations | `citext`, `text[]`, `jsonb`, partial unique indexes, and RLS cannot be exercised on SQLite. The parent design's own RLS success criterion was unreachable. |

Unchanged and still binding: two-level tenancy (D2), BYOK (D3), FastAPI-native WebSockets (D4), the layered `api → services → repositories` structure, the response envelopes, bcrypt for passwords, 15-minute access / 7-day refresh lifetimes, and workspace-scoped repository signatures.

## 3. Scope

### 3.1 In scope (Phase 1a)

- FastAPI project scaffold, settings, health and readiness endpoints.
- Async SQLAlchemy 2.0 engine, session dependency, Alembic migrations.
- Postgres-backed test harness.
- Models for all seven Phase 1 tables, with corrected constraints.
- Password hashing and JWT issue/verify.
- Register, login, refresh, logout, switch-workspace.
- Request-time authorization: principal → workspace context → permission guard.
- Audit logging for every state-changing auth operation.
- RLS policies plus a test that proves they bite.
- Login rate limiting and account lockout.
- Isolation, token-lifecycle, RBAC, and RLS test suites.

### 3.2 Deferred

- **Phase 1b:** organization, workspace, and member management endpoints; invite flow.
- **Phase 1c:** React dashboard — auth pages, protected shell, workspace switcher, team and settings screens.
- Later phases unchanged: provider credentials (3), API keys (5), email delivery, social login.

## 4. Technology and code organization

### 4.1 Stack

Python 3.12+. FastAPI with uvicorn. SQLAlchemy 2.0 async with asyncpg. Alembic. Pydantic v2 with pydantic-settings. **PyJWT** for tokens. **`bcrypt` used directly**, without passlib — this honours the architecture's mandated bcrypt algorithm while removing an unmaintained dependency and its known crash. pytest with pytest-asyncio, httpx, and `testcontainers[postgres]`.

Plus **`import-linter`**, which enforces the slice boundaries in §4.4 as a CI check rather than a convention.

### 4.2 Version pinning

**Version pins are resolved and recorded at implementation time** from the actual installed environment. Do not carry forward the pins in the superseded plan; they date from mid-2024 and include a `pytest-asyncio` version whose `event_loop` fixture override is deprecated and removed in later releases.

### 4.3 Configuration that breaks on first contact

- **Supabase connection.** The pooler endpoint (port 6543, PgBouncer transaction mode) requires asyncpg to disable prepared statements — `statement_cache_size=0` and a null `prepared_statement_cache_size`. Alembic must run against the **direct** connection (port 5432), never the pooler.
- **`CORS_ORIGINS`.** pydantic-settings parses `list[str]` from environment variables as JSON. A plain `CORS_ORIGINS=http://localhost:3000` raises at import. A `field_validator(mode="before")` splits comma-separated strings.

### 4.4 Backend layout — vertical slices

Per the amended architecture §3.2, code is organized by feature slice rather than by technical role.

```
backend/
  app/
    main.py                  # app factory: middleware, exception handlers, slice router registration
    core/                    # infrastructure only — imports no slice
      config.py              # Settings (+ CORS validator)
      database.py            # Base, engine, async_session_factory, get_session
      security.py            # bcrypt, PyJWT encode/decode, sha256 — pure, domain-free
      errors.py              # AppError + exception handlers
      envelope.py            # success() / error()
      rate_limit.py          # limiter interface + in-process implementation
      registry.py            # imports every slice's models.py so Base.metadata is complete
    shared/                  # shared kernel — deliberately tiny
      mixins.py              # TimestampMixin, uuid_pk
      context.py             # WorkspaceContext dataclass
      permissions.py         # permission string constants
    slices/
      tenancy/               # Organization, Workspace, Membership, Role, role seeding
      identity/              # User, RefreshToken; register/login/refresh/logout/switch_workspace
      authz/                 # get_workspace_context, require_permission
      audit/                 # AuditLog, record()
      health/                # liveness + readiness
  alembic/
  tests/                     # only cross-slice suites: isolation, RLS, migrations
    conftest.py              # testcontainers Postgres, Alembic-applied schema, client fixtures
```

Each slice contains `models.py`, `schemas.py`, `repository.py`, `use_cases/` (one module per operation), `router.py`, `api.py`, and `tests/`. Slice-local tests live **with the slice**; only genuinely cross-cutting suites live in the top-level `tests/`.

`api.py` is the slice's published interface and the only module other slices may import. Routers stay thin — parse, call a use case, wrap in the envelope. Repositories still take `workspace_id` as a mandatory keyword argument. Vertical slicing changes where code lives, not whether those boundaries exist.

**Model ownership across slices works because SQLAlchemy foreign keys reference table names as strings** (`ForeignKey("users.id")`), which creates no Python import edge. `core/registry.py` imports every slice's `models.py` so Alembic autogeneration sees complete metadata; nothing else imports models across slice boundaries.

### 4.5 Slice dependency graph

Dependencies form a DAG. Higher slices may import lower ones; never the reverse.

```
health   (core only)
  authz          → identity.api, tenancy.api
    identity     → tenancy.api, audit.api
      tenancy    → core, shared
      audit      → core, shared
```

`identity` owns authentication — who you are. `authz` owns authorization — what you may do in this workspace. They are split deliberately: the defect that motivated this rewrite lived precisely at that seam, and giving authorization its own slice with its own tests makes it hard to leave untested again.

Two `import-linter` contracts enforce this, and CI fails on violation:

1. A **layers** contract fixing the order above.
2. A **forbidden** contract barring every slice from importing any other slice's `models`, `repository`, or `use_cases` — `api` only.

## 5. Data model

All primary keys are native Postgres `UUID` with `server_default=gen_random_uuid()`. There is no portable-UUID TypeDecorator — it existed only to accommodate SQLite, and with SQLite gone it takes the Alembic `render_item` problem with it. All timestamps are `timestamptz`.

**organizations** — `id`, `name`, `plan` (`free|pro|enterprise`), `created_at`, `updated_at`, `deleted_at`.

**workspaces** — `id`, `organization_id` (FK, indexed), `name`, `timezone`, `created_at`, `updated_at`, `deleted_at`.

**users** — `id`, `email` (`citext`), `password_hash`, `full_name`, `is_active`, `failed_login_count` (default 0), `locked_until` (nullable), `last_workspace_id` (nullable FK), `created_at`, `updated_at`, `deleted_at`.
Email is lowercased on write in addition to being `citext`, so `A@b.com` and `a@b.com` cannot become two accounts. Uniqueness is a **partial** index: `UNIQUE (email) WHERE deleted_at IS NULL` — a total unique index would permanently burn the address of any soft-deleted user. `last_workspace_id` replaces the superseded plan's `memberships[0]`, which had no `ORDER BY` and therefore chose a workspace nondeterministically.

**roles** — `id`, `name`, `permissions` (`text[]`), `is_system`, `created_at`. Unique on `name` where `is_system` is true, which makes seeding idempotent at the database level rather than relying on the seed function alone.

**memberships** — `id`, `user_id` (FK, indexed), `workspace_id` (FK, indexed), `role_id` (FK, indexed), timestamps.
Uniqueness is partial: `UNIQUE (user_id, workspace_id) WHERE deleted_at IS NULL`. Without this, removing a member and re-inviting them raises `IntegrityError` — a bug Phase 1b would have hit immediately.

**refresh_tokens** — `id`, `user_id` (FK, indexed), `workspace_id` (FK, indexed), `family_id` (indexed), `token_hash` (SHA-256, unique), `expires_at`, `revoked_at`, `created_at`.
`family_id` groups a rotation chain so that reuse of a superseded token can revoke every descendant.

**audit_logs** — `id`, `workspace_id` (**nullable**, indexed), `actor_id` (**nullable** FK), `action`, `target_type`, `target_id`, `metadata` (`jsonb`), `created_at`.
Append-only, and therefore carries **no** `updated_at` and **no** `deleted_at`. The superseded plan applied the standard timestamp mixin here, which contradicted its own "append-only" description.

Both nullable columns are deliberate. `actor_id` is null for system-originated actions. `workspace_id` is null for **platform-level** events that precede or fall outside any workspace — most importantly a failed login for an unrecognized email, where there is no tenant to attribute the row to. This does not weaken the architecture's "every tenant table carries `workspace_id`" rule, which governs tenant *data*; and it composes correctly with RLS, since `workspace_id = current_setting(...)` excludes NULL rows, keeping platform events invisible to tenant-scoped reads.

**Seed data:** four system roles — `owner` (`*`), `admin` (`workspace:manage`, `members:manage`, `features:use`, `features:read`), `member` (`features:use`, `features:read`), `viewer` (`features:read`).

## 6. Authentication

### 6.1 Tokens

Access tokens live 15 minutes and carry `sub`, `email`, `workspace_id`, `type`, `exp`, `iat`, `jti` — identity only, per §2. Refresh tokens live 7 days, carry `sub`, `workspace_id`, `family_id`, `type`, and are persisted only as a SHA-256 hash. Both are HS256 over `JWT_SECRET`. Every verification asserts the `type` claim, so a refresh token can never be presented as an access token.

### 6.2 Register

Normalize the email, hash the password with bcrypt, and in a single transaction create the organization, its default workspace, the user, and an `owner` membership, then issue tokens and write an audit row.

Duplicate emails are rejected by **catching `IntegrityError` on the partial unique index**, not by a preceding `SELECT`. The read-then-write check in the superseded plan is a race: two concurrent registrations both pass it. A pre-check may remain as a friendly fast path, but the constraint is the authority.

### 6.3 Login

If `locked_until` is in the future, reject with `ACCOUNT_LOCKED` (423). Otherwise **always perform a bcrypt verification** — against a fixed dummy hash when the email is unknown — so that response time does not reveal whether an account exists. The superseded plan short-circuited on unknown emails, which is a textbook user-enumeration oracle.

On failure, increment `failed_login_count`; at the threshold, set `locked_until`. On success, reset both counters, set `last_workspace_id`, and issue tokens scoped to it (falling back to the earliest membership by `created_at` when null). Failures return a generic `INVALID_CREDENTIALS` (401) that never distinguishes unknown email from wrong password.

### 6.4 Refresh

Decode, assert `type == "refresh"`, look the SHA-256 hash up, and require it to be unexpired and unrevoked. On success, revoke the presented token and issue a replacement **in the same `family_id`**.

If the token decodes validly but is already revoked, that is a **reuse signal**: revoke every token in the family, write an `auth.refresh_reuse_detected` audit row, and return 401. The superseded plan returned a bare 401 and left the stolen family live.

### 6.5 Logout and switch-workspace

Logout revokes the presented token. Switch-workspace verifies membership in the target (403 otherwise), **revokes the caller's current refresh token**, and issues a new family scoped to the target — the superseded plan orphaned the old token, letting them accumulate without bound.

### 6.6 Password rules

Length is validated by Pydantic at **minimum 8 characters and maximum 72 bytes when UTF-8 encoded**. The upper bound is not cosmetic: bcrypt silently truncates beyond 72 bytes, so a longer password would be accepted and then quietly weakened. Rejecting it is the honest behaviour. Passwords are never logged, never returned, and never stored in plaintext.

## 7. Authorization

Three layers, each a FastAPI dependency:

**`get_current_principal`** — extracts the bearer token, decodes it, asserts `type == "access"`, and returns `sub` / `email` / `workspace_id`. Any failure is `UNAUTHENTICATED` (401).

**`get_workspace_context`** — depends on the principal and performs **two indexed lookups**: `identity.api` confirms the user is active and not soft-deleted, and `tenancy.api` joins `memberships → roles` for that `(user_id, workspace_id)` pair. Returns 401 if the user is inactive or soft-deleted, 403 if no live membership exists, and otherwise a `WorkspaceContext(user_id, email, workspace_id, role, permissions)` carrying **current** permissions read from the database.

Two lookups rather than one join is a deliberate cost of the slice boundary: a single query spanning `users` and `memberships` would require `authz` to import another slice's models, which §4.4 forbids. Both lookups hit unique indexes and are sub-millisecond. If profiling ever shows this matters, the fix is the Redis cache already contemplated in §10 — not a boundary violation.

**`require_permission(perm)`** — returns a dependency whose signature is `ctx: WorkspaceContext = Depends(get_workspace_context)`. This injection is the correction to the central defect: the superseded version defaulted `ctx` to `None` with no `Depends`, so FastAPI would have tried to bind `WorkspaceContext` from the request. Grants when `perm` or `*` is present; otherwise `FORBIDDEN` (403).

Correctness here is established by **route-level tests issuing real HTTP requests**, never by calling the guard function directly.

The repository rule from the architecture stands unchanged: every tenant-scoped repository method takes `workspace_id` as a mandatory keyword argument, and no code path queries tenant data without one.

## 8. Audit logging

`audit_service.record(session, *, workspace_id, actor_id, action, target_type, target_id, metadata)` writes within the **caller's transaction**, so an audit row and the mutation it describes commit or roll back together and cannot drift apart.

Calls are explicit at the service layer rather than applied by a route decorator. A decorator sees the HTTP envelope but not the domain outcome — it cannot reliably record which entity changed or what the prior value was.

Phase 1a actions: `auth.register`, `auth.login`, `auth.logout`, `auth.refresh`, `auth.refresh_reuse_detected`, `auth.switch_workspace`, `auth.login_failed`, `auth.account_locked`.

## 9. Tenant isolation and RLS

Primary enforcement is the service and repository layer, per architecture D1. RLS is defense-in-depth.

Every tenant-scoped table gets `ENABLE ROW LEVEL SECURITY` and a policy of the form `workspace_id = current_setting('app.workspace_id', true)::uuid`. The `true` argument makes an unset variable return NULL instead of raising.

Because the application connects as the table owner, it bypasses RLS — which is what D1 intends but also what makes RLS easy to ship broken and never notice. To prevent that, migrations additionally create a **restricted non-owner role** with `SELECT` granted on the tenant tables. The RLS test suite uses `SET LOCAL ROLE` to assume it, sets `app.workspace_id` to workspace A, and asserts that selecting workspace B's rows returns zero. This is the check that was impossible under SQLite.

## 10. Rate limiting

Deliberately split by what each layer can actually guarantee:

- **Account lockout is stored in Postgres** (`failed_login_count`, `locked_until`). It is therefore correct across every worker process and every Render instance.
- **Per-IP throttling is an in-process limiter** behind a small pluggable interface, applied to `/auth/register`, `/auth/login`, and `/auth/refresh`. It is honestly best-effort *per worker* and is documented as such; the interface exists so the Redis-backed implementation drops in during the phase that introduces Upstash Redis, with no call-site changes.

Both surface as `RATE_LIMITED` (429) through the standard error envelope. Presenting an in-memory counter as a global rate limit would be the dishonest option; naming the limitation is the correct one.

## 11. API surface (Phase 1a)

All under `/api/v1`, all responses in the standard envelopes from architecture §3.3.

| Method | Path | Auth | Success |
|---|---|---|---|
| GET | `/health` | none | 200 — liveness only, no DB call |
| GET | `/health/ready` | none | 200 — executes `SELECT 1`; 503 if the DB is unreachable |
| POST | `/auth/register` | none | 201 |
| POST | `/auth/login` | none | 200 |
| POST | `/auth/refresh` | none | 200 |
| POST | `/auth/logout` | none | 200 |
| POST | `/auth/switch-workspace` | access token | 200 |

The superseded plan's health check returned `ok` unconditionally, so it would have reported healthy with the database down. Splitting liveness from readiness fixes that.

**Error codes:** `VALIDATION_ERROR` (400), `EMAIL_TAKEN` (400), `INVALID_CREDENTIALS` (401), `UNAUTHENTICATED` (401), `INVALID_REFRESH` (401), `FORBIDDEN` (403), `NOT_FOUND` (404), `ACCOUNT_LOCKED` (423), `RATE_LIMITED` (429), `INTERNAL_ERROR` (500). A catch-all handler maps unhandled exceptions to `INTERNAL_ERROR` without leaking tracebacks.

`423 Locked` **extends** the status list in architecture §3.3, which enumerated 200/201/400/401/403/404/429/500. It is added deliberately: lockout is a distinct condition from bad credentials (401) and from throttling (429), and collapsing it into either would leave the client unable to tell the user why they are blocked. All other codes are unchanged.

## 12. Testing

A session-scoped `testcontainers` Postgres container, with the schema created **by running Alembic migrations** rather than `Base.metadata.create_all`. This means every test run also proves the migrations apply cleanly — something the superseded plan never checked, despite migrations being a deliverable. Each test runs inside a transaction that is rolled back afterwards.

Four suites carry the phase:

- **Isolation.** For every authenticated route, a user in workspace A cannot read or mutate workspace B. This suite grows with every future phase and is the platform's standing safety net.
- **Token lifecycle.** Expiry, rotation, family reuse detection, revocation on logout, refresh-token rejection at access-token endpoints.
- **RBAC through HTTP.** A `viewer` receives 403 on a guarded route; an `owner` receives 200; a user whose membership was removed receives 403 on their *next* request, with no 15-minute grace.
- **RLS.** Cross-workspace `SELECT` under the restricted role returns zero rows.

Plus unit coverage for password hashing, JWT encode/decode, envelope shaping, and each repository.

## 13. Success criteria

1. Register creates organization, workspace, user, and owner membership atomically; a mid-transaction failure leaves no partial rows.
2. Concurrent registration with the same email produces exactly one user and one `EMAIL_TAKEN`.
3. Login is timing-neutral between unknown-email and wrong-password, and locks an account after the configured failure threshold.
4. Refresh rotates within a family; reusing a superseded token revokes the whole family and is audited.
5. Deactivating a user, removing their membership, or changing their role takes effect on their **next request** — no stale-privilege window.
6. `require_permission` returns 403 through a real HTTP request for an under-privileged role.
7. The isolation suite passes on every route.
8. RLS blocks cross-workspace reads under the restricted role.
9. Every auth mutation appears in `audit_logs`, in the same transaction as its effect.
10. Alembic migrations apply cleanly from empty to head as part of the test run.

## 14. Follow-on work

**Phase 1b — Management API.** Organization, workspace, and member CRUD; invite records; role changes. Adds `workspaces` and `members` slices consuming `authz` and `tenancy.api`; the audit and RBAC machinery from this phase applies unchanged to each new route.

**Phase 1c — React Dashboard.** Vite + React Router v7 SPA using **Feature-Sliced Design**, the frontend analogue of the backend's vertical slices. Layers import strictly downward:

```
frontend/src/
  app/        # providers, router, global styles — composition root
  pages/      # login, register, dashboard, team, settings
  widgets/    # dashboard-shell, workspace-switcher
  features/   # login-form, register-form, switch-workspace, invite-member, change-role
  entities/   # user, organization, workspace, membership — types, API bindings, display components
  shared/     # api client (token handling + refresh-on-401), ui kit, lib, config
```

Slice names mirror the backend deliberately: backend `identity` maps to `entities/user` plus the `login-form` / `register-form` features; backend `tenancy` maps to `entities/workspace`, `entities/organization`, `entities/membership` plus `switch-workspace`. A change to workspace switching then has exactly one obvious home on each side of the wire.

The downward-import rule is enforced by ESLint boundary rules in CI, matching the role `import-linter` plays on the backend. Also carried over: in-memory access token, refresh-on-401 inside the shared API client, and a router guard for protection.

Both follow the same spec → plan → build cycle as this phase.
