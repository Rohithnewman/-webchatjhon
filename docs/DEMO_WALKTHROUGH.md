# 10-minute demonstration script

Before the session: run `scripts\start-demo.ps1`, wait for all three windows, run the seed script, keep its three printed URLs handy. Open two browser windows side by side: dashboard (left) and the customer page (right). Log in as rohithnewman@gmail.com / Rogith@12345 (or the password you set with --owner-password).

## 1. Create a bot with the wizard (2 min) — All Chatbots
All Chatbots → Create New Chatbot. Select Your Platform: only "Website / Mobile App" is selectable (the others show "Coming soon"); pick it. Choose your purpose: pick "Get more leads" — the bot is created and its lead-capture template applied, and the builder opens with the wizard stepper showing Setup Bot active. Press Install (top bar) → Link bot to your platform: pick "Add as chat button on website" (Recommended). On the Install Your Chatbot page, press Copy Script, then paste `http://127.0.0.1:8000/demo?chatbot_id=<the new bot's id>` into the Verify Installation field and press Verify — the status pill flips to Connected. Go to All Chatbots and turn on the bot's toggle in the Published column — a wizard-created bot is still a draft, and `/chat/<id>` won't serve it until it's published. Return to Install Your Chatbot → Landing Page Bot tab and press Open — the bot fills the whole page at `/chat/<id>`. Back on All Chatbots, open the row's ⋮ menu → Edit internal name to rename the bot for the list.

## 2. The problem and the product (1 min)
"Businesses want a chatbot on their website without writing code, without sending their data to a vendor they don't control, and with a human able to step in. This platform lets a company design the conversation visually, plug in its own documents and its own AI key, and install it with one script tag."

## 3. Multi-tenancy and roles (1 min) — Settings → Team
Show the workspace name, the owner, and the agent member. Point out roles. Open Settings → Activity: every action so far is already recorded with actor and target. "Every table has a workspace id, every query requires it, and Postgres row-level security enforces it a second time."

## 3a. Three levels of administration (1 min)
- Log in as **admin@admin.com** (superadmin): Admin → Overview shows every organisation, workspace, user, bot and conversation on the platform, plus how many organisations are suspended or expired; Organisations tab changes Rogith's plan to "pro"; Users tab can deactivate an account. Point out: the superadmin sees *metadata*, never a tenant's conversations.
- Suspend Northwind → log in as demo@northwind.example → lock screen → reactivate: in the Organisations tab, set Northwind Outdoor's status to "suspended"; in a private window, log in as demo@northwind.example and the dashboard is replaced by a lock screen ("This organisation has been suspended") with a Sign out button; back in the admin tab, set Northwind's status to "active" again and reload the private window — the dashboard is back.
- Set Northwind's conversations-per-month limit to 3 in the Organisations tab; on the Northwind customer page the fourth chat start shows the widget's unavailable message.
- Log back in as **rohithnewman@gmail.com** (organisation owner) — the account you started the session with: Settings → Organisation lists "Default" and "Sales"; switch to Sales with the dropdown in the rail — the chatbot list is empty because workspaces isolate data; switch back.
- Settings → Team: the agent holds the custom **Support agent** role (can reply in the inbox and view analytics; cannot build bots, manage knowledge, members or the organisation), the viewer is a *viewer*. Open a private window as **viewer@rogith.example**: the builder shows the read-only banner, the Inbox has no reply box.
- Settings → Roles: show the permission checkbox grid, create a role (e.g. pick a couple of permissions and save), then assign it to a teammate from Settings → Team to show a custom role gating access end to end.

Note: a database seeded before this change may still show an empty "Platform" organisation in the superadmin's Organisations list — it can be deleted.

## 4. Bring your own AI key (30 s) — Settings → AI Providers
Show the stored Ollama credential ("ends with none" because Ollama is keyless). "Keys are encrypted before they reach the database and the API never returns them."

## 5. Knowledge base (1 min) — Knowledge
Show "Northwind FAQ" → the document is `ready` with N chunks. "Upload goes to a job table; a separate worker extracts text — PDF, DOCX, HTML — chunks it with overlap, embeds it, and stores it. Search is cosine similarity."

## 6. The builder (2 min) — Chatbot → FAQ Bot → Open Builder
Click "Visual" view. Walk the nodes: message → question → knowledge search → message using {{knowledge}} → end. Open one node's inspector. Show History tab with versions. Then apply the "Support with live-agent handoff" template to a new bot to show the condition with labelled true/false edges, the HTTP request node, delay, and handoff. Save. Publish it from Chat Flows.

## 7. Design the widget (1 min) — Chatbot Design
Change the theme colour and title, save. Switch to the customer page, reload: the bubble and header take the new colour. "The widget is a dependency-free script; it fetches the published design and talks only to a public, token-scoped API."

## 8. Talk to it as a visitor, then hand off (2 min) — customer page
Use the FAQ bot page: ask "How long do refunds take?" → answer quotes the document. Switch to the Support bot page: choose "Billing" → the bot says it is connecting to an agent. Left window: Inbox shows the conversation as `handoff`. Reply as the agent. Right window: the reply appears within two seconds. Close the conversation from the inbox; the widget input disables. Open the Lead Capture bot page (third URL the seed prints): choose an option by clicking a button instead of typing, and notice the email step switches the input to an email field.

## 9. Analytics and the audit trail (1 min) — Analytics, then Settings → Activity
Conversation tiles, the per-day bar, per-bot table. Then Activity: the agent reply and the close are the two newest rows.

## 10. Engineering (1 min) — show the terminal
Run `pytest` (231 tests against a throwaway Postgres database) and `lint-imports` (slice boundaries). Mention: vertical-slice backend, feature-sliced frontend, JWT with server-side role resolution, RLS, Postgres job queue with SKIP LOCKED, polling instead of WebSockets as a documented v1 trade-off.

## Likely questions
- **Why not WebSockets?** One auth model and simpler testing; the message API is turn-scoped so streaming is additive. Documented in the Phase 4 spec.
- **Why Postgres jobs instead of Celery/Redis?** Tenant-scoped, transactional, inspectable with SQL, no Redis on Windows. Documented in the Phase 3 spec.
- **Is the embedding real?** It is a deterministic local bag-of-words embedding behind the same interface a provider embedding uses; swapping to OpenAI embeddings changes one function. pgvector replaces the SQL cosine scan with one migration.
- **What happens if the AI key is missing?** The AI node degrades to an apology message and the flow continues; nothing 500s.
- **What happens to a suspended organisation's widgets?** The workspace API and the widget's own endpoints both check the subscription and return `403 SUBSCRIPTION_LOCKED`; the visitor-facing bot stops answering the same moment the admin flips the switch.
