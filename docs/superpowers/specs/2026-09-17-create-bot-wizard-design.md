# Create-bot wizard, install verification and internal rename — design

Date: 2026-09-17. Status: approved in chat (sections 1–3), with the
website-technology cards removed at the user's request.

Source: the Ambot365 "Create and Launch a Website Chatbot" user guide
(`Ambot365_Website_Chatbot_User_Guide_Full_Slide.pptx`, July 2026). The goal is
to make WebChatBots Builder follow that guide's creation journey so the demo
walks the same path the guide documents.

## 1. Goal

A first-time user opens All Chatbots, presses Create New Chatbot, and walks a
four-stage path — Select Platform › Usecase › Setup Bot › Install Bot — that
ends with a script installed on a website and verified as Connected. After
creation they can rename the bot's internal name from the list.

Web chat only. Other channels, WordPress/Shopify/Wix/Squarespace connectors,
mobile and embedded install formats, and multiple flows per bot are out of
scope (see §8).

## 2. Decisions

**D1 — The wizard is a set of routes, not a modal.** Stages 1 and 2 live under
`/chatbots/new`; stage 3 is the existing builder with a `?wizard=1` flag; stage
4 is `/chatbots/:id/install/format`. Every stage has a URL. The one-step
"New chatbot" dialog is removed; the sub-nav "New Bot" pill and the new
"Create New Chatbot" button both navigate to `/chatbots/new`.

**D2 — The bot is created when a purpose is chosen.** Choosing a purpose card
(or finishing the Other dialog) calls `POST /chatbots` with platform, use case
and note, then `PUT /chatbots/{id}/flow` with the purpose's template, then
navigates to `/builder/{id}?wizard=1`. The initial name is derived from the
purpose ("Lead capture bot", "Customer support bot", "Sales bot",
"Appointment bot", "New bot"). Stage 1 keeps its choice in router state; a
refresh on stage 2 returns to stage 1.

**D3 — Only Website / Mobile App is selectable.** WhatsApp, Instagram,
Facebook and Telegram cards render with a "Coming soon" badge and are not
clickable. `platform` is stored as `website`.

**D4 — Verify Installation fetches the URL.** The server fetches the public
URL and marks the bot Connected when the page contains the widget script with
this bot's id. Private and loopback addresses are refused, except the app's
own public root so the built-in `/demo` page verifies during the demo.

**D5 — Two install formats work.** "Add as chat button on website" (the
existing script) and "Put chatbot to your entire page" (a new public
full-page route). Mobile App and Embed-in-a-page cards render with "Coming
soon" on the format stage; their tabs do not exist on the install page.

**D6 — Internal name is the existing `name`.** The rename dialog edits
`Chatbot.name` with a 50-character limit on new input; the customer-facing
name stays in the flow's `design.botName` (Chatbot Design).

## 3. Stages and screens

### 3.1 Entry — All Chatbots (`/chatbots`)

- Header gains a primary button **Create New Chatbot** → `/chatbots/new`.
- Table gains a **Platform** column (Website badge with a globe icon) and a
  **Status** badge: `published` → "Active" (green check), `draft` →
  "Created" (grey), `archived` → "Archived". The existing Published toggle and
  the Versions column stay.
- Row actions become a "more" (⋮) menu: Edit internal name, Open builder,
  Test bot, Delete. The per-row icon buttons are replaced by that menu.

### 3.2 Stage 1 — Select Platform (`/chatbots/new`)

Layout from the guide: back arrow + "Create Chatbot" title on the left, the
**WizardStepper** centred (Select Platform › Usecase › Setup Bot › Install
Bot, current stage highlighted, completed stages ticked), heading "Select
Your Platform" with the guide's subtitle. Five cards in a 3 + 2 grid:
Website / Mobile App (selectable), WhatsApp, Instagram, Facebook, Telegram
(each with a "Coming soon" badge, `aria-disabled`). Clicking the website card
navigates to `/chatbots/new/purpose` with `{platform: "website"}` in router
state.

