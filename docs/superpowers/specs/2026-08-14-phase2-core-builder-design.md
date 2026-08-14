# Phase 2 - Core Builder - Design

- **Date:** 2026-08-14
- **Status:** Approved for implementation by user direction
- **Parent:** `2026-07-25-webchatbots-platform-architecture.md`
- **Database:** Local PostgreSQL 18. No Supabase dependency is introduced.

## 1. Goal

Allow an authenticated workspace member to create and manage chatbots, build a
conversation flow visually, save immutable versions, restore an older version,
and import or export the flow as JSON.

## 2. Scope

- Workspace-scoped chatbot CRUD and draft/published status.
- One current flow per chatbot, backed by immutable numbered flow versions.
- React Flow canvas, node palette, configuration panel, and edge editing.
- JSON import/export using the same validated flow document accepted by the API.
- RBAC, audit logging, repository workspace filters, RLS, and isolation tests.
- Local PostgreSQL development and test databases only.

Execution of LLM, knowledge, HTTP, or handoff nodes remains deferred to the
phases that introduce providers, knowledge bases, and conversations.

## 3. Node Contract

Every node has `id`, `type`, `position`, and `data`. Every edge has `id`,
`source`, `target`, and optional `sourceHandle`, `targetHandle`, and `label`.

The supported node types are:

1. `start` - unique flow entry.
2. `message` - send static assistant text.
3. `question` - ask and capture a response.
4. `choice` - present labelled options.
5. `condition` - branch on a variable comparison.
6. `input` - capture typed structured input.
7. `llm` - generate a provider-backed response in Phase 3.
8. `knowledge_search` - retrieve workspace knowledge in Phase 3.
9. `http_request` - call an external HTTP endpoint.
10. `webhook` - emit a webhook event.
11. `delay` - wait for a configured duration.
12. `handoff` - transfer to a live agent in Phase 4.
13. `end` - terminate the flow.

Validation requires unique node and edge IDs, exactly one `start`, valid edge
references, no incoming edge to `start`, and no outgoing edge from `end`.

## 4. Data Model

**chatbots** - `id`, `workspace_id`, `name`, `description`, `status`, standard
timestamps and soft delete. Status is `draft`, `published`, or `archived`.

**flows** - `id`, `workspace_id`, `chatbot_id`, `version`, `definition` JSONB,
`is_current`, `created_by`, standard timestamps and soft delete. Versions are
append-only through the API. A partial unique index allows one current flow per
active chatbot, and `(chatbot_id, version)` is unique for active rows.

Both tables have RLS policies keyed by `app.workspace_id` and are granted to the
existing restricted test role.

## 5. API

All routes are under `/api/v1` and require a database-verified workspace context.

- `GET /chatbots`
- `POST /chatbots`
- `GET /chatbots/{chatbot_id}`
- `PATCH /chatbots/{chatbot_id}`
- `DELETE /chatbots/{chatbot_id}`
- `GET /chatbots/{chatbot_id}/flow`
- `PUT /chatbots/{chatbot_id}/flow`
- `GET /chatbots/{chatbot_id}/flow/versions`
- `POST /chatbots/{chatbot_id}/flow/versions/{version}/restore`

Reads require `features:read`; mutations require `features:use`. Owner wildcard
continues to grant both.

## 6. Frontend

Vite, React 19, TypeScript, React Router, TanStack Query, Zustand, React Hook
Form, Zod, Lucide icons, and `@xyflow/react`. The editor is a dense operational
workspace: chatbot navigation on the left, full canvas in the center, and the
selected node configuration on the right. The canvas is the primary experience,
not a marketing or preview surface.

## 7. Success Criteria

1. Workspace A cannot read or mutate workspace B chatbots or flows.
2. Saving a flow creates the next immutable version and makes it current.
3. Concurrent saves cannot create duplicate version numbers.
4. Restoring creates a new version rather than mutating history.
5. Invalid node types, broken edges, and malformed imports are rejected.
6. Viewer can read but receives 403 on mutations.
7. All mutations are audited in the same transaction.
8. The React builder supports all 13 node types and JSON import/export.
