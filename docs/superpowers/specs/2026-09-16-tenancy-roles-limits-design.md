# Tenancy, Roles and Limits — Design

- **Date:** 2026-09-16
- **Status:** Approved in chat by the project owner (2026-09-16)
- **Parent:** `2026-07-25-webchatbots-platform-architecture.md` (D2 two-level tenancy, §3.1 isolation)
- **Builds on:** the demo-completion plan (`docs/superpowers/plans/2026-09-11-demo-completion.md`) and the organisation-subscriptions change (commits b082606, 92834a5, 2683ae8).

## 1. Goal

Make the three administration levels behave like a real multi-tenant SaaS:

| Level | Who | Sees | Does |
|---|---|---|---|
| **Superadmin** | platform operator (`admin@admin.com`) | only the admin console | manages organisations, their subscription (plan, status, period) and their limits (users, bots, conversations per month). Never touches a bot. |
| **Organisation admin** | the registering owner, and anyone given the `manage organisation` / `manage members` permissions | the tenant dashboard | runs bots, defines the organisation's roles from a permission catalogue, assigns roles to users, within the superadmin's limits |
| **Organisation user** | everyone else in the organisation | what their role allows | builds, replies, manages knowledge, reads analytics — per permission |

## 2. Decisions

**D1 — A superadmin has no tenancy.** No organisation, no workspace, no membership. The access token's `workspace_id` claim becomes optional; `refresh_tokens.workspace_id` becomes nullable. Login for a superadmin issues a token with no workspace, ignoring any memberships. Every workspace-scoped route refuses a superadmin (403 `SUPERADMIN_HAS_NO_WORKSPACE`) and refuses a token with no workspace (403 `NO_WORKSPACE`). A superadmin cannot be added as a member, and a tenant member cannot be promoted to superadmin (409 `USER_IS_TENANT_MEMBER`); the bootstrap script detaches any existing memberships when it promotes. The frontend routes a superadmin straight to `/admin`; the rail shows only Admin and Sign out.

