# WebChatBots Builder

A multi-tenant SaaS platform for building no-code AI chatbots: design a conversation flow visually, attach a knowledge base, bring your own LLM key, embed one script tag on any website, and take over live in an agent inbox.

Built as a final-year project. Backend: FastAPI + PostgreSQL. Frontend: React 19 SPA.

## What it does (feature map)

| Area | Capability |
|---|---|
| Accounts | Register creates an organisation, a workspace and an owner. JWT auth (15-min access, 7-day refresh with rotation and reuse detection). |
| Tenancy & RBAC | Organisation → Workspace. Roles owner / admin / member / viewer resolved from the database on every request. Postgres row-level security as defence-in-depth. Team management UI. |
| Builder | 13 node types (message, question, input, choice, condition, AI response, knowledge search, HTTP request, webhook, delay, handoff, end, start). Classic and visual (React Flow) editors. Full version history with restore, JSON import/export, one-click templates. |
| Knowledge base | Upload PDF / DOCX / TXT / MD / HTML → background worker extracts, chunks (512 words, 50 overlap), embeds, stores; similarity search. |
| AI providers | Bring-your-own-key for OpenAI, Anthropic, Gemini, Groq, Mistral, Ollama. Keys encrypted at rest (Fernet), never returned. |
| Runtime | Server-side flow engine executes the published flow turn by turn for visitors from a public, token-scoped widget API. |
| Widget | `widget.js`: one script tag, no dependencies, honours the design page (colours, title, size, position). |
| Inbox | Live conversations, live-agent handoff, agent replies delivered to the widget by polling. |
| Analytics | Conversations and messages per day, per chatbot, by status. |
| Audit | Every mutation is recorded in the same transaction; viewable under Settings → Activity. |

## Prerequisites (Windows)

- Python 3.12 — `py --version`
- Node.js 20+ — `node --version`
- PostgreSQL 18 running locally with user `postgres` / password `postgres` (edit `backend/.env.development` if yours differ)
- The install verifier's allow-list derives from `PUBLIC_BASE_URL` (default `http://127.0.0.1:8000`, in `backend/.env.development`) — set it to the backend's actual public origin when serving it elsewhere, otherwise Verify Installation rejects the site's own URL

## First-time setup

```powershell
# 1. Database
$env:PGPASSWORD='postgres'
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -h localhost -c "CREATE DATABASE webchatbots;"

# 2. Backend
cd backend
py -3.12 -m venv .venv
.venv\Scripts\python.exe -m pip install -r requirements.txt
.venv\Scripts\alembic.exe upgrade head

# 3. Frontend
cd ..\frontend
npm install
```

## Running it (three processes)

```powershell
# Terminal 1 — API on http://127.0.0.1:8000
cd backend; .venv\Scripts\uvicorn.exe app.main:app --reload

# Terminal 2 — background worker (document ingestion)
cd backend; .venv\Scripts\python.exe -m app.worker

# Terminal 3 — dashboard on http://localhost:5173
cd frontend; npm run dev
```

Or run all three at once: `powershell -ExecutionPolicy Bypass -File scripts\start-demo.ps1`

## Demo data

With the three processes running:

```powershell
cd backend; .venv\Scripts\python.exe -m scripts.seed_demo
```

This creates the accounts below, a knowledge base with an FAQ document, three published bots, and a few conversations. It prints the URL of a fake customer website (`/demo?chatbot_id=…`) with the widget installed. See `docs/DEMO_WALKTHROUGH.md` for a scripted 10-minute demonstration.

The seed script, `set_password.py` and the demo passwords are for local demonstrations only and must never reach a deployed environment.

