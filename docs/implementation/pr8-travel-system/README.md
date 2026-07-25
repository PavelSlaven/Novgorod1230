# PR8 travel, environment and perception integration

## Objective

Rebuild `codex/pr8-travel-system` from current canonical `main`, use PR8/PR10
only as read-only donors, preserve the Temporal World v4 and Spatial v3
single-owner boundaries, validate the exact final head, and perform production
activation only through a separate versioned cutover.

## Canonical checkout and donor protection

- Repository: `PavelSlaven/Novgorod1230`
- Working clone: `C:\tmp\Novgorod1230-pr8-rebuild`
- Branch: `codex/pr8-travel-system`
- Baseline: `ef490ecd8cf91f9e07531fc5d56b2abd7b044c41`
- `refs/archive/legacy-pr8-head`: `24acf4ea4e9c76d488252616b7d4f7a5b47979ba`
- `refs/archive/legacy-pr8-remote-tip`: `5b669e46487792557aa0094c84653790b53cde3a`
- `refs/archive/legacy-pr10-head`: `6df1cacc46d0d15547499c7eb207c8fb663f771e`
- Existing dirty worktrees are intentionally untouched.

## Readiness

| Check | Result |
|---|---|
| Node.js | `v24.16.0` |
| npm | `11.13.0` |
| Python | `3.13.3` |
| uv | `0.11.32` |
| Graphify | pinned `0.9.17` |
| Docker client/server | `29.5.3` / `29.5.3` |
| Docker Compose | `v5.1.4` |
| npm dependencies | `npm ci`, 0 vulnerabilities |
| Repository Graph | ready for exact baseline commit |
| Knowledge source | degraded semantic coverage warning; lexical normative retrieval is available |

No migration, import, seed or test is allowed to use an operator or production
database. PostgreSQL checks use isolated local databases only.

## Repository Intelligence log

Information need:

> PR8 travel/environment/perception integration after Temporal World v4,
> P28 evidence versus versioned production cutover, exact-time ownership,
> first-entry G5/G6, perception-to-knowledge ownership and persistence paths.

Executed:

- `npm run repo-intel:ensure`
- `npm run repo-intel:status`
- `npm run repo-intel:query -- --query "..."`
- `npm run knowledge:query -- --query "..."`
- `graphify query "..." --budget 2400`
- `graphify path "selectEarliestTemporalBoundaryBatch()" "createTemporalAdvanceEngine()"`
- `graphify path "perception.js" "mergeKnowledgeFacts()"`
- `graphify path "p28-activation-gate.mjs" "./production"`
- `graphify explain` for the three principal ownership nodes.
- combined RAG/Graphify inventory queries for Appendix A registry/export/
  validator paths, production/target DDL loaders, command/decision handlers
  and exact-head evidence bindings;
- post-inventory combined query:
  `Appendix A public contracts for journey command ingress and NPC perception
  replay handoff registry validator producer consumer persistence mapping`;
- focused Graphify path/explain attempts from the Spatial registry to execution
  and from turn orchestration to the PostgreSQL writer. Composite prose
  concepts did not resolve to a single node, so the successful scoped query
  subgraphs were followed by direct public-export/call-site inspection.
- authoring/readiness query:
  `approved pilot G1 route travel profiles navigation interruption transport
  requirements Temporal Spatial authoring runtime visibility`, executed
  independently through the combined normative RAG/Repository Intelligence
  command and Graphify. Neither channel established an approved standalone
  route-travel/navigation/interruption family beyond the existing thirteen
  Temporal families and Spatial route/traversal contracts.
- corrected reaction/knowledge pre-audit query:
  `PR8 corrected reaction handler request proposal causal perception knowledge
  deterministic merge fail closed registered handler exact pins idempotency`.
  The combined RAG query returned `partial:false` with Appendix A.7 first;
  Graphify returned the current contract registry, tests, turn command registry
  and knowledge owner subgraph. `repo-intel:status` reports Graphify `0.9.17`
  ready, no errors, and only the documented knowledge-source semantic coverage
  warning.

Initial findings:

- `@rus/time-events-history` owns earliest-batch selection and the pure
  same-time cascade; `@rus/turn` imports and orchestrates it.
- No direct perception-to-knowledge call path was found. The apparent broad
  graph connection passes through shared utility code and is not an ownership
  edge.
- No graph path connects historical P28 evidence tooling to production
  composition; current normative text must preserve that separation.
- The RAG retrieved the active Spatial/Temporal contracts, including the
  existing `world_perception_signal`, but registry presence alone is not proof
  that a contract is the correct public handoff.
- Production migration loading is exactly `001_party_runtime.sql`; the
  separate target loader applies the PR8 candidate `001..010` chain.
- Current main already contains the exact-time, activity/traversal, NPC
  perception/decision, Temporal persistence and atomic-committer foundations.
  The remaining proven gaps are ingress/orchestration handoffs, not permission
  to copy donor engines.

## Fully read normative sources

- `AGENTS.md`
- `.github/AGENTS.md`
- `development_rules.txt`
- `code_critic_invocation_rule.txt`
- `code_driven_world_materialization_architecture.md`
- `llm_documentation_navigation.md`
- `temporal_world_and_interruptible_activities.md`
- `spatial_architecture_standard_g0_g6.md`
- `world_base_materialization_table_requirements.md`
- `read_only_database_and_graph_architecture.md`
- `map_g0_g4_workflow.txt`
- Novgorod `G1_SEMANTIC_CATALOG.md`
- current `SCHEMA_REFERENCE.md`

## Stage status

| Stage | Status | Gate |
|---|---|---|
| Normative synchronization | complete (`PASS WITH NOTES`) | three clean static passes and independent audit |
| Donor/contracts/persistence/commands/evidence inventory | complete (`PASS WITH NOTES`) | five complete matrices and independent audit |
| Formal handoff contract amendment | complete (`PASS WITH NOTES`) | Appendix A, registry, validators and independent normative audit |
| Runtime implementation | functional candidate complete | profile and integration validation |
| Final target validation | complete | exact functional HEAD, clean-clone acceptance and independent `PASS WITH NOTES` recorded |
| Production cutover | implementation complete; final validation pending | v3-only composition, migrations, live isolated-PostgreSQL startup, exact-head evidence and independent audit |

## Inventory matrices

The inventory baseline is `origin/main` at
`ef490ecd8cf91f9e07531fc5d56b2abd7b044c41`. Exact sorted donor path lists are
reproducible as the exact UTF-8/LF stdout bytes, including the final LF, of
`git diff --name-only origin/main...<ref>` and are bound here:

| Donor ref | Commit | Files | Sorted path-list SHA-256 |
|---|---|---:|---|
| `refs/archive/legacy-pr8-head` | `24acf4ea4e9c76d488252616b7d4f7a5b47979ba` | 146 | `928e27c06c498e2f5e479cc14ef8a11b7b36b5e1858db473cf6cedbcbd6c0542` |
| `refs/archive/legacy-pr8-remote-tip` | `5b669e46487792557aa0094c84653790b53cde3a` | 146 | `928e27c06c498e2f5e479cc14ef8a11b7b36b5e1858db473cf6cedbcbd6c0542` |
| `refs/archive/legacy-pr10-head` | `6df1cacc46d0d15547499c7eb207c8fb663f771e` | 154 | `603344b062cb425cdb714050284528f9d4399b4b62e559c3ec4d358ffe94a140` |

The two PR8 heads have the same path set; the remote tip differs from the
early head only by 26 added README lines. Matrix 1 uses closed path sets. Every
path in the exact lists above is assigned by the first matching row; no
unmatched donor path is eligible for transfer.

### Matrix 1: donor files

#### PR8 donor