### 3.3 Stage 2 — Usecase (`/chatbots/new/purpose`)

Heading "Select Your Purpose". Five cards in a 2 + 2 + 1 grid: Get more
leads, Help my customers with their queries, Sell my products, Appointment
booking, Other use cases. Selecting the first four creates the bot (D2)
immediately, showing a pending state on the chosen card. Selecting Other
opens a dialog "Describe what you are trying to solve here." with a Use Case
text field (max 200), three suggestion chips (Customer Onboarding, Order
Tracking, Event / Webinar Registration) that fill the field, and Skip / Next
buttons. Next creates the bot with `use_case: "other"` and the note; Skip
creates it with `use_case: "other"` and no note. The note, when present,
becomes the bot's description.

Creation errors (for example `PLAN_LIMIT`) show a toast and leave the user on
the stage. If the flow seed fails after the bot was created, the user is still
taken to the builder (the bot has the default empty flow) and a toast says the
template could not be applied.

### 3.4 Stage 3 — Setup Bot (`/builder/:id?wizard=1`)

The existing BuilderPage. When `wizard=1` is present the builder's top bar
shows a back arrow + "Create Chatbot" and the WizardStepper with Setup Bot
active, and the Install button (visual and classic) navigates to
`/chatbots/:id/install/format`. Without the flag the builder is unchanged
(Install goes to `/chatbots/:id/install` as today). Nothing else in the
builder, Classic Builder, component panel, Test Bot or templates changes.

### 3.5 Stage 4 — Install Bot (`/chatbots/:id/install/format`)

Header with the stepper (Install Bot active). Heading "Link bot to your
platform", subtitle "Choose how you want to make your chatbot accessible to
your users." Four radio cards in a 2 × 2 grid with the guide's copy:

| Card | Behaviour |
|---|---|
| Add as chat button on website — Recommended badge | selectable; saves `install_format: "chat_button"`, then `/chatbots/:id/install` |
| Put chatbot to your entire page | selectable; saves `install_format: "landing_page"`, then `/chatbots/:id/install?tab=landing` |
| Bot in your Mobile App | "Coming soon", not selectable |
| Embed chatbot in a page | "Coming soon", not selectable |

The bot's current `install_format`, if any, is pre-selected. A footer note:
"You can always change the platform or install on additional pages later
from Install your Chatbot."

### 3.6 Install Your Chatbot (`/chatbots/:id/install`)

Rebuilt page. Title "Install Your Chatbot", subtitle "Install your chatbot on
your website or launch it as a landing page.", a "Help Guide ↗" link to the
walkthrough. Two tabs:

**Website Chatbot** (default). A status pill at the top right: "Connected"
(green, with the verified host) when `installed_url` is set, else "Not
Connected". Two-column layout:

- Left card "Chatbot Installation":
  - Step 1 "Install Your Chatbot" — "Add the following script inside the
    `<head>` or just before the closing `</body>` tag of your website", the
    snippet (unchanged shape: `widget.js`, `data-chatbot-id`, `data-api`) and a
    **Copy Script** button.
  - Step 2 "Verify Installation" — "Enter your website URL to confirm the
    script is active and correctly configured." URL input + **Verify** button.
    On `connected: true` the pill flips to Connected and a toast confirms; on
    false the reason renders under the field: unreachable → "We could not
    reach that page. Check the URL and that the site is published.",
    script_missing → "The page loaded but the chatbot script is not on it.",
    wrong_chatbot → "The page has a chatbot script for a different bot."
- Right card "Need Help?" with three rows: Email a Developer (`mailto:`),
  WhatsApp Support (external link), Test Bot (opens the existing simulator
  dialog).

**Landing Page Bot**. Shows the public URL `{BACKEND_ROOT}/chat/{id}` with
Copy link and Open buttons, and a one-line note that the page shows the bot
full-screen and works only when the bot is published.

