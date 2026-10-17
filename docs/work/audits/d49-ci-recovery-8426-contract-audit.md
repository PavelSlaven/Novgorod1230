# D49 architecture / contract audit (read-only)

Audited head: `8426853a3a9d4e8babcdfcbcebdf3ae1695f50b2`; base `60051abb2752a85faff14a47714c39506575e0ff`. Worktree `codex/d49-ci-recovery`, 221 changed files (12,101 insertions / 1,845 deletions per handoff). Worktree also has unrelated untracked `out/`; untouched. This audit used focused diff/source reads, not a line-by-line review of every changed test, fixture, generated artifact or playtest.

## Findings

### CONTRACT AUDIT FINDING — P1, opening writer missing scene source (inherited verified finding)

audited_head: `8426853a3a9d4e8babcdfcbcebdf3ae1695f50b2`
scope: canonical opening narration, scene grounding
source_set: `AGENTS.md`; active `situational_prose_requirements.md` §2.0/§5; `apps/game-server/src/runtime/canonical-opening-context.js`; `apps/game-server/src/runtime/authored-opening-narration.js`; live playtest `docs/playtests/2026-10-17_d49_1802e433a_browser-0324.md`
source_statuses: governing + ACTIVE normative + implementation/live evidence
observed_implementation: canonical opening builds scene in `visible_scene`, but the opening writer request at `authored-opening-narration.js:243–252` receives only fact slices; known finding located at `canonical-opening-context.js:44–53`.
required_by_active_contract: opening writer receives approved current scene/location as factual source; prose must establish physical orientation without invention.
target_if_any: none
conflict: approved scene label missing from writer evidence, so a safe, fully grounded opening can omit current place.
precedence_resolution: active prose requirement governs; writer wire must carry exact approved scene label.
first_bad_boundary: canonical opening package → writer request
correct_owner: game-server opening projection/wire
required_code_delta: send exact approved visible scene label with writer factual input; no new prose fallback.
required_docs_delta: none
required_tests: captured writer request and canonical opening behavior; live recheck after fix.
severity: P1
verdict: BLOCK at 8426. This finding is inherited from prior auditor handoff; queued `516a` fix was reported CA PASS but is not part of audited head.

### CONTRACT AUDIT FINDING — P2, valid transit-anchor readback cannot load NPC scene

audited_head: `8426853a3a9d4e8babcdfcbcebdf3ae1695f50b2`
scope: Spatial journey location → game-server readback
source_set: active `spatial_architecture_standard_g0_g6.md:1315–1323`, `3132–3138`; `apps/game-server/src/infrastructure/postgres/lower-dvina-trace-phase-2-journey-location.js:19–85`; `apps/game-server/src/infrastructure/postgres/lower-dvina-trace-phase-2.js:219–245`; `apps/game-server/src/infrastructure/postgres/scene-npcs-readback.js:20–40`; `apps/game-server/test/npc-in-transit-readback-postgres.test.js:68–114`
source_statuses: ACTIVE Spatial standard + implementation/tests
observed_implementation: `normalizeJourneyLocation` now accepts a persisted actor `location_kind='transit_anchor'`; `withJourneyLocation` clears `position_id`; `withSceneNpcs` only bypasses scene SQL for `in_transit`, then rejects absent position with `SCENE_NPC_READBACK_DATA_GAP`. `loadPhase2State` calls them in sequence.
required_by_active_contract: `transit_anchor` is a valid root journey location with `transit_anchor_id` and no scene position. Readback must preserve that state without manufacturing scene co-presence.
target_if_any: none
conflict: valid anchor location fails party/session readback. Current tests cover `in_transit` and malformed scene but omit valid `transit_anchor`.
precedence_resolution: active Spatial XOR location contract governs; scene NPC readback must branch on valid non-scene location, with exact consistency checks.
first_bad_boundary: `withSceneNpcs` after `withJourneyLocation`
correct_owner: game-server scene NPC readback
required_code_delta: handle valid `transit_anchor` as non-scene at this owner; retain fail-closed checks for inconsistent location/position IDs.
required_docs_delta: none
required_tests: valid actor transit-anchor `loadPhase2State`/`withSceneNpcs` regression, including stale scene identity rejection.
severity: P2 (conditional on a party at a transit anchor)
verdict: BLOCK for this supported state. Static path finding; no new test or DB reproduction run in this audit.

