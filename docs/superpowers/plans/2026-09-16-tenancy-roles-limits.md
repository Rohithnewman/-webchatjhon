# Tenancy, Roles and Limits Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Superadmins manage organisations, subscriptions and limits only; organisation admins define roles from a permission catalogue and run their bots within those limits.

**Architecture:** No new slices except a `roles` router inside the existing `members` slice. Three reversible migrations. The permission catalogue replaces `features:use`; every route guard names exactly one catalogue permission. The JWT gains an optional workspace so superadmins carry no tenancy.

**Tech Stack:** unchanged (FastAPI, SQLAlchemy async, Alembic, PostgreSQL 18, pytest; React 19, TypeScript, TanStack Query).

**Spec:** `docs/superpowers/specs/2026-09-16-tenancy-roles-limits-design.md`

## Global Constraints

- Everything in `docs/superpowers/plans/2026-09-11-demo-completion.md` → Global Constraints still binds (workspace-scoped repositories, `api.py`-only cross-slice imports, `lint-imports` 3 kept / 0 broken, audit in the same transaction, 400 `VALIDATION_ERROR`, typecheck clean, explicit `git add` paths, never touch `frontend/src/widgets/animated-login/**` or `frontend/scripts/**`).
- Layers contract: `authz → identity → tenancy` (tenancy imports neither identity nor chatbots nor conversations).
- Error codes are exactly the spec's: `NO_WORKSPACE`, `SUPERADMIN_HAS_NO_WORKSPACE`, `USER_IS_TENANT_MEMBER`, `SUPERADMIN_CANNOT_JOIN`, `PLAN_LIMIT`, `SYSTEM_ROLE`, `ROLE_IN_USE`.
- Commit trailers: `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_01XVPnhzFLnH86UgCemYzjeW`.
- Execution order: 1 → 7. Task 7 last.

---

### Task 1: Superadmin without tenancy (backend) + CORS headers on 500s

