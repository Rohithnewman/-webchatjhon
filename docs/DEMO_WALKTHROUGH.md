# 10-minute demonstration script

Before the session: run `scripts\start-demo.ps1`, wait for all three windows, run the seed script, keep its three printed URLs handy. Open two browser windows side by side: dashboard (left) and the customer page (right). Log in as rohithnewman@gmail.com / Rogith@12345 (or the password you set with --owner-password).

## 1. The problem and the product (1 min)
"Businesses want a chatbot on their website without writing code, without sending their data to a vendor they don't control, and with a human able to step in. This platform lets a company design the conversation visually, plug in its own documents and its own AI key, and install it with one script tag."

## 2. Multi-tenancy and roles (1 min) — Settings → Team
Show the workspace name, the owner, and the agent member. Point out roles. Open Settings → Activity: every action so far is already recorded with actor and target. "Every table has a workspace id, every query requires it, and Postgres row-level security enforces it a second time."

## 2a. Three levels of administration (1 min)
- Log in as **admin@admin.com** (superadmin): Admin → Overview shows every organisation, workspace, user, bot and conversation on the platform; Organisations tab changes Rogith's plan to "pro"; Users tab can deactivate an account. Point out: the superadmin sees *metadata*, never a tenant's conversations.
- Log back in as **rohithnewman@gmail.com** (organisation owner) — the account you started the session with: Settings → Organisation lists "Default" and "Sales"; switch to Sales with the dropdown in the rail — the chatbot list is empty because workspaces isolate data; switch back.
- Settings → Team: the agent is a *member*, the viewer is a *viewer*. Open a private window as **viewer@rogith.example**: the builder shows the read-only banner, the Inbox has no reply box.

## 3. Bring your own AI key (30 s) — Settings → AI Providers
Show the stored Ollama credential ("ends with none" because Ollama is keyless). "Keys are encrypted before they reach the database and the API never returns them."

## 4. Knowledge base (1 min) — Knowledge
Show "Northwind FAQ" → the document is `ready` with N chunks. "Upload goes to a job table; a separate worker extracts text — PDF, DOCX, HTML — chunks it with overlap, embeds it, and stores it. Search is cosine similarity."

## 5. The builder (2 min) — Chatbot → FAQ Bot → Open Builder
Click "Visual" view. Walk the nodes: message → question → knowledge search → message using {{knowledge}} → end. Open one node's inspector. Show History tab with versions. Then apply the "Support with live-agent handoff" template to a new bot to show the condition with labelled true/false edges, the HTTP request node, delay, and handoff. Save. Publish it from Chat Flows.

## 6. Design the widget (1 min) — Chatbot Design
Change the theme colour and title, save. Switch to the customer page, reload: the bubble and header take the new colour. "The widget is a dependency-free script; it fetches the published design and talks only to a public, token-scoped API."

## 7. Talk to it as a visitor, then hand off (2 min) — customer page
Use the FAQ bot page: ask "How long do refunds take?" → answer quotes the document. Switch to the Support bot page: choose "Billing" → the bot says it is connecting to an agent. Left window: Inbox shows the conversation as `handoff`. Reply as the agent. Right window: the reply appears within two seconds. Close the conversation from the inbox; the widget input disables. Open the Lead Capture bot page (third URL the seed prints): choose an option by clicking a button instead of typing, and notice the email step switches the input to an email field.

## 8. Analytics and the audit trail (1 min) — Analytics, then Settings → Activity
Conversation tiles, the per-day bar, per-bot table. Then Activity: the agent reply and the close are the two newest rows.

## 9. Engineering (1 min) — show the terminal
Run `pytest` (≈190 tests against a throwaway Postgres database) and `lint-imports` (slice boundaries). Mention: vertical-slice backend, feature-sliced frontend, JWT with server-side role resolution, RLS, Postgres job queue with SKIP LOCKED, polling instead of WebSockets as a documented v1 trade-off.

## Likely questions
- **Why not WebSockets?** One auth model and simpler testing; the message API is turn-scoped so streaming is additive. Documented in the Phase 4 spec.
- **Why Postgres jobs instead of Celery/Redis?** Tenant-scoped, transactional, inspectable with SQL, no Redis on Windows. Documented in the Phase 3 spec.
- **Is the embedding real?** It is a deterministic local bag-of-words embedding behind the same interface a provider embedding uses; swapping to OpenAI embeddings changes one function. pgvector replaces the SQL cosine scan with one migration.
- **What happens if the AI key is missing?** The AI node degrades to an apology message and the flow continues; nothing 500s.
