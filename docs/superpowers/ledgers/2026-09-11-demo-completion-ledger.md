# SDD ledger — plan: docs/superpowers/plans/2026-09-11-demo-completion.md

Branch: demo-completion (created from main @ 6b94e23+1). Ruling: work on an in-place feature branch instead of a git worktree — the backend venv, node_modules, Postgres storage paths and the running dev servers all live in this checkout; a worktree would need both toolchains reinstalled. Cost if wrong: none to code; only isolation from the user's main checkout, which they are not using concurrently.
Spec: architecture + phase 3/4 specs reachable (docs/superpowers/specs). Phases 1b/5 and Parts D–F have no detailed spec; rulings there are provisional against the architecture doc §5.
Execution order: 1–12, 14–22, then 13 last.

## Pre-flight scan (shared files / interfaces)
| Tasks | Shared thing | Produces vs consumes | Finding |
|---|---|---|---|
| 3,5,10,15 | App.tsx routes | each adds one <Route> | additive, ok |
| 3,5,10,15,17 | DashboardShell props {title,subtitle?,actions?,children} | same shape everywhere | ok |
| 3,6,7,17 | SettingsPage tabs | 3 creates; 6 restates full file; 7 and 17 give exact edits (17 makes "organization" first+default) | ok |
| 6,14 | identity_api.UserSummary | 6 adds full_name=""; 14 appends is_superadmin=False, created_at=None and updates _summary | ok, appended defaults |
| 6,16 | tenancy_api.WorkspaceView | 6: (id,name,organization_name); 16 adds organization_id and updates get_workspace | ok |
| 4,19,20 | widget.js applyDesign/render | 4 creates applyDesign; 19 rewrites render/take and adds .wcb-opt overrides; 20 replaces applyDesign with a superset | ok, later supersedes earlier |
| 8,18 | ChatFlowsPage | 8 rewrites; 18 adds readOnly gating | ok |
| 9,18 | ChatbotSubNav props | 9 adds onOpenTemplates?; 18 makes onCreateNewBot optional | ok |
| 11,22 | scripts/seed_demo.py | 11 creates with Northwind owner; 22 makes Rogith the owner and Northwind a second org | ok, 22 restates constants |
| 12,22 | README, DEMO_WALKTHROUGH | 22 inserts sections | ok |
| 15 vs 3,6,8 | auth-store path | 15 moves features/auth/model/auth-store → entities/session and updates importers; 17,18 use new path | ok |
| 14 tests | stats counts include the superadmin's own "Platform" org | orgs=3, users=3, workspaces=3 | consistent |
| 16 | tenancy create_workspace returns created_at from server default | may be None after flush with asyncpg | note for implementer: refresh the row |
| 19 API test | transcript index | fixed to [0] before execution | ok |
| 2 | hand-written PDF fixture | pypdf non-strict must recover missing xref | risk: implementer may need reportlab-free alternative; rule if it fails |
| 1 | subprocess test | uses sys.executable (venv) + PYTHONPATH | ok |
Self-consistency: each task's tests reference only names its own steps define. No plan-mandated rubric violations found (no empty tests, no verbatim duplicated logic blocks except the templates.ts/demo_flows.py mirror, which the plan declares intentionally).

