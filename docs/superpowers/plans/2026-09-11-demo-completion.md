# Demo Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Take WebChatBots Builder from "four phases built, several seams unfinished" to a product that can be demonstrated end-to-end to a professor in one sitting: register → store an AI key → upload knowledge → build a flow from a template → publish → chat from a customer web page → hand off to a live agent → see analytics, team, and audit trail.

**Extended 2026-09-11 (Parts D–F):** three administration levels (platform superadmin, organisation admin, workspace roles) with a role-aware dashboard; complete chat-flow execution for every component the builders offer (option buttons, media, typed inputs, multiple choice, per-option routing); the Chatbot Design page fully wired to the embedded widget with a preview that runs the real engine; and the seed creates the professor's accounts. **Execution order:** Tasks 1–12, then 14–22, then Task 13 (final verification) last.

**Architecture:** Nothing structural changes. Backend stays FastAPI + vertical slices (each slice exposes `api.py`, enforced by import-linter). Frontend stays a Vite + React 19 SPA in Feature-Sliced Design layers (`app → pages → widgets → features → entities → shared`). Every new capability is either a new slice with its own `router.py` registered in `app/main.py`, or a new page + entity API on the frontend. Real-time stays HTTP polling (Phase 4 amendment).

**Tech Stack:** Python 3.12, FastAPI, SQLAlchemy 2 async, asyncpg, Alembic, PostgreSQL 18 (local), pytest + pytest-asyncio, import-linter; React 19, TypeScript, Vite, TanStack Query, Zustand, React Router 7, @xyflow/react, lucide-react.

**Specs this plan argues from:**
- `docs/superpowers/specs/2026-07-25-webchatbots-platform-architecture.md` (platform, §5 per-phase scope)
- `docs/superpowers/specs/2026-08-16-phase3-knowledge-and-providers-design.md` (§6 ingestion, §9 frontend)
- `docs/superpowers/specs/2026-08-25-phase4-widget-and-conversations-design.md` (§6 widget install)
- Phase 1b (management API) and Phase 5 (analytics, audit viewer) have no detailed spec; §5 of the architecture doc is the source, and this plan scopes them down to what the demo needs.

---

## 0. Where the project stands today (audit, 2026-09-11)

Verified this morning: `pytest` in `backend/` → **138 passed**; `npm run typecheck` in `frontend/` → clean.

| Area | Status | Evidence |
|---|---|---|
| Phase 1a identity, RBAC, audit, RLS | **Done** | `app/slices/{identity,authz,tenancy,audit}`, 8 migrations |
| Phase 1b management API (workspace, members) | **Missing** | `tenancy/api.py` has no HTTP router; no member endpoints |
| Phase 1c dashboard shell | Done, with 7 placeholder `alert()` buttons | `PrimaryNav.tsx`, `ChatbotSubNav.tsx`, `ChatFlowsPage.tsx` |
| Phase 2 chatbots, flow versions, builder | **Done** | classic + visual builder; version *restore* button is a no-op in `BuilderPage.tsx:246` |
| Phase 3 providers (BYOK) | Backend done, **no UI** | 6 providers via 3 adapters; nothing in `frontend/src` calls `/provider-credentials` |
| Phase 3 knowledge | Done, two defects | `local_embedding` uses Python `hash()` (randomised per process, so worker and API disagree); worker reads PDFs/DOCX as UTF-8 text |
| Phase 4 engine, widget, inbox, handoff | **Done** | `widget.js` ignores the design page's saved settings |
| Phase 5 analytics, audit viewer, API keys, billing | **Missing** | `conversations/api.py` already exposes `daily_counts` / `status_counts` for it |
| Docs for running it | **Missing** | no README, no seed data, no demo page |

Everything below is ordered so that the demo gets safer with every task; if time runs out, stop after any task and the product still works.

---

## Global Constraints

- Backend: every repository function takes `workspace_id` as a mandatory keyword argument (architecture §3.1).
- Backend: a slice may import `app.core`, `app.shared`, and other slices' `api.py` only. `lint-imports` must pass. New slices are added to the `source_modules` list of the third import-linter contract in `backend/pyproject.toml`.
- Backend: every state-changing route calls `audit_api.record(...)` in the same transaction (architecture §3.4) and returns the `success(...)` envelope from `app.core.envelope`.
- Backend: permissions come from `app.shared.permissions`: reads use `FEATURES_READ`, feature writes `FEATURES_USE`, member changes `MEMBERS_MANAGE`, workspace-level settings `WORKSPACE_MANAGE`.
- Backend tests: real local PostgreSQL, throwaway database per run (`backend/conftest.py`). Auth in API tests goes through `POST /api/v1/auth/register` exactly as `conversations/tests/test_conversations_api.py::_auth` does.
- Frontend: layers import downward only (`pages → widgets → features → entities → shared`). Shared UI comes from `frontend/src/shared/ui` (`Button`, `Field`, `Input`, `Select`, `Textarea`, `Panel`, `Dialog`, `Tabs`, `Badge`, `EmptyState`, `LoadingState`, `useToast`).
- Frontend: API calls go through `apiRequest<T>(path, init?)` from `frontend/src/shared/api/client.ts`, which unwraps the `{success, data}` envelope and throws `ApiError`.
- Frontend: `npm run typecheck` must pass after every task. Page-level CSS is appended to `frontend/src/styles.css` (existing convention; the file is already the single page-style sheet).
- Commands below are for PowerShell on Windows. Backend commands run from `D:\Jhon britto project\backend` with the venv: `.venv\Scripts\python.exe`. Frontend commands run from `D:\Jhon britto project\frontend`.
- Commit after every task with a conventional-commit message. Do not commit `backend/storage/`, `backend/*.log`, or `frontend/tsconfig.app.tsbuildinfo` (add them to `.gitignore` in Task 12 if they are not already ignored).

---

## File map

**Backend — new**
- `app/slices/knowledge/extract.py` — text extraction per file type (Task 2)
- `app/slices/analytics/{__init__,router,tests/__init__,tests/test_analytics_api}.py` (Task 5)
- `app/slices/members/{__init__,router,schemas,tests/__init__,tests/test_members_api}.py` (Task 6)
- `app/slices/audit/router.py`, `app/slices/audit/tests/test_audit_viewer.py` (Task 7)
- `app/static/demo.html` — a fake customer site that embeds the widget (Task 11)
- `scripts/seed_demo.py`, `scripts/demo_flows.py` (Task 11)

**Backend — modified**
- `app/slices/knowledge/api.py` (Task 1), `app/slices/knowledge/worker.py` (Task 2), `requirements.txt` (Task 2)
- `app/slices/conversations/router.py`, `app/slices/conversations/api.py` (Tasks 4, 5)
- `app/slices/chatbots/api.py` (Task 5)
- `app/slices/identity/api.py`, `app/slices/identity/repository.py`, `app/slices/tenancy/api.py`, `app/slices/tenancy/repository.py`, `app/slices/audit/actions.py` (Task 6)
- `app/slices/audit/api.py`, `app/slices/audit/repository.py` (Task 7)
- `app/main.py` (Tasks 5, 6, 7, 11), `pyproject.toml` (Tasks 5, 6)

**Frontend — new**
- `src/entities/provider-credential/api.ts`, `src/features/provider-credentials/ProviderCredentialsPanel.tsx`, `src/pages/settings/SettingsPage.tsx`, `src/widgets/navigation/DashboardShell.tsx` (Task 3)
- `src/entities/analytics/api.ts`, `src/pages/analytics/AnalyticsPage.tsx` (Task 5)
- `src/entities/workspace/api.ts`, `src/features/team/TeamPanel.tsx` (Task 6)
- `src/entities/audit/api.ts`, `src/features/activity/ActivityPanel.tsx` (Task 7)
- `src/features/flow-templates/{templates.ts,TemplatesDialog.tsx}` (Task 9)

**Frontend — modified**
- `src/features/flow-editor/model/catalog.ts` (Task 3)
- `src/app/App.tsx` (Tasks 3, 5, 10)
- `src/pages/chatflows/ChatFlowsPage.tsx`, `src/pages/builder/BuilderPage.tsx` (Tasks 8, 9)
- `src/widgets/navigation/{PrimaryNav,ChatbotSubNav,AmbotShell}.tsx` (Tasks 9, 10)
- `src/pages/knowledge/KnowledgePage.tsx`, `src/pages/conversations/ConversationsPage.tsx` (Task 10); `src/widgets/app-header/AppHeader.tsx` deleted (Task 10)
- `src/styles.css` (Tasks 3, 5, 6, 7, 10)

**Docs / scripts — new**
- `README.md`, `scripts/start-demo.ps1`, `docs/DEMO_WALKTHROUGH.md` (Task 12)

---

## Part A — Fix the two defects that would break the demo

### Task 1: Make local embeddings deterministic across processes

The API server embeds the *query*; the worker process embeds the *chunks*. `local_embedding` buckets tokens with Python's built-in `hash()`, which is salted per process (`PYTHONHASHSEED`). Two processes therefore produce different vectors for the same word, and knowledge search returns near-random results in the real deployment even though the in-process tests pass.

**Files:**
- Modify: `backend/app/slices/knowledge/api.py:10-14`
- Test: `backend/app/slices/knowledge/tests/test_ingestion.py`

**Interfaces:**
- Produces: `local_embedding(text: str, dimensions: int = 32) -> list[float]` (unchanged signature, now stable across interpreters)

- [ ] **Step 1: Write the failing test**

Append to `backend/app/slices/knowledge/tests/test_ingestion.py`:

```python
import os
import subprocess
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[4]


def test_local_embedding_is_identical_in_separate_interpreters():
    """The API embeds queries and the worker embeds chunks in different
    processes. If the vectors differ per process, search is meaningless."""
    code = (
        "from app.slices.knowledge.api import local_embedding;"
        "print(local_embedding('billing invoices refunds payments'))"
    )
    outputs = set()
    for seed in ("1", "2", "random"):
        env = {**os.environ, "PYTHONHASHSEED": seed, "PYTHONPATH": str(BACKEND_ROOT)}
        outputs.add(
            subprocess.check_output(
                [sys.executable, "-c", code], env=env, cwd=BACKEND_ROOT, text=True
            ).strip()
        )
    assert len(outputs) == 1, f"embedding differs between interpreters: {outputs}"
```

- [ ] **Step 2: Run the test to verify it fails**

Run (from `backend/`): `.venv\Scripts\python.exe -m pytest app/slices/knowledge/tests/test_ingestion.py::test_local_embedding_is_identical_in_separate_interpreters -v`
Expected: FAIL with `embedding differs between interpreters` (three distinct outputs).

- [ ] **Step 3: Replace `hash()` with a stable digest**

In `backend/app/slices/knowledge/api.py`, replace the `local_embedding` function with:

```python
import zlib


def local_embedding(text: str, dimensions: int = 32) -> list[float]:
    """Deterministic bag-of-words embedding used until a real embedding
    provider is wired in. Uses crc32, not hash(): hash() is salted per
    process, and the worker and the API are different processes."""
    values = [0.0] * dimensions
    for index, token in enumerate(text.lower().split()):
        values[zlib.crc32(token.encode("utf-8")) % dimensions] += 1.0 / (index + 1)
    return values
```

(Add `import zlib` at the top of the file with the other imports.)

- [ ] **Step 4: Run the whole knowledge test module**

Run: `.venv\Scripts\python.exe -m pytest app/slices/knowledge -v`
Expected: all PASS, including the existing ranking test (`test_search_ranks_matching_document_first_and_stays_in_base`).

- [ ] **Step 5: Re-ingest any documents already on disk**

Chunks embedded before this fix carry vectors from a salted hash. Delete them so the demo does not hit stale data (the seed script in Task 11 re-uploads fresh documents anyway):

```powershell
$env:PGPASSWORD='postgres'; & "C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -h localhost -d webchatbots -c "DELETE FROM document_chunks; UPDATE documents SET status='pending', chunk_count=0;"
```

- [ ] **Step 6: Commit**

```powershell
git add backend/app/slices/knowledge/api.py backend/app/slices/knowledge/tests/test_ingestion.py
git commit -m "fix(knowledge): make local embeddings stable across processes"
```

---

### Task 2: Extract text from PDF, DOCX, and HTML before chunking

The upload UI accepts `.pdf` and `.docx`, but the worker does `Path.read_text(...)`, so a PDF becomes binary noise and the knowledge search node returns garbage. Phase 3 spec §6 requires PDF, DOCX, TXT, MD, HTML.

**Files:**
- Create: `backend/app/slices/knowledge/extract.py`
- Modify: `backend/app/slices/knowledge/worker.py`, `backend/requirements.txt`
- Test: `backend/app/slices/knowledge/tests/test_extract.py`

**Interfaces:**
- Produces: `extract_text(path: Path, content_type: str = "") -> str`

- [ ] **Step 1: Add the two parsing libraries**

Append to `backend/requirements.txt` (below `greenlet>=3.1`):

```
# Knowledge-base ingestion: text extraction for PDF and DOCX uploads.
pypdf>=5.0
python-docx>=1.1
```

Install: `.venv\Scripts\python.exe -m pip install "pypdf>=5.0" "python-docx>=1.1"`

- [ ] **Step 2: Write the failing tests**

Create `backend/app/slices/knowledge/tests/test_extract.py`:

```python
from pathlib import Path

from app.slices.knowledge.extract import extract_text

# A hand-written single-page PDF. pypdf rebuilds the missing xref table
# itself when strict=False, so no generator library is needed for the test.
MINIMAL_PDF = b"""%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 300 144] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj
4 0 obj << /Length 55 >> stream
BT /F1 18 Tf 20 60 Td (refund policy thirty days) Tj ET
endstream endobj
5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj
trailer << /Root 1 0 R >>
%%EOF
"""


def test_plain_text_passthrough(tmp_path: Path):
    source = tmp_path / "notes.md"
    source.write_text("# Hours\nOpen 9 to 5", encoding="utf-8")
    assert extract_text(source, "text/markdown") == "# Hours\nOpen 9 to 5"


def test_pdf_text_is_extracted(tmp_path: Path):
    source = tmp_path / "policy.pdf"
    source.write_bytes(MINIMAL_PDF)
    text = extract_text(source, "application/pdf")
    assert "refund policy thirty days" in text


def test_docx_paragraphs_are_extracted(tmp_path: Path):
    import docx

    document = docx.Document()
    document.add_paragraph("Shipping takes three days.")
    document.add_paragraph("Returns are free.")
    source = tmp_path / "shipping.docx"
    document.save(str(source))

    text = extract_text(
        source,
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    )
    assert "Shipping takes three days." in text
    assert "Returns are free." in text


def test_html_tags_are_stripped(tmp_path: Path):
    source = tmp_path / "faq.html"
    source.write_text("<h1>FAQ</h1><p>We ship <b>worldwide</b>.</p>", encoding="utf-8")
    text = extract_text(source, "text/html")
    assert "<" not in text
    assert "FAQ" in text and "We ship" in text and "worldwide" in text


def test_extension_wins_when_content_type_is_generic(tmp_path: Path):
    source = tmp_path / "policy.pdf"
    source.write_bytes(MINIMAL_PDF)
    assert "refund policy" in extract_text(source, "application/octet-stream")
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `.venv\Scripts\python.exe -m pytest app/slices/knowledge/tests/test_extract.py -v`
Expected: FAIL at import with `ModuleNotFoundError: No module named 'app.slices.knowledge.extract'`.

- [ ] **Step 4: Implement the extractor**

Create `backend/app/slices/knowledge/extract.py`:

```python
"""Turn an uploaded file into plain text for chunking.

Dispatch is by file extension first (the browser's content type for a
drag-and-drop upload is often application/octet-stream), then by content
type. Anything unknown is read as UTF-8 text with replacement, which is
what the worker did for every file before this module existed.
"""

import re
from pathlib import Path

_DOCX_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
_TAG = re.compile(r"<[^>]+>")
_WS = re.compile(r"[ \t]+")


def _pdf(path: Path) -> str:
    from pypdf import PdfReader

    reader = PdfReader(str(path), strict=False)
    return "\n".join((page.extract_text() or "") for page in reader.pages)


def _docx(path: Path) -> str:
    import docx

    return "\n".join(paragraph.text for paragraph in docx.Document(str(path)).paragraphs)


def _html(path: Path) -> str:
    raw = path.read_text(encoding="utf-8", errors="replace")
    return _WS.sub(" ", _TAG.sub(" ", raw)).strip()


def _text(path: Path) -> str:
    return path.read_text(encoding="utf-8", errors="replace")


def extract_text(path: Path, content_type: str = "") -> str:
    suffix = path.suffix.lower()
    if suffix == ".pdf" or content_type == "application/pdf":
        return _pdf(path)
    if suffix == ".docx" or content_type == _DOCX_TYPE:
        return _docx(path)
    if suffix in (".html", ".htm") or content_type == "text/html":
        return _html(path)
    return _text(path)
```

- [ ] **Step 5: Use it in the worker**

In `backend/app/slices/knowledge/worker.py`, replace the line

```python
    text = Path(document.storage_path).read_text(encoding="utf-8", errors="replace")
```

with

```python
    text = extract_text(Path(document.storage_path), document.content_type)
```

and add `from app.slices.knowledge.extract import extract_text` to the imports.

- [ ] **Step 6: Run knowledge tests and the import linter**

Run: `.venv\Scripts\python.exe -m pytest app/slices/knowledge -v` → all PASS.
Run: `.venv\Scripts\lint-imports.exe` → `Contracts: 3 kept, 0 broken.`

- [ ] **Step 7: Commit**

```powershell
git add backend/requirements.txt backend/app/slices/knowledge/extract.py backend/app/slices/knowledge/worker.py backend/app/slices/knowledge/tests/test_extract.py
git commit -m "feat(knowledge): extract text from PDF, DOCX and HTML uploads"
```

---

## Part B — Finish the seams the demo walks through

### Task 3: Provider credentials page, settings shell, and AI node fields

Without this, an `llm` node can only be configured with curl. Phase 3 spec §9 requires a credential form. The `llm` node has no `provider` field and the `knowledge_search` node has no `knowledgeBaseId` field even though the engine reads both (`engine.py:234`, spec §5).

**Files:**
- Create: `frontend/src/entities/provider-credential/api.ts`
- Create: `frontend/src/features/provider-credentials/ProviderCredentialsPanel.tsx`
- Create: `frontend/src/widgets/navigation/DashboardShell.tsx`
- Create: `frontend/src/pages/settings/SettingsPage.tsx`
- Modify: `frontend/src/features/flow-editor/model/catalog.ts` (llm and knowledge_search entries)
- Modify: `frontend/src/app/App.tsx` (add `/settings` route)
- Modify: `frontend/src/widgets/navigation/ChatbotSubNav.tsx:105-113` (Settings → link)
- Modify: `frontend/src/styles.css` (append)

**Interfaces:**
- Produces: `providerCredentialApi.{list, create, remove}`; `DashboardShell({title, subtitle?, actions?, children})`; `SettingsPage` with a `Tabs` control whose items array later tasks extend.
- Consumes backend `GET|POST /api/v1/provider-credentials`, `DELETE /api/v1/provider-credentials/{id}` (exists; body `{provider, api_key, label, base_url?, make_default}`; response `{id, provider, label, key_last_four, base_url, is_default}`).

- [ ] **Step 1: Entity API**

Create `frontend/src/entities/provider-credential/api.ts`:

```ts
import { apiRequest } from "../../shared/api/client";

export const PROVIDERS = ["openai", "anthropic", "gemini", "groq", "mistral", "ollama"] as const;
export type ProviderName = (typeof PROVIDERS)[number];

export interface ProviderCredential {
  id: string;
  provider: ProviderName;
  label: string;
  key_last_four: string;
  base_url: string | null;
  is_default: boolean;
}

export interface ProviderCredentialCreate {
  provider: ProviderName;
  api_key: string;
  label: string;
  base_url?: string | null;
  make_default: boolean;
}

