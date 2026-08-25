# Phase 4 — Widget & Conversations — Design

- **Date:** 2026-08-25
- **Status:** Approved for implementation
- **Parent:** `2026-07-25-webchatbots-platform-architecture.md`
- **Predecessor:** `2026-08-16-phase3-knowledge-and-providers-design.md`
- **Database:** Local PostgreSQL 18. No Supabase dependency.

## 1. Goal

Make a published chatbot usable by a real visitor: an embeddable widget starts a
conversation, the flow built in Phase 2 actually executes node by node — `llm`
and `knowledge_search` call the Phase 3 capability — and a human agent can take
over when the flow hands off.

## 2. One amendment to the approved architecture

**Transport is request/response + polling, not WebSockets, for v1.**
Architecture §3.6 specifies FastAPI native WebSockets for token streaming and
live chat. This phase ships the conversation engine over plain HTTP: a visitor
turn is one POST that returns the full bot reply, and during handoff the widget
polls for agent messages (2s interval, only while `handoff`). Rationale: every
node except `llm` completes in milliseconds, BYOK `llm` latency is dominated by
the provider not the transport, and one auth model (signed widget token on every
request) is materially simpler to secure and test. The message API is
turn-scoped, so adding a WS/streaming endpoint later is additive — no schema or
engine change.

## 3. Scope

- `conversations` slice: conversations + messages, workspace-scoped, RLS.
- Flow engine executing all 13 Phase 2 node types server-side.
- Public widget API under `/api/v1/widget` — no dashboard auth; a signed,
  conversation-scoped **widget token** (JWT `type="widget"`, 24h) minted at
  conversation start authorizes every later call.
- Embeddable `widget.js` served by the backend; one script tag to install.
- Dashboard conversations API + inbox UI with live-agent handoff console.

Out of scope: WebSocket streaming (above), visitor identity capture, agent
assignment/routing (any member with `features:use` may reply), attachments.

## 4. Data model

**conversations** — `id`, `workspace_id`, `chatbot_id`, `flow_version`,
`status` (`active|handoff|closed`), `current_node_id` (the wait-node the engine
is parked on, else NULL), `variables` JSONB, `visitor_label` (e.g. "Visitor
7f3a" — no PII), timestamps, soft delete. `flow_version` pins the version the
conversation started on; a mid-conversation save of a new version does not
change running conversations.

**conversation_messages** — `id`, `workspace_id`, `conversation_id`, `ordinal`
(per-conversation, unique), `role` (`visitor|bot|agent|system`), `content`,
`node_id` (bot messages only), `created_at`. Append-only. The widget polls with
`?after=<ordinal>`; ordinals make "new messages since" trivial and ordering
unambiguous.

Both tables: RLS keyed by `app.workspace_id`, grants to `app_restricted`.

## 5. Engine

`engine.run(definition, state, input, services) -> StepResult` — a pure module:
no DB session, no HTTP client of its own. `services` carries three async
callables (`chat`, `search`, plus an `http` client) that the router binds to the
workspace; tests bind fakes.

Node semantics (variables interpolate as `{{name}}`; `last_message` is always
the latest visitor text):

| Node | Behavior |
|---|---|
| `start` | follow the single outgoing edge |
| `message` | emit `data.message`, continue |
| `question` | emit `data.prompt`, park; on resume store input in `data.variable` |
| `input` | as `question`, but validates `data.inputType` (email/number/phone); invalid input re-prompts and stays parked |
| `choice` | emit prompt + options (newline-split `data.options`), park; resume matches by label or 1-based index, re-prompts on no match |
| `condition` | compare `variables[data.variable]` with `data.operator`/`data.value` |
| `llm` | `services.chat` with interpolated system prompt + recent turns; provider unavailable → graceful bot apology, continue |
| `knowledge_search` | `services.search(data.knowledgeBaseId, query, topK)`; results stored in `variables[data.variable or "knowledge"]` as text, continue silently |
| `http_request` | request with 10s timeout; `{status, body}` into `variables[data.variable or "http_response"]`; failure stores `{error}`, continues |
| `webhook` | fire-and-forget POST `{event, conversation_id, variables}`, 5s timeout, errors swallowed |
| `delay` | `sleep(min(data.seconds, 5))` |
| `handoff` | emit `data.message`, set `handoff`, stop — the engine never runs again for this conversation |
| `end` | emit `data.message`, set `closed` |

**Branch selection.** The canvas has a single source handle, so branches choose
among outgoing edges **by edge label**: `condition` prefers an edge labelled
`true`/`false` (case-insensitive; fallback: first edge = true, second = false);
`choice` prefers an edge whose label equals the chosen option (fallback: edge at
the option's index, then first). Unlabelled single-edge nodes just follow it.

**Loop guard.** 50 node executions per turn; exceeding it emits a system
message and closes the conversation rather than hanging the request.

## 6. API

Public (`/api/v1/widget`, IP rate-limited, CORS `*` — the widget runs on
customer origins):

- `POST /conversations` `{chatbot_id}` — chatbot must be `published`. Creates
  the conversation, runs the engine from `start`, returns `{conversation,
  token, messages}`.
- `POST /conversations/{id}/messages` `{content}` (widget token) — stores the
  visitor turn; engine resumes unless `handoff` (message waits for the agent)
  or `closed` (409).
- `GET /conversations/{id}/messages?after=N` (widget token) — poll for agent
  replies.

Dashboard (`/api/v1/conversations`, standard auth):

- `GET /` `?chatbot_id&status` — list with last-message preview (`features:read`).
- `GET /{id}` — full transcript (`features:read`).
- `POST /{id}/messages` `{content}` — agent reply, only in `handoff` (409
  otherwise) (`features:use`, audited).
- `POST /{id}/close` — close from the console (`features:use`, audited).

Widget install: `<script src="http://<api>/widget.js" data-chatbot-id="<id>"
data-api="http://<api>/api/v1" async></script>`. `GET /widget.js` is served by
FastAPI with long cache headers; the file is dependency-free vanilla JS.

## 7. Testing

Same harness. Engine unit tests with fake services (every node type, branch
selection, validation re-prompt, loop guard). API tests: publish-gate, widget
token scoping (token for conversation A cannot touch B, nor another
workspace's), handoff turns the engine off, agent reply only in handoff,
polling with `after`, isolation between workspaces, audited mutations.

## 8. Success criteria

1. A published chatbot's flow executes end-to-end from the widget with no
   dashboard credentials.
2. `llm` and `knowledge_search` nodes call the Phase 3 seam; a missing
   credential degrades gracefully instead of 500ing.
3. `handoff` parks the flow; an agent reply reaches the visitor via polling;
   close ends the conversation.
4. A widget token only reaches its own conversation.
5. Workspace A can never read workspace B's conversations, by API or RLS.
6. Agent replies and closes are audited.