| Donor path set | Commit | Purpose | Status | Target owner / location | Action and evidence |
|---|---|---|---|---|---|
| `.github/workflows/test.yml`, `package-lock.json` | both PR8 heads | old CI/dependency snapshot | `DROP_OBSOLETE` | current main | Do not transfer; regenerate only from the final candidate. |
| `MODULE_INDEX.md`, `generated/**`, `infra/world-base/SCHEMA_REFERENCE.md` | both | generated outputs | `DROP_GENERATED` | standard generators | Regenerate from new sources; donor bytes prove nothing. |
| `README.md`, `data/knowledge-source/**`, `docs/domain/**`, `docs/implementation/**` | both | old status/normative/ownership narrative | `DROP_NORMATIVE_CONFLICT` | current PR8 README and active norms | Concepts were re-inventoried; no donor prose is copied. |
| `apps/game-server/src/runtime/travel-ports.js` | both | travel ports | `KEEP_CONCEPT` | target composition ports | Re-evaluate after current public-port inventory; no direct copy. |
| `apps/game-server/src/composition/production.js` | both | production activation | `DROP_NORMATIVE_CONFLICT` | future cutover composition | Donor partial activation is forbidden. |
| `apps/game-server/src/infrastructure/postgres/**`, `apps/game-server/src/runtime/load-bindings.js` | both | v2 persistence/readers | `REIMPLEMENT` | target repositories and atomic committer | Map to migrations `001..010`; donor SQL assumptions are obsolete. |
| `apps/game-server/MODULE.md`, `apps/game-server/test/**` | both | ownership/tests | `KEEP_CONCEPT` | current module/tests | Preserve atomicity/idempotency intentions; rewrite assertions. |
| `data/world-catalogs/novgorod/**` | both | pilot authoring/source edits | `DATA_GAP` | approved Spatial/Temporal catalog | Compare to current approved families before any new record or semantic approval. |
| `infra/world-base/field-descriptions.js`, `infra/world-base/schema.sql`, `infra/world-base/schema/**` | both | old world-base DDL | `DROP_OBSOLETE` | current 190-table world-base chain | Never overlay donor `12.sql`–`14.sql`; map missing data requirements first. |
| `package.json` | both | package/scripts registration | `REIMPLEMENT` | final workspace manifest | Add only packages/scripts still required after inventory. |
| `packages/environment-landmarks/**` | both | landmark, trace and cue engine | `DROP_DUPLICATE_OWNER` | `@rus/environment-state`; possible narrow trace owner | Keep trace/cue lifecycle concepts; weather/light/access and DB reads are rejected. |
| `packages/travel/**` | both | journey aggregate/runtime | `REIMPLEMENT` | existing Spatial/Temporal execution owners | Keep journey, pin, interruption and replay concepts; do not create a parallel clock/activity/route engine. |
| `packages/movement-routes/**` | both | route selection/traversal inputs | `ALREADY_IN_MAIN` | `@rus/movement-routes` | Current Spatial v3 planner/resolver supersedes donor implementation; retain only test ideas. |
| `packages/materialization/**`, `packages/new-game/**` | both | first-entry/readiness | `REIMPLEMENT` | current Spatial v3 materialization/new-game | First-entry is G5/G6 preparation, not G4 creation; reuse current services. |
| `packages/turn/**` | both | travel commands and orchestration | `REIMPLEMENT` | `@rus/turn` plus Temporal resolver | Rewrite against current command registry, exact time and combined write plan. |
| `packages/party-store/**`, `packages/pipeline-engine/**` | both | schema mapping/gates | `REIMPLEMENT` | existing target repository/interfaces | No stage-side DB writes or hidden adjacent stages. |
| `packages/presentation/**`, `packages/visibility-knowledge-memory/**` | both | safe travel projection | `KEEP_CONCEPT` | current safe projection owner | Reuse visible-only intent; enforce persisted-package lifecycle. |
| `schemas/materialization/environment-*.schema.json`, `schemas/materialization/route-travel-*.schema.json`, `schemas/materialization/travel-*.schema.json` | both | proposed authoring families | `DATA_GAP` | current approved family registry | Use only to identify possible missing fields; no family is approved by donor presence. |
| `schemas/party-db/002_environment_landmarks.sql`, `schemas/party-db/003_travel_runtime.sql` | both | old runtime DDL | `DROP_OBSOLETE` | current target chain `001..008` | Ordinals and tables conflict with Spatial/Temporal target DDL. |
| `scripts/check-knowledge-readiness.mjs`, `test/modules/knowledge-readiness-gate.test.js`, `test/modules/pr8-04a-editorial-provenance.test.js` | both | global provenance weakening | `DROP_NORMATIVE_CONFLICT` | catalog-specific fail-closed gates | Missing required provenance/source binding remains a hard block. |
| `scripts/check-world-base-schema.mjs`, `scripts/seed-party-db.js` | both | schema/seed adaptations | `REIMPLEMENT` | current loaders | Change only if a proven target storage gap remains. |
| `src/world/new-game-prerequisites.js` | both | activation/readiness | `REIMPLEMENT` | current new-game target/shadow boundary | No implicit activation or mixed authoritative read. |
| `test/cutover/**`, `test/fixtures/runtime-bindings/**`, `test/integration/**`, remaining `test/modules/**` | both | rollback, PostgreSQL and architecture intentions | `KEEP_CONCEPT` | final target tests | Rewrite on current owners and exact-head candidate; old PASS is historical only. |
| `tools/architecture/**` | both | boundary rules | `KEEP_CONCEPT` | current architecture checker | Add only proven one-owner constraints. |
| `tools/world-catalog-workflow/**` | both | authoring readiness/import | `REIMPLEMENT` | current catalog workflow | Keep fail-closed reference validation; discard global provenance relaxation. |

#### PR10 donor

| Donor path set | Commit | Purpose | Status | Target owner / location | Action and evidence |
|---|---|---|---|---|---|
| `.github/workflows/test.yml`, `package-lock.json` | PR10 | old CI/dependencies | `DROP_OBSOLETE` | current main | Do not transfer. |
| `package.json` | PR10 | old workspace registrations | `REIMPLEMENT` | final workspace manifest | Register only retained current-owner work. |
| `MODULE_INDEX.md`, `generated/**`, `infra/world-base/SCHEMA_REFERENCE.md` | PR10 | generated artifacts | `DROP_GENERATED` | standard generators | Regenerate from final sources. |
| `data/knowledge-source/imports/universal-category-classification-2026-07-15/**`, `data/knowledge-source/{import-history.json,source-aliases.json}`, `data/knowledge-source/imports/legacy-inventory.json`, universal-classification documents | PR10 | classification work | `DROP_UNRELATED` | separate classification history | Explicitly excluded from perception scope. |
| `schemas/materialization/category-*.schema.json`, `classification-schemes-v1.schema.json`, `universal-*.schema.json`, item/container/equipment schemas | PR10 | item classification | `DROP_UNRELATED` | current item/catalog work | No transfer to PR8. |
| `packages/items-property/**`, Stage 16 inventory/packing files and tests, `tools/world-catalog-workflow/src/packing-slots.js` and classification/packing tests | PR10 | inventory foundation | `DROP_UNRELATED` | existing item/inventory owners | No transfer to PR8. |
| `README.md`, corpus manifest/generated metadata and current corpus README/formulas/navigation/interface/NPC documents, `docs/domain/OWNERSHIP_MAP.md`, `docs/pipelines/**` | PR10 | old perception/status prose | `REIMPLEMENT` | active norms and current PR8 README | Retain unique questions only; donor status claims are obsolete. |
| `data/knowledge-source/corpus/DOCUMENTS/{character_inventory_equipment.txt,items_and_property.txt}` | PR10 | inventory/classification prose | `DROP_UNRELATED` | existing item/inventory norms | Explicitly excluded from perception scope. |
| `legacy/DOCUMENTS/documents-kg/corpus/DOCUMENTS/interface_ux.md` | PR10 | stale documentation mirror | `DROP_OBSOLETE` | canonical corpus only | Never copy a legacy mirror over the canonical source. |
| `docs/architecture/ADR-001-code-owned-perception.md` | PR10 | code-owned perception ADR | `KEEP_CONCEPT` | current Temporal ADRs / ownership map | Preserve separation from narration and free-form state patches. |
| `docs/architecture/CONTRACT_POLICY.md` | PR10 | old contract-policy edits | `DROP_NORMATIVE_CONFLICT` | Appendix A/current contract policy | Donor DTO policy cannot amend the current registry. |
| `data/knowledge-source/corpus/DOCUMENTS/perception_visibility_hearing_and_npc_reactions.md` | PR10 | proposed perception norm | `KEEP_CONCEPT` | Temporal Appendix A/current active norms | Reconcile concepts; donor document does not amend contracts. |
| `packages/contracts/src/perception-boundary.js`, related exports/schema names/tests | PR10 | perception DTOs | `DROP_NORMATIVE_CONFLICT` | `temporal-world-v1` / Spatial `4.3.0-target.1` | Donor v1 sensory DTOs cannot bypass Appendix A. |
| `schemas/perception/**` | PR10 | donor sensory/reaction schemas | `DROP_OBSOLETE` | current Spatial registry | Use only as gap evidence; no direct copy. |
| `packages/perception/**` | PR10 | standalone resolver | `DROP_DUPLICATE_OWNER` | `@rus/npc-runtime` | Current main already owns formal perception calculation. |
| `packages/turn/src/stages/perception.js`, workflow/validator/visible/persistence edits and perception tests | PR10 | once-per-turn perception stage | `REIMPLEMENT` | Temporal boundary orchestration | Preserve test intentions; stage model is obsolete. |
| `apps/game-server/src/infrastructure/postgres/perception-persistence.js` and test | PR10 | perception persistence | `REIMPLEMENT` | target combined atomic committer | Current migration `007` and committer already own relevant tables. |
| `packages/travel/**`, `packages/environment-landmarks/**`, movement/materialization copies and travel tests | PR10 | inherited PR8 scope | `DROP_DUPLICATE_OWNER` | PR8 inventory/current owners | PR10 is not a second travel donor. |
| `infra/world-base/schema/**`, field descriptions/schema root | PR10 | old DDL | `DROP_OBSOLETE` | current world-base schema | Never overlay. |
| `schemas/party-db/001_party_runtime.sql`, donor `002_environment_landmarks.sql`, `003_travel_runtime.sql` | PR10 | old party DDL | `DROP_OBSOLETE` | production `001`; target `001..010` | No donor ordinal or table is reserved. |
| `scripts/check-world-base-schema.mjs`, `scripts/seed-party-db.js` | PR10 | old schema/seed adaptations | `REIMPLEMENT` | current schema and target loaders | Change only for a proven current contract/storage gap. |
| `packages/new-game/**`, `packages/party-store/**`, `src/world/new-game-prerequisites.js` | PR10 | activation/write-plan changes | `REIMPLEMENT` | current target activation and repository owners | Explicit party activation remains a retained concept. |
| `packages/presentation/**` | PR10 | visible perception/inventory panels | `REIMPLEMENT` | player-safe projection | Keep only perception-safe UI assertions; inventory panel is unrelated. |
| remaining `apps/**`, `packages/**`, `test/**`, `tools/**` changes | PR10 | integration/support | `REIMPLEMENT` | current main owner named by each MODULE | Transfer only a unique test intention after a matching contract row. |

### Matrix 2: contracts

Inventory rows were evaluated against the then-current exact designation
`temporal-world-v1 / Spatial 4.3.0-target.1`. That accepted snapshot is now
preserved byte-identically. Proven handoff gaps below normatively produced the
additive current designation `temporal-world-v1.1 / Spatial
4.4.0-target.1`; this was not assigned before inventory. The registry is
`packages/contracts/src/spatial-v3/specifications.json`, public export is
`@rus/contracts/spatial-v3/registry`, and the shared validator is
`validateSpatialV3Contract`.