### 3.7 Public landing page (`GET /chat/{chatbot_id}`)

Backend HTML page, built like `/demo`: minimal document, static title, and
the widget script with `data-mode="fullpage"`. The widget in
fullpage mode opens on load, hides the launcher, and sizes its panel to the
viewport (`position: fixed; inset: 0; border-radius: 0`). Unknown or
unpublished bots render the widget as today (the widget already shows its
locked/unavailable state).

### 3.8 Edit Internal Chatbot Name

Dialog titled "Edit Internal Chatbot Name", subtitle "Edit the name of your
chatbot for better identification and management". One field "Edit Chatbot
Name" with a live `n/50` counter; an info box: "This name is for internal
management only and is different from the name your customers see. To update
the customer-facing display name, edit it in Chatbot Design Settings." with a
link to `/chatbots/:id/design`. Cancel / Save. Save calls
`PATCH /chatbots/{id} {name}`; validation: trimmed, 1–50 characters. A bot
whose current name exceeds 50 characters opens with the field over the limit
and Save disabled until shortened.

## 4. API and data

### 4.1 Migration `0015_chatbot_wizard`

`chatbots` gains:

| column | type | constraint |
|---|---|---|
| `platform` | varchar(20) not null default `'website'` | check in (website, whatsapp, instagram, facebook, telegram) |
| `use_case` | varchar(20) null | check in (leads, support, sales, appointment, other) |
| `use_case_note` | varchar(200) null | |
| `install_format` | varchar(20) null | check in (chat_button, landing_page, mobile_app, embedded) |
| `installed_url` | varchar(2048) null | |
| `installed_at` | timestamptz null | |

Downgrade drops the six columns and the three check constraints.

### 4.2 Schemas

- `ChatbotCreate`: `name`, `description`, plus `platform: Literal["website"] = "website"`,
  `use_case: Literal["leads","support","sales","appointment","other"] | None = None`,
  `use_case_note: str | None` (max 200, stripped, empty → None).
- `ChatbotUpdate`: existing fields plus `install_format: Literal["chat_button","landing_page"] | None`
  (omitted = unchanged; the format can be changed but not cleared).
- `InstallVerifyRequest`: `url: str` (max 2048).
- Chatbot payload (`_chatbot_data`) adds all six fields.

### 4.3 Verify endpoint

`POST /api/v1/chatbots/{chatbot_id}/install/verify` — permission
`bots:manage`, rate-limited like other writes.

1. Parse the URL: scheme must be http or https; host required.
2. Resolve the host. Reject loopback, link-local, private and reserved
   addresses using the same guard the `http_request` node uses
   (`conversations/services.py`), extended with one allow-list entry: the
   host of the current request (`request.base_url`, the same origin `/demo`
   renders itself with) is always allowed, so the built-in demo page verifies.
3. Fetch with httpx: 5 s total timeout, at most 3 redirects (each redirect
   target re-checked with step 2), streaming read capped at 1 MB, `User-Agent:
   WebChatBots-Verifier`.
4. Connected when the body contains both `widget.js` and
   `data-chatbot-id="<this id>"` (attribute quotes may be single or double).
   If `widget.js` is present with a different `data-chatbot-id`, reason is
   `wrong_chatbot`; if absent, `script_missing`; any network/HTTP error or a
   non-2xx status, `unreachable`. Rejected URLs (step 1–2) are a 400
   `VALIDATION_ERROR`.
5. On success: set `installed_url` (the final URL after redirects) and
   `installed_at = now()`, record audit `chatbot.install_verified`
   (`target_id = chatbot_id`, metadata `{url}`), return
   `success({connected: true, url, verified_at})`. On failure: no write,
   return `success({connected: false, reason})`.

Verification is a live check only; the widget itself remains usable on any
origin as today.

### 4.4 Landing page route