export const providerCredentialApi = {
  list: () => apiRequest<ProviderCredential[]>("/provider-credentials"),
  create: (input: ProviderCredentialCreate) =>
    apiRequest<ProviderCredential>("/provider-credentials", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  remove: (id: string) =>
    apiRequest<{ deleted: boolean }>(`/provider-credentials/${id}`, { method: "DELETE" }),
};
```

- [ ] **Step 2: Dashboard shell (icon nav + page, no chatbot sub-sidebar)**

Create `frontend/src/widgets/navigation/DashboardShell.tsx`:

```tsx
import type { ReactNode } from "react";

import { PrimaryNav } from "./PrimaryNav";

interface Props {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}

/** Layout for workspace-level pages (settings, analytics, inbox, knowledge)
 *  that are not scoped to one chatbot, so they carry no chatbot sub-nav. */
export function DashboardShell({ title, subtitle, actions, children }: Props) {
  return (
    <div className="ambot-dashboard-shell">
      <PrimaryNav />
      <main className="ambot-main-viewport">
        <div className="dashboard-page">
          <header className="dashboard-page-header">
            <div>
              <h1>{title}</h1>
              {subtitle && <p>{subtitle}</p>}
            </div>
            {actions && <div className="dashboard-page-actions">{actions}</div>}
          </header>
          <div className="dashboard-page-body">{children}</div>
        </div>
      </main>
    </div>
  );
}
```

Append to `frontend/src/styles.css`:

```css
/* ── Workspace-level pages (DashboardShell) ─────────────────────────────── */
.dashboard-page { padding: 32px 40px; max-width: 1400px; width: 100%; }
.dashboard-page-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; margin-bottom: 24px; }
.dashboard-page-header h1 { font-size: 24px; font-weight: 800; color: #0f172a; margin: 0 0 4px; }
.dashboard-page-header p { margin: 0; color: #64748b; font-size: 14px; }
.dashboard-page-body { display: flex; flex-direction: column; gap: 20px; }
.settings-tabs { margin-bottom: 20px; }
.settings-grid { display: grid; grid-template-columns: 360px 1fr; gap: 20px; align-items: start; }
@media (max-width: 960px) { .settings-grid { grid-template-columns: 1fr; } }
.credential-row { display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; border-bottom: 1px solid #e2e8f0; gap: 12px; }
.credential-row:last-child { border-bottom: none; }
.credential-row strong { text-transform: capitalize; }
.credential-row .credential-meta { color: #64748b; font-size: 12px; display: block; }
.form-stack { display: flex; flex-direction: column; gap: 12px; }
.form-hint { font-size: 12px; color: #64748b; margin: 0; }
```

- [ ] **Step 3: Credentials panel**

Create `frontend/src/features/provider-credentials/ProviderCredentialsPanel.tsx`:

```tsx
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import {
  PROVIDERS,
  providerCredentialApi,
  type ProviderName,
} from "../../entities/provider-credential/api";
import { Badge, Button, EmptyState, Field, Input, LoadingState, Panel, Select, useToast } from "../../shared/ui";

export function ProviderCredentialsPanel() {
  const toast = useToast();
  const client = useQueryClient();
  const [provider, setProvider] = useState<ProviderName>("openai");
  const [apiKey, setApiKey] = useState("");
  const [label, setLabel] = useState("");
  const [baseUrl, setBaseUrl] = useState("");

  const credentials = useQuery({ queryKey: ["provider-credentials"], queryFn: providerCredentialApi.list });

  const create = useMutation({
    mutationFn: () =>
      providerCredentialApi.create({
        provider,
        api_key: apiKey,
        label: label || provider,
        base_url: baseUrl.trim() || null,
        make_default: true,
      }),
    onSuccess: () => {
      setApiKey("");
      setLabel("");
      setBaseUrl("");
      void client.invalidateQueries({ queryKey: ["provider-credentials"] });
      toast.success("Provider key stored (encrypted at rest)");
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : "Could not store key"),
  });

  const remove = useMutation({
    mutationFn: (id: string) => providerCredentialApi.remove(id),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["provider-credentials"] });
      toast.success("Key removed");
    },
  });

  const keyless = provider === "ollama";
  const canSubmit = keyless || apiKey.trim().length > 0;

  return (
    <div className="settings-grid">
      <Panel>
        <Panel.Header title="Add a provider key" />
        <Panel.Body>
          <form
            className="form-stack"
            onSubmit={(event) => {
              event.preventDefault();
              if (canSubmit) create.mutate();
            }}
          >
            <Field label="Provider">
              <Select value={provider} onChange={(e) => setProvider(e.target.value as ProviderName)}>
                {PROVIDERS.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </Select>
            </Field>
            <Field label={keyless ? "API key (not needed for Ollama)" : "API key"}>
              <Input
                type="password"
                value={apiKey}
                disabled={keyless}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={keyless ? "—" : "sk-..."}
                autoComplete="off"
              />
            </Field>
            <Field label="Label (optional)">
              <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Production key" />
            </Field>
            <Field label="Base URL (optional)">
              <Input
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder={keyless ? "http://localhost:11434/v1" : "Leave empty for the provider default"}
              />
            </Field>
            <p className="form-hint">
              Keys are encrypted with Fernet before they reach the database and are never returned by the API.
            </p>
            <Button type="submit" variant="primary" icon={<Plus size={15} />} loading={create.isPending} disabled={!canSubmit || create.isPending}>
              Store key
            </Button>
          </form>
        </Panel.Body>
      </Panel>

      <Panel>
        <Panel.Header title="Stored keys" />
        <Panel.Body flush>
          {credentials.isLoading ? (
            <LoadingState label="Loading keys" />
          ) : credentials.data && credentials.data.length > 0 ? (
            credentials.data.map((credential) => (
              <div key={credential.id} className="credential-row">
                <div>
                  <strong>{credential.provider}</strong> · {credential.label}
                  <span className="credential-meta">
                    ends with ····{credential.key_last_four || "none"}
                    {credential.base_url ? ` · ${credential.base_url}` : ""}
                  </span>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  {credential.is_default && <Badge tone="brand">default</Badge>}
                  <Button size="sm" variant="ghost" icon={<Trash2 size={14} />} onClick={() => remove.mutate(credential.id)}>
                    Remove
                  </Button>
                </div>
              </div>
            ))
          ) : (
            <EmptyState
              icon={<KeyRound size={28} />}
              title="No provider keys yet"
              description="Store a key so the AI response node can call a model. Ollama needs no key if it runs locally."
            />
          )}
        </Panel.Body>
      </Panel>
    </div>
  );
}
```

- [ ] **Step 4: Settings page with a tab strip**

Create `frontend/src/pages/settings/SettingsPage.tsx`:

```tsx
import { useState } from "react";

import { ProviderCredentialsPanel } from "../../features/provider-credentials/ProviderCredentialsPanel";
import { Tabs, type TabItem } from "../../shared/ui";
import { DashboardShell } from "../../widgets/navigation/DashboardShell";

export type SettingsTab = "providers";

const TABS: readonly TabItem<SettingsTab>[] = [
  { id: "providers", label: "AI Providers" },
];

export function SettingsPage() {
  const [tab, setTab] = useState<SettingsTab>("providers");

  return (
    <DashboardShell title="Workspace Settings" subtitle="Keys, people, and activity for this workspace.">
      <div className="settings-tabs">
        <Tabs items={TABS} value={tab} onChange={setTab} label="Settings sections" />
      </div>
      {tab === "providers" && <ProviderCredentialsPanel />}
    </DashboardShell>
  );
}
```

- [ ] **Step 5: Route and nav link**

In `frontend/src/app/App.tsx` add the import `import { SettingsPage } from "../pages/settings/SettingsPage";` and, directly above the `path="*"` route, add:

```tsx
      <Route
        path="/settings"
        element={authenticated ? <SettingsPage /> : <Navigate to="/login" replace />}
      />
```

In `frontend/src/widgets/navigation/ChatbotSubNav.tsx`, replace the Settings `<button ... onClick={() => alert("Chatbot settings")}>` block with:

```tsx
        <Link
          to="/settings"
          className={`sub-menu-item ${path.startsWith("/settings") ? "is-active" : ""}`}
        >
          <Settings size={17} />
          <span>Settings</span>
        </Link>
```

- [ ] **Step 6: Give the AI and knowledge nodes the fields the engine reads**

In `frontend/src/features/flow-editor/model/catalog.ts` replace the `llm` entry with:

```ts
  { type: "llm", label: "AI response", category: "Conversation", icon: Bot, accent: "violet",
    defaults: { label: "AI response", prompt: "You are a helpful assistant for this business. Answer briefly.", provider: "openai", model: "", temperature: 0.7 },
    fields: [
      { key: "label", label: "Label" },
      { key: "prompt", label: "System prompt", kind: "textarea" },
      { key: "provider", label: "Provider", kind: "select", options: ["openai", "anthropic", "gemini", "groq", "mistral", "ollama"] },
      { key: "model", label: "Model (blank = provider default)" },
      { key: "temperature", label: "Temperature", kind: "number" },
    ] },
```

and the `knowledge_search` entry with:

```ts
  { type: "knowledge_search", label: "Knowledge", category: "Logic", icon: Search, accent: "blue",
    defaults: { label: "Knowledge search", knowledgeBaseId: "", query: "{{last_message}}", topK: 3, variable: "knowledge" },
    fields: [
      { key: "label", label: "Label" },
      { key: "knowledgeBaseId", label: "Knowledge base ID (copy from Knowledge page)" },
      { key: "query", label: "Query" },
      { key: "topK", label: "Top results", kind: "number" },
      { key: "variable", label: "Save results as" },
    ] },
```

- [ ] **Step 7: Show the knowledge base ID on the Knowledge page**

In `frontend/src/pages/knowledge/KnowledgePage.tsx`, inside the `<Panel.Header title={\`Documents: ${selectedBase.name}\`} ...>` panel, add this line as the first child of `<Panel.Body>` (before the `docs.isLoading` ternary):

```tsx
                    <p className="form-hint">
                      Knowledge base ID for the flow's Knowledge node: <code>{selectedBase.id}</code>
                    </p>
```

- [ ] **Step 8: Typecheck and try it**

Run: `npm run typecheck` → no output (clean).
Start the app (backend `uvicorn app.main:app --reload`, frontend `npm run dev`), log in, open `/settings`, store an Ollama credential (no key). Expect the toast "Provider key stored" and a row ending `····none`.

- [ ] **Step 9: Commit**

```powershell
git add frontend/src/entities/provider-credential frontend/src/features/provider-credentials frontend/src/widgets/navigation/DashboardShell.tsx frontend/src/pages/settings frontend/src/app/App.tsx frontend/src/widgets/navigation/ChatbotSubNav.tsx frontend/src/features/flow-editor/model/catalog.ts frontend/src/pages/knowledge/KnowledgePage.tsx frontend/src/styles.css
git commit -m "feat(frontend): provider credentials settings page and AI node fields"
```

---

### Task 4: The embedded widget honours the Chatbot Design page

The design page saves colours, title, position, size and placeholder into `flow.definition.design`, but `widget.js` only reads `data-accent`. A professor who changes the colour and then opens the customer page will see no change. Fix: one public endpoint returns the published bot's name and design; the widget applies it on load.

**Files:**
- Modify: `backend/app/slices/conversations/router.py` (new `GET /api/v1/widget/chatbots/{chatbot_id}`)
- Modify: `backend/app/static/widget.js`
- Test: `backend/app/slices/conversations/tests/test_conversations_api.py`

**Interfaces:**
- Produces: `GET /api/v1/widget/chatbots/{chatbot_id}` → `{ "name": str, "design": dict }` (404 unless published). No auth; rate-limited like `widget_start`.
- Consumes: `chatbots_api.get_published_chatbot`, `chatbots_api.get_current_flow` (exist).

- [ ] **Step 1: Write the failing tests**

Append to `backend/app/slices/conversations/tests/test_conversations_api.py`:

```python
DESIGNED_FLOW = {
    **HANDOFF_FLOW,
    "design": {"themeColor": "#e53e3e", "botTitle": "Acme Helper", "positionWeb": "left"},
}


async def test_widget_exposes_published_design(client):
    headers = await _auth(client, "design@x.com", "Acme")
    chatbot_id = await _published_chatbot(client, headers, flow=DESIGNED_FLOW)

    response = await client.get(f"/api/v1/widget/chatbots/{chatbot_id}")
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["name"] == "Concierge"
    assert data["design"]["themeColor"] == "#e53e3e"
    assert data["design"]["botTitle"] == "Acme Helper"


async def test_widget_design_hidden_for_unpublished_bot(client):
    headers = await _auth(client, "design2@x.com", "Acme")
    created = await client.post("/api/v1/chatbots", json={"name": "Draft"}, headers=headers)
    chatbot_id = created.json()["data"]["id"]

    response = await client.get(f"/api/v1/widget/chatbots/{chatbot_id}")
    assert response.status_code == 404


async def test_widget_design_defaults_to_empty_object(client):
    headers = await _auth(client, "design3@x.com", "Acme")
    chatbot_id = await _published_chatbot(client, headers)

    response = await client.get(f"/api/v1/widget/chatbots/{chatbot_id}")
    assert response.json()["data"]["design"] == {}
```

- [ ] **Step 2: Run them to verify they fail**

Run: `.venv\Scripts\python.exe -m pytest app/slices/conversations/tests/test_conversations_api.py -k design -v`
Expected: 3 FAIL with status 404 / 405 (route does not exist).

- [ ] **Step 3: Add the endpoint**

In `backend/app/slices/conversations/router.py`, directly above the `@widget_router.post("/conversations", ...)` decorator, add:

```python
@widget_router.get(
    "/chatbots/{chatbot_id}",
    dependencies=[Depends(rate_limit("widget_profile"))],
)
async def widget_chatbot_profile(
    chatbot_id: uuid.UUID, session: AsyncSession = Depends(get_session)
) -> dict:
    """Public, unauthenticated: the name and saved design of a published bot,
    so widget.js can paint itself before the visitor opens a conversation."""
    chatbot = await chatbots_api.get_published_chatbot(session, chatbot_id=chatbot_id)
    if chatbot is None:
        raise AppError(
            code="NOT_FOUND",
            message="Chatbot not found or not published",
            status_code=404,
        )
    flow = await chatbots_api.get_current_flow(
        session, workspace_id=chatbot.workspace_id, chatbot_id=chatbot.id
    )
    design = flow.definition.get("design", {}) if flow is not None else {}
    return success({"name": chatbot.name, "design": design if isinstance(design, dict) else {}})
```

- [ ] **Step 4: Run the tests**

Run: `.venv\Scripts\python.exe -m pytest app/slices/conversations -v` → all PASS.

- [ ] **Step 5: Make widget.js fetch and apply the design**

In `backend/app/static/widget.js`:

(a) Replace the head markup line inside `root.innerHTML` —

```js
    '<div class="wcb-head"><span class="wcb-title">Chat</span><button type="button" aria-label="Close">×</button></div>' +
```

with

```js
    '<div class="wcb-head"><div><div class="wcb-title">Chat</div><div class="wcb-sub"></div></div><button type="button" aria-label="Close">×</button></div>' +
```

(b) Add `.wcb-sub{font-size:11px;font-weight:400;opacity:.85;margin-top:2px}` to the `css` string (append `+ ".wcb-sub{...}"` before the `var style = ...` line).

(c) After `var title = root.querySelector(".wcb-title");` add:

```js
  var subtitle = root.querySelector(".wcb-sub");
  var bubble = root.querySelector(".wcb-bubble");
  var head = root.querySelector(".wcb-head");
  var overrides = document.createElement("style");
  document.head.appendChild(overrides);

  var SIZES = { S: [320, 440], M: [360, 520], L: [400, 600], XL: [440, 660], XXL: [480, 720] };

  function applyDesign(d) {
    d = d || {};
    var accent = d.themeColor || ACCENT;
    head.style.background = accent;
    bubble.style.background = accent;
    sendButton.style.color = accent;
    overrides.textContent =
      ".wcb-msg.visitor{background:" + accent + "}.wcb-msg.agent{border-color:" + accent + "}";
    if (d.chatBgColor) log.style.background = d.chatBgColor;
    if (d.fontFamily) root.style.fontFamily = d.fontFamily;
    if (d.botTitle) title.textContent = d.botTitle;
    subtitle.textContent = d.botStatusText || "";
    if (d.inputPlaceholder) input.placeholder = d.inputPlaceholder;
    if (d.positionWeb === "left") {
      root.style.right = "auto";
      root.style.left = "20px";
      panel.style.right = "auto";
      panel.style.left = "0";
    }
    var size = d.windowSize === "Custom" ? [d.customWidth || 360, d.customHeight || 520] : SIZES[d.windowSize];
    if (size) {
      panel.style.width = size[0] + "px";
      panel.style.height = size[1] + "px";
    }
  }

  function loadProfile() {
    request("GET", "/widget/chatbots/" + CHATBOT_ID, null, function (status, payload) {
      if (status === 200 && payload && payload.success) {
        if (payload.data.name) title.textContent = payload.data.name;
        applyDesign(payload.data.design);
      }
    });
  }
```

(d) In `start()`, delete the line `if (payload.data.chatbot_name) title.textContent = payload.data.chatbot_name;` (the profile already set the title, and the design's `botTitle` must win).

(e) At the very end of the IIFE, just before `window.WebChatBots = ...`, add `loadProfile();`.

- [ ] **Step 6: Verify in a browser**

With backend running: open `http://127.0.0.1:8000/widget.js` and confirm it serves. Create a small HTML file in the scratchpad containing `<script src="http://127.0.0.1:8000/widget.js" data-chatbot-id="<published id>" data-api="http://127.0.0.1:8000/api/v1" async></script>`, open it, and confirm the bubble takes the colour set on the Chatbot Design page. (Task 11 replaces this ad-hoc file with `/demo`.)

- [ ] **Step 7: Commit**

```powershell
git add backend/app/slices/conversations/router.py backend/app/static/widget.js backend/app/slices/conversations/tests/test_conversations_api.py
git commit -m "feat(widget): apply the saved chatbot design in the embedded widget"
```

---

### Task 5: Analytics overview API and page

Architecture §5 Phase 5. `conversations/api.py` already exposes `daily_counts` and `status_counts` "for Phase 5 analytics". This task adds a per-chatbot breakdown, an `analytics` slice with one endpoint, and a page with stat tiles and a daily bar chart drawn in CSS (no chart library).

**Files:**
- Modify: `backend/app/slices/conversations/api.py` (add `counts_by_chatbot`)
- Modify: `backend/app/slices/chatbots/api.py` (add `list_names`)
- Create: `backend/app/slices/analytics/__init__.py`, `router.py`, `tests/__init__.py`, `tests/test_analytics_api.py`
- Modify: `backend/app/main.py`, `backend/pyproject.toml`
- Create: `frontend/src/entities/analytics/api.ts`, `frontend/src/pages/analytics/AnalyticsPage.tsx`
- Modify: `frontend/src/app/App.tsx`, `frontend/src/widgets/navigation/PrimaryNav.tsx:82-89`, `frontend/src/styles.css`

**Interfaces:**
- Produces: `GET /api/v1/analytics/overview?days=30` →
  ```json
  {"days": 30,
   "totals": {"conversations": 12, "messages": 80, "chatbots": 2, "active": 1, "handoff": 2, "closed": 9},
   "daily": [{"day": "2026-09-01", "conversations": 3, "messages": 20}],
   "by_chatbot": [{"chatbot_id": "…", "name": "FAQ Bot", "conversations": 7}]}
  ```
- Produces: `conversations_api.counts_by_chatbot(session, *, workspace_id, since) -> list[tuple[uuid.UUID, int]]`; `chatbots_api.list_names(session, *, workspace_id) -> dict[uuid.UUID, str]`.

- [ ] **Step 1: Write the failing API test**

Create `backend/app/slices/analytics/__init__.py` and `backend/app/slices/analytics/tests/__init__.py` (both empty). Create `backend/app/slices/analytics/tests/test_analytics_api.py`:

```python
async def _auth(client, email: str, org: str) -> dict:
    response = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "Secret123", "full_name": "Owner", "org_name": org},
    )
    assert response.status_code == 201
    return {"Authorization": f"Bearer {response.json()['data']['access_token']}"}


async def _published_chatbot(client, headers, name: str) -> str:
    created = await client.post("/api/v1/chatbots", json={"name": name}, headers=headers)
    chatbot_id = created.json()["data"]["id"]
    published = await client.patch(
        f"/api/v1/chatbots/{chatbot_id}", json={"status": "published"}, headers=headers
    )
    assert published.status_code == 200
    return chatbot_id


async def test_overview_counts_conversations_per_day_and_per_bot(client):
    headers = await _auth(client, "stats@x.com", "Acme")
    faq = await _published_chatbot(client, headers, "FAQ Bot")
    sales = await _published_chatbot(client, headers, "Sales Bot")
    for chatbot_id in (faq, faq, sales):
        started = await client.post("/api/v1/widget/conversations", json={"chatbot_id": chatbot_id})
        assert started.status_code == 201

    response = await client.get("/api/v1/analytics/overview?days=7", headers=headers)
    assert response.status_code == 200
    data = response.json()["data"]

    assert data["days"] == 7
    assert data["totals"]["conversations"] == 3
    assert data["totals"]["chatbots"] == 2
    # The default flow is welcome → end, so every conversation closes at once.
    assert data["totals"]["closed"] == 3
    assert data["totals"]["messages"] == 3
    assert len(data["daily"]) == 1
    assert data["daily"][0]["conversations"] == 3
    by_name = {row["name"]: row["conversations"] for row in data["by_chatbot"]}
    assert by_name == {"FAQ Bot": 2, "Sales Bot": 1}


async def test_overview_is_workspace_scoped(client):
    headers_a = await _auth(client, "a@x.com", "A")
    headers_b = await _auth(client, "b@x.com", "B")
    bot_a = await _published_chatbot(client, headers_a, "A bot")
    await client.post("/api/v1/widget/conversations", json={"chatbot_id": bot_a})

    response = await client.get("/api/v1/analytics/overview", headers=headers_b)
    assert response.status_code == 200
    assert response.json()["data"]["totals"]["conversations"] == 0
    assert response.json()["data"]["by_chatbot"] == []


async def test_overview_rejects_bad_window(client):
    headers = await _auth(client, "window@x.com", "Acme")
    response = await client.get("/api/v1/analytics/overview?days=0", headers=headers)
    # The global handler renders validation failures as 400 VALIDATION_ERROR.
    assert response.status_code == 400
    assert response.json()["error"] == "VALIDATION_ERROR"
```

- [ ] **Step 2: Run to verify it fails**

Run: `.venv\Scripts\python.exe -m pytest app/slices/analytics -v`
Expected: FAIL with 404 on `/api/v1/analytics/overview`.

- [ ] **Step 3: Extend the two published APIs**

Append to `backend/app/slices/conversations/api.py`:

```python
async def counts_by_chatbot(
    session: AsyncSession, *, workspace_id: uuid.UUID, since: datetime
) -> list[tuple[uuid.UUID, int]]:
    """Conversations started per chatbot since `since`, most active first."""
    rows = await session.execute(
        select(Conversation.chatbot_id, func.count())
        .where(
            Conversation.workspace_id == workspace_id,
            Conversation.created_at >= since,
            Conversation.deleted_at.is_(None),
        )
        .group_by(Conversation.chatbot_id)
        .order_by(func.count().desc())
    )
    return [(chatbot_id, count) for chatbot_id, count in rows]
```

Append to `backend/app/slices/chatbots/api.py` (before `__all__`, and add `"list_names"` to `__all__`):

```python
async def list_names(
    session: AsyncSession, *, workspace_id: uuid.UUID
) -> dict[uuid.UUID, str]:
    """id → name for every live chatbot in the workspace."""
    rows = await session.execute(
        select(Chatbot.id, Chatbot.name).where(
            Chatbot.workspace_id == workspace_id, Chatbot.deleted_at.is_(None)
        )
    )
    return {chatbot_id: name for chatbot_id, name in rows}
```

- [ ] **Step 4: The analytics router**

Create `backend/app/slices/analytics/router.py`:

```python
"""Read-only workspace analytics. Composes the published APIs of the
conversations and chatbots slices; owns no tables of its own."""

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.core.envelope import success
from app.shared import permissions
from app.shared.context import WorkspaceContext
from app.slices.authz import api as authz_api
from app.slices.chatbots import api as chatbots_api
from app.slices.conversations import api as conversations_api

router = APIRouter(prefix="/api/v1/analytics", tags=["analytics"])

read_context = authz_api.require_permission(permissions.FEATURES_READ)


@router.get("/overview")
async def overview(
    days: int = Query(default=30, ge=1, le=365),
    ctx: WorkspaceContext = Depends(read_context),
    session: AsyncSession = Depends(get_session),
) -> dict:
    since = datetime.now(timezone.utc) - timedelta(days=days)
    daily = await conversations_api.daily_counts(
        session, workspace_id=ctx.workspace_id, since=since
    )
    statuses = await conversations_api.status_counts(session, workspace_id=ctx.workspace_id)
    per_bot = await conversations_api.counts_by_chatbot(
        session, workspace_id=ctx.workspace_id, since=since
    )
    names = await chatbots_api.list_names(session, workspace_id=ctx.workspace_id)

    return success(
        {
            "days": days,
            "totals": {
                "conversations": sum(statuses.values()),
                "messages": sum(row["messages"] for row in daily),
                "chatbots": len(names),
                "active": statuses.get("active", 0),
                "handoff": statuses.get("handoff", 0),
                "closed": statuses.get("closed", 0),
            },
            "daily": daily,
            "by_chatbot": [
                {
                    "chatbot_id": str(chatbot_id),
                    "name": names.get(chatbot_id, "Deleted chatbot"),
                    "conversations": count,
                }
                for chatbot_id, count in per_bot
            ],
        }
    )
```

Register it in `backend/app/main.py`: add `from app.slices.analytics.router import router as analytics_router` and `app.include_router(analytics_router)` after the conversations router.

In `backend/pyproject.toml`, add `"app.slices.analytics",` to the `source_modules` list of the contract named "cross-slice imports use published APIs only".

- [ ] **Step 5: Run tests and the linter**

Run: `.venv\Scripts\python.exe -m pytest app/slices/analytics app/slices/conversations -v` → PASS.
Run: `.venv\Scripts\lint-imports.exe` → 3 kept, 0 broken.

- [ ] **Step 6: Frontend entity + page**

Create `frontend/src/entities/analytics/api.ts`:

```ts
import { apiRequest } from "../../shared/api/client";

export interface AnalyticsOverview {
  days: number;
  totals: { conversations: number; messages: number; chatbots: number; active: number; handoff: number; closed: number };
  daily: { day: string; conversations: number; messages: number }[];
  by_chatbot: { chatbot_id: string; name: string; conversations: number }[];
}

export const analyticsApi = {
  overview: (days: number) => apiRequest<AnalyticsOverview>(`/analytics/overview?days=${days}`),
};
```

Create `frontend/src/pages/analytics/AnalyticsPage.tsx`:

```tsx
import { useQuery } from "@tanstack/react-query";
import { BarChart3 } from "lucide-react";
import { useState } from "react";

import { analyticsApi } from "../../entities/analytics/api";
import { EmptyState, LoadingState, Panel, Select } from "../../shared/ui";
import { DashboardShell } from "../../widgets/navigation/DashboardShell";

const WINDOWS = [7, 30, 90] as const;

export function AnalyticsPage() {
  const [days, setDays] = useState<number>(30);
  const overview = useQuery({
    queryKey: ["analytics", days],
    queryFn: () => analyticsApi.overview(days),
    refetchInterval: 10_000,
  });

  const data = overview.data;
  const peak = Math.max(1, ...(data?.daily.map((d) => d.conversations) ?? [1]));

  return (
    <DashboardShell
      title="Analytics"
      subtitle="Conversation volume across every chatbot in this workspace."
      actions={
        <Select value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="Time window">
          {WINDOWS.map((n) => (
            <option key={n} value={n}>Last {n} days</option>
          ))}
        </Select>
      }
    >
      {overview.isLoading || !data ? (
        <LoadingState label="Crunching numbers" />
      ) : (
        <>
          <div className="stat-grid">
            <StatTile label="Conversations" value={data.totals.conversations} />
            <StatTile label="Messages" value={data.totals.messages} />
            <StatTile label="Chatbots" value={data.totals.chatbots} />
            <StatTile label="Waiting for agent" value={data.totals.handoff} tone="warn" />
            <StatTile label="Active" value={data.totals.active} />
            <StatTile label="Closed" value={data.totals.closed} />
          </div>

          <Panel>
            <Panel.Header title="Conversations per day" meta={`${data.days}-day window`} />
            <Panel.Body>
              {data.daily.length === 0 ? (
                <EmptyState icon={<BarChart3 size={28} />} title="No conversations yet" description="Open the demo page and chat with a bot to see data here." />
              ) : (
                <div className="bar-chart" role="img" aria-label="Conversations per day">
                  {data.daily.map((row) => (
                    <div key={row.day} className="bar-col" title={`${row.day}: ${row.conversations} conversations, ${row.messages} messages`}>
                      <div className="bar" style={{ height: `${(row.conversations / peak) * 100}%` }} />
                      <span className="bar-label">{row.day.slice(5)}</span>
                    </div>
                  ))}
                </div>
              )}
            </Panel.Body>
          </Panel>

          <Panel>
            <Panel.Header title="Conversations by chatbot" />
            <Panel.Body flush>
              {data.by_chatbot.length === 0 ? (
                <EmptyState title="Nothing to rank yet" />
              ) : (
                <table className="simple-table">
                  <thead><tr><th>Chatbot</th><th>Conversations</th><th>Share</th></tr></thead>
                  <tbody>
                    {data.by_chatbot.map((row) => (
                      <tr key={row.chatbot_id}>
                        <td>{row.name}</td>
                        <td>{row.conversations}</td>
                        <td>{Math.round((row.conversations / Math.max(1, data.totals.conversations)) * 100)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Panel.Body>
          </Panel>
        </>
      )}
    </DashboardShell>
  );
}

function StatTile({ label, value, tone }: { label: string; value: number; tone?: "warn" }) {
  return (
    <div className={`stat-tile ${tone === "warn" ? "is-warn" : ""}`}>
      <span className="stat-label">{label}</span>
      <strong className="stat-value">{value}</strong>
    </div>
  );
}
```

Append to `frontend/src/styles.css`:

```css
/* ── Analytics ──────────────────────────────────────────────────────────── */
.stat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 14px; }
.stat-tile { background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px 18px; display: flex; flex-direction: column; gap: 6px; }
.stat-tile.is-warn { border-color: #fcd34d; background: #fffbeb; }
.stat-label { font-size: 12px; color: #64748b; text-transform: uppercase; letter-spacing: .04em; }
.stat-value { font-size: 28px; font-weight: 800; color: #0f172a; }
.bar-chart { display: flex; align-items: flex-end; gap: 8px; height: 220px; padding: 8px 4px 0; overflow-x: auto; }
.bar-col { flex: 1 0 28px; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; height: 100%; gap: 6px; }
.bar { width: 100%; max-width: 40px; background: #16c784; border-radius: 6px 6px 0 0; min-height: 3px; transition: height .3s ease; }
.bar-label { font-size: 11px; color: #64748b; }
.simple-table { width: 100%; border-collapse: collapse; }
.simple-table th, .simple-table td { text-align: left; padding: 10px 16px; border-bottom: 1px solid #e2e8f0; font-size: 14px; }
.simple-table th { font-size: 12px; text-transform: uppercase; color: #64748b; letter-spacing: .04em; }
```

- [ ] **Step 7: Route and nav**

In `frontend/src/app/App.tsx` add `import { AnalyticsPage } from "../pages/analytics/AnalyticsPage";` and a route (above `path="*"`):

```tsx
      <Route
        path="/analytics"
        element={authenticated ? <AnalyticsPage /> : <Navigate to="/login" replace />}
      />
```

In `frontend/src/widgets/navigation/PrimaryNav.tsx`, change the Analytics link's `to="/chatbots"` to `to="/analytics"`.

- [ ] **Step 8: Typecheck, look at it, commit**

Run: `npm run typecheck` → clean. Open `/analytics`; after chatting with a published bot from the widget, the tiles and the bar update within 10 seconds.

```powershell
git add backend/app/slices/analytics backend/app/slices/conversations/api.py backend/app/slices/chatbots/api.py backend/app/main.py backend/pyproject.toml frontend/src/entities/analytics frontend/src/pages/analytics frontend/src/app/App.tsx frontend/src/widgets/navigation/PrimaryNav.tsx frontend/src/styles.css
git commit -m "feat(analytics): workspace overview endpoint and analytics page"
```

---

### Task 6: Team management (Phase 1b, demo-sized)

Multi-tenancy with roles is the platform's thesis (D2, RBAC), but nothing on screen shows a second user. This task adds a `members` slice: list members, add a member (creating the user with a chosen password, so the professor can log in as them), change role, remove. Import-linter's layer contract says `tenancy` must not import `identity`, so the router lives in its own slice and composes both published APIs.

**Files:**
- Modify: `backend/app/slices/identity/repository.py` (add `select_users`), `backend/app/slices/identity/api.py` (add `full_name`, `get_user_by_email`, `create_user`, `list_users`)
- Modify: `backend/app/slices/tenancy/repository.py`, `backend/app/slices/tenancy/api.py` (workspace view, list/update/remove memberships)
- Modify: `backend/app/slices/audit/actions.py` (three actions)
- Create: `backend/app/slices/members/__init__.py`, `schemas.py`, `router.py`, `tests/__init__.py`, `tests/test_members_api.py`
- Modify: `backend/app/main.py`, `backend/pyproject.toml`
- Create: `frontend/src/entities/workspace/api.ts`, `frontend/src/features/team/TeamPanel.tsx`
- Modify: `frontend/src/pages/settings/SettingsPage.tsx`, `frontend/src/styles.css`

**Interfaces:**
- Produces HTTP:
  - `GET /api/v1/workspace` → `{id, name, organization_name, your_role}` (FEATURES_READ)
  - `GET /api/v1/workspace/members` → `[{user_id, email, full_name, role, joined_at}]` (FEATURES_READ)
  - `POST /api/v1/workspace/members` `{email, full_name, password, role}` → member row, 201 (MEMBERS_MANAGE). Creates the user if the email is unknown; otherwise attaches the existing user. 400 `ALREADY_MEMBER` if already in the workspace.
  - `PATCH /api/v1/workspace/members/{user_id}` `{role}` (MEMBERS_MANAGE); 400 `CANNOT_EDIT_SELF`.
  - `DELETE /api/v1/workspace/members/{user_id}` (MEMBERS_MANAGE); 400 `CANNOT_EDIT_SELF`; 404 if not a member.
- Produces Python:
  - `identity_api.UserSummary` gains `full_name: str = ""`; `identity_api.get_user_by_email(session, *, email) -> UserSummary | None`; `identity_api.create_user(session, *, email, password, full_name) -> UserSummary`; `identity_api.list_users(session, *, user_ids) -> dict[uuid.UUID, UserSummary]`
  - `tenancy_api.WorkspaceView(id, name, organization_name)`; `tenancy_api.get_workspace(session, *, workspace_id) -> WorkspaceView | None`
  - `tenancy_api.MemberRow(user_id, role_name, joined_at: datetime)`; `tenancy_api.list_memberships(session, *, workspace_id) -> list[MemberRow]`
  - `tenancy_api.set_membership_role(session, *, workspace_id, user_id, role_id) -> bool`; `tenancy_api.remove_membership(session, *, workspace_id, user_id) -> bool`
- Roles are the seeded system roles: `owner`, `admin`, `member`, `viewer`.

- [ ] **Step 1: Write the failing API tests**

Create `backend/app/slices/members/__init__.py`, `backend/app/slices/members/tests/__init__.py` (empty) and `backend/app/slices/members/tests/test_members_api.py`:

```python
async def _register(client, email: str, org: str) -> dict:
    response = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "Secret123", "full_name": "Owner", "org_name": org},
    )
    assert response.status_code == 201, response.text
    return response.json()["data"]


def _headers(bundle: dict) -> dict:
    return {"Authorization": f"Bearer {bundle['access_token']}"}


NEW_MEMBER = {
    "email": "agent@acme.test",
    "full_name": "Agent Ana",
    "password": "AgentPass123",
    "role": "member",
}


async def test_workspace_profile_shows_name_and_role(client):
    owner = await _register(client, "owner@acme.test", "Acme Corp")
    response = await client.get("/api/v1/workspace", headers=_headers(owner))
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["id"] == owner["workspace_id"]
    assert data["organization_name"] == "Acme Corp"
    assert data["name"] == "Default"
    assert data["your_role"] == "owner"


async def test_owner_is_the_only_member_at_first(client):
    owner = await _register(client, "solo@acme.test", "Acme")
    response = await client.get("/api/v1/workspace/members", headers=_headers(owner))
    assert response.status_code == 200
    members = response.json()["data"]
    assert [m["email"] for m in members] == ["solo@acme.test"]
    assert members[0]["role"] == "owner"


async def test_add_member_creates_user_who_can_log_in(client):
    owner = await _register(client, "boss@acme.test", "Acme")
    created = await client.post("/api/v1/workspace/members", json=NEW_MEMBER, headers=_headers(owner))
    assert created.status_code == 201, created.text
    assert created.json()["data"]["role"] == "member"

    login = await client.post(
        "/api/v1/auth/login", json={"email": NEW_MEMBER["email"], "password": NEW_MEMBER["password"]}
    )
    assert login.status_code == 200
    assert login.json()["data"]["workspace_id"] == owner["workspace_id"]

    # A plain member may read conversations but may not manage members.
    forbidden = await client.get("/api/v1/workspace/members", headers=_headers(login.json()["data"]))
    assert forbidden.status_code == 200
    denied = await client.post(
        "/api/v1/workspace/members",
        json={**NEW_MEMBER, "email": "third@acme.test"},
        headers=_headers(login.json()["data"]),
    )
    assert denied.status_code == 403


async def test_add_existing_user_attaches_without_changing_password(client):
    owner = await _register(client, "own@acme.test", "Acme")
    other = await _register(client, "guest@other.test", "Other Co")
    created = await client.post(
        "/api/v1/workspace/members",
        json={"email": "guest@other.test", "full_name": "x", "password": "ignored-XYZ1", "role": "viewer"},
        headers=_headers(owner),
    )
    assert created.status_code == 201
    login = await client.post(
        "/api/v1/auth/login", json={"email": "guest@other.test", "password": "Secret123"}
    )
    assert login.status_code == 200
    assert login.json()["data"]["user_id"] == other["user_id"]


async def test_add_member_twice_is_rejected(client):
    owner = await _register(client, "dup@acme.test", "Acme")
    first = await client.post("/api/v1/workspace/members", json=NEW_MEMBER, headers=_headers(owner))
    assert first.status_code == 201
    second = await client.post("/api/v1/workspace/members", json=NEW_MEMBER, headers=_headers(owner))
    assert second.status_code == 400
    assert second.json()["error"] == "ALREADY_MEMBER"


async def test_change_role_and_remove(client):
    owner = await _register(client, "lead@acme.test", "Acme")
    created = await client.post("/api/v1/workspace/members", json=NEW_MEMBER, headers=_headers(owner))
    user_id = created.json()["data"]["user_id"]

    promoted = await client.patch(
        f"/api/v1/workspace/members/{user_id}", json={"role": "admin"}, headers=_headers(owner)
    )
    assert promoted.status_code == 200
    assert promoted.json()["data"]["role"] == "admin"

    removed = await client.delete(f"/api/v1/workspace/members/{user_id}", headers=_headers(owner))
    assert removed.status_code == 200
    members = await client.get("/api/v1/workspace/members", headers=_headers(owner))
    assert [m["email"] for m in members.json()["data"]] == ["lead@acme.test"]

    again = await client.delete(f"/api/v1/workspace/members/{user_id}", headers=_headers(owner))
    assert again.status_code == 404


async def test_cannot_edit_yourself(client):
    owner = await _register(client, "me@acme.test", "Acme")
    me = owner["user_id"]
    demote = await client.patch(
        f"/api/v1/workspace/members/{me}", json={"role": "viewer"}, headers=_headers(owner)
    )
    assert demote.status_code == 400
    assert demote.json()["error"] == "CANNOT_EDIT_SELF"
    remove = await client.delete(f"/api/v1/workspace/members/{me}", headers=_headers(owner))
    assert remove.status_code == 400


async def test_unknown_role_is_rejected(client):
    owner = await _register(client, "role@acme.test", "Acme")
    response = await client.post(
        "/api/v1/workspace/members", json={**NEW_MEMBER, "role": "god"}, headers=_headers(owner)
    )
    assert response.status_code == 400
    assert response.json()["error"] == "VALIDATION_ERROR"


async def test_members_are_workspace_scoped(client):
    owner_a = await _register(client, "a@acme.test", "A")
    owner_b = await _register(client, "b@acme.test", "B")
    await client.post("/api/v1/workspace/members", json=NEW_MEMBER, headers=_headers(owner_a))
    members_b = await client.get("/api/v1/workspace/members", headers=_headers(owner_b))
    assert [m["email"] for m in members_b.json()["data"]] == ["b@acme.test"]


async def test_member_mutations_are_audited(client, session):
    from sqlalchemy import text

    owner = await _register(client, "audit@acme.test", "Acme")
    created = await client.post("/api/v1/workspace/members", json=NEW_MEMBER, headers=_headers(owner))
    user_id = created.json()["data"]["user_id"]
    await client.patch(f"/api/v1/workspace/members/{user_id}", json={"role": "admin"}, headers=_headers(owner))
    await client.delete(f"/api/v1/workspace/members/{user_id}", headers=_headers(owner))

    rows = await session.execute(
        text("SELECT action FROM audit_logs WHERE workspace_id = :ws AND action LIKE 'member.%' ORDER BY created_at"),
        {"ws": owner["workspace_id"]},
    )
    assert [row[0] for row in rows] == ["member.added", "member.role_changed", "member.removed"]
```

- [ ] **Step 2: Run to verify they fail**

Run: `.venv\Scripts\python.exe -m pytest app/slices/members -v`
Expected: every test FAILS with 404 (no route).

- [ ] **Step 3: Identity additions**

Append to `backend/app/slices/identity/repository.py`:

```python
async def select_users(
    session: AsyncSession, user_ids: list[uuid.UUID]
) -> list[User]:
    if not user_ids:
        return []
    statement = select(User).where(User.id.in_(user_ids), User.deleted_at.is_(None))
    return list((await session.execute(statement)).scalars().all())
```

Replace the body of `backend/app/slices/identity/api.py` (everything above the trailing `get_current_principal` import) with:

```python
"""Published interface for the identity slice."""

import uuid
from dataclasses import dataclass

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import security
from app.core.errors import AppError
from app.slices.identity import repository


@dataclass(frozen=True)
class UserSummary:
    id: uuid.UUID
    email: str
    is_active: bool
    full_name: str = ""


def _summary(user) -> UserSummary:
    return UserSummary(
        id=user.id, email=user.email, is_active=user.is_active, full_name=user.full_name
    )


async def get_active_user(
    session: AsyncSession, *, user_id: uuid.UUID
) -> UserSummary | None:
    user = await repository.select_user(session, user_id)
    return None if user is None else _summary(user)


async def get_user_by_email(
    session: AsyncSession, *, email: str
) -> UserSummary | None:
    user = await repository.select_user_by_email(session, email.strip().lower())
    return None if user is None else _summary(user)


async def create_user(
    session: AsyncSession, *, email: str, password: str, full_name: str
) -> UserSummary:
    """Create a login for someone added to a workspace by an admin."""
    try:
        user = await repository.insert_user(
            session,
            email=email.strip().lower(),
            password_hash=security.hash_password(password),
            full_name=full_name.strip(),
        )
    except IntegrityError as exc:
        await session.rollback()
        raise AppError(
            code="EMAIL_TAKEN", message="Email already registered", status_code=400
        ) from exc
    return _summary(user)


async def list_users(
    session: AsyncSession, *, user_ids: list[uuid.UUID]
) -> dict[uuid.UUID, UserSummary]:
    return {user.id: _summary(user) for user in await repository.select_users(session, user_ids)}
```

and update the trailing lines to:

```python
from app.slices.identity.dependencies import get_current_principal  # noqa: E402

__all__ = [
    "UserSummary",
    "create_user",
    "get_active_user",
    "get_current_principal",
    "get_user_by_email",
    "list_users",
]
```

- [ ] **Step 4: Tenancy additions**

Append to `backend/app/slices/tenancy/repository.py`:

```python
from datetime import datetime, timezone


async def select_workspace_with_organization(
    session: AsyncSession, *, workspace_id: uuid.UUID
) -> tuple[Workspace, Organization] | None:
    statement = (
        select(Workspace, Organization)
        .join(Organization, Organization.id == Workspace.organization_id)
        .where(Workspace.id == workspace_id, Workspace.deleted_at.is_(None))
    )
    row = (await session.execute(statement)).first()
    return (row[0], row[1]) if row else None


async def list_memberships_with_roles(
    session: AsyncSession, *, workspace_id: uuid.UUID
) -> list[tuple[Membership, Role]]:
    statement = (
        select(Membership, Role)
        .join(Role, Role.id == Membership.role_id)
        .where(Membership.workspace_id == workspace_id, Membership.deleted_at.is_(None))
        .order_by(Membership.created_at, Membership.id)
    )
    return [(row[0], row[1]) for row in (await session.execute(statement)).all()]


async def select_membership(
    session: AsyncSession, *, workspace_id: uuid.UUID, user_id: uuid.UUID
) -> Membership | None:
    statement = select(Membership).where(
        Membership.workspace_id == workspace_id,
        Membership.user_id == user_id,
        Membership.deleted_at.is_(None),
    )
    return (await session.execute(statement)).scalar_one_or_none()


async def soft_delete_membership(session: AsyncSession, *, membership: Membership) -> None:
    membership.deleted_at = datetime.now(timezone.utc)
    await session.flush()
```

Append to `backend/app/slices/tenancy/api.py`:

```python
from datetime import datetime


@dataclass(frozen=True)
class WorkspaceView:
    id: uuid.UUID
    name: str
    organization_name: str


@dataclass(frozen=True)
class MemberRow:
    user_id: uuid.UUID
    role_name: str
    joined_at: datetime


async def get_workspace(
    session: AsyncSession, *, workspace_id: uuid.UUID
) -> WorkspaceView | None:
    found = await repository.select_workspace_with_organization(
        session, workspace_id=workspace_id
    )
    if found is None:
        return None
    workspace, organization = found
    return WorkspaceView(
        id=workspace.id, name=workspace.name, organization_name=organization.name
    )


async def list_memberships(
    session: AsyncSession, *, workspace_id: uuid.UUID
) -> list[MemberRow]:
    rows = await repository.list_memberships_with_roles(session, workspace_id=workspace_id)
    return [
        MemberRow(user_id=membership.user_id, role_name=role.name, joined_at=membership.created_at)
        for membership, role in rows
    ]


async def set_membership_role(
    session: AsyncSession, *, workspace_id: uuid.UUID, user_id: uuid.UUID, role_id: uuid.UUID
) -> bool:
    membership = await repository.select_membership(
        session, workspace_id=workspace_id, user_id=user_id
    )
    if membership is None:
        return False
    membership.role_id = role_id
    await session.flush()
    return True


async def remove_membership(
    session: AsyncSession, *, workspace_id: uuid.UUID, user_id: uuid.UUID
) -> bool:
    membership = await repository.select_membership(
        session, workspace_id=workspace_id, user_id=user_id
    )
    if membership is None:
        return False
    await repository.soft_delete_membership(session, membership=membership)
    return True
```

(Move the `from datetime import datetime` line up with the other imports.)

Append to `backend/app/slices/audit/actions.py`:

```python
MEMBER_ADDED = "member.added"
MEMBER_ROLE_CHANGED = "member.role_changed"
MEMBER_REMOVED = "member.removed"
```

- [ ] **Step 5: The members slice**

Create `backend/app/slices/members/schemas.py`:

```python
import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, EmailStr, Field

RoleName = Literal["owner", "admin", "member", "viewer"]


class MemberAdd(BaseModel):
    email: EmailStr
    full_name: str = Field(min_length=1, max_length=200)
    password: str = Field(min_length=8, max_length=200)
    role: RoleName = "member"


class MemberRoleUpdate(BaseModel):
    role: RoleName


class MemberOut(BaseModel):
    user_id: uuid.UUID
    email: str
    full_name: str
    role: str
    joined_at: datetime
```

Create `backend/app/slices/members/router.py`:

```python
"""Workspace membership management (Phase 1b, demo scope).

Composes identity (users) and tenancy (memberships, roles) through their
published APIs. Lives in its own slice because the layer contract forbids
tenancy from importing identity.
"""

import uuid

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.core.envelope import success
from app.core.errors import AppError
from app.shared import permissions
from app.shared.context import WorkspaceContext
from app.slices.audit import api as audit_api
from app.slices.authz import api as authz_api
from app.slices.identity import api as identity_api
from app.slices.members.schemas import MemberAdd, MemberOut, MemberRoleUpdate
from app.slices.tenancy import api as tenancy_api

router = APIRouter(prefix="/api/v1/workspace", tags=["workspace"])

read_context = authz_api.require_permission(permissions.FEATURES_READ)
manage_context = authz_api.require_permission(permissions.MEMBERS_MANAGE)


async def _members(session: AsyncSession, workspace_id: uuid.UUID) -> list[dict]:
    rows = await tenancy_api.list_memberships(session, workspace_id=workspace_id)
    users = await identity_api.list_users(session, user_ids=[row.user_id for row in rows])
    out = []
    for row in rows:
        user = users.get(row.user_id)
        if user is None:
            continue
        out.append(
            MemberOut(
                user_id=row.user_id,
                email=user.email,
                full_name=user.full_name,
                role=row.role_name,
                joined_at=row.joined_at,
            ).model_dump(mode="json")
        )
    return out


async def _role_id(session: AsyncSession, name: str) -> uuid.UUID:
    role = await tenancy_api.get_role_by_name(session, name)
    if role is None:
        raise AppError(code="ROLES_NOT_SEEDED", message="System roles are missing", status_code=500)
    return role.id


def _forbid_self(ctx: WorkspaceContext, user_id: uuid.UUID) -> None:
    if user_id == ctx.user_id:
        raise AppError(
            code="CANNOT_EDIT_SELF",
            message="You cannot change or remove your own membership",
            status_code=400,
        )


@router.get("")
async def workspace_profile(
    ctx: WorkspaceContext = Depends(read_context),
    session: AsyncSession = Depends(get_session),
) -> dict:
    workspace = await tenancy_api.get_workspace(session, workspace_id=ctx.workspace_id)
    if workspace is None:
        raise AppError(code="NOT_FOUND", message="Workspace not found", status_code=404)
    return success(
        {
            "id": str(workspace.id),
            "name": workspace.name,
            "organization_name": workspace.organization_name,
            "your_role": ctx.role,
        }
    )


@router.get("/members")
async def list_members(
    ctx: WorkspaceContext = Depends(read_context),
    session: AsyncSession = Depends(get_session),
) -> dict:
    return success(await _members(session, ctx.workspace_id))


@router.post("/members", status_code=201)
async def add_member(
    body: MemberAdd,
    ctx: WorkspaceContext = Depends(manage_context),
    session: AsyncSession = Depends(get_session),
) -> JSONResponse:
    user = await identity_api.get_user_by_email(session, email=str(body.email))
    created_login = user is None
    if user is None:
        user = await identity_api.create_user(
            session, email=str(body.email), password=body.password, full_name=body.full_name
        )
    existing = [
        row for row in await tenancy_api.list_memberships(session, workspace_id=ctx.workspace_id)
        if row.user_id == user.id
    ]
    if existing:
        raise AppError(
            code="ALREADY_MEMBER", message="That person is already in this workspace", status_code=400
        )
    role_id = await _role_id(session, body.role)
    await tenancy_api.create_membership(
        session, user_id=user.id, workspace_id=ctx.workspace_id, role_id=role_id
    )
    await audit_api.record(
        session,
        action=audit_api.actions.MEMBER_ADDED,
        workspace_id=ctx.workspace_id,
        actor_id=ctx.user_id,
        target_type="user",
        target_id=str(user.id),
        metadata={"email": user.email, "role": body.role, "created_login": created_login},
    )
    await session.commit()
    member = next(m for m in await _members(session, ctx.workspace_id) if m["user_id"] == str(user.id))
    return JSONResponse(status_code=201, content=success(member))


@router.patch("/members/{user_id}")
async def change_role(
    user_id: uuid.UUID,
    body: MemberRoleUpdate,
    ctx: WorkspaceContext = Depends(manage_context),
    session: AsyncSession = Depends(get_session),
) -> dict:
    _forbid_self(ctx, user_id)
    role_id = await _role_id(session, body.role)
    changed = await tenancy_api.set_membership_role(
        session, workspace_id=ctx.workspace_id, user_id=user_id, role_id=role_id
    )
    if not changed:
        raise AppError(code="NOT_FOUND", message="Member not found", status_code=404)
    await audit_api.record(
        session,
        action=audit_api.actions.MEMBER_ROLE_CHANGED,
        workspace_id=ctx.workspace_id,
        actor_id=ctx.user_id,
        target_type="user",
        target_id=str(user_id),
        metadata={"role": body.role},
    )
    await session.commit()
    member = next(m for m in await _members(session, ctx.workspace_id) if m["user_id"] == str(user_id))
    return success(member)


@router.delete("/members/{user_id}")
async def remove_member(
    user_id: uuid.UUID,
    ctx: WorkspaceContext = Depends(manage_context),
    session: AsyncSession = Depends(get_session),
) -> dict:
    _forbid_self(ctx, user_id)
    removed = await tenancy_api.remove_membership(
        session, workspace_id=ctx.workspace_id, user_id=user_id
    )
    if not removed:
        raise AppError(code="NOT_FOUND", message="Member not found", status_code=404)
    await audit_api.record(
        session,
        action=audit_api.actions.MEMBER_REMOVED,
        workspace_id=ctx.workspace_id,
        actor_id=ctx.user_id,
        target_type="user",
        target_id=str(user_id),
    )
    await session.commit()
    return success({"removed": True})
```

Register in `backend/app/main.py`: `from app.slices.members.router import router as members_router` and `app.include_router(members_router)`.

In `backend/pyproject.toml` add `"app.slices.members",` to the same `source_modules` list as Task 5.

- [ ] **Step 6: Run tests and linter**

Run: `.venv\Scripts\python.exe -m pytest app/slices/members app/slices/identity app/slices/tenancy app/slices/authz -v` → PASS.
Run: `.venv\Scripts\lint-imports.exe` → 3 kept, 0 broken.

Why the login test passes without touching `login.py`: a user created by an admin has `last_workspace_id` NULL, and `app/slices/identity/use_cases/login.py:69-71` already falls back to `tenancy_api.get_earliest_workspace_id`, so they land in the workspace they were added to.

- [ ] **Step 7: Frontend entity and Team panel**

Create `frontend/src/entities/workspace/api.ts`:

```ts
import { apiRequest } from "../../shared/api/client";

export type RoleName = "owner" | "admin" | "member" | "viewer";
export const ROLES: RoleName[] = ["owner", "admin", "member", "viewer"];

export interface WorkspaceProfile { id: string; name: string; organization_name: string; your_role: RoleName; }
export interface Member { user_id: string; email: string; full_name: string; role: RoleName; joined_at: string; }
export interface MemberAdd { email: string; full_name: string; password: string; role: RoleName; }

export const workspaceApi = {
  profile: () => apiRequest<WorkspaceProfile>("/workspace"),
  members: () => apiRequest<Member[]>("/workspace/members"),
  addMember: (input: MemberAdd) =>
    apiRequest<Member>("/workspace/members", { method: "POST", body: JSON.stringify(input) }),
  changeRole: (userId: string, role: RoleName) =>
    apiRequest<Member>(`/workspace/members/${userId}`, { method: "PATCH", body: JSON.stringify({ role }) }),
  removeMember: (userId: string) =>
    apiRequest<{ removed: boolean }>(`/workspace/members/${userId}`, { method: "DELETE" }),
};
```

Create `frontend/src/features/team/TeamPanel.tsx`:

```tsx
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { UserPlus, UserX } from "lucide-react";
import { useState } from "react";

import { ROLES, workspaceApi, type RoleName } from "../../entities/workspace/api";
import { Badge, Button, Field, Input, LoadingState, Panel, Select, useToast } from "../../shared/ui";

interface Props {
  /** The signed-in user, so the panel can stop them editing themselves. */
  currentUserId: string | null;
}

export function TeamPanel({ currentUserId }: Props) {
  const toast = useToast();
  const client = useQueryClient();
  const myUserId = currentUserId;
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<RoleName>("member");

  const profile = useQuery({ queryKey: ["workspace"], queryFn: workspaceApi.profile });
  const members = useQuery({ queryKey: ["members"], queryFn: workspaceApi.members });
  const canManage = profile.data?.your_role === "owner" || profile.data?.your_role === "admin";

  const refresh = () => client.invalidateQueries({ queryKey: ["members"] });
  const fail = (err: unknown) => toast.error(err instanceof Error ? err.message : "Request failed");

  const add = useMutation({
    mutationFn: () => workspaceApi.addMember({ email, full_name: fullName, password, role }),
    onSuccess: () => {
      setEmail(""); setFullName(""); setPassword("");
      void refresh();
      toast.success("Member added. They can log in with the password you set.");
    },
    onError: fail,
  });
  const changeRole = useMutation({
    mutationFn: (input: { userId: string; role: RoleName }) => workspaceApi.changeRole(input.userId, input.role),
    onSuccess: () => { void refresh(); toast.success("Role updated"); },
    onError: fail,
  });
  const remove = useMutation({
    mutationFn: (userId: string) => workspaceApi.removeMember(userId),
    onSuccess: () => { void refresh(); toast.success("Member removed"); },
    onError: fail,
  });

  if (profile.isLoading || members.isLoading) return <LoadingState label="Loading team" />;

  return (
    <div className="settings-grid">
      <Panel>
        <Panel.Header title="Add a team member" meta={profile.data ? `${profile.data.organization_name} · ${profile.data.name}` : undefined} />
        <Panel.Body>
          {canManage ? (
            <form className="form-stack" onSubmit={(e) => { e.preventDefault(); add.mutate(); }}>
              <Field label="Email"><Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
              <Field label="Full name"><Input required value={fullName} onChange={(e) => setFullName(e.target.value)} /></Field>
              <Field label="Temporary password (min 8 chars)">
                <Input type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
              </Field>
              <Field label="Role">
                <Select value={role} onChange={(e) => setRole(e.target.value as RoleName)}>
                  {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                </Select>
              </Field>
              <p className="form-hint">owner: everything · admin: manage members and settings · member: build and reply · viewer: read only</p>
              <Button type="submit" variant="primary" icon={<UserPlus size={15} />} loading={add.isPending}>Add member</Button>
            </form>
          ) : (
            <p className="form-hint">Only owners and admins can manage the team. Your role: <strong>{profile.data?.your_role}</strong>.</p>
          )}
        </Panel.Body>
      </Panel>

      <Panel>
        <Panel.Header title={`Members (${members.data?.length ?? 0})`} />
        <Panel.Body flush>
          {(members.data ?? []).map((member) => {
            const isMe = member.user_id === myUserId;
            return (
              <div key={member.user_id} className="credential-row">
                <div>
                  <strong style={{ textTransform: "none" }}>{member.full_name}</strong> {isMe && <Badge tone="brand">you</Badge>}
                  <span className="credential-meta">{member.email} · joined {new Date(member.joined_at).toLocaleDateString()}</span>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  {canManage && !isMe ? (
                    <>
                      <Select value={member.role} onChange={(e) => changeRole.mutate({ userId: member.user_id, role: e.target.value as RoleName })} aria-label={`Role for ${member.email}`}>
                        {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                      </Select>
                      <Button size="sm" variant="ghost" icon={<UserX size={14} />} onClick={() => { if (window.confirm(`Remove ${member.email} from this workspace?`)) remove.mutate(member.user_id); }}>
                        Remove
                      </Button>
                    </>
                  ) : (
                    <Badge>{member.role}</Badge>
                  )}
                </div>
              </div>
            );
          })}
        </Panel.Body>
      </Panel>
    </div>
  );
}
```

Update `frontend/src/pages/settings/SettingsPage.tsx`:

```tsx
import { useState } from "react";

import { useAuthStore } from "../../features/auth/model/auth-store";
import { ProviderCredentialsPanel } from "../../features/provider-credentials/ProviderCredentialsPanel";
import { TeamPanel } from "../../features/team/TeamPanel";
import { Tabs, type TabItem } from "../../shared/ui";
import { DashboardShell } from "../../widgets/navigation/DashboardShell";

export type SettingsTab = "providers" | "team";

const TABS: readonly TabItem<SettingsTab>[] = [
  { id: "providers", label: "AI Providers" },
  { id: "team", label: "Team" },
];

export function SettingsPage() {
  const [tab, setTab] = useState<SettingsTab>("providers");
  const userId = useAuthStore((state) => state.userId);

  return (
    <DashboardShell title="Workspace Settings" subtitle="Keys, people, and activity for this workspace.">
      <div className="settings-tabs">
        <Tabs items={TABS} value={tab} onChange={setTab} label="Settings sections" />
      </div>
      {tab === "providers" && <ProviderCredentialsPanel />}
      {tab === "team" && <TeamPanel currentUserId={userId} />}
    </DashboardShell>
  );
}
```

- [ ] **Step 8: Typecheck, try it, commit**

Run: `npm run typecheck` → clean. In the browser: Settings → Team → add `agent@demo.test` with role `member`; open a private window, log in as that user, confirm the Inbox is visible and Settings → Team shows "Only owners and admins can manage the team".

```powershell
git add backend/app/slices/members backend/app/slices/identity backend/app/slices/tenancy backend/app/slices/audit/actions.py backend/app/main.py backend/pyproject.toml frontend/src/entities/workspace frontend/src/features/team frontend/src/pages/settings/SettingsPage.tsx
git commit -m "feat(members): workspace profile and team management API and UI"
```

---

### Task 7: Audit log viewer

Every mutation is already audited (architecture §3.4). Showing the trail on screen turns an invisible property into a demo moment: "here is the row that proves the agent reply was recorded".

**Files:**
- Modify: `backend/app/slices/audit/repository.py` (add `list_recent`), `backend/app/slices/audit/api.py` (add `AuditEntry`, `list_recent`)
- Create: `backend/app/slices/audit/router.py`, `backend/app/slices/audit/tests/test_audit_viewer.py`
- Modify: `backend/app/main.py`
- Create: `frontend/src/entities/audit/api.ts`, `frontend/src/features/activity/ActivityPanel.tsx`
- Modify: `frontend/src/pages/settings/SettingsPage.tsx`

**Interfaces:**
- Produces: `GET /api/v1/audit-logs?limit=50` (WORKSPACE_MANAGE) → `[{id, action, actor_id, actor_email, target_type, target_id, metadata, created_at}]`, newest first, limit 1–200.
- Produces: `audit_api.list_recent(session, *, workspace_id, limit) -> list[AuditEntry]` where `AuditEntry(id, action, actor_id, target_type, target_id, metadata, created_at)`.

- [ ] **Step 1: Failing tests**

Create `backend/app/slices/audit/tests/test_audit_viewer.py`:

```python
async def _register(client, email: str, org: str) -> dict:
    response = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "Secret123", "full_name": "Owner", "org_name": org},
    )
    assert response.status_code == 201
    return response.json()["data"]


def _headers(bundle: dict) -> dict:
    return {"Authorization": f"Bearer {bundle['access_token']}"}


async def test_owner_sees_newest_first_with_actor_email(client):
    owner = await _register(client, "trail@acme.test", "Acme")
    created = await client.post("/api/v1/chatbots", json={"name": "Bot"}, headers=_headers(owner))
    assert created.status_code == 201

    response = await client.get("/api/v1/audit-logs", headers=_headers(owner))
    assert response.status_code == 200
    rows = response.json()["data"]
    assert rows[0]["action"] == "chatbot.created"
    assert rows[0]["actor_email"] == "trail@acme.test"
    assert rows[-1]["action"] == "auth.register"
    assert "created_at" in rows[0]


async def test_limit_is_honoured_and_bounded(client):
    owner = await _register(client, "limit@acme.test", "Acme")
    for name in ("A", "B", "C"):
        await client.post("/api/v1/chatbots", json={"name": name}, headers=_headers(owner))
    response = await client.get("/api/v1/audit-logs?limit=2", headers=_headers(owner))
    assert len(response.json()["data"]) == 2
    too_many = await client.get("/api/v1/audit-logs?limit=999", headers=_headers(owner))
    assert too_many.status_code == 400


async def test_plain_member_cannot_read_audit_logs(client):
    owner = await _register(client, "own2@acme.test", "Acme")
    added = await client.post(
        "/api/v1/workspace/members",
        json={"email": "m@acme.test", "full_name": "M", "password": "MemberPass1", "role": "member"},
        headers=_headers(owner),
    )
    assert added.status_code == 201
    login = await client.post("/api/v1/auth/login", json={"email": "m@acme.test", "password": "MemberPass1"})
    response = await client.get("/api/v1/audit-logs", headers=_headers(login.json()["data"]))
    assert response.status_code == 403


async def test_audit_logs_are_workspace_scoped(client):
    owner_a = await _register(client, "a2@acme.test", "A")
    owner_b = await _register(client, "b2@acme.test", "B")
    await client.post("/api/v1/chatbots", json={"name": "Only in A"}, headers=_headers(owner_a))
    rows = (await client.get("/api/v1/audit-logs", headers=_headers(owner_b))).json()["data"]
    assert all(row["action"] != "chatbot.created" for row in rows)
```

- [ ] **Step 2: Run to verify failure**

Run: `.venv\Scripts\python.exe -m pytest app/slices/audit/tests/test_audit_viewer.py -v` → 404s.

- [ ] **Step 3: Repository, API, router**

Append to `backend/app/slices/audit/repository.py`:

```python
from sqlalchemy import select


async def list_recent(
    session: AsyncSession, *, workspace_id: uuid.UUID, limit: int
) -> list[AuditLog]:
    statement = (
        select(AuditLog)
        .where(AuditLog.workspace_id == workspace_id)
        .order_by(AuditLog.created_at.desc(), AuditLog.id.desc())
        .limit(limit)
    )
    return list((await session.execute(statement)).scalars().all())
```

Append to `backend/app/slices/audit/api.py` (and add `"AuditEntry", "list_recent"` to `__all__`):

```python
from dataclasses import dataclass
from datetime import datetime


@dataclass(frozen=True)
class AuditEntry:
    id: uuid.UUID
    action: str
    actor_id: uuid.UUID | None
    target_type: str | None
    target_id: str | None
    metadata: dict[str, Any]
    created_at: datetime


async def list_recent(
    session: AsyncSession, *, workspace_id: uuid.UUID, limit: int = 50
) -> list[AuditEntry]:
    rows = await repository.list_recent(session, workspace_id=workspace_id, limit=limit)
    return [
        AuditEntry(
            id=row.id,
            action=row.action,
            actor_id=row.actor_id,
            target_type=row.target_type,
            target_id=row.target_id,
            metadata=dict(row.meta),
            created_at=row.created_at,
        )
        for row in rows
    ]
```

Create `backend/app/slices/audit/router.py`:

```python
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.core.envelope import success
from app.shared import permissions
from app.shared.context import WorkspaceContext
from app.slices.audit import api as audit_api
from app.slices.authz import api as authz_api
from app.slices.identity import api as identity_api

router = APIRouter(prefix="/api/v1/audit-logs", tags=["audit"])

manage_context = authz_api.require_permission(permissions.WORKSPACE_MANAGE)


@router.get("")
async def list_audit_logs(
    limit: int = Query(default=50, ge=1, le=200),
    ctx: WorkspaceContext = Depends(manage_context),
    session: AsyncSession = Depends(get_session),
) -> dict:
    entries = await audit_api.list_recent(session, workspace_id=ctx.workspace_id, limit=limit)
    actors = await identity_api.list_users(
        session, user_ids=[e.actor_id for e in entries if e.actor_id is not None]
    )
    return success(
        [
            {
                "id": str(entry.id),
                "action": entry.action,
                "actor_id": str(entry.actor_id) if entry.actor_id else None,
                "actor_email": actors[entry.actor_id].email if entry.actor_id in actors else None,
                "target_type": entry.target_type,
                "target_id": entry.target_id,
                "metadata": entry.metadata,
                "created_at": entry.created_at.isoformat(),
            }
            for entry in entries
        ]
    )
```

Register in `backend/app/main.py`: `from app.slices.audit.router import router as audit_router` and `app.include_router(audit_router)`.

Import-linter: the existing contract forbids importing `app.slices.audit.repository` from *other* slices; `audit.router` importing `audit.repository` is within the slice and already ignored by `app.slices.audit.* -> app.slices.audit.*`. Run the linter to confirm.

- [ ] **Step 4: Run tests + linter**

Run: `.venv\Scripts\python.exe -m pytest app/slices/audit app/slices/members -v` → PASS. `lint-imports` → 3 kept.

- [ ] **Step 5: Frontend Activity tab**

Create `frontend/src/entities/audit/api.ts`:

```ts
import { apiRequest } from "../../shared/api/client";

export interface AuditEntry {
  id: string;
  action: string;
  actor_id: string | null;
  actor_email: string | null;
  target_type: string | null;
  target_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export const auditApi = {
  recent: (limit = 50) => apiRequest<AuditEntry[]>(`/audit-logs?limit=${limit}`),
};
```

Create `frontend/src/features/activity/ActivityPanel.tsx`:

```tsx
import { useQuery } from "@tanstack/react-query";
import { ScrollText } from "lucide-react";

import { auditApi } from "../../entities/audit/api";
import { EmptyState, LoadingState, Panel } from "../../shared/ui";

export function ActivityPanel() {
  const entries = useQuery({ queryKey: ["audit-logs"], queryFn: () => auditApi.recent(100), refetchInterval: 5000 });

  if (entries.isLoading) return <LoadingState label="Loading activity" />;
  if (entries.isError) {
    return <EmptyState icon={<ScrollText size={28} />} title="Activity is visible to owners and admins" description="Your role does not include workspace management." />;
  }

  return (
    <Panel>
      <Panel.Header title="Recent activity" meta="Every state-changing request is recorded in the same transaction." />
      <Panel.Body flush>
        {entries.data && entries.data.length > 0 ? (
          <table className="simple-table">
            <thead><tr><th>When</th><th>Who</th><th>Action</th><th>Target</th><th>Details</th></tr></thead>
            <tbody>
              {entries.data.map((entry) => (
                <tr key={entry.id}>
                  <td>{new Date(entry.created_at).toLocaleString()}</td>
                  <td>{entry.actor_email ?? "system"}</td>
                  <td><code>{entry.action}</code></td>
                  <td>{entry.target_type ? `${entry.target_type} ${entry.target_id?.slice(0, 8) ?? ""}` : "—"}</td>
                  <td className="audit-meta">{Object.keys(entry.metadata).length ? JSON.stringify(entry.metadata) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <EmptyState icon={<ScrollText size={28} />} title="Nothing recorded yet" />
        )}
      </Panel.Body>
    </Panel>
  );
}
```

Append to `frontend/src/styles.css`: `.audit-meta { font-size: 12px; color: #64748b; max-width: 360px; word-break: break-all; }`

In `frontend/src/pages/settings/SettingsPage.tsx`: import `ActivityPanel` from `../../features/activity/ActivityPanel`, extend the type to `"providers" | "team" | "activity"`, add `{ id: "activity", label: "Activity" }` to `TABS`, and render `{tab === "activity" && <ActivityPanel />}` after the team line (which stays `<TeamPanel currentUserId={userId} />`).

- [ ] **Step 6: Typecheck and commit**

Run: `npm run typecheck` → clean.

```powershell
git add backend/app/slices/audit backend/app/main.py frontend/src/entities/audit frontend/src/features/activity frontend/src/pages/settings/SettingsPage.tsx frontend/src/styles.css
git commit -m "feat(audit): audit log endpoint and activity tab"
```

---

### Task 8: Chat Flows page shows real data; import, delete, publish, and version restore work

Today the page lists two hard-coded flows ("Customer Support & Handoff Flow", "Appointment Booking Flow") with fake dates, "Import Flow" and "Delete" are `alert()`s, and the builder's version-restore button does nothing. A professor clicking any of these sees a stub. This task also moves the `useQuery` call out of the render-prop callback (hooks must not be called inside a callback).

**Files:**
- Modify: `frontend/src/pages/chatflows/ChatFlowsPage.tsx` (rewrite)
- Modify: `frontend/src/pages/builder/BuilderPage.tsx` (wire `onRestore`)

**Interfaces:**
- Consumes: `chatbotApi.{flow, versions, saveFlow, restore, update, remove}` (exist), `readFlowDocument(file)` (exists).

- [ ] **Step 1: Rewrite the Chat Flows page**

Replace the contents of `frontend/src/pages/chatflows/ChatFlowsPage.tsx` with:

```tsx
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, History, Play, Search, Trash2, Upload, UserCheck } from "lucide-react";
import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { chatbotApi } from "../../entities/chatbot/api";
import type { Chatbot } from "../../entities/chatbot/types";
import { downloadFlowDocument, readFlowDocument } from "../../features/flow-editor/lib/flow-document";
import { WidgetEmbedDialog } from "../../features/widget-embed/WidgetEmbedDialog";
import { useToast } from "../../shared/ui";
import { AmbotShell } from "../../widgets/navigation/AmbotShell";

const fmt = (iso: string) =>
  new Date(iso).toLocaleString([], { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });

interface InnerProps {
  selectedChatbot: Chatbot | null;
  chatbots: Chatbot[];
  refetchChatbots: () => void;
}

function ChatFlowsInner({ selectedChatbot, chatbots, refetchChatbots }: InnerProps) {
  const navigate = useNavigate();
  const toast = useToast();
  const client = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [embedBot, setEmbedBot] = useState<Chatbot | null>(null);

  const flowQuery = useQuery({
    queryKey: ["flow", selectedChatbot?.id],
    queryFn: () => chatbotApi.flow(selectedChatbot!.id),
    enabled: Boolean(selectedChatbot?.id),
  });
  const versionsQuery = useQuery({
    queryKey: ["versions", selectedChatbot?.id],
    queryFn: () => chatbotApi.versions(selectedChatbot!.id),
    enabled: Boolean(selectedChatbot?.id),
  });

  const invalidate = async () => {
    await client.invalidateQueries({ queryKey: ["flow", selectedChatbot?.id] });
    await client.invalidateQueries({ queryKey: ["versions", selectedChatbot?.id] });
    refetchChatbots();
  };
  const fail = (err: unknown) => toast.error(err instanceof Error ? err.message : "Request failed");

  const importFlow = useMutation({
    mutationFn: async (file: File) => chatbotApi.saveFlow(selectedChatbot!.id, await readFlowDocument(file)),
    onSuccess: async (flow) => { await invalidate(); toast.success(`Imported as version ${flow.version}`); },
    onError: fail,
  });
  const togglePublish = useMutation({
    mutationFn: (bot: Chatbot) =>
      chatbotApi.update(bot.id, { status: bot.status === "published" ? "draft" : "published" }),
    onSuccess: async (bot) => { await invalidate(); toast.success(bot.status === "published" ? "Published — the widget is live" : "Unpublished"); },
    onError: fail,
  });
  const removeBot = useMutation({
    mutationFn: (id: string) => chatbotApi.remove(id),
    onSuccess: async () => { refetchChatbots(); toast.success("Chatbot deleted"); navigate("/chatbots"); },
    onError: fail,
  });

  const rows = chatbots.filter((b) => b.name.toLowerCase().includes(searchQuery.toLowerCase()));
  const flow = flowQuery.data;

  return (
    <div className="chatflows-page-container">
      <header className="chatflows-header">
        <div className="chatflows-title-col">
          <h1>Website Chatflow</h1>
          <p>Each chatbot has one live flow with a full version history. Publish to make the widget answer visitors.</p>
        </div>
      </header>

      <div className="chatflows-toolbar">
        <div className="chatflows-search-box">
          <Search size={16} className="search-icon" />
          <input type="text" placeholder="Search chatbot by name" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
        </div>
        <div className="chatflows-actions">
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            style={{ display: "none" }}
            onChange={(e) => { const f = e.target.files?.[0]; if (f && selectedChatbot) importFlow.mutate(f); e.target.value = ""; }}
          />
          <button type="button" className="btn-import-flow" disabled={!selectedChatbot || importFlow.isPending} onClick={() => fileInput.current?.click()}>
            <Upload size={15} /><span>Import Flow (JSON)</span>
          </button>
          <button type="button" className="btn-import-flow" disabled={!flow} onClick={() => flow && downloadFlowDocument(flow.definition, selectedChatbot?.name ?? "flow")}>
            <Download size={15} /><span>Export Flow</span>
          </button>
          <button type="button" className="btn-create-flow" onClick={() => selectedChatbot && navigate(`/builder/${selectedChatbot.id}`)}>
            Open Builder
          </button>
        </div>
      </div>

      <div className="chatflows-table-card">
        <table className="chatflows-table">
          <thead>
            <tr>
              <th>Chatbot</th><th># of nodes</th><th>Created on</th><th>Last modified</th><th>Published</th><th>Versions</th><th className="th-actions">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((bot) => {
              const isSelected = bot.id === selectedChatbot?.id;
              return (
                <tr key={bot.id} className={isSelected ? "is-selected" : ""}>
                  <td className="td-flow-name">
                    <button type="button" className="flow-name-btn" onClick={() => navigate(`/builder/${bot.id}`)}>{bot.name}</button>
                  </td>
                  <td className="td-msg-count">{isSelected && flow ? flow.definition.nodes.length : "—"}</td>
                  <td>{fmt(bot.created_at)}</td>
                  <td>{fmt(bot.updated_at)}</td>
                  <td>
                    <label className="switch-toggle" title={bot.status === "published" ? "Unpublish" : "Publish"}>
                      <input type="checkbox" checked={bot.status === "published"} onChange={() => togglePublish.mutate(bot)} />
                      <span className="slider round" />
                    </label>
                  </td>
                  <td>{isSelected ? <span className="version-pill"><History size={13} /> v{bot.current_version ?? 0} · {versionsQuery.data?.length ?? 0} saved</span> : `v${bot.current_version ?? 0}`}</td>
                  <td className="td-actions-cell">
                    <button type="button" className="action-icon-btn is-test" title="Test in simulator" onClick={() => setEmbedBot(bot)}><UserCheck size={16} /></button>
                    <button type="button" className="action-icon-btn" title="Open builder" onClick={() => navigate(`/builder/${bot.id}`)}><Play size={16} /></button>
                    <button
                      type="button"
                      className="action-icon-btn is-delete"
                      title="Delete chatbot"
                      onClick={() => { if (window.confirm(`Delete "${bot.name}" and all its flow versions?`)) removeBot.mutate(bot.id); }}
                    ><Trash2 size={16} /></button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && <div className="table-empty-notice">No chatbots matching "{searchQuery}"</div>}
      </div>

      <WidgetEmbedDialog open={Boolean(embedBot)} chatbot={embedBot} onClose={() => setEmbedBot(null)} />
    </div>
  );
}

export function ChatFlowsPage() {
  return <AmbotShell>{(props) => <ChatFlowsInner {...props} />}</AmbotShell>;
}
```

Append to `frontend/src/styles.css`: `.version-pill { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; color: #475569; background: #f1f5f9; border-radius: 999px; padding: 3px 10px; } .chatflows-table tr.is-selected td { background: #f0fdf7; }`

- [ ] **Step 2: Wire version restore in the builder**

In `frontend/src/pages/builder/BuilderPage.tsx`, after `saveMutation`, add:

```tsx
  const restoreMutation = useMutation({
    mutationFn: (version: number) => chatbotApi.restore(selectedId!, version),
    onSuccess: async (flow) => {
      graph.load(flow.definition);
      graph.markSaved();
      await queryClient.invalidateQueries({ queryKey: ["flow", selectedId] });
      await queryClient.invalidateQueries({ queryKey: ["versions", selectedId] });
      toast.success(`Restored as version ${flow.version}`);
    },
    onError: notifyError,
  });
```

and replace `onRestore={(version) => {}}` / `restoring={false}` with `onRestore={(version) => restoreMutation.mutate(version)}` / `restoring={restoreMutation.isPending}`.

- [ ] **Step 3: Typecheck and try every button**

Run: `npm run typecheck` → clean. In the browser: export a flow, import it back (version increments), toggle Publish (status badge changes in the sub-nav select), restore an older version from the builder's History tab, delete a throw-away bot.

- [ ] **Step 4: Commit**

```powershell
git add frontend/src/pages/chatflows/ChatFlowsPage.tsx frontend/src/pages/builder/BuilderPage.tsx frontend/src/styles.css
git commit -m "feat(frontend): real chat flow list with import, export, publish, delete and version restore"
```

---

### Task 9: Flow templates

"Chat Flow Templates" is an `alert()`. A template picker that loads a complete, working flow in one click is the fastest way to show all 13 node types in a demo, and the seed script (Task 11) reuses the same three flows.

**Files:**
- Create: `frontend/src/features/flow-templates/templates.ts`, `frontend/src/features/flow-templates/TemplatesDialog.tsx`
- Modify: `frontend/src/widgets/navigation/ChatbotSubNav.tsx` (Templates button → callback), `frontend/src/widgets/navigation/AmbotShell.tsx`, `frontend/src/pages/builder/BuilderPage.tsx`

**Interfaces:**
- Produces: `FLOW_TEMPLATES: FlowTemplate[]` with `{ id, name, description, nodeTypes: string[], build(): FlowDocument }`; `TemplatesDialog({open, chatbot, onClose})` which saves the chosen template as a new flow version and navigates to `/builder/:id`.
- `ChatbotSubNav` gains an optional prop `onOpenTemplates?: () => void`.

- [ ] **Step 1: Templates**

Create `frontend/src/features/flow-templates/templates.ts`:

```ts
import type { FlowDocument, FlowNode } from "../../entities/chatbot/types";

export interface FlowTemplate {
  id: string;
  name: string;
  description: string;
  nodeTypes: string[];
  build: () => FlowDocument;
}

type N = FlowNode["type"];
const node = (id: string, type: N, y: number, data: Record<string, unknown>, x = 250): FlowNode =>
  ({ id, type, position: { x, y }, data }) as FlowNode;
const edge = (source: string, target: string, label?: string) =>
  ({ id: `${source}-${target}${label ? `-${label}` : ""}`, source, target, ...(label ? { label } : {}) });

export const FLOW_TEMPLATES: FlowTemplate[] = [
  {
    id: "lead-capture",
    name: "Lead capture",
    description: "Greets the visitor, collects name and a validated email, branches on interest, and closes politely.",
    nodeTypes: ["message", "question", "input", "choice", "condition", "webhook", "end"],
    build: () => ({
      nodes: [
        node("start", "start", 0, { label: "Start" }),
        node("welcome", "message", 110, { label: "Welcome", message: "Hi! 👋 I can help you get in touch with our team." }),
        node("name", "question", 220, { label: "Ask name", prompt: "What's your name?", variable: "name" }),
        node("email", "input", 330, { label: "Ask email", prompt: "Thanks {{name}}! What's your email address?", variable: "email", inputType: "email" }),
        node("interest", "choice", 440, { label: "Interest", prompt: "What are you interested in?", options: "Pricing\nA demo\nSupport" }),
        node("is-demo", "condition", 550, { label: "Wants a demo?", variable: "interest", operator: "equals", value: "A demo" }),
        node("demo-msg", "message", 660, { label: "Demo", message: "Great, {{name}} — someone will email {{email}} to book a demo within one business day." }, 80),
        node("other-msg", "message", 660, { label: "Other", message: "Got it. We'll send details about {{interest}} to {{email}}." }, 420),
        node("notify", "webhook", 770, { label: "Notify CRM", url: "https://example.com/hooks/lead", event: "lead.captured" }),
        node("end", "end", 880, { label: "End", message: "Thanks for stopping by!" }),
      ],
      edges: [
        edge("start", "welcome"), edge("welcome", "name"), edge("name", "email"), edge("email", "interest"),
        edge("interest", "is-demo"), edge("is-demo", "demo-msg", "true"), edge("is-demo", "other-msg", "false"),
        edge("demo-msg", "notify"), edge("other-msg", "notify"), edge("notify", "end"),
      ],
      viewport: { x: 0, y: 0, zoom: 0.9 },
    }),
  },
  {
    id: "faq-knowledge",
    name: "FAQ with knowledge base",
    description: "Answers questions from an uploaded knowledge base; optionally lets an AI model phrase the answer.",
    nodeTypes: ["message", "question", "knowledge_search", "llm", "message", "end"],
    build: () => ({
      nodes: [
        node("start", "start", 0, { label: "Start" }),
        node("welcome", "message", 110, { label: "Welcome", message: "Ask me anything about our products, shipping or returns." }),
        node("ask", "question", 220, { label: "Ask", prompt: "What would you like to know?", variable: "question" }),
        node("search", "knowledge_search", 330, { label: "Search docs", knowledgeBaseId: "", query: "{{question}}", topK: 3, variable: "knowledge" }),
        node("answer", "message", 440, { label: "Answer", message: "Here is what I found:\n\n{{knowledge}}" }),
        node("ai", "llm", 550, { label: "AI summary (optional)", prompt: "Using only these notes, answer the visitor's question in two sentences:\n{{knowledge}}", provider: "ollama", model: "", temperature: 0.3 }),
        node("end", "end", 660, { label: "End", message: "Hope that helps! Reload to ask another question." }),
      ],
      edges: [edge("start", "welcome"), edge("welcome", "ask"), edge("ask", "search"), edge("search", "answer"), edge("answer", "ai"), edge("ai", "end")],
      viewport: { x: 0, y: 0, zoom: 0.9 },
    }),
  },
  {
    id: "support-handoff",
    name: "Support with live-agent handoff",
    description: "Triages the issue, tries a quick fix, and hands the visitor to a human in the Inbox.",
    nodeTypes: ["message", "choice", "condition", "http_request", "delay", "handoff", "end"],
    build: () => ({
      nodes: [
        node("start", "start", 0, { label: "Start" }),
        node("welcome", "message", 110, { label: "Welcome", message: "Welcome to support. Let's sort this out." }),
        node("issue", "choice", 220, { label: "Issue type", prompt: "What do you need help with?", options: "Billing\nTechnical problem\nSomething else" }),
        node("is-tech", "condition", 330, { label: "Technical?", variable: "issue", operator: "equals", value: "Technical problem" }),
        node("status", "http_request", 440, { label: "Check status page", url: "https://httpbin.org/get?service=api", method: "GET", variable: "status" }, 80),
        node("wait", "delay", 550, { label: "Thinking…", seconds: 1 }, 80),
        node("tip", "message", 660, { label: "Quick tip", message: "Our systems look healthy. Try signing out and back in — if that doesn't help, an agent will take over now." }, 80),
        node("handoff", "handoff", 770, { label: "Handoff", queue: "Support", message: "Connecting you to a human agent. Please hold on…" }),
        node("end", "end", 880, { label: "End", message: "Thanks for contacting support." }),
      ],
      edges: [
        edge("start", "welcome"), edge("welcome", "issue"), edge("issue", "is-tech"),
        edge("is-tech", "status", "true"), edge("is-tech", "handoff", "false"),
        edge("status", "wait"), edge("wait", "tip"), edge("tip", "handoff"), edge("handoff", "end"),
      ],
      viewport: { x: 0, y: 0, zoom: 0.9 },
    }),
  },
];
```

- [ ] **Step 2: Dialog**

Create `frontend/src/features/flow-templates/TemplatesDialog.tsx`:

```tsx
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Layers } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { chatbotApi } from "../../entities/chatbot/api";
import type { Chatbot } from "../../entities/chatbot/types";
import { Button, Dialog, useToast } from "../../shared/ui";
import { FLOW_TEMPLATES, type FlowTemplate } from "./templates";

interface Props { open: boolean; chatbot: Chatbot | null; onClose: () => void; }

export function TemplatesDialog({ open, chatbot, onClose }: Props) {
  const navigate = useNavigate();
  const toast = useToast();
  const client = useQueryClient();

  const apply = useMutation({
    mutationFn: (template: FlowTemplate) => chatbotApi.saveFlow(chatbot!.id, template.build()),
    onSuccess: async (flow) => {
      await client.invalidateQueries({ queryKey: ["flow", chatbot?.id] });
      await client.invalidateQueries({ queryKey: ["versions", chatbot?.id] });
      toast.success(`Template applied as version ${flow.version}`);
      onClose();
      navigate(`/builder/${chatbot!.id}`);
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : "Could not apply template"),
  });

  return (
    <Dialog open={open} onClose={onClose} title="Chat flow templates" icon={<Layers size={18} />}>
      <p className="form-hint">Applying a template saves a new flow version for <strong>{chatbot?.name ?? "the selected chatbot"}</strong>. Earlier versions stay in History.</p>
      <div className="template-list">
        {FLOW_TEMPLATES.map((template) => (
          <div key={template.id} className="template-card">
            <div>
              <strong>{template.name}</strong>
              <p>{template.description}</p>
              <div className="template-nodes">{template.nodeTypes.map((t) => <span key={t}>{t.replaceAll("_", " ")}</span>)}</div>
            </div>
            <Button size="sm" variant="primary" disabled={!chatbot || apply.isPending} loading={apply.isPending && apply.variables?.id === template.id} onClick={() => apply.mutate(template)}>
              Use template
            </Button>
          </div>
        ))}
      </div>
    </Dialog>
  );
}
```

Append to `frontend/src/styles.css`:

```css
.template-list { display: flex; flex-direction: column; gap: 12px; margin-top: 12px; }
.template-card { display: flex; justify-content: space-between; gap: 16px; align-items: center; border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px 16px; }
.template-card p { margin: 4px 0 8px; color: #64748b; font-size: 13px; }
.template-nodes { display: flex; flex-wrap: wrap; gap: 6px; }
.template-nodes span { font-size: 11px; background: #f1f5f9; border-radius: 999px; padding: 2px 8px; color: #475569; }
```

- [ ] **Step 3: Wire the sub-nav button**

In `frontend/src/widgets/navigation/ChatbotSubNav.tsx`:
- add `onOpenTemplates?: () => void;` to `Props` and destructure it;
- replace the "Chat Flow Templates" `<button ... onClick={() => alert("Chat Flow Templates")}>` with `<button type="button" className="sub-menu-item" onClick={onOpenTemplates}>` (same children);
- delete the "Third Party Integration" button entirely (webhook and HTTP nodes are the integrations; there is nothing behind that button).

In `frontend/src/widgets/navigation/AmbotShell.tsx`: add `const [templatesOpen, setTemplatesOpen] = useState(false);`, pass `onOpenTemplates={() => setTemplatesOpen(true)}` to `<ChatbotSubNav>`, import `TemplatesDialog` from `../../features/flow-templates/TemplatesDialog`, and render `<TemplatesDialog open={templatesOpen} chatbot={selectedChatbot} onClose={() => setTemplatesOpen(false)} />` next to the create dialog.

In `frontend/src/pages/builder/BuilderPage.tsx`: same three additions (state, prop on `<ChatbotSubNav>`, dialog rendered next to `<WidgetEmbedDialog>`).

- [ ] **Step 4: Typecheck, try all three templates, commit**

Run: `npm run typecheck` → clean. Apply each template to a test bot, open the visual builder, confirm the nodes and labelled edges render, then Test Bot from the toolbar and walk the "Lead capture" flow to the end.

```powershell
git add frontend/src/features/flow-templates frontend/src/widgets/navigation frontend/src/pages/builder/BuilderPage.tsx frontend/src/styles.css
git commit -m "feat(frontend): one-click chat flow templates"
```

---

### Task 10: Navigation clean-up and one consistent shell

Remaining stubs: "Partner" and "More" alerts in the icon nav, a "Subscriptions" item that actually opens Knowledge, and two pages (Knowledge, Inbox) rendered under a different header (`AppHeader`) than everything else. After this task every navigation item goes somewhere real and every page has the same left icon rail.

**Files:**
- Modify: `frontend/src/widgets/navigation/PrimaryNav.tsx`
- Modify: `frontend/src/pages/knowledge/KnowledgePage.tsx`, `frontend/src/pages/conversations/ConversationsPage.tsx`
- Delete: `frontend/src/widgets/app-header/AppHeader.tsx`
- Modify: `frontend/src/styles.css`

- [ ] **Step 1: Rewrite the icon nav's menu**

In `frontend/src/widgets/navigation/PrimaryNav.tsx`, replace everything inside `<nav className="primary-nav-menu">…</nav>` with:

```tsx
          <Link to="/chatbots" className={`primary-nav-btn ${isChatbotActive ? "is-active" : ""}`} title="Chatbots">
            <Bot size={20} /><span>Chatbot</span>
          </Link>
          <Link to="/conversations" className={`primary-nav-btn ${path.startsWith("/conversations") ? "is-active" : ""}`} title="Inbox">
            <MessageSquare size={20} /><span>Inbox</span>
          </Link>
          <Link to="/knowledge" className={`primary-nav-btn ${path.startsWith("/knowledge") ? "is-active" : ""}`} title="Knowledge base">
            <BookOpen size={20} /><span>Knowledge</span>
          </Link>
          <Link to="/analytics" className={`primary-nav-btn ${path.startsWith("/analytics") ? "is-active" : ""}`} title="Analytics">
            <BarChart3 size={20} /><span>Analytics</span>
          </Link>
          <Link to="/settings" className={`primary-nav-btn ${path.startsWith("/settings") ? "is-active" : ""}`} title="Settings">
            <Settings size={20} /><span>Settings</span>
          </Link>
```

Update the lucide import to `import { BarChart3, BookOpen, Bot, LogOut, MessageSquare, Settings } from "lucide-react";` (removing `CreditCard`, `Home`, `MoreHorizontal`, `Users`). Change `isChatbotActive` to `path.startsWith("/chatbots") || path.startsWith("/builder")`.

- [ ] **Step 2: Move Knowledge and Inbox onto DashboardShell**

`frontend/src/pages/knowledge/KnowledgePage.tsx`: replace the `AppHeader` import with `import { DashboardShell } from "../../widgets/navigation/DashboardShell";`. Replace the outer markup

```tsx
    <div className="knowledge-shell">
      <AppHeader />
      <main className="knowledge-main">
        <div className="knowledge-content-wrapper">
          <header className="knowledge-header">
            <h1>Knowledge Bases</h1>
            <p>Upload documents (PDF, DOCX, TXT, MD) to power RAG retrieval in your chatbot flows.</p>
          </header>
          <div className="knowledge-grid">
            …
          </div>
        </div>
      </main>
    </div>
```

with

```tsx
    <DashboardShell title="Knowledge Bases" subtitle="Upload documents (PDF, DOCX, TXT, MD, HTML). They are chunked and embedded in the background and searched by the Knowledge node.">
      <div className="knowledge-grid">
        …
      </div>
    </DashboardShell>
```

(the `…` is the existing grid content, unchanged).

`frontend/src/pages/conversations/ConversationsPage.tsx`: same import swap, and replace

```tsx
    <div className="conversations-shell">
      <AppHeader />
      <div className="conversations-main-grid">
        …
      </div>
    </div>
```

with

```tsx
    <DashboardShell title="Inbox" subtitle="Live conversations from every published chatbot. Reply here when a flow hands off to an agent.">
      <div className="conversations-main-grid">
        …
      </div>
    </DashboardShell>
```

Delete `frontend/src/widgets/app-header/AppHeader.tsx`. Run `npm run typecheck`; if any other file imported it, it will fail to compile there — swap that usage the same way.

In `frontend/src/styles.css`, find `.conversations-main-grid` and make sure it has an explicit height that works inside the new shell, e.g. add/replace with `height: calc(100vh - 140px); min-height: 480px;`. Check the inbox in the browser; the transcript column must still scroll internally.

- [ ] **Step 3: Typecheck, click through every nav item, commit**

Run: `npm run typecheck` → clean. Every icon in the rail must land on a page; no `alert()` remains: `grep -rn "alert(" frontend/src` returns only the one in `WidgetEmbedDialog.tsx` (an error path). Replace that one too with `toast.error(...)` via `useToast()` while you are there.

```powershell
git add frontend/src/widgets frontend/src/pages/knowledge/KnowledgePage.tsx frontend/src/pages/conversations/ConversationsPage.tsx frontend/src/features/widget-embed/WidgetEmbedDialog.tsx frontend/src/styles.css
git rm frontend/src/widgets/app-header/AppHeader.tsx
git commit -m "refactor(frontend): single dashboard shell and real links for every nav item"
```

---

## Part C — Make it demonstrable in ten minutes

### Task 11: Demo customer page and seed script

Two things make a live demo reliable: a "customer website" page that already embeds the widget, and one command that fills a fresh database with a demo workspace, keys, a knowledge base, three published bots, and a few conversations.

**Files:**
- Create: `backend/app/static/demo.html`; modify `backend/app/main.py` (serve `/demo`)
- Create: `backend/scripts/demo_flows.py`, `backend/scripts/seed_demo.py`
- Create: `backend/scripts/__init__.py` (empty)
- Test: `backend/tests/test_demo_page.py`

**Interfaces:**
- Produces: `GET /demo?chatbot_id=<uuid>` → HTML page that loads `/widget.js` for that bot; without the query parameter it lists nothing and explains the parameter.
- Produces: `python -m scripts.seed_demo` (idempotent: re-running logs in instead of registering, and creates a fresh set of bots with a timestamp suffix only if `--fresh` is passed).

- [ ] **Step 1: Failing test for the demo route**

Create `backend/tests/test_demo_page.py`:

```python
async def test_demo_page_embeds_widget_for_requested_bot(client):
    response = await client.get("/demo?chatbot_id=11111111-1111-1111-1111-111111111111")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/html")
    body = response.text
    assert "/widget.js" in body
    assert 'data-chatbot-id="11111111-1111-1111-1111-111111111111"' in body


async def test_demo_page_without_bot_explains_itself(client):
    response = await client.get("/demo")
    assert response.status_code == 200
    assert "chatbot_id" in response.text


async def test_demo_page_escapes_injection(client):
    response = await client.get('/demo?chatbot_id=<script>alert(1)</script>')
    assert "<script>alert(1)</script>" not in response.text
```

Run: `.venv\Scripts\python.exe -m pytest tests/test_demo_page.py -v` → 404.

- [ ] **Step 2: The page and the route**

Create `backend/app/static/demo.html` (the `__CHATBOT_ID__`, `__API__`, and `__ROOT__` tokens are substituted by the route):

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Northwind Outdoor — Demo Store</title>
<style>
  body { margin: 0; font-family: Georgia, "Times New Roman", serif; color: #1f2937; background: #fdfcf9; }
  header { background: #14532d; color: #fff; padding: 20px 48px; display: flex; justify-content: space-between; align-items: center; }
  header nav a { color: #d1fae5; margin-left: 20px; text-decoration: none; font-family: system-ui, sans-serif; font-size: 14px; }
  main { max-width: 960px; margin: 0 auto; padding: 56px 24px; }
  h1 { font-size: 40px; margin: 0 0 12px; }
  .lede { font-size: 18px; color: #4b5563; max-width: 620px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 20px; margin-top: 40px; }
  .card { border: 1px solid #e5e7eb; border-radius: 12px; padding: 20px; background: #fff; }
  .card h3 { margin: 0 0 6px; font-size: 18px; }
  .card p { margin: 0; color: #6b7280; font-family: system-ui, sans-serif; font-size: 14px; }
  .note { margin-top: 48px; padding: 16px 20px; background: #ecfdf5; border-left: 4px solid #16c784; font-family: system-ui, sans-serif; font-size: 14px; }
  code { background: #f3f4f6; padding: 2px 6px; border-radius: 4px; }
</style>
</head>
<body>
<header>
  <strong>Northwind Outdoor</strong>
  <nav><a href="#">Tents</a><a href="#">Backpacks</a><a href="#">Returns</a><a href="#">Contact</a></nav>
</header>
<main>
  <h1>Gear for the long way round.</h1>
  <p class="lede">This is a stand-in for a customer's website. The only thing added to it is the one-line script tag at the bottom of the page. Click the chat bubble in the corner.</p>
  <div class="grid">
    <div class="card"><h3>Trail tent 2P</h3><p>1.9 kg, 3-season, free shipping.</p></div>
    <div class="card"><h3>Ridge pack 45L</h3><p>Lifetime warranty on zips and straps.</p></div>
    <div class="card"><h3>Down quilt</h3><p>Ships in 2–3 business days.</p></div>
  </div>
  <div class="note" id="note">
    Widget installed for chatbot <code>__CHATBOT_ID__</code>. Open this page as <code>/demo?chatbot_id=&lt;id&gt;</code> to switch bots.
  </div>
</main>
<script src="__ROOT__/widget.js" data-chatbot-id="__CHATBOT_ID__" data-api="__API__" async></script>
</body>
</html>
```

In `backend/app/main.py`, add these imports: `import html` and `from fastapi import Request` and `from fastapi.responses import HTMLResponse`. Add `_DEMO_HTML = Path(__file__).resolve().parent / "static" / "demo.html"` next to `_WIDGET_JS`, and inside `create_app()` after the `widget_js` route:

```python
    @app.get("/demo", include_in_schema=False)
    async def demo_page(request: Request, chatbot_id: str = "") -> HTMLResponse:
        """A fake customer site with the widget installed, for live demos."""
        root = str(request.base_url).rstrip("/")
        page = (
            _DEMO_HTML.read_text(encoding="utf-8")
            .replace("__CHATBOT_ID__", html.escape(chatbot_id) or "(missing — add ?chatbot_id=…)")
            .replace("__ROOT__", root)
            .replace("__API__", f"{root}/api/v1")
        )
        return HTMLResponse(page)
```

Run: `.venv\Scripts\python.exe -m pytest tests/test_demo_page.py -v` → PASS.

- [ ] **Step 3: Demo flows shared with the seed script**

Create `backend/scripts/__init__.py` (empty) and `backend/scripts/demo_flows.py`. It must produce the same three flows as `frontend/src/features/flow-templates/templates.ts` so the demo bots match the templates the professor can also apply by hand:

```python
"""The three demo flows, mirrored from frontend/src/features/flow-templates/templates.ts.
Keep both in sync when changing either."""


def _node(id_, type_, y, data, x=250):
    return {"id": id_, "type": type_, "position": {"x": x, "y": y}, "data": data}


def _edge(source, target, label=None):
    edge = {"id": f"{source}-{target}" + (f"-{label}" if label else ""), "source": source, "target": target}
    if label:
        edge["label"] = label
    return edge


def lead_capture() -> dict:
    return {
        "nodes": [
            _node("start", "start", 0, {"label": "Start"}),
            _node("welcome", "message", 110, {"label": "Welcome", "message": "Hi! 👋 I can help you get in touch with our team."}),
            _node("name", "question", 220, {"label": "Ask name", "prompt": "What's your name?", "variable": "name"}),
            _node("email", "input", 330, {"label": "Ask email", "prompt": "Thanks {{name}}! What's your email address?", "variable": "email", "inputType": "email"}),
            _node("interest", "choice", 440, {"label": "Interest", "prompt": "What are you interested in?", "options": "Pricing\nA demo\nSupport"}),
            _node("is-demo", "condition", 550, {"label": "Wants a demo?", "variable": "interest", "operator": "equals", "value": "A demo"}),
            _node("demo-msg", "message", 660, {"label": "Demo", "message": "Great, {{name}} — someone will email {{email}} to book a demo within one business day."}, 80),
            _node("other-msg", "message", 660, {"label": "Other", "message": "Got it. We'll send details about {{interest}} to {{email}}."}, 420),
            _node("notify", "webhook", 770, {"label": "Notify CRM", "url": "https://example.com/hooks/lead", "event": "lead.captured"}),
            _node("end", "end", 880, {"label": "End", "message": "Thanks for stopping by!"}),
        ],
        "edges": [
            _edge("start", "welcome"), _edge("welcome", "name"), _edge("name", "email"), _edge("email", "interest"),
            _edge("interest", "is-demo"), _edge("is-demo", "demo-msg", "true"), _edge("is-demo", "other-msg", "false"),
            _edge("demo-msg", "notify"), _edge("other-msg", "notify"), _edge("notify", "end"),
        ],
        "viewport": {"x": 0, "y": 0, "zoom": 0.9},
    }


def faq_knowledge(knowledge_base_id: str) -> dict:
    return {
        "nodes": [
            _node("start", "start", 0, {"label": "Start"}),
            _node("welcome", "message", 110, {"label": "Welcome", "message": "Ask me anything about our products, shipping or returns."}),
            _node("ask", "question", 220, {"label": "Ask", "prompt": "What would you like to know?", "variable": "question"}),
            _node("search", "knowledge_search", 330, {"label": "Search docs", "knowledgeBaseId": knowledge_base_id, "query": "{{question}}", "topK": 3, "variable": "knowledge"}),
            _node("answer", "message", 440, {"label": "Answer", "message": "Here is what I found:\n\n{{knowledge}}"}),
            _node("end", "end", 550, {"label": "End", "message": "Hope that helps! Reload to ask another question."}),
        ],
        "edges": [_edge("start", "welcome"), _edge("welcome", "ask"), _edge("ask", "search"), _edge("search", "answer"), _edge("answer", "end")],
        "viewport": {"x": 0, "y": 0, "zoom": 0.9},
        "design": {"themeColor": "#3182ce", "botTitle": "Northwind Help", "botStatusText": "Answers from our docs", "windowSize": "L"},
    }


def support_handoff() -> dict:
    return {
        "nodes": [
            _node("start", "start", 0, {"label": "Start"}),
            _node("welcome", "message", 110, {"label": "Welcome", "message": "Welcome to support. Let's sort this out."}),
            _node("issue", "choice", 220, {"label": "Issue type", "prompt": "What do you need help with?", "options": "Billing\nTechnical problem\nSomething else"}),
            _node("is-tech", "condition", 330, {"label": "Technical?", "variable": "issue", "operator": "equals", "value": "Technical problem"}),
            _node("status", "http_request", 440, {"label": "Check status page", "url": "https://httpbin.org/get?service=api", "method": "GET", "variable": "status"}, 80),
            _node("wait", "delay", 550, {"label": "Thinking…", "seconds": 1}, 80),
            _node("tip", "message", 660, {"label": "Quick tip", "message": "Our systems look healthy. Try signing out and back in — if that doesn't help, an agent will take over now."}, 80),
            _node("handoff", "handoff", 770, {"label": "Handoff", "queue": "Support", "message": "Connecting you to a human agent. Please hold on…"}),
            _node("end", "end", 880, {"label": "End", "message": "Thanks for contacting support."}),
        ],
        "edges": [
            _edge("start", "welcome"), _edge("welcome", "issue"), _edge("issue", "is-tech"),
            _edge("is-tech", "status", "true"), _edge("is-tech", "handoff", "false"),
            _edge("status", "wait"), _edge("wait", "tip"), _edge("tip", "handoff"), _edge("handoff", "end"),
        ],
        "viewport": {"x": 0, "y": 0, "zoom": 0.9},
        "design": {"themeColor": "#ff8a00", "botTitle": "Northwind Support", "botStatusText": "Usually replies in minutes", "positionWeb": "left"},
    }


DEMO_DOCUMENT = """Northwind Outdoor — Customer FAQ

Shipping: Orders ship within 2 to 3 business days. Free shipping on orders over 75 dollars. International shipping is available to Canada and the EU.

Returns and refunds: You can return any unused item within 30 days for a full refund. Refunds are issued to the original payment method within 5 business days of receiving the return.

Warranty: Backpacks carry a lifetime warranty on zips and straps. Tents carry a 2 year warranty against manufacturing defects.

Tent care: Never store a tent wet. Air dry it fully, then store loosely in the mesh bag, not the compression sack.

Contact: Email help@northwind.example or use the chat on our website. Support hours are 9am to 6pm, Monday to Friday.
"""
```

- [ ] **Step 4: The seed script (talks to the running API over HTTP)**

Create `backend/scripts/seed_demo.py`:

```python
"""Populate a running backend with a complete demo workspace.

Usage (backend must be running, worker too for document ingestion):
    .venv\\Scripts\\python.exe -m scripts.seed_demo
    .venv\\Scripts\\python.exe -m scripts.seed_demo --api http://127.0.0.1:8000/api/v1

Demo login afterwards:  demo@northwind.example / DemoPass123
"""

import argparse
import sys
import time

import httpx

from scripts.demo_flows import DEMO_DOCUMENT, faq_knowledge, lead_capture, support_handoff

EMAIL = "demo@northwind.example"
PASSWORD = "DemoPass123"
AGENT_EMAIL = "agent@northwind.example"
AGENT_PASSWORD = "AgentPass123"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--api", default="http://127.0.0.1:8000/api/v1")
    args = parser.parse_args()
    api = args.api.rstrip("/")
    client = httpx.Client(base_url=api, timeout=30)

    # 1. Account: register, or log in if the demo user already exists.
    reg = client.post("/auth/register", json={"email": EMAIL, "password": PASSWORD, "full_name": "Demo Owner", "org_name": "Northwind Outdoor"})
    if reg.status_code == 201:
        tokens = reg.json()["data"]
        print("registered", EMAIL)
    else:
        login = client.post("/auth/login", json={"email": EMAIL, "password": PASSWORD})
        login.raise_for_status()
        tokens = login.json()["data"]
        print("logged in as", EMAIL)
    headers = {"Authorization": f"Bearer {tokens['access_token']}"}

    def post(path, **kwargs):
        response = client.post(path, headers=headers, **kwargs)
        if response.status_code >= 400:
            print("FAILED", path, response.status_code, response.text)
            sys.exit(1)
        return response.json()["data"]

    # 2. A keyless provider so the AI node has somewhere to go if Ollama runs locally.
    existing = client.get("/provider-credentials", headers=headers).json()["data"]
    if not any(c["provider"] == "ollama" for c in existing):
        post("/provider-credentials", json={"provider": "ollama", "api_key": "", "label": "Local Ollama", "make_default": True})
        print("stored ollama credential")

    # 3. A second team member who will act as the live agent.
    members = client.get("/workspace/members", headers=headers).json()["data"]
    if not any(m["email"] == AGENT_EMAIL for m in members):
        post("/workspace/members", json={"email": AGENT_EMAIL, "full_name": "Agent Ana", "password": AGENT_PASSWORD, "role": "member"})
        print("added agent", AGENT_EMAIL)

    # 4. Knowledge base + FAQ document (ingested by the worker).
    bases = client.get("/knowledge-bases", headers=headers).json()["data"]
    base = next((b for b in bases if b["name"] == "Northwind FAQ"), None)
    if base is None:
        base = post("/knowledge-bases", json={"name": "Northwind FAQ", "description": "Shipping, returns, warranty"})
        print("created knowledge base", base["id"])
    docs = client.get(f"/knowledge-bases/{base['id']}/documents", headers=headers).json()["data"]
    if not docs:
        post(f"/knowledge-bases/{base['id']}/documents", files={"file": ("northwind-faq.txt", DEMO_DOCUMENT.encode("utf-8"), "text/plain")})
        print("uploaded FAQ document; waiting for the worker …")
        for _ in range(30):
            time.sleep(1)
            docs = client.get(f"/knowledge-bases/{base['id']}/documents", headers=headers).json()["data"]
            if docs and docs[0]["status"] == "ready":
                print("document ready,", docs[0]["chunk_count"], "chunks")
                break
        else:
            print("WARNING: document not ready — is `python -m app.worker` running?")

    # 5. Three published chatbots.
    bots = {b["name"]: b for b in client.get("/chatbots", headers=headers).json()["data"]}

    def ensure_bot(name, description, flow):
        bot = bots.get(name)
        if bot is None:
            bot = post("/chatbots", json={"name": name, "description": description})
            client.put(f"/chatbots/{bot['id']}/flow", headers=headers, json=flow).raise_for_status()
            client.patch(f"/chatbots/{bot['id']}", headers=headers, json={"status": "published"}).raise_for_status()
            print("created + published", name, bot["id"])
        return bot["id"]

    lead_id = ensure_bot("Lead Capture Bot", "Collects name, email and interest", lead_capture())
    faq_id = ensure_bot("FAQ Bot", "Answers from the Northwind FAQ knowledge base", faq_knowledge(base["id"]))
    support_id = ensure_bot("Support Bot", "Triage then hand off to a human", support_handoff())

    # 6. A few conversations so the inbox and analytics are not empty.
    def visitor(chatbot_id, *turns):
        started = client.post("/widget/conversations", json={"chatbot_id": chatbot_id})
        started.raise_for_status()
        data = started.json()["data"]
        widget_headers = {"Authorization": f"Bearer {data['token']}"}
        for text in turns:
            client.post(f"/widget/conversations/{data['conversation']['id']}/messages", headers=widget_headers, json={"content": text})

    visitor(lead_id, "Priya", "priya@example.com", "A demo")
    visitor(lead_id, "Sam", "sam@example.com", "Pricing")
    visitor(faq_id, "How long do refunds take?")
    visitor(support_id, "Billing")  # lands in handoff → waiting in the Inbox
    print("seeded 4 conversations")

    root = api.replace("/api/v1", "")
    print("\nDemo ready.")
    print(f"  Dashboard login : {EMAIL} / {PASSWORD}   (agent: {AGENT_EMAIL} / {AGENT_PASSWORD})")
    print(f"  Customer page   : {root}/demo?chatbot_id={support_id}")
    print(f"  FAQ bot page    : {root}/demo?chatbot_id={faq_id}")
    print(f"  Lead bot page   : {root}/demo?chatbot_id={lead_id}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 5: Run it against a fresh database**

Three terminals in `backend/`: `.venv\Scripts\uvicorn.exe app.main:app --reload`, `.venv\Scripts\python.exe -m app.worker`, then `.venv\Scripts\python.exe -m scripts.seed_demo`. Expected output ends with "Demo ready." and three URLs. Open the Support Bot URL, click the bubble, choose "Billing": the widget says it is connecting you to an agent; in the dashboard Inbox the conversation shows as `handoff`; reply as the agent; the reply appears in the widget within 2 seconds.

Re-run the script: it must print "logged in as", skip every "created" line, and add four more conversations without errors.

- [ ] **Step 6: Commit**

```powershell
git add backend/app/static/demo.html backend/app/main.py backend/scripts backend/tests/test_demo_page.py
git commit -m "feat(demo): customer demo page and one-command demo seed"
```

---

### Task 12: README, start script, and the demo walkthrough

**Files:**
- Create: `README.md` (repo root), `scripts/start-demo.ps1` (repo root), `docs/DEMO_WALKTHROUGH.md`
- Modify: `.gitignore` (repo root)

- [ ] **Step 1: Ignore generated files**

Append to the root `.gitignore` if missing:

```
backend/storage/
backend/*.log
frontend/tsconfig.app.tsbuildinfo
frontend/dist/
```

If `backend/storage/` files are already tracked, run `git rm -r --cached backend/storage` (the demo seed recreates them).

- [ ] **Step 2: README**

Create `README.md` at the repository root:

````markdown
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

This creates the login `demo@northwind.example` / `DemoPass123`, an agent account, a knowledge base with an FAQ document, three published bots, and a few conversations. It prints the URL of a fake customer website (`/demo?chatbot_id=…`) with the widget installed. See `docs/DEMO_WALKTHROUGH.md` for a scripted 10-minute demonstration.

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
                   chatbots, providers, knowledge, jobs, conversations, analytics, health
                   (each: models, schemas, repository, router, api.py = public interface, tests)
  app/static/      widget.js, demo.html
  app/worker.py    job poller (Postgres job table, FOR UPDATE SKIP LOCKED)
  alembic/         migrations 0001–0008
  scripts/         seed_demo.py
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
````

- [ ] **Step 3: One-shot start script**

Create `scripts/start-demo.ps1` at the repository root:

```powershell
# Starts API, worker and dashboard in three PowerShell windows.
$root = Split-Path -Parent $PSScriptRoot
$backend = Join-Path $root "backend"
$frontend = Join-Path $root "frontend"

Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$backend'; .venv\Scripts\uvicorn.exe app.main:app --reload"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$backend'; .venv\Scripts\python.exe -m app.worker"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$frontend'; npm run dev"

Write-Host "API      : http://127.0.0.1:8000/docs"
Write-Host "Dashboard: http://localhost:5173"
Write-Host "Seed demo: cd backend; .venv\Scripts\python.exe -m scripts.seed_demo"
```

- [ ] **Step 4: Demo walkthrough**

Create `docs/DEMO_WALKTHROUGH.md`:

```markdown
# 10-minute demonstration script

Before the session: run `scripts\start-demo.ps1`, wait for all three windows, run the seed script, keep its three printed URLs handy. Open two browser windows side by side: dashboard (left) and the customer page (right). Log in as demo@northwind.example / DemoPass123.

## 1. The problem and the product (1 min)
"Businesses want a chatbot on their website without writing code, without sending their data to a vendor they don't control, and with a human able to step in. This platform lets a company design the conversation visually, plug in its own documents and its own AI key, and install it with one script tag."

## 2. Multi-tenancy and roles (1 min) — Settings → Team
Show the workspace name, the owner, and the agent member. Point out roles. Open Settings → Activity: every action so far is already recorded with actor and target. "Every table has a workspace id, every query requires it, and Postgres row-level security enforces it a second time."

## 3. Bring your own AI key (30 s) — Settings → AI Providers
Show the stored Ollama credential ("ends with none" because Ollama is keyless). "Keys are encrypted before they reach the database and the API never returns them."

## 4. Knowledge base (1 min) — Knowledge
Show "Northwind FAQ" → the document is `ready` with N chunks. "Upload goes to a job table; a separate worker extracts text — PDF, DOCX, HTML — chunks it with overlap, embeds it, and stores it. Search is cosine similarity."

## 5. The builder (2 min) — Chatbot → FAQ Bot → Open Builder
Click "Visual" view. Walk the nodes: message → question → knowledge search → message using {{knowledge}} → end. Open one node's inspector. Show History tab with versions. Then apply the "Support with live-agent handoff" template to a new bot to show the condition with labelled true/false edges, the HTTP request node, delay, and handoff. Save. Publish it from Chat Flows.

## 6. Design the widget (1 min) — Chatbot Design
Change the theme colour and title, save. Switch to the customer page, reload: the bubble and header take the new colour. "The widget is a dependency-free script; it fetches the published design and talks only to a public, token-scoped API."

## 7. Talk to it as a visitor, then hand off (2 min) — customer page
Use the FAQ bot page: ask "How long do refunds take?" → answer quotes the document. Switch to the Support bot page: choose "Billing" → the bot says it is connecting to an agent. Left window: Inbox shows the conversation as `handoff`. Reply as the agent. Right window: the reply appears within two seconds. Close the conversation from the inbox; the widget input disables.

## 8. Analytics and the audit trail (1 min) — Analytics, then Settings → Activity
Conversation tiles, the per-day bar, per-bot table. Then Activity: the agent reply and the close are the two newest rows.

## 9. Engineering (1 min) — show the terminal
Run `pytest` (≈160 tests against a throwaway Postgres database) and `lint-imports` (slice boundaries). Mention: vertical-slice backend, feature-sliced frontend, JWT with server-side role resolution, RLS, Postgres job queue with SKIP LOCKED, polling instead of WebSockets as a documented v1 trade-off.

## Likely questions
- **Why not WebSockets?** One auth model and simpler testing; the message API is turn-scoped so streaming is additive. Documented in the Phase 4 spec.
- **Why Postgres jobs instead of Celery/Redis?** Tenant-scoped, transactional, inspectable with SQL, no Redis on Windows. Documented in the Phase 3 spec.
- **Is the embedding real?** It is a deterministic local bag-of-words embedding behind the same interface a provider embedding uses; swapping to OpenAI embeddings changes one function. pgvector replaces the SQL cosine scan with one migration.
- **What happens if the AI key is missing?** The AI node degrades to an apology message and the flow continues; nothing 500s.
```

- [ ] **Step 5: Commit**

```powershell
git add README.md scripts/start-demo.ps1 docs/DEMO_WALKTHROUGH.md .gitignore
git commit -m "docs: README, one-shot start script and demo walkthrough"
```

---

### Task 13: Full verification and dress rehearsal

- [ ] **Step 1: Backend**

From `backend/`:

```powershell
.venv\Scripts\python.exe -m pytest -q
.venv\Scripts\lint-imports.exe
```

Expected: all tests pass (138 existing + the new ones from Tasks 1, 2, 4, 5, 6, 7, 11 ≈ 165), `Contracts: 3 kept, 0 broken.` Paste the last line of each into the commit message of Step 4.

- [ ] **Step 2: Frontend**

From `frontend/`:

```powershell
npm run typecheck
npm run build
```

Expected: typecheck prints nothing; build ends with `✓ built in …`.

- [ ] **Step 3: Dress rehearsal from a clean database**

```powershell
$env:PGPASSWORD='postgres'
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -h localhost -c "DROP DATABASE IF EXISTS webchatbots WITH (FORCE);"
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -h localhost -c "CREATE DATABASE webchatbots;"
cd backend; .venv\Scripts\alembic.exe upgrade head
```

Then `scripts\start-demo.ps1`, seed, and perform every step of `docs/DEMO_WALKTHROUGH.md` with a stopwatch. Fix anything that does not behave as the walkthrough says before continuing; the walkthrough is the acceptance test.

- [ ] **Step 4: Final commit and tag**

```powershell
git add -A
git commit -m "chore: demo-ready release"
git tag -a v1.0-demo -m "Professor demonstration build"
```

---

## Part D — Platform roles: superadmin, organization admin, workspace roles

**Role model (decision).** Three levels, each reusing what exists:

| Level | Who | How it is stored | What they can do |
|---|---|---|---|
| **Superadmin** (platform) | `admin@admin.com` | `users.is_superadmin` boolean (migration 0009). Checked from the database on every request, never from the JWT. | Platform stats, list every organisation and user, change an organisation's plan, deactivate or reactivate any user, grant or revoke superadmin. Never reads tenant data (chatbots, conversations) — that stays behind workspace membership. |
| **Organisation admin** | a user with the `owner` or `admin` workspace role in any workspace of that organisation (the person who registers is `owner` of the first workspace) | no new table: the check is `WORKSPACE_MANAGE` in the caller's current workspace | rename the organisation, list its workspaces, create workspaces (the creator becomes `owner` there), rename workspaces, switch between workspaces they belong to |
| **Workspace roles** | `owner`, `admin`, `member`, `viewer` (seeded system roles) | `memberships.role_id` | already enforced by `require_permission`; Task 6 gives owners/admins the Team UI; Task 18 makes the rest of the UI honour the role (viewers get a read-only builder) |

### Task 14: Superadmin backend — flag, `/auth/me`, admin API, promotion script

**Files:**
- Create: `backend/alembic/versions/0009_superadmin.py`
- Modify: `backend/app/slices/identity/models.py`, `backend/app/slices/identity/repository.py`, `backend/app/slices/identity/api.py`, `backend/app/slices/identity/router.py`
- Modify: `backend/app/slices/tenancy/repository.py`, `backend/app/slices/tenancy/api.py`
- Modify: `backend/app/slices/chatbots/api.py`, `backend/app/slices/conversations/api.py`, `backend/app/slices/audit/actions.py`
- Create: `backend/app/slices/admin/__init__.py`, `router.py`, `schemas.py`, `tests/__init__.py`, `tests/test_admin_api.py`
- Create: `backend/scripts/create_superadmin.py`
- Modify: `backend/app/main.py`, `backend/pyproject.toml`, `backend/tests/test_migrations.py`

**Interfaces:**
- HTTP `GET /api/v1/auth/me` → `{user_id, email, full_name, is_superadmin, workspace_id, role, permissions}` (any authenticated user).
- HTTP under `/api/v1/admin` (superadmin only, 403 otherwise):
  - `GET /stats` → `{organizations, workspaces, users, chatbots, conversations}`
  - `GET /organizations` → `[{id, name, plan, created_at, workspace_count, member_count}]`
  - `PATCH /organizations/{id}` `{plan: "free"|"pro"|"enterprise"}` → updated row
  - `GET /users` → `[{id, email, full_name, is_active, is_superadmin, created_at, organizations: [str]}]`
  - `PATCH /users/{id}` `{is_active?: bool, is_superadmin?: bool}` → updated row; 400 `CANNOT_EDIT_SELF`
- Python: `identity_api.UserSummary` gains `is_superadmin: bool = False`; `identity_api.platform_list_users(session) -> list[UserSummary]`; `identity_api.set_user_flags(session, *, user_id, is_active=None, is_superadmin=None) -> UserSummary | None`; `identity_api.ensure_superadmin(session, *, email, password, full_name) -> UserSummary`.
- Python: `tenancy_api.OrganizationSummary(id, name, plan, created_at, workspace_count, member_count)`; `tenancy_api.platform_list_organizations(session)`; `tenancy_api.set_organization_plan(session, *, organization_id, plan) -> OrganizationSummary | None`; `tenancy_api.platform_counts(session) -> dict[str, int]` (keys `organizations`, `workspaces`); `tenancy_api.platform_user_organizations(session) -> dict[uuid.UUID, list[str]]`.
- Python: `chatbots_api.platform_count(session) -> int`; `conversations_api.platform_count(session) -> int`.
- These `platform_*` functions are the one sanctioned exception to "every repository function takes `workspace_id`": they exist only for the superadmin surface, are named with the `platform_` prefix so the exception is visible, and are never called from a workspace route.

- [ ] **Step 1: Failing tests**

Create `backend/app/slices/admin/__init__.py`, `backend/app/slices/admin/tests/__init__.py` (empty) and `backend/app/slices/admin/tests/test_admin_api.py`:

```python
import uuid

from app.slices.identity import api as identity_api


async def _register(client, email: str, org: str) -> dict:
    response = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "Secret123", "full_name": "Owner", "org_name": org},
    )
    assert response.status_code == 201, response.text
    return response.json()["data"]


def _headers(bundle: dict) -> dict:
    return {"Authorization": f"Bearer {bundle['access_token']}"}


async def _superadmin(client, session) -> dict:
    bundle = await _register(client, "root@platform.test", "Platform")
    await identity_api.set_user_flags(
        session, user_id=uuid.UUID(bundle["user_id"]), is_superadmin=True
    )
    await session.flush()
    return bundle


async def test_me_reports_role_and_superadmin_flag(client, session):
    owner = await _register(client, "me@acme.test", "Acme")
    me = await client.get("/api/v1/auth/me", headers=_headers(owner))
    assert me.status_code == 200
    data = me.json()["data"]
    assert data["email"] == "me@acme.test"
    assert data["role"] == "owner"
    assert data["is_superadmin"] is False
    assert "*" in data["permissions"]

    root = await _superadmin(client, session)
    me = await client.get("/api/v1/auth/me", headers=_headers(root))
    assert me.json()["data"]["is_superadmin"] is True


async def test_admin_routes_are_superadmin_only(client, session):
    owner = await _register(client, "plain@acme.test", "Acme")
    for path in ("/api/v1/admin/stats", "/api/v1/admin/organizations", "/api/v1/admin/users"):
        response = await client.get(path, headers=_headers(owner))
        assert response.status_code == 403, path
    anonymous = await client.get("/api/v1/admin/stats")
    assert anonymous.status_code == 401


async def test_stats_and_organizations_span_every_tenant(client, session):
    root = await _superadmin(client, session)
    acme = await _register(client, "a@acme.test", "Acme")
    await _register(client, "b@bolt.test", "Bolt")
    await client.post("/api/v1/chatbots", json={"name": "Bot"}, headers=_headers(acme))

    stats = (await client.get("/api/v1/admin/stats", headers=_headers(root))).json()["data"]
    assert stats["organizations"] == 3  # Platform, Acme, Bolt
    assert stats["workspaces"] == 3
    assert stats["users"] == 3
    assert stats["chatbots"] == 1
    assert stats["conversations"] == 0

    orgs = (await client.get("/api/v1/admin/organizations", headers=_headers(root))).json()["data"]
    by_name = {org["name"]: org for org in orgs}
    assert set(by_name) == {"Platform", "Acme", "Bolt"}
    assert by_name["Acme"]["workspace_count"] == 1
    assert by_name["Acme"]["member_count"] == 1
    assert by_name["Acme"]["plan"] == "free"


async def test_change_plan_and_user_flags(client, session):
    root = await _superadmin(client, session)
    acme = await _register(client, "owner@acme.test", "Acme")
    orgs = (await client.get("/api/v1/admin/organizations", headers=_headers(root))).json()["data"]
    acme_org = next(org for org in orgs if org["name"] == "Acme")

    changed = await client.patch(
        f"/api/v1/admin/organizations/{acme_org['id']}", json={"plan": "pro"}, headers=_headers(root)
    )
    assert changed.status_code == 200
    assert changed.json()["data"]["plan"] == "pro"
    bad = await client.patch(
        f"/api/v1/admin/organizations/{acme_org['id']}", json={"plan": "gold"}, headers=_headers(root)
    )
    assert bad.status_code == 400

    users = (await client.get("/api/v1/admin/users", headers=_headers(root))).json()["data"]
    acme_user = next(u for u in users if u["email"] == "owner@acme.test")
    assert acme_user["organizations"] == ["Acme"]

    deactivated = await client.patch(
        f"/api/v1/admin/users/{acme_user['id']}", json={"is_active": False}, headers=_headers(root)
    )
    assert deactivated.status_code == 200
    assert deactivated.json()["data"]["is_active"] is False
    # A deactivated user is rejected on the very next request — no JWT window.
    denied = await client.get("/api/v1/chatbots", headers=_headers(acme))
    assert denied.status_code == 401

    promoted = await client.patch(
        f"/api/v1/admin/users/{acme_user['id']}", json={"is_superadmin": True, "is_active": True}, headers=_headers(root)
    )
    assert promoted.json()["data"]["is_superadmin"] is True

    self_edit = await client.patch(
        f"/api/v1/admin/users/{root['user_id']}", json={"is_superadmin": False}, headers=_headers(root)
    )
    assert self_edit.status_code == 400
    assert self_edit.json()["error"] == "CANNOT_EDIT_SELF"


async def test_admin_mutations_are_audited_without_workspace(client, session):
    from sqlalchemy import text

    root = await _superadmin(client, session)
    acme = await _register(client, "audit@acme.test", "Acme")
    await client.patch(f"/api/v1/admin/users/{acme['user_id']}", json={"is_active": False}, headers=_headers(root))
    rows = await session.execute(
        text("SELECT action, workspace_id FROM audit_logs WHERE action = 'admin.user_updated'")
    )
    row = rows.first()
    assert row is not None and row[1] is None


async def test_ensure_superadmin_creates_then_promotes(session):
    created = await identity_api.ensure_superadmin(
        session, email="boot@platform.test", password="BootPass123", full_name="Boot"
    )
    assert created.is_superadmin is True
    again = await identity_api.ensure_superadmin(
        session, email="boot@platform.test", password="ignored", full_name="Boot"
    )
    assert again.id == created.id and again.is_superadmin is True
```

Run: `.venv\Scripts\python.exe -m pytest app/slices/admin -v` → import error on `set_user_flags` / 404s.

- [ ] **Step 2: Migration and model**

Create `backend/alembic/versions/0009_superadmin.py`:

```python
"""Platform superadmin flag on users.

Revision ID: 0009_superadmin
Revises: 0008_conversations
"""
import sqlalchemy as sa
from alembic import op

revision = "0009_superadmin"
down_revision = "0008_conversations"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("is_superadmin", sa.Boolean(), server_default=sa.text("false"), nullable=False),
    )


def downgrade() -> None:
    op.drop_column("users", "is_superadmin")
```

In `backend/app/slices/identity/models.py`, after `is_active`, add:

```python
    is_superadmin: Mapped[bool] = mapped_column(
        nullable=False, server_default=text("false")
    )
```

- [ ] **Step 3: Identity repository and API**

Append to `backend/app/slices/identity/repository.py`:

```python
async def select_all_users(session: AsyncSession) -> list[User]:
    statement = select(User).where(User.deleted_at.is_(None)).order_by(User.created_at, User.id)
    return list((await session.execute(statement)).scalars().all())
```

In `backend/app/slices/identity/api.py`: add `is_superadmin: bool = False` and `created_at: datetime | None = None` as the last fields of `UserSummary` (import `from datetime import datetime`), make `_summary` pass `is_superadmin=user.is_superadmin, created_at=user.created_at`, and append:

```python
async def platform_list_users(session: AsyncSession) -> list[UserSummary]:
    """Superadmin only: every live user on the platform."""
    return [_summary(user) for user in await repository.select_all_users(session)]


async def set_user_flags(
    session: AsyncSession,
    *,
    user_id: uuid.UUID,
    is_active: bool | None = None,
    is_superadmin: bool | None = None,
) -> UserSummary | None:
    user = await repository.select_user(session, user_id, for_update=True)
    if user is None:
        return None
    if is_active is not None:
        user.is_active = is_active
    if is_superadmin is not None:
        user.is_superadmin = is_superadmin
    await session.flush()
    return _summary(user)


async def ensure_superadmin(
    session: AsyncSession, *, email: str, password: str, full_name: str
) -> UserSummary:
    """Create the user if needed, then make sure the flag is set. Idempotent."""
    existing = await repository.select_user_by_email(session, email.strip().lower(), for_update=True)
    if existing is None:
        created = await create_user(session, email=email, password=password, full_name=full_name)
        user_id = created.id
    else:
        user_id = existing.id
    summary = await set_user_flags(session, user_id=user_id, is_superadmin=True)
    assert summary is not None
    return summary
```

Add `"platform_list_users", "set_user_flags", "ensure_superadmin"` to `__all__`.

- [ ] **Step 4: `/auth/me`**

In `backend/app/slices/identity/router.py` add the imports `from app.slices.identity import repository` and `from app.slices.tenancy import api as tenancy_api` (identity → tenancy is the allowed direction), then add:

```python
@router.get("/me")
async def me(
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_session),
) -> dict:
    user = await repository.select_user(session, principal.user_id)
    if user is None or not user.is_active:
        raise AppError(code="UNAUTHENTICATED", message="User is inactive", status_code=401)
    membership = await tenancy_api.get_active_membership(
        session, user_id=user.id, workspace_id=principal.workspace_id
    )
    return success(
        {
            "user_id": str(user.id),
            "email": user.email,
            "full_name": user.full_name,
            "is_superadmin": user.is_superadmin,
            "workspace_id": str(principal.workspace_id),
            "role": membership.role_name if membership else None,
            "permissions": list(membership.permissions) if membership else [],
        }
    )
```

(`AppError` import: `from app.core.errors import AppError` if not already present.)

- [ ] **Step 5: Tenancy, chatbots and conversations platform helpers**

Append to `backend/app/slices/tenancy/repository.py`:

```python
from sqlalchemy import func


async def list_organizations_with_counts(
    session: AsyncSession,
) -> list[tuple[Organization, int, int]]:
    workspace_count = (
        select(Workspace.organization_id, func.count().label("n"))
        .where(Workspace.deleted_at.is_(None))
        .group_by(Workspace.organization_id)
        .subquery()
    )
    member_count = (
        select(Workspace.organization_id, func.count(func.distinct(Membership.user_id)).label("n"))
        .join(Membership, Membership.workspace_id == Workspace.id)
        .where(Workspace.deleted_at.is_(None), Membership.deleted_at.is_(None))
        .group_by(Workspace.organization_id)
        .subquery()
    )
    statement = (
        select(
            Organization,
            func.coalesce(workspace_count.c.n, 0),
            func.coalesce(member_count.c.n, 0),
        )
        .outerjoin(workspace_count, workspace_count.c.organization_id == Organization.id)
        .outerjoin(member_count, member_count.c.organization_id == Organization.id)
        .where(Organization.deleted_at.is_(None))
        .order_by(Organization.created_at, Organization.id)
    )
    return [(row[0], int(row[1]), int(row[2])) for row in (await session.execute(statement)).all()]


async def select_organization(
    session: AsyncSession, *, organization_id: uuid.UUID, for_update: bool = False
) -> Organization | None:
    statement = select(Organization).where(
        Organization.id == organization_id, Organization.deleted_at.is_(None)
    )
    if for_update:
        statement = statement.with_for_update()
    return (await session.execute(statement)).scalar_one_or_none()


async def count_organizations_and_workspaces(session: AsyncSession) -> tuple[int, int]:
    organizations = (
        await session.execute(select(func.count()).select_from(Organization).where(Organization.deleted_at.is_(None)))
    ).scalar_one()
    workspaces = (
        await session.execute(select(func.count()).select_from(Workspace).where(Workspace.deleted_at.is_(None)))
    ).scalar_one()
    return int(organizations), int(workspaces)


async def list_user_organization_names(session: AsyncSession) -> list[tuple[uuid.UUID, str]]:
    statement = (
        select(Membership.user_id, Organization.name)
        .join(Workspace, Workspace.id == Membership.workspace_id)
        .join(Organization, Organization.id == Workspace.organization_id)
        .where(Membership.deleted_at.is_(None))
        .distinct()
        .order_by(Organization.name)
    )
    return [(row[0], row[1]) for row in (await session.execute(statement)).all()]
```

Append to `backend/app/slices/tenancy/api.py`:

```python
PLANS = ("free", "pro", "enterprise")


@dataclass(frozen=True)
class OrganizationSummary:
    id: uuid.UUID
    name: str
    plan: str
    created_at: datetime
    workspace_count: int
    member_count: int


def _organization_summary(organization, workspace_count: int, member_count: int) -> OrganizationSummary:
    return OrganizationSummary(
        id=organization.id,
        name=organization.name,
        plan=organization.plan,
        created_at=organization.created_at,
        workspace_count=workspace_count,
        member_count=member_count,
    )


async def platform_list_organizations(session: AsyncSession) -> list[OrganizationSummary]:
    """Superadmin only: every organisation with its workspace and member counts."""
    return [
        _organization_summary(organization, workspaces, members)
        for organization, workspaces, members in await repository.list_organizations_with_counts(session)
    ]


async def set_organization_plan(
    session: AsyncSession, *, organization_id: uuid.UUID, plan: str
) -> OrganizationSummary | None:
    if plan not in PLANS:
        raise AppError(code="INVALID_PLAN", message=f"plan must be one of {', '.join(PLANS)}", status_code=400)
    organization = await repository.select_organization(session, organization_id=organization_id, for_update=True)
    if organization is None:
        return None
    organization.plan = plan
    await session.flush()
    rows = await repository.list_organizations_with_counts(session)
    return next(
        _organization_summary(org, workspaces, members)
        for org, workspaces, members in rows
        if org.id == organization_id
    )


async def platform_counts(session: AsyncSession) -> dict[str, int]:
    organizations, workspaces = await repository.count_organizations_and_workspaces(session)
    return {"organizations": organizations, "workspaces": workspaces}


async def platform_user_organizations(session: AsyncSession) -> dict[uuid.UUID, list[str]]:
    out: dict[uuid.UUID, list[str]] = {}
    for user_id, name in await repository.list_user_organization_names(session):
        out.setdefault(user_id, []).append(name)
    return out
```

(add `from app.core.errors import AppError` to the imports of `tenancy/api.py`.)

Append to `backend/app/slices/chatbots/api.py` (and to `__all__`):

```python
async def platform_count(session: AsyncSession) -> int:
    """Superadmin only: live chatbots across every workspace."""
    from sqlalchemy import func

    return int(
        (
            await session.execute(
                select(func.count()).select_from(Chatbot).where(Chatbot.deleted_at.is_(None))
            )
        ).scalar_one()
    )
```

Append to `backend/app/slices/conversations/api.py`:

```python
async def platform_count(session: AsyncSession) -> int:
    """Superadmin only: conversations across every workspace."""
    return int(
        (
            await session.execute(
                select(func.count()).select_from(Conversation).where(Conversation.deleted_at.is_(None))
            )
        ).scalar_one()
    )
```

Append to `backend/app/slices/audit/actions.py`:

```python
ADMIN_ORGANIZATION_PLAN_CHANGED = "admin.organization_plan_changed"
ADMIN_USER_UPDATED = "admin.user_updated"
```

- [ ] **Step 6: The admin slice**

Create `backend/app/slices/admin/schemas.py`:

```python
from typing import Literal

from pydantic import BaseModel, model_validator


class PlanUpdate(BaseModel):
    plan: Literal["free", "pro", "enterprise"]


class UserFlagsUpdate(BaseModel):
    is_active: bool | None = None
    is_superadmin: bool | None = None

    @model_validator(mode="after")
    def require_change(self) -> "UserFlagsUpdate":
        if self.is_active is None and self.is_superadmin is None:
            raise ValueError("supply is_active and/or is_superadmin")
        return self
```

Create `backend/app/slices/admin/router.py`:

```python
"""Platform superadmin surface. Reads and writes only tenancy and identity
metadata — never tenant content — through the published `platform_*` APIs."""

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.core.envelope import success
from app.core.errors import AppError
from app.shared.context import Principal
from app.slices.admin.schemas import PlanUpdate, UserFlagsUpdate
from app.slices.audit import api as audit_api
from app.slices.chatbots import api as chatbots_api
from app.slices.conversations import api as conversations_api
from app.slices.identity import api as identity_api
from app.slices.tenancy import api as tenancy_api

router = APIRouter(prefix="/api/v1/admin", tags=["admin"])


async def require_superadmin(
    principal: Principal = Depends(identity_api.get_current_principal),
    session: AsyncSession = Depends(get_session),
) -> identity_api.UserSummary:
    user = await identity_api.get_active_user(session, user_id=principal.user_id)
    if user is None or not user.is_active:
        raise AppError(code="UNAUTHENTICATED", message="User is inactive", status_code=401)
    if not user.is_superadmin:
        raise AppError(code="FORBIDDEN", message="Superadmin only", status_code=403)
    return user


def _organization(summary: tenancy_api.OrganizationSummary) -> dict:
    return {
        "id": str(summary.id),
        "name": summary.name,
        "plan": summary.plan,
        "created_at": summary.created_at.isoformat(),
        "workspace_count": summary.workspace_count,
        "member_count": summary.member_count,
    }


def _user(summary: identity_api.UserSummary, organizations: list[str]) -> dict:
    return {
        "id": str(summary.id),
        "email": summary.email,
        "full_name": summary.full_name,
        "is_active": summary.is_active,
        "is_superadmin": summary.is_superadmin,
        "created_at": summary.created_at.isoformat() if summary.created_at else None,
        "organizations": organizations,
    }


@router.get("/stats")
async def stats(
    _: identity_api.UserSummary = Depends(require_superadmin),
    session: AsyncSession = Depends(get_session),
) -> dict:
    counts = await tenancy_api.platform_counts(session)
    return success(
        {
            **counts,
            "users": len(await identity_api.platform_list_users(session)),
            "chatbots": await chatbots_api.platform_count(session),
            "conversations": await conversations_api.platform_count(session),
        }
    )


@router.get("/organizations")
async def list_organizations(
    _: identity_api.UserSummary = Depends(require_superadmin),
    session: AsyncSession = Depends(get_session),
) -> dict:
    return success([_organization(o) for o in await tenancy_api.platform_list_organizations(session)])


@router.patch("/organizations/{organization_id}")
async def change_plan(
    organization_id: uuid.UUID,
    body: PlanUpdate,
    admin: identity_api.UserSummary = Depends(require_superadmin),
    session: AsyncSession = Depends(get_session),
) -> dict:
    updated = await tenancy_api.set_organization_plan(session, organization_id=organization_id, plan=body.plan)
    if updated is None:
        raise AppError(code="NOT_FOUND", message="Organization not found", status_code=404)
    await audit_api.record(
        session,
        action=audit_api.actions.ADMIN_ORGANIZATION_PLAN_CHANGED,
        actor_id=admin.id,
        target_type="organization",
        target_id=str(organization_id),
        metadata={"plan": body.plan},
    )
    await session.commit()
    return success(_organization(updated))


@router.get("/users")
async def list_users(
    _: identity_api.UserSummary = Depends(require_superadmin),
    session: AsyncSession = Depends(get_session),
) -> dict:
    organizations = await tenancy_api.platform_user_organizations(session)
    return success(
        [_user(u, organizations.get(u.id, [])) for u in await identity_api.platform_list_users(session)]
    )


@router.patch("/users/{user_id}")
async def update_user(
    user_id: uuid.UUID,
    body: UserFlagsUpdate,
    admin: identity_api.UserSummary = Depends(require_superadmin),
    session: AsyncSession = Depends(get_session),
) -> dict:
    if user_id == admin.id:
        raise AppError(code="CANNOT_EDIT_SELF", message="You cannot change your own flags", status_code=400)
    updated = await identity_api.set_user_flags(
        session, user_id=user_id, is_active=body.is_active, is_superadmin=body.is_superadmin
    )
    if updated is None:
        raise AppError(code="NOT_FOUND", message="User not found", status_code=404)
    await audit_api.record(
        session,
        action=audit_api.actions.ADMIN_USER_UPDATED,
        actor_id=admin.id,
        target_type="user",
        target_id=str(user_id),
        metadata={"is_active": body.is_active, "is_superadmin": body.is_superadmin},
    )
    await session.commit()
    organizations = await tenancy_api.platform_user_organizations(session)
    return success(_user(updated, organizations.get(user_id, [])))
```

Register in `backend/app/main.py`: `from app.slices.admin.router import router as admin_router` and `app.include_router(admin_router)`. Add `"app.slices.admin",` to the import-linter `source_modules` list.

In `backend/tests/test_migrations.py` nothing enumerates columns, so no change is required; run it anyway (it downgrades to base and back, which exercises 0009's `downgrade`).

- [ ] **Step 7: Promotion script**

Create `backend/scripts/create_superadmin.py`:

```python
"""Create or promote a platform superadmin.

    .venv\\Scripts\\python.exe -m scripts.create_superadmin --email admin@admin.com --password "AdminPassword123!" --name "Platform Admin"

A superadmin still logs in through the normal dashboard, which needs a
workspace, so a personal "Platform" organisation is created on first run.
"""

import argparse
import asyncio

from app.core.database import async_session_factory
from app.slices.identity import api as identity_api
from app.slices.tenancy import api as tenancy_api


async def ensure(email: str, password: str, name: str) -> None:
    async with async_session_factory() as session:
        user = await identity_api.ensure_superadmin(session, email=email, password=password, full_name=name)
        if await tenancy_api.get_earliest_workspace_id(session, user_id=user.id) is None:
            tenant = await tenancy_api.create_tenant(session, org_name="Platform", workspace_name="Admin")
            owner = await tenancy_api.get_role_by_name(session, "owner")
            assert owner is not None, "system roles are not seeded — run alembic upgrade head"
            await tenancy_api.create_membership(
                session, user_id=user.id, workspace_id=tenant.workspace_id, role_id=owner.id
            )
        await session.commit()
        print(f"superadmin ready: {email}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--email", required=True)
    parser.add_argument("--password", required=True)
    parser.add_argument("--name", default="Platform Admin")
    args = parser.parse_args()
    asyncio.run(ensure(args.email, args.password, args.name))


if __name__ == "__main__":
    main()
```

- [ ] **Step 8: Migrate, test, lint, commit**

```powershell
.venv\Scripts\alembic.exe upgrade head
.venv\Scripts\python.exe -m pytest app/slices/admin app/slices/identity tests/test_migrations.py -v
.venv\Scripts\lint-imports.exe
.venv\Scripts\python.exe -m scripts.create_superadmin --email admin@admin.com --password "AdminPassword123!" --name "Platform Admin"
```

Expected: PASS, 3 contracts kept, `superadmin ready: admin@admin.com`. Then:

```powershell
git add backend/alembic/versions/0009_superadmin.py backend/app/slices/identity backend/app/slices/tenancy backend/app/slices/chatbots/api.py backend/app/slices/conversations/api.py backend/app/slices/audit/actions.py backend/app/slices/admin backend/scripts/create_superadmin.py backend/app/main.py backend/pyproject.toml
git commit -m "feat(admin): platform superadmin flag, /auth/me, and admin API"
```

---

### Task 15: Superadmin console (frontend)

**Files:**
- Create: `frontend/src/entities/me/api.ts`, `frontend/src/entities/admin/api.ts`
- Create: `frontend/src/pages/admin/AdminPage.tsx`
- Modify: `frontend/src/app/App.tsx`, `frontend/src/widgets/navigation/PrimaryNav.tsx`, `frontend/src/styles.css`

**Interfaces:**
- `useMe()` → TanStack query of `GET /auth/me`, keyed by the auth store's `userId` so it refetches after login/switch. Returns `{ data?: Me, can(permission): boolean }`.
- `adminApi.{stats, organizations, setPlan, users, updateUser}`.

- [ ] **Step 1: `me` entity**

Create `frontend/src/entities/me/api.ts`:

```ts
import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "../../shared/api/client";
import { useAuthStore } from "../../features/auth/model/auth-store";

export interface Me {
  user_id: string;
  email: string;
  full_name: string;
  is_superadmin: boolean;
  workspace_id: string;
  role: "owner" | "admin" | "member" | "viewer" | null;
  permissions: string[];
}

export const meApi = { get: () => apiRequest<Me>("/auth/me") };

/** Who am I in the current workspace. Re-fetched whenever the signed-in user
 *  or workspace changes because both are part of the query key. */
export function useMe() {
  const userId = useAuthStore((s) => s.userId);
  const workspaceId = useAuthStore((s) => s.workspaceId);
  const query = useQuery({
    queryKey: ["me", userId, workspaceId],
    queryFn: meApi.get,
    enabled: Boolean(userId),
    staleTime: 60_000,
  });
  const permissions = query.data?.permissions ?? [];
  const can = (permission: string) => permissions.includes("*") || permissions.includes(permission);
  return { ...query, me: query.data, can };
}
```

Note: `entities` importing the auth store from `features` breaks the strict downward rule once. It is the one place the app's identity lives; move `auth-store.ts` to `frontend/src/entities/session/auth-store.ts` and update its three importers (`App.tsx`, `PrimaryNav.tsx`, `AuthPage.tsx`, plus `SettingsPage.tsx` from Task 6, `BuilderPage.tsx`) so the layering stays clean. Do that move in this step with `git mv`.

Create `frontend/src/entities/admin/api.ts`:

```ts
import { apiRequest } from "../../shared/api/client";

export type Plan = "free" | "pro" | "enterprise";
export const PLANS: Plan[] = ["free", "pro", "enterprise"];

export interface PlatformStats { organizations: number; workspaces: number; users: number; chatbots: number; conversations: number; }
export interface AdminOrganization { id: string; name: string; plan: Plan; created_at: string; workspace_count: number; member_count: number; }
export interface AdminUser { id: string; email: string; full_name: string; is_active: boolean; is_superadmin: boolean; created_at: string | null; organizations: string[]; }

export const adminApi = {
  stats: () => apiRequest<PlatformStats>("/admin/stats"),
  organizations: () => apiRequest<AdminOrganization[]>("/admin/organizations"),
  setPlan: (id: string, plan: Plan) =>
    apiRequest<AdminOrganization>(`/admin/organizations/${id}`, { method: "PATCH", body: JSON.stringify({ plan }) }),
  users: () => apiRequest<AdminUser[]>("/admin/users"),
  updateUser: (id: string, flags: { is_active?: boolean; is_superadmin?: boolean }) =>
    apiRequest<AdminUser>(`/admin/users/${id}`, { method: "PATCH", body: JSON.stringify(flags) }),
};
```

- [ ] **Step 2: Admin page**

Create `frontend/src/pages/admin/AdminPage.tsx`:

```tsx
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldAlert } from "lucide-react";
import { useState } from "react";

import { PLANS, adminApi, type Plan } from "../../entities/admin/api";
import { useMe } from "../../entities/me/api";
import { Badge, Button, EmptyState, LoadingState, Panel, Select, Tabs, useToast, type TabItem } from "../../shared/ui";
import { DashboardShell } from "../../widgets/navigation/DashboardShell";

type AdminTab = "overview" | "organizations" | "users";
const TABS: readonly TabItem<AdminTab>[] = [
  { id: "overview", label: "Overview" },
  { id: "organizations", label: "Organisations" },
  { id: "users", label: "Users" },
];

export function AdminPage() {
  const { me, isLoading } = useMe();
  const [tab, setTab] = useState<AdminTab>("overview");

  if (isLoading) return <LoadingState label="Checking access" />;
  if (!me?.is_superadmin) {
    return (
      <DashboardShell title="Platform admin">
        <EmptyState icon={<ShieldAlert size={28} />} title="Superadmin only" description="This console is limited to platform administrators." />
      </DashboardShell>
    );
  }

  return (
    <DashboardShell title="Platform admin" subtitle="Every organisation and user on this deployment. Tenant content stays private to its workspace.">
      <div className="settings-tabs"><Tabs items={TABS} value={tab} onChange={setTab} label="Admin sections" /></div>
      {tab === "overview" && <Overview />}
      {tab === "organizations" && <Organizations />}
      {tab === "users" && <Users myUserId={me.user_id} />}
    </DashboardShell>
  );
}

function Overview() {
  const stats = useQuery({ queryKey: ["admin", "stats"], queryFn: adminApi.stats, refetchInterval: 10_000 });
  if (!stats.data) return <LoadingState label="Loading platform stats" />;
  const s = stats.data;
  return (
    <div className="stat-grid">
      {([["Organisations", s.organizations], ["Workspaces", s.workspaces], ["Users", s.users], ["Chatbots", s.chatbots], ["Conversations", s.conversations]] as const).map(([label, value]) => (
        <div key={label} className="stat-tile"><span className="stat-label">{label}</span><strong className="stat-value">{value}</strong></div>
      ))}
    </div>
  );
}

function Organizations() {
  const toast = useToast();
  const client = useQueryClient();
  const orgs = useQuery({ queryKey: ["admin", "organizations"], queryFn: adminApi.organizations });
  const setPlan = useMutation({
    mutationFn: (input: { id: string; plan: Plan }) => adminApi.setPlan(input.id, input.plan),
    onSuccess: () => { void client.invalidateQueries({ queryKey: ["admin"] }); toast.success("Plan updated"); },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Failed"),
  });
  if (!orgs.data) return <LoadingState label="Loading organisations" />;
  return (
    <Panel>
      <Panel.Header title={`Organisations (${orgs.data.length})`} />
      <Panel.Body flush>
        <table className="simple-table">
          <thead><tr><th>Name</th><th>Plan</th><th>Workspaces</th><th>Members</th><th>Created</th></tr></thead>
          <tbody>
            {orgs.data.map((org) => (
              <tr key={org.id}>
                <td>{org.name}</td>
                <td>
                  <Select value={org.plan} onChange={(e) => setPlan.mutate({ id: org.id, plan: e.target.value as Plan })} aria-label={`Plan for ${org.name}`}>
                    {PLANS.map((p) => <option key={p} value={p}>{p}</option>)}
                  </Select>
                </td>
                <td>{org.workspace_count}</td>
                <td>{org.member_count}</td>
                <td>{new Date(org.created_at).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel.Body>
    </Panel>
  );
}

function Users({ myUserId }: { myUserId: string }) {
  const toast = useToast();
  const client = useQueryClient();
  const users = useQuery({ queryKey: ["admin", "users"], queryFn: adminApi.users });
  const update = useMutation({
    mutationFn: (input: { id: string; flags: { is_active?: boolean; is_superadmin?: boolean } }) => adminApi.updateUser(input.id, input.flags),
    onSuccess: () => { void client.invalidateQueries({ queryKey: ["admin"] }); toast.success("User updated"); },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Failed"),
  });
  if (!users.data) return <LoadingState label="Loading users" />;
  return (
    <Panel>
      <Panel.Header title={`Users (${users.data.length})`} />
      <Panel.Body flush>
        <table className="simple-table">
          <thead><tr><th>Name</th><th>Email</th><th>Organisations</th><th>Status</th><th>Superadmin</th><th></th></tr></thead>
          <tbody>
            {users.data.map((user) => {
              const isMe = user.id === myUserId;
              return (
                <tr key={user.id}>
                  <td>{user.full_name} {isMe && <Badge tone="brand">you</Badge>}</td>
                  <td>{user.email}</td>
                  <td>{user.organizations.join(", ") || "—"}</td>
                  <td><Badge tone={user.is_active ? "brand" : "danger"}>{user.is_active ? "active" : "deactivated"}</Badge></td>
                  <td>{user.is_superadmin ? <Badge tone="warning">superadmin</Badge> : "—"}</td>
                  <td style={{ display: "flex", gap: 6 }}>
                    <Button size="sm" variant={user.is_active ? "danger" : "secondary"} disabled={isMe} onClick={() => update.mutate({ id: user.id, flags: { is_active: !user.is_active } })}>
                      {user.is_active ? "Deactivate" : "Reactivate"}
                    </Button>
                    <Button size="sm" variant="ghost" disabled={isMe} onClick={() => update.mutate({ id: user.id, flags: { is_superadmin: !user.is_superadmin } })}>
                      {user.is_superadmin ? "Revoke admin" : "Make admin"}
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Panel.Body>
    </Panel>
  );
}
```

- [ ] **Step 3: Route and nav**

`frontend/src/app/App.tsx`: import `AdminPage` and add `<Route path="/admin" element={authenticated ? <AdminPage /> : <Navigate to="/login" replace />} />`.

`frontend/src/widgets/navigation/PrimaryNav.tsx`: import `useMe` from `../../entities/me/api` and `ShieldCheck` from lucide; inside the component `const { me } = useMe();`; after the Settings link add:

```tsx
          {me?.is_superadmin && (
            <Link to="/admin" className={`primary-nav-btn ${path.startsWith("/admin") ? "is-active" : ""}`} title="Platform admin">
              <ShieldCheck size={20} /><span>Admin</span>
            </Link>
          )}
```

- [ ] **Step 4: Typecheck, log in as admin@admin.com, commit**

`npm run typecheck` → clean. Log in as `admin@admin.com` / `AdminPassword123!`: the Admin icon appears; Overview shows counts; deactivating a user in a second window logs that user out on their next request.

```powershell
git add frontend/src
git commit -m "feat(frontend): superadmin console and current-user query"
```

---

### Task 16: Organisation admin backend and workspace switching

**Files:**
- Modify: `backend/app/slices/tenancy/repository.py`, `backend/app/slices/tenancy/api.py`, `backend/app/slices/audit/actions.py`
- Modify: `backend/app/slices/identity/router.py` (`GET /auth/workspaces`)
- Create: `backend/app/slices/organizations/__init__.py`, `router.py`, `schemas.py`, `tests/__init__.py`, `tests/test_organizations_api.py`
- Modify: `backend/app/main.py`, `backend/pyproject.toml`

**Interfaces:**
- HTTP `GET /api/v1/auth/workspaces` → `[{workspace_id, workspace_name, organization_id, organization_name, role}]` for the caller.
- HTTP `/api/v1/organization`:
  - `GET` → `{id, name, plan, workspaces: [{id, name, member_count, created_at, is_current}]}` (FEATURES_READ)
  - `PATCH` `{name}` (WORKSPACE_MANAGE) → same shape
  - `POST /workspaces` `{name}` (WORKSPACE_MANAGE) → `{id, name, member_count, created_at, is_current}` 201; the caller becomes `owner` of the new workspace
  - `PATCH /workspaces/{id}` `{name}` (WORKSPACE_MANAGE; 404 if the workspace is in another organisation)
- Python: `tenancy_api.WorkspaceView` gains `organization_id`; `tenancy_api.WorkspaceSummary(id, name, member_count, created_at)`; `tenancy_api.OrganizationView(id, name, plan)`; `get_organization_of_workspace(session, *, workspace_id) -> OrganizationView | None`; `list_workspaces(session, *, organization_id) -> list[WorkspaceSummary]`; `create_workspace(session, *, organization_id, name) -> WorkspaceSummary`; `rename_organization(session, *, organization_id, name) -> OrganizationView | None`; `rename_workspace(session, *, organization_id, workspace_id, name) -> WorkspaceSummary | None`; `UserWorkspace(workspace_id, workspace_name, organization_id, organization_name, role_name)`; `list_user_workspaces(session, *, user_id) -> list[UserWorkspace]`.

- [ ] **Step 1: Failing tests**

Create `backend/app/slices/organizations/__init__.py`, `tests/__init__.py`, and `tests/test_organizations_api.py`:

```python
async def _register(client, email: str, org: str) -> dict:
    response = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "Secret123", "full_name": "Owner", "org_name": org},
    )
    assert response.status_code == 201, response.text
    return response.json()["data"]


def _headers(bundle: dict) -> dict:
    return {"Authorization": f"Bearer {bundle['access_token']}"}


async def test_organization_profile_lists_workspaces(client):
    owner = await _register(client, "org@acme.test", "Acme")
    response = await client.get("/api/v1/organization", headers=_headers(owner))
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["name"] == "Acme" and data["plan"] == "free"
    assert [w["name"] for w in data["workspaces"]] == ["Default"]
    assert data["workspaces"][0]["is_current"] is True
    assert data["workspaces"][0]["member_count"] == 1


async def test_rename_organization_requires_manage_permission(client):
    owner = await _register(client, "own@acme.test", "Acme")
    renamed = await client.patch("/api/v1/organization", json={"name": "Acme Ltd"}, headers=_headers(owner))
    assert renamed.status_code == 200 and renamed.json()["data"]["name"] == "Acme Ltd"

    added = await client.post(
        "/api/v1/workspace/members",
        json={"email": "v@acme.test", "full_name": "V", "password": "ViewerPass1", "role": "viewer"},
        headers=_headers(owner),
    )
    assert added.status_code == 201
    viewer = (await client.post("/api/v1/auth/login", json={"email": "v@acme.test", "password": "ViewerPass1"})).json()["data"]
    denied = await client.patch("/api/v1/organization", json={"name": "Nope"}, headers=_headers(viewer))
    assert denied.status_code == 403


async def test_create_workspace_makes_caller_owner_and_is_switchable(client):
    owner = await _register(client, "multi@acme.test", "Acme")
    created = await client.post("/api/v1/organization/workspaces", json={"name": "Sales"}, headers=_headers(owner))
    assert created.status_code == 201, created.text
    sales_id = created.json()["data"]["id"]

    mine = await client.get("/api/v1/auth/workspaces", headers=_headers(owner))
    assert mine.status_code == 200
    rows = {w["workspace_name"]: w for w in mine.json()["data"]}
    assert set(rows) == {"Default", "Sales"}
    assert rows["Sales"]["role"] == "owner"

    switched = await client.post(
        "/api/v1/auth/switch-workspace",
        json={"refresh_token": owner["refresh_token"], "workspace_id": sales_id},
        headers=_headers(owner),
    )
    assert switched.status_code == 200
    assert switched.json()["data"]["workspace_id"] == sales_id

    # Chatbots are per workspace: the new one is empty even though the org is the same.
    bots = await client.get("/api/v1/chatbots", headers=_headers(switched.json()["data"]))
    assert bots.json()["data"] == []
    profile = await client.get("/api/v1/organization", headers=_headers(switched.json()["data"]))
    current = [w for w in profile.json()["data"]["workspaces"] if w["is_current"]]
    assert current[0]["name"] == "Sales"


async def test_rename_workspace_is_organization_scoped(client):
    acme = await _register(client, "a@acme.test", "Acme")
    bolt = await _register(client, "b@bolt.test", "Bolt")
    renamed = await client.patch(
        f"/api/v1/organization/workspaces/{acme['workspace_id']}", json={"name": "HQ"}, headers=_headers(acme)
    )
    assert renamed.status_code == 200 and renamed.json()["data"]["name"] == "HQ"
    foreign = await client.patch(
        f"/api/v1/organization/workspaces/{acme['workspace_id']}", json={"name": "Hijack"}, headers=_headers(bolt)
    )
    assert foreign.status_code == 404


async def test_organization_mutations_are_audited(client, session):
    from sqlalchemy import text

    owner = await _register(client, "aud@acme.test", "Acme")
    await client.patch("/api/v1/organization", json={"name": "Acme 2"}, headers=_headers(owner))
    await client.post("/api/v1/organization/workspaces", json={"name": "Ops"}, headers=_headers(owner))
    rows = await session.execute(
        text("SELECT action FROM audit_logs WHERE action LIKE 'organization.%' OR action = 'workspace.created' ORDER BY created_at")
    )
    assert [r[0] for r in rows] == ["organization.renamed", "workspace.created"]
```

Run: `.venv\Scripts\python.exe -m pytest app/slices/organizations -v` → 404s.

- [ ] **Step 2: Tenancy repository and API**

Append to `backend/app/slices/tenancy/repository.py`:

```python
async def list_workspaces_with_member_counts(
    session: AsyncSession, *, organization_id: uuid.UUID
) -> list[tuple[Workspace, int]]:
    members = (
        select(Membership.workspace_id, func.count().label("n"))
        .where(Membership.deleted_at.is_(None))
        .group_by(Membership.workspace_id)
        .subquery()
    )
    statement = (
        select(Workspace, func.coalesce(members.c.n, 0))
        .outerjoin(members, members.c.workspace_id == Workspace.id)
        .where(Workspace.organization_id == organization_id, Workspace.deleted_at.is_(None))
        .order_by(Workspace.created_at, Workspace.id)
    )
    return [(row[0], int(row[1])) for row in (await session.execute(statement)).all()]


async def select_workspace(
    session: AsyncSession, *, workspace_id: uuid.UUID, for_update: bool = False
) -> Workspace | None:
    statement = select(Workspace).where(Workspace.id == workspace_id, Workspace.deleted_at.is_(None))
    if for_update:
        statement = statement.with_for_update()
    return (await session.execute(statement)).scalar_one_or_none()


async def list_user_workspaces(
    session: AsyncSession, *, user_id: uuid.UUID
) -> list[tuple[Workspace, Organization, Role]]:
    statement = (
        select(Workspace, Organization, Role)
        .join(Membership, Membership.workspace_id == Workspace.id)
        .join(Organization, Organization.id == Workspace.organization_id)
        .join(Role, Role.id == Membership.role_id)
        .where(Membership.user_id == user_id, Membership.deleted_at.is_(None), Workspace.deleted_at.is_(None))
        .order_by(Organization.name, Workspace.created_at)
    )
    return [(row[0], row[1], row[2]) for row in (await session.execute(statement)).all()]
```

In `backend/app/slices/tenancy/api.py`, change `WorkspaceView` to

```python
@dataclass(frozen=True)
class WorkspaceView:
    id: uuid.UUID
    name: str
    organization_name: str
    organization_id: uuid.UUID
```

(and make `get_workspace` pass `organization_id=organization.id`), then append:

```python
@dataclass(frozen=True)
class OrganizationView:
    id: uuid.UUID
    name: str
    plan: str


@dataclass(frozen=True)
class WorkspaceSummary:
    id: uuid.UUID
    name: str
    member_count: int
    created_at: datetime


@dataclass(frozen=True)
class UserWorkspace:
    workspace_id: uuid.UUID
    workspace_name: str
    organization_id: uuid.UUID
    organization_name: str
    role_name: str


async def get_organization_of_workspace(
    session: AsyncSession, *, workspace_id: uuid.UUID
) -> OrganizationView | None:
    found = await repository.select_workspace_with_organization(session, workspace_id=workspace_id)
    if found is None:
        return None
    _, organization = found
    return OrganizationView(id=organization.id, name=organization.name, plan=organization.plan)


async def list_workspaces(session: AsyncSession, *, organization_id: uuid.UUID) -> list[WorkspaceSummary]:
    return [
        WorkspaceSummary(id=w.id, name=w.name, member_count=n, created_at=w.created_at)
        for w, n in await repository.list_workspaces_with_member_counts(session, organization_id=organization_id)
    ]


async def create_workspace(session: AsyncSession, *, organization_id: uuid.UUID, name: str) -> WorkspaceSummary:
    workspace = await repository.insert_workspace(session, organization_id=organization_id, name=name.strip())
    return WorkspaceSummary(id=workspace.id, name=workspace.name, member_count=0, created_at=workspace.created_at)


async def rename_organization(
    session: AsyncSession, *, organization_id: uuid.UUID, name: str
) -> OrganizationView | None:
    organization = await repository.select_organization(session, organization_id=organization_id, for_update=True)
    if organization is None:
        return None
    organization.name = name.strip()
    await session.flush()
    return OrganizationView(id=organization.id, name=organization.name, plan=organization.plan)


async def rename_workspace(
    session: AsyncSession, *, organization_id: uuid.UUID, workspace_id: uuid.UUID, name: str
) -> WorkspaceSummary | None:
    workspace = await repository.select_workspace(session, workspace_id=workspace_id, for_update=True)
    if workspace is None or workspace.organization_id != organization_id:
        return None
    workspace.name = name.strip()
    await session.flush()
    rows = await repository.list_workspaces_with_member_counts(session, organization_id=organization_id)
    return next(
        WorkspaceSummary(id=w.id, name=w.name, member_count=n, created_at=w.created_at)
        for w, n in rows
        if w.id == workspace_id
    )


async def list_user_workspaces(session: AsyncSession, *, user_id: uuid.UUID) -> list[UserWorkspace]:
    return [
        UserWorkspace(
            workspace_id=workspace.id,
            workspace_name=workspace.name,
            organization_id=organization.id,
            organization_name=organization.name,
            role_name=role.name,
        )
        for workspace, organization, role in await repository.list_user_workspaces(session, user_id=user_id)
    ]
```

Append to `backend/app/slices/audit/actions.py`:

```python
ORGANIZATION_RENAMED = "organization.renamed"
WORKSPACE_CREATED = "workspace.created"
WORKSPACE_RENAMED = "workspace.renamed"
```

- [ ] **Step 3: `GET /auth/workspaces`**

In `backend/app/slices/identity/router.py` add:

```python
@router.get("/workspaces")
async def my_workspaces(
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_session),
) -> dict:
    rows = await tenancy_api.list_user_workspaces(session, user_id=principal.user_id)
    return success(
        [
            {
                "workspace_id": str(row.workspace_id),
                "workspace_name": row.workspace_name,
                "organization_id": str(row.organization_id),
                "organization_name": row.organization_name,
                "role": row.role_name,
                "is_current": row.workspace_id == principal.workspace_id,
            }
            for row in rows
        ]
    )
```

- [ ] **Step 4: The organizations slice**

Create `backend/app/slices/organizations/schemas.py`:

```python
from pydantic import BaseModel, Field


class NameUpdate(BaseModel):
    name: str = Field(min_length=1, max_length=200)


class WorkspaceCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
```

Create `backend/app/slices/organizations/router.py`:

```python
"""Organisation-level administration for the caller's own organisation.

"Organisation admin" is not a separate role: it is anyone holding
WORKSPACE_MANAGE (owner or admin) in the workspace they are currently in.
"""

import uuid

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.core.envelope import success
from app.core.errors import AppError
from app.shared import permissions
from app.shared.context import WorkspaceContext
from app.slices.audit import api as audit_api
from app.slices.authz import api as authz_api
from app.slices.organizations.schemas import NameUpdate, WorkspaceCreate
from app.slices.tenancy import api as tenancy_api

router = APIRouter(prefix="/api/v1/organization", tags=["organization"])

read_context = authz_api.require_permission(permissions.FEATURES_READ)
manage_context = authz_api.require_permission(permissions.WORKSPACE_MANAGE)


async def _organization(session: AsyncSession, ctx: WorkspaceContext) -> tenancy_api.OrganizationView:
    organization = await tenancy_api.get_organization_of_workspace(session, workspace_id=ctx.workspace_id)
    if organization is None:
        raise AppError(code="NOT_FOUND", message="Organization not found", status_code=404)
    return organization


def _workspace(summary: tenancy_api.WorkspaceSummary, current: uuid.UUID) -> dict:
    return {
        "id": str(summary.id),
        "name": summary.name,
        "member_count": summary.member_count,
        "created_at": summary.created_at.isoformat(),
        "is_current": summary.id == current,
    }


async def _profile(session: AsyncSession, ctx: WorkspaceContext, organization: tenancy_api.OrganizationView) -> dict:
    workspaces = await tenancy_api.list_workspaces(session, organization_id=organization.id)
    return {
        "id": str(organization.id),
        "name": organization.name,
        "plan": organization.plan,
        "workspaces": [_workspace(w, ctx.workspace_id) for w in workspaces],
    }


@router.get("")
async def get_organization(
    ctx: WorkspaceContext = Depends(read_context),
    session: AsyncSession = Depends(get_session),
) -> dict:
    organization = await _organization(session, ctx)
    return success(await _profile(session, ctx, organization))


@router.patch("")
async def rename_organization(
    body: NameUpdate,
    ctx: WorkspaceContext = Depends(manage_context),
    session: AsyncSession = Depends(get_session),
) -> dict:
    organization = await _organization(session, ctx)
    renamed = await tenancy_api.rename_organization(session, organization_id=organization.id, name=body.name)
    assert renamed is not None
    await audit_api.record(
        session,
        action=audit_api.actions.ORGANIZATION_RENAMED,
        workspace_id=ctx.workspace_id,
        actor_id=ctx.user_id,
        target_type="organization",
        target_id=str(organization.id),
        metadata={"name": body.name},
    )
    await session.commit()
    return success(await _profile(session, ctx, renamed))


@router.post("/workspaces", status_code=201)
async def create_workspace(
    body: WorkspaceCreate,
    ctx: WorkspaceContext = Depends(manage_context),
    session: AsyncSession = Depends(get_session),
) -> JSONResponse:
    organization = await _organization(session, ctx)
    workspace = await tenancy_api.create_workspace(session, organization_id=organization.id, name=body.name)
    owner = await tenancy_api.get_role_by_name(session, "owner")
    if owner is None:
        raise AppError(code="ROLES_NOT_SEEDED", message="System roles are missing", status_code=500)
    await tenancy_api.create_membership(session, user_id=ctx.user_id, workspace_id=workspace.id, role_id=owner.id)
    await audit_api.record(
        session,
        action=audit_api.actions.WORKSPACE_CREATED,
        workspace_id=workspace.id,
        actor_id=ctx.user_id,
        target_type="workspace",
        target_id=str(workspace.id),
        metadata={"name": body.name, "organization_id": str(organization.id)},
    )
    await session.commit()
    created = tenancy_api.WorkspaceSummary(id=workspace.id, name=workspace.name, member_count=1, created_at=workspace.created_at)
    return JSONResponse(status_code=201, content=success(_workspace(created, ctx.workspace_id)))


@router.patch("/workspaces/{workspace_id}")
async def rename_workspace(
    workspace_id: uuid.UUID,
    body: NameUpdate,
    ctx: WorkspaceContext = Depends(manage_context),
    session: AsyncSession = Depends(get_session),
) -> dict:
    organization = await _organization(session, ctx)
    renamed = await tenancy_api.rename_workspace(
        session, organization_id=organization.id, workspace_id=workspace_id, name=body.name
    )
    if renamed is None:
        raise AppError(code="NOT_FOUND", message="Workspace not found in this organization", status_code=404)
    await audit_api.record(
        session,
        action=audit_api.actions.WORKSPACE_RENAMED,
        workspace_id=ctx.workspace_id,
        actor_id=ctx.user_id,
        target_type="workspace",
        target_id=str(workspace_id),
        metadata={"name": body.name},
    )
    await session.commit()
    return success(_workspace(renamed, ctx.workspace_id))
```

Register in `backend/app/main.py` (`organizations_router`) and add `"app.slices.organizations",` to the import-linter `source_modules`.

- [ ] **Step 5: Tests, lint, commit**

```powershell
.venv\Scripts\python.exe -m pytest app/slices/organizations app/slices/identity app/slices/tenancy app/slices/members -v
.venv\Scripts\lint-imports.exe
git add backend/app/slices/organizations backend/app/slices/tenancy backend/app/slices/identity/router.py backend/app/slices/audit/actions.py backend/app/main.py backend/pyproject.toml
git commit -m "feat(organizations): organisation profile, workspaces, and my-workspaces endpoint"
```

---

### Task 17: Organisation tab and workspace switcher (frontend)

**Files:**
- Modify: `frontend/src/shared/api/client.ts` (add `authApi.switchWorkspace`), `frontend/src/entities/session/auth-store.ts` (add `switchWorkspace`)
- Create: `frontend/src/entities/organization/api.ts`, `frontend/src/features/organization/OrganizationPanel.tsx`, `frontend/src/widgets/navigation/WorkspaceSwitcher.tsx`
- Modify: `frontend/src/pages/settings/SettingsPage.tsx`, `frontend/src/widgets/navigation/PrimaryNav.tsx`, `frontend/src/styles.css`

- [ ] **Step 1: Switch-workspace call**

In `frontend/src/shared/api/client.ts`, add to `authApi`:

```ts
  async switchWorkspace(workspaceId: string) {
    if (!refreshToken) throw new ApiError(401, "UNAUTHENTICATED", "Session expired");
    const tokens = await apiRequest<AuthTokens>("/auth/switch-workspace", {
      method: "POST",
      body: JSON.stringify({ refresh_token: refreshToken, workspace_id: workspaceId }),
    });
    setTokens(tokens);
    return tokens;
  },
```

In `frontend/src/entities/session/auth-store.ts` add `switchWorkspace: (workspaceId: string) => Promise<void>;` to the interface and

```ts
  switchWorkspace: async (workspaceId) => {
    const tokens = await authApi.switchWorkspace(workspaceId);
    set(authenticated(tokens));
  },
```

- [ ] **Step 2: Entity API**

Create `frontend/src/entities/organization/api.ts`:

```ts
import { apiRequest } from "../../shared/api/client";

export interface OrgWorkspace { id: string; name: string; member_count: number; created_at: string; is_current: boolean; }
export interface OrganizationProfile { id: string; name: string; plan: string; workspaces: OrgWorkspace[]; }
export interface MyWorkspace { workspace_id: string; workspace_name: string; organization_id: string; organization_name: string; role: string; is_current: boolean; }

export const organizationApi = {
  get: () => apiRequest<OrganizationProfile>("/organization"),
  rename: (name: string) => apiRequest<OrganizationProfile>("/organization", { method: "PATCH", body: JSON.stringify({ name }) }),
  createWorkspace: (name: string) => apiRequest<OrgWorkspace>("/organization/workspaces", { method: "POST", body: JSON.stringify({ name }) }),
  renameWorkspace: (id: string, name: string) => apiRequest<OrgWorkspace>(`/organization/workspaces/${id}`, { method: "PATCH", body: JSON.stringify({ name }) }),
  mine: () => apiRequest<MyWorkspace[]>("/auth/workspaces"),
};
```

- [ ] **Step 3: Organisation panel**

Create `frontend/src/features/organization/OrganizationPanel.tsx`:

```tsx
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRightLeft, Building2, Plus } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { useMe } from "../../entities/me/api";
import { organizationApi } from "../../entities/organization/api";
import { useAuthStore } from "../../entities/session/auth-store";
import { Badge, Button, Field, Input, LoadingState, Panel, useToast } from "../../shared/ui";

export function OrganizationPanel() {
  const toast = useToast();
  const client = useQueryClient();
  const navigate = useNavigate();
  const { can } = useMe();
  const switchWorkspace = useAuthStore((s) => s.switchWorkspace);
  const [orgName, setOrgName] = useState("");
  const [workspaceName, setWorkspaceName] = useState("");

  const org = useQuery({ queryKey: ["organization"], queryFn: organizationApi.get });
  const canManage = can("workspace:manage");
  const fail = (e: unknown) => toast.error(e instanceof Error ? e.message : "Request failed");
  const refresh = () => client.invalidateQueries({ queryKey: ["organization"] });

  const rename = useMutation({ mutationFn: () => organizationApi.rename(orgName), onSuccess: () => { setOrgName(""); void refresh(); toast.success("Organisation renamed"); }, onError: fail });
  const create = useMutation({ mutationFn: () => organizationApi.createWorkspace(workspaceName), onSuccess: () => { setWorkspaceName(""); void refresh(); void client.invalidateQueries({ queryKey: ["my-workspaces"] }); toast.success("Workspace created — you are its owner"); }, onError: fail });
  const switchTo = useMutation({
    mutationFn: (id: string) => switchWorkspace(id),
    onSuccess: () => { client.clear(); navigate("/chatbots"); toast.success("Switched workspace"); },
    onError: fail,
  });

  if (!org.data) return <LoadingState label="Loading organisation" />;

  return (
    <div className="settings-grid">
      <Panel>
        <Panel.Header title="Organisation" meta={<Badge tone="brand">{org.data.plan} plan</Badge>} />
        <Panel.Body>
          <p className="form-hint"><Building2 size={14} /> <strong>{org.data.name}</strong>. The plan is set by the platform administrator.</p>
          {canManage && (
            <form className="form-stack" onSubmit={(e) => { e.preventDefault(); if (orgName.trim()) rename.mutate(); }}>
              <Field label="Rename organisation"><Input value={orgName} onChange={(e) => setOrgName(e.target.value)} placeholder={org.data.name} /></Field>
              <Button type="submit" variant="secondary" disabled={!orgName.trim()} loading={rename.isPending}>Rename</Button>
            </form>
          )}
          {canManage && (
            <form className="form-stack" style={{ marginTop: 20 }} onSubmit={(e) => { e.preventDefault(); if (workspaceName.trim()) create.mutate(); }}>
              <Field label="New workspace"><Input value={workspaceName} onChange={(e) => setWorkspaceName(e.target.value)} placeholder="e.g. Sales team" /></Field>
              <p className="form-hint">Workspaces isolate chatbots, knowledge and conversations. You become the owner of every workspace you create.</p>
              <Button type="submit" variant="primary" icon={<Plus size={15} />} disabled={!workspaceName.trim()} loading={create.isPending}>Create workspace</Button>
            </form>
          )}
        </Panel.Body>
      </Panel>

      <Panel>
        <Panel.Header title={`Workspaces (${org.data.workspaces.length})`} />
        <Panel.Body flush>
          {org.data.workspaces.map((w) => (
            <div key={w.id} className="credential-row">
              <div>
                <strong style={{ textTransform: "none" }}>{w.name}</strong> {w.is_current && <Badge tone="brand">current</Badge>}
                <span className="credential-meta">{w.member_count} member{w.member_count === 1 ? "" : "s"} · created {new Date(w.created_at).toLocaleDateString()}</span>
              </div>
              {!w.is_current && (
                <Button size="sm" variant="ghost" icon={<ArrowRightLeft size={14} />} onClick={() => switchTo.mutate(w.id)} loading={switchTo.isPending}>Switch</Button>
              )}
            </div>
          ))}
        </Panel.Body>
      </Panel>
    </div>
  );
}
```

Switching to a workspace the caller is not a member of returns 403 from the backend; the panel only offers workspaces of the current organisation, and the owner who created them is always a member. Other admins see the workspace but get the 403 toast — acceptable and truthful.

- [ ] **Step 4: Switcher in the icon rail**

Create `frontend/src/widgets/navigation/WorkspaceSwitcher.tsx`:

```tsx
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";

import { organizationApi } from "../../entities/organization/api";
import { useAuthStore } from "../../entities/session/auth-store";

export function WorkspaceSwitcher() {
  const client = useQueryClient();
  const navigate = useNavigate();
  const userId = useAuthStore((s) => s.userId);
  const switchWorkspace = useAuthStore((s) => s.switchWorkspace);
  const mine = useQuery({ queryKey: ["my-workspaces", userId], queryFn: organizationApi.mine, enabled: Boolean(userId) });
  const switchTo = useMutation({
    mutationFn: (id: string) => switchWorkspace(id),
    onSuccess: () => { client.clear(); navigate("/chatbots"); },
  });

  const rows = mine.data ?? [];
  if (rows.length < 2) return null;
  const current = rows.find((r) => r.is_current)?.workspace_id ?? "";

  return (
    <select
      className="workspace-switcher"
      value={current}
      title="Switch workspace"
      aria-label="Switch workspace"
      onChange={(e) => switchTo.mutate(e.target.value)}
      disabled={switchTo.isPending}
    >
      {rows.map((r) => (
        <option key={r.workspace_id} value={r.workspace_id}>{r.organization_name} / {r.workspace_name} ({r.role})</option>
      ))}
    </select>
  );
}
```

In `PrimaryNav.tsx`, render `<WorkspaceSwitcher />` as the first child of `<div className="primary-nav-bottom">`. Append to `styles.css`: `.workspace-switcher { width: 56px; font-size: 10px; border: 1px solid #e2e8f0; border-radius: 8px; padding: 4px 2px; margin-bottom: 8px; background: #fff; }`.

- [ ] **Step 5: Settings tab**

In `SettingsPage.tsx`: import `OrganizationPanel`, extend `SettingsTab` with `"organization"`, add `{ id: "organization", label: "Organisation" }` as the **first** tab entry, default `useState<SettingsTab>("organization")`, and render `{tab === "organization" && <OrganizationPanel />}`.

- [ ] **Step 6: Typecheck, try, commit**

`npm run typecheck` → clean. Create a second workspace, switch with the rail dropdown, confirm the chatbot list is empty in the new workspace and the Team tab shows only you, then switch back.

```powershell
git add frontend/src
git commit -m "feat(frontend): organisation settings and workspace switcher"
```

---

### Task 18: Role-aware dashboard (viewer, member, admin, owner)

Roles are enforced by the API; this task makes the UI reflect them so a viewer does not see buttons that will fail.

**Files:**
- Modify: `frontend/src/pages/builder/BuilderPage.tsx`, `frontend/src/features/classic-builder/ClassicBuilder.tsx` (accept `readOnly`), `frontend/src/pages/chatflows/ChatFlowsPage.tsx`, `frontend/src/pages/design/ChatbotDesignPage.tsx`, `frontend/src/pages/knowledge/KnowledgePage.tsx`, `frontend/src/widgets/navigation/AmbotShell.tsx`, `frontend/src/features/conversations-inbox/ConversationTranscript.tsx`, `frontend/src/styles.css`

- [ ] **Step 1: One banner component**

Add to `frontend/src/shared/ui/Feedback/Feedback.tsx` and export from `shared/ui/index.ts`:

```tsx
export function ReadOnlyBanner({ role }: { role: string | null | undefined }) {
  return (
    <div className="readonly-banner" role="status">
      You are a <strong>{role ?? "viewer"}</strong> in this workspace: you can look, but saving is disabled.
    </div>
  );
}
```

CSS: `.readonly-banner { background: #fffbeb; border: 1px solid #fcd34d; color: #92400e; border-radius: 10px; padding: 10px 14px; font-size: 13px; margin-bottom: 12px; }`

- [ ] **Step 2: Apply `can("features:use")`**

In each file, `const { me, can } = useMe(); const readOnly = !can("features:use");` then:
- `BuilderPage.tsx`: render `<ReadOnlyBanner role={me?.role} />` above the builder when `readOnly`; pass `readOnly` to `ClassicBuilder`; in `saveMutation`/`restoreMutation` `mutationFn`, throw `new Error("Read-only role")` when `readOnly`; hide the "+ Add Component" button and disable `ConfigPanel` inputs by wrapping the panel in `<fieldset disabled={readOnly} style={{ border: 0, padding: 0, margin: 0 }}>`.
- `ClassicBuilder.tsx`: add `readOnly?: boolean` prop; when true, ignore `handleAddComponent`, `handleUpdateSelected`, `handleSetNextTarget` (early return) and wrap column 3 in a disabled `<fieldset>`.
- `ChatFlowsPage.tsx`: hide Import, the Publish toggle becomes a read-only badge, hide Delete, when `readOnly`.
- `ChatbotDesignPage.tsx`: disable Save/Discard buttons and show the banner when `readOnly`.
- `KnowledgePage.tsx`: hide the Create form and Upload button when `readOnly`.
- `AmbotShell.tsx`: hide "New Bot" when `readOnly` (pass `onCreateNewBot` as `undefined` and let `ChatbotSubNav` skip the button when the prop is missing).
- `ConversationTranscript.tsx`: when `readOnly`, replace `LiveAgentInput` with a small note "Only members can reply".

- [ ] **Step 3: Verify with the three seeded roles, commit**

Log in as a viewer (create one on the Team tab): builder shows the banner and no save; Inbox has no reply box; Knowledge has no upload. Log in as a member: everything works except Team management and Activity. `npm run typecheck` → clean.

```powershell
git add frontend/src
git commit -m "feat(frontend): role-aware builder, inbox, knowledge and settings"
```

---

## Part E — Complete chat-flow execution and the widget the design page describes

### Task 19: Rich messages — options as buttons, images, video, links, typed inputs, multiple choice

Today every bot message is plain text: a choice shows "1. A 2. B" and expects the visitor to type, an "Image/GIF" component just prints a URL, and an email input is a plain text box. This task gives each message a `meta` payload the widget, simulator, and inbox can render.

**Files:**
- Create: `backend/alembic/versions/0010_message_meta.py`
- Modify: `backend/app/slices/conversations/models.py`, `repository.py`, `engine.py`, `router.py`
- Test: `backend/app/slices/conversations/tests/test_engine.py`, `test_conversations_api.py`
- Modify: `backend/app/static/widget.js`
- Modify: `frontend/src/entities/conversation/types.ts`, `frontend/src/features/widget-embed/WidgetEmbedDialog.tsx`, `frontend/src/features/conversations-inbox/ConversationTranscript.tsx`, `frontend/src/features/flow-editor/model/catalog.ts`, `frontend/src/features/component-library/ComponentLibraryModal.tsx`, `frontend/src/features/classic-builder/ClassicBuilder.tsx`, `frontend/src/styles.css`

**Interfaces:**
- Message `meta` (JSON object, default `{}`) with optional keys:
  - `kind`: `"image" | "video" | "link"` with `url: str` (message nodes)
  - `options: list[str]`, `multiple: bool` (choice prompts)
  - `inputType: "text" | "name" | "email" | "phone" | "number" | "date"` (input prompts)
- Engine reads node data: message `kind` (or auto-detects a lone URL), choice `mode: "single" | "multiple"` (or `multiple: true`), input `inputType` now also `name` and `date`.
- API: every message object gains `"meta": {...}` (widget start/turn/poll, dashboard list preview and transcript).
- `repository.append_message(..., meta: dict | None = None)`.

- [ ] **Step 1: Engine tests first**

Append to `backend/app/slices/conversations/tests/test_engine.py`:

```python
async def test_choice_prompt_carries_options_meta_and_numbered_text():
    definition = flow(
        [("s", "start", {}), ("c", "choice", {"prompt": "Pick", "options": "Red\nBlue"}), ("e", "end", {})],
        [("s", "c"), ("c", "e")],
    )
    result = await run(definition, services=make_services(), conversation_id="c1")
    prompt = result.messages[-1]
    assert prompt["content"] == "Pick\n1. Red\n2. Blue"
    assert prompt["meta"] == {"options": ["Red", "Blue"], "multiple": False}


async def test_multiple_choice_accepts_several_answers_and_stores_them():
    definition = flow(
        [
            ("s", "start", {}),
            ("c", "choice", {"prompt": "Services?", "options": "Design\nBuild\nMaintain", "mode": "multiple", "variable": "services"}),
            ("m", "message", {"message": "You chose {{services}}"}),
            ("e", "end", {}),
        ],
        [("s", "c"), ("c", "m"), ("m", "e")],
    )
    first = await run(definition, services=make_services(), conversation_id="c1")
    assert first.messages[-1]["meta"]["multiple"] is True
    resumed = await run(
        definition, services=make_services(), conversation_id="c1",
        variables=first.variables, current_node_id="c", visitor_input="Design, 3",
    )
    assert resumed.variables["services"] == "Design, Maintain"
    assert resumed.messages[0]["content"] == "You chose Design, Maintain"

    bad = await run(
        definition, services=make_services(), conversation_id="c1",
        variables=first.variables, current_node_id="c", visitor_input="Design, Paint",
    )
    assert bad.current_node_id == "c"
    assert "Paint" in bad.messages[-1]["content"] or "listed options" in bad.messages[-1]["content"]


async def test_message_kind_is_detected_or_declared():
    definition = flow(
        [
            ("s", "start", {}),
            ("img", "message", {"message": "https://example.com/villa.jpg"}),
            ("vid", "message", {"message": "https://www.youtube.com/watch?v=abc123"}),
            ("lnk", "message", {"message": "https://example.com", "kind": "link"}),
            ("txt", "message", {"message": "See https://example.com for details"}),
            ("e", "end", {}),
        ],
        [("s", "img"), ("img", "vid"), ("vid", "lnk"), ("lnk", "txt"), ("txt", "e")],
    )
    result = await run(definition, services=make_services(), conversation_id="c1")
    metas = [m["meta"] for m in result.messages]
    assert metas[0] == {"kind": "image", "url": "https://example.com/villa.jpg"}
    assert metas[1] == {"kind": "video", "url": "https://www.youtube.com/watch?v=abc123"}
    assert metas[2] == {"kind": "link", "url": "https://example.com"}
    assert metas[3] == {}  # a sentence with a URL inside stays text


async def test_input_prompt_carries_input_type_and_validates_name_and_date():
    definition = flow(
        [
            ("s", "start", {}),
            ("n", "input", {"prompt": "Name?", "variable": "name", "inputType": "name"}),
            ("d", "input", {"prompt": "Date?", "variable": "when", "inputType": "date"}),
            ("e", "end", {"message": "ok {{name}} {{when}}"}),
        ],
        [("s", "n"), ("n", "d"), ("d", "e")],
    )
    first = await run(definition, services=make_services(), conversation_id="c1")
    assert first.messages[-1]["meta"] == {"inputType": "name"}

    rejected = await run(definition, services=make_services(), conversation_id="c1", variables=first.variables, current_node_id="n", visitor_input="42")
    assert rejected.current_node_id == "n"
    accepted = await run(definition, services=make_services(), conversation_id="c1", variables=first.variables, current_node_id="n", visitor_input="Priya")
    assert accepted.current_node_id == "d"
    assert accepted.messages[-1]["meta"] == {"inputType": "date"}

    bad_date = await run(definition, services=make_services(), conversation_id="c1", variables=accepted.variables, current_node_id="d", visitor_input="tomorrow")
    assert bad_date.current_node_id == "d"
    good_date = await run(definition, services=make_services(), conversation_id="c1", variables=accepted.variables, current_node_id="d", visitor_input="2026-10-01")
    assert good_date.status == "closed"
    assert good_date.messages[-1]["content"] == "ok Priya 2026-10-01"
```

Append to `test_conversations_api.py`:

```python
CHOICE_FLOW = {
    "nodes": [
        {"id": "s", "type": "start", "position": {"x": 0, "y": 0}, "data": {}},
        {"id": "c", "type": "choice", "position": {"x": 0, "y": 0}, "data": {"prompt": "Pick", "options": "A\nB"}},
        {"id": "i", "type": "message", "position": {"x": 0, "y": 0}, "data": {"message": "https://example.com/a.png"}},
        {"id": "e", "type": "end", "position": {"x": 0, "y": 0}, "data": {}},
    ],
    "edges": [
        {"id": "e1", "source": "s", "target": "c"},
        {"id": "e2", "source": "c", "target": "i"},
        {"id": "e3", "source": "i", "target": "e"},
    ],
    "viewport": {"x": 0, "y": 0, "zoom": 1},
}


async def test_message_meta_round_trips_through_widget_and_dashboard(client):
    headers = await _auth(client, "meta@x.com", "Acme")
    chatbot_id = await _published_chatbot(client, headers, flow=CHOICE_FLOW)
    started = (await client.post("/api/v1/widget/conversations", json={"chatbot_id": chatbot_id})).json()["data"]
    assert started["messages"][-1]["meta"] == {"options": ["A", "B"], "multiple": False}

    widget = {"Authorization": f"Bearer {started['token']}"}
    turn = await client.post(
        f"/api/v1/widget/conversations/{started['conversation']['id']}/messages", json={"content": "A"}, headers=widget
    )
    bot = [m for m in turn.json()["data"]["messages"] if m["role"] == "bot"]
    assert bot[0]["meta"] == {"kind": "image", "url": "https://example.com/a.png"}

    transcript = await client.get(f"/api/v1/conversations/{started['conversation']['id']}", headers=headers)
    assert transcript.json()["data"]["messages"][0]["meta"]["options"] == ["A", "B"]  # the choice prompt is the first message
```

Run both files → FAIL on missing `meta`.

- [ ] **Step 2: Migration, model, repository**

Create `backend/alembic/versions/0010_message_meta.py`:

```python
"""Structured payload on conversation messages (options, media, input type).

Revision ID: 0010_message_meta
Revises: 0009_superadmin
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0010_message_meta"
down_revision = "0009_superadmin"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "conversation_messages",
        sa.Column("meta", postgresql.JSONB(), server_default=sa.text("'{}'::jsonb"), nullable=False),
    )


def downgrade() -> None:
    op.drop_column("conversation_messages", "meta")
```

`models.py` (`ConversationMessage`): add `meta: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))` (import `text` from sqlalchemy and `JSONB` from `sqlalchemy.dialects.postgresql` if not present).

`repository.py` `append_message`: add parameter `meta: dict[str, Any] | None = None` and pass `meta=meta or {}` to the constructor.

`router.py`: `_message_data` adds `"meta": message.meta`; `_persist_turn` passes `meta=item.get("meta")`.

- [ ] **Step 3: Engine changes**

In `engine.py`:

(a) Add helpers after `_validate_input`:

```python
_URL_PATTERN = re.compile(r"^https?://\S+$")
_IMAGE_SUFFIXES = (".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg")
_VIDEO_HINTS = ("youtube.com/", "youtu.be/", ".mp4", ".webm", "vimeo.com/")
_DATE_FORMATS = ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%m/%d/%Y", "%Y-%m-%dT%H:%M")


def _message_meta(data: dict[str, Any], text: str) -> dict[str, Any]:
    kind = str(data.get("kind", "") or "").lower()
    lone_url = text.strip() if _URL_PATTERN.match(text.strip() or "") else ""
    if kind in ("image", "video", "link"):
        return {"kind": kind, "url": lone_url or text.strip()}
    if not lone_url:
        return {}
    lowered = lone_url.lower().split("?")[0]
    if lowered.endswith(_IMAGE_SUFFIXES):
        return {"kind": "image", "url": lone_url}
    if any(hint in lone_url.lower() for hint in _VIDEO_HINTS):
        return {"kind": "video", "url": lone_url}
    return {"kind": "link", "url": lone_url}


def _is_multiple(data: dict[str, Any]) -> bool:
    return str(data.get("mode", "")).lower() == "multiple" or data.get("multiple") in (True, "true", "yes")
```

and extend `_validate_input`:

```python
    if kind == "name":
        return len(value.strip()) >= 2 and any(ch.isalpha() for ch in value) and not any(ch.isdigit() for ch in value)
    if kind == "date":
        from datetime import datetime

        return any(_parses(value.strip(), fmt) for fmt in _DATE_FORMATS)
```

with

```python
def _parses(value: str, fmt: str) -> bool:
    from datetime import datetime

    try:
        datetime.strptime(value, fmt)
    except ValueError:
        return False
    return True
```

(b) `emit` gains a `meta` argument:

```python
    def emit(content: str, node_id: str | None, role: str = "bot", meta: dict[str, Any] | None = None) -> None:
        if content:
            result.messages.append({"role": role, "content": content, "node_id": node_id, "meta": meta or {}})
```

(c) Wait-node prompt block:

```python
        if node_type in WAIT_NODES:
            prompt = interpolate(str(data.get("prompt", "")) or "Please enter a value", result.variables)
            meta: dict[str, Any] = {}
            if node_type == "choice":
                options = _choice_options(node)
                if options:
                    prompt = prompt + "\n" + "\n".join(f"{i + 1}. {o}" for i, o in enumerate(options))
                meta = {"options": options, "multiple": _is_multiple(data)}
            elif node_type == "input":
                meta = {"inputType": str(data.get("inputType", "text") or "text")}
            emit(prompt, node["id"], meta=meta)
            result.current_node_id = node["id"]
            return result
```

(d) Message node: `text = interpolate(str(data.get("message", "")), result.variables); emit(text, node["id"], meta=_message_meta(data, text))`.

(e) In `_consume_wait_node`, the `stay` helper appends `"meta": {}`; replace the `choice` branch with:

```python
    if node_type == "choice":
        options = _choice_options(node)

        def match(token: str) -> int | None:
            token = token.strip()
            for index, option in enumerate(options):
                if token.lower() == option.lower() or token == str(index + 1):
                    return index
            return None

        if _is_multiple(data):
            picks = [match(part) for part in answer.split(",") if part.strip()]
            if not picks or any(pick is None for pick in picks):
                stay("Please pick one or more of the listed options, separated by commas.")
                return None
            chosen_list = [options[i] for i in sorted({p for p in picks if p is not None})]
            result.variables[str(data.get("variable", "") or "choice")] = ", ".join(chosen_list)
            return flow.follow(node["id"])

        chosen_index = match(answer)
        if chosen_index is None:
            stay("Please pick one of the listed options.")
            return None
        chosen = options[chosen_index]
        result.variables[str(data.get("variable", "") or "choice")] = chosen
        return flow.follow_labelled(node["id"], chosen, chosen_index)
```

Run: `.venv\Scripts\alembic.exe upgrade head` then `pytest app/slices/conversations -v` → PASS.

- [ ] **Step 4: Widget renders meta**

In `widget.js` replace `render(role, content)` and `take` with:

```js
  var VIDEO_EMBED = /(?:youtube\.com\/watch\?v=|youtu\.be\/)([A-Za-z0-9_-]{6,})/;

  function render(role, content, meta) {
    meta = meta || {};
    var el = document.createElement("div");
    el.className = "wcb-msg " + role;
    if (meta.kind === "image" && meta.url) {
      var img = document.createElement("img");
      img.src = meta.url; img.alt = content; img.className = "wcb-media";
      el.appendChild(img);
    } else if (meta.kind === "video" && meta.url) {
      var yt = VIDEO_EMBED.exec(meta.url);
      if (yt) {
        var frame = document.createElement("iframe");
        frame.src = "https://www.youtube.com/embed/" + yt[1]; frame.className = "wcb-media"; frame.allowFullscreen = true;
        el.appendChild(frame);
      } else {
        var video = document.createElement("video");
        video.src = meta.url; video.controls = true; video.className = "wcb-media";
        el.appendChild(video);
      }
    } else if (meta.kind === "link" && meta.url) {
      var a = document.createElement("a");
      a.href = meta.url; a.target = "_blank"; a.rel = "noopener"; a.textContent = content;
      el.appendChild(a);
    } else {
      el.textContent = content;
    }
    log.appendChild(el);
    if (meta.options && meta.options.length) renderOptions(meta.options, !!meta.multiple);
    if (meta.inputType) setInputType(meta.inputType);
    log.scrollTop = log.scrollHeight;
  }

  function setInputType(kind) {
    var map = { email: "email", number: "number", phone: "tel", date: "date" };
    input.type = map[kind] || "text";
  }

  function renderOptions(options, multiple) {
    var row = document.createElement("div");
    row.className = "wcb-options";
    var selected = [];
    options.forEach(function (label) {
      var b = document.createElement("button");
      b.type = "button"; b.className = "wcb-opt"; b.textContent = label;
      b.addEventListener("click", function () {
        if (!multiple) { row.remove(); send(label); return; }
        b.classList.toggle("wcb-opt-on");
        var i = selected.indexOf(label);
        if (i >= 0) selected.splice(i, 1); else selected.push(label);
      });
      row.appendChild(b);
    });
    if (multiple) {
      var done = document.createElement("button");
      done.type = "button"; done.className = "wcb-opt wcb-opt-done"; done.textContent = "Done";
      done.addEventListener("click", function () { if (selected.length) { row.remove(); send(selected.join(", ")); } });
      row.appendChild(done);
    }
    log.appendChild(row);
  }

  function take(messages) {
    (messages || []).forEach(function (m) {
      if (m.ordinal > state.lastOrdinal) state.lastOrdinal = m.ordinal;
      render(m.role, m.content, m.meta);
    });
  }
```

Extract the body of the form's submit handler into `function send(content) { ... }` (everything after `input.value = "";`), have the submit handler call `send(content)` after the guard, and make `send` call `setInputType("text")` before rendering the visitor bubble. Add CSS to the `css` string:

```
.wcb-media{max-width:100%;border-radius:8px;display:block}iframe.wcb-media{width:100%;aspect-ratio:16/9;border:0}
.wcb-options{display:flex;flex-wrap:wrap;gap:6px;align-self:flex-start;max-width:90%}
.wcb-opt{border:1px solid ACCENT;color:ACCENT;background:#fff;border-radius:999px;padding:6px 12px;font-size:12px;cursor:pointer}
.wcb-opt-on,.wcb-opt-done{background:ACCENT;color:#fff}
```

(build the string with `+ ACCENT +` in place of the `ACCENT` tokens, as the existing rules do; `applyDesign` from Task 4 must also override `.wcb-opt` colours in its `overrides` stylesheet.)

- [ ] **Step 5: Dashboard side**

`frontend/src/entities/conversation/types.ts`: add

```ts
export interface MessageMeta { kind?: "image" | "video" | "link"; url?: string; options?: string[]; multiple?: boolean; inputType?: string; }
```

and `meta?: MessageMeta;` on `ConversationMessage`.

Create `frontend/src/features/conversations-inbox/MessageBody.tsx` (used by both the transcript and the simulator):

```tsx
import type { ConversationMessage } from "../../entities/conversation";

const YT = /(?:youtube\.com\/watch\?v=|youtu\.be\/)([A-Za-z0-9_-]{6,})/;

export function MessageBody({ message }: { message: ConversationMessage }) {
  const meta = message.meta ?? {};
  if (meta.kind === "image" && meta.url) return <img src={meta.url} alt={message.content} className="msg-media" />;
  if (meta.kind === "video" && meta.url) {
    const yt = YT.exec(meta.url);
    return yt ? <iframe className="msg-media" src={`https://www.youtube.com/embed/${yt[1]}`} title={message.content} allowFullScreen /> : <video className="msg-media" src={meta.url} controls />;
  }
  if (meta.kind === "link" && meta.url) return <a href={meta.url} target="_blank" rel="noopener noreferrer">{message.content}</a>;
  return (
    <>
      <span style={{ whiteSpace: "pre-wrap" }}>{message.content}</span>
      {meta.options?.length ? <div className="msg-options">{meta.options.map((o) => <span key={o} className="preview-opt-pill">{o}</span>)}</div> : null}
    </>
  );
}
```

Use `<MessageBody message={message} />` in place of `{message.content}` inside `ConversationTranscript.tsx`'s `.transcript-bubble` and inside `WidgetEmbedDialog.tsx`'s `.sim-text`. In the simulator, additionally render clickable option buttons: when the last message has `meta.options`, show `<button>`s that call the same `sendTestMessage` path with the option text (extract the send logic into `sendText(text: string)` and have the form call it). CSS: `.msg-media { max-width: 320px; border-radius: 8px; display: block; } iframe.msg-media { width: 320px; aspect-ratio: 16/9; border: 0; } .msg-options { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }`.

- [ ] **Step 6: Builders declare the new fields**

`catalog.ts`: message node adds `{ key: "kind", label: "Content type", kind: "select", options: ["text", "image", "video", "link"] }` with default `kind: "text"`; choice node adds `{ key: "mode", label: "Selection", kind: "select", options: ["single", "multiple"] }` with default `mode: "single"` and `{ key: "variable", label: "Save as" }` default `"choice"`; input node's `inputType` options become `["text", "name", "email", "phone", "number", "date"]`.

`ComponentLibraryModal.tsx` `defaultData`: Image/GIF → `{ label: "Image", kind: "image", message: "https://example.com/banner.png" }`; Video → `kind: "video"`; Web Link → `kind: "link"`; Multiple Choice → add `mode: "multiple", variable: "choices"`; Name keeps `inputType: "name"`; Appointment → `nodeType: "input"` with `{ label: "Appointment", prompt: "Choose a convenient date:", variable: "appointment_date", inputType: "date" }`; File stays a `question`.

`ClassicBuilder.tsx`: the same four `defaultData` changes for its Image/GIF, Video, Web Link, and Multiple Choice buttons, and Appointment becomes `handleAddComponent("input", {..., inputType: "date"})`.

- [ ] **Step 7: Verify end to end, commit**

Apply the "Lead capture" template, add an Image/GIF step with a real image URL, publish, open `/demo?chatbot_id=…`: options render as buttons, the email step switches the input to an email field, the image shows inline. Inbox transcript shows the same image and option pills. `pytest app/slices/conversations`, `npm run typecheck`.

```powershell
git add backend frontend/src
git commit -m "feat(conversations): structured message meta — option buttons, media, typed inputs, multiple choice"
```

---

### Task 20: The widget matches the Chatbot Design page completely, and the design preview runs the real flow

Task 4 applied colour, title, size and position. Still ignored: avatar (preset or uploaded), classic vs modern style, mobile position, resize handle, the greeting, the launcher teaser, and the design page's own preview which fakes replies. This task closes every control on that page.

**Semantics decided for the two text fields the flow does not own:**
- **Welcome Message** → *greeting*: rendered inside the widget the moment it opens, before the flow's first message. It is not stored as a conversation message.
- **First Prompt Question** → *launcher teaser*: a small speech bubble beside the chat button on the customer page, dismissed when the widget opens. The design page labels are renamed to say exactly this.

**Files:**
- Modify: `backend/app/static/widget.js`
- Modify: `backend/app/slices/chatbots/schemas.py` (`design` size guard)
- Create: `frontend/src/features/widget-embed/use-widget-simulator.ts`
- Modify: `frontend/src/features/widget-embed/WidgetEmbedDialog.tsx`, `frontend/src/pages/design/ChatbotDesignPage.tsx`, `frontend/src/features/flow-editor/model/flow-schema.ts`, `frontend/src/styles.css`
- Test: `backend/app/slices/chatbots/tests/test_schemas.py`

- [ ] **Step 1: Cap the design payload (a data-URL avatar lives in it)**

Append to `backend/app/slices/chatbots/tests/test_schemas.py`:

```python
import pytest
from pydantic import ValidationError


def test_design_blob_is_capped_at_300kb():
    from app.slices.chatbots.schemas import FlowDocument

    base = {"nodes": [{"id": "s", "type": "start", "position": {"x": 0, "y": 0}, "data": {}}], "edges": []}
    FlowDocument(**base, design={"customAvatarUrl": "x" * 250_000})
    with pytest.raises(ValidationError):
        FlowDocument(**base, design={"customAvatarUrl": "x" * 400_000})
```

In `schemas.py` `FlowDocument.validate_graph`, add at the end (before `return self`):

```python
        import json

        if len(json.dumps(self.design)) > 300_000:
            raise ValueError("design settings are too large (keep the avatar under 200 KB)")
```

Run `pytest app/slices/chatbots/tests/test_schemas.py` → PASS.

- [ ] **Step 2: widget.js — full design**

Replace `applyDesign` (Task 4) with this superset and add the greeting/teaser plumbing:

```js
  var AVATARS = { ambot: "A", avatar1: "👨‍💼", avatar2: "🧔", avatar3: "🧑‍🦱", avatar4: "👨‍💻", robot: "🤖" };
  var design = {};

  function avatarNode(d) {
    var wrap = document.createElement("span");
    wrap.className = "wcb-avatar";
    if (d.selectedAvatar === "custom" && d.customAvatarUrl) {
      var img = document.createElement("img"); img.src = d.customAvatarUrl; img.alt = "";
      wrap.appendChild(img);
    } else {
      wrap.textContent = AVATARS[d.selectedAvatar] || AVATARS.ambot;
    }
    return wrap;
  }

  function applyDesign(d) {
    design = d || {};
    var accent = design.themeColor || ACCENT;
    var classic = design.styleMode === "classic";
    head.style.background = classic ? "#ffffff" : accent;
    head.style.color = classic ? "#1c1c28" : "#ffffff";
    head.style.borderBottom = classic ? "1px solid #e6e6ef" : "none";
    bubble.style.background = accent;
    sendButton.style.color = accent;
    overrides.textContent =
      ".wcb-msg.visitor{background:" + accent + "}.wcb-msg.agent{border-color:" + accent + "}" +
      ".wcb-opt{border-color:" + accent + ";color:" + accent + "}.wcb-opt-on,.wcb-opt-done{background:" + accent + ";color:#fff}" +
      ".wcb-avatar{background:" + (classic ? accent : "rgba(255,255,255,.25)") + "}" +
      "@media (max-width:480px){.wcb-root{left:" + (design.positionMobile === "left" ? "16px" : "auto") + ";right:" + (design.positionMobile === "left" ? "auto" : "16px") + "}}";
    if (design.chatBgColor) log.style.background = design.chatBgColor;
    if (design.fontFamily) root.style.fontFamily = design.fontFamily;
    if (design.botTitle) title.textContent = design.botTitle;
    subtitle.textContent = design.botStatusText || "";
    if (design.inputPlaceholder) input.placeholder = design.inputPlaceholder;
    var headAvatar = head.querySelector(".wcb-avatar");
    if (headAvatar) headAvatar.remove();
    head.insertBefore(avatarNode(design), head.firstChild);
    bubble.innerHTML = "";
    bubble.appendChild(design.selectedAvatar === "custom" && design.customAvatarUrl ? avatarNode(design) : document.createTextNode("💬"));
    if (design.positionWeb === "left") {
      root.style.right = "auto"; root.style.left = "20px"; panel.style.right = "auto"; panel.style.left = "0";
    } else if (design.positionWeb === "center") {
      root.style.right = "auto"; root.style.left = "50%"; root.style.transform = "translateX(-50%)";
      panel.style.right = "auto"; panel.style.left = "50%"; panel.style.transform = "translateX(-50%)";
    }
    var size = design.windowSize === "Custom" ? [design.customWidth || 360, design.customHeight || 520] : SIZES[design.windowSize];
    if (size) { panel.style.width = size[0] + "px"; panel.style.height = size[1] + "px"; }
    panel.style.resize = design.enableResize ? "both" : "none";
    panel.style.overflow = design.enableResize ? "auto" : "hidden";
    showTeaser(design.followUpQuestion);
  }

  var teaser = document.createElement("div");
  teaser.className = "wcb-teaser";
  teaser.hidden = true;
  root.appendChild(teaser);
  function showTeaser(text) {
    if (!text || state.open) { teaser.hidden = true; return; }
    teaser.textContent = text;
    teaser.hidden = false;
  }
```

Add CSS rules to the `css` string: `.wcb-avatar{width:28px;height:28px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;margin-right:10px;overflow:hidden;font-size:14px;font-weight:700}.wcb-avatar img{width:100%;height:100%;object-fit:cover}.wcb-teaser{position:absolute;bottom:68px;right:0;background:#fff;color:#1c1c28;border:1px solid #e6e6ef;border-radius:12px;padding:8px 12px;font-size:13px;box-shadow:0 6px 20px rgba(0,0,0,.15);max-width:240px;cursor:pointer}`. Make the teaser open the widget on click (same handler as the bubble). In `start()`, before the request, `if (design.welcomeMessage) render("bot", design.welcomeMessage, {});` and after `log.innerHTML = ""` on success re-render the greeting first, then `take(...)`. In the bubble click handler call `showTeaser(design.followUpQuestion)` after toggling so the teaser hides on open and returns on close. Bot bubbles show the avatar: in `render`, when `role === "bot"`, prepend `avatarNode(design)` inside a wrapper `div.wcb-row` (flex, gap 6px) around the bubble.

- [ ] **Step 3: One simulator hook, used twice**

Create `frontend/src/features/widget-embed/use-widget-simulator.ts`:

```ts
import { useCallback, useState } from "react";

import { conversationApi, type ConversationMessage, type ConversationStatus } from "../../entities/conversation";

export function useWidgetSimulator(chatbotId: string | null) {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [status, setStatus] = useState<ConversationStatus>("active");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = useCallback(async () => {
    if (!chatbotId) return;
    setBusy(true); setError(null); setMessages([]);
    try {
      const res = await conversationApi.widgetStart(chatbotId);
      setConversationId(res.conversation.id); setToken(res.token); setMessages(res.messages); setStatus(res.conversation.status);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start. Is the chatbot published?");
    } finally { setBusy(false); }
  }, [chatbotId]);

  const send = useCallback(async (text: string) => {
    if (!conversationId || !token || !text.trim() || busy || status === "closed") return;
    const optimistic: ConversationMessage = { id: `tmp-${Date.now()}`, ordinal: Number.MAX_SAFE_INTEGER, role: "visitor", content: text, created_at: new Date().toISOString() };
    setMessages((prev) => [...prev, optimistic]);
    setBusy(true);
    try {
      const turn = await conversationApi.widgetSend(conversationId, token, text);
      setStatus(turn.status);
      setMessages((prev) => [...prev.filter((m) => m.id !== optimistic.id), ...turn.messages]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Send failed");
    } finally { setBusy(false); }
  }, [busy, conversationId, status, token]);

  const poll = useCallback(async () => {
    if (!conversationId || !token || status !== "handoff") return;
    const last = messages.reduce((m, x) => (x.ordinal < Number.MAX_SAFE_INTEGER && x.ordinal > m ? x.ordinal : m), 0);
    const res = await conversationApi.widgetPoll(conversationId, token, last);
    if (res.messages.length) setMessages((prev) => [...prev, ...res.messages]);
    setStatus(res.status);
  }, [conversationId, messages, status, token]);

  return { messages, status, busy, error, started: Boolean(conversationId), start, send, poll };
}
```

Refactor `WidgetEmbedDialog.tsx` to use the hook (delete its local `convId/widgetToken/messages/botStatus/sending` state and `startSimulator/sendTestMessage`; keep the markup). Add a 2-second `setInterval` effect that calls `poll` while `status === "handoff"`.

- [ ] **Step 4: Design page uses the real flow and the new labels**

In `ChatbotDesignPage.tsx`:
- `const sim = useWidgetSimulator(selectedChatbot?.id ?? null);`
- Replace `handleSendSim`: if `selectedChatbot?.status !== "published"`, `toast.error("Publish the chatbot to test the real flow in the preview")` and return; otherwise `if (!sim.started) await sim.start(); await sim.send(text)`.
- Replace `handleResetPreview` with `sim.start()` (published) or resetting to the greeting only.
- Derive `simMessages` from the hook instead of local state: `[{ role: "bot", text: welcomeMessage }, ...sim.messages.map((m) => ({ role: m.role === "visitor" ? "user" : "bot", text: m.content, meta: m.meta }))]`; remove `handleWelcomeChange`/`handleQuestionChange` message surgery (plain `setWelcomeMessage`/`setFollowUpQuestion`). Render `MessageBody` for bot bubbles with meta (import from `../../features/conversations-inbox/MessageBody`) and render option buttons that call `sim.send(option)`.
- Show `isBotTyping` as `sim.busy`.
- Render the teaser in the website preview: a small bubble with `followUpQuestion` next to the minimised launcher.
- Labels: "Welcome Message" → "Greeting (shown when the widget opens, before the flow starts)"; "First Prompt Question" → "Launcher teaser (bubble beside the chat button)".
- Avatar upload: reject files over 200 KB with `toast.error("Avatar must be under 200 KB")`.
- The header of the preview shows `selectedChatbot.status !== "published"` as a hint pill "Preview only — publish to chat with the real flow".

`flow-schema.ts`: add `design: z.record(z.string(), z.unknown()).optional(),` to `flowDocumentSchema` so importing a JSON export keeps design settings.

- [ ] **Step 5: Verify, commit**

Design page: pick the robot avatar, classic style, left position, size L, greeting "Hi there", teaser "Need help?", save. Customer page: teaser beside the button, robot avatar in launcher and header, white classic header, left side, "Hi there" greeting, then the flow's first message. Design preview: type an answer, the real flow replies (published bot). `pytest app/slices/chatbots`, `npm run typecheck`.

```powershell
git add backend frontend/src
git commit -m "feat(design): widget honours every design control; preview runs the real flow"
```

---

### Task 21: Classic builder — advanced fields, per-option routing, reorder, delete, and debounced saves

The classic (three-column) builder can add steps, edit their text, and pick "next step". It cannot delete or reorder a step, its Advanced tab is empty, a choice cannot route per option, and every keystroke saves a new flow version (the `onUpdateFlow` handler calls `saveMutation.mutate` immediately).

**Files:**
- Modify: `frontend/src/pages/builder/BuilderPage.tsx`, `frontend/src/features/classic-builder/ClassicBuilder.tsx`, `frontend/src/styles.css`

- [ ] **Step 1: Debounced save in the builder page**

In `BuilderPage.tsx`, replace the classic `onUpdateFlow` with a debounced version:

```tsx
  const pendingSave = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queueSave = (doc: FlowDocument) => {
    graph.load(doc);
    if (pendingSave.current) clearTimeout(pendingSave.current);
    pendingSave.current = setTimeout(() => saveMutation.mutate(doc), 900);
  };
  useEffect(() => () => { if (pendingSave.current) clearTimeout(pendingSave.current); }, []);
```

(`import { useEffect, useRef, useState } from "react"`), pass `onUpdateFlow={queueSave}`, and show a save state in the classic header via a new `saveState` prop: `saveMutation.isPending ? "saving" : graph.dirty ? "unsaved" : "saved"`.

- [ ] **Step 2: Classic builder capabilities**

In `ClassicBuilder.tsx`:

(a) Props: add `saveState: "saving" | "unsaved" | "saved"` and `readOnly?: boolean` (from Task 18). Show `saveState` as a pill in `classic-actions-group`.

(b) Step actions on each stream card (visible on hover / when selected): ↑ ↓ 🗑. Handlers:

```tsx
  const moveNode = (id: string, direction: -1 | 1) => {
    const index = nodes.findIndex((n) => n.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= nodes.length || nodes[target].type === "start") return;
    const next = [...nodes];
    [next[index], next[target]] = [next[target], next[index]];
    onUpdateFlow({ ...flowDoc, nodes: next });
  };

  const deleteNode = (id: string) => {
    const node = nodes.find((n) => n.id === id);
    if (!node || node.type === "start") return;
    if (!window.confirm(`Delete step "${String(node.data?.label ?? node.type)}"?`)) return;
    onUpdateFlow({ ...flowDoc, nodes: nodes.filter((n) => n.id !== id), edges: edges.filter((e) => e.source !== id && e.target !== id) });
    if (selectedNodeId === id) setSelectedNodeId(nodes[0]?.id ?? "");
  };
```

Reordering changes the *display* order only; routing is explicit through edges, so the step numbers in the "Go to" dropdown update but the flow is unchanged — say so in a hint under the list.

(c) Advanced tab renders the catalogue fields generically (the same source the visual builder uses, so both editors always agree):

```tsx
import { NODE_DEFINITIONS } from "../flow-editor/model/catalog";
…
{customizeTab === "advanced" && selectedNode && (
  <div className="customize-fields-stack">
    {NODE_DEFINITIONS[selectedNode.type].fields.filter((f) => f.key !== "label").map((field) => (
      <div key={field.key} className="cust-field-group">
        <label className="cust-label">{field.label}</label>
        {field.kind === "textarea" ? (
          <textarea className="cust-textarea" rows={4} value={String(selData[field.key] ?? "")} onChange={(e) => handleUpdateSelected({ [field.key]: e.target.value })} />
        ) : field.kind === "select" ? (
          <select className="cust-dropdown" value={String(selData[field.key] ?? "")} onChange={(e) => handleUpdateSelected({ [field.key]: e.target.value })}>
            {field.options?.map((o) => <option key={o} value={o}>{o.replaceAll("_", " ")}</option>)}
          </select>
        ) : (
          <input className="cust-input" type={field.kind === "number" ? "number" : "text"} value={String(selData[field.key] ?? "")} onChange={(e) => handleUpdateSelected({ [field.key]: field.kind === "number" ? Number(e.target.value) : e.target.value })} />
        )}
      </div>
    ))}
    <Routing />
  </div>
)}
```

where `Routing` is an inline section:
- for `choice`: one "Go to" dropdown per option line, writing/replacing the edge whose `label` equals that option (`edges.filter(e => !(e.source === id && e.label === option))` then push `{id: \`e_${id}_${slug}\`, source: id, target, label: option}`); options without a specific route fall back to the generic "Go to next message" edge (unlabelled).
- for `condition`: two dropdowns "If true → " / "If false → " writing edges labelled `true` / `false`.
- everything else: the existing single "Go to next message" dropdown (moved here from the Customize tab; the Customize tab keeps only the message/prompt text, options, and variable).

(d) `handleSetNextTarget` for the generic edge must only touch **unlabelled** edges: `edges.filter((e) => !(e.source === selectedNode.id && !e.label))`.

- [ ] **Step 3: Verify, commit**

Build the support-handoff flow entirely in the classic builder: choice "Billing / Technical / Other" with Technical → HTTP step and the others → Handoff; condition with true/false targets; delete a step; move a step. Switch to the visual builder: the labelled edges appear on the canvas. Saves happen once per pause, not per keystroke (watch the History tab). `npm run typecheck`.

```powershell
git add frontend/src
git commit -m "feat(classic-builder): advanced fields, per-option routing, reorder, delete, debounced save"
```

---

## Part F — Your accounts

### Task 22: Seed the professor's accounts and update the walkthrough

Accounts to exist after seeding (passwords live only in the seed script and the README's demo table):

| Account | Password | What it is |
|---|---|---|
| `admin@admin.com` | `AdminPassword123!` | platform **superadmin** (also owner of a private "Platform / Admin" workspace so login works) |
| `rohithnewman@gmail.com` — name **rogith** | `Rogith@12345` *(assumption: no password was given; change `OWNER_PASSWORD` in the script if you want another)* | **owner** of organisation **Rogith** (org admin), workspace "Default", plus a second workspace "Sales" |
| `agent@rogith.test` | `AgentPass123` | **member** in Rogith / Default — the live agent for the handoff demo |
| `viewer@rogith.test` | `ViewerPass123` | **viewer** in Rogith / Default — shows the read-only UI |
| `demo@northwind.example` | `DemoPass123` | owner of a second organisation, **Northwind Outdoor**, so the superadmin console lists more than one tenant |

**Files:**
- Modify: `backend/scripts/seed_demo.py`, `README.md`, `docs/DEMO_WALKTHROUGH.md`

- [ ] **Step 1: Seed script**

In `backend/scripts/seed_demo.py`:

(a) Replace the constants block with:

```python
SUPERADMIN_EMAIL = "admin@admin.com"
SUPERADMIN_PASSWORD = "AdminPassword123!"

OWNER_EMAIL = "rohithnewman@gmail.com"
OWNER_PASSWORD = "Rogith@12345"
OWNER_NAME = "rogith"
OWNER_ORG = "Rogith"

AGENT_EMAIL = "agent@rogith.test"
AGENT_PASSWORD = "AgentPass123"
VIEWER_EMAIL = "viewer@rogith.test"
VIEWER_PASSWORD = "ViewerPass123"

NORTHWIND_EMAIL = "demo@northwind.example"
NORTHWIND_PASSWORD = "DemoPass123"
```

(b) At the top of `main()`, before any HTTP call, create the superadmin directly in the database:

```python
    import asyncio

    from scripts.create_superadmin import ensure as ensure_superadmin

    asyncio.run(ensure_superadmin(SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD, "Platform Admin"))
```

(c) Turn the "register or log in" block into a helper `def session_for(email, password, name, org) -> dict` and call it for the Rogith owner (this is the `tokens`/`headers` used by the rest of the script) and, at the end, once for Northwind (register only; no bots needed — its existence is the point).

(d) Members: add the agent (`role: "member"`) and the viewer (`role: "viewer"`) with the same idempotent check as before.

(e) After the bots, create the second workspace if missing: `GET /organization` → if no workspace named "Sales", `POST /organization/workspaces {"name": "Sales"}`.

(f) The final printout lists every account from the table above with its role, plus the three demo URLs.

- [ ] **Step 2: README demo table**

Replace the "Demo data" section's account line with the five-row table above (with passwords, since this is a local demo build) and add:

```
Superadmin console: log in as admin@admin.com → the shield icon in the left rail.
Organisation admin: log in as rohithnewman@gmail.com → Settings → Organisation (rename, add workspaces, switch).
Workspace roles: agent@rogith.test (member) can build and reply; viewer@rogith.test sees a read-only dashboard.
```

- [ ] **Step 3: Walkthrough additions**

In `docs/DEMO_WALKTHROUGH.md` insert after section 2:

```markdown
## 2a. Three levels of administration (1 min)
- Log in as **admin@admin.com** (superadmin): Admin → Overview shows every organisation, workspace, user, bot and conversation on the platform; Organisations tab changes Rogith's plan to "pro"; Users tab can deactivate an account. Point out: the superadmin sees *metadata*, never a tenant's conversations.
- Log in as **rohithnewman@gmail.com** (organisation owner): Settings → Organisation lists "Default" and "Sales"; switch to Sales with the dropdown in the rail — the chatbot list is empty because workspaces isolate data; switch back.
- Settings → Team: the agent is a *member*, the viewer is a *viewer*. Open a private window as **viewer@rogith.test**: the builder shows the read-only banner, the Inbox has no reply box.
```

and in section 7 add: "Choose an option by clicking a button instead of typing; the email step switches the keyboard to an email field; the image step renders inline."

- [ ] **Step 4: Run the whole seed on a clean database, commit**

Drop and recreate `webchatbots`, `alembic upgrade head`, start the three processes, run `python -m scripts.seed_demo`, log in as each of the five accounts and confirm what the table says.

```powershell
git add backend/scripts/seed_demo.py README.md docs/DEMO_WALKTHROUGH.md
git commit -m "feat(demo): seed superadmin, organisation owner, agent, viewer and a second tenant"
```

Task 13 (full verification and dress rehearsal) is then run **last**, after Task 22.

---

## Self-review addendum (Parts D–F)

**Coverage.** Superadmin → Tasks 14, 15. Organisation admin (rename, workspaces, switch) → Tasks 16, 17. Workspace roles surfaced in the UI → Tasks 6, 18. Chat-flow execution: every component the classic builder and component library offer now executes with its intended behaviour (image/video/link → rendered media; single/multiple choice → buttons; name/email/phone/number/date → validated typed inputs; appointment → date input; condition/choice routing → labelled edges editable in both builders) → Tasks 19, 21. Chatbot Design page: every control (style, avatar incl. upload, theme and background colour, font, web and mobile position, size incl. custom, resize, title, status text, greeting, teaser, placeholder) reaches the widget, and the preview runs the real engine → Tasks 4, 20. "Landing Page Bot" remains a preview layout only; the widget has one embed mode — stated in Task 20.

**Placeholders.** None. Where a task edits an existing block by description (Task 18, Task 20 Step 4), the exact prop names, hook names and toast strings are given.

**Type consistency.** `identity_api.UserSummary` fields are appended (`full_name`, `is_superadmin`, `created_at`) with defaults so every earlier constructor call still compiles. `tenancy_api.WorkspaceView` gains `organization_id` in Task 16 and its single constructor (`get_workspace`) is updated in the same step. `useMe()` returns `{ me, can }` and is consumed with exactly those names in Tasks 15, 17, 18. `useWidgetSimulator` returns `{ messages, status, busy, error, started, start, send, poll }` and Task 20 uses only those. Message `meta` keys are identical in the engine (`_message_meta`, wait-node block), `MessageMeta` (TypeScript), `widget.js` `render`, and `MessageBody`. `auth-store.ts` moves to `entities/session/` in Task 15 Step 1; every later import path uses the new location.

---

## Self-review against the specs

**Coverage.** Architecture §5: Phase 1a ✔ (existing); 1b → Task 6 (workspace + members; organisation CRUD and invites-by-email are deliberately left out — the demo needs one workspace); 1c → Tasks 3, 10; Phase 2 ✔ + Task 8 (restore, import/export); Phase 3 §6 extraction → Task 2, §9 credential UI → Task 3; Phase 4 §6 install → Tasks 4, 11; Phase 5 analytics → Task 5, audit viewer → Task 7. Not done, on purpose: subscriptions/billing and API-key management (Phase 5) — nothing in the demo exercises them and they add no architectural point not already shown; pgvector and WebSockets stay as the documented amendments.

**Placeholders.** None: every step has its code. The one "check before changing" note (Task 6 Step 6, login fallback) names the exact file and function.

**Type consistency.** `DashboardShell` props (`title, subtitle?, actions?, children`) are identical in Tasks 3, 5, 10. `SettingsTab` grows `"providers"` → `"providers" | "team"` → `"providers" | "team" | "activity"` in Tasks 3, 6, 7 with the full file shown at each change. `tenancy_api.list_memberships` returns `MemberRow(user_id, role_name, joined_at)` and is consumed with exactly those attributes in `members/router.py`. `identity_api.list_users` returns `dict[uuid.UUID, UserSummary]` and is indexed by `entry.actor_id` in `audit/router.py` and by `row.user_id` in `members/router.py`. `chatbots_api.list_names` returns `dict[uuid.UUID, str]` and analytics indexes it by `chatbot_id` from `counts_by_chatbot`. `ChatbotSubNav`'s new `onOpenTemplates` prop is optional, so `BuilderPage` compiles before and after Task 9 Step 3.