| Appendix A / Spatial contracts | Producer | Consumer | Persistence mapping | Tests | Disposition |
|---|---|---|---|---|---|
| `rational_minutes`, `rational_quantity`, `game_timestamp`, `elapsed_time` | `@rus/time-events-history` exact-time API | Temporal/turn/domain owners | rational columns in target journeys/Temporal tables | contract, exact-time, Temporal tests | `ALREADY_IN_MAIN`; sole arithmetic source |
| `calendar_profile_ref`, `runtime_calendar_snapshot` | calendar projection owner | Temporal resolver/UI-safe calendar | snapshot/pins, not a new clock table | `temporal-world-v1.test.js`, calendar tests | `ALREADY_IN_MAIN` |
| `activity_profile_ref`, `activity_completion_model_snapshot`, `activity_progress_snapshot`, `participant_binding`, `resource_binding`, `timed_activity_static_snapshot` | approved catalog + sealed turn input | execution activity engine | target migrations `003`, `007` | activity engine/contract/PostgreSQL | `ALREADY_IN_MAIN`; donor travel DTOs rejected |
| `party_timed_activity_execution`, `party_timed_activity_attempt` | Spatial execution engine | turn/atomic committer/reload | `party_timed_activity_executions`, `party_timed_activity_attempts`, binding tables | activity engine + P11 Temporal persistence | `ALREADY_IN_MAIN`; extend only on proven field gap |
| `temporal_boundary_provider_input`, `temporal_boundary_candidate`, `temporal_resolution_policy_ref`, `temporal_boundary_batch` | domain providers / time owner | time owner / turn callbacks | candidate/batch are immutable proposals; events persist where material | Temporal boundary tests | `ALREADY_IN_MAIN` |
| `time_slice_plan`, `time_slice_result`, `temporal_advance_request`, `temporal_advance_result` | `@rus/turn` sealed orchestration + time owner | domain handlers/turn | committed slices/results through existing target mapping | `temporal-advance.test.js` | `ALREADY_IN_MAIN` |
| `interruption_outcome` | applicable policy/domain handler | execution engine/turn | execution event/attempt state | activity/traversal tests | `ALREADY_IN_MAIN`; cancellation is zero-time control, not provider |
| `party_traversal_interval_result`, `synchronized_time_slice_result` | traversal/carrier execution | turn/committer | migration `003`/`004` tables | P19, carrier, PostgreSQL | `ALREADY_IN_MAIN` |
| `perception_result` | `@rus/npc-runtime/proposeNpcPerception` | turn then knowledge/reaction owners | migration `007` perception records/witnesses | NPC runtime/contract/PostgreSQL | `ALREADY_IN_MAIN`; orchestration call path remains a gap |
| `npc_decision_option`, `npc_decision_request`, `npc_decision_trace` | three approved Novgorod authoring option records; formal runtime option/request producer not proven | NPC bounded decision exists; registered consequence handler not proven | migration `007` decision traces | NPC runtime tests use synthetic requests/options | contracts/validator/decision engine and approved records are `ALREADY_IN_MAIN`; runtime producer and handler mapping are `DATA_GAP` |
| `propagation_process_ref`, `remote_aggregate_state`, `remote_catch_up_request`, `remote_catch_up_result` | world-process owner | turn/time resolver | migration `007` remote/process tables | world-process and Temporal tests | `ALREADY_IN_MAIN` |
| `visible_package_persistence_envelope`, `combined_write_plan` | knowledge-safe projector / turn | atomic committer / post-commit narration | migration `007` visible package/narration tables | lifecycle/committer/PostgreSQL | `ALREADY_IN_MAIN`; perception integration must reuse |
| Spatial route/plan/execution family: `movement_target_request`, `path_query`, `movement_option`, `party_route_plan`, `party_route_plan_step`, `party_route_plan_execution`, `party_route_plan_execution_event`, `traveller_travel_state` | movement planner + execution engine | turn/committer/reload | migrations `003`–`004` | P18/P19/P21/P15 | `ALREADY_IN_MAIN`; no new travel engine |
| Spatial first-entry family: `party_g5_site`, `party_scene_baseline`, `party_g6_instance`, `scene_position_node`, preparation/frontier contracts | materialization/preparation owners | turn/atomic committer | migration `002` plus domain mapping | first-entry/P20/P21/P13 | `ALREADY_IN_MAIN`; first-entry reuses canonical/generated G5 and creates/reuses G6 |
| `world_perception_signal` (base Spatial contract) | no complete public producer proven | no complete shared consumer path proven | table exists in migration `002` | registry/DDL only | `DATA_GAP`; registry presence alone is not a handoff |
| sealed perception input and replay evidence used internally by `@rus/npc-runtime` | `@rus/turn` sealed producer | `proposeNpcPerception`; result then goes to knowledge owner | existing perception result + idempotency mapping; no new store | new public-registry contract tests | contract gap resolved by Appendix A.7; target/shadow runtime and exact-commit audit accepted |
| tagged journey start/continue/successor command ingress | authenticated ingress + sealed server state | target command registry/execution engine | existing execution, event and idempotency tables | new public-registry contract tests | contract gap resolved by three separate command DTO plus successor-preparation DTO; no nullable catch-all |
| zero-time journey cancel/control command payload | authenticated ingress + sealed server state | existing `abortActivity`/execution transitions | existing execution/change-set tables | new public-registry cancel/no-clock tests | contract gap resolved; cancel is explicitly not a boundary candidate |

#### Contract amendment TDD evidence

The public seam is `@rus/contracts/spatial-v3/registry`.

- RED: `node --test packages/contracts/test/pr8-handoff-contracts.test.js`
  failed 5/5 because current version was `4.3.0-target.1` and all 13 proven
  handoff declarations were absent.
- Normative Green: Appendix A.7 and ADR-007 define four tagged journey
  commands, eight closed perception causal/request members plus replay
  evidence, exact owners, identity and existing persistence mapping.
- Generated Green for this initial slice: `4.4.0-target.1` contained
  202 contracts/82 errors;
  generated `4.3.0-target.1` contract and error snapshots are byte-identical
  to baseline HEAD.
- Test Green: the eight focused tests pass; client clock/future cancel fields,
  successor endpoint/party mismatches, disconnected/cyclic propagation,
  incomplete portal/condition branches, direct knowledge mutation and an
  ungrounded causal-parent field are rejected.
- Short regression checks: contract tests 19/19, P01, P06/P27, P07 and P08
  passed; all three generators pass `--check`.

The subsequent first-entry/reaction inventory proved two further formal gaps
before runtime work:

- migration `003` can bind a transfer-scene preparation member only to an
  already resolved G5/baseline/G6/position tuple, so it cannot reserve an
  approved generated-G5/G6 chain that must be created atomically at arrival;
- approved Temporal authoring and `world_base.decision_command_catalog` use
  `decision_command`, but the immutable controlled-vocabulary registry v2 did
  not contain that entity kind.

Appendix A.7 therefore adds `prepared_scene_materialization_snapshot`, overrides
`preparation_snapshot_member` with an exact resolved-or-prepared XOR branch,
and overrides `npc_decision_option` with a mandatory approved `command_ref`.
Appendix C.1 introduces current-target vocabulary v3 (21 vocabularies /
499 values) with only `decision_command` added; accepted v2 (21/498) remains
byte-identical. The initial contract union was 202/82; the later
reaction/knowledge extension is recorded separately below. Historical Spatial
4.3.0-target.1 snapshots remain byte-identical.

The amendment docs gate passed three consecutive static runs. Each run included
`docs:check`, `temporal-v4:check-docs`, `test:docs`, P01, P06/P27, P07 and the
production-activation-boundary check with zero findings. Corpus manifest
`900eab85f217e8fdab32b3ed56e27024390ed7f471e2357f98ef13d0146387b5`
is bound to the regenerated normative RAG artifacts.

The first independent contract audit returned `CHANGES REQUIRED` for two
P1 findings:

1. the public validator checked only generated shape and did not enforce the
   successor handoff equality, propagation path or full request-digest
   invariants;
2. perception snapshots hid strength, topology effects, weather, ambient noise
   and transient modifiers behind digests, so the declared pure resolver could
   not operate without hidden reads.

A second RED cycle added failing cases for a mismatched successor endpoint,
new explicit sealed perception values, a stale full-input digest and a
disconnected propagation path. The minimal Green now:

- copies the closed `sound_event` strength band and active
  `visibility_link`/`acoustic_edge` values into the immutable handoff;
- carries resolved portal/condition effects, weather visibility/acoustic
  effects, target `g6_acoustic_profile` ambient noise, complete active
  `visibility_modifier` rows, pinned transient effects and explicit observer
  orientation/capability bands;
- validates successor endpoint/party binding, channel-specific edge branches,
  propagation continuity/acyclicity and the canonical digest of the complete
  sealed request excluding the digest field itself.

The same audit found that the Temporal 4.3 historical freeze had been
retroactively regenerated during the docs-only work. It is restored
byte-identical to `origin/main` (SHA-256
`7d08d43eb31a5f228196c37e054d1176ec97645b3e7f105e0ed76a7cc7885b85`);
the freeze checker now pins that immutable digest, while current activation
metadata remains only in `production-activation-boundary.v1.json`.

After these corrections, normative RAG and Graphify were regenerated. The
combined query
`PR8 handoff contract successor endpoint sealed perception explicit visibility
acoustic weather ambient noise canonical input digest` returned Appendix A.7
from the updated corpus and the validator/perception call path from the
repository graph. `repo-intel:status` reports Graphify `0.9.17` ready at
baseline `ef490ecd...`; the known semantic-coverage `degraded` status remains a
navigation warning only.

No runtime implementation, DDL, migration ordinal or production composition
changed in this contract slice. Runtime work begins only after the independent
normative audit recorded below.

#### Contract amendment audit

The first audit verdict was `CHANGES REQUIRED`; both P1 findings and the
historical-freeze regression were corrected as recorded above. The repeat
audit verdict is `PASS WITH NOTES` with no blocking content finding. The critic
confirmed byte-identical Temporal 4.3 freeze and 4.3 generated snapshots,
separate current activation metadata, explicit typed perception values, all
new validator invariants, no production/runtime/DDL change, and the added
negative tests. Its only note is an isolated-agent Graphify wrapper path error;
the primary clean worktree independently completed `graphify update .`,
`repo-intel:ensure`, `repo-intel:status` and the combined query with Graphify
`0.9.17` ready. The runtime TDD gate is therefore open.

