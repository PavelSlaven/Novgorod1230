# Lower Dvina first playable v2

## Readiness

- Repository: `PavelSlaven/Novgorod1230`
- Worktree: `C:\tmp\Novgorod-lower-dvina-first-playable-v2`
- Branch: `codex/lower-dvina-first-playable-v2`
- Base and `origin/main`: `d4be6a6014b80ceae937b3900dad6cbe7c1e787d`
- Node.js: `v24.16.0`
- npm: `11.13.0`
- Python: `3.13.3`
- uv: `0.11.32`
- Docker server: `29.5.3`
- Docker Compose: `v5.1.4`
- Graphify: `0.9.17`
- `npm ci`: passed, 0 vulnerabilities
- Operator/production database: legacy `world_db` was inventoried read-only;
  cutover will use two new first-launch databases after merge, never the
  legacy database

The main checkout contains unrelated protected untracked files. The previous
first-session audit worktree contains two untracked audit reports. Neither
checkout is modified by this task.

## Repository intelligence

`npm run repo-intel:ensure` rebuilt an exact-head graph successfully.
`npm run repo-intel:status` reports:

- repository graph: `ready`, Graphify `0.9.17`, exact base commit;
- knowledge source: `degraded` with `KNOWLEDGE_SOURCE_DEGRADED`;
- readiness errors: none.

Queries executed:

1. `Lower Dvina first playable late_summer_open_water scenario content readiness boundary yp025 yp026 canonical G5`
2. `spatial v3 target migration activity execution resource binding P16 semantic command NPC interaction check resolution`

Both channels returned results. Because semantic RAG coverage is degraded,
profile normative files are also read directly and exact source paths/digests
are recorded in the content-readiness manifest.

## Normative inputs

Mandatory project rules and navigation were read from the exact base commit:

- `AGENTS.md`;
- `.github/AGENTS.md`;
- `development_rules.txt`;
- `code_critic_invocation_rule.txt`;
- `code_driven_world_materialization_architecture.md`;
- `llm_documentation_navigation.md`;
- `world_base_materialization_table_requirements.md`;
- `map_g0_g4_workflow.txt`;
- `read_only_database_and_graph_architecture.md`;
- `infra/world-base/SCHEMA_REFERENCE.md`;
- `data/world-catalogs/novgorod/G1_SEMANTIC_CATALOG.md`;
- `spatial_architecture_standard_g0_g6.md`;
- `temporal_world_and_interruptible_activities.md`;
- the routed player, NPC, item/property, inventory, movement, time, UI,
  formula and world-generation profile documents.

Their exact source hashes and any amendments introduced by this task are part
of the candidate evidence package.

## Fixed milestone boundary

Guaranteed pre-activation capability:

- `local_scene`;
- persisted restart/resume;
- deterministic full v2 snapshot;
- disposable world/party PostgreSQL validation;
- minimal browser UI/runtime;
- typed boundary gaps;
- reproducible activation request and rollback evidence.

Conditional capability:

- `boundary_crossing`, only after source-bound approval of every directed
  segment, endpoint, environment, cost, recheck, check, risk and consequence
  dependency.

The manifest itself may be valid while a capability gate is blocked. A blocked
boundary gate does not block local-scene compilation or E2E.

The current sealed readiness result is:

```text
manifest_status = sealed_valid
local_scene = ready
boundary_crossing = blocked
```

The only boundary blockers are the typed gaps
`approved_directed_segment_gap`,
`approved_boundary_check_policy_gap`,
`approved_boundary_risk_policy_gap` and
`approved_boundary_consequence_policy_gap`.

## Production activation и проверка актуальности источников

This first-launch milestone ends with mandatory production activation after all
candidate, PostgreSQL, browser, restart and critic gates pass:

1. Import the approved item/container catalogue into production `world_base`.
2. Activate its exact domain pin.
3. Import and activate `spatial-v3-production-v2` as canonical production head.
4. Activate scenario/bindings `lower_dvina_late_summer_open_water_v1`.
5. Create the first production party with exact world, catalogue, profile,
   template and bindings pins.
6. Run production smoke: create game, read first screen, commit one turn, save,
   restart the server and continue from persisted state.

After successful cutover the release must read:

```text
release_status = active
production_activation = true
runtime_selectable_in_canonical_production = true
```

Before readiness or approval conclusions, the executor fetches GitHub refs and
checks current `origin/main`, recent merged PRs and the full final
approval/promotion chain. Older `pending`, `blocked`, readiness and
pre-approval files do not override later consistent evidence already merged
into `main`. At `d4be6a6014b80ceae937b3900dad6cbe7c1e787d`, the relevant later
chain is:

- `docs/implementation/item-container-120-approval-audit/evidence/FINAL_APPROVAL_REQUEST.json`;
- `docs/implementation/item-container-120-approval-audit/evidence/FINAL_APPROVAL_ATTESTATION.json`;
- `docs/implementation/item-container-120-approval-audit/evidence/STAGE3C_PROMOTION_RESULT.json`.