**D2 — Limits are per organisation, set by the superadmin, defaulting from the plan.** `organizations` gains nullable `seat_limit`, `chatbot_limit`, `conversation_limit` overrides. Plan defaults: free 5 users / 3 bots / 200 conversations per calendar month; pro 25 / 25 / 5 000; enterprise unlimited. Effective limit = override if set, else plan default. Enforcement: adding a member (seats), creating a bot (bots), starting a visitor conversation (monthly conversations, counted over the organisation's workspaces since the first day of the current month, UTC). All three return 403 `PLAN_LIMIT` with a message naming the limit.

**D3 — Permissions are a fixed catalogue; roles are organisation-owned.** The catalogue (in `app/shared/permissions.py`):

| Permission | Gates |
|---|---|
| `bots:manage` | chatbot create/update/delete, flow save/restore, design, templates |
| `inbox:reply` | agent reply, close conversation |
| `knowledge:manage` | knowledge bases, documents, AI provider keys |
| `analytics:read` | analytics overview |
| `members:manage` | members and organisation roles |
| `workspace:manage` | rename organisation, workspaces, audit log |
| `features:read` | every read route; implied for every role (the server always includes it) |
| `*` | everything; only the system `owner` role |

`features:use` is removed. System roles are rewritten in a migration: owner `*`; admin all six; member `bots:manage, inbox:reply, knowledge:manage, analytics:read`; viewer `analytics:read` (plus the implied read). `roles.organization_id` is added (NULL for the four system roles, which every organisation may assign as templates). An organisation can create, rename, re-permission and delete its own roles; a role in use by a membership cannot be deleted; a custom role can never carry `*`. Roles are organisation-wide: the same role applies in every workspace of the organisation.

**D4 — 500 responses carry CORS headers** for allowed origins, so the browser reports a server error as what it is.

## 3. API changes

Auth: `POST /auth/login` → superadmin gets `workspace_id: null`; `GET /auth/me` → for a superadmin `workspace_id: null, role: null, permissions: [], subscription: null`; `GET /auth/workspaces` → `[]` for a superadmin; `POST /auth/switch-workspace` → 403 for a superadmin.

Admin (`/api/v1/admin`, superadmin only): `PATCH /organizations/{id}` accepts, in addition to plan/status/dates, `seat_limit`, `chatbot_limit`, `conversation_limit` (integer ≥ 0, or `null` = plan default; omitted = unchanged); organisation rows report `subscription.limits_overridden` per field and `conversations_used`. `PATCH /users/{id}` with `is_superadmin: true` → 409 if the user has any active membership.

Roles (`/api/v1/workspace/roles`, `members:manage` for writes, `features:read` for the list):
- `GET` → `[{id, name, permissions, is_system, in_use: int}]` — the four system roles plus this organisation's roles
- `POST {name, permissions[]}` → 201
- `PATCH /{id} {name?, permissions?}` → system roles refuse with 403 `SYSTEM_ROLE`
- `DELETE /{id}` → 409 `ROLE_IN_USE` while any membership references it; 403 for system roles
- Members: `POST /workspace/members {role: <name>}` and `PATCH /workspace/members/{user_id} {role: <name>}` resolve the organisation's roles first, then system roles; `MemberOut` gains `role_id`.
- Audit actions: `role.created`, `role.updated`, `role.deleted`.

Re-gated routes (unchanged paths): chatbots writes → `bots:manage`; conversation reply/close → `inbox:reply`; knowledge writes and provider-credential writes → `knowledge:manage`; analytics → `analytics:read`; members and roles → `members:manage`; organisation and audit → `workspace:manage`; all reads → `features:read`.

## 4. Frontend

- Superadmin: `/admin` is home; every tenant route redirects there; rail = Admin + Sign out; the lock guard skips superadmins; the Users tab disables "Make admin" for users who belong to an organisation.
- Admin → Organisations: three number inputs per row (blank = plan default) and "used / limit" for users, bots and conversations this month.
- Settings → Roles (new tab, `members:manage`): list of roles with a permission checkbox grid; create, rename, edit, delete; system roles read-only.
- Settings → Team: role picker lists system + organisation roles.
- Every control is gated by its permission via `useMe().can(...)`: builder and design page (`bots:manage`), inbox reply (`inbox:reply`), knowledge and providers pages (`knowledge:manage`), analytics page (`analytics:read`), Team/Roles (`members:manage`), Organisation/Activity (`workspace:manage`). The rail hides pages the user cannot read at all (analytics without `analytics:read`).
- Organisation card shows conversations used this month against the limit.

## 5. Data

- 0012: `refresh_tokens.workspace_id` nullable.
- 0013: `organizations.seat_limit`, `chatbot_limit`, `conversation_limit` (INTEGER NULL).
- 0014: `roles.organization_id` (UUID NULL, FK organisations, index; partial unique `(organization_id, name)` where not null) and the system-role permission rewrite (`features:use` → catalogue). Downgrade restores the old permission arrays.

All three are reversible and covered by the migration round-trip test.

## 6. Seed and docs

Seed: the superadmin is created with no organisation (any memberships it had are detached); Rogith gets a custom role "Support agent" (`inbox:reply`, `analytics:read`) assigned to the agent account; Northwind's monthly conversation limit is set to 3 so the walkthrough can show the cap. README and walkthrough describe the three levels, the catalogue, and the limits.

## 7. Testing

- Superadmin: login yields no workspace; every workspace route → 403; cannot be added as a member; promotion of a member → 409; `/auth/me` shape.
- Limits: override beats plan default; blank restores default; monthly conversation cap blocks the next start and rolls over at month start (test by back-dating conversations); seats and bots unchanged.
- Roles: CRUD, isolation (org A cannot see, assign or delete org B's roles), system roles immutable, in-use delete refused, `*` refused, `features:read` always present, member assignment by custom role, a custom role actually gates: a user with only `inbox:reply` can reply but cannot create a bot; a user with only `analytics:read` gets 403 on knowledge writes.
- Every existing test that used `member`/`viewer` semantics still passes under the rewritten permissions.
- Frontend: typecheck and build; API rehearsal of the walkthrough on a throwaway database.

## 8. Out of scope

Per-workspace roles, billing/payments, permission-level audit of reads, superadmin impersonation.