#### Reaction/knowledge contract extension

Runtime mapping after the initial audit proved three additional gap classes:

- no closed read projection bound an approved
  `world_base.decision_command_catalog` row to its exact source record,
  applicability, public input/consequence contracts and single registered
  handler;
- no formal request/proposal/effect envelope existed between a validated NPC
  choice, its code-owned handler and the existing target command registry;
- package-local perception knowledge refs had no public delta/merge handoff
  preserving `@rus/visibility-knowledge-memory` as sole validation/merge owner.

The same Appendix A.7 therefore adds
`approved_decision_command_snapshot`,
`npc_reaction_handler_input_snapshot`,
`npc_reaction_consequence_request`,
`npc_reaction_consequence_proposal`,
`npc_reaction_effect_snapshot`,
`knowledge_memory_delta_proposal` and
`knowledge_memory_merge_result`. The current `4.4.0-target.1` registry now
contains 213 contracts/82 errors after the later option-producer amendment;
the version is unchanged because these
additive handoffs close the same unactivated PR8 target amendment. The
historical 4.3 contract/error blobs still match `origin/main` exactly.

TDD evidence for this extension:

- focused current contract/registry tests: 15/15;
- P01: historical 160/58 and 188/82 preserved; current 213/82;
- P06/P27, P07 and P08: PASS;
- approved command source/handler pins, full reaction request/proposal
  digests, closed effect-to-existing-command mapping, fact/hypothesis
  disjointness and exact knowledge state-version progression all have
  negative tests.

The first independent re-audit returned `CHANGES REQUIRED`. Its negative
probes showed that the initial envelope accepted an unregistered handler,
unrelated pins/idempotency, an opaque input containing state-patch/clock/SQL
keys, a proposal unrelated to its request, a factual delta without the
perception outcome and a merge-created fact.

The corrective Red→Green slice now:

- exposes a closed three-entry current-target reaction-handler binding;
- recalculates command and decision-trace digests;
- uses a typed closed handler input containing the complete causal
  `perception_result`;
- derives handler idempotency from request/state/trace/command identity;
- embeds and cross-validates the complete request in the consequence proposal;
- narrows the current knowledge source to perception and records
  received-message evidence as `DATA_GAP`;
- requires the complete causal perception in the delta and the sealed
  proposal/state-before sets in the merge result.

The focused critic negative suite is green (9/9), current registry/conformance
tests are green (10/10), and P01/P06/P07 again preserve historical
160/58 and 188/82 snapshots while validating the then-current 209/82. The second audit
found one remaining nested causal-digest bypass
(`misinterpreted`→`recognized` with an unchanged inner digest); the exact probe
was added and now fails closed at
`source_perception.canonical_digest`.

The final independent re-audit returned `PASS WITH NOTES`: no substantive
finding remains and the target runtime gate is open. Its only note is the
critic's isolated Graphify wrapper path error. The primary clean worktree
independently completed Graphify `0.9.17`, `repo-intel:ensure/status/query`,
RAG retrieval and all normative checks without readiness errors.

#### Reaction option-producer contract extension

The next contract-to-runtime inventory proved an eighth gap: the existing
`npc_decision_request` validates an already finite option set, but no public
contract sealed the causal inputs or proved the filtering that produced it.
Appendix A.7 now adds
`npc_reaction_option_rule_snapshot`,
`npc_reaction_policy_snapshot`,
`npc_reaction_option_context_snapshot` and
`npc_reaction_option_set_proposal`.

The current registry contains 213 contracts/82 errors. Historical
`4.3.0-target.1` contract and typed-error artifacts have no Git diff. Focused
contract tests pass 9/9 and P01, P06/P27, P07 and `docs:check` pass. Negative
tests reject `not_perceived`, duplicate/noncanonical rules, empty applicable
sets, stale state and reuse of an option set after a digest-bound context
change. The initial normative typo `state_version_set` was caught before
runtime and corrected to the existing `expected_state_version_set`; no
parallel DTO was created. Dependent option-producer runtime remains blocked
until a focused independent normative audit passes.

The first focused audit stopped with `CHANGES REQUIRED` before content review:
the latest corpus change had made `retrieval-policy.json` stale and the
critic correctly treated invalid Repository Intelligence as a hard block.
The policy baseline was rebound to corpus manifest
`594d9998a706afd0ae49e59ff44c2b72d46e6c5d8d091683096328e7941f5b55`;
`knowledge:generate` and `graphify update .` rebuilt both channels.
`repo-intel:ensure` then returned `ok:true` with Graphify `0.9.17`;
`knowledge:status` is the permitted `degraded` state with no blocker
documents, and combined `repo-intel:status/query` has no readiness errors.
The repeated RAG query
`PR8 NPC reaction option producer ownership approved command applicability
zero one many bounded decision` returns Appendix A.7 first. Graphify query
`reaction option producer npc runtime bounded decision` and the path
`validateSpatialV3Contract` → `formal` → `decideBoundedNpcAction` confirm the
public validator-to-existing-consumer path; the absence of a graph node for a
YAML contract name was recorded as expected AST coverage, not evidence.

The content audit then returned blocking probes despite green stock checks:

- a nested `source_perception` outcome could be changed without recomputing
  its inner digest;
- an invented `decision_command` could be self-pinned despite having no
  registered handler;
- arbitrary `preconditions_digest` and `command_token` values survived after
  recomputing the enclosing option/proposal digests;
- `options_digest` appeared in proposal identity but was absent from its
  fields.

The corrective Red→Green slice adds the exact approved command projections to
the policy snapshot, verifies one closed handler per rule, validates the
nested perception digest, makes `options_digest` explicit, and defines one
canonical request/preconditions/token-free-option-set/token derivation owned
by `@rus/contracts`. The focused suite now passes 19/19 including exact
negative probes for all four findings; P01, P06/P27, P07, `docs:check` and RAG
readiness also pass. The current corpus manifest pin is
`5485f5789fccbfcc66c5c71728ceedf83348797b28515477cb26f74e5bbf668a`.
Dependent runtime remains blocked until the repeated independent audit passes.

The repeated independent audit verdict is `PASS WITH NOTES`. All four
contract findings are closed. The only note is a P08 public-interface registry
sync failure for the already implemented perception/reaction combined-write
mapper, not a finding in the option amendment. The option-producer runtime
gate is open. P08 was then synchronized with both the existing combined-write
mapper and the new option producer and passes.

The pure `@rus/npc-runtime` option producer now filters only the approved
audited rules from one formal sealed context, builds the canonical request,
preconditions and request-bound tokens through `@rus/contracts`, returns
zero-options as `npc_decision_policy_gap`, bypasses LLM for one option, and
uses bounded selection only for multiple applicable options. Identical
persisted proposals replay; any changed digest-bound input rejects the old
proposal. Focused runtime tests pass 5/5, including direct handoff to the
existing bounded-decision owner for both one- and three-option cases.

#### Travel authoring and exact-head readiness inventory

`npm run temporal-v4:check-data-readiness` currently returns a typed hard
block for all thirteen approved Temporal families. The only reported artifact
class is `generated_schema`: the existing immutable approval manifests bind
the prior generated schema digest, while the additive PR8 contract amendment
changes that technical artifact. This result is recorded as an exact-head
validation gap, not as evidence that the approved records changed
semantically.

No donor file or repository-intelligence result proves an approved missing
route-travel, navigation, interruption or transport authoring family.
Consequently:

- the existing thirteen families and Spatial route/traversal records remain
  `ALREADY_IN_MAIN`;
- donor travel authoring schemas remain `DATA_GAP` reference material;
- no new family or record is created from donor presence;
- current target runtime visibility remains blocked until a candidate-bound
  generated-schema validation artifact is produced without rewriting the
  immutable historical approvals;
- semantic reapproval is required only if record content, required schema
  semantics or interpretation rules change.

#### Journey command and immutable-plan TDD slice

`@rus/turn/spatial-v3-journey-commands` now exposes one narrow coordinator
over the four Appendix A.7 tagged payloads. It does not plan routes, advance
time or write storage. The coordinator:

- accepts the authoritative exact clock only from a sealed server state
  projection;
- verifies party, plan, execution, expected-state and dependency-pin binding
  before invoking an explicit handler;
- preserves the immutable route-plan digest for start/continue/cancel;
- treats cancel as exact `0/1` elapsed and rejects every returned temporal
  candidate;
- requires successor plan/execution identities to be new and binds the exact
  predecessor handoff;
- replays an identical in-process request and rejects conflicting reuse of one
  idempotency key.

The existing P21 target/shadow command registry has one additional internal
`journey_command` envelope. Its sealed payload is stripped of only the outer
envelope digest and validated against the specific tagged public contract; an
explicit `loadJourneyState` port supplies server state. This internal envelope
is not an approved player/NPC command token and does not change production
composition.

RED was a missing public module. Green is 6/6 focused tests, including the
target/shadow registry path, server clock ownership, stale state/pins,
idempotent replay/conflict, zero-time cancel and successor lineage. P21
regression remains 9/9.

#### Temporal traversal TDD slice

The existing `createTemporalAdvanceEngine` remains the only turn-level
collector around the pure `@rus/time-events-history` ordering and same-time
cascade resolver. No travel clock, boundary sorter or second activity engine
was added. Its working projection is now advanced explicitly:

- `applyContinuous` may return a new immutable `state_projection` after the
  positive interval;
- each deterministic boundary handler may return the next immutable
  `state_projection`;
- every later provider and same-time handler observes that latest projection;
- the finalizer receives the final working projection explicitly;
- a missing projection update preserves the prior projection, while a
  non-object update fails with `temporal_change_set_conflict`.

