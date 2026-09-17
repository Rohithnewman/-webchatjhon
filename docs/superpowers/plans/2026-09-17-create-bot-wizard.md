# Create-bot Wizard, Install Verification and Internal Rename — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make bot creation follow the Ambot365 guide's four-stage path (Select Platform › Usecase › Setup Bot › Install Bot), add server-side install verification with a public full-page chat route, and let users rename a bot's internal name from the list.

**Architecture:** Backend adds six columns to `chatbots`, one verify endpoint backed by a small `install.py` module (URL guard, bounded fetch, page inspection), and a `/chat/{id}` HTML route that loads the widget in a new `fullpage` mode. Frontend adds three wizard pages under `pages/create-bot`, a reusable `WizardHeader`/`WizardStepper`, a rebuilt install page with tabs and verification, a rename dialog, three purpose templates, and list changes on All Chatbots.

**Tech Stack:** FastAPI, SQLAlchemy async, Alembic, httpx, pytest (real PostgreSQL); React 18, TypeScript, React Router 6, TanStack Query, react-hook-form + zod, lucide-react.

**Spec:** `docs/superpowers/specs/2026-09-17-create-bot-wizard-design.md`

**Ordering constraint:** this plan starts only after the tenancy/roles plan (`docs/superpowers/plans/2026-09-16-tenancy-roles-limits.md`) has landed its Task 6 frontend commit, because that commit rewrites every `can("features:use")` gate to `can("bots:manage")` in the same files this plan edits. All gates in this plan use `can("bots:manage")`.

## Global Constraints

- Backend: every repository function takes `workspace_id` as a mandatory keyword argument.
- Backend: a slice imports only `app.core`, `app.shared`, and other slices' `api.py`. `lint-imports` must print "Contracts: 3 kept, 0 broken".
- Backend: every state-changing route records an audit row in the same transaction and returns the `success(...)` envelope from `app.core.envelope`.
- Backend: validation failures are HTTP 400 `VALIDATION_ERROR`, never 422. Raise `AppError(code=..., message=..., status_code=...)` from `app.core.errors`.
- Backend tests: real local PostgreSQL, throwaway database per run (`conftest.py` runs `alembic upgrade head`); auth through `POST /api/v1/auth/register`; run from `backend/` with `pytest <path> -q`.
- Frontend: layers import downward only (`app → pages → widgets → features → entities → shared`). API calls via `apiRequest<T>` from `shared/api/client.ts`. Shared UI from `shared/ui`. Page CSS appended to `frontend/src/styles.css`. `npm run typecheck` and `npm run build` pass after every frontend task.
- Testing policy (project owner): no test suites. Only the tests this plan names. Frontend has no unit tests.
- Never stage `frontend/src/widgets/animated-login/`, `frontend/scripts/`, `backend/storage/`, `backend/*.log`, `frontend/tsconfig.app.tsbuildinfo` or the `.pptx` in the repo root. Never `git add -A`. Never drop or migrate the developer's `webchatbots` database.
- Copy in this plan (headings, card text, messages) is the guide's copy and is used verbatim.
- Commit messages end with the trailer `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

---

## File map

| File | Responsibility |
|---|---|
| `backend/alembic/versions/0015_chatbot_wizard.py` | six new `chatbots` columns + check constraints |
| `backend/app/slices/chatbots/models.py` | `Chatbot` gains the six fields |
| `backend/app/slices/chatbots/schemas.py` | `ChatbotCreate`/`ChatbotUpdate` new fields; `InstallVerifyRequest` |
| `backend/app/slices/chatbots/repository.py` | `insert_chatbot` accepts platform/use_case/note |
| `backend/app/slices/chatbots/service.py` | `create_chatbot` passes them; `mark_installed` |
| `backend/app/slices/chatbots/install.py` | URL guard, bounded fetch, page inspection (no DB) |
| `backend/app/slices/chatbots/router.py` | payload fields; `POST /{id}/install/verify` |
| `backend/app/slices/audit/actions.py` | `CHATBOT_INSTALL_VERIFIED` |
| `backend/app/slices/chatbots/tests/test_install_verify.py` | the three verify tests |
| `backend/app/main.py`, `backend/app/static/chat.html` | `/chat/{id}` landing page |
| `backend/app/static/widget.js` | `data-mode="fullpage"` |
| `frontend/src/entities/chatbot/types.ts`, `api.ts` | new fields, `get`, `verifyInstall` |
| `frontend/src/features/flow-templates/templates.ts` | `sell-products`, `appointment-booking`, `generic` |
| `frontend/src/pages/create-bot/purposes.ts` | purpose catalogue |
| `frontend/src/widgets/wizard/WizardStepper.tsx`, `WizardHeader.tsx` | stage header |
| `frontend/src/pages/create-bot/SelectPlatformPage.tsx` | stage 1 |
| `frontend/src/pages/create-bot/SelectPurposePage.tsx` | stage 2 + Other dialog + bot creation |
| `frontend/src/pages/create-bot/InstallFormatPage.tsx` | stage 4 |
| `frontend/src/pages/builder/BuilderPage.tsx` | `?wizard=1` header and Install target |
| `frontend/src/pages/install/InstallChatbotPage.tsx` | rebuilt install page |
| `frontend/src/features/chatbot-rename/RenameChatbotDialog.tsx` | internal-name dialog |
| `frontend/src/pages/chatflows/ChatFlowsPage.tsx` | Create button, Status/Platform columns, row menu |
| `frontend/src/widgets/navigation/AmbotShell.tsx`, `ChatbotSubNav.tsx` | New Bot → `/chatbots/new`; dialog removed |
| `frontend/src/app/App.tsx` | three new routes |
| `frontend/src/styles.css` | wizard, install, row-menu CSS |
| `backend/scripts/seed_demo.py`, `docs/DEMO_WALKTHROUGH.md` | seed fields, walkthrough section |

---

### Task 1: Chatbot wizard fields (backend)

**Files:**
- Create: `backend/alembic/versions/0015_chatbot_wizard.py`
- Modify: `backend/app/slices/chatbots/models.py`, `schemas.py`, `repository.py:59-74`, `service.py:44-78`, `router.py:24-35, 70-99`
- Test: `backend/app/slices/chatbots/tests/test_chatbot_api.py:24-35`

**Interfaces:**
- Produces: `Chatbot.platform: str`, `use_case: str | None`, `use_case_note: str | None`, `install_format: str | None`, `installed_url: str | None`, `installed_at: datetime | None`; `ChatbotCreate.platform/use_case/use_case_note`; `ChatbotUpdate.install_format`; `_chatbot_data` includes all six keys (`installed_at` ISO string or null).

- [ ] **Step 1: Extend the existing create test (RED)**

In `test_chatbot_crud_and_flow_version_lifecycle`, change the create call and add assertions right after `assert chatbot["current_version"] == 1`:

```python
    created = await client.post(
        "/api/v1/chatbots",
        json={
            "name": "Support concierge",
            "description": "Front-line support",
            "use_case": "leads",
            "use_case_note": "   ",
        },
        headers=headers,
    )
    assert created.status_code == 201
    chatbot = created.json()["data"]
    assert chatbot["current_version"] == 1
    assert chatbot["platform"] == "website"
    assert chatbot["use_case"] == "leads"
    assert chatbot["use_case_note"] is None
    assert chatbot["install_format"] is None
    assert chatbot["installed_url"] is None
    assert chatbot["installed_at"] is None

    formatted = await client.patch(
        f"/api/v1/chatbots/{chatbot['id']}",
        json={"install_format": "landing_page"},
        headers=headers,
    )
    assert formatted.json()["data"]["install_format"] == "landing_page"
```

- [ ] **Step 2: Run it**

Run: `pytest app/slices/chatbots/tests/test_chatbot_api.py::test_chatbot_crud_and_flow_version_lifecycle -q`
Expected: FAIL — `KeyError: 'platform'`.

- [ ] **Step 3: Migration**

```python
"""Create-bot wizard: platform, purpose and installation fields on chatbots.

Revision ID: 0015_chatbot_wizard
Revises: 0014_roles_catalogue
"""
import sqlalchemy as sa
from alembic import op

revision = "0015_chatbot_wizard"
down_revision = "0014_roles_catalogue"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("chatbots", sa.Column("platform", sa.String(20), nullable=False, server_default="website"))
    op.add_column("chatbots", sa.Column("use_case", sa.String(20), nullable=True))
    op.add_column("chatbots", sa.Column("use_case_note", sa.String(200), nullable=True))
    op.add_column("chatbots", sa.Column("install_format", sa.String(20), nullable=True))
    op.add_column("chatbots", sa.Column("installed_url", sa.String(2048), nullable=True))
    op.add_column("chatbots", sa.Column("installed_at", sa.DateTime(timezone=True), nullable=True))
    op.create_check_constraint(
        "ck_chatbots_platform", "chatbots",
        "platform IN ('website', 'whatsapp', 'instagram', 'facebook', 'telegram')",
    )
    op.create_check_constraint(
        "ck_chatbots_use_case", "chatbots",
        "use_case IS NULL OR use_case IN ('leads', 'support', 'sales', 'appointment', 'other')",
    )
    op.create_check_constraint(
        "ck_chatbots_install_format", "chatbots",
        "install_format IS NULL OR install_format IN ('chat_button', 'landing_page', 'mobile_app', 'embedded')",
    )