**Files:**
- Create: `backend/alembic/versions/0012_nullable_token_workspace.py`
- Modify: `backend/app/core/security.py` (`create_access_token(workspace_id: str | None)`, `create_refresh_token(workspace_id: str | None)`, claims may be `None`), `backend/app/shared/context.py` (`Principal.workspace_id: uuid.UUID | None`), `backend/app/slices/identity/models.py` (RefreshToken.workspace_id nullable), `backend/app/slices/identity/repository.py` (insert_refresh_token accepts None), `backend/app/slices/identity/use_cases/tokens.py` (`TokenBundle.workspace_id: uuid.UUID | None`), `login.py` (superadmin → `workspace_id=None`, skip membership checks; audit with workspace_id None), `refresh.py` (claims match with None), `switch_workspace.py` (superadmin → 403 `SUPERADMIN_HAS_NO_WORKSPACE`), `dependencies.py` (`get_current_principal` reads a null claim), `router.py` (`_serialize` emits `workspace_id: None`; `/auth/me` returns `workspace_id None, role None, permissions [], subscription None` for a superadmin; `/auth/workspaces` returns `[]`), `backend/app/slices/authz/dependencies.py` (`NO_WORKSPACE` / `SUPERADMIN_HAS_NO_WORKSPACE` before the membership lookup), `backend/app/slices/admin/router.py` (`update_user` refuses `is_superadmin=True` when `tenancy_api.list_user_workspaces` is non-empty → 409 `USER_IS_TENANT_MEMBER`), `backend/app/slices/members/router.py` (`add_member` refuses a superadmin target → 400 `SUPERADMIN_CANNOT_JOIN`), `backend/app/slices/identity/api.py` (`UserSummary.is_superadmin` already; `ensure_superadmin` gains `detach_memberships` via `tenancy_api.remove_all_memberships(session, user_id=...)` — new tenancy api + repository function soft-deleting every membership of the user), `backend/scripts/create_superadmin.py` (no Platform organisation; calls ensure_superadmin only), `backend/scripts/seed_demo.py` (nothing else needed), `backend/app/core/errors.py` (500 handler adds `Access-Control-Allow-Origin: <origin>`, `Vary: Origin`, `Access-Control-Allow-Credentials: true` when the request's Origin is in `settings.CORS_ORIGINS` or `settings.WIDGET_CORS_ALL_ORIGINS`).
- Tests: `backend/app/slices/identity/tests/test_superadmin_tenancy.py`, `backend/tests/test_errors.py` (append the CORS-on-500 test), `backend/tests/test_migrations.py` (chain), update any test asserting a superadmin's workspace (e.g. `admin/tests/test_admin_api.py::_superadmin` — the superadmin is now registered then promoted; its own registration organisation is detached by promotion in the script, but in tests promotion via `set_user_flags` keeps the membership unless tests call `remove_all_memberships`; make `_superadmin` helpers promote via `identity_api.ensure_superadmin(...)` semantics: promote + detach; adjust `test_stats_and_organizations_span_every_tenant` expectations if the Platform organisation no longer counts as a member for the superadmin — it still exists as an organisation row; counts of organisations stay, member_count of that org drops to 0).

**Interfaces (produced):**
- `tenancy_api.remove_all_memberships(session, *, user_id) -> int`
- `identity_api.ensure_superadmin(...)` now also detaches memberships (documented in its docstring).
- `Principal.workspace_id` optional; `TokenBundle.workspace_id` optional; login/refresh responses carry `"workspace_id": null` for superadmins.

**Tests to write first (RED):**
```python
async def test_superadmin_login_has_no_workspace(client, session): ...   # register, ensure_superadmin, login → data["workspace_id"] is None; /auth/me role None, permissions [], subscription None, workspace_id None; /auth/workspaces == []
async def test_superadmin_is_refused_on_workspace_routes(client, session): ...  # GET /chatbots → 403 SUPERADMIN_HAS_NO_WORKSPACE; POST /auth/switch-workspace → 403
async def test_superadmin_cannot_be_added_as_member(client, session): ...  # owner POST /workspace/members with the superadmin's email → 400 SUPERADMIN_CANNOT_JOIN
async def test_member_cannot_be_promoted_to_superadmin(client, session): ...  # PATCH /admin/users/{owner} {"is_superadmin": true} → 409 USER_IS_TENANT_MEMBER
async def test_refresh_keeps_null_workspace(client, session): ...  # superadmin refresh → workspace_id None and /admin/stats still 200
async def test_500_carries_cors_headers(client): ...  # add a throwaway route raising RuntimeError on a test app; GET with Origin http://127.0.0.1:5173 → 500 with access-control-allow-origin header
```

- [ ] Write the tests, run RED. Implement. `pytest app/slices/identity app/slices/admin app/slices/members app/slices/authz tests -v`, full suite, lint-imports. Commit `feat(auth): superadmins carry no tenancy; CORS headers on server errors`.

---

### Task 2: Superadmin frontend

**Files:** `frontend/src/app/App.tsx` (a `HomeRedirect` element for `/`, `/login` success and `*`: superadmin → `/admin`, else `/chatbots`; a `SuperadminOnly` wrapper redirecting superadmins away from every tenant route to `/admin`; `LockedGuard` unchanged), `frontend/src/widgets/navigation/PrimaryNav.tsx` (superadmin sees only Admin + Sign out; hide Analytics when `!can("analytics:read")` — leave this second part to Task 6), `frontend/src/pages/admin/AdminPage.tsx` (Users tab: "Make admin" disabled with title "Belongs to an organisation" when `user.organizations.length > 0`), `frontend/src/entities/session/auth-store.ts` (`workspaceId` may be null), `frontend/src/shared/api/client.ts` (`AuthTokens.workspace_id: string | null`), `frontend/src/entities/me/api.ts` (`Me.workspace_id: string | null`; `useMe` query key uses `userId` only when workspaceId is null).

- [ ] Typecheck clean. Commit `feat(frontend): superadmin lands on the admin console only`.

---

### Task 3: Per-organisation limits (backend)

**Files:** `backend/alembic/versions/0013_organization_limits.py` (three nullable INTEGER columns), `backend/app/slices/tenancy/models.py`, `tenancy/api.py` (`PLAN_LIMITS` gains `"conversations"`: 200 / 5000 / None; `SubscriptionView` gains `conversation_limit`, `conversations_used`, and `limits_overridden: dict[str, bool]`; `effective_limits(plan, overrides)`; `set_subscription(..., seat_limit=UNSET, chatbot_limit=UNSET, conversation_limit=UNSET)`; `get_subscription_status_for_workspace` unchanged), `backend/app/slices/conversations/api.py` (`count_started_since_for_workspaces(session, *, workspace_ids, since) -> int`), `conversations/router.py` (`_require_active_subscription` also enforces the monthly cap: `since = first day of current month 00:00 UTC` → 403 `PLAN_LIMIT` "The <plan> plan allows N conversations per month; the limit is reached"), `admin/schemas.py` (`SubscriptionUpdate` gains the three optional ints, `ge=0`), `admin/router.py` (pass through with `model_fields_set`; response includes the new fields), `identity/router.py` + `organizations/router.py` (subscription dict includes conversation fields), `members/router.py` + `chatbots/router.py` (use effective limits — unchanged call sites if `SubscriptionView.seat_limit/chatbot_limit` already return the effective value; make sure they do).
- Tests: `backend/app/slices/admin/tests/test_limits_api.py`: override beats plan default; `null` restores default and `limits_overridden` flips; monthly cap blocks the next widget start with 403 `PLAN_LIMIT`; a conversation back-dated to last month (raw SQL UPDATE on `created_at`) does not count; seats/bots unchanged; superadmin `GET /admin/organizations` shows `conversations_used`.

- [ ] RED → GREEN, migration chain, full suite, lint. Commit `feat(subscriptions): per-organisation user, bot and monthly conversation limits`.

---

### Task 4: Limits frontend + docs

**Files:** `frontend/src/entities/admin/api.ts` (`Subscription` gains `conversation_limit`, `conversations_used`, `limits_overridden`; `updateSubscription` patch type gains the three ints), `frontend/src/pages/admin/AdminPage.tsx` (three `<input type="number" min=0>` per row with placeholder = plan default and a clear-to-default affordance; "used / limit" for users, bots, conversations), `frontend/src/features/organization/OrganizationPanel.tsx` (conversations this month), `README.md`, `docs/DEMO_WALKTHROUGH.md` (§2a: set Northwind's conversation limit, show the widget refusing).

- [ ] Typecheck + build. Commit `feat(frontend): organisation limit controls and usage`.

---

### Task 5: Permission catalogue and route re-gating (backend)

**Files:** `backend/app/shared/permissions.py` →
```python
ALL = "*"
BOTS_MANAGE = "bots:manage"
INBOX_REPLY = "inbox:reply"
KNOWLEDGE_MANAGE = "knowledge:manage"
ANALYTICS_READ = "analytics:read"
MEMBERS_MANAGE = "members:manage"
WORKSPACE_MANAGE = "workspace:manage"
FEATURES_READ = "features:read"
CATALOGUE: tuple[str, ...] = (BOTS_MANAGE, INBOX_REPLY, KNOWLEDGE_MANAGE, ANALYTICS_READ, MEMBERS_MANAGE, WORKSPACE_MANAGE)
```
(`FEATURES_USE` deleted; grep the backend for `FEATURES_USE` and replace each with the route's catalogue permission per the spec §3 table.) `backend/app/slices/tenancy/seed.py` (SYSTEM_ROLES rewritten per spec D3; every role list includes `features:read` explicitly except owner), `backend/alembic/versions/0014_roles_catalogue.py` **part A** (UPDATE roles SET permissions = … for the four system roles; downgrade restores the old arrays), `backend/app/slices/authz/dependencies.py` (`require_permission`: `features:read` is granted to every member regardless of role contents — keep it simple: roles always contain it, and the guard also treats `FEATURES_READ` as satisfied for any active membership).
- Tests: update `authz/tests/test_guards.py` and every test that relied on `member`/`viewer` behaviour; add `authz/tests/test_catalogue.py`: a member can create a bot and reply; a viewer gets 403 on bot create, reply, knowledge write, but 200 on analytics; an admin can manage members and organisation.

- [ ] RED → GREEN, full suite, lint. Commit `feat(authz): permission catalogue replaces features:use`.

---

### Task 6: Organisation roles (backend + frontend)

**Backend files:** `0014_roles_catalogue.py` **part B** (`roles.organization_id` UUID NULL FK + index + partial unique `(organization_id, name) WHERE organization_id IS NOT NULL`), `tenancy/models.py`, `tenancy/repository.py` (`list_roles_for_organization`, `insert_role`, `select_role_for_organization`, `update_role`, `delete_role`, `count_memberships_with_role`), `tenancy/api.py` (`RoleView` gains `organization_id`, `is_system`, `in_use`; `list_roles`, `create_role`, `update_role`, `delete_role`, `resolve_role(session, *, organization_id, name)` → org role first, then system), `backend/app/slices/members/schemas.py` (`RoleName` literal → `str` with `min_length=1, max_length=50`; `RoleCreate{name, permissions: list[str]}`, `RoleUpdate`; validation: permissions ⊆ CATALOGUE, `*` refused), `members/router.py` (roles endpoints per spec §3; `add_member`/`change_role` use `resolve_role`; `MemberOut.role_id`), `audit/actions.py` (`ROLE_CREATED/UPDATED/DELETED`), `scripts/seed_demo.py` (create "Support agent" `inbox:reply, analytics:read` in Rogith and assign it to the agent; set Northwind `conversation_limit` 3 via the admin API).
- Tests `backend/app/slices/members/tests/test_roles_api.py`: CRUD; isolation; system roles immutable (403 `SYSTEM_ROLE`); delete in use → 409 `ROLE_IN_USE`; `*` refused (400); `features:read` auto-added; assign custom role by name; gating: a member with a custom `inbox:reply`-only role can POST a reply but gets 403 on POST /chatbots.

**Frontend files:** `frontend/src/entities/workspace/api.ts` (`Role` type; `workspaceApi.roles/createRole/updateRole/deleteRole`; `Member.role_id`), `frontend/src/features/roles/RolesPanel.tsx` (list + checkbox grid using a `PERMISSION_CATALOGUE` constant with labels: Build bots, Reply in inbox, Manage knowledge & AI keys, View analytics, Manage members, Manage organisation), `frontend/src/pages/settings/SettingsPage.tsx` (Roles tab, visible with `members:manage`), `frontend/src/features/team/TeamPanel.tsx` (role picker from `workspaceApi.roles`), per-permission gating replacing every `can("features:use")`: BuilderPage/ClassicBuilder/ChatFlowsPage/ChatbotDesignPage/AmbotShell → `bots:manage`; ConversationsPage/Transcript → `inbox:reply`; KnowledgePage + ProviderCredentialsPanel → `knowledge:manage`; AnalyticsPage → `analytics:read` (rail hides it otherwise); SettingsPage tabs: Organisation/Activity need `workspace:manage`, Team/Roles need `members:manage`, AI Providers needs `knowledge:manage`; `ReadOnlyBanner` text becomes "Your role does not include <label>".

- [ ] Backend RED → GREEN, migration chain, full suite, lint; frontend typecheck + build. Two commits: `feat(roles): organisation-defined roles from the permission catalogue` and `feat(frontend): roles editor and per-permission gating`.

---

### Task 7: Verification and rehearsal

- [ ] Full backend suite, lint-imports, typecheck, build, `node --check`. Throwaway-database rehearsal (never drop `webchatbots`): seed twice; superadmin: login → no workspace, `/admin/stats` 200, `/chatbots` 403; set Northwind conversation limit 3 → fourth widget start 403 `PLAN_LIMIT`; Rogith owner creates a role, assigns it, the agent can reply but not create a bot; viewer 403s; Northwind owner locked when suspended. Update README/walkthrough numbers. Move tag `v1.0-demo`. No commits unless something changed.

---

## Self-review

Spec coverage: D1 → Tasks 1–2; D2 → Tasks 3–4; D3 → Tasks 5–6; D4 → Task 1; §6 seed/docs → Tasks 4, 6, 7; §7 tests → each task's test list. No placeholders: every task names its files, interfaces, error codes and tests. Type consistency: `Principal.workspace_id`/`TokenBundle.workspace_id` optional in Task 1 and consumed as such in Task 2's `AuthTokens`; `SubscriptionView` fields from Task 3 are the ones Task 4 renders; `CATALOGUE` from Task 5 is what Task 6 validates against and the frontend `PERMISSION_CATALOGUE` mirrors.