This closes the stale-input gap for traversal completion/recheck followed by
body, environment, schedule or perception candidates. The dedicated journey
test proves a traversal recheck at minute 11, a same-time perception
follow-up, and a body threshold at minute 12; the later provider and handler
both observe the recheck state. Ordering, earliest-batch selection, same-time
cycle detection and the single final clock proposal remain owned by
`@rus/time-events-history` plus the existing Temporal advance composition.
Zero-time journey cancellation remains outside all future boundary providers.

Focused validation:

- `packages/turn/test/temporal-advance.test.js`: 10/10;
- `packages/time-events-history/test/temporal-boundaries.test.js`: 6/6;
- `packages/turn/test/spatial-v3-journey-commands.test.js`: 6/6;
- `test/spatial-v3/p19-execution.test.js`: 8/8.

#### Spatial-v3 first-entry TDD slice

Inventory proved that target migrations `002` and `004` already own the
generated G5, scene baseline, G6, scene-position and journey-location rows.
It also proved one storage gap: migration `003` could bind a preparation
member only to an already resolved baseline tuple. The audited Appendix A.7
amendment therefore introduced the mutually exclusive
`prepared_scene_materialization` branch, implemented by immutable target
migration `008_party_runtime_pr8_first_entry.sql`. It adds no new table and
does not change the production loader.

`buildCombinedWritePlan` and the sole game-server
`CombinedAtomicCommitter` now admit only these core existing first-entry
shapes:

- optional generated `party_g5_sites` insert;
- zero or one `party_scene_baselines` insert;
- its `party_g6_instances` and `scene_position_nodes`;
- exactly one root `party_journey_locations` update to an exact scene
  position;
- exactly one reserved `preparation_claims` transition to `consumed`;
- the existing factual change set, visible package and
  presentation-pending narration job in the same plan.

A generated-template baseline requires its generated G5 host in the same
plan. A newly inserted baseline requires at least one G6 and position, and
the arrival update must name one inserted position. Baseline reuse is the
zero-baseline-insert branch; it still moves exactly one root owner and remains
subject to the same commit rechecks.

Every `first_entry` plan binds the complete preparation snapshot/member,
immutable route plan/execution, reserved claim, canonical G4, generated or
reused baseline and exact position identity. Its sole G4 lock key is
`<party-id>:<g4-id>`. P16 acquires that transaction-scoped advisory lock before
idempotency leasing, the baseline absence/reuse recheck and all domain writes.
The production PostgreSQL recheck adapter validates the complete sealed chain
inside that transaction. Dependency ordering writes generated G5 → baseline →
G6 → position → journey location and consumes the claim, while PostgreSQL
deferred constraints validate the complete scene at commit.

Validation:

- `test/spatial-v3/p16-persistence.test.js`: 7/7, including explicit
  lock-before-baseline-read-before-domain-write evidence;
- `test/spatial-v3/p16-committer-postgres.test.js`: 1/1 in isolated
  PostgreSQL 16, with real migrations `001..008`, two concurrent first-entry
  requests for the same G4/preparation scope, exactly one generated G5/G6
  baseline, claim consumption, exact position update, replay and atomic
  presentation rows;
- `test/spatial-v3/p21-orchestration.test.js`: 9/9;
- journey command regression: 7/7.

The legacy production-v2 `enterG4WithMaterialization` remains untouched and
is not used as the target implementation. It continues to be production-v2
scope until the separate versioned production activation cutover.

### Matrix 3: persistence and DDL

The first two disposition rows record the target-candidate inventory state
before the later cutover commit; the cutover outcome is recorded in the
dedicated section below.

| Production/target table or loader | Owning contract | Repository / writer / reader | Migration and rollback mapping | Cutover disposition |
|---|---|---|---|---|
| production `migrations.js` → only `001_party_runtime.sql` | production v2 | v2 party store/repositories | current production path unchanged | sole production owner until cutover |
| target `spatial-v3-target-migrations.js` → `001..010` | Spatial/Temporal target registry | target tests, shadow composition and prepared production-v3 root | sequential immutable chain; rollback remains release-identity/checkpoint based | default production loader remains v2 until cutover |
| `002_party_runtime_v3.sql`: G5/G6, baselines, positions/topology, beliefs/signals | Spatial first-entry/topology/knowledge contracts | Spatial v3 repository; combined committer | v2 source mapping is migration tooling; rollback by release identity/checkpoint | reuse; no donor environment DDL |
| `003_party_runtime_v3_planning.sql`: preparation, route plans/executions, activities, travel state, intervals | route/activity/traversal contracts | execution engine proposals; combined committer | existing target ordinal | reuse; no donor travel journal |
| `004_party_runtime_v3_journeys.sql`: change sets, idempotency, cohort/carrier, locations, clock, synchronized slices | combined plan, journey and clock contracts | turn writer plan; combined committer; target repository | existing target ordinal and lock-order constraints | reuse; sole clock owner invariant |
| `005_party_runtime_v3_domain.sql`: control, NPC schedule, transport G6 | domain/NPC schedule contracts | P23 domain repository | existing target ordinal | reuse |
| `006_party_runtime_v3_migration.sql` | migration coverage contract | migration tooling | v2→v3 coverage and explicit rollback identity | reuse |
| `007_party_runtime_temporal_world.sql`: exact Temporal fields, events, perception, decisions, body/remote, visible/narration | `temporal-world-v1` | target repository + combined committer | historical final target ordinal before PR8 | reuse unchanged |
| `008_party_runtime_pr8_first_entry.sql`: strict prepared/resolved preparation-member branches | Appendix A.7 `preparation_snapshot_member` current override | preparation producer/reader; game-server recheck and combined committer | forward-only target column/constraints; rollback by pre-cutover checkpoint/release identity, never by mixed reads | target/shadow only; production loader unchanged |
| `009_party_runtime_pr8_reaction_knowledge.sql`: perception replay, code-owned reaction consequence and deterministic knowledge merge | Appendix A.7 replay/reaction/knowledge declarations | target combined committer and target repositories/readers | append-only replay/consequence/result tables plus versioned merge state and a complete-or-null target branch on existing `party_npc_knowledge`; no inferred backfill | target/shadow only; PostgreSQL 16 `001..009` apply/reapply passed; production loader unchanged |
| `010_party_runtime_pr8_reaction_options.sql`: pending bounded reaction option proposals | Appendix A.7 option-set proposal and replay identity | target combined committer and exact target repository reader | append-only immutable proposal; selected consequence remains a separate validated completion write set | target/shadow only; PostgreSQL `001..010` commit/readback/replay passed; production loader unchanged |
| donor `002_environment_landmarks.sql`, `003_travel_runtime.sql` | obsolete donor contracts | obsolete donor adapters | none | `DROP_OBSOLETE`; numbers are not available |
| first-entry transaction lock | party + canonical G4 from the sealed preparation member | game-server PostgreSQL transaction | exact `04:g4:<party-id>:<g4-id>` advisory lock before claim/baseline recheck | implemented; concurrent creation proves one winner and atomic rollback for the rejected request |

### Matrix 4: commands and bounded decisions

The current target command registry provides code-owned internal command
**kinds**, not approved player/NPC command records. Its outer command validates
identity, kind, idempotency and sealing but treats `command_payload` as an
opaque sealed object; therefore the kinds below do not by themselves close
the tagged journey-ingress gaps.

| Command token/kind | Approved record / policy | Option producer / handler | Consequence / trace / tests | Disposition |
|---|---|---|---|---|
| `path_query` | Spatial planning contracts | planner / target composition handler | movement option; P18/P21 | existing internal kind |
| `prepare_target` | preparation contracts | materialization preparation handler | preparation proposal; P20/P21 | existing internal kind |
| `resolve_frontier` | frontier contracts | frontier resolver | topology proposal; P20/P21 | existing internal kind |
| `activate_plan` | route-plan contracts | activation validator | execution activation; P19/P21 | existing internal kind |
| `immediate_action` | action contract required | execution engine handler | code proposal; P19/P21 | existing internal kind, not a generic reaction token |
| `timed_activity` | activity contract/profile required | activity execution handler | attempt/execution proposal; Temporal tests | existing internal kind |
| `timed_traversal` | traversal/route contracts required | traversal execution handler | interval proposal; P19/P21 | existing internal kind |
| `journey_command` | Appendix A.7 tagged start/continue/cancel/successor DTO | `createSpatialV3JourneyCommandCoordinator` over a sealed server projection | immutable-plan binding, server exact clock, zero-time cancel and replay tests | current target/shadow internal envelope; not a player/NPC command token |
| `resume_plan` | paused execution and policy | explicit adapter required | successor/event trace | handler port exists; production adapter inventory required |
| `replan` | exact handoff/successor rules | explicit adapter required | new immutable plan lineage | handler port exists; no in-place mutation |
| `recover_journey` | approved recovery binding | explicit adapter required | recovery proposal | handler port exists; empty candidates hard-block |
| `board_carrier`, `disembark_carrier`, `load_carrier`, `change_cohort` | mode-handoff contracts | code-owned handoff orchestrator | atomic successor lineage; carrier tests | existing internal kinds |
| `journey_cancel_command` | audited Appendix A.7 tagged ingress; current state/policy preconditions | journey coordinator routes to the existing activity abort consequence | zero elapsed, no fictitious interval, state/version/idempotency binding; journey tests | implemented in target/shadow command coordinator |
| `npc_investigate_signal` | approved `npc_reaction_policy` authoring row, applicable Novgorod profile and pinned consequence policy | pure option producer plus `npc.reaction.investigate-signal.v1` | option proposal, trace, consequence, exact readback and replay tests | `REIMPLEMENT`; implemented target/shadow, source/provenance validated |
| `npc_seek_safety` | approved `npc_reaction_policy` authoring row, applicable Novgorod profile and pinned consequence policy | pure option producer plus `npc.reaction.seek-safety.v1` | option proposal, trace, consequence, exact readback and replay tests | `REIMPLEMENT`; implemented target/shadow, source/provenance validated |
| `npc_report_to_authority` | approved `npc_reaction_policy` authoring row, applicable Novgorod profile and pinned consequence policy | pure option producer plus `npc.reaction.report-to-authority.v1` | option proposal, trace, consequence, exact readback and replay tests | `REIMPLEMENT`; implemented target/shadow, source/provenance validated |
| PR10 `ignore`, `observe`, `approach`, `speak`, `warn`, `flee`, `call for help`, `defend`, `pursue`, `report`, `remember` concepts | no approved Novgorod command records/policies proven | no complete registered handler set | synthetic NPC tests do not approve tokens | `DATA_GAP`; no runtime tokens may be created |