def downgrade() -> None:
    op.drop_constraint("ck_chatbots_install_format", "chatbots", type_="check")
    op.drop_constraint("ck_chatbots_use_case", "chatbots", type_="check")
    op.drop_constraint("ck_chatbots_platform", "chatbots", type_="check")
    for column in ("installed_at", "installed_url", "install_format", "use_case_note", "use_case", "platform"):
        op.drop_column("chatbots", column)
```

- [ ] **Step 4: Model**

In `models.py`, add `DateTime` to the sqlalchemy import, `from datetime import datetime`, and after `status`:

```python
    platform: Mapped[str] = mapped_column(String(20), nullable=False, server_default="website")
    use_case: Mapped[str | None] = mapped_column(String(20), nullable=True)
    use_case_note: Mapped[str | None] = mapped_column(String(200), nullable=True)
    install_format: Mapped[str | None] = mapped_column(String(20), nullable=True)
    installed_url: Mapped[str | None] = mapped_column(String(2048), nullable=True)
    installed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
```

Add the three check constraints to `__table_args__` mirroring the migration text (names `ck_chatbots_platform`, `ck_chatbots_use_case`, `ck_chatbots_install_format`).

- [ ] **Step 5: Schemas**

```python
Platform = Literal["website"]
UseCase = Literal["leads", "support", "sales", "appointment", "other"]
InstallFormat = Literal["chat_button", "landing_page"]


class ChatbotCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str = Field(default="", max_length=500)
    platform: Platform = "website"
    use_case: UseCase | None = None
    use_case_note: str | None = Field(default=None, max_length=200)

    @model_validator(mode="after")
    def strip_note(self) -> "ChatbotCreate":
        if self.use_case_note is not None:
            self.use_case_note = self.use_case_note.strip() or None
        return self


class ChatbotUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=500)
    status: Literal["draft", "published", "archived"] | None = None
    install_format: InstallFormat | None = None
    # unchanged require_change validator


class InstallVerifyRequest(BaseModel):
    url: str = Field(min_length=1, max_length=2048)
```

`install_format` can be set but not cleared (the router keeps `exclude_none=True`).

- [ ] **Step 6: Repository, service, router**

`repository.insert_chatbot` gains keyword args `platform: str`, `use_case: str | None`, `use_case_note: str | None` and passes them to `Chatbot(...)`. `service.create_chatbot` gains the same three keyword args and forwards them. In `router.create_chatbot` pass `platform=body.platform, use_case=body.use_case, use_case_note=body.use_case_note`. In `_chatbot_data` add:

```python
        "platform": chatbot.platform,
        "use_case": chatbot.use_case,
        "use_case_note": chatbot.use_case_note,
        "install_format": chatbot.install_format,
        "installed_url": chatbot.installed_url,
        "installed_at": chatbot.installed_at.isoformat() if chatbot.installed_at else None,
```

- [ ] **Step 7: GREEN, full suite, lint**

Run: `pytest app/slices/chatbots/tests/test_chatbot_api.py -q` → PASS. Then `pytest -q` and `lint-imports`. Also `alembic downgrade -1` then `alembic upgrade head` against the test database URL (see `conftest.py` for how it is built) to prove the round-trip.

- [ ] **Step 8: Commit**

```bash
git add backend/alembic/versions/0015_chatbot_wizard.py backend/app/slices/chatbots backend/app/slices/chatbots/tests/test_chatbot_api.py
git commit -m "feat(chatbots): platform, purpose and installation fields"
```

---

### Task 2: Install verification endpoint (backend)

**Files:**
- Create: `backend/app/slices/chatbots/install.py`, `backend/app/slices/chatbots/tests/test_install_verify.py`
- Modify: `backend/app/slices/chatbots/service.py`, `router.py`, `backend/app/slices/audit/actions.py`

**Interfaces:**
- Consumes: Task 1 fields; `install.fetch_page` is the seam tests monkeypatch. Amended after review (2026-09-17): the allowed host comes from `settings.PUBLIC_BASE_URL` (new setting, default `http://127.0.0.1:8000`), never from the request's `Host` header; `check_url` is async and resolves through `loop.getaddrinfo`; `fetch_page` wraps all hops in `asyncio.timeout(TIMEOUT_SECONDS)`; the route carries `Depends(rate_limit("install_verify"))`; tests monkeypatch `settings.PUBLIC_BASE_URL = "http://test"`.
- Produces: `POST /api/v1/chatbots/{id}/install/verify {url}` → `{connected: true, url, verified_at}` or `{connected: false, reason: "unreachable"|"script_missing"|"wrong_chatbot"}`; 400 `VALIDATION_ERROR` for a rejected URL.

- [ ] **Step 1: Tests (RED)**

```python
import uuid

import pytest

from app.slices.chatbots import install

REGISTRATION = {"email": "verify@x.com", "password": "Secret123", "full_name": "V", "org_name": "Acme"}
SCRIPT = '<script src="http://test/widget.js" data-chatbot-id="{id}" data-api="http://test/api/v1" async></script>'


async def _bot(client):
    auth = (await client.post("/api/v1/auth/register", json=REGISTRATION)).json()["data"]
    headers = {"Authorization": f"Bearer {auth['access_token']}"}
    bot = (await client.post("/api/v1/chatbots", json={"name": "Shop bot"}, headers=headers)).json()["data"]
    return bot, headers


async def test_private_url_is_rejected(client):
    bot, headers = await _bot(client)
    response = await client.post(
        f"/api/v1/chatbots/{bot['id']}/install/verify", json={"url": "http://10.0.0.1/"}, headers=headers
    )
    assert response.status_code == 400
    assert response.json()["error"] == "VALIDATION_ERROR"
    fetched = (await client.get(f"/api/v1/chatbots/{bot['id']}", headers=headers)).json()["data"]
    assert fetched["installed_url"] is None
    # the app's own host is always allowed, so the built-in /demo page verifies
    install.check_url("http://test/demo?chatbot_id=x", allowed_host="test")
    with pytest.raises(Exception):
        install.check_url("http://localhost/demo", allowed_host="test")


async def test_page_with_this_bots_script_connects(client, monkeypatch):
    bot, headers = await _bot(client)

    async def fake_fetch(url, *, allowed_host):
        return ("http://test/demo?chatbot_id=" + bot["id"], "<html>" + SCRIPT.format(id=bot["id"]) + "</html>")

    monkeypatch.setattr(install, "fetch_page", fake_fetch)
    response = await client.post(
        f"/api/v1/chatbots/{bot['id']}/install/verify",
        json={"url": f"http://test/demo?chatbot_id={bot['id']}"},
        headers=headers,
    )
    data = response.json()["data"]
    assert data["connected"] is True
    assert data["url"].endswith(bot["id"])
    fetched = (await client.get(f"/api/v1/chatbots/{bot['id']}", headers=headers)).json()["data"]
    assert fetched["installed_url"] == data["url"]
    assert fetched["installed_at"] is not None


async def test_page_with_another_bots_script_is_wrong_chatbot(client, monkeypatch):
    bot, headers = await _bot(client)

    async def fake_fetch(url, *, allowed_host):
        return ("http://test/demo", "<html>" + SCRIPT.format(id=uuid.uuid4()) + "</html>")

    monkeypatch.setattr(install, "fetch_page", fake_fetch)
    response = await client.post(
        f"/api/v1/chatbots/{bot['id']}/install/verify", json={"url": "http://test/demo"}, headers=headers
    )
    assert response.json()["data"] == {"connected": False, "reason": "wrong_chatbot"}
    fetched = (await client.get(f"/api/v1/chatbots/{bot['id']}", headers=headers)).json()["data"]
    assert fetched["installed_url"] is None
```

Run: `pytest app/slices/chatbots/tests/test_install_verify.py -q` → FAIL (`ImportError`/404).

- [ ] **Step 2: `install.py`**

```python
"""Install verification: fetch a customer page and look for this bot's widget tag.

No database access here — the router owns persistence. `fetch_page` is the
seam tests replace so no test ever touches the network.
"""
import ipaddress
import re
import socket

import httpx

from app.core.errors import AppError

TIMEOUT_SECONDS = 5.0
MAX_BYTES = 1_000_000
MAX_REDIRECTS = 3
_ID_ATTR = re.compile(r"""data-chatbot-id\s*=\s*["']([^"']+)["']""", re.IGNORECASE)


def _invalid(message: str) -> AppError:
    return AppError(code="VALIDATION_ERROR", message=message, status_code=400)


def _is_internal(host: str) -> bool:
    try:
        infos = socket.getaddrinfo(host, None)
    except socket.gaierror:
        return True
    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast or ip.is_unspecified:
            return True
    return False


def check_url(url: str, *, allowed_host: str) -> httpx.URL:
    """Only public http(s) URLs pass, plus the app's own host (so /demo verifies)."""
    try:
        parsed = httpx.URL(url.strip())
    except Exception as exc:  # httpx raises InvalidURL subclasses
        raise _invalid("Enter a valid website URL") from exc
    if parsed.scheme not in ("http", "https") or not parsed.host:
        raise _invalid("Enter a full URL starting with http:// or https://")
    host = parsed.host.lower()
    if host != allowed_host.lower() and _is_internal(host):
        raise _invalid("Enter the public URL of your website")
    return parsed


async def fetch_page(url: httpx.URL, *, allowed_host: str) -> tuple[str, str] | None:
    """Return (final_url, body) or None when the page cannot be fetched."""
    headers = {"User-Agent": "WebChatBots-Verifier"}
    async with httpx.AsyncClient(timeout=TIMEOUT_SECONDS, follow_redirects=False, headers=headers) as client:
        current = url
        for _ in range(MAX_REDIRECTS + 1):
            try:
                async with client.stream("GET", current) as response:
                    if response.is_redirect and response.next_request is not None:
                        try:
                            current = check_url(str(response.next_request.url), allowed_host=allowed_host)
                        except AppError:
                            return None
                        continue
                    if not response.is_success:
                        return None
                    chunks: list[bytes] = []
                    size = 0
                    async for chunk in response.aiter_bytes():
                        chunks.append(chunk)
                        size += len(chunk)
                        if size >= MAX_BYTES:
                            break
                    return str(current), b"".join(chunks).decode("utf-8", errors="replace")
            except httpx.HTTPError:
                return None
        return None


def inspect_page(body: str, chatbot_id: str) -> str:
    """'connected' | 'script_missing' | 'wrong_chatbot'."""
    if "widget.js" not in body:
        return "script_missing"
    ids = _ID_ATTR.findall(body)
    if chatbot_id in ids:
        return "connected"
    return "wrong_chatbot" if ids else "script_missing"
```

