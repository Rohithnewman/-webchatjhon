# SDD ledger — plan: docs/superpowers/plans/2026-09-16-tenancy-roles-limits.md

Branch: demo-completion (continues in place; same rulings as the demo-completion ledger apply: in-place branch, never stage the user's animated-login/scripts work, never drop the dev DB). Spec: docs/superpowers/specs/2026-09-16-tenancy-roles-limits-design.md (approved in chat 2026-09-16).
Pre-flight scan: Task 1 changes Principal/TokenBundle workspace optional — Task 2 consumes AuthTokens.workspace_id nullable (ok). Task 3 SubscriptionView fields → Task 4 renders them (ok). Task 5 CATALOGUE → Task 6 validates/mirrors (ok). Migration chain 0012 → 0013 → 0014 in task order (ok). Task 1's admin test helper change (superadmin promotion detaches memberships) may change platform counts in test_stats_and_organizations_span_every_tenant — noted for the implementer. Ruling: Task 5's guard treats features:read as satisfied for any active membership so the four rewritten system roles and custom roles can never lock a member out of reads; cost if wrong: none.

## Progress
Task 1: dispatched — BASE 20b84ab, implementer sonnet
Task 1: implemented 1b05e69 (205 passed); review dispatched. Task 2: dispatched — BASE 1b05e69, implementer sonnet
Task 1: complete (commits 20b84ab..1b05e69, review clean). Minors deferred: /auth/me keys the no-tenancy branch on the null claim rather than the DB flag; no regression test for a stale pre-promotion token; truthiness checks; WIDGET_CORS_ALL_ORIGINS=True makes the 500 handler echo any origin (pre-existing posture).
Task 2: implemented afb2f15; review dispatched. Task 3: dispatched — BASE afb2f15, implementer sonnet
Task 2: Ruling: reviewer Important "SuperadminOnly renders the tenant page while /auth/me loads" — fix: render LoadingState until isReady (same as HomeRedirect). Minors deferred: tooltip wording; redundant !is_superadmin clause.
Task 2: fix round 1/5 dispatched — resume implementer; FIX_BASE afb2f15
Task 2: fix round 1 committed 6c03d28; re-review dispatched. Task 3: implemented 8c75e5c (212 passed); review dispatched. Task 4: dispatched — BASE HEAD, implementer sonnet
Task 2: fix round 1/5 (1 addressed; 6c03d28) — complete (commits 1b05e69..6c03d28 excl. T3, review clean after 1 fix round)
Task 3: Ruling: reviewer Important #1 "cap check reuses get_subscription_for_workspace (seat-count join) on the widget start path" — fix with a lean workspace→(organization_id, plan, conversation_limit override) lookup; #2 "no tests assert the new fields on /auth/me and /organization" — add them. Minors deferred: zero-override test, multi-workspace aggregation test, N+1 on admin list, unused `now` param, VALIDATION_ERROR assertion.
Task 3: fix round 1/5 dispatched — resume implementer; FIX_BASE 8c75e5c
Task 4: implemented 1134c25; review dispatched
Dev DB migrated to 0013 for the user (non-destructive); user's uvicorn (started 11:39, no --reload) is on stale code — user asked to restart it.
Task 3: fix round 1 committed ced6e46 (214 passed); re-review dispatched.
Task 4: Ruling: reviewer Important #1 "edit then click default fires two PATCHes (blur commit + click)" — fix with onMouseDown preventDefault on the default button; #2 "draft not reverted on failed mutation" — onCommit returns the mutation promise, LimitInput awaits and resets draft on rejection. Minors deferred: table-wide pending; owner-card spacing; 64px input width.
Task 4: fix round 1/5 dispatched — resume implementer; FIX_BASE 1134c25
Task 5: dispatched — BASE ced6e46, implementer sonnet
Session resumed 2026-09-17: ledger showed T3/T4 fix rounds without re-review verdicts and T5 dispatched with no report or commits; re-reviews dispatched, T5 re-dispatched — BASE 033ce9c, implementer sonnet.
Task 3: fix round 1/5 (2 addressed, 0 open — lean conversation-cap lookup, /auth/me and /organization limit-field tests; commits 1134c25..ced6e46)
Task 3: complete (commits 6c03d28..ced6e46 excl. T4, review clean after 1 fix round)
Task 4: fix round 1/5 (1 addressed, 1 open — draft revert on failure fixed; double PATCH on "default" click persists: disabling the still-focused input when pending flips true forces a blur that re-commits; commits 1134c25..033ce9c)
Task 4: fix round 2/5 dispatched — fresh implementer (original agent from a prior session), FIX_BASE 033ce9c
Task 4: fix round 2/5 committed 7d37c65 (per-input committing ref guards re-entrant blur); scoped re-review dispatched.
Task 5: implemented 8b6d1a6 (217 passed); review dispatched
Task 4: fix round 2/5 (1 addressed, 0 open — committing ref guard; commits 033ce9c..7d37c65)
Task 4: minor (deferred): rapid native double-click on the default button before pending disables it is unguarded (send called directly from onClick).
Task 4: complete (commits ced6e46..7d37c65 excl. T3/T5, review clean after 2 fix rounds)
Task 5: complete (commits 7d37c65..8b6d1a6, review clean). Minors deferred: test_guards.py untouched (WORKSPACE_MANAGE semantics unchanged); analytics/router.py guard variable still named read_context though bound to ANALYTICS_READ.
Task 6: dispatched — BASE 8b6d1a6, implementer sonnet (backend then frontend, two commits)
Task 6: implemented ffcfbef (backend) + 6344161 (frontend), 225 passed; DONE_WITH_CONCERNS — (1) implementer's first seed check pointed create_superadmin at the real dev DB; verified read-only that admin@admin.com was pre-existing and unchanged (idempotent no-op), redone against throwaway wcb_seed_check; (2) implementer saw its staged backend files committed with a generic message before its own commit and amended the message only. Controller checked: history is exactly the two expected commits, tree clean. Review dispatched.
Task 6: Ruling: reviewer Critical #1 "RolesPanel echoes the server-added features:read back and the validator rejects it (every rename/re-permission 400s)" — real; fix on both sides: the schema validator tolerates features:read (the server always adds it), the panel filters to PERMISSION_CATALOGUE ids before sending, and test_roles_api gains a GET→PATCH round-trip assertion. Important #2 "duplicate role name → 500" — map IntegrityError to 409 ROLE_NAME_TAKEN (create and rename). Important #3 "delete-role / add-member race → 500" — SELECT … FOR UPDATE on the role in delete_role and map the FK violation to 409 ROLE_IN_USE. Cost if wrong: none.
Task 6: minor (deferred): whitespace-only role names accepted; custom role may shadow a system role name; downgrade leaves ex-custom roles visible to every org; count/update/delete role repository functions keyed by role only; empty PATCH writes an audit row; TeamPanel hardcodes the members:manage label and is not isReady-guarded; SettingsPage useMemo on `can`; RoleRow inputs never resync after refetch.
Task 6: fix round 1/5 dispatched — resume implementer; FIX_BASE 6344161
Task 6: fix round 1 committed c8a542e (227 passed); scoped re-review dispatched.
Task 6: fix round 1/5 (2 addressed, 1 open — #3 half-closed: delete side serialised, but a concurrent add_member/change_role INSERT that loses the race raises an uncaught FK IntegrityError → 500; commits 6344161..c8a542e)
Task 6: minor (deferred): delete of a system role briefly takes FOR UPDATE on the shared row before the 403; bare IntegrityError in create/update_role is always mapped to ROLE_NAME_TAKEN.
Task 6: fix round 2/5 dispatched — resume implementer; FIX_BASE c8a542e
Task 6: fix round 2 committed 42133f6 (230 passed); scoped re-review dispatched.
Task 6: fix round 2/5 (1 addressed, 0 open — role-FK IntegrityError on membership writes → 409 ROLE_NOT_FOUND; commits c8a542e..42133f6)
Task 6: complete (commits 8b6d1a6..42133f6 excl. wizard-plan commits, review clean after 2 fix rounds)
Task 7: dispatched — BASE 58fa6f6, implementer sonnet. Ruling: wizard-plan commits (760d13b, 7268468, 58fa6f6, docs) are on the branch too; the rehearsal covers HEAD as it is, and README/walkthrough numbers are refreshed once here; the wizard plan's own rehearsal (its Task 8) refreshes them again at its end. Cost if wrong: numbers updated twice.
Task 7: complete (commit 4295644 docs numbers only; 230 passed, lint 3 kept, typecheck/build/node --check ok; rehearsal 17/17 on throwaway wcb_rehearsal_77233835; tag not moved yet — controller moves it after the wizard plan lands)
Final whole-branch review: dispatched — range 20b84ab..4295644 (wizard-plan commits 8e1f25a, 760d13b, 7268468, 58fa6f6, 8a48475 inside the range are out of scope), reviewer opus
Final review (opus) received 2026-09-17: 0 Critical, 3 Important (README still describes a superadmin "Platform" workspace; README/walkthrough call the agent a member though the seed assigns the "Support agent" role; the permission catalogue and Settings → Roles are described nowhere), plus minors. Ruling: ONE fix wave covering the 3 Important + cheap minors (#5 "'None'" in the ROLE_NAME_TAKEN message; #6/#22 RoleUpdate.require_change; #11 assign-isolation test). Deferred per the reviewer's triage: rollback-in-api-layer (#4), limit TOCTOU (#7), admin-list N+1 (#8), /auth/me subscription without membership (#9, pre-existing), App.tsx route wrapper duplication (#10), stale "Platform" org row on pre-existing DBs (#12, walkthrough note added in the wave). Ledger item "VALIDATION_ERROR assertion" is already fixed.
Final fix wave: dispatched — FIX_BASE 4295644, implementer sonnet
Final fix wave: commit 2513d6c (231 passed); scoped re-review dispatched
Final fix wave re-review: all 6 addressed; plan complete at 2513d6c
