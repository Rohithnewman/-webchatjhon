# SDD ledger — plan: docs/superpowers/plans/2026-09-17-create-bot-wizard.md

Branch: demo-completion (in place, same standing rulings as the two earlier ledgers: never stage the user's animated-login/scripts work or the root .pptx, never drop the dev DB). Spec: docs/superpowers/specs/2026-09-17-create-bot-wizard-design.md (approved in chat 2026-09-17; user chose scope "wizard + install + rename", chat-button + landing formats, website-only channel cards, fetch-based verification, routed wizard; user then removed the website-technology cards). User skipped the written-spec review gate ("skip doc proceed plan"). Execution: subagent-driven, starting after the roles plan's Task 6 frontend commit lands.

## Pre-flight scan
| pair / task | produces → consumes | finding |
|---|---|---|
| T1 → T2 | `Chatbot.installed_url/installed_at`, `repository.update_chatbot(**changes)` → `service.mark_installed` | ok; T2 widens the `**changes` annotation from str to object |
| T1 → T4 | `_chatbot_data` six keys → `Chatbot` TS type | key names match (platform, use_case, use_case_note, install_format, installed_url, installed_at) |
| T2 → T4/T6 | verify envelope `{connected,url,verified_at}` / `{connected,reason}` → `InstallVerifyResult` | match |
| T3 → T6 | `GET /chat/{id}` → Landing tab link `${BACKEND_ROOT}/chat/${id}` | match |
| T4 → T5 | `WizardHeader({current, backTo})`, `chatbotApi.get/update` → BuilderPage, InstallFormatPage | match; T5's `Format` = NonNullable of T4's `install_format` |
| T4 → T7 | `chatbotApi.update` name → RenameChatbotDialog | ok |
| T4 (self) | `SelectPurposePage` listing calls hooks after a conditional return | plan step 6 notes the reorder; the implementer must declare `useMutation` before the `Navigate` guard |
| T4 ↔ roles plan T6 | both edit AmbotShell/ChatFlowsPage/BuilderPage gating | ordering constraint: this plan starts after roles T6 lands; gates use `can("bots:manage")` |
| T1 (self) | `ChatbotUpdate.install_format` set but not cleared | spec amended to match |
| T8 | seed `ensure_bot` gains `use_case`; existing dev-DB bots keep NULL use_case | acceptable (PATCH does not accept use_case); Platform column still renders "Website" from the NOT NULL default |
Ruling: the plan's `test_private_url_is_rejected` calls `install.check_url` directly for the allowed-host assertion (unit-level inside an API test) — accepted to keep the test count at three per the owner's policy; cost if wrong: none.

## Progress
Wizard T1: dispatched — BASE 8e1f25a, implementer sonnet
Wizard T1: implemented 760d13b (225 passed, migration round-trip on scratch db); DONE_WITH_CONCERNS — Ruling: service.create_chatbot/repository.insert_chatbot keep defaults (platform="website", use_case=None, use_case_note=None) so the two existing direct callers in test_rls.py/test_concurrency.py stay untouched; router passes all three explicitly. Cost if wrong: none. InstallVerifyRequest is consumed by T2 (expected). Pre-existing UnicodeDecodeError warning in test_boundaries.py (Windows console decoding of lint-imports banner) noted, not this task's. Review dispatched.
Wizard T1: complete (commits 8e1f25a..760d13b, review clean). Minors deferred: stale unused ChatbotOut/FlowOut schemas; DB check for install_format allows mobile_app/embedded while the API literal allows two (intentional forward provisioning per spec §4.1).
Wizard T2: dispatched — BASE 760d13b, implementer sonnet
Wizard T2: implemented 7268468 (230 passed); review dispatched.
Wizard T2: Ruling: reviewer Critical "allow-list host taken from the client-controlled Host header (no TrustedHostMiddleware) — any bots:manage user can point the verifier at 169.254.169.254 by setting Host" — real; fix: new `PUBLIC_BASE_URL` setting (default http://127.0.0.1:8000) supplies the allowed host; spec §4.3 and plan amended. Importants accepted: UnicodeError from getaddrinfo → treat as internal / unreachable; total asyncio.timeout(5) around all hops; async loop.getaddrinfo; rate_limit dependency. Cost if wrong: an operator must set PUBLIC_BASE_URL when the backend is served from another origin for /demo verification to pass (documented in .env.example).
Wizard T2: minor (deferred): DNS rebinding TOCTOU accepted for this product (comment it); mismatched quote pair in the id regex; 1 MB cap overshoots by one chunk; broad except around httpx.URL; no Content-Type check.
Wizard T2: fix round 1/5 dispatched — resume implementer; FIX_BASE 7268468
Wizard T2: fix round 1 committed 58fa6f6 (230 passed); scoped re-review dispatched. Spec/plan amendment committed 8a48475.
Wizard T3: dispatched — BASE 58fa6f6, implementer sonnet (concurrent with roles T7 rehearsal; disjoint files)
Wizard T2: fix round 1/5 (5 addressed, 0 open — PUBLIC_BASE_URL allow-list, idna errors fail closed, total asyncio.timeout, async DNS, rate limit; commits 7268468..58fa6f6)
Wizard T2: complete (commits 760d13b..58fa6f6 excl. roles-plan commits, review clean after 1 fix round)
Wizard T2: minor (deferred, FIX IN FINAL WAVE): allow-list compares host only, so with the default PUBLIC_BASE_URL any 127.0.0.1:<port> passes check_url — compare full origin (scheme+host+port). Also deferred: no .env.example entry for PUBLIC_BASE_URL (README note instead); blanket ValueError catches; rate_limit "unknown" bucket behind proxies (pre-existing); no requires-python pin though asyncio.timeout needs 3.11+.
Wizard T3: implemented a20c5e0 (230 passed, CDP screenshots); Ruling: implementer guarded applyDesign()'s inline windowSize/position styles with MODE !== "fullpage" — required for the brief's own 'fills the viewport' requirement; accepted. Review dispatched.
Wizard T4: dispatched — BASE a20c5e0, implementer sonnet (concurrent with the roles final fix wave: disjoint files)
Wizard T3: complete (commits 4295644..a20c5e0, review clean). Minor deferred: enableResize inline styles still apply in fullpage mode (visitor can drag the full-viewport panel smaller).
Session resumed 2026-09-23. Wizard T4 landed as user commit 6f78005 (no implementer report/review); typecheck+build green; review dispatched against the T4 brief.
Wizard T4: complete (user commit 6f78005, review clean). Minors deferred: wizard pages lack a client-side bots:manage gate (backend enforces; entry buttons hidden); dead `loading` prop in the Other dialog; hardcoded hex in wizard CSS (plan-mandated); unrelated ledger file bundled in the commit (docs/superpowers/ledgers is the intended archive).
Wizard T5: dispatched — BASE 6f78005, implementer sonnet
Wizard T5: implemented af9ce40; review dispatched. Wizard T6: dispatched — BASE af9ce40, implementer sonnet
Wizard T5: Ruling: reviewer Important (plan-mandated) "InstallFormatPage has no bots:manage read-only gating" — fix with useMe/can + ReadOnlyBanner + disabled cards; also invalidate ["chatbot", id]. Minors deferred: loose Format cast; no isError handling; spec vs brief `?tab=website` on chat_button.
Wizard T5: fix round 1/5 dispatched — resume implementer; FIX_BASE af9ce40
Wizard T6: implemented 1cd546c; review dispatched
Wizard T6: complete (commits af9ce40..1cd546c, review clean). Minors deferred: dead .install-platforms-grid/.platform-card CSS; landing publish note conditional (plan-mandated); two subtext strings unverified against the guide.
Wizard T5: fix round 1 committed 73baa4d (ReadOnlyBanner uses label=permissionLabel(...) — the component's real signature); re-review dispatched.
Wizard T7: dispatched — BASE 73baa4d, implementer sonnet
Wizard T5: complete (af9ce40 + fix 73baa4d; re-review clean)
Wizard T7: implemented e90d3a1; review dispatched
Wizard T8: dispatched — BASE e90d3a1, implementer sonnet (parallel with T7 review)
Wizard T7: review Needs fixes. Ruling — fix: (1) Critical row menu clipped by .chatflows-table-card overflow:hidden on the last rows (confirmed; brief-inherited) → overflow: visible on the card, keep rounded corners via border-radius on the table's first/last cells; (2) Important no Escape close on the row menu → add keydown Escape in the same effect; (3) Minor rename also invalidates ["chatbot", id]; (6) drop dead .action-icon-btn.is-test/.is-delete:hover; (7) merge the duplicate .chatflows-header rule into the original at ~line 2092. Not fixing: (4) Dialog focuses the Close button first — pre-existing shared Dialog behaviour, out of scope; (5) Platform cell literal "Website" — spec-mandated, only website bots exist. Fix round waits for T8 to release the git index (T8 is staging seed_demo.py/DEMO_WALKTHROUGH.md concurrently). Cost if wrong: one extra commit.
Wizard T8: implemented c0d89a5 (231 passed, lint 3 kept, typecheck/build/node --check ok; headless rehearsal 11/11 on throwaway wcb_wizard_1790144423_10769, dropped). Implementer's "transient 401" diagnosed by controller: seed run 1 was launched WITHOUT DATABASE_URL, so the seed's direct-DB ensure_superadmin step ran against the developer's webchatbots DB while the API calls hit the throwaway — not transient. Effect on the dev DB: none (existing superadmin, flag already set, no memberships; password never rewritten for an existing user). Deferred minor: seed_demo could print the DB it targets. Review dispatched.
Wizard T7: fix round 1/5 dispatched — resume implementer; FIX_BASE c0d89a5
Wizard T8: complete (c0d89a5, review Approved, no findings)
Wizard T7: fix round 1 committed d779c40 (browser check skipped again; visual check deferred to the final stage); re-review dispatched
Wizard: final whole-plan review dispatched (opus) on 8e1f25a..d779c40, in parallel with the T7 fix re-review and a visual check of the All Chatbots menu (throwaway DB)
Wizard T7: complete (e90d3a1 + fix d779c40; re-review clean). Noted for the final fix wave: faint last-row border against the card border (pre-existing); .table-empty-notice has no CSS rule (pre-existing).
Wizard: visual check of d779c40 passed (headless Edge, throwaway wcb_visual_405930301 dropped): last-row menu fully visible, corners rounded, no double border; screenshots in scratchpad/wizard-visual; report visual-check-report.md
Wizard: final review Approved (no Critical). Ruling — one fix wave: (1) install.py check_url compares full origin (scheme+host+port) against PUBLIC_BASE_URL, not host only; (2) DEMO_WALKTHROUGH §1 tells the presenter to switch Published on before the Landing Page Open step; (3) README setup gains a PUBLIC_BASE_URL sentence; (4) SelectPlatformPage/SelectPurposePage gated like InstallFormatPage (useMe/can + ReadOnlyBanner + disabled cards); (5) delete dead .install-platforms-grid/.platform-card/.platform-icon CSS and add chat.html to README's static listing. Everything else on the reviewer's "leave" list stays deferred. Cost if wrong: two small commits.
Wizard: final fix wave dispatched — implementer sonnet, BASE d779c40
Wizard: final fix wave committed f7af931 (backend+docs) + 97826e3 (frontend); chatbots suite 14 passed, lint 3 kept, typecheck/build ok; re-review dispatched
Wizard: final fix wave re-review clean (f7af931, 97826e3). Wizard plan COMPLETE at 97826e3. Full backend suite run by controller on the final head — see next line.
Controller: full backend suite on 97826e3 — 231 passed. Ledger archived to docs/superpowers/ledgers/; tag v1.0-demo moved to the final head (local only).