Bounded NPC semantics already enforce zero options → typed
`npc_decision_policy_gap`, one option → code path without LLM, and multiple
options → bounded selection only when policy authorizes it. Persisted validated
trace replay exists, but it cannot compensate for a missing approved command
record or consequence handler. The three current approved Temporal option
references are the only reaction identities established by this inventory.
Their exact applicability, source-backed policy, registered-handler and
consequence-policy bindings remain a semantic authoring gap; runtime must not
infer those bindings.

### Matrix 5: evidence and activation

| Artifact | Historical binding | Changed by PR8 | Semantic reapproval | Exact-head revalidation | New evidence path/disposition |
|---|---|---:|---|---|---|
| `release-evidence.v1.json` | P28 candidate `2ec109c...`, SHA-256 `84e4fd93...` | no | no | no; immutable record | retain historical only |
| `p28-appendix-d-evidence-ledger.md` and allowed P28 child paths | digest-bound by historical manifest/scope | no | no | no | retain historical only |
| historical P05 `normative-freeze.json` | SHA-256 `131738c4...`, current authority false | no | no | no | retain historical only |
| historical Temporal 4.3 `docs/work/temporal-world-v4/normative-freeze.json` | SHA-256 `7d08d43e...`, accepted `temporal-world-v1 / 4.3.0-target.1` snapshot | no; restored byte-identical after audit | no | no | retain immutable; current activation boundary is separate |
| approved P12 catalog manifest/data | historical P28 resolution evidence | only if final PR8 changes content/schema/interpretation | only for semantic changes | yes for candidate-bound changed files | new PR8 exact-head manifest |
| `temporal-world-v1` specifications, controlled vocabularies and generated contract artifacts | prior target acceptance/P28 exact head | expected only if a proven contract gap is amended | normative audit, not automatic data reapproval | yes | new PR8 contract evidence section |
| historical target migrations `001..007`; PR8 candidate adds `008`, schema reference, recheck adapter and committer changes | historical P28 exact head covers only `001..007` | yes | no semantic authoring approval; Appendix A.7 already received normative audit | yes | new PR8 DDL/runtime evidence section |
| travel/perception/reaction runtime and tests | donor evidence is non-authoritative | yes | command/catalog approval only when content changes | yes | new PR8 functional exact-head package |
| target functional composition/loader | production v2 sole owner at subject `5c35975f...` | no during target implementation | no | verified unchanged on the functional candidate | immutable pre-cutover proof |
| versioned production activation cutover commit | no historical binding | yes, separate child of accepted target evidence | no new semantic authoring approval; all prior gates remain closed | exact cutover HEAD plus live composition verification | `spatial-v3-production-v1`; new cutover evidence/rollback identity |

No donor artifact or proposed runtime interface may be transferred without a
completed disposition row. Inventory established the cross-package sealed
perception input/replay handoff, tagged journey ingress and prepared
first-entry branch as formal blockers. They were resolved by the independently
audited Appendix A.7 amendment before their dependent runtime/DDL work. The
inventory itself did not preassign a version or migration ordinal; audited
contract `4.4.0-target.1` and migration `008` were introduced only after those
gaps were proven.

#### Inventory audit

Verdict: `PASS WITH NOTES`; inventory is complete and normative amendment may
start. The critic independently reproduced both donor path counts/digests,
confirmed 146/146 PR8 and 154/154 PR10 dispositions, checked all 35 Temporal
Appendix A contracts against the 188-contract public registry, verified
production loader `001` versus target loader `001..007`, and accepted the
command/evidence distinctions. Sixty focused contract, NPC, Temporal,
persistence and orchestration tests passed in the critic environment.

The note is an isolated-agent Graphify wrapper error (`Failed to canonicalize
script path`). It does not change the inventory verdict because the main
workspace reproduced Graphify `0.9.17`, exact-baseline manifests and successful
queries; it remains tracked as environment evidence rather than hidden.

## Normative synchronization evidence

Current production status is declared by
`docs/migration/spatial-v3/production-activation-boundary.v1.json` and its
closed schema. It binds the immutable historical P28 manifest
`docs/migration/spatial-v3/release-evidence.v1.json` at SHA-256
`84e4fd93fad37b83424533970621f74e7a96adfa84534188f939b7ad0dd2f29f`
and candidate `2ec109c99c5e2b33f43dc5f89735e6e72686299b`. The historical record
states `production_writes: 0` and `composition_changed: false`; neither it nor
the P02/P05 records was rewritten.

The completed canonical sequence is:

```text
historical production_v2 sole owner
→ target/shadow validation
→ versioned production activation cutover
→ current spatial/temporal v3 sole production owner
```

The cutover atomically switches composition, authoritative readers, writers,
migration path, runtime pins and rollback identity. Partial activation, dual
write, authoritative mixed read and semantic v3-to-v2 fallback are forbidden.

The visible-package lifecycle is synchronized as:

```text
candidate post-change state
→ code-owned player-safe projection
→ hidden-leak validation
→ combined write plan
→ atomic facts + visible package + presentation-pending metadata
→ narration from persisted package
→ final screen projection
```

Checks completed after regenerating the canonical corpus/RAG outputs,
documentation and the current Temporal freeze:

| Check | Result |
|---|---|
| `npm run docs:check-activation-boundary` | three consecutive passes, zero findings |
| `npm run docs:check` | three-pass gate complete; generated data current |
| `npm run temporal-v4:check-docs` | three-pass gate complete; zero conflicts |
| `npm run temporal-v4:freeze-check` | pass, reproducible |
| `npm run knowledge:check` | pass, 36 documents; graph and RAG current |
| `node tools/spatial-v3/check-p25.mjs` | pass; no dedicated npm script exists on this baseline |
| `git diff --check` | pass |

After regeneration:

- `graphify update .` rebuilt the local repository graph successfully with
  pinned Graphify `0.9.17`;
- `npm run repo-intel:ensure` confirmed exact baseline commit
  `ef490ecd8cf91f9e07531fc5d56b2abd7b044c41`;
- `repo-intel:status` reported the repository graph ready and the known
  knowledge semantic-coverage warning without readiness errors;
- the repeated combined RAG/Graphify query retrieved the current v2-owner,
  historical P28 and separate cutover statements from the regenerated corpus.

### Independent audit cycle 1

Verdict: `CHANGES REQUIRED`.

The critic found two P1 issues:

1. `base_turn_orchestration.txt` placed combined-plan commit before
   player-safe candidate projection and hidden-leak validation.
2. Several current pipeline/normative documents still described P28 as a
   future activation gate.

It also found that the first checker covered only a narrow file allow-list and
tested lifecycle vocabulary without proving order. The historical P05 freeze
was insufficiently distinguished from current activation authority.

Corrections:

- the lifecycle now orders candidate state, safe projection, leak validation,
  combined plan, atomic commit, narration and screen projection;
- current Temporal/Spatial/formula/movement/world-generation/pipeline/module
  claims use only `versioned production activation cutover`;
- the migration README is explicitly an immutable historical work log;
- the current boundary manifest binds the historical P05 freeze by digest and
  declares it non-authoritative for current status;
- the static checker covers all current sources, detects additional stale P28
  forms and validates lifecycle ordering.

After the corrections, `docs:check-activation-boundary` completed three new
consecutive zero-finding passes. `docs:check`, `temporal-v4:check-docs`,
`temporal-v4:freeze-check`, `knowledge:check`, `spatial-v3:check-p25` and
`git diff --check` all passed again.

### Independent audit cycles 2 and 3

Cycle 2 found two remaining traceability gaps in the active `time_system.txt`
and `space-map` module plus a Cyrillic stale-claim pattern missing from the
checker. Those claims and the checker were corrected and all documentation,
freeze and knowledge artifacts were regenerated.

Cycle 3 then found the last four English `before P28` claims in three active
Temporal ADRs and `packages/presentation/MODULE.md`. The claims now refer to
the separate `versioned production activation cutover`; the checker rejects
case-insensitive `before P28` variants.

After the cycle-3 corrections:

- `docs:check-activation-boundary` completed three new consecutive passes
  with `finding_count: 0`;
- `docs:check`, `temporal-v4:check-docs`, `temporal-v4:freeze-check`,
  `knowledge:check`, the direct P25 checker and `git diff --check` passed;
- Graphify `0.9.17` rebuilt the exact-baseline repository graph successfully;
- `repo-intel:status` reported no readiness errors, and the repeated combined
  RAG/Graphify query returned the synchronized current boundary.

The known knowledge-source semantic coverage status remains `degraded`; under
the active navigation rules this is a warning, not a Graphify readiness
failure.

### Independent audit pre-inventory verdict

Verdict: `PASS WITH NOTES`. No blocking finding remains, and inventory may
start. The critic confirmed complete stale-P28 coverage, ordered
visible-package lifecycle validation, immutable historical P05/P28 evidence,
portable project Graphify hook, and no contracts/DDL/runtime-logic change.

The sole note is that two runtime-source files contain wording-only changes:
`packages/new-game/src/spatial-v3-stage-mapping.js` changes a comment and
diagnostic error text, and `packages/time-events-history/src/legacy.js`
changes a comment. No logic, public contract, persistence or persisted
behavior changed.

### Independent audit cycle 4: late current-status discovery