`GET /chat/{chatbot_id}` in `main.py` next to `/demo`, `include_in_schema=False`.
Renders `static/chat.html` with `__ROOT__`, `__API__` and `__CHATBOT_ID__`.
The page title is the static "Chat"; no database read. Unknown ids still
render the page so the widget can show its own unavailable state.

### 4.5 Widget

`widget.js` reads `data-mode`. When `fullpage`: skip the launcher, open the
panel on load, apply the fullpage panel styles, hide the close button. All
other behaviour unchanged.

## 5. Frontend structure

```
pages/create-bot/SelectPlatformPage.tsx      /chatbots/new
pages/create-bot/SelectPurposePage.tsx       /chatbots/new/purpose
pages/create-bot/InstallFormatPage.tsx       /chatbots/:id/install/format
pages/create-bot/purposes.ts                 purpose id → label, description, template id, initial name
pages/install/InstallChatbotPage.tsx         rebuilt: tabs, verify, need-help
widgets/wizard/WizardStepper.tsx             the four-stage header, props: current stage
widgets/wizard/WizardHeader.tsx              back arrow + title + stepper (used by the three wizard pages and BuilderPage)
features/chatbot-rename/RenameChatbotDialog.tsx
features/flow-templates/templates.ts         + "sell-products", "appointment-booking", "generic"
entities/chatbot/api.ts, types.ts            new fields, verifyInstall()
```

CSS appended to `frontend/src/styles.css` under a `/* create-bot wizard */`
section. Cards reuse the existing card tokens; the stepper is a horizontal
list with `aria-current="step"`.

Removed: `features/chatbot-create/ui/CreateChatbotDialog.tsx` and the dialog
state in `AmbotShell`/`ChatbotSubNav` (the pill becomes a link).

## 6. Purpose templates

| purpose | template | notes |
|---|---|---|
| leads | `lead-capture` (existing) | |
| support | `support-handoff` (existing) | |
| sales | `sell-products` (new) | welcome → choice of three product categories → one message per branch → email input → end |
| appointment | `appointment-booking` (new) | welcome → name question → choice of service → question "preferred date and time" → email input → confirmation message → end |
| other | `generic` (new) | welcome "Hi there! 👋 Welcome to our chatbot — we're glad to have you here!" → question "How can we help you today?" (variable `request`) → end; `nodeTypes` listed so the templates dialog can show it |

Node ids and layout follow the existing helpers in `templates.ts`; every new
node type used already exists in the engine. The templates dialog lists all
five, so the two new ones are also reachable after creation.

## 7. Seed and docs

`seed_demo.py` sets `platform="website"` and `use_case` on the three demo bots
(Lead Capture → leads, FAQ → support, Support → support) and leaves
`install_format`/`installed_url` null so the demo shows the format stage and
the live verification against `/demo?chatbot_id=…`. The walkthrough gains a
"Create a bot with the wizard" section that follows the guide's stage order
and ends with Verify Installation against the demo page.

## 8. Out of scope

Non-website channels (cards are display-only), mobile and embedded install
formats, website-technology connectors (WordPress, Shopify, Wix,
Squarespace), multiple named flows per bot with default/revisit switches,
import size limits, and origin enforcement for the widget.

## 9. Testing

Per the owner's policy (no test suites; tests only for failures or critical
paths), backend tests cover the one security-relevant path, the verify
endpoint, in `chatbots/tests/test_install_verify.py`:

1. a private-address URL is rejected with 400 `VALIDATION_ERROR` and nothing
   is stored;
2. the app's own `/demo?chatbot_id=<id>` page connects, stores `installed_url`
   and `installed_at`, and writes the audit row;
3. a page carrying another bot's id returns `connected: false, reason:
   "wrong_chatbot"` and stores nothing.

The existing create test asserts the new fields round-trip. Frontend:
`npm run typecheck`, `npm run build`, and a headless-browser rehearsal of all
four stages plus rename against the seeded throwaway database.