- [ ] **Step 3: Audit action, service, router**

`actions.py` after `FLOW_RESTORED`: `CHATBOT_INSTALL_VERIFIED = "chatbot.install_verified"`.

`service.py` (add `from datetime import datetime, timezone`):

```python
async def mark_installed(
    session: AsyncSession, *, workspace_id: uuid.UUID, actor_id: uuid.UUID, chatbot_id: uuid.UUID, url: str
) -> Chatbot:
    chatbot = await repository.select_chatbot(session, workspace_id=workspace_id, chatbot_id=chatbot_id, for_update=True)
    if chatbot is None:
        raise _not_found()
    await repository.update_chatbot(chatbot, installed_url=url, installed_at=datetime.now(timezone.utc))
    await audit_api.record(
        session,
        action=audit_api.actions.CHATBOT_INSTALL_VERIFIED,
        workspace_id=workspace_id,
        actor_id=actor_id,
        target_type="chatbot",
        target_id=str(chatbot.id),
        metadata={"url": url},
    )
    await session.commit()
    await session.refresh(chatbot)
    return chatbot
```

(`repository.update_chatbot`'s `**changes: str` annotation becomes `**changes: object`.)

`router.py` (import `Request` from fastapi, `install` from the slice, `InstallVerifyRequest`):

```python
@router.post("/{chatbot_id}/install/verify")
async def verify_install(
    chatbot_id: uuid.UUID,
    body: InstallVerifyRequest,
    request: Request,
    ctx: WorkspaceContext = Depends(write_context),
    session: AsyncSession = Depends(get_session),
) -> dict:
    chatbot = await _require_chatbot(session, workspace_id=ctx.workspace_id, chatbot_id=chatbot_id)
    allowed_host = request.url.hostname or ""
    target = install.check_url(body.url, allowed_host=allowed_host)
    page = await install.fetch_page(target, allowed_host=allowed_host)
    if page is None:
        return success({"connected": False, "reason": "unreachable"})
    final_url, html_body = page
    verdict = install.inspect_page(html_body, str(chatbot.id))
    if verdict != "connected":
        return success({"connected": False, "reason": verdict})
    chatbot = await service.mark_installed(
        session, workspace_id=ctx.workspace_id, actor_id=ctx.user_id, chatbot_id=chatbot_id, url=final_url
    )
    return success({"connected": True, "url": chatbot.installed_url, "verified_at": chatbot.installed_at.isoformat()})
```

- [ ] **Step 4: GREEN, suite, lint** — `pytest app/slices/chatbots -q`, `pytest -q`, `lint-imports`.

- [ ] **Step 5: Commit**

```bash
git add backend/app/slices/chatbots backend/app/slices/audit/actions.py
git commit -m "feat(chatbots): verify widget installation by fetching the customer page"
```

---

### Task 3: Full-page landing route and widget fullpage mode (backend)

**Files:**
- Create: `backend/app/static/chat.html`
- Modify: `backend/app/main.py:23-24, 64-75`, `backend/app/static/widget.js:17-24, 36-40, 360-366`

**Interfaces:**
- Produces: `GET /chat/{chatbot_id}` HTML; widget attribute `data-mode="fullpage"`.

- [ ] **Step 1: `chat.html`**

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Chat</title>
<style>html,body{margin:0;height:100%;background:#f4f6fb;font-family:system-ui,-apple-system,Segoe UI,sans-serif}</style>
</head>
<body>
<script src="__ROOT__/widget.js" data-chatbot-id="__CHATBOT_ID__" data-api="__API__" data-mode="fullpage" async></script>
</body>
</html>
```

- [ ] **Step 2: Route** (next to `/demo`; add `_CHAT_HTML = Path(__file__).resolve().parent / "static" / "chat.html"`)

```python
    @app.get("/chat/{chatbot_id}", include_in_schema=False)
    async def chat_page(request: Request, chatbot_id: str) -> HTMLResponse:
        """Public full-page chat for the 'Put chatbot to your entire page' install format."""
        root = html.escape(str(request.base_url).rstrip("/"))
        page = (
            _CHAT_HTML.read_text(encoding="utf-8")
            .replace("__CHATBOT_ID__", html.escape(chatbot_id))
            .replace("__ROOT__", root)
            .replace("__API__", f"{root}/api/v1")
        )
        return HTMLResponse(page)
```

- [ ] **Step 3: Widget** — after `var ACCENT = ...` add `var MODE = script.getAttribute("data-mode") === "fullpage" ? "fullpage" : "bubble";`. Append to the `css` string, after the `.wcb-panel.wcb-open` rule:

```js
    (MODE === "fullpage"
      ? ".wcb-root{inset:0;bottom:auto;right:auto}.wcb-panel{position:fixed;inset:0;width:auto;max-width:none;height:auto;max-height:none;border-radius:0;box-shadow:none}.wcb-bubble,.wcb-head button{display:none}"
      : "") +
```

After `loadProfile();` add:

```js
  if (MODE === "fullpage") {
    state.open = true;
    panel.classList.add("wcb-open");
    start();
  }
```

Run `node --check backend/app/static/widget.js`.

- [ ] **Step 4: Manual check** — start the backend, open `http://127.0.0.1:8000/chat/<published bot id>`: the panel fills the window, no bubble, conversation starts. Open `/demo?chatbot_id=<id>`: unchanged.

- [ ] **Step 5: Commit**

```bash
git add backend/app/main.py backend/app/static/chat.html backend/app/static/widget.js
git commit -m "feat(widget): public full-page chat route and fullpage mode"
```

---

### Task 4: Wizard stages 1–2, purpose templates, routing (frontend)

**Files:**
- Create: `frontend/src/widgets/wizard/WizardStepper.tsx`, `frontend/src/widgets/wizard/WizardHeader.tsx`, `frontend/src/pages/create-bot/purposes.ts`, `frontend/src/pages/create-bot/SelectPlatformPage.tsx`, `frontend/src/pages/create-bot/SelectPurposePage.tsx`
- Modify: `frontend/src/entities/chatbot/types.ts`, `api.ts`, `frontend/src/features/flow-templates/templates.ts`, `frontend/src/app/App.tsx`, `frontend/src/widgets/navigation/AmbotShell.tsx`, `ChatbotSubNav.tsx`, `frontend/src/styles.css`
- Delete: `frontend/src/features/chatbot-create/ui/CreateChatbotDialog.tsx` (and its folder if empty)

**Interfaces:**
- Produces: `Chatbot` type fields `platform`, `use_case`, `use_case_note`, `install_format`, `installed_url`, `installed_at`; `chatbotApi.get(id)`, `chatbotApi.create(input: {name; description?; platform?; use_case?; use_case_note?})`, `chatbotApi.update(id, {name?|description?|status?|install_format?})`, `chatbotApi.verifyInstall(id, url)`; `WizardStage`, `<WizardHeader current backTo>`; `PURPOSES`; template ids `sell-products`, `appointment-booking`, `generic`.

- [ ] **Step 1: Entities**

`types.ts` — extend `Chatbot`:

```ts
  platform: "website" | "whatsapp" | "instagram" | "facebook" | "telegram";
  use_case: "leads" | "support" | "sales" | "appointment" | "other" | null;
  use_case_note: string | null;
  install_format: "chat_button" | "landing_page" | null;
  installed_url: string | null;
  installed_at: string | null;
```

and add:

```ts
export type InstallVerifyResult =
  | { connected: true; url: string; verified_at: string }
  | { connected: false; reason: "unreachable" | "script_missing" | "wrong_chatbot" };
```

`api.ts`:

```ts
  get: (id: string) => apiRequest<Chatbot>(`/chatbots/${id}`),
  create: (input: {
    name: string;
    description?: string;
    platform?: "website";
    use_case?: Chatbot["use_case"];
    use_case_note?: string | null;
  }) => apiRequest<Chatbot>("/chatbots", { method: "POST", body: JSON.stringify(input) }),
  update: (id: string, input: Partial<Pick<Chatbot, "name" | "description" | "status" | "install_format">>) =>
    apiRequest<Chatbot>(`/chatbots/${id}`, { method: "PATCH", body: JSON.stringify(input) }),
  verifyInstall: (id: string, url: string) =>
    apiRequest<InstallVerifyResult>(`/chatbots/${id}/install/verify`, { method: "POST", body: JSON.stringify({ url }) }),
```

- [ ] **Step 2: Templates** — append three entries to `FLOW_TEMPLATES` using the file's `node`/`edge` helpers:

```ts
  {
    id: "sell-products",
    name: "Sell my products",
    description: "Engages customers, showcases products, and captures an email to follow up.",
    nodeTypes: ["message", "choice", "condition", "input", "end"],
    build: () => ({
      nodes: [
        node("start", "start", 0, { label: "Start" }),
        node("welcome", "message", 110, { label: "Welcome", message: "Hi there! 👋 Looking for something specific today?" }),
        node("category", "choice", 220, { label: "Category", prompt: "What are you shopping for?", options: "New arrivals\nBest sellers\nDeals", variable: "category" }),
        node("is-deals", "condition", 330, { label: "Deals?", variable: "category", operator: "equals", value: "Deals" }),
        node("deals-msg", "message", 440, { label: "Deals", message: "Our current deals save up to 30% — this week only." }, 80),
        node("catalogue-msg", "message", 440, { label: "Catalogue", message: "Great choice — {{category}} are our most popular picks right now." }, 420),
        node("email", "input", 550, { label: "Ask email", prompt: "Share your email and we'll send you a personalised product list.", variable: "email", inputType: "email" }),
        node("end", "end", 660, { label: "End", message: "Thanks! Check your inbox shortly." }),
      ],
      edges: [
        edge("start", "welcome"), edge("welcome", "category"), edge("category", "is-deals"),
        edge("is-deals", "deals-msg", "true"), edge("is-deals", "catalogue-msg", "false"),
        edge("deals-msg", "email"), edge("catalogue-msg", "email"), edge("email", "end"),
      ],
      viewport: { x: 0, y: 0, zoom: 0.9 },
    }),
  },
  {
    id: "appointment-booking",
    name: "Appointment booking",
    description: "Collects a name, service, preferred time and email, then confirms the request.",
    nodeTypes: ["message", "question", "choice", "input", "end"],
    build: () => ({
      nodes: [
        node("start", "start", 0, { label: "Start" }),
        node("welcome", "message", 110, { label: "Welcome", message: "Hello! 📅 Let's book your appointment." }),
        node("name", "question", 220, { label: "Ask name", prompt: "What's your name?", variable: "name" }),
        node("service", "choice", 330, { label: "Service", prompt: "Which service do you need?", options: "Consultation\nFollow-up\nOther", variable: "service" }),
        node("when", "question", 440, { label: "Preferred time", prompt: "When would suit you? (day and time)", variable: "preferred_time" }),
        node("email", "input", 550, { label: "Ask email", prompt: "And your email, so we can confirm?", variable: "email", inputType: "email" }),
        node("confirm", "message", 660, { label: "Confirm", message: "Thanks {{name}}! We'll confirm your {{service}} for {{preferred_time}} at {{email}}." }),
        node("end", "end", 770, { label: "End", message: "See you soon!" }),
      ],
      edges: [
        edge("start", "welcome"), edge("welcome", "name"), edge("name", "service"), edge("service", "when"),
        edge("when", "email"), edge("email", "confirm"), edge("confirm", "end"),
      ],
      viewport: { x: 0, y: 0, zoom: 0.9 },
    }),
  },
  {
    id: "generic",
    name: "Generic welcome",
    description: "A welcome message and one open question — the smallest flow to build on.",
    nodeTypes: ["message", "question", "end"],
    build: () => ({
      nodes: [
        node("start", "start", 0, { label: "Start" }),
        node("welcome", "message", 110, { label: "Welcome", message: "Hi there! 👋 Welcome to our chatbot — we're glad to have you here! 😊✨" }),
        node("ask", "question", 220, { label: "Ask", prompt: "How can we help you today? 😊💬", variable: "request" }),
        node("end", "end", 330, { label: "End", message: "Thanks — we'll get back to you shortly." }),
      ],
      edges: [edge("start", "welcome"), edge("welcome", "ask"), edge("ask", "end")],
      viewport: { x: 0, y: 0, zoom: 0.9 },
    }),
  },
```

- [ ] **Step 3: `purposes.ts`**

```ts
import type { Chatbot } from "../../entities/chatbot/types";

export type Purpose = NonNullable<Chatbot["use_case"]>;

export interface PurposeCard {
  id: Purpose;
  title: string;
  description: string;
  templateId: string;
  botName: string;
  emoji: string;
}

export const PURPOSES: readonly PurposeCard[] = [
  { id: "leads", title: "Get more leads", description: "More flexibility, custom flow and more", templateId: "lead-capture", botName: "Lead capture bot", emoji: "🎯" },
  { id: "support", title: "Help my customers with their Queries", description: "Instant responses, personalized support, and efficient issue resolution", templateId: "support-handoff", botName: "Customer support bot", emoji: "💬" },
  { id: "sales", title: "Sell my products", description: "Engage customers, showcase products, and drive sales.", templateId: "sell-products", botName: "Sales bot", emoji: "🛍️" },
  { id: "appointment", title: "Appointment booking", description: "Customized solutions, engaging conversations, and more.", templateId: "appointment-booking", botName: "Appointment bot", emoji: "📅" },
  { id: "other", title: "Other use cases", description: "What are you planning to use the chatbot for?", templateId: "generic", botName: "New bot", emoji: "✨" },
];

export const OTHER_SUGGESTIONS = ["Customer Onboarding", "Order Tracking", "Event / Webinar Registration"] as const;
```

- [ ] **Step 4: Stepper and header**

`WizardStepper.tsx`:

```tsx
import { ChevronRight } from "lucide-react";

export type WizardStage = "platform" | "purpose" | "setup" | "install";

const STAGES: readonly { id: WizardStage; label: string }[] = [
  { id: "platform", label: "Select Platform" },
  { id: "purpose", label: "Usecase" },
  { id: "setup", label: "Setup Bot" },
  { id: "install", label: "Install Bot" },
];

export function WizardStepper({ current }: { current: WizardStage }) {
  const index = STAGES.findIndex((s) => s.id === current);
  return (
    <ol className="wizard-stepper" aria-label="Create chatbot progress">
      {STAGES.map((stage, i) => (
        <li
          key={stage.id}
          className={`wizard-step ${i < index ? "is-done" : i === index ? "is-current" : ""}`}
          aria-current={i === index ? "step" : undefined}
        >
          <span>{stage.label}</span>
          {i < STAGES.length - 1 && <ChevronRight size={14} aria-hidden />}
        </li>
      ))}
    </ol>
  );
}
```

`WizardHeader.tsx`:

```tsx
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import { WizardStepper, type WizardStage } from "./WizardStepper";

interface Props {
  current: WizardStage;
  backTo: string;
  children?: ReactNode; // right-hand slot
}

export function WizardHeader({ current, backTo, children }: Props) {
  return (
    <header className="wizard-header">
      <Link to={backTo} className="wizard-back" aria-label="Back">
        <ArrowLeft size={18} />
        <span>Create Chatbot</span>
      </Link>
      <WizardStepper current={current} />
      <div className="wizard-header-right">{children}</div>
    </header>
  );
}
```

- [ ] **Step 5: Stage 1 page**

```tsx
import { Globe } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { PrimaryNav } from "../../widgets/navigation/PrimaryNav";
import { WizardHeader } from "../../widgets/wizard/WizardHeader";

const CHANNELS = [
  { id: "website", title: "Website / Mobile App", description: "Add a chatbot to your website or app and engage visitors instantly.", emoji: "🌐", enabled: true },
  { id: "whatsapp", title: "WhatsApp", description: "Automate conversations, send alerts, and chat using WhatsApp.", emoji: "🟢", enabled: false },
  { id: "instagram", title: "Instagram", description: "Reply to DMs, comments, and stories.", emoji: "📸", enabled: false },
  { id: "facebook", title: "Facebook", description: "Connect through automated conversations in Messenger.", emoji: "🔵", enabled: false },
  { id: "telegram", title: "Telegram", description: "Build secure, lightning-fast bot conversations inside Telegram.", emoji: "✈️", enabled: false },
] as const;

export function SelectPlatformPage() {
  const navigate = useNavigate();
  return (
    <div className="ambot-dashboard-shell">
      <PrimaryNav />
      <main className="ambot-main-viewport wizard-viewport">
        <WizardHeader current="platform" backTo="/chatbots" />
        <section className="wizard-body">
          <h1>Select Your Platform</h1>
          <p className="wizard-subtitle">Every platform offers unique features, this helps us to personalize your bot creation</p>
          <div className="wizard-card-grid wizard-grid-5">
            {CHANNELS.map((c) => (
              <button
                key={c.id}
                type="button"
                className={`wizard-card ${c.enabled ? "" : "is-disabled"}`}
                aria-disabled={!c.enabled}
                disabled={!c.enabled}
                onClick={() => navigate("/chatbots/new/purpose", { state: { platform: "website" } })}
              >
                <span className="wizard-card-art" aria-hidden>{c.emoji}</span>
                <span className="wizard-card-title">{c.id === "website" ? <Globe size={16} /> : null}{c.title}</span>
                <span className="wizard-card-desc">{c.description}</span>
                {!c.enabled && <span className="wizard-card-badge">Coming soon</span>}
              </button>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
```

- [ ] **Step 6: Stage 2 page**

```tsx
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";

import { chatbotApi } from "../../entities/chatbot/api";
import { FLOW_TEMPLATES } from "../../features/flow-templates/templates";
import { Button, Dialog, Field, Input, useToast } from "../../shared/ui";
import { PrimaryNav } from "../../widgets/navigation/PrimaryNav";
import { WizardHeader } from "../../widgets/wizard/WizardHeader";
import { OTHER_SUGGESTIONS, PURPOSES, type Purpose } from "./purposes";

export function SelectPurposePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const client = useQueryClient();
  const [otherOpen, setOtherOpen] = useState(false);
  const [note, setNote] = useState("");

  const platform = (location.state as { platform?: string } | null)?.platform;
  if (platform !== "website") return <Navigate to="/chatbots/new" replace />;

  const create = useMutation({
    mutationFn: async (input: { purpose: Purpose; note?: string }) => {
      const card = PURPOSES.find((p) => p.id === input.purpose)!;
      const bot = await chatbotApi.create({
        name: card.botName,
        description: input.note ?? "",
        platform: "website",
        use_case: input.purpose,
        use_case_note: input.note ?? null,
      });
      const template = FLOW_TEMPLATES.find((t) => t.id === card.templateId);
      if (template) {
        try {
          await chatbotApi.saveFlow(bot.id, template.build());
        } catch {
          toast.error("The starting template could not be applied — pick one from Chat Flow Templates.");
        }
      }
      return bot;
    },
    onSuccess: async (bot) => {
      await client.invalidateQueries({ queryKey: ["chatbots"] });
      navigate(`/builder/${bot.id}?wizard=1`);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Could not create the chatbot"),
  });

  const pick = (purpose: Purpose) => {
    if (purpose === "other") { setOtherOpen(true); return; }
    create.mutate({ purpose });
  };

  return (
    <div className="ambot-dashboard-shell">
      <PrimaryNav />
      <main className="ambot-main-viewport wizard-viewport">
        <WizardHeader current="purpose" backTo="/chatbots/new" />
        <section className="wizard-body">
          <h1>Select Your Purpose</h1>
          <p className="wizard-subtitle">Every platform offers unique features, this helps us to personalize your bot creation journey.</p>
          <div className="wizard-card-grid wizard-grid-purpose">
            {PURPOSES.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`wizard-card ${p.id === "other" ? "is-wide" : ""} ${create.isPending && create.variables?.purpose === p.id ? "is-pending" : ""}`}
                disabled={create.isPending}
                onClick={() => pick(p.id)}
              >
                <span className="wizard-card-art" aria-hidden>{p.emoji}</span>
                <span className="wizard-card-title">{p.title}</span>
                <span className="wizard-card-desc">{p.description}</span>
              </button>
            ))}
          </div>
        </section>
      </main>

      <Dialog
        open={otherOpen}
        onClose={() => setOtherOpen(false)}
        title="Describe what you are trying to solve here."
        footer={
          <>
            <Button onClick={() => { setOtherOpen(false); create.mutate({ purpose: "other" }); }}>Skip</Button>
            <Button variant="primary" loading={create.isPending} onClick={() => { setOtherOpen(false); create.mutate({ purpose: "other", note: note.trim() || undefined }); }}>
              Next
            </Button>
          </>
        }
      >
        <Field label="Use Case">
          <Input autoFocus maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Use Case" />
        </Field>
        <div className="wizard-chips">
          {OTHER_SUGGESTIONS.map((s) => (
            <button key={s} type="button" className="wizard-chip" onClick={() => setNote(s)}>{s}</button>
          ))}
        </div>
      </Dialog>
    </div>
  );
}
```

(The early `Navigate` return sits before the hooks that follow it in this listing; reorder so all hooks are called before the conditional return — declare `create` first, then the guard.)

- [ ] **Step 7: Routes and navigation**

`App.tsx`: import the two pages; add, wrapped like `/chatbots`:

```tsx
        <Route path="/chatbots/new" element={authenticated ? <SuperadminOnly><SelectPlatformPage /></SuperadminOnly> : <Navigate to="/login" replace />} />
        <Route path="/chatbots/new/purpose" element={authenticated ? <SuperadminOnly><SelectPurposePage /></SuperadminOnly> : <Navigate to="/login" replace />} />
```

`AmbotShell.tsx`: delete the `CreateChatbotDialog` import, `createOpen` state and the `<CreateChatbotDialog …/>` element; pass `onCreateNewBot={readOnly ? undefined : () => navigate("/chatbots/new")}`. `readOnly` uses `can("bots:manage")`. Delete `features/chatbot-create/ui/CreateChatbotDialog.tsx`. `ChatbotSubNav.tsx` is unchanged (it already takes the callback).

- [ ] **Step 8: CSS** — append under `/* ── Create-bot wizard ──────────────────────────────────────────────────── */`:

```css
.wizard-viewport { display: flex; flex-direction: column; }
.wizard-header { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; padding: 14px 24px; border-bottom: 1px solid var(--color-border, #e5e7eb); background: #fff; }
.wizard-back { display: inline-flex; align-items: center; gap: 8px; color: inherit; text-decoration: none; font-weight: 600; }
.wizard-header-right { display: flex; justify-content: flex-end; gap: 8px; }
.wizard-stepper { display: flex; gap: 10px; list-style: none; margin: 0; padding: 0; font-size: 13px; color: #6b7280; }
.wizard-step { display: inline-flex; align-items: center; gap: 10px; }
.wizard-step span { padding: 4px 10px; border-radius: 999px; }
.wizard-step.is-current span { background: #dbeafe; color: #1d4ed8; font-weight: 600; }
.wizard-step.is-done span { color: #111827; }
.wizard-body { padding: 28px 40px; max-width: 1100px; width: 100%; margin: 0 auto; }
.wizard-body h1 { font-size: 22px; margin: 0 0 4px; }
.wizard-subtitle { color: #6b7280; margin: 0 0 24px; font-size: 14px; }
.wizard-card-grid { display: grid; gap: 20px; }
.wizard-grid-5 { grid-template-columns: repeat(3, minmax(220px, 280px)); justify-content: center; }
.wizard-grid-purpose { grid-template-columns: repeat(2, minmax(260px, 320px)); justify-content: center; }
.wizard-card { position: relative; text-align: left; display: flex; flex-direction: column; gap: 6px; padding: 0 0 16px; border: 1px solid #e5e7eb; border-radius: 14px; background: #fff; cursor: pointer; transition: box-shadow .15s, transform .15s; }
.wizard-card:hover:not(:disabled) { box-shadow: 0 10px 30px rgba(17, 24, 39, .08); transform: translateY(-2px); }
.wizard-card.is-disabled, .wizard-card:disabled { cursor: default; opacity: .7; }
.wizard-card.is-pending { outline: 2px solid #2563eb; }
.wizard-card.is-wide { grid-column: 1 / -1; flex-direction: row; align-items: center; padding: 0 16px 0 0; }
.wizard-card-art { display: flex; align-items: center; justify-content: center; height: 120px; font-size: 44px; background: linear-gradient(135deg, #eef2ff, #f0fdfa); border-radius: 14px 14px 0 0; }
.wizard-card.is-wide .wizard-card-art { width: 140px; height: 90px; border-radius: 14px 0 0 14px; }
.wizard-card-title { display: inline-flex; align-items: center; gap: 6px; padding: 8px 16px 0; font-weight: 600; }
.wizard-card-desc { padding: 0 16px; font-size: 13px; color: #6b7280; }
.wizard-card-badge { position: absolute; top: 10px; right: 10px; font-size: 11px; padding: 2px 8px; border-radius: 999px; background: #f3f4f6; color: #6b7280; }
.wizard-chips { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
.wizard-chip { border: none; background: #dbeafe; color: #1d4ed8; border-radius: 999px; padding: 6px 12px; font-size: 12px; cursor: pointer; }
@media (max-width: 900px) { .wizard-grid-5, .wizard-grid-purpose { grid-template-columns: 1fr; } .wizard-header { grid-template-columns: 1fr; gap: 10px; } }
```

- [ ] **Step 9: Verify** — `npm run typecheck`, `npm run build`. In the browser: All Chatbots → New Bot → stage 1 → Website card → stage 2 → "Get more leads" creates "Lead capture bot" with the lead-capture flow and lands in `/builder/<id>?wizard=1`; "Other" → Next with a note lands the same way with the generic flow and the note as description.

- [ ] **Step 10: Commit**

```bash
git add frontend/src/entities/chatbot frontend/src/features/flow-templates/templates.ts frontend/src/pages/create-bot frontend/src/widgets/wizard frontend/src/app/App.tsx frontend/src/widgets/navigation/AmbotShell.tsx frontend/src/styles.css
git rm frontend/src/features/chatbot-create/ui/CreateChatbotDialog.tsx
git commit -m "feat(frontend): create-bot wizard stages 1-2 with purpose templates"
```

---

### Task 5: Setup Bot header and Install Bot format stage (frontend)

**Files:**
- Create: `frontend/src/pages/create-bot/InstallFormatPage.tsx`
- Modify: `frontend/src/pages/builder/BuilderPage.tsx` (imports, `useSearchParams`, the install targets at ~205 and ~279, header insertion), `frontend/src/app/App.tsx`, `frontend/src/styles.css`

**Interfaces:**
- Consumes: `WizardHeader`, `chatbotApi.get/update`.
- Produces: route `/chatbots/:chatbotId/install/format`; builder honours `?wizard=1`.

- [ ] **Step 1: BuilderPage** — add `useSearchParams` to the react-router import; inside the component: `const [searchParams] = useSearchParams(); const wizard = searchParams.get("wizard") === "1"; const installTarget = wizard ? `/chatbots/${selectedId}/install/format` : `/chatbots/${selectedId}/install`;`. Replace both `navigate(`/chatbots/${selectedId}/install`)` calls with `navigate(installTarget)`. Immediately inside the element that wraps both builder modes (the sibling that follows `<ChatbotSubNav …/>`), render as its first child:

```tsx
{wizard && selectedId && <WizardHeader current="setup" backTo="/chatbots" />}
```

- [ ] **Step 2: InstallFormatPage**

```tsx
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";

import { chatbotApi } from "../../entities/chatbot/api";
import type { Chatbot } from "../../entities/chatbot/types";
import { LoadingState, useToast } from "../../shared/ui";
import { PrimaryNav } from "../../widgets/navigation/PrimaryNav";
import { WizardHeader } from "../../widgets/wizard/WizardHeader";

type Format = NonNullable<Chatbot["install_format"]>;

const FORMATS = [
  { id: "chat_button", title: "Add as chat button on website", bestFor: "Lead capture & customer support", description: "Add a floating chat button on your website that opens when users need help.", emoji: "💬", enabled: true, recommended: true, tab: "website" },
  { id: "landing_page", title: "Put chatbot to your entire page", bestFor: "Full conversational landing experience", description: "Turn your full page into a conversational experience by connecting your website.", emoji: "🖥️", enabled: true, recommended: false, tab: "landing" },
  { id: "mobile_app", title: "Bot in your Mobile App", bestFor: "In-app engagement", description: "Install website bot directly into your mobile application.", emoji: "📱", enabled: false, recommended: false, tab: "" },
  { id: "embedded", title: "Embed chatbot in a page", bestFor: "Specific workflows or page sections", description: "Place the chatbot inside a specific section or page of your website or product.", emoji: "🧩", enabled: false, recommended: false, tab: "" },
] as const;

export function InstallFormatPage() {
  const { chatbotId = "" } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const client = useQueryClient();
  const bot = useQuery({ queryKey: ["chatbot", chatbotId], queryFn: () => chatbotApi.get(chatbotId), enabled: Boolean(chatbotId) });

  const choose = useMutation({
    mutationFn: (format: Format) => chatbotApi.update(chatbotId, { install_format: format }),
    onSuccess: async (updated) => {
      await client.invalidateQueries({ queryKey: ["chatbots"] });
      const tab = FORMATS.find((f) => f.id === updated.install_format)?.tab ?? "website";
      navigate(`/chatbots/${chatbotId}/install?tab=${tab}`);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Could not save the install format"),
  });

  if (bot.isLoading) return <LoadingState label="Loading chatbot..." />;

  return (
    <div className="ambot-dashboard-shell">
      <PrimaryNav />
      <main className="ambot-main-viewport wizard-viewport">
        <WizardHeader current="install" backTo={`/builder/${chatbotId}?wizard=1`} />
        <section className="wizard-body">
          <h1>Link bot to your platform</h1>
          <p className="wizard-subtitle">Choose how you want to make your chatbot accessible to your users.</p>
          <div className="wizard-card-grid wizard-grid-formats" role="radiogroup" aria-label="Install format">
            {FORMATS.map((f) => {
              const selected = bot.data?.install_format === f.id;
              return (
                <button
                  key={f.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  className={`format-card ${selected ? "is-selected" : ""} ${f.enabled ? "" : "is-disabled"}`}
                  disabled={!f.enabled || choose.isPending}
                  onClick={() => choose.mutate(f.id as Format)}
                >
                  {f.recommended && <span className="format-recommended">★ Recommended</span>}
                  <span className="format-radio" aria-hidden />
                  <span className="format-art" aria-hidden>{f.emoji}</span>
                  <span className="format-body">
                    <strong>{f.title}</strong>
                    <span className="format-best"><b>Best for:</b> {f.bestFor}</span>
                    <span className="format-desc">{f.description}</span>
                    {!f.enabled && <span className="wizard-card-badge">Coming soon</span>}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="wizard-footnote">🛈 You can always change the platform or install on additional pages later from "Install your Chatbot".</p>
        </section>
      </main>
    </div>
  );
}
```

- [ ] **Step 3: Route** — in `App.tsx` add `/chatbots/:chatbotId/install/format` → `<SuperadminOnly><InstallFormatPage /></SuperadminOnly>` with the same auth wrapper.

- [ ] **Step 4: CSS** (append):

```css
.wizard-grid-formats { grid-template-columns: repeat(2, minmax(300px, 1fr)); }
.format-card { position: relative; display: grid; grid-template-columns: 140px 1fr; gap: 16px; align-items: center; text-align: left; padding: 22px 22px 22px 18px; border: 1.5px solid #e5e7eb; border-radius: 16px; background: #fff; cursor: pointer; }
.format-card.is-selected { border-color: #2563eb; background: #eff6ff; }
.format-card.is-disabled { opacity: .7; cursor: default; }
.format-radio { position: absolute; top: 14px; right: 14px; width: 16px; height: 16px; border-radius: 50%; border: 2px solid #9ca3af; }
.format-card.is-selected .format-radio { border-color: #2563eb; box-shadow: inset 0 0 0 4px #2563eb; }
.format-recommended { position: absolute; top: 12px; left: 14px; font-size: 11px; color: #1d4ed8; background: #dbeafe; border-radius: 999px; padding: 2px 8px; }
.format-art { display: flex; align-items: center; justify-content: center; height: 100px; font-size: 40px; background: #f3f4f6; border-radius: 12px; }
.format-body { display: flex; flex-direction: column; gap: 4px; font-size: 13px; }
.format-best { color: #6b7280; }
.format-desc { color: #4b5563; }
.wizard-footnote { margin-top: 20px; text-align: center; color: #6b7280; font-size: 12px; }
```

- [ ] **Step 5: Verify** — typecheck, build. In the browser: from stage 2 the builder shows the stepper with Setup Bot active; Install goes to the format stage; choosing the first card lands on `/chatbots/<id>/install?tab=website` and the bot's `install_format` is `chat_button`.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/create-bot/InstallFormatPage.tsx frontend/src/pages/builder/BuilderPage.tsx frontend/src/app/App.tsx frontend/src/styles.css
git commit -m "feat(frontend): Setup Bot stepper and Install Bot format stage"
```

---

### Task 6: Install Your Chatbot page with tabs and verification (frontend)

**Files:**
- Modify: `frontend/src/pages/install/InstallChatbotPage.tsx` (rewrite), `frontend/src/styles.css`

**Interfaces:**
- Consumes: `chatbotApi.verifyInstall`, `InstallVerifyResult`, `Tabs` from shared UI, `WidgetEmbedDialog`.

- [ ] **Step 1: Rewrite the page**

```tsx
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, ExternalLink, Headset, Mail, MessageCircle, PlayCircle } from "lucide-react";
import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { chatbotApi } from "../../entities/chatbot/api";
import type { Chatbot, InstallVerifyResult } from "../../entities/chatbot/types";
import { WidgetEmbedDialog } from "../../features/widget-embed/WidgetEmbedDialog";
import { Tabs, useToast } from "../../shared/ui";
import { AmbotShell } from "../../widgets/navigation/AmbotShell";

const API_BASE = (import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8000/api/v1").replace(/\/$/, "");
const BACKEND_ROOT = API_BASE.replace(/\/api\/v1$/, "");
const SUPPORT_EMAIL = import.meta.env.VITE_SUPPORT_EMAIL ?? "support@ambot365.in";
const SUPPORT_WHATSAPP = import.meta.env.VITE_SUPPORT_WHATSAPP ?? "https://wa.me/";

const REASONS: Record<Extract<InstallVerifyResult, { connected: false }>["reason"], string> = {
  unreachable: "We could not reach that page. Check the URL and that the site is published.",
  script_missing: "The page loaded but the chatbot script is not on it.",
  wrong_chatbot: "The page has a chatbot script for a different bot.",
};

type Tab = "website" | "landing";
const TABS = [{ id: "website", label: "Website Chatbot" }, { id: "landing", label: "Landing Page Bot" }] as const;

function useCopy() {
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  return {
    copied,
    copy: async (text: string, message: string) => {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success(message);
      setTimeout(() => setCopied(false), 2000);
    },
  };
}

function WebsiteTab({ bot }: { bot: Chatbot }) {
  const toast = useToast();
  const client = useQueryClient();
  const { copied, copy } = useCopy();
  const [url, setUrl] = useState(bot.installed_url ?? "");
  const [reason, setReason] = useState<string | null>(null);
  const [testOpen, setTestOpen] = useState(false);
  const script = `<script src="${BACKEND_ROOT}/widget.js" data-chatbot-id="${bot.id}" data-api="${API_BASE}" async></script>`;

  const verify = useMutation({
    mutationFn: () => chatbotApi.verifyInstall(bot.id, url.trim()),
    onSuccess: async (result) => {
      if (result.connected) {
        setReason(null);
        await client.invalidateQueries({ queryKey: ["chatbots"] });
        toast.success("Installation verified — your chatbot is connected.");
      } else {
        setReason(REASONS[result.reason]);
      }
    },
    onError: (err) => setReason(err instanceof Error ? err.message : "Verification failed"),
  });

  const connected = Boolean(bot.installed_url);
  return (
    <div className="install-layout">
      <section className="install-card install-main">
        <div className="install-card-header">
          <span className="install-code-badge">&lt;/&gt;</span>
          <div><strong>Chatbot Installation</strong><span>Installation instructions to install for Custom Platform</span></div>
          <span className={`install-pill ${connected ? "is-connected" : ""}`}>{connected ? `Connected · ${new URL(bot.installed_url!).host}` : "Not Connected"}</span>
        </div>

        <div className="install-step">
          <span className="install-step-no">1</span>
          <div>
            <strong>Install Your Chatbot</strong>
            <p>Add the following script inside the <code>&lt;head&gt;</code> or just before the closing <code>&lt;/body&gt;</code> tag of your website</p>
            <div className="install-snippet-box">
              <pre><code>{script}</code></pre>
              <button type="button" className="btn-copy-script" onClick={() => copy(script, "Script copied to clipboard")}>
                {copied ? <Check size={16} /> : <Copy size={16} />}<span>{copied ? "Copied" : "Copy Script"}</span>
              </button>
            </div>
          </div>
        </div>

        <div className="install-step">
          <span className="install-step-no">2</span>
          <div>
            <strong>Verify Installation</strong>
            <p>Enter your website URL to confirm the script is active and correctly configured.</p>
            <form className="install-verify-row" onSubmit={(e) => { e.preventDefault(); if (url.trim()) verify.mutate(); }}>
              <input type="url" placeholder="Enter your website URL" value={url} onChange={(e) => setUrl(e.target.value)} required />
              <button type="submit" className="btn-verify" disabled={verify.isPending || !url.trim()}>{verify.isPending ? "Verifying…" : "Verify"}</button>
            </form>
            {reason && <p className="install-verify-error" role="alert">{reason}</p>}
          </div>
        </div>
      </section>

      <aside className="install-card install-help">
        <Headset size={40} className="install-help-icon" />
        <h3>Need Help?</h3>
        <p>Our team is here to help you get started and make the most of your chatbot.</p>
        <a className="install-help-row" href={`mailto:${SUPPORT_EMAIL}?subject=Chatbot installation help (${bot.name})`}><Mail size={18} /><span><strong>Email a Developer</strong><small>Get help from our technical team</small></span></a>
        <a className="install-help-row" href={SUPPORT_WHATSAPP} target="_blank" rel="noreferrer"><MessageCircle size={18} /><span><strong>WhatsApp Support</strong><small>Chat with our support team</small></span></a>
        <button type="button" className="install-help-row" onClick={() => setTestOpen(true)}><PlayCircle size={18} /><span><strong>Test Bot</strong><small>Test your chatbot in real-time</small></span></button>
      </aside>

      <WidgetEmbedDialog open={testOpen} chatbot={bot} onClose={() => setTestOpen(false)} />
    </div>
  );
}

function LandingTab({ bot }: { bot: Chatbot }) {
  const { copied, copy } = useCopy();
  const link = `${BACKEND_ROOT}/chat/${bot.id}`;
  return (
    <section className="install-card install-main">
      <div className="install-card-header">
        <span className="install-code-badge">🖥️</span>
        <div><strong>Landing Page Bot</strong><span>Share this link — the chatbot fills the whole page.</span></div>
      </div>
      <div className="install-snippet-box">
        <pre><code>{link}</code></pre>
        <button type="button" className="btn-copy-script" onClick={() => copy(link, "Link copied to clipboard")}>
          {copied ? <Check size={16} /> : <Copy size={16} />}<span>{copied ? "Copied" : "Copy link"}</span>
        </button>
        <a className="btn-copy-script" href={link} target="_blank" rel="noreferrer"><ExternalLink size={16} /><span>Open</span></a>
      </div>
      {bot.status !== "published" && <p className="install-verify-error">Publish the chatbot first — the landing page only answers when the bot is published.</p>}
    </section>
  );
}

export function InstallChatbotPage() {
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get("tab") === "landing" ? "landing" : "website";
  return (
    <AmbotShell>
      {({ selectedChatbot }) => (
        <div className="install-page-container">
          <header className="install-header">
            <div className="install-title-col">
              <h1>Install Your Chatbot</h1>
              <p>Install your chatbot on your website or launch it as a landing page.</p>
            </div>
            <Link to="/chatbots" className="install-help-link">Help Guide ↗</Link>
          </header>
          <Tabs items={TABS} value={tab} onChange={(next) => setParams({ tab: next })} label="Install format" />
          {selectedChatbot && (tab === "website" ? <WebsiteTab key={selectedChatbot.id} bot={selectedChatbot} /> : <LandingTab bot={selectedChatbot} />)}
        </div>
      )}
    </AmbotShell>
  );
}
```

(`Help Guide` links to `/chatbots` until the walkthrough is served; keep it a plain link.)

- [ ] **Step 2: CSS** — extend the existing "Install Your Chatbot" section:

```css
.install-layout { display: grid; grid-template-columns: minmax(0, 1fr) 300px; gap: 20px; align-items: start; }
.install-main { padding: 20px; }
.install-card-header { display: flex; align-items: center; gap: 12px; }
.install-card-header > div { display: flex; flex-direction: column; flex: 1; }
.install-code-badge { display: inline-flex; align-items: center; justify-content: center; width: 36px; height: 36px; border-radius: 8px; background: #eef2ff; color: #4338ca; font-weight: 700; }
.install-pill { font-size: 12px; padding: 4px 10px; border-radius: 999px; background: #f3f4f6; color: #6b7280; }
.install-pill.is-connected { background: #dcfce7; color: #166534; }
.install-step { display: grid; grid-template-columns: 28px 1fr; gap: 12px; margin-top: 20px; }
.install-step > div { min-width: 0; }
.install-step p { margin: 4px 0 10px; color: #6b7280; font-size: 13px; }
.install-step-no { width: 24px; height: 24px; border-radius: 50%; background: #e5e7eb; display: inline-flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; }
.install-verify-row { display: flex; gap: 10px; }
.install-verify-row input { flex: 1; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 8px; }
.btn-verify { padding: 10px 18px; border: none; border-radius: 8px; background: #2563eb; color: #fff; font-weight: 600; cursor: pointer; }
.btn-verify:disabled { opacity: .6; cursor: default; }
.install-verify-error { margin-top: 8px; color: #b91c1c; font-size: 13px; }
.install-help { padding: 20px; text-align: center; }
.install-help-icon { color: #2563eb; }
.install-help h3 { margin: 8px 0 4px; }
.install-help p { color: #6b7280; font-size: 13px; }
.install-help-row { display: flex; align-items: center; gap: 12px; width: 100%; text-align: left; padding: 10px 12px; margin-top: 8px; border: 1px solid #e5e7eb; border-radius: 10px; background: #fff; color: inherit; text-decoration: none; cursor: pointer; }
.install-help-row span { display: flex; flex-direction: column; }
.install-help-row small { color: #6b7280; }
.install-help-link { color: #2563eb; text-decoration: none; font-size: 13px; }
@media (max-width: 900px) { .install-layout { grid-template-columns: 1fr; } }
```

- [ ] **Step 3: Verify** — typecheck, build. Browser: Website tab → Copy Script works; Verify with `http://127.0.0.1:8000/demo?chatbot_id=<id>` flips the pill to Connected and it stays after refresh; a URL like `http://10.0.0.1/` shows the validation message; Landing tab shows and opens `/chat/<id>`.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/install/InstallChatbotPage.tsx frontend/src/styles.css
git commit -m "feat(frontend): install page with website and landing tabs and verification"
```

---

### Task 7: All Chatbots list changes and internal rename (frontend)

**Files:**
- Create: `frontend/src/features/chatbot-rename/RenameChatbotDialog.tsx`
- Modify: `frontend/src/pages/chatflows/ChatFlowsPage.tsx`, `frontend/src/styles.css`

- [ ] **Step 1: Rename dialog**

```tsx
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Pencil } from "lucide-react";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { Link } from "react-router-dom";
import { z } from "zod";

import { chatbotApi } from "../../entities/chatbot/api";
import type { Chatbot } from "../../entities/chatbot/types";
import { Button, Dialog, Field, Input, useToast } from "../../shared/ui";

const MAX = 50;
const schema = z.object({ name: z.string().trim().min(1, "Enter a name").max(MAX, `Keep it under ${MAX} characters`) });
type FormData = z.infer<typeof schema>;
const FORM_ID = "rename-chatbot-form";

interface Props { chatbot: Chatbot | null; onClose: () => void }

export function RenameChatbotDialog({ chatbot, onClose }: Props) {
  const toast = useToast();
  const client = useQueryClient();
  const { register, handleSubmit, reset, watch, formState: { errors, isValid } } = useForm<FormData>({
    resolver: zodResolver(schema), mode: "onChange", defaultValues: { name: chatbot?.name ?? "" },
  });
  useEffect(() => { reset({ name: chatbot?.name ?? "" }); }, [chatbot, reset]);
  const length = watch("name").length;

  const rename = useMutation({
    mutationFn: (data: FormData) => chatbotApi.update(chatbot!.id, { name: data.name }),
    onSuccess: async () => { await client.invalidateQueries({ queryKey: ["chatbots"] }); toast.success("Chatbot renamed"); onClose(); },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Could not rename"),
  });

  return (
    <Dialog
      open={Boolean(chatbot)}
      onClose={onClose}
      title="Edit Internal Chatbot Name"
      icon={<Pencil size={20} aria-hidden />}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" form={FORM_ID} variant="primary" loading={rename.isPending} disabled={!isValid}>Save</Button>
        </>
      }
    >
      <p className="dialog-subtitle">Edit the name of your chatbot for better identification and management</p>
      <form id={FORM_ID} onSubmit={handleSubmit((data) => rename.mutate(data))}>
        <Field label="Edit Chatbot Name" error={errors.name?.message} hint={`${length}/${MAX}`}>
          <Input autoFocus {...register("name")} />
        </Field>
      </form>
      <div className="dialog-info-box">
        ⓘ This name is for internal management only and is different from the name your customers see.
        To update the customer-facing display name, <Link to={`/chatbots/${chatbot?.id ?? ""}/design`}>edit it in Chatbot Design Settings</Link>.
      </div>
    </Dialog>
  );
}
```

- [ ] **Step 2: ChatFlowsPage** — changes, all inside `ChatFlowsInner`:

1. Imports: add `Globe, MoreVertical, Pencil, Plus` from lucide-react; `RenameChatbotDialog`; `useEffect`.
2. State: `const [renameBot, setRenameBot] = useState<Chatbot | null>(null); const [menuFor, setMenuFor] = useState<string | null>(null);` and close the menu on any document click:
   ```tsx
   useEffect(() => { if (!menuFor) return; const close = () => setMenuFor(null); document.addEventListener("click", close); return () => document.removeEventListener("click", close); }, [menuFor]);
   ```
3. Header: change the `<h1>` to `All Chatbots` with subtitle `A view of all the chatbots you created till date.`, and add on the right of `.chatflows-header` (hidden when `readOnly`):
   ```tsx
   <button type="button" className="btn-create-flow" onClick={() => navigate("/chatbots/new")}><Plus size={15} /><span>Create New Chatbot</span></button>
   ```
4. Table head: `<th>Bot Name</th><th>Status</th><th>Platform</th><th># of nodes</th><th>Created on</th><th>Last modified</th><th>Published</th><th>Versions</th><th className="th-actions">Actions</th>`.
5. Row cells, after the name cell:
   ```tsx
   <td><Badge tone={bot.status === "published" ? "brand" : "neutral"}>{bot.status === "published" ? "✓ Active" : bot.status === "draft" ? "Created" : "Archived"}</Badge></td>
   <td><span className="platform-chip"><Globe size={13} /> Website</span></td>
   ```
6. Actions cell becomes:
   ```tsx
   <td className="td-actions-cell">
     <div className="row-menu">
       <button type="button" className="action-icon-btn" aria-haspopup="menu" aria-expanded={menuFor === bot.id} title="Actions" onClick={(e) => { e.stopPropagation(); setMenuFor(menuFor === bot.id ? null : bot.id); }}><MoreVertical size={16} /></button>
       {menuFor === bot.id && (
         <div className="row-menu-list" role="menu">
           {!readOnly && <button type="button" role="menuitem" onClick={() => setRenameBot(bot)}><Pencil size={14} /> Edit internal name</button>}
           <button type="button" role="menuitem" onClick={() => navigate(`/builder/${bot.id}`)}><Play size={14} /> Open builder</button>
           <button type="button" role="menuitem" onClick={() => setEmbedBot(bot)}><UserCheck size={14} /> Test bot</button>
           {!readOnly && <button type="button" role="menuitem" className="is-danger" onClick={() => { if (window.confirm(`Delete "${bot.name}" and all its flow versions?`)) removeBot.mutate(bot.id); }}><Trash2 size={14} /> Delete</button>}
         </div>
       )}
     </div>
   </td>
   ```
7. Render `<RenameChatbotDialog chatbot={renameBot} onClose={() => setRenameBot(null)} />` next to `WidgetEmbedDialog`.

- [ ] **Step 3: CSS** (append):

```css
.platform-chip { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; padding: 2px 8px; border-radius: 999px; background: #f3f4f6; color: #374151; }
.row-menu { position: relative; display: inline-block; }
.row-menu-list { position: absolute; right: 0; top: 32px; z-index: 20; min-width: 180px; background: #fff; border: 1px solid #e5e7eb; border-radius: 10px; box-shadow: 0 10px 30px rgba(17, 24, 39, .12); padding: 6px; display: flex; flex-direction: column; }
.row-menu-list button { display: flex; align-items: center; gap: 8px; width: 100%; text-align: left; padding: 8px 10px; border: none; background: none; border-radius: 6px; font-size: 13px; cursor: pointer; }
.row-menu-list button:hover { background: #f3f4f6; }
.row-menu-list button.is-danger { color: #b91c1c; }
.dialog-subtitle { margin: 0 0 12px; color: #6b7280; font-size: 13px; }
.dialog-info-box { margin-top: 12px; padding: 10px 12px; background: #eff6ff; border-radius: 8px; font-size: 12px; color: #1e3a8a; }
.chatflows-header { display: flex; justify-content: space-between; align-items: flex-start; }
```

- [ ] **Step 4: Verify** — typecheck, build. Browser: the list shows Status and Platform columns; the ⋮ menu opens and closes on outside click; rename to a 51-character name is blocked, to a shorter one saves and the row updates; Create New Chatbot opens stage 1.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/chatbot-rename frontend/src/pages/chatflows/ChatFlowsPage.tsx frontend/src/styles.css
git commit -m "feat(frontend): All Chatbots status/platform columns, row menu and internal rename"
```

---

### Task 8: Seed, walkthrough and rehearsal

**Files:**
- Modify: `backend/scripts/seed_demo.py:132-146`, `docs/DEMO_WALKTHROUGH.md`

- [ ] **Step 1: Seed** — give `ensure_bot` a `use_case` parameter and send it on create:

```python
    def ensure_bot(name, description, flow, use_case):
        if name in bots:
            return bots[name]["id"]
        bot = post("/chatbots", json={"name": name, "description": description, "platform": "website", "use_case": use_case})
        ...
    lead_id = ensure_bot("Lead Capture Bot", ..., lead_capture(), "leads")
    faq_id = ensure_bot("FAQ Bot", ..., faq_knowledge(base["id"]), "support")
    support_id = ensure_bot("Support Bot", ..., support_handoff(), "support")
```

- [ ] **Step 2: Walkthrough** — add a section "Create a bot with the wizard" to `docs/DEMO_WALKTHROUGH.md` after the login section: All Chatbots → Create New Chatbot → Website / Mobile App → Get more leads → builder shows the stepper → Install → Add as chat button → Install page → Copy Script → paste `http://127.0.0.1:8000/demo?chatbot_id=<id>` into Verify Installation → Connected; then Landing Page Bot → Open; then All Chatbots → ⋮ → Edit internal name. Keep the numbering style of the existing sections.

- [ ] **Step 3: Rehearsal** (never against the developer's `webchatbots` database — use the throwaway database procedure from the README):

```
cd backend && pytest -q && lint-imports && alembic -x db=<throwaway url> upgrade head
node --check app/static/widget.js
cd ../frontend && npm run typecheck && npm run build
python -m scripts.seed_demo   (against the throwaway DB, twice — second run is a no-op)
```

Headless walk (Edge over CDP per the project's browser-validation notes) through: `/chatbots/new` → purpose → builder with stepper → format → install → Verify against `/demo?chatbot_id=` → Connected pill → rename dialog. Save screenshots to the scratchpad and note the results in the report.

- [ ] **Step 4: Commit and tag**

```bash
git add backend/scripts/seed_demo.py docs/DEMO_WALKTHROUGH.md
git commit -m "docs+seed(demo): wizard walkthrough and purpose on seeded bots"
git tag -f v1.0-demo
```

---

## Self-review

**Spec coverage.** §3.1 → Task 7; §3.2–3.3 → Task 4; §3.4 → Task 5 (builder); §3.5 → Task 5; §3.6 → Task 6; §3.7 → Task 3; §3.8 → Task 7; §4.1–4.3 → Tasks 1–2; §4.4–4.5 → Task 3; §5 → Tasks 4–7; §6 → Task 4; §7 → Task 8; §9 → Tasks 1, 2, 8. Two spec details were narrowed while planning and are reflected in the spec: `install_format` is set but never cleared (router keeps `exclude_none`), and `/chat/{id}` keeps a static title instead of reading the bot name.

**Placeholders.** None: every code step carries its code; copy is verbatim from the guide.

**Type consistency.** `Chatbot.install_format` is `"chat_button" | "landing_page" | null` in Task 4 and `Format = NonNullable<...>` in Task 5; `InstallVerifyResult` shape in Task 4 matches the router's envelope in Task 2 (`url`, `verified_at`, `reason`); `chatbotApi.get` (Task 4) is what Task 5 queries; `WizardHeader({ current, backTo })` is used identically in Tasks 4–5; template ids in `purposes.ts` match `FLOW_TEMPLATES` ids.