## Progress
Tasks 1+2: dispatched (batched) — BASE 0cdd49b, implementer sonnet
Task 1: complete (commits 0cdd49b..512f50e, review clean)
Task 2: complete (commits 512f50e..02ecd0d, review clean). Ruling: PDF test fixture built with pypdf PdfWriter instead of the hand-written bytes (pypdf 6.18 raised "startxref not found") — verifies real parsing; cost if wrong: none to production code.
Task 2: minor (deferred): test fixture uses pypdf private `_add_object`; `_html` extractor keeps entities and <script>/<style> content; mid-file imports in test_ingestion.py (plan-mandated append).
Task 3: dispatched — BASE 02ecd0d, implementer sonnet
Task 3: complete (commits 02ecd0d..074e4d9, review clean)
Task 3: minor (deferred): `.dashboard-page-actions` has no CSS rule (plan-mandated; add `display:flex;gap:8px` when first used — Task 5 passes `actions`); credentials form always sends make_default:true (plan-mandated UX gap).
Task 4: dispatched — BASE 074e4d9, implementer sonnet
Task 4: complete (commits 074e4d9..ffc7b30, review clean)
Task 4: Ruling: reviewer's Important "positionWeb=center unhandled" (plan-mandated) — deferred to Task 20, whose applyDesign superset handles "center" explicitly; cost if wrong: one position value falls back to bottom-right until Task 20 lands.
Task 4: minor (deferred): unpublished-bot test 404s even without the route (weak RED); defaults test lacks status assertion; unknown windowSize silently no-ops.
Task 5: dispatched — BASE ffc7b30, implementer sonnet (carries Task 3 minor: add `.dashboard-page-actions` CSS)
Task 5: Ruling: reviewer Important (plan-mandated) "totals are all-time while daily/by_chatbot are windowed" — fix it: `status_counts` gains optional `since: datetime | None = None` (filter `created_at >= since` when given), router passes `since`; all totals become window-scoped. Cost if wrong: none functionally; existing callers of status_counts keep default behaviour.
Task 5: minor (deferred): no test for deleted-chatbot fallback name; no test for by_chatbot ordering.
Task 5: fix round 1/5 (1 addressed, 0 open — status_counts window-scoped; commits 9154b40..93dfc93)
Task 5: complete (commits ffc7b30..93dfc93, review clean after 1 fix round)
Task 6: dispatched — BASE 93dfc93, implementer sonnet
Note (user, mid-run): if context usage nears 90%, write a handoff prompt for 'Gemini Flash 3.1' into this workspace, then compact.
Task 6: complete (commits 93dfc93..ea86794, review clean). Ruling: `email_validator.TEST_ENVIRONMENT = True` in backend/conftest.py (test-only) so `.test` TLD emails in tests pass — cost if wrong: none in production.
Task 6: minor (deferred): add_member lists all memberships twice (perf at scale); email-uniqueness race surfaces EMAIL_TAKEN instead of attach; an admin can demote/remove the sole owner (no role hierarchy check).
Task 7: dispatched — BASE ea86794, implementer sonnet
Task 7: complete (commits ea86794..4f89c50, review clean)
Task 7: minor (deferred): ActivityPanel collapses every error into the permissions message (plan-mandated); raw JSON metadata untruncated; endpoint has no response model (codebase pattern).
Task 8: dispatched — BASE 4f89c50, implementer sonnet
Task 8: complete (commits 4f89c50..885cf76, review clean)
Task 8: minor (deferred): delete always navigates to /chatbots even for a non-selected bot (plan-mandated); redundant markSaved after load in restore; publish toggle lacks a pending guard.
Task 9: dispatched — BASE 885cf76, implementer sonnet
Task 9: Ruling: reviewer Important (plan-mandated) "choice nodes in lead-capture/support-handoff lack `variable`, so the following condition always reads None" — real; fix by adding variable "interest"/"issue" to those choice nodes in templates.ts AND in the plan's mirrored demo_flows.py (plan + task-11 brief patched now). Also dedupe faq-knowledge nodeTypes. Cost if wrong: none.
Task 9: fix round 1/5 (2 addressed, 0 open — choice variables + nodeTypes dedupe; commits 3f97033..cf9cf22)
Task 9: complete (commits 885cf76..cf9cf22, review clean after 1 fix round)
Task 9: minor (deferred): unused `Code2` import in ChatbotSubNav.tsx (pre-existing).
Task 10: dispatched — BASE cf9cf22, implementer sonnet
Task 10: Ruling: a stale nested repo at frontend/.git (own history, same GitHub remote) captured the implementer's commit 7941399 instead of the project repo. Renamed frontend/.git -> frontend/.git-nested-disabled (reversible) so every git command resolves to the project repo; re-committed Task 10's 7 files in the project repo as controller bookkeeping (no code changes). Cost if wrong: the user loses nothing — rename back to restore the nested repo.
Task 10: complete (commits cf9cf22..51ea1cf, review clean; .gitignore follow-up commit 9ca6fa4)
Task 10: minor (deferred): dead CSS for .conversations-shell/.knowledge-shell family; inner indentation in KnowledgePage; calc(100vh - 140px) is an estimate (plan-mandated).
Task 11: dispatched — BASE 9ca6fa4, implementer sonnet
Task 11: Ruling: pre-existing bug found by the live seed — `python -m app.worker` runs worker.py as __main__ while knowledge/worker.py registers into the importable `app.worker` module, so HANDLERS is empty and documents never ingest. Load-bearing for the demo; fixed as Task 11 fix round 1 (out of the brief's file list): __main__ block re-enters through `app.worker` main(); add `--list-handlers` flag + subprocess regression test. Cost if wrong: none; the worker simply starts working.
Session resumed 2026-09-14. Note: commit c4e3146 "commit message goes here" (author Newman, tsbuildinfo only) and uncommitted edits under frontend/src/widgets/animated-login + untracked frontend/scripts/ belong to the user's parallel work — never staged or touched by this plan.
Task 11: fix round 1/5 dispatched — fresh implementer (sonnet) for the worker HANDLERS registration bug; FIX_BASE 751c7fe
Task 11: Ruling: reviewer Important #1 (plan-mandated) "seeded FAQ flow lacks the template's llm node" — keep the omission on purpose (seeded bot must work with no model; an unreachable llm node apologises every turn); plan + brief amended to say so; demo_flows.py docstring must state it. Cost if wrong: seeded FAQ bot has 6 nodes vs the 7-node template — cosmetic.
Task 11: Ruling: reviewer Important #2 "worker entrypoint subprocess test has no timeout (a regression hangs CI)" — real; fix with timeout + TimeoutExpired -> assertion failure.
Task 11: fix round 2/5 dispatched — resume implementer; FIX_BASE 0f7ee9b
Task 11: fix round 1/5 (1 addressed — worker HANDLERS registration + registry import; commits 751c7fe..0f7ee9b)
Task 11: fix round 2/5 (3 addressed, 0 open — FAQ seed difference documented, test timeout, comment placement; commits 0f7ee9b..bba4249)
Task 11: complete (commits 9ca6fa4..bba4249, review clean after 2 fix rounds)
Task 12: dispatched — BASE bba4249, implementer sonnet
Task 12: parked — reviewer "Critical: commit attribution 'Claude Fable 5.1' is not a real model" — Ruling: reviewer is wrong; the trailer is the attribution this session is instructed to use. No change.
Task 12: Ruling: reviewer Important "backend/*.log redundant with *.log in .gitignore" (plan-mandated) — harmless, left as-is; cost if wrong: none.
Task 12: minor (deferred): README hardcodes the PostgreSQL 18 psql path.
Task 12: complete (commits bba4249..8518461, 1 parked)
Task 14: dispatched — BASE 8518461, implementer sonnet
Session resumed 2026-09-15; Task 14 review report recovered from the reviewer agent.
Task 14: Ruling: reviewer Important (plan-mandated) "test_stats_and_organizations_span_every_tenant asserts exact platform-wide counts; tests/test_concurrency.py commits real rows into the shared throwaway DB, so the full suite fails (5 != 3)" — real; fix the test to assert deltas (before/after the test's own registrations) and a superset for organisation names. Cost if wrong: none to production code.
Task 14: minor (deferred): function-local `from sqlalchemy import func` in chatbots/api.py; ensure_superadmin double FOR UPDATE; set_organization_plan re-runs the full counts join.
Task 14: fix round 1/5 dispatched — resume implementer; FIX_BASE 0e3f705
Task 14: fix round 1/5 (1 addressed, 0 open — order-independent stats test; commits 0e3f705..0bf840e)
Task 14: complete (commits 8518461..0bf840e, review clean after 1 fix round)
Task 15: Ruling: `widgets/animated-login/ui/login/LoginForm.tsx` imports the auth store and sits in the user's in-flight work area — leave a re-export shim at `features/auth/model/auth-store.ts` pointing to `entities/session/auth-store.ts` and do not touch animated-login files. Cost if wrong: one extra 1-line file.
Task 15: dispatched — BASE 0bf840e, implementer sonnet
Task 15: complete (commits 0bf840e..c681d56, review clean)
Task 15: minor (deferred): features/auth shim to remove once LoginForm.tsx migrates; inline style in AdminPage users table.
Task 16: dispatched — BASE c681d56, implementer sonnet
Task 16: Ruling: reviewer Important (plan-mandated) "rename_workspace audits under ctx.workspace_id instead of the renamed workspace_id" — real; fix to `workspace_id=workspace_id` plus a test asserting the audit row's workspace_id/target_id for a cross-workspace rename. Cost if wrong: none.
Task 16: minor (deferred): whitespace-only names pass min_length then strip to ""; audit metadata stores unstripped name; bare assert in rename_organization.
Task 16: fix round 1/5 dispatched — resume implementer; FIX_BASE 2fa74f0
Task 16: fix round 1/5 (1 addressed, 0 open — rename audit under renamed workspace + test; commits 2fa74f0..a2ba6ca)
Task 16: complete (commits c681d56..a2ba6ca, review clean after 1 fix round)
Task 17: dispatched — BASE a2ba6ca, implementer sonnet
Task 17: Ruling: reviewer Important #1 (plan-mandated) ".workspace-switcher (56px) + sign-out (54px) in a row-flex .primary-nav-bottom inside a 68px rail overflow" — real; fix by making .primary-nav-bottom a column flex with gap. Important #2 (plan-mandated) "WorkspaceSwitcher mutation has no onError" — real; add toast error. Cost if wrong: none.
Task 17: minor (deferred): shared loading state across per-row Switch buttons; refresh-token race when the access token is expired at switch time (body carries the pre-rotation refresh token); duplicated clear+navigate pattern.
Task 17: fix round 1/5 dispatched — resume implementer; FIX_BASE bb4d204
Task 17: fix round 1/5 (2 addressed, 0 open — column rail layout, switcher onError; commits bb4d204..23ae993)
Task 17: complete (commits a2ba6ca..23ae993, review clean after 1 fix round)
Task 18: dispatched — BASE 23ae993, implementer sonnet
Task 18: Ruling: reviewer Important #1 (plan-mandated) "fieldset disabled wraps also disable ConfigPanel/ClassicBuilder tab buttons" — real; fix by disabling only inputs/actions (ConfigPanel gets a readOnly prop; ClassicBuilder wraps only the fields stack). #2 "readOnly true for everyone while /auth/me loads" — real; expose `isReady` from useMe and compute readOnly = isReady && !can(...). #3 "BuilderPage's own New Bot stays active for viewers" — in scope; gate it and guard createMutation. Cost if wrong: none.
Task 18: minor (deferred): visual canvas drag/connect not gated for viewers (persistence is guarded); banners added on ChatFlows/Knowledge beyond the letter of the brief.
Task 18: fix round 1/5 dispatched — resume implementer; FIX_BASE 9ed9e0b
Task 18: fix round 1/5 (3 addressed, 0 open — ConfigPanel readOnly prop, isReady gating, builder New Bot; commits 9ed9e0b..8709ca0)
Task 18: complete (commits 23ae993..8709ca0, review clean after 1 fix round)
Task 18: minor (deferred): with no userId the me query never becomes ready so readOnly stays false (unauthenticated users are redirected before reaching these routes).
Task 19: dispatched — BASE 8709ca0, implementer sonnet
Task 19: Ruling: reviewer Important #1/#2 (plan-mandated) "explicit kind with non-URL text puts unvalidated text into href/src (javascript: possible); broken media silent" — real; fix in engine `_message_meta`: tag image/video/link only when the text is a bare http(s) URL, else {} (renders as text). Test added. Cost if wrong: an editor who types prose with kind=link sees plain text instead of a broken link.
Task 19: minor (deferred): ChildNode.remove() not IE11; MessageBody imported feature→feature (plan-mandated); kind not whitespace-stripped.
Task 19: fix round 1/5 dispatched — resume implementer; FIX_BASE b3ff919
Task 19: fix round 1/5 (1 addressed, 0 open — media kinds only for bare http(s) URLs; commits b3ff919..b125b0c)
Task 19: complete (commits 8709ca0..b125b0c, review clean after 1 fix round)
Task 20: dispatched — BASE b125b0c, implementer sonnet
Task 20: Ruling: reviewer Important #1 ".wcb-msg.bot align-self:flex-start now fights .wcb-row align-items" — real regression; fix with a `.wcb-row .wcb-msg{align-self:auto}` rule. #2 (plan-mandated) "handleResetPreview does nothing for unpublished bots" — add `reset()` to useWidgetSimulator clearing conversation/token/messages/status/error and call it. Cost if wrong: none.
Task 20: minor (deferred): `import json` inside validator; hook error not cleared on send/poll; simMessages unmemoised; emoji avatars depend on UTF-8 content-type of widget.js.
Task 20: fix round 1/5 dispatched — resume implementer; FIX_BASE 7d589f4
Task 20: fix round 1/5 (2 addressed, 0 open — row alignment, simulator reset; commits 7d589f4..1d8d7a1)
Task 20: complete (commits b125b0c..1d8d7a1, review clean after 1 fix round)
Task 21: dispatched — BASE 1d8d7a1, implementer sonnet
Task 21: Ruling: reviewer Important #1 (plan-mandated) "graph.load resets dirty so the Unsaved pill never shows" — fix with an explicit pending flag in BuilderPage. #2 "stale doc race when switching to visual mid-debounce" — fix by flushing the pending save in onSwitchToVisual. #3 "slugifyOption collisions duplicate edge ids" — fix by including the option index in the id. #4 "no generic fallback UI for choice/condition; engine falls back positionally" — Ruling: keep the engine semantics; add a hint line telling users to route every option; cost if wrong: partially routed choices follow positional edges (documented in the hint).
Task 21: minor (deferred): up-button not disabled at index 1; duplicate option text shares an edge/key; Customize/Advanced field duplication (plan-mandated).
Task 21: fix round 1/5 dispatched — resume implementer; FIX_BASE d8b1f2c
Task 21: fix round 1/5 (4 addressed, 1 new open — onSuccess clears classicPending while a newer edit is queued; commits d8b1f2c..927e974)
Task 21: fix round 2/5 dispatched — resume implementer; FIX_BASE 927e974
Task 21: fix round 2/5 (1 addressed, 0 open — pending flag only cleared when nothing newer is queued; commits 927e974..df51cff)
Task 21: complete (commits 1d8d7a1..df51cff, review clean after 2 fix rounds)
Task 21: minor (deferred): unreferenced .routing-hint CSS rule; last-write-wins on concurrent flush+timer saves; duplicate option text shares an edge in the routing display.
Task 22: dispatched — BASE df51cff, implementer sonnet
Task 22: BLOCKED report — rohithnewman@gmail.com already exists in the dev DB (created 2026-08-17, password unknown); seed cannot log in. Ruling: never overwrite the user's password. Seed gains `--owner-password` (env SEED_OWNER_PASSWORD) and a clear error naming both remedies; add scripts/set_password.py for the user to align the password themselves; verify the live seed against a throwaway database (webchatbots_seedcheck) so the user's dev DB is untouched. Cost if wrong: the user must run one command before the demo seed works on their existing DB (documented in README). Stray uvicorn/worker on 8010 stopped by the controller.
Task 22: fix round 1/5 dispatched — resume implementer; base df51cff (no commit yet)
Task 22: Ruling: `.test` TLD is rejected by pydantic EmailStr (RFC 6761 special-use) so agent/viewer seed emails become agent@rogith.example / viewer@rogith.example (Option A; production validation stays strict). Plan + brief patched. set_password.py may import app.core.registry to resolve FK metadata (same reason as worker.py). Cost if wrong: none.
Task 22: fix round 1/5 (owner-password override, set_password.py, throwaway-DB verification; no commit) and fix round 2/5 (.example addresses; commit bd2102d, live seed verified twice + 5 account checks)
Task 22: Ruling: reviewer Important (plan-mandated) "walkthrough intro still says log in as demo@northwind.example, which now owns no bots" — real; fix to rohithnewman@gmail.com / Rogith@12345. Minors fixed alongside: conflict message tailored per account; README sentences separated.
Task 22: minor (deferred): ensure_superadmin runs before --help (plan-mandated).
Task 22: fix round 3/5 dispatched — resume implementer; FIX_BASE bd2102d
Task 22: fix round 3/5 (3 addressed, 0 open — walkthrough login, conflict message, README spacing; commits bd2102d..79d7592)
Task 22: complete (commits df51cff..79d7592, review clean after 3 fix rounds)
Task 13: Ruling: the brief's "DROP DATABASE webchatbots" is destructive to the user's dev data (their pre-existing account) — rehearsal runs against a throwaway database instead; the user's DB is never dropped. `git add -A` is forbidden (user's parallel frontend work); tag HEAD as v1.0-demo only if the tree is clean apart from that work. Cost if wrong: none.
Task 13: dispatched — BASE 79d7592, implementer sonnet
Task 13: complete (no commits; tag v1.0-demo on 79d7592; pytest 188 passed, lint 3 kept, typecheck clean, build ok, rehearsal 35/35 on a throwaway DB)
Final whole-branch review: dispatched — range 0cdd49b..79d7592, reviewer opus
Final review (opus) received 2026-09-16: 0 Critical, 3 Important (design preview drops first typed message — stale closure in useWidgetSimulator.send; walkthrough §7 promises email-field + image steps the seeded flows lack; widget themeColor interpolated raw into a <style> on the host page), plus minors. Ruling: ONE fix wave covering the 3 Important + cheap items (SAFE_COLOR guard for themeColor/chatBgColor; walkthrough §7 reworded to the Lead bot's email step and image claim dropped; whitespace-only org/workspace names rejected; widget.js charset=utf-8; "All Chatbots" links to /chatbots; templates dialog gated for viewers; seed conversations only on first run; html.escape(root) in /demo; git rm --cached tsbuildinfo; README/walkthrough numbers refreshed). Ledger note: Task 16's list_user_workspaces(user_id)/list_workspaces_with_member_counts(organization_id) are tenancy-metadata queries scoped by a different narrow key — sanctioned like platform_*; cost if wrong: none. Everything else deferred per the reviewer's triage.
Final fix wave: dispatched — FIX_BASE 79d7592, implementer sonnet
Final fix wave: commits 79d7592..4e75387 (be7cc6e, 7c715ff, 4e75387); scoped re-review dispatched
Final fix wave re-review: findings 1-8,10 ADDRESSED; 9 (tsbuildinfo untracking) NOT addressed by the implementer — done by the controller as bookkeeping (git rm --cached + commit), tag v1.0-demo moved to the final HEAD. Ruling: residual out-of-scope observation "preview session not reset when the selected chatbot changes" deferred — cost if wrong: a stale preview session until Reset/refresh.
Subscriptions (post-plan, user-approved bounded design 2026-09-16): brief at subscriptions-brief.md; backend implementer dispatched — BASE 08eda37
Subscriptions backend: commit b082606, review Approved. Ruling: reviewer Important "get_workspace_context runs the seat-count join on every request" — fix with a status-only lookup (`get_subscription_status_for_workspace`) used by the guard and the widget lock; cost if wrong: none. Minors deferred: duplicate org fetch in /auth/me; seat check does not simulate re-adding an existing org member; explicit starts_at null ignored; no row lock on limit checks.
Subscriptions frontend: commit 92834a5; review dispatched. Backend fix round dispatched (resume backend implementer).
Subscriptions: backend fix round 1 (2683ae8) re-review clean; frontend review Approved (minors deferred: shared mutation pending state disables all rows; cleared start-date input silently no-ops; tone map duplicated; unused top-level plan/member_count fields). Final tree: pytest 199 passed, lint 3 kept, typecheck clean, build ok, widget syntax ok. Tag v1.0-demo moved to HEAD.