It supersedes the earlier Stage 3C readiness status for readiness assessment,
without rewriting that historical artifact. The current worktree and
`origin/main` were rechecked after the activation scope change and both remain
at `d4be6a6014b80ceae937b3900dad6cbe7c1e787d`.

## Commands and evidence log

The following commands have passed:

```powershell
git fetch --prune origin
git worktree add -b codex/lower-dvina-first-playable-v2 `
  C:\tmp\Novgorod-lower-dvina-first-playable-v2 origin/main
npm ci
npm run repo-intel:ensure
npm run repo-intel:status
npm run repo-intel:query -- --query "<query>"
npm run lower-dvina:first-playable:readiness
npm run lower-dvina:first-playable:test-readiness
docker info
docker compose version
npm run lower-dvina:first-playable:test-content
npm run lower-dvina:first-playable:test-revisions
npm run lower-dvina:first-playable:test-compiler
npm run lower-dvina:first-playable:validate-world-v2
npm run lower-dvina:first-playable:test-world-schema
npm run lower-dvina:first-playable:test-world-v2-postgres
npm run lower-dvina:first-playable:test-activation-postgres
npm run lower-dvina:first-playable:test-party-migration
npm run lower-dvina:first-playable:test-party-postgres
npm run lower-dvina:first-playable:test-p16
npm run lower-dvina:first-playable:test-runtime-postgres
npm run docs:generate
npm run world-db:schema-doc
npm run docs:check
npm test
git diff --check
git clone --branch codex/lower-dvina-first-playable-v2 --single-branch `
  https://github.com/PavelSlaven/Novgorod1230.git `
  C:\tmp\Novgorod-lower-dvina-first-playable-clean-clone-<sha>
# inside the clean clone:
npm ci
npm test
```

The full `npm test` chain passed after the architecture split. Its built-in
browser test was skipped because that runner did not discover a Chromium
executable; this is covered by the separate real browser-harness execution
below and is not treated as the browser acceptance gate.

The same complete `npm test` chain also passed after `npm ci` in a fresh
single-branch clone of the pushed task commit. The clean clone had no modified
or untracked repository files after acceptance.

## PostgreSQL and browser acceptance

A full operator rehearsal passed on two fresh disposable PostgreSQL 16
databases named `pr17_rehearsal_lower_dvina_world_p16_final` and
`lower_dvina_rehearsal_party_p16_final`. It executed the exact Stage 3C
lifecycle, world schemas 18/19, the
39-dataset v2 import, party migrations 001…011, both runtime-catalog forward
migrations, activation bundle application and exact readback. Before the
smoke test the party count was zero; no operator or legacy database was
touched. The sealed result is
[`operator-rehearsal-result.json`](evidence/operator-rehearsal-result.json);
its status is `validated_rehearsal_not_production`.

Real browser-harness acceptance used the actual game server, separate
world/party PostgreSQL databases, the release-pinned bindings module and no
LLM. It confirmed:

1. the landing page preserves ordinary `start_text` new game;
2. a separate `Сценарии` button reveals the scenario list;
3. the Lower Dvina scenario button sends its `scenario_id`;
4. the server resolves the complete player profile and first screen;
5. `Осмотреться` commits a player-safe visible package;
6. `Сохранить` is zero-time;
7. after terminating and restarting the server, the same opaque `party_id`
   restores the exact screen and body/inventory state;
8. the next safe traversal commits and materializes the seasonal fisherman;
9. a post-restart conversation enriches the same NPC and persists journal
   and NPC-memory evidence;
10. handing the rope to the fisherman preserves player ownership;
11. network work consumes 30 minutes, changes energy and relation, and returns
    the rope only after the required-tool ownership recheck;
12. a separate ordinary new game without `scenario_id` still succeeds.

The sealed browser result is
[`browser-rehearsal-result.json`](evidence/browser-rehearsal-result.json).

The browser run also caught and fixed a real public-projection defect:
technical traversal binding and condition-candidate fields were initially
returned inside the turn summary. A PostgreSQL regression test now exercises
the same client validation seam and the producer exposes only the public
outcome.

## Current blockers

- The RAG warning is a coverage note, not a readiness error.
- `local_scene` has no content blocker. Its player/NPC profile sets, equipment,
  transport, units, resources and ActivityProfiles resolve to non-empty
  approved candidate sets.
- `boundary_crossing` remains blocked until its full source-bound policy set is
  approved and sealed.
- No fallback values, LLM repair or implicit authoring inheritance is allowed.

## Activation state

Until final cutover the candidate remains:

```text
release_status = validated_candidate_not_active
production_activation = false
canonical_head_changed = false
operator_db_touched = false
runtime_selectable_in_canonical_production = false
```

Those fields may change to the active values above only from committed,
read-back production evidence after every pre-activation gate passes.
