# Phase 3 — AI & Knowledge Base — Design

- **Date:** 2026-08-16
- **Status:** Draft — awaiting review
- **Parent:** `2026-07-25-webchatbots-platform-architecture.md`
- **Predecessor:** `2026-08-14-phase2-core-builder-design.md`
- **Database:** Local PostgreSQL 18. No Supabase dependency.

## 1. Goal

Let a workspace bring its own provider keys, upload documents into a knowledge
base, have them chunked and embedded in the background, and retrieve relevant
passages by similarity — so the `llm` and `knowledge_search` nodes built in
Phase 2 have something real to call in Phase 4.

## 2. Two amendments to the approved architecture

Both were forced by the target machine, and both are recorded here rather than
discovered during implementation.

### 2.1 Background work is a Postgres job table, not Celery + Redis

Architecture §3.7 puts ingestion on Celery workers with Upstash Redis. Redis
has no official Windows build and Docker is out, so Phase 3 uses a **`jobs`
table with a polling worker**.

This is not purely a downgrade. Jobs become tenant-scoped rows covered by the
same RLS as everything else, survive restarts, and are inspectable with SQL
rather than a broker CLI. The cost is latency — a job waits up to one poll
interval — which does not matter for document ingestion.

The worker runs as a separate process (`python -m app.worker`), so moving to
Celery later replaces the runner without touching the job definitions.

### 2.2 Vector storage is behind a seam, because pgvector is not installed yet

The target is pgvector, as the architecture specifies. It is **not currently
installable on this machine**: PostgreSQL 18 lists no `vector` extension,
pgvector publishes no official Windows binaries, and building from source needs
MSVC, which is not present.

So similarity search sits behind **one repository function**,
`search_similar_chunks(session, *, workspace_id, knowledge_base_id, embedding, limit)`,
with two implementations:

| | Column type | Ranking | When |
|---|---|---|---|
| **Fallback (ships now)** | `double precision[]` | cosine computed in SQL | until pgvector is installed |
| **Target** | `vector(n)` + HNSW index | pgvector `<=>` operator | once the extension exists |

Everything above that function — the RAG service, the API, the UI — is
identical either way. Swapping is one migration plus one function body.

**The fallback scans every chunk in the knowledge base.** That is acceptable
for hundreds of documents and unacceptable for thousands; the migration is not
optional before real use, and this document is not pretending otherwise.

**To unblock the target:** install Visual Studio Build Tools with the C++
workload, then build pgvector against `PGROOT=C:\Program Files\PostgreSQL\18`.

## 3. Scope

- `provider_credentials`: per-workspace BYOK keys, encrypted at rest.
- One `LLMProvider` interface; adapters for OpenAI, Anthropic, Gemini, Groq,
  Ollama, and Mistral.
- Knowledge bases, documents, and chunks, all workspace-scoped with RLS.
- Upload → extract → chunk → embed pipeline on the job table.
- Retrieval by similarity, top-K = 5.
- Frontend: knowledge base management and provider credential entry.

Out of scope: executing the `llm` and `knowledge_search` nodes inside a running
conversation. Phase 3 builds the capability; Phase 4's conversation engine calls
it.

## 4. Data model

**provider_credentials** — `id`, `workspace_id`, `provider`, `label`,
`encrypted_key`, `key_last_four`, `is_default`, timestamps, soft delete.
The key is encrypted with Fernet using an app-held `ENCRYPTION_KEY`, decrypted
in memory at call time, and **never** returned by any endpoint. `key_last_four`
exists so the UI can identify a key without holding it. Partial unique index on
`(workspace_id, provider) WHERE is_default AND deleted_at IS NULL`.

**knowledge_bases** — `id`, `workspace_id`, `name`, `description`,
`embedding_provider`, `embedding_model`, `embedding_dimensions`, timestamps,
soft delete. Dimensions are pinned per knowledge base: changing the embedding
model invalidates every existing vector, so the model is fixed at creation and
a change means a new knowledge base.

**documents** — `id`, `workspace_id`, `knowledge_base_id`, `filename`,
`content_type`, `byte_size`, `status` (`pending|processing|ready|failed`),
`error`, `chunk_count`, timestamps, soft delete.

**document_chunks** — `id`, `workspace_id`, `document_id`, `knowledge_base_id`,
`ordinal`, `content`, `token_count`, `embedding`, `created_at`. Append-only;
re-ingesting replaces the whole document's chunks.

