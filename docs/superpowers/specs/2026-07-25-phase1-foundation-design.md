# Phase 1 — Foundation — Design

- **Date:** 2026-07-25
- **Status:** Approved (design). **Amended 2026-08-11** — see the amendment note below; Phase 1 is now built as slices 1a / 1b / 1c.
- **Parent:** `2026-07-25-webchatbots-platform-architecture.md`
- **Children:** `2026-08-11-phase1a-backend-identity-core-design.md` (identity core — supersedes this document where they differ)
- **Scope:** Identity, tenancy, and the shells that every later phase builds on. No chatbots, flows, RAG, or widget in this phase.

---

> ## Amendment — 2026-08-11
>
> Phase 1 is delivered in three slices, each with its own spec → plan → build cycle: **1a** backend identity core, **1b** management API, **1c** React dashboard. Three decisions in this document are superseded:
>
> 1. **§5.1 token claims** — the access JWT no longer embeds `role` or `permissions`; both resolve from the database per request. This closes a 15-minute stale-privilege window and makes access revocable.
> 2. **§9 frontend** — **React SPA (Vite + React Router v7), not Next.js.**
> 3. **§10 testing** — tests run against real Postgres via `testcontainers`, not SQLite; the RLS smoke test in this section is unreachable on SQLite.
>
> Sections marked below carry inline notes. Everything else stands.

---

## 1. Goal

Stand up a secure multi-tenant foundation: a customer can register an organization, get a default workspace, log in, invite/manage users with roles, and land in an authenticated dashboard shell. Every later phase inherits this phase's auth, isolation, RBAC, audit, and API-envelope machinery for free.

## 2. In scope

- Supabase project: schema, extensions, RLS policies (defense-in-depth).
- FastAPI project structure + async SQLAlchemy 2.0 + Alembic.
- JWT auth: register, login, refresh, logout.
- Organization + workspace + user management (CRUD within scope).
- Role-based access control middleware/dependency.
- Next.js scaffold: auth pages + protected dashboard layout/shell.

## 3. Out of scope (this phase)

Chatbot/flow/KB/widget/analytics/billing features and their tables; provider credentials UI (Phase 3); API-key management (Phase 5); social login; email verification flow beyond a stub hook.

## 4. Data model (Phase 1 tables)

All tables: UUID PK, `workspace_id` where tenant-scoped, `created_at`, `updated_at`, `deleted_at` (nullable, soft delete). FKs indexed.

- **organizations** — `id, name, plan (enum: free|pro|enterprise), created_at, updated_at, deleted_at`. Top-level billing boundary.
- **workspaces** — `id, organization_id (FK), name, timezone, created_at, updated_at, deleted_at`. Isolation unit. A new org gets one default workspace.
- **users** — `id, email (unique, citext), password_hash (bcrypt), full_name, is_active, created_at, updated_at, deleted_at`. Identity is global; workspace access is via memberships.
- **roles** — `id, name (owner|admin|member|viewer), permissions (text[]), is_system, created_at`. System roles seeded; workspace-custom roles allowed later.
- **memberships** — `id, user_id (FK), workspace_id (FK), role_id (FK), created_at, updated_at, deleted_at`. Unique(user_id, workspace_id). Enables one user in many workspaces with different roles.
- **refresh_tokens** — `id, user_id (FK), token_hash (SHA-256), workspace_id, expires_at, revoked_at, created_at`. Enables 7-day refresh, logout, and revocation.
- **audit_logs** — `id, workspace_id, actor_id, action, target_type, target_id, metadata (jsonb), created_at`. Append-only.

**Seed data:** four system roles with permission sets — `owner` (all), `admin` (manage workspace + users), `member` (use features), `viewer` (read-only).

## 5. Authentication

### 5.1 Token model

> **Amended 2026-08-11:** claims are identity-only — `sub`, `email`, `workspace_id`, `type`, `exp`, `iat`, `jti`. `role` and `permissions` are resolved per request from the database.

- **Access JWT** — 15 min. ~~Claims: `sub` (user_id), `email`, `workspace_id` (active workspace), `role`, `permissions`, `exp`, `iat`, `jti`.~~
- **Refresh JWT** — 7 days. Stored server-side as SHA-256 hash in `refresh_tokens`; rotated on use; revocable.
- Signed HS256 with `JWT_SECRET`.

### 5.2 Endpoints (`/api/v1/auth`, unauthenticated)
- `POST /register` — creates user + organization + default workspace + owner membership in one transaction; returns tokens.
- `POST /login` — email + password → verify bcrypt → issue access + refresh (scoped to a default/last workspace). 401 on failure (generic message).
- `POST /refresh` — validate refresh token (exists, unexpired, unrevoked) → rotate → new access + refresh. 401 otherwise.
- `POST /logout` — revoke the presented refresh token (`revoked_at`).
- `POST /switch-workspace` *(authenticated)* — reissue access token scoped to another workspace the user is a member of. 403 if not a member.

### 5.3 Password rules
bcrypt hashing; minimum policy enforced by Pydantic/Zod (length ≥ 8, etc.). No plaintext ever stored or logged.