A later focused re-audit reopened the docs-only verdict after finding four
active/current sources outside the checker's discovery scope:
`docs/domain/OWNERSHIP_MAP.md`, `character_parameters.txt`, the Novgorod
`G1_SEMANTIC_CATALOG.md`, and the generated world-base schema reference source.
All four now use the separate cutover term. Discovery includes `docs/domain`,
the exact corpus/catalog/schema paths, and stale forms `after the P28 gate` and
generic `P28 activation`.

After correction:

- `docs:check-activation-boundary` passed three consecutive times with zero
  findings;
- `docs:check`, `git diff --check`, generated source/reference parity and the
  scoped stale-claim scan passed;
- Graphify `0.9.17` rebuilt successfully;
- corpus/retrieval manifests were synchronized and `repo-intel:status`
  returned Graphify ready plus the known RAG `degraded` warning only.

Independent verdict: `PASS WITH NOTES`; no blocker remains. The critic's only
note was its isolated-session Graphify wrapper issue, which was not
reproducible in this main clean worktree.

## Functional candidate implementation

The immutable target subject `5c35975fafdf001236e861d84b0d546f2bd1ee2d`
reuses the accepted Spatial/Temporal owners instead of copying either donor
engine:

- journey ingress is four tagged Appendix A.7 intents over a sealed
  server-owned exact clock; cancellation is a zero-time control outcome and
  successor preparation creates a new immutable lineage;
- Temporal ordering and same-time cascade remain owned by
  `@rus/time-events-history`; `@rus/turn` supplies explicit perception boundary
  callbacks and merges only validated proposals;
- first-entry consumes an approved preparation member, reuses or creates the
  permitted G5/G6 branch, and obtains the transaction-scoped materialization
  lock before the baseline absence/reuse recheck;
- `@rus/npc-runtime` projects the exact approved reaction policy, resolves
  perception and finite options, while
  `@rus/visibility-knowledge-memory` alone validates/merges knowledge and
  builds the hidden-safe visible envelope;
- migrations `008..010` add only the proven preparation, causal
  perception/knowledge and pending bounded-option persistence gaps;
- At the immutable target subject, `production-spatial-v3` was an internal
  prepared sole-owner test harness with explicit bindings and no v2 import or
  fallback. It had no config selector, loader route, root export or package
  export; both a proposed built-in alias and a direct module path were
  rejected. The later cutover changes this boundary atomically, as recorded
  below.

The donor `environment-landmarks` implementation was not transferred:
weather, light and access duplicate `@rus/environment-state`; its narrower
trace/cue concept has no approved current contract or authoring family and is
therefore explicitly retained as `DATA_GAP`, not synthesized by PR8.

### Candidate checks completed so far

| Check | Result |
|---|---|
| PR8 contract, journey, perception, reaction, knowledge and Temporal profile tests | pass |
| `npm run architecture:check` | pass after splitting registry validators and the PostgreSQL committer along ownership boundaries |
| `npm run spatial-v3:check-p08` | pass |
| isolated PostgreSQL PR8 causal write/readback/replay test, migrations `001..010` | pass |
| isolated PostgreSQL P16 committer regression test | pass when repeated alone; the first concurrent-container run lost its temporary connection |
| headless Chrome browser game-flow E2E | pass with real player-safe projection; hidden canonical node remains absent |
| browser-harness doctor | Chrome discovered, but its local CDP daemon was unavailable; the repository Playwright/Chrome E2E was used and is recorded rather than claiming harness success |
| `git diff --check` | pass |

The exact-head evidence, clean-clone acceptance and final exact-commit critic
are complete for subject `5c35975fafdf001236e861d84b0d546f2bd1ee2d`.
Production cutover is a separate child phase with its own exact-head package.

### Functional validation completion

The final target/shadow candidate validation corrected three stale test/evidence
assumptions without weakening a runtime gate:

- historical P02/P05 declaration, reviewed baseline and freeze remain
  byte-locked; their checkers no longer require current normative documents to
  remain byte-identical to that historical snapshot;
- the target migration-chain tests now verify the actual immutable `001..010`
  chain;
- P12 dependency-closure semantic fingerprints exclude only technical
  repository line numbers, raw document digests and their derived manifest
  digests. Category meaning, decision rows, immutable source pins and all other
  content remain fingerprint-bound. A semantic mutation still demotes approval
  fail-closed, while release-status-only line movement does not trigger false
  semantic reapproval.

The P12 generator now derives repository line anchors from a unique required
normative token and preserves the existing immutable historical subject
binding outside the regenerated subject bundle.

| Check | Result |
|---|---|
| P02 current-boundary and immutable-history tests | 56 pass, 0 fail |
| P05 immutable historical evidence tests | 6 pass, 0 fail |
| Temporal data finalization/readiness | 13/13 approvals verified; `activation_ready: true` |
| P12 dependency-closure reproducibility | 10 pass, including technical-drift preservation and semantic-tamper demotion |
| P12 approved target reproducibility | 8 pass |
| Full sequential `test/spatial-v3/*.test.js` | 292 pass, 0 fail, 1 Windows-only symlink skip |
| Full `npm test` | pass; all configured suites and architecture gate completed |
| Explicit real Chrome E2E (`RUS_CHROMIUM_PATH`) | 1 pass, 0 fail, 0 skip |
| Documentation/current-status checker | three consecutive passes, zero findings |
| Post-critic full `npm test` after production-boundary and migration fixes | pass; integration PostgreSQL skips remain covered by the sequential Spatial Docker suite |
| Forced PostgreSQL failure after migration `009` | pass; all `001..009` DDL effects rolled back before successful `001..010` replay |

The final audit found and closed two release-blocking defects:

- migration `009` no longer contains an inner `BEGIN`/`COMMIT`; the target
  loader owns the single transaction for the complete `001..010` chain;
- pre-cutover production composition selection is an explicit allowlist for
  `builtin:production`. Arbitrary module paths and inactive built-ins cannot
  expose the prepared v3 harness before the versioned production activation
  cutover.

The sequential Spatial run exercised the full local PostgreSQL migration,
import/readback, idempotency, rollback, concurrent first-entry, Temporal,
perception/reaction/knowledge, visible-package and production-v3 composition
profiles. Earlier concurrent Docker readiness losses did not reproduce with
`--test-concurrency=1`; no timeout or assertion was relaxed.

After the final source/document changes, `graphify update .` rebuilt the
project-scoped graph with pinned Graphify `0.9.17` (28,119 nodes and 55,240
edges). `repo-intel:ensure` and `repo-intel:status` reported the repository
graph ready with no errors; the known normative RAG semantic-coverage status
remains `degraded` warning-only. The repeated paired query was:

```text
PR8 versioned production activation cutover travel perception ownership exact time
```

Both RAG and Graphify resolved the PR8 handoff amendment, sole clock owner,
perception/reaction ownership, target-only migrations and separate production
cutover boundary.

### Exact functional HEAD

Target/shadow functional commit
`5c35975fafdf001236e861d84b0d546f2bd1ee2d` passed a separate clean-clone
acceptance. The immutable candidate-bound record is
`evidence/target-functional-exact-head.v1.json`; the human-readable command,
result, approval and production-boundary record is
`evidence/target-functional-exact-head-report.md`.

The package explicitly records that production v2 remains the sole owner and
that no production activation occurred. It neither edits nor reuses the
historical PR19/P28 evidence. The machine check is
`npm run pr8:check-exact-head`.

## Versioned production activation cutover

The cutover is a separate child of the accepted target evidence commit
`8d7b970b83e66e7a6d8a170d751340e964d8ce4e`. It does not modify or
redeclare historical P28 evidence or
`evidence/target-functional-exact-head.v1.json`.

Release identity:

| Field | Value |
|---|---|
| release | `spatial-v3-production-v1` |
| composition | `builtin:production-spatial-v3` |
| contract | `4.4.0-target.1` |
| Temporal contract | `temporal-world-v1.1` |
| party schema | `party_runtime_v3_target` |
| world revision | `novgorod_spatial_v3_target_contract_approval_001` |
| world catalog digest | `0ed3a9388930b0245fecdf6ec8adfa08d74d5fe88d5458bd452bee20de16fb1e` |
| world manifest SHA-256 | `4056b93acc2a3c7ed4c76c18182d74b7ef5b9f5fc9c31f206670f11a6283192e` |
| dependency pins | `exact_only` |
| runtime catalog | `rus.runtime_catalog_pin.v2` / `item_container_materialization_v2` |
| catalog resolution | active event for a new party; persisted historical pin thereafter |
| party catalog migration | `party_runtime_catalog_pins_v1` / `f251623759b60799ea75b17b7234833a092b97a5443b8b831643c0544ef25a31` |
| party catalog target fingerprint | `329a84c3c5ccd76e4a84b67454bcbd6e6c176fafbd285e77d44824dddcd8d2dd` |
| target migration chain | `001..010` / `a71b95540c6422ccee5b3d598cb6b0cefe108de3bf41216dea96a99068a5a370` |
| authoritative reads/writes | `spatial_v3_only` / `spatial_v3_only` |
| rollback source | `production-v2` |
| rollback runtime selectable | `false` |

The release changes one boundary atomically:

- server startup imports only the modular entrypoint;
- config defaults to and accepts only
  `builtin:production-spatial-v3`;
- startup accepts only completed atomic cutover stage `13`;
- the composition loader has no v2 or arbitrary-module route;
- package/root runtime exports expose only production v3; v2 is available
  solely as `production-v2-migration-source`;
- the production root uses the explicit
  `createSpatialV3ProductionComposition` factory, never the target/shadow root;
- the production migration path is the immutable `001..010` chain;
- startup rejects any persisted party whose `schema_version` is not `3`;
- deployment-specific bindings are mandatory and validated fail closed;
- health publishes the exact release, schema, reader/writer and rollback
  identities, approved world/Temporal bindings and runtime-catalog pin policy.