**jobs** — `id`, `workspace_id` (nullable for platform work), `kind`, `payload`
JSONB, `status` (`queued|running|succeeded|failed`), `attempts`, `max_attempts`,
`error`, `run_after`, `locked_at`, `locked_by`, timestamps. Claimed with
`SELECT … FOR UPDATE SKIP LOCKED` so multiple workers never take the same row.

All tenant tables get RLS keyed by `app.workspace_id` and grants to the existing
`app_restricted` role.

## 5. Provider abstraction

```
class LLMProvider(Protocol):
    async def chat(messages, *, model, **options) -> ChatResult
    async def stream(messages, *, model, **options) -> AsyncIterator[str]
    async def embed(texts, *, model) -> list[list[float]]
```

The RAG service and every node call **this interface only**; no vendor SDK is
imported outside its adapter. Keys resolve per workspace from
`provider_credentials`.

Adapters live in a `providers` slice with `api.py` exposing
`get_provider(session, *, workspace_id, provider)`. Ollama needs no key, which
makes it the only adapter testable offline — the others are covered by contract
tests against recorded fixtures, never live calls in CI.

## 6. Ingestion pipeline

1. Upload validates content type and size, stores the file under
   `workspace_id/knowledge_base_id/`, writes a `documents` row as `pending`,
   and enqueues an `ingest_document` job.
2. The worker claims the job, sets `processing`, extracts text (PDF, DOCX, TXT,
   MD, HTML), chunks at **512 tokens with 50 overlap** per the architecture,
   embeds each chunk through the workspace's provider, writes chunks, sets
   `ready` and `chunk_count`.
3. Failure records `error`, sets `failed`, and retries with backoff up to
   `max_attempts`. A document stuck in `processing` past a lease timeout is
   reclaimed — a crashed worker must not strand a document forever.

## 7. Retrieval

`search(session, *, workspace_id, knowledge_base_id, query, limit=5)` embeds the
query with the knowledge base's own model, calls `search_similar_chunks`, and
returns chunks with scores and document attribution. The `workspace_id`
argument is mandatory, as with every tenant-scoped repository function.

## 8. API

All under `/api/v1`, all requiring database-verified workspace context. Reads
need `features:read`; mutations need `features:use`.

- `GET|POST /provider-credentials`, `DELETE /provider-credentials/{id}`
- `GET|POST /knowledge-bases`, `GET|PATCH|DELETE /knowledge-bases/{id}`
- `POST /knowledge-bases/{id}/documents` (multipart upload)
- `GET /knowledge-bases/{id}/documents`, `DELETE /documents/{id}`
- `POST /knowledge-bases/{id}/search`

## 9. Frontend

Two additions in the existing Feature-Sliced structure, reusing the shared UI
kit rather than adding new one-off styles:

- `entities/knowledge-base`, `entities/document`, `entities/provider-credential`
- `features/document-upload`, `features/provider-credential-form`
- `widgets/knowledge-base-panel`, `pages/knowledge`

Document status is polled while any document is `pending` or `processing`, and
polling stops when none are.

## 10. Testing

Same harness: real PostgreSQL, throwaway database, schema by migration.

- Isolation: workspace A cannot read or search workspace B's knowledge bases,
  documents, or chunks. Extends the standing suite.
- RLS: cross-workspace reads return zero rows under `app_restricted`.
- Encryption: a stored credential is unreadable in the raw column, decrypts to
  the original, and never appears in any API response.
- Jobs: two workers racing a queue never claim the same job; a failed job
  retries then lands in `failed`; a stale lease is reclaimed.
- Ingestion: a fixture document produces the expected chunk count and ordinals.
- Retrieval: ranking is correct against a known fixture set, and results never
  cross knowledge bases.
- Providers: adapter contract tests against recorded fixtures; Ollama live only
  when explicitly enabled.

## 11. Success criteria

1. A workspace stores a provider key; it is encrypted at rest and never
   returned by any endpoint.
2. Uploading a document enqueues a job, and a running worker takes it to
   `ready` with chunks written.
3. A failed ingestion retries, then reports `failed` with a readable error.
4. Two workers cannot claim the same job.
5. Search returns top-5 chunks ranked by similarity, with attribution.
6. Workspace A can never read or search workspace B's knowledge data, by API
   or under RLS.
7. Every mutation is audited in the same transaction.
8. Swapping the vector backend to pgvector changes one migration and one
   function body — nothing above the repository seam.
