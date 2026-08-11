# WebChatBots Builder — Platform Architecture

- **Date:** 2026-07-25
- **Status:** Approved (whole-platform, shallow)
- **Scope:** Platform-wide architecture across all 5 phases. Each phase gets its own detailed spec → plan → build cycle. Phase 1 detail lives in `2026-07-25-phase1-foundation-design.md`.

---

## 1. Product summary

WebChatBots Builder is a multi-tenant SaaS platform that lets organizations create, deploy, and manage no-code AI chatbots. Customers build conversational flows visually, attach a RAG knowledge base, embed a widget on their site, and monitor conversations, analytics, and live-agent handoff.

## 2. Keystone decisions

These decisions are load-bearing for the entire platform. Changing them later is expensive.

| # | Decision | Rationale | Consequence |
|---|----------|-----------|-------------|
| D1 | **FastAPI owns authentication** — bcrypt password hashing, backend-minted custom JWT (15-min access / 7-day refresh). | Full control over multi-tenant claims and permission logic; matches the JWT rules in the original spec. | Backend connects to Postgres with the **Supabase service key**. Tenant isolation is enforced in the **service/repository layer**, not by RLS. RLS is enabled as **defense-in-depth** only. |
| D2 | **Two-level tenancy: Organization → Workspace.** The `tenants` table is removed. | Four levels added a foreign key to every query and policy for marginal benefit. Two levels covers the target use cases. | `organizations` = billing/subscription boundary. `workspaces` = isolation unit. **Every data-bearing table carries `workspace_id`.** |
| D3 | **BYOK — Bring Your Own Keys.** Each workspace stores its own encrypted LLM/embedding provider credentials. | The platform never carries token-cost risk in the early stage; revenue is platform/seat based. | New `provider_credentials` table (encrypted at rest). Provider + model selected per chatbot/flow. No central usage-metering required for v1. |
| D4 | **Single real-time transport: FastAPI native WebSockets.** Handles both LLM token streaming and live-agent chat. Supabase Realtime is dropped from the critical path. | One connection model, one auth path, one scaling story. | Supabase Realtime noted as a **future option** for DB-change subscriptions only. |

> **Amendment 2026-08-11 (D1).** The access JWT carries **identity only** — `sub`, `email`, `workspace_id`, `type`, `exp`, `iat`, `jti`. `role` and `permissions` are **no longer embedded**; they resolve from the database on every request via a single indexed join. Rationale: embedded claims left a 15-minute window in which deactivation, workspace removal, and role demotion had no effect, and made access tokens unrevocable. Everything else in D1 stands. See `2026-08-11-phase1a-backend-identity-core-design.md` §2.

> **Amendment 2026-08-11 (frontend).** The frontend is a **React SPA** — Vite + React 19 + TypeScript, React Router v7 (data mode), TanStack Query, Zustand, React Hook Form + Zod, Tailwind + shadcn/ui — built to static assets. **Next.js is not used.** An authenticated dashboard gains nothing from SSR or SEO, and dropping it removes server components, route groups, middleware, and Vercel-SSR coupling. All calls go directly to FastAPI over the whitelisted CORS origins.

## 3. Cross-cutting architecture (defined once, used by every phase)

### 3.1 Tenant isolation
- Every request resolves `workspace_id` (and role) from the JWT into a **request-scoped context** via a FastAPI dependency.
- Every repository method takes `workspace_id` as a **mandatory argument**; there is no code path that queries tenant data without it.
- File-storage paths are prefixed with `workspace_id/`.
- Postgres RLS policies mirror the same boundary as a second line of defense.

### 3.2 Code organization — vertical slices

> **Amended 2026-08-11.** Replaces the previous horizontal layering (`api/v1 → services → repositories`), which grouped code by technical role. The platform now organizes **by feature slice**. Rationale: a horizontal layout means every feature is smeared across five packages, so adding a chatbot or a flow node touches `api/`, `services/`, `repositories/`, `schemas/`, and `models/` at once, and no directory tells you what the system does. With eleven feature areas coming across five phases, slices keep each one independently readable, testable, and deletable.

**Backend — vertical slice.** Each slice owns its models, schemas, repository, use cases, and router:

```
app/
  core/          # config, database, security primitives, errors, envelope, rate limiter — no domain logic
  shared/        # shared kernel: ORM mixins, WorkspaceContext, permission constants. Deliberately tiny.
  slices/<name>/
    models.py    schemas.py    repository.py
    use_cases/   # one module per operation
    router.py    # thin: parse → call use case → envelope
    api.py       # the slice's PUBLIC interface — the only thing other slices may import
    tests/       # slice-local tests live with the slice
```

**The one hard rule:** a slice may import `core`, `shared`, and other slices' `api.py` — never another slice's `repository.py`, `models.py`, or `use_cases/`. This is what keeps slices from silently fusing back into a ball of mud. It is enforced mechanically by an **`import-linter` contract in CI**, not by convention or code review.

Within a slice the layering discipline still holds: routers never touch the DB, use cases never build raw SQL, repositories take `workspace_id` as a mandatory argument. Vertical slicing changes *where* code lives, not whether these boundaries exist.

**Frontend — Feature-Sliced Design**, the direct analogue. Layers, each importing only from those below it: `app` (providers, router, composition root) → `pages` → `widgets` → `features` → `entities` → `shared`. Enforced by ESLint boundary rules. Frontend `entities` and `features` are named to mirror backend slices, so a change to workspace switching has one obvious home on each side.