## Other reviewed boundaries

- #730 finite extraction: accepted prior auditor's focused source/PG evidence for one root+step occurrence, replay, new-root identity, shared category/coverage, and P16 atomic owner. I did not rerun tests or reread core implementation wholesale.
- NPC semantic/repair, speech grounding, narration and wire: accepted prior auditor handoff (typed decision and claim preservation; exact utterance fragments; intent is non-evidence; current scene and public boundary separated). Added targeted reads of `packages/turn/src/turn-step-plan-repair.js`, `turn-step-commit-validator.js`, `apps/game-server/src/public-boundary.js`, `lower-dvina-trace-player-safe-visible-context.js`, release bindings and HTTP envelope. No additional confirmed architecture defect in these sampled paths.
- Public schema and DB: changed `turn-step` canonicalization fields, group interaction operation, visible prose/public speech provenance, readback query and release bindings sampled against code and active modules/contracts. `git diff --name-only` shows no changed SQL/DDL file. No second persistence owner found in sampled change; no claim of exhaustive absence.
- `165a7241` + `b456bab7` queued in separate opening worktree: scoped PASS against active `situational_prose_requirements.md` §3.1/§3.2/§5/§6. Normal body facts remain in source; only physical restrictions enter `must_include`; carried items remain source; b456 restores authored visible interaction items. Parent reported opening focused tests 30/30 PASS; not independently rerun here. These commits are outside audited 8426 head.
- Queued `a7e58d44` NPC request ordering: parent supplied scoped audit PASS and test results (82+177, cloud 2 PASS, Qwen pending); outside audited head.

## Evidence and limits

Commands: `git status --short --branch`, `git diff --name-status/--numstat 60051abb2...HEAD`, focused `git diff --unified=3`, targeted `rg` and line-range source reads. No code edits, model runs, DB tests or full suite. Prior auditor reports `git diff --check` PASS, scoped PG tests PASS. Final acceptance already has live prose FAIL and CI pending; these are acceptance gaps, not extra architecture findings.

CBM: project `C-Users-Slaven-Documents-Novgorod`, generation `2026-10-16T05:26:03Z` (primary checkout `55fa99ba`, stale for this worktree). `check_index_coverage` on 10 material source paths: no recorded parse gaps, but freshness `metadata_changed`/`missing`; source fallback used. Runtime scope has two unrelated partial files; postgres and turn scopes have no recorded issue. `detect_changes(since=60051abb2)` resolved the primary checkout, not audited worktree; it reported only `.claude/settings.local.json.bak-20261014-tools`, so it is not evidence for 8426 blast radius. Source/diff readings above are the authoritative evidence here. No exhaustive claim about all 221 files.

CI/tooling spot-check: .github/workflows/test.yml splits fast gate into fast/fast-apps/fast-tools/fast-rest with common prerequisites and separate test logs; 	ools/architecture/check-boundaries.mjs adds existing @rus/kernel import. No confirmed contract finding from these sampled lines. CI result itself remains pending.


## Delta audit: transit-anchor fix `0d805f518bb073d598aac2ab3104003a596e883c`

Scope only `8426853a3a9d4e8babcdfcbcebdf3ae1695f50b2...0d805f518bb073d598aac2ab3104003a596e883c` (2 files). Historical 8426 verdict above remains unchanged.

Prior P2 transit-anchor finding: CLOSED for this delta. `withSceneNpcs` now treats both valid non-scene `location_kind` values as no-scene readbacks. It requires the kind-specific identity (`travel_state_id` or `transit_anchor_id`), rejects the other identity, `scene_position_id`, `g6_instance_id`, and stale position/site fields, then skips scene NPC SQL. Existing `in_transit` branch retains its constraints. New tests cover valid anchor, missing identity, wrong simultaneous identity, and stale scene ID. No new owner, DB write, schema, or fallback introduced.

Independent static review of the exact diff: PASS for P2. `git diff --check 8426853...0d805` PASS. Author-reported red test before fix, PostgreSQL 7/7 plus adjacent 61/61, syntax and architecture checks accepted as reported; not rerun by auditor. This delta approval does not alter the 8426 opening P1 or pending bench/art/live/CI gates.