## 6. Multi-tenancy & RBAC enforcement

- **`get_current_user`** dependency: validates access JWT, loads user, rejects inactive.
- **`get_workspace_context`** dependency: extracts `workspace_id` + `role` + `permissions` from the token into a request-scoped object; verifies an active membership exists.
- **`require_permission("perm")`** dependency factory: 403 if the permission is absent from the token's set.
- **Repository rule:** every tenant-scoped repository method signature includes `workspace_id` and filters on it. Enforced by convention + code review; no bypass path.
- **RLS:** policies on every tenant table restrict rows to the session's workspace as defense-in-depth (the service key bypasses RLS, so this is a backstop, not the primary gate).

## 7. Management endpoints (authenticated, `/api/v1`)

- **organizations** — `GET /organizations/me` (current org), `PATCH /organizations/me` (owner/admin).
- **workspaces** — `GET /workspaces` (mine), `POST /workspaces` (create; owner/admin), `PATCH /workspaces/{id}`, `DELETE /workspaces/{id}` (soft).
- **users/members** — `GET /workspaces/{id}/members`, `POST /workspaces/{id}/members` (invite by email; assign role), `PATCH /members/{id}` (change role), `DELETE /members/{id}` (remove; soft).
- All return the standard envelope; all mutations write an audit log; all enforce role/permission.

## 8. Backend structure

```
backend/app/
  main.py                 # app + router mount + exception handlers + CORS
  core/{config,security,database}.py
  models/                 # SQLAlchemy: organization, workspace, user, role, membership, refresh_token, audit_log
  schemas/                # Pydantic v2 request/response + envelope models
  api/v1/{auth,organizations,workspaces,members}.py
  services/               # auth_service, org_service, workspace_service, member_service, audit_service
  repositories/           # one per aggregate, all workspace_id-scoped
  dependencies.py         # get_current_user, get_workspace_context, require_permission
alembic/                  # migrations
```

## 9. Frontend structure (Phase 1c)

> **Amended 2026-08-11: React SPA, not Next.js.** Vite + React 19 + TypeScript, React Router v7 in data mode, built to static assets. No server components, route groups, or middleware.

```
frontend/src/
  routes/
    login.tsx, register.tsx, forgot-password.tsx
    protected.tsx                  # route guard: redirects to /login when unauthenticated
    dashboard/layout.tsx           # shell: sidebar + navbar + workspace switcher
    dashboard/index.tsx            # landing (placeholder widgets)
    dashboard/team.tsx             # members list + invite + role change
    dashboard/settings.tsx         # org/workspace basics
  lib/{api.ts, auth.ts, store.ts}  # API client, token handling, Zustand
  router.tsx                       # route tree
```

- Access token held in memory only (never `localStorage`), with silent refresh on 401 inside the API client.
- **Refresh-token storage is an open decision for Phase 1c**, between (a) returning it in the JSON body and persisting it in `localStorage` — simple, but readable by any XSS — and (b) having the backend set it as an httpOnly `Secure` `SameSite` cookie, which an SPA cannot do for itself and which changes the Phase 1a `/auth/*` response shape. Phase 1a returns it in the body; if (b) wins, that is a deliberate Phase 1c amendment to the auth endpoints, not a silent change.
- Protection is a router guard, not a server-rendered layout check.
- React Hook Form + Zod on all forms; TanStack Query for server state; Zustand for UI/auth state; Tailwind + shadcn/ui.
- Token storage + silent refresh on 401 via the API client; workspace switcher calls `/auth/switch-workspace`.

## 10. Testing strategy

> **Amended 2026-08-11:** the test database is **real Postgres via `testcontainers`**, with the schema applied by running Alembic migrations. SQLite cannot express `citext`, `text[]`, `jsonb`, partial unique indexes, or RLS — which made the RLS smoke test below unreachable.

- **Backend:** pytest + async client. Unit tests for services (auth, RBAC, isolation). Integration tests hitting real endpoints against a test DB. **Isolation tests are mandatory:** assert workspace A can never read/mutate workspace B data via any endpoint. Token lifecycle tests (expiry, refresh rotation, revocation/logout). RLS smoke test.
- **Frontend:** component tests for auth forms (validation, error states); a happy-path integration for register → login → dashboard.

## 11. Success criteria

1. Register → organization + default workspace + owner membership created atomically; tokens returned.
2. Login/refresh/logout work with correct expiry, rotation, and revocation.
3. A user in two workspaces can switch context and sees only that workspace's data.
4. RBAC blocks a `viewer` from mutating and a non-member from any access (403).
5. Every mutation appears in `audit_logs`.
6. Isolation test suite passes: no cross-workspace data leakage on any endpoint.
7. Dashboard shell renders behind auth; unauthenticated access redirects to login.

## 12. Open items to resolve during planning

- Encryption approach for future `provider_credentials` (Phase 3) — note only; not built here.
- Invite delivery (email provider) — Phase 1 stubs the invite record + returns a token; real email is a later concern.