Cross-slice dependencies form a DAG, never a cycle. Where two slices genuinely need each other, that is a signal they are one slice.

### 3.3 API contract
- Base URL `/api/v1/`, URL-based versioning.
- `Authorization: Bearer <JWT>` on all endpoints except `/auth/*` and `/widget/*`.
- Standard success envelope: `{ "success": true, "data": {...}, "message": "?", "pagination": {...}? }`.
- Standard error envelope: `{ "success": false, "error": "ERROR_CODE", "message": "...", "details": {...}? }`.
- HTTP codes: 200/201/400/401/403/404/429/500 per the original spec.
- Implemented as Pydantic response models + a global exception handler that maps domain errors to the envelope.

### 3.4 Audit logging
A single audit writer (dependency/decorator) records `workspace_id, actor_id, action, target, created_at` for every state-changing route.

### 3.5 Provider abstraction (RAG & flow `llm` node)
- One `LLMProvider` interface: `chat()`, `stream()`, `embed()`.
- Six adapters: OpenAI, Anthropic, Gemini, Groq, Ollama, Mistral.
- The RAG query service and the flow `llm`/`knowledge_search` nodes call the **interface only** — never a vendor SDK directly.
- Keys resolved per-workspace from `provider_credentials` (decrypted in-memory at call time).

### 3.6 Real-time
FastAPI native WebSockets. Two channel types over the same transport: **stream** (LLM token streaming to widget) and **live** (agent ↔ visitor chat). JWT-authenticated for dashboard/agent connections; short-lived signed session token for public widget connections.

### 3.7 Background work
Celery workers (separate Render service) with Upstash Redis as broker. Used for: document ingestion, website crawl, embedding generation, and any long-running task. Redis also backs caching and rate limiting.

### 3.8 Security baseline
bcrypt passwords; JWT 15m/7d; API keys stored as SHA-256 hashes; provider keys encrypted (symmetric, app-held key); file uploads type-validated + scanned; CORS whitelists known frontend origins; rate limits 100/min per IP and 1000/min per workspace; all mutations audited.

## 4. Data model (platform view)

UUID PKs throughout. Every data table carries `workspace_id`, `created_at`, `updated_at`, `deleted_at` (soft delete). FKs and frequently-filtered columns indexed.

**Phase 1 (Foundation) tables:**
`organizations` · `workspaces` · `users` · `roles` · `memberships` · `refresh_tokens` · `audit_logs`

**Later-phase tables (come online in their phase):**
`chatbots` · `flows` · `knowledge_bases` · `documents (embedding vector)` · `provider_credentials` · `conversations` · `messages` · `analytics` · `widget_configs` · `subscriptions` · `api_keys`

Changes vs. original schema: `tenants` removed; top level is `organizations (id, name, plan, created_at)`; `provider_credentials` added; `memberships` added (user↔workspace↔role, enabling multi-workspace users); `refresh_tokens` added (7-day refresh + revocation/logout).

## 5. Per-phase scope (shallow)

Each phase is its own spec + plan + build cycle.

- **Phase 1 — Foundation.** Split into three build slices, each with its own spec → plan → build cycle. *(Parent spec: `2026-07-25-phase1-foundation-design.md`.)*
  - **1a — Backend Identity Core.** Supabase project + schema + RLS; FastAPI structure + async DB; JWT auth (register/login/refresh/logout/switch-workspace); request-time RBAC; audit logging; Postgres-backed isolation/RLS test suites. *(Detailed spec: `2026-08-11-phase1a-backend-identity-core-design.md`.)*
  - **1b — Management API.** Organization, workspace, and member CRUD; invite records; role changes.
  - **1c — React Dashboard.** Vite + React Router SPA; auth pages; protected shell + workspace switcher; team and settings screens.
- **Phase 2 — Core Builder.** Chatbot CRUD; flow save/load/version API; React Flow canvas with all 13 node types; node config panel; flow JSON import/export.
- **Phase 3 — AI & Knowledge Base.** Document upload + Supabase Storage; Celery ingestion pipeline (extract → chunk 512/50 → embed → pgvector); RAG query service (LangChain + LlamaIndex, top-K=5 cosine); BYOK `provider_credentials` UI; KB management UI.
- **Phase 4 — Widget & Conversations.** Embeddable `widget.js` (one script tag); public widget conversation API (no auth, signed session); WebSocket streaming; conversation history + UI; live-agent handoff + console.
- **Phase 5 — Analytics, Billing & Polish.** Analytics collection + dashboard; subscription plans + billing UI; API-key management; audit-log viewer; settings; perf + deploy config.

## 6. Deployment

Frontend → static build (Vercel or any CDN; no SSR runtime) · Backend → Render · Celery workers → Render (separate service) · DB/Storage → Supabase · Cache/broker → Upstash Redis.

**Supabase connection note.** The pooler endpoint (port 6543, PgBouncer transaction mode) requires asyncpg to disable prepared statements (`statement_cache_size=0`, null `prepared_statement_cache_size`). Alembic must run against the **direct** connection on port 5432, never the pooler.

## 7. Explicitly out of scope for v1

Central LLM usage metering (BYOK removes the need); Supabase Realtime; voice input; multi-region sharding; the `tenants` reseller layer.