No feature-flag fallback, dual write, mixed authoritative read or partial
owner activation remains. Existing v2 parties are not silently upgraded:
startup blocks with `SPATIAL_V3_PARTY_MIGRATION_REQUIRED` until the explicit
migration procedure has produced v3 state.

Current cutover validation:

| Check | Result |
|---|---|
| production-boundary machine checker | zero findings |
| v3 configuration/loader/rollback routing tests | 11 pass |
| P21 journey/orchestration regressions | 16 pass |
| architecture boundaries | pass |
| actual production factory versus shadow-root wiring | production factory only |
| isolated PostgreSQL live startup | pass; migrations `001..010`, zero incompatible parties, sole-owner health identity |
| temporary PostgreSQL resource | container removed after the test |
| historical target exact-head GitHub CI | pass (`clean-clone-generation-test`) |

The current-status wording changed repository line anchors referenced by the
approved P12 source closure. The project generators were used to update those
technical anchors and their derived file/manifest digests. The approved
category records, decisions, source identities and semantic fingerprints were
not changed. The Spatial target bundle was then regenerated from that approved
closure. Likewise, regeneration of `SCHEMA_REFERENCE.md` changed the technical
generated-schema digest recorded by each of the thirteen already-approved
Temporal families; `temporal-v4:finalize-data` repinned that digest and the
derived readiness-manifest digests without changing authoring content,
required fields, semantics or interpretation rules. No semantic reapproval was
claimed for either technical repin.

Final in-place validation completed before the functional cutover commit:

| Check | Result |
|---|---|
| full root `npm test` | pass; all configured suites and gates completed |
| full sequential Spatial/Temporal suite | 293 pass, 0 fail, 1 Windows symlink-capability skip |
| explicit real Chrome E2E | 1 pass, 0 fail, 0 skip |
| isolated PostgreSQL production-v3 startup | 1 pass; migrations `001..010`, sole-owner health identity |
| P02 current/historical boundary tests | 56 pass, 0 fail |
| P04 catalog/current-status tests | 8 pass, 0 fail |
| P12 data and approval tests | 13 pass, 0 fail |
| P12 approved-target reproducibility | 8 pass, 0 fail |
| Temporal approval finalization/readiness | pass; all 13 families ready |
| documentation generation | completed |
| documentation/current-status checker | three consecutive passes, zero findings |
| production activation boundary | zero findings |
| architecture boundaries | pass |
| temporary PostgreSQL resource | stopped and automatically removed |

Refreshed RAG/Graphify, clean-clone cutover acceptance, the independent critic
and cutover exact-head evidence follow the functional commit. They are recorded
only after execution and remain required before the lease-protected PR8 update.

### Cutover audit cycle 1

The first independent exact-commit audit of
`6a582c08fce410a10b074217ce282334628fb5da` returned
`CHANGES REQUIRED`. That commit is rejected and is not an accepted evidence
subject. The critic identified:

- a stale `temporal-world-v1` release pin instead of the approved
  `temporal-world-v1.1` amendment;
- fail-open parsing of invalid cutover-stage values;
- an optional migration bypass and missing exact enforcement for world,
  runtime-catalog, party-schema and migration-chain pins;
- exact-head checker assertions that did not inspect the actual subject
  implementation;
- two callable v2 runtime surfaces after the declared sole-owner cutover.

Corrections applied for the replacement candidate:

- the release, boundary schema and bindings handshake pin the approved Temporal
  amendment, exact Spatial world tuple, party runtime-catalog migration and
  immutable target migration-chain digest;
- invalid, out-of-range and non-integral cutover-stage input now fails closed;
- the production root cannot bypass migrations; release/world/bindings gates
  run before the party transaction, while target DDL and exact party pin
  readiness run in the same transaction before commit;
- the production-v2 composition root was renamed and isolated as a non-public
  rollback-source harness, and the turn package no longer exports the
  production-v2 request router;
- both current-boundary and exact-head checkers verify the real loader,
  release, migration and removed-surface state.

Replacement-candidate focused evidence already completed:

| Check | Result |
|---|---|
| production-v3 release/bindings/config tests | 8 pass, 0 fail |
| P25 migration/shadow tooling tests | 7 pass, Docker-only drill separately scheduled |
| architecture boundaries | pass |
| production activation boundary | zero findings |
| production-v2 rollback-harness infrastructure tests | 11 pass |
| isolated PostgreSQL production-v3 startup | 1 pass; exact world/catalog pins, external party migration, `001..010`, pre-commit party readiness |
| migration gate rollback test | pass; failed readiness emits `ROLLBACK`, never `COMMIT` |

The isolated PostgreSQL containers were removed after the successful run.
Operator/production databases were not read or changed. Full regeneration,
clean-worktree acceptance, repeated audit and new exact-head evidence remain
mandatory and are recorded only after they actually complete.

### Cutover audit cycle 2

The replacement exact functional commit
`d12aab23f971e5512926633ad8b8aae528fab053` also received
`CHANGES REQUIRED` and is not an accepted evidence subject. The critic
confirmed the sole-owner routing, strict stage parsing, complete transactional
migration chain and Temporal pin, but found four remaining release-admission
defects:

- readiness incorrectly required exactly one append-only runtime-catalog
  activation event and forced persisted parties onto the latest active pin;
- the release migration-chain digest was initialized from the value it was
  intended to verify;
- the bindings handshake omitted five migration/schema identity fields;
- the exact-head checker did not require a direct evidence-only child of its
  functional subject.

The next replacement candidate corrects those defects:

- the latest approved activation is used only for new-party resolution;
  existing parties retain their persisted historical pin, which is checked
  against its exact immutable approved activation event;
- every persisted party must still match the production Spatial world tuple
  and deployment-pinned compatible-world manifest;
- the computed `001..010` chain is compared with the independently fixed
  release digest
  `a71b95540c6422ccee5b3d598cb6b0cefe108de3bf41216dea96a99068a5a370`;
- the binding identity includes the party migration id/digest/fingerprint,
  target migration count/digest and compatible-world pin-manifest digest;
- the compatible-world manifest is mandatory deployment configuration, not a
  binding/DB self-comparison;
- exact-head admission requires a direct child of the functional subject and
  rejects every non-evidence file in that child.

Focused validation after these corrections:

| Check | Result |
|---|---|
| production-v3 lifecycle/bindings/config tests | 10 pass, including multiple activation events and historical persisted pin |
| cutover/rollback configuration tests | 5 pass |
| isolated PostgreSQL lifecycle E2E | pass; two activation events, current new-party pin plus persisted historical-party pin |
| production activation boundary | zero findings |
| documentation regeneration/check | pass |
| `git diff --check` | pass |

Full exact-worktree validation and the third independent audit remain pending
until the replacement functional commit is sealed.

### Cutover audit cycle 3

The exact functional subject
`28eba75f10375d8ba1760005e621a73af027e21a` received
`CHANGES REQUIRED`. The critic confirmed all cycle-2 corrections and the
v3-only production boundary, then found two remaining runtime races:

- world readiness joined activation events to approved revision/import rows
  without proving every field of the approved tuple;
- readiness read the latest world activation inside the party transaction but
  did not hold the activation writer's world advisory lock through party
  `COMMIT`.

The next candidate uses one code-owned activation lock key shared by the
operator writer and production readiness. Startup now executes:

```text
world BEGIN
→ world activation advisory lock
→ party BEGIN
→ target migrations
→ party readiness
→ full world revision/import/activation tuple readiness
→ party COMMIT
→ world COMMIT and activation-lock release
```

Both current and historical activation reads require equality for catalog
scope/revision/digest, compatible world revision/digest/manifest,
record-registry digest, runtime-contract digest, import identity/audit and
approved status. A PostgreSQL race test proves that an activation writer
cannot acquire the lock before party commit and can acquire it immediately
afterward. The same isolated test injects a structurally valid activation
whose approved revision/import tuple disagrees on the registry digest and
proves fail-closed startup.

Focused validation after the cycle-3 corrections:

| Check | Result |
|---|---|
| production-v3 lifecycle/bindings/config tests | 10 pass |
| cutover/rollback configuration tests | 5 pass |
| isolated PostgreSQL activation-lock race | pass |
| isolated PostgreSQL corrupt approved-tuple rejection | pass |
| temporary PostgreSQL resource | removed |

A new exact functional subject, clean validation and another independent audit
remain mandatory before evidence admission.

### Cutover audit cycle 4

The exact functional subject
`bfa24bf7810146c37e461d6dc689b8f7450bd8b8` received
`CHANGES REQUIRED`. The critic confirmed the complete approved tuple,
shared activation lock, historical-pin handling, independent migration digest
and v3-only production boundary, but found one remaining fail-open query
ordering defect:

- approved revision/import joins ran before `ORDER BY event_sequence DESC
  LIMIT 1`, so a corrupt latest activation event could be filtered out and the
  preceding valid event could be mistaken for the active pointer.

The replacement candidate first selects the raw latest scope event in a
`latest_event` CTE and only then joins that single event to the full approved
revision/import tuple. A corrupt latest event therefore produces no approved
row and blocks startup; it can never fall back to an earlier activation.

The regression was developed Red → Green against isolated PostgreSQL 16:

| Check | Result |
|---|---|
| unchanged previous binding + corrupt latest event before fix | expected Red: missing rejection |
| same exact scenario after latest-event-first fix | Green: 1 pass, 0 fail |
| activation lock race and historical pin lifecycle in the same test | pass |
| temporary PostgreSQL resources | removed |

The first full sequential exact-head run then exposed two failures in the
in-memory production composition fixture: its transaction client forwarded
only SQL beginning with `SELECT`, so the new `WITH latest_event` read was
incorrectly replaced with an empty mock result. The fixture now forwards both
`SELECT` and `WITH` read statements. Its complete production composition file
passes 9/9; no runtime behavior was weakened to accommodate the test double.

The exact-head checker now also requires the latest-event-first query shape.
A new exact functional subject, complete clean validation and repeated
independent audit remain mandatory before evidence admission.