| Account | Password | What it is |
|---|---|---|
| `admin@admin.com` | `AdminPassword123!` | platform **superadmin** — no organisation, no workspace; lands on `/admin` |
| `rohithnewman@gmail.com` — name **rogith** | `Rogith@12345` | **owner** of organisation **Rogith** (org admin), workspace "Default", plus a second workspace "Sales" |
| `agent@rogith.example` | `AgentPass123` | custom role **Support agent** in Rogith / Default — the live agent for the handoff demo |
| `viewer@rogith.example` | `ViewerPass123` | **viewer** in Rogith / Default — shows the read-only UI |
| `demo@northwind.example` | `DemoPass123` | owner of a second organisation, **Northwind Outdoor**, so the superadmin console lists more than one tenant |

Rogith is on the pro plan; Northwind on free.

Superadmin console: log in as admin@admin.com → the shield icon in the left rail. Organisations tab: change plan, suspend/reactivate, set the subscription period; a suspended or expired organisation is locked out and its widgets stop answering. Superadmins can override each organisation's limits (users, bots, conversations per month); plan defaults are free 5/3/200, pro 25/25/5 000, enterprise unlimited.

Organisation admin: log in as rohithnewman@gmail.com → Settings → Organisation (rename, add workspaces, switch).

Workspace roles: agent@rogith.example holds the custom **Support agent** role (`inbox:reply`, `analytics:read`) — can reply in the inbox and view analytics, but cannot build bots, manage knowledge, members or the organisation; viewer@rogith.example sees a read-only dashboard.

Permission catalogue (`app/shared/permissions.py`): `bots:manage` (Build bots), `inbox:reply` (Reply in inbox), `knowledge:manage` (Manage knowledge & AI keys), `analytics:read` (View analytics), `members:manage` (Manage members), `workspace:manage` (Manage organisation). Every member also implicitly holds `features:read`; owners hold everything (`*`). The four system roles (owner / admin / member / viewer) are fixed — organisations create their own roles from this catalogue in Settings → Roles, as the seed does for "Support agent".

If rohithnewman@gmail.com already exists in your database with another password, either run the seed with `--owner-password <your password>` or align it first with `python -m scripts.set_password --email rohithnewman@gmail.com --password Rogith@12345`.

## Tests and checks

```powershell
cd backend
.venv\Scripts\python.exe -m pytest          # real PostgreSQL, throwaway database per run
.venv\Scripts\lint-imports.exe              # slice boundary contracts
cd ..\frontend
npm run typecheck
npm run build
```

## Project layout

```
backend/
  app/core/        settings, database, security primitives, error envelope, rate limiter
  app/shared/      ORM mixins, request context, permission constants
  app/slices/      one directory per feature: identity, authz, tenancy, members, audit,
                   chatbots, providers, knowledge, jobs, conversations, analytics, health,
                   admin, organizations
                   (each: models, schemas, repository, router, api.py = public interface, tests)
  app/static/      widget.js, demo.html, chat.html
  app/worker.py    job poller (Postgres job table, FOR UPDATE SKIP LOCKED)
  alembic/         migrations 0001–0015
  scripts/         seed_demo.py, demo_flows.py, create_superadmin.py, set_password.py
frontend/src/
  app/             router + providers
  pages/           one per screen
  widgets/         navigation shells, flow canvas
  features/        builder, inbox, templates, team, providers …
  entities/        typed API clients per backend slice
  shared/          UI kit, API client, styles
docs/superpowers/  architecture and per-phase design specs, implementation plans
```

## Architecture in one paragraph

Every request carries a JWT with identity only; role and permissions are resolved from the database per request so revocation is immediate. Every table carries `workspace_id`, every repository function requires it, and Postgres RLS mirrors the same boundary. The backend is organised in vertical slices; a slice may import another slice only through its `api.py`, enforced by import-linter in the test run. Real-time is plain HTTP with short polling (a deliberate v1 simplification of the WebSocket design). Background work is a Postgres job table with `FOR UPDATE SKIP LOCKED` instead of Celery/Redis, and vector search runs in SQL over a float array behind a single repository seam so pgvector can replace it with one migration.
