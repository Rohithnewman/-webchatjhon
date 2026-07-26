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

## 3. Cross-cutting architecture (defined once, used by every phase)

### 3.1 Tenant isolation
- Every request resolves `workspace_id` (and role) from the JWT into a **request-scoped context** via a FastAPI dependency.
- Every repository method takes `workspace_id` as a **mandatory argument**; there is no code path that queries tenant data without it.
- File-storage paths are prefixed with `workspace_id/`.
- Postgres RLS policies mirror the same boundary as a second line of defense.

### 3.2 Layering
`api/v1 (routes)` → `services (business logic)` → `repositories (data access)`. Routes never touch the DB directly. Services never build raw SQL. Dependency injection supplies the DB session, current user, and workspace context.

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

- **Phase 1 — Foundation.** Supabase project + schema + RLS; FastAPI structure + async DB; JWT auth (register/login/refresh/logout); org/workspace/user management; RBAC middleware; Next.js scaffold + auth pages + dashboard shell. *(Detailed spec: `2026-07-25-phase1-foundation-design.md`.)*
- **Phase 2 — Core Builder.** Chatbot CRUD; flow save/load/version API; React Flow canvas with all 13 node types; node config panel; flow JSON import/export.
- **Phase 3 — AI & Knowledge Base.** Document upload + Supabase Storage; Celery ingestion pipeline (extract → chunk 512/50 → embed → pgvector); RAG query service (LangChain + LlamaIndex, top-K=5 cosine); BYOK `provider_credentials` UI; KB management UI.
- **Phase 4 — Widget & Conversations.** Embeddable `widget.js` (one script tag); public widget conversation API (no auth, signed session); WebSocket streaming; conversation history + UI; live-agent handoff + console.
- **Phase 5 — Analytics, Billing & Polish.** Analytics collection + dashboard; subscription plans + billing UI; API-key management; audit-log viewer; settings; perf + deploy config.

## 6. Deployment

Frontend → Vercel · Backend → Render · Celery workers → Render (separate service) · DB/Storage → Supabase · Cache/broker → Upstash Redis.

## 7. Explicitly out of scope for v1

Central LLM usage metering (BYOK removes the need); Supabase Realtime; voice input; multi-region sharding; the `tenants` reseller layer.
