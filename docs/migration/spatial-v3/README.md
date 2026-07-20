# Spatial v3 migration work log

## P00 — baseline, governance and repository inventory

### P00-S01 — reproducible baseline and one-PR governance

- Canonical repository: `PavelSlaven/Novgorod1230`.
- Baseline / `origin/main` at branch creation: `9f2a8c1477793e3baac376d558a64b1b2272cc4a`.
- Single working branch: `codex/spatial-architecture-g0-g6-v4-2`.
- Single pull request: PR #14. Parallel branches and PRs for this plan are forbidden.
- Target: Spatial Architecture G0–G6 v4.2.0 / materialization v3.
- Production boundary: v2 remains the sole production owner until one atomic P28 activation patch. P00 neither activates v3 nor permits dual write, mixed authoritative reads, or v3→v2 fallback.
- Journal owner: the main plan-owning agent. Phase implementers may update only their assigned phase evidence; they do not change the plan, branch, PR, or another phase.
- The branch is rooted at the recorded baseline (`git merge-base origin/main HEAD`).
- **Forensic sequencing gap:** no P00 README existed at baseline. The first
  README commit is `9344c90` (`feat: implement spatial architecture G0-G6
  v4.2`); it added the README together with 284 paths. Git therefore cannot
  prove that P00 readiness/clean-tree evidence preceded the implementation
  patches. No historical clean-tree claim is made. A plan-owner recovery
  decision is required to accept retrospective P00 evidence or require a
  separate clean-checkout reconstruction.
- **Plan-owner recovery decision (2026-07-20):** the plan owner accepts this
  forensic reconstruction as recovery evidence for continued work. It is not
  evidence of the original sequencing and does not rewrite history. P00 is
  considered restored only after an independent `PASS WITH NOTES` or stronger
  critic verdict **and** completion of the Drive metadata comparison or a
  documented Drive waiver. This resolves the sequencing governance decision,
  but does not resolve the Drive hard block.

### P00-S02 — local readiness

Readiness was rechecked on 2026-07-20 at evidence HEAD
`690f85049c44ef099d499eca567d1460fe60ae3f`:

| Check | Result |
|---|---|
| repository / remote | `C:\Users\Slaven\Documents\Новгород`; `origin=https://github.com/PavelSlaven/Novgorod1230.git` |
| branch | `codex/spatial-architecture-g0-g6-v4-2`, tracking the same remote branch |
| baseline main | `origin/main=9f2a8c1477793e3baac376d558a64b1b2272cc4a` |
| Node / npm | `v24.16.0` / `11.13.0` (Node requirement `>=22` satisfied) |
| Python / uv | `3.13.3` / `0.8.12` |
| Docker / Compose | `29.5.3` / `5.1.4` |
| PostgreSQL containers | `novgorod_pr8_integration-postgres-1` (`postgres:16`, healthy, host `55432`); `world-base-postgres-1` (`postgres:16`, healthy, host `5432`) |
| database adjunct | `world-base-nocodb-1` is running on host `8080`; it is not PostgreSQL readiness evidence |
| host PostgreSQL CLI | `psql` unavailable on host `PATH`; database-dependent phases must use the healthy isolated containers/adapters and may not infer host-client readiness |
| Graphify | pinned `0.9.17` |
| Repository Intelligence | graph ready and bound to evidence HEAD; knowledge-source `degraded` is the documented semantic-coverage warning |
| dependencies | installed; no lockfile change detected in P00 |
| database safety | P00 performs no migration, seed, import, DDL, or database write |
| shared worktree | unrelated dirty paths are present and preserved; they are outside P00 scope |

The read-only Google Drive folder `Novgorod`
(`1swvrKMX-kKE-cWH-hHhetLlC7rOSURh9`) was inspected with remote debugging
enabled. Two listings taken 30 seconds apart were stable. Drive UI showed root
`AGENTS.md` modified 2026-07-18, `.github/AGENTS.md` modified 2026-07-16, and
both `NEW PLAN` files modified 2026-07-18. The four files below were downloaded
read-only by file ID and byte-verified against the local copies. Drive remains
non-authoritative: Git `main`/the current tracked HEAD wins every conflict.

### P00-S03 — fully read normative matrix

Blob IDs bind the exact repository bytes read at evidence HEAD. Corpus SHA-256
values remain separately governed by `data/knowledge-source/corpus-manifest.json`.
The effective root instructions for this run were supplied by the host as the
replacement `AGENTS.md`; the separately dirty local worktree copy was preserved.
The root blob below identifies the tracked repository baseline, not that
uncommitted user-owned copy.

#### Live read-only Drive evidence versus local/repository bytes

| Drive object / exact local path | Drive evidence | Local exact UTC metadata and digest | Comparison and authority decision |
|---|---|---|---|
| root `AGENTS.md`; Drive file ID `1MB-yw7kQbtNjbpsbLDjLZi08ZuC5utPG`; local `AGENTS.md` | Drive UI modified `2026-07-18`; downloaded 20,578 bytes | mtime UTC `2026-07-18T20:25:20Z`; 20,578 bytes; SHA-256 `994ed39f7b3d9466d2b85fc1eaf38805027bf8388950dc8c1523ef42b2031707` | Drive download exactly matches the user-dirty local worktree copy; it differs from tracked blob `4ed81c987e36c697bba20f51b38dfac3e75fb2f9`, is noncanonical, and was not copied into Git |
| `.github/AGENTS.md`; Drive file ID `1VxYOPDO6dcU1tTubaBpDE81rRoYfYy0t`; local `.github/AGENTS.md` | Drive UI modified `2026-07-16`; downloaded 14,217 bytes | mtime UTC `2026-07-16T20:50:13Z`; 14,217 bytes; SHA-256 `47d716170b90ea72a9c8460183e2410cb590e91da1ff614cd550ea5d84dbe854` | Drive download matches the local/tracked file bytes |
| `NEW PLAN/PLAN_IMPLEMENTATION_SPATIAL_ARCHITECTURE_G0_G6_V4_2.md`; Drive file ID `1eJbmoiU-cZF4vzO1edvR7JzzAMi5E_OB` | Drive UI modified `2026-07-18`; downloaded 87,021 bytes | mtime UTC `2026-07-18T12:53:19.7127043Z`; 87,021 bytes; SHA-256 `538f688c2c4d1adc8b21fdb559e48c5e41e2f072262dee988e72ccbfefc8e8c6` | Drive download exactly matches the supplied local plan; plan remains implementation input, not repository authority |
| `NEW PLAN/SPATIAL_ARCHITECTURE_STANDARD_G0_G6_V4_2_AUDITED.md`; Drive file ID `1iPz8M08pM8PHjewqV9sqP0YVwZnoMC4M` | Drive UI modified `2026-07-18`; downloaded 324,665 bytes | mtime UTC `2026-07-18T12:29:57.9821459Z`; 324,665 bytes; SHA-256 `117a57fa3c937ff47d4cbed3ba4ea763dc5b7bf0f2d6d3e721dcde48a86a13d8` | Drive download exactly matches supplied audited source; it is not the active repository target |
| repository target `data/knowledge-source/corpus/DOCUMENTS/spatial_architecture_standard_g0_g6.md` | not sourced from Drive | 328,143 bytes; SHA-256 `f3226c1da844c88393a72d516cbf66102e183488e76eee84d3cab84121217cb1` | differs from audited source by 3,478 bytes and digest because committed target-integration amendments are present; tracked repository target remains canonical |

The live listing corroborates the plan line 48 authority boundary while
providing the previously missing object-level IDs, UI date-level metadata and
downloaded-byte digests. `NEW PLAN/` still contains exactly the two supplied
regular files listed above. The Drive metadata blocker is closed; no Drive
object is promoted over Git `main`/HEAD.

| Path | Git blob SHA | Applicable requirement |
|---|---|---|
| `AGENTS.md` | `4ed81c987e36c697bba20f51b38dfac3e75fb2f9` | canonical source, local readiness, double navigation, one branch/PR, tests and audit |
| `.github/AGENTS.md` | `17506d2fd48f93b13bfae8df0dad0d476e66a5fd` | GitHub workflow consistent with root rules |
| `data/knowledge-source/corpus/DOCUMENTS/development_rules.txt` | `2d45c61755787a122cd2994c559e84dc5b3592b0` | isolated stages, typed errors, deterministic code/LLM boundary |
| `data/knowledge-source/corpus/DOCUMENTS/code_critic_invocation_rule.txt` | `24ad8a3401a9d5b662a32c90fe59a9422b183109` | independent critic and repeat cycle |
| `data/knowledge-source/corpus/DOCUMENTS/code_driven_world_materialization_architecture.md` | `d263f842ee0f8bd5879cefa6d964904a8078b2af` | highest materialization authority; no invented candidates |
| `data/knowledge-source/corpus/DOCUMENTS/llm_documentation_navigation.md` | `c73736f3ebc7237fd821fa53e1d19fa64743d791` | profile selection and active/target boundary |
| `data/knowledge-source/corpus/DOCUMENTS/world_base_materialization_table_requirements.md` | `a3cb941927163b623c4c0f66c6d5c0ab8f22a886` | normalized world/party stores, pins, gaps and bounded decisions |
| `data/knowledge-source/corpus/DOCUMENTS/map_g0_g4_workflow.txt` | `2b5560a7d01887a755e64eef5d5963d2c2ab0917` | mandatory G0–G4 authoring workflow |
| `data/world-catalogs/novgorod/G1_SEMANTIC_CATALOG.md` | `3c081a7fc9698683e2062eac0ed1a3debe3b6a35` | Novgorod region-specific G1 authority and readiness |
| `data/knowledge-source/corpus/DOCUMENTS/read_only_database_and_graph_architecture.md` | `8eb211ab274f0de8346b770374a7cdf007c93ed3` | read-only canonical world graph and party-state separation |
| `infra/world-base/SCHEMA_REFERENCE.md` | `b736c39c4222f651616bc098539eb920b5c3541a` | generated physical schema reference; not a semantic authority |

The complete active-document inventory at this evidence point is:
`base_turn_orchestration.txt`, `character_inventory_equipment.txt`,
`character_parameters.txt`, `code_critic_invocation_rule.txt`,
`code_driven_world_materialization_architecture.md`, `combat_system.md`,
`development_rules.txt`, `README.md`, `formulas.md`,
`g1_g5_generation_rules.txt`, `historical_events_and_figures.txt`,
`information_sources_llm_prompts.md`, `interface_ux.md`,
`items_and_property.txt`, `llm_agent_prompt_templates.md`,
`llm_documentation_navigation.md`, `map_g0_g4_workflow.txt`,
`movement_locations_regions.txt`, `new_game_start_pipeline.txt`,
`npc_generation_profiles.txt`, `npc_inventory_item_marks.txt`,
`player_character_generation.txt`,
`read_only_database_and_graph_architecture.md`, `time_system.txt`,
`weapons_and_armor.txt`, `world_base_materialization_table_requirements.md`,
`world_generation_and_turns.txt`, and `world_regions.txt`, all below
`data/knowledge-source/corpus/DOCUMENTS/`. Their exact content SHA-256 values
are the 28 `status=active` entries in the committed corpus manifest; target
`spatial_architecture_standard_g0_g6.md` is deliberately not relabelled
production-active by this inventory.
For each of those 28 exact paths independently: owner is the named document
owner with `@rus/knowledge-source` as corpus custodian; disposition is
`reclassify`; format/version is the manifest-pinned Markdown/text corpus
release `0.23.0-migration.23`; boundary is “preserve bytes and active v2
authority until an atomic P28 status switch”, with target-only documents never
promoted by P00.

### P00-S04 — independent RAG and Graphify navigation

All searches were run against repository HEAD
`690f85049c44ef099d499eca567d1460fe60ae3f`.

| Channel | Exact query | Material result |
|---|---|---|
| RAG / Repository Intelligence | `P00 baseline evidence inventory active spatial documents eleven DDL party schema importers packages apps tests flags save formats governance owners disposition` | navigation README, materialization architecture/table requirements, party v2 stores, active/target boundary; warning `KNOWLEDGE_SOURCE_DEGRADED`, no readiness error |
| RAG | `spatial G0 G6 movement materialization active target production boundary` | target v3 remains non-production until P28; movement and spatial authority paths |
| RAG | `party database save formats importers compatibility feature flags migration ownership` | party schema/materialization and read-only graph requirements |
| Graphify | `P00 baseline evidence inventory active spatial documents eleven DDL party schema importers packages apps tests flags save formats governance owners disposition` | ownership topology across contracts, space-map, movement, materialization, party-store, turn, game-server and tests |
| Graphify | `spatial movement callers imports database adapters tests` | spatial callers, PostgreSQL adapters, orchestration, projection, P18–P23 tests |
| Graphify | `party save format feature flags compatibility importers application ownership` | legacy party transaction/save path, modular composition, compatibility adapters, flags and rollback tests |

Commands included `repo-intel:ensure`, `repo-intel:status`,
`repo-intel:query`, two direct `knowledge:query` calls, and three independent
`graphify query` traversals. Graphify results were used as topology/navigation,
not as normative authority.

### P00-S05 — baseline inventory and disposition

The inventory is baseline-scoped: the first eleven world DDL parts are the
complete world schema present at baseline SHA. Later target-only parts are
listed separately and do not retroactively alter that baseline.

| Object(s) | Owner | Disposition | Boundary / evidence |
|---|---|---|---|
| `data/knowledge-source/corpus/DOCUMENTS/*` active entries listed above | documentation owners / `@rus/knowledge-source` | `reclassify` | preserve content and explicitly separate active v2 from target v3 at atomic cutover |
| `infra/world-base/schema/01.sql` | world-base schema owner | `keep` | baseline canonical/provenance foundation |
| `infra/world-base/schema/02.sql` | world-base schema owner | `keep` | baseline normalized world tables |
| `infra/world-base/schema/03.sql` | world-base schema owner | `keep` | baseline catalog extensions |
| `infra/world-base/schema/04.sql` | world-base schema owner | `keep` | baseline source/normalization extensions |
| `infra/world-base/schema/05.sql` | world-base schema owner | `keep` | baseline materialization support |
| `infra/world-base/schema/06.sql` | world-base schema owner | `keep` | baseline materialization support |
| `infra/world-base/schema/07.sql` | world-base schema owner | `keep` | baseline catalog support |
| `infra/world-base/schema/08.sql` | world-base schema owner | `keep` | baseline catalog support |
| `infra/world-base/schema/09.sql` | world-base schema owner | `keep` | baseline graph/materialization support |
| `infra/world-base/schema/10.sql` | world-base schema owner | `keep` | baseline graph/materialization support |
| `infra/world-base/schema/11.sql` | world-base schema owner | `keep` | complete eleventh baseline DDL part |
| `infra/world-base/schema/12.sql`–`16.sql` | world-base schema owner | `migrate` | target-only additions created after baseline; isolated until P28 |
| `infra/party-db/schema/party_database_schema_v1.{sql,json,sql.gz}` and report/workbook | `@rus/party-store` / DB owner | `migrate` | v1 is migration input/evidence, not target save ownership |
| `src/world/party-db.js`, `src/world/party-schema-mapping.js`, `src/world/new-game-pipeline/commit/party-transaction.js` | legacy runtime / Stage 25 | `deprecate` | production v2 remains active only until atomic P28 |
| `legacy/src/world/party-schema-mapping.js` and other `legacy/**` mirrors | legacy archive owner | `remove-from-production` | traceability only; never target runtime |
| `packages/party-store/src/stage-25/*` | `@rus/party-store` | `convert` | compatibility boundary feeding versioned target persistence |
| `packages/party-store/src/spatial-v3-*` | `@rus/party-store` | `migrate` | target repository/domain integration; non-production before P28 |
| `packages/contracts/src/spatial-v3/*` and `data/contracts/spatial-v3/*` | `@rus/contracts` | `migrate` | shared target DTOs, errors, registries and finite vocabularies |
| `packages/space-map/src/spatial-v3*` | `@rus/space-map` | `migrate` | target topology/position ownership |
| `packages/movement-routes/src/spatial-v3*` | `@rus/movement-routes` | `migrate` | target planning/execution ownership |
| `packages/materialization/src/spatial-v3*` | `@rus/materialization` | `migrate` | deterministic target materialization, no DB ownership |
| `packages/turn/src/spatial-v3*` | `@rus/turn` | `migrate` | target orchestration and combined logical write plan |
| `packages/presentation/src/spatial-v3-projection.js` | `@rus/presentation` | `migrate` | player-safe target projection only |
| `packages/new-game/src/spatial-v3-stage-mapping.js` and stage `compat*.js` files | `@rus/new-game` | `convert` | explicit stage compatibility; no fallback |
| remaining production packages enumerated by `MODULE_INDEX.md` | each package `MODULE.md` / `OWNERSHIP_MAP.md` | `keep` | preserve unrelated domain ownership; no spatial duplication |
| `apps/game-server` | composition root | `migrate` | v2 production composition retained; target adapters remain gated |
| `apps/game-web` | web presentation | `convert` | consume versioned player-safe projection only |
| `scripts/run-world-base-importer.js`, `tools/rus13-world-base-importer/**` | world-base import owner | `deprecate` | retain reproducible v2 import evidence; not target runtime |
| `scripts/import-novgorod-g1-g4-graph.js`, `scripts/import-novgorod-regional-templates.js` | catalog authoring owner | `convert` | migrate to validated version-pinned target imports |
| `tools/spatial-v3/p09-*`, `p10-*`, `p12-*`, `p24-*`, `p25-*`, `p28-*` | phase/tool owners | `keep` | offline migration, verification and fail-closed activation tooling |
| `tools/cutover/**`, `tools/shadow-run/**`, `tools/finalization/**` | migration tooling owners | `keep` | operator tooling, outside game runtime |
| `test/spatial-v3/*.test.js` | matching phase owners | `keep` | target contract/negative/PostgreSQL regression suite |
| `test/new-game*`, `test/party-*`, `test/world-base-*`, `test/cutover/*`, `test/shadow/*`, package-local tests | matching module owners | `keep` | v2 baseline, compatibility and rollback protection |
| feature-flag/profile contract in `apps/game-server/src/config.js`, `tools/cutover/**`, `tools/shadow-run/**`, `test/cutover/staged-route-smoke.test.js`, and `test/shadow/rollback-feature-flags.test.js` | composition/cutover owner | `migrate` | versioned profiles only; no ad-hoc environment activation |
| process artifacts and legacy in-memory party saves under `src/ui/process-artifacts.js`, `src/world/state.js`, and Stage 25 | legacy runtime / presentation / party-store | `convert` | migrate through explicit P24 inventory; no mixed save |
| normalized `party_runtime` v2/v3 persistence represented by party schema and `@rus/party-store` repositories | `@rus/party-store` | `migrate` | party/version pins, position, G5/G6/scene, journey and domain instances remain party-scoped |

#### Finite path manifest

The rows below are finite path sets, not globs. Metadata in a row applies to
each newline-separated path independently.

| Exact paths | Owner | Disposition | Format/version | Boundary |
|---|---|---|---|---|
| `infra/world-base/schema/01.sql`<br>`infra/world-base/schema/02.sql`<br>`infra/world-base/schema/03.sql`<br>`infra/world-base/schema/04.sql`<br>`infra/world-base/schema/05.sql`<br>`infra/world-base/schema/06.sql`<br>`infra/world-base/schema/07.sql`<br>`infra/world-base/schema/08.sql`<br>`infra/world-base/schema/09.sql`<br>`infra/world-base/schema/10.sql`<br>`infra/world-base/schema/11.sql` | world-base schema owner | `keep` | PostgreSQL baseline DDL v2, parts 01–11 | exact 11-part schema at baseline `9f2a8c1`; runtime read-only |
| `infra/world-base/schema/12.sql`<br>`infra/world-base/schema/13.sql`<br>`infra/world-base/schema/14.sql`<br>`infra/world-base/schema/15.sql`<br>`infra/world-base/schema/16.sql` | world-base schema owner | `migrate` | PostgreSQL target DDL v3, parts 12–16 | isolated target schema; no production activation before P28 |
| `schemas/party-db/001_party_runtime.sql` | `@rus/party-store` / DB owner | `keep` | PostgreSQL party runtime v2 / part 001 | active v2 production schema until P28 |
| `schemas/party-db/002_party_runtime_v3.sql`<br>`schemas/party-db/003_party_runtime_v3_planning.sql`<br>`schemas/party-db/004_party_runtime_v3_journeys.sql`<br>`schemas/party-db/005_party_runtime_v3_domain.sql` | `@rus/party-store` / DB owner | `migrate` | PostgreSQL party runtime v3 / parts 002–005 | target-only, isolated tests and migration rehearsals |
| `infra/party-db/schema/party_database_schema_v1.sql`<br>`infra/party-db/schema/party_database_schema_v1.sql.gz`<br>`infra/party-db/schema/party_database_schema_v1.json`<br>`infra/party-db/party_database_schema_v1.xlsx`<br>`infra/party-db/party_database_tables_v1.csv`<br>`infra/party-db/party_database_columns_v1.csv`<br>`infra/party-db/party_database_enums_v1.csv`<br>`infra/party-db/party_database_relationships_v1.csv`<br>`infra/party-db/party_database_validation_rules_v1.csv`<br>`infra/party-db/README_PARTY_DATABASE.md`<br>`infra/party-db/reports/party_database_schema_report_v1.md` | party DB documentation owner | `migrate` | SQL/JSON/XLSX/CSV/report, party schema v1 | migration input and audit evidence, never a second live authority |
| `src/world/party-db.js`<br>`src/world/party-schema-mapping.js`<br>`src/world/new-game-pipeline/commit/party-transaction.js`<br>`src/world/new-game-pipeline/stages/stage25-party-commit.js`<br>`src/ui/process-artifacts.js`<br>`src/world/state.js` | legacy runtime / Stage 25 | `deprecate` | JavaScript legacy party/save/process artifact shapes | v2 production owner until P28; explicit conversion only |
| `legacy/src/world/party-schema-mapping.js` | legacy archive owner | `remove-from-production` | JavaScript archived mapping | traceability only |
| `packages/party-store/src/stage-25/schema-mapping.js`<br>`packages/party-store/src/stage-25/compatibility-adapter.js` | `@rus/party-store` | `convert` | JavaScript Stage 25 v2→module adapter | compatibility boundary, no implicit fallback |
| `packages/party-store/src/spatial-v3-repository.js`<br>`packages/party-store/src/spatial-v3-domain-integration.js`<br>`packages/party-store/src/spatial-v3-ports.js` | `@rus/party-store` | `migrate` | JavaScript spatial-v3 repository/ports | target-only before P28 |
| `scripts/seed-party-db.js` | party DB owner | `deprecate` | JavaScript v2 seed | operator/offline seed only; prohibited against production during P00 |
| `scripts/seed-world-base.js`<br>`scripts/seed-source-records.js`<br>`scripts/seed-graph-edge-modifiers.js`<br>`scripts/seed-graph-scale-rules.js`<br>`scripts/seed-land-use-templates.js`<br>`scripts/seed-landscape-templates.js`<br>`scripts/seed-llm-validation-landscape.js`<br>`scripts/seed-place-templates.js`<br>`scripts/seed-region-landscape-templates.js`<br>`scripts/seed-route-templates.js`<br>`scripts/seed-water-body-templates.js` | world-base/catalog authoring owner | `convert` | JavaScript v2 seed scripts | offline authoring only; migrate to version-pinned target imports |
| `scripts/export-land-use-seed.js`<br>`scripts/export-landscape-seed.js`<br>`scripts/export-place-seed.js`<br>`scripts/export-route-seed.js`<br>`scripts/export-water-body-seed.js` | catalog authoring owner | `keep` | JavaScript deterministic seed exporters | offline reproducibility, never runtime |
| `scripts/run-world-base-importer.js`<br>`tools/rus13-world-base-importer/world_base_importer_v1/scripts/import_world_base.py`<br>`tools/rus13-world-base-importer/world_base_importer_v1/config/world_base_import_manifest_v1.json`<br>`tools/rus13-world-base-importer/world_base_importer_v1/world_base_seed_v1.sql.gz`<br>`tools/rus13-world-base-importer/world_base_importer_v1/README_IMPORTER.md`<br>`tools/rus13-world-base-importer/world_base_importer_v1/reports/world_base_import_report_v1.json`<br>`tools/rus13-world-base-importer/world_base_importer_v1/reports/world_base_import_report_v1.md`<br>`tools/rus13-world-base-importer/requirements.txt` | world-base import owner | `deprecate` | JS/Python/JSON/SQL.gz importer v1 | reproducible legacy import evidence; not target runtime |
| `scripts/run-stage-3b1-supplemental-importer.mjs` | classification/catalog owner | `convert` | ESM stage-3b1 supplemental importer | offline reviewed import; no inferred categories |
| `scripts/import-novgorod-g1-g4-graph.js`<br>`scripts/import-novgorod-regional-templates.js` | Novgorod catalog owner | `convert` | JavaScript regional importers v2 | version-pinned G0–G4/target authoring migration required |
| `tools/rus13-new-party-generator/new_party_generator_v1/new_party_generator_v1.json`<br>`tools/rus13-new-party-generator/new_party_generator_v1/new_party_generator_v1.xlsx`<br>`tools/rus13-new-party-generator/new_party_generator_v1/scripts/new_party_generator_orchestrator_v1.py`<br>`tools/rus13-new-party-generator/new_party_generator_v1/sql/new_party_generator_transaction_outline_v1.sql`<br>`tools/rus13-new-party-generator/new_party_generator_v1/sql/new_party_generator_transaction_outline_v1.sql.gz`<br>`tools/rus13-new-party-generator/new_party_generator_v1/README_NEW_PARTY_GENERATOR.md`<br>`tools/rus13-new-party-generator/new_party_generator_v1/reports/new_party_generator_report_v1.md` | new-party generator archive owner | `deprecate` | generator v1 JSON/XLSX/Python/SQL/report | design/import artifact; modular pipeline is runtime owner |
| `tools/rus13-new-party-generator/new_party_generator_v1/contracts/ActiveRegionContext.schema.json`<br>`tools/rus13-new-party-generator/new_party_generator_v1/contracts/HistoricalFrameDraft.schema.json`<br>`tools/rus13-new-party-generator/new_party_generator_v1/contracts/HistoricalPressurePackage.schema.json`<br>`tools/rus13-new-party-generator/new_party_generator_v1/contracts/InitialItemPropertyLayer.schema.json`<br>`tools/rus13-new-party-generator/new_party_generator_v1/contracts/InitialMapKnowledge.schema.json`<br>`tools/rus13-new-party-generator/new_party_generator_v1/contracts/InitialNpcLayer.schema.json`<br>`tools/rus13-new-party-generator/new_party_generator_v1/contracts/InitialTensionEventLayer.schema.json`<br>`tools/rus13-new-party-generator/new_party_generator_v1/contracts/InitialVisibleSceneAndIntroProse.schema.json`<br>`tools/rus13-new-party-generator/new_party_generator_v1/contracts/PartyStartTransactionPlan.schema.json`<br>`tools/rus13-new-party-generator/new_party_generator_v1/contracts/PlayerCharacterStartProfile.schema.json`<br>`tools/rus13-new-party-generator/new_party_generator_v1/contracts/StartCausalLink.schema.json`<br>`tools/rus13-new-party-generator/new_party_generator_v1/contracts/StartConsistencyAuditReport.schema.json`<br>`tools/rus13-new-party-generator/new_party_generator_v1/contracts/StartPlaceDraft.schema.json`<br>`tools/rus13-new-party-generator/new_party_generator_v1/contracts/StartPositionChain.schema.json`<br>`tools/rus13-new-party-generator/new_party_generator_v1/contracts/StartRequestNormalized.schema.json` | new-party generator archive owner | `convert` | JSON Schema generator v1 | map explicitly to maintained contracts; no direct runtime authority |
| `tools/rus13-new-party-generator/new_party_generator_v1/csv/new_party_generator_contracts_v1.csv`<br>`tools/rus13-new-party-generator/new_party_generator_v1/csv/new_party_generator_db_writes_v1.csv`<br>`tools/rus13-new-party-generator/new_party_generator_v1/csv/new_party_generator_pipeline_v1.csv`<br>`tools/rus13-new-party-generator/new_party_generator_v1/csv/new_party_generator_prompts_v1.csv`<br>`tools/rus13-new-party-generator/new_party_generator_v1/csv/new_party_generator_source_map_v1.csv`<br>`tools/rus13-new-party-generator/new_party_generator_v1/csv/new_party_generator_validation_rules_v1.csv` | new-party generator archive owner | `deprecate` | CSV generator v1 inventories | audit/design evidence only |

All 40 `schemas/materialization` objects are in P00 scope. Each row is one
exact path; no wildcard or directory-level disposition substitutes for it.
The v1 authoring schemas are retained as normalized authoring contracts:
`keep` means their versioned input/evidence role continues, not that they
authorize spatial-v3 production. The explicit classification migration ledger
is `convert`; all v2 runtime/materialization envelopes are `convert` or
`migrate` as stated.

| Exact path | Owner | Disposition | Format/version | Boundary |
|---|---|---|---|---|
| `schemas/materialization/approved-g5-template-bundle-v2.schema.json` | `@rus/contracts` / `@rus/materialization` | `convert` | JSON Schema v2 | convert approved bundle to target registries; no fallback |
| `schemas/materialization/bounded-decision-request-v2.schema.json` | `@rus/contracts` / `@rus/materialization` | `keep` | JSON Schema v2 | bounded finite option request remains valid |
| `schemas/materialization/bounded-decision-result-v2.schema.json` | `@rus/contracts` / `@rus/materialization` | `keep` | JSON Schema v2 | one option/token result; no arbitrary patch |
| `schemas/materialization/catalog-import-manifest-v2.schema.json` | catalog import owner | `convert` | JSON Schema v2 | migrate pins/digests to target import manifest |
| `schemas/materialization/category-labels-v1.schema.json` | catalog authoring owner | `keep` | JSON Schema authoring v1 | normalized labels only; no regional permission |
| `schemas/materialization/category-scheme-mappings-v1.schema.json` | catalog authoring owner | `keep` | JSON Schema authoring v1 | external mapping is not historical evidence |
| `schemas/materialization/classification-schemes-v1.schema.json` | catalog authoring owner | `keep` | JSON Schema authoring v1 | scheme registry only |
| `schemas/materialization/container-content-category-relations-v1.schema.json` | `@rus/items-property` / catalog authoring | `keep` | JSON Schema authoring v1 | approved authoring relation, not instance creation |
| `schemas/materialization/container-content-profile-entries-v1.schema.json` | `@rus/items-property` / catalog authoring | `keep` | JSON Schema authoring v1 | finite profile entry only |
| `schemas/materialization/container-content-profiles-v1.schema.json` | `@rus/items-property` / catalog authoring | `keep` | JSON Schema authoring v1 | versioned profile only |
| `schemas/materialization/container-template-facet-bindings-v1.schema.json` | `@rus/items-property` / catalog authoring | `keep` | JSON Schema authoring v1 | facet binding, no inferred category |
| `schemas/materialization/container-template-inventory-profiles-v1.schema.json` | `@rus/items-property` / catalog authoring | `keep` | JSON Schema authoring v1 | inventory profile binding only |
| `schemas/materialization/container-template-source-bindings-v1.schema.json` | `@rus/items-property` / provenance owner | `keep` | JSON Schema authoring v1 | source binding required |
| `schemas/materialization/container-templates-v1.schema.json` | `@rus/items-property` / catalog authoring | `keep` | JSON Schema authoring v1 | template, not party instance |
| `schemas/materialization/item-classification-migration-inventory-v1.schema.json` | classification migration owner | `convert` | JSON Schema migration v1 | explicit reviewed migration ledger |
| `schemas/materialization/item-profile-entries-v1.schema.json` | `@rus/items-property` / catalog authoring | `keep` | JSON Schema authoring v1 | finite profile entry only |
| `schemas/materialization/item-profile-sets-v1.schema.json` | `@rus/items-property` / catalog authoring | `keep` | JSON Schema authoring v1 | profile set only |
| `schemas/materialization/item-template-category-bindings-v1.schema.json` | `@rus/items-property` / catalog authoring | `keep` | JSON Schema authoring v1 | approved category binding only |
| `schemas/materialization/item-template-inventory-profiles-v1.schema.json` | `@rus/items-property` / catalog authoring | `keep` | JSON Schema authoring v1 | inventory profile binding only |
| `schemas/materialization/item-template-quantity-profiles-v1.schema.json` | `@rus/items-property` / catalog authoring | `keep` | JSON Schema authoring v1 | quantity profile binding only |
| `schemas/materialization/item-template-source-bindings-v1.schema.json` | `@rus/items-property` / provenance owner | `keep` | JSON Schema authoring v1 | source binding required |
| `schemas/materialization/item-templates-v1.schema.json` | `@rus/items-property` / catalog authoring | `keep` | JSON Schema authoring v1 | template, not party instance |
| `schemas/materialization/normalized-instance-candidate-v2.schema.json` | `@rus/materialization` | `convert` | JSON Schema v2 | candidate must be approved and finite |
| `schemas/materialization/party-autonomous-update-v2.schema.json` | `@rus/turn` / `@rus/party-store` | `migrate` | JSON Schema saved-party change v2 | explicit party-scoped persisted update |
| `schemas/materialization/party-change-set-v2.schema.json` | `@rus/turn` / `@rus/party-store` | `migrate` | JSON Schema saved-party change v2 | explicit atomic party write-set |
| `schemas/materialization/property-profile-rules-v1.schema.json` | `@rus/items-property` / catalog authoring | `keep` | JSON Schema authoring v1 | approved deterministic rules only |
| `schemas/materialization/property-profiles-v1.schema.json` | `@rus/items-property` / catalog authoring | `keep` | JSON Schema authoring v1 | versioned profile only |
| `schemas/materialization/quantity-unit-definitions-v1.schema.json` | catalog authoring owner | `keep` | JSON Schema authoring v1 | normalized unit definition |
| `schemas/materialization/record-sources-v1.schema.json` | provenance owner | `keep` | JSON Schema authoring v1 | record/source join evidence |
| `schemas/materialization/region-category-options-v1.schema.json` | regional catalog owner | `keep` | JSON Schema authoring v1 | finite regional option, not global fallback |
| `schemas/materialization/region-equipment-profile-entries-v1.schema.json` | `@rus/items-property` / regional catalog | `keep` | JSON Schema authoring v1 | finite regional profile entry |
| `schemas/materialization/region-equipment-profiles-v1.schema.json` | `@rus/items-property` / regional catalog | `keep` | JSON Schema authoring v1 | regional profile only |
| `schemas/materialization/source-records-v1.schema.json` | provenance owner | `keep` | JSON Schema authoring v1 | immutable source metadata |
| `schemas/materialization/universal-categories-v1.schema.json` | classification owner | `keep` | JSON Schema authoring v1 | universal class does not grant regional availability |
| `schemas/materialization/universal-category-relations-v1.schema.json` | classification owner | `keep` | JSON Schema authoring v1 | relation only; no semantic inference |
| `schemas/materialization/universal-parameter-definitions-v1.schema.json` | classification owner | `keep` | JSON Schema authoring v1 | parameter definition only |
| `schemas/materialization/world-materialization-repair-request-v2.schema.json` | `@rus/materialization` | `convert` | JSON Schema v2 | format repair only; candidate set immutable |
| `schemas/materialization/world-materialization-request-v2.schema.json` | `@rus/materialization` | `convert` | JSON Schema v2 | v2 request converted explicitly to target plan |
| `schemas/materialization/world-materialization-result-v2.schema.json` | `@rus/materialization` / `@rus/party-store` | `migrate` | JSON Schema saved-party materialization result v2 | persisted trace/input to explicit P24 conversion |
| `schemas/materialization/world-revisions-v1.schema.json` | world-base catalog owner | `keep` | JSON Schema authoring v1 | immutable revision pins remain required |

The current saved-party contract surfaces are finite and exact:

| Exact path | Owner | Disposition | Format/version | Boundary |
|---|---|---|---|---|
| `schemas/materialization/party-autonomous-update-v2.schema.json` | `@rus/turn` / `@rus/party-store` | `migrate` | JSON Schema v2 | persisted autonomous update |
| `schemas/materialization/party-change-set-v2.schema.json` | `@rus/turn` / `@rus/party-store` | `migrate` | JSON Schema v2 | persisted atomic party change-set |
| `schemas/materialization/world-materialization-result-v2.schema.json` | `@rus/materialization` / `@rus/party-store` | `migrate` | JSON Schema v2 | committed materialization trace/result |
| `src/world/contracts/rus13/G5ExistingStateSnapshot.schema.json` | legacy new-game / party state owner | `convert` | JSON Schema RUS13 v1 | read-only existing G5 snapshot input |
| `src/world/contracts/rus13/PartyStartTransactionPlan.schema.json` | legacy Stage 25 / party-store | `convert` | JSON Schema RUS13 v1 | pre-commit transaction plan, not state authority |
| `packages/contracts/src/approvals/party-commit.js` | `@rus/contracts` / `@rus/party-store` | `keep` | JavaScript approval contract v1 | approval envelope, no database write |
| `src/world/party-schema-mapping.js` | legacy runtime | `deprecate` | JavaScript v1 mapping | v2 production until P28 |
| `packages/party-store/src/stage-25/schema-mapping.js` | `@rus/party-store` | `convert` | JavaScript Stage 25 mapping | explicit v2→maintained store boundary |
| `schemas/party-db/001_party_runtime.sql` | `@rus/party-store` / DB owner | `keep` | PostgreSQL party runtime v2 | current production persisted tables until P28 |
| `schemas/party-db/002_party_runtime_v3.sql`<br>`schemas/party-db/003_party_runtime_v3_planning.sql`<br>`schemas/party-db/004_party_runtime_v3_journeys.sql`<br>`schemas/party-db/005_party_runtime_v3_domain.sql` | `@rus/party-store` / DB owner | `migrate` | PostgreSQL party runtime v3 | isolated target saved-party stores only |

All production package roots at baseline/current scope are individually finite:

| Exact package path | Owner | Disposition | Format/version | Boundary |
|---|---|---|---|---|
| `packages/actors` | `@rus/actors` | `keep` | Node ESM package | actor ownership unchanged |
| `packages/body-state` | `@rus/body-state` | `keep` | Node ESM package | body ownership unchanged |
| `packages/checks-rng` | `@rus/checks-rng` | `keep` | Node ESM package | RNG/check ownership unchanged |
| `packages/combat-health` | `@rus/combat-health` | `keep` | Node ESM package | combat ownership unchanged |
| `packages/contracts` | `@rus/contracts` | `migrate` | Node ESM package / spatial-v3 DTOs | shared target contracts, no execution |
| `packages/items-property` | `@rus/items-property` | `keep` | Node ESM package | item domain remains separate |
| `packages/kernel` | `@rus/kernel` | `keep` | Node ESM package | primitives only |
| `packages/knowledge-source` | `@rus/knowledge-source` | `keep` | Node ESM package | normative RAG, not game graph |
| `packages/llm-runtime` | `@rus/llm-runtime` | `keep` | Node ESM package | bounded LLM transport only |
| `packages/materialization` | `@rus/materialization` | `migrate` | Node ESM package / spatial-v3 | deterministic target materialization |
| `packages/movement-routes` | `@rus/movement-routes` | `migrate` | Node ESM package / spatial-v3 | target plan/execution, no topology authoring |
| `packages/narration` | `@rus/narration` | `keep` | Node ESM package | visible prose only |
| `packages/new-game` | `@rus/new-game` | `convert` | Node ESM package / stages 2–26 | explicit stage migration |
| `packages/party-store` | `@rus/party-store` | `migrate` | Node ESM package / spatial-v3 repository | sole party persistence owner |
| `packages/pipeline-engine` | `@rus/pipeline-engine` | `keep` | Node ESM package | orchestration primitives |
| `packages/presentation` | `@rus/presentation` | `migrate` | Node ESM package / v3 projection | player-safe reads only |
| `packages/repository-intelligence` | `@rus/repository-intelligence` | `keep` | Node ESM dev package | never game runtime |
| `packages/social-law` | `@rus/social-law` | `keep` | Node ESM package | social ownership unchanged |
| `packages/space-map` | `@rus/space-map` | `migrate` | Node ESM package / spatial-v3 | factual topology owner |
| `packages/time-events-history` | `@rus/time-events-history` | `keep` | Node ESM package | time ownership unchanged |
| `packages/turn` | `@rus/turn` | `migrate` | Node ESM package / spatial-v3 | orchestration/write-plan only |
| `packages/visibility-knowledge-memory` | `@rus/visibility-knowledge-memory` | `keep` | Node ESM package | knowledge projection separate |
| `packages/world-base` | `@rus/world-base` | `keep` | Node ESM read-only port | no mutating runtime SQL |
| `apps/game-server` | game-server composition owner | `migrate` | Node ESM application | v2 production until P28 |
| `apps/game-web` | game-web owner | `convert` | browser application | versioned player-safe payloads |

Feature/compatibility objects are also explicit:

| Exact paths | Owner | Disposition | Format/version | Boundary |
|---|---|---|---|---|
| `apps/game-server/src/config.js`<br>`apps/game-server/src/legacy-entry.js`<br>`apps/game-server/src/modular-entry.js`<br>`tools/cutover/src/manifest.js`<br>`tools/cutover/src/executor.js`<br>`tools/cutover/src/runner.js`<br>`tools/cutover/src/report.js`<br>`tools/cutover/test/cutover.test.js`<br>`test/cutover/staged-route-smoke.test.js`<br>`test/cutover/party-state-rollback.test.js`<br>`test/cutover/party-db-restore.test.js`<br>`test/shadow/rollback-feature-flags.test.js`<br>`test/shadow/turn-runtime-shadow.test.js` | game-server/cutover owner | `migrate` | JS feature profile; `RUS_RUNTIME_ROUTE`, `RUS_CUTOVER_STAGE` | explicit versioned route only; no P00 switch |
| `packages/contracts/src/spatial-v3/compatibility.js`<br>`packages/space-map/src/spatial-v2-compat.js`<br>`packages/turn/src/compat/index.js`<br>`packages/new-game/src/stages/shared/lifecycle-compat.js` | matching package owners | `convert` | JavaScript v2/v3 compatibility | no hidden fallback or mixed ownership |
| `packages/new-game/src/stages/stage-2-normalization/compat.js`<br>`packages/new-game/src/stages/stage-3-historical-frame/compat.js`<br>`packages/new-game/src/stages/stage-4-regional-context/compat.js`<br>`packages/new-game/src/stages/stage-5-start-candidates/compat.js`<br>`packages/new-game/src/stages/stage-6-candidate-place-templates/compat.js`<br>`packages/new-game/src/stages/stage-7-npc-candidates/compat.js`<br>`packages/new-game/src/stages/stage-8-item-profile-candidates/compat.js`<br>`packages/new-game/src/stages/stage-9-start-node-selection/compat.js`<br>`packages/new-game/src/stages/stage-10-start-place-audit/compat.js`<br>`packages/new-game/src/stages/stage-11-player-character/compat.js`<br>`packages/new-game/src/stages/stage-12-player-character-audit/compat.js`<br>`packages/new-game/src/stages/stage-13-g5-materialization/compat.js`<br>`packages/new-game/src/stages/stage-14-g5-audit/compat.js`<br>`packages/new-game/src/stages/stage-15-npc-placement/compat.js`<br>`packages/new-game/src/stages/stage-16-item-placement/compat.js`<br>`packages/new-game/src/stages/stage-17-time-light-gate/compat.js`<br>`packages/new-game/src/stages/stage-18-character-knowledge-map/compat.js`<br>`packages/new-game/src/stages/stage-19-hidden-state/compat.js`<br>`packages/new-game/src/stages/stage-20-visible-context/compat.js`<br>`packages/new-game/src/stages/stage-21-visible-context-audit/compat.js`<br>`packages/new-game/src/stages/stage-22-narrator-prose/compat.js`<br>`packages/new-game/src/stages/stage-23-narrator-prose-audit/compat.js`<br>`packages/new-game/src/stages/stage-24-party-db-write-plan/compat.js`<br>`packages/new-game/src/stages/stage-25-party-commit/compat.js`<br>`packages/new-game/src/stages/stage-26-first-game-screen/compat.js`<br>`packages/new-game/src/stages/stage-26-first-game-screen/compatibility.js` | `@rus/new-game` | `convert` | JavaScript stage compatibility, v2→v3 | each stage remains explicit and fail-closed |

The finite spatial/migration test set is:
`test/spatial-v3/p06-red-contract-conformance.test.js`,
`test/spatial-v3/p06-red-no-mixing.test.js`,
`test/spatial-v3/p06-red-state-machines.test.js`,
`test/spatial-v3/p07-controlled-vocabulary-integration.test.js`,
`test/spatial-v3/p08-public-ports.test.js`,
`test/spatial-v3/p09-graph-node-migration.test.js`,
`test/spatial-v3/p09-postgres-ddl.test.js`,
`test/spatial-v3/p10-ddl-contracts.test.js`,
`test/spatial-v3/p10-graph-edge-migration.test.js`,
`test/spatial-v3/p10-postgres-ddl.test.js`,
`test/spatial-v3/p11-capacity-proof.test.js`,
`test/spatial-v3/p11-postgres-ddl.test.js`,
`test/spatial-v3/p12-authoring-importer.test.js`,
`test/spatial-v3/p12-canonical-manifest.test.js`,
`test/spatial-v3/p12-dependency-closure-data.test.js`,
`test/spatial-v3/p12-dependency-closure-postgres.test.js`,
`test/spatial-v3/p12-importer-postgres.test.js`,
`test/spatial-v3/p12-source-approval.test.js`,
`test/spatial-v3/p12-target-contract-specification.test.js`,
`test/spatial-v3/p12-target-materialization-approval-v1_1.test.js`,
`test/spatial-v3/p12-target-materialization-approval.test.js`,
`test/spatial-v3/p12-v1_1-equivalence.test.js`,
`test/spatial-v3/p13-party-runtime-postgres.test.js`,
`test/spatial-v3/p14-party-planning-postgres.test.js`,
`test/spatial-v3/p15-party-journeys-postgres.test.js`,
`test/spatial-v3/p16-committer-postgres.test.js`,
`test/spatial-v3/p16-persistence-postgres.test.js`,
`test/spatial-v3/p16-persistence.test.js`,
`test/spatial-v3/p17-space-map.test.js`,
`test/spatial-v3/p18-movement-planning.test.js`,
`test/spatial-v3/p19-execution.test.js`,
`test/spatial-v3/p20-materialization.test.js`,
`test/spatial-v3/p21-orchestration.test.js`,
`test/spatial-v3/p22-projection.test.js`,
`test/spatial-v3/p23-domain-integration.test.js`,
`test/spatial-v3/p23-domain-postgres.test.js`,
`test/spatial-v3/p24-migration-postgres.test.js`,
`test/spatial-v3/p24-migration.test.js`,
`test/spatial-v3/p24-world-migration-postgres.test.js`,
`test/spatial-v3/p25-compatibility-cutover.test.js`,
`test/spatial-v3/p27-release-hygiene.test.js`, and
`test/spatial-v3/p28-activation.test.js`. Owner is the matching Pxx/module
owner; disposition is `keep`; format is Node test v3 migration evidence; the
boundary is test-only and never production activation. Related finite baseline
tests are `test/party-schema-mapping.test.js`,
`test/process-artifacts.test.js`, `test/new-game-pipeline-party-commit.test.js`,
`test/novgorod-g1-g4-importer.test.js`,
`test/modules/world-base-import-contract.test.js`,
`test/world-base-import-denorm.test.js`,
`test/cutover/modular-runtime-imports.test.js`,
`test/cutover/party-db-restore.test.js`,
`test/cutover/party-state-rollback.test.js`,
`test/cutover/staged-route-smoke.test.js`,
`test/shadow/rollback-feature-flags.test.js`, and
`test/shadow/turn-runtime-shadow.test.js`; their module owners retain them with
disposition `keep`, Node test format, as v2/compatibility/rollback protection.

Cross-check authorities: generated `MODULE_INDEX.md`,
`docs/domain/OWNERSHIP_MAP.md`, `infra/world-base/SCHEMA_REFERENCE.md`, the
committed corpus manifest, and the Graphify repository graph. Every inventory
row has one of the required dispositions and a named owner. P00 changes
evidence only: no runtime, DDL, import, save format, flag, or production
composition is modified.

**P00 status: `COMPLETE / PASS WITH NOTES`.** The final independent critic
returned `PASS WITH NOTES`. The plan owner accepted the forensic recovery
conditions, and the stable live read-only Drive listing plus four byte-verified
downloads closed the metadata recovery gate. The forensic sequencing note
remains: this reconstructed evidence does not prove that the original P00
checks preceded commit `9344c90` and does not rewrite repository history.

## P12 target-materialization approval intake (2026-07-19)

`P12_TARGET_MATERIALIZATION_APPROVAL_V1.zip` is byte-pinned under
`data/world-catalogs/novgorod/spatial-v3/target-materialization-approval/`.
The approval authorizes only future isolated target work, but this intake is
fail-closed: verification safely extracts the byte-pinned archive into a fresh
temporary directory and executes its archived `run_all_checks.py`,
`verify_manifest.py`, and default branch-binding verifier. It also reproduces
the archive's `pathlib` ordering under both semantics: POSIX ordering matches
the manifest and Windows case-insensitive ordering has the recorded first
mismatch. Therefore Linux CI correctly passes the archive verifier, while the
Windows self-check records `P12_APPROVAL_UPSTREAM_MANIFEST_ORDER_MISMATCH`.
The unbound default branch/40-hex HEAD remains a blocker on every platform.
These are evidence-derived outcomes, not a local literal assertion.
No target DDL, P12 operational-gap closure, P28 evidence, production
composition, or production database operation is allowed. Run
`npm run spatial-v3:test-p12-target-materialization-approval` to verify the
byte pin and both blockers.

## P12 rescue — approved Novgorod source package

- Immutable editorial input is committed under `data/world-catalogs/novgorod/spatial-v3/source-approval/p12_novgorod_source_approval_001/`. Its package manifest is digest-verified and its approval record is `APPROVED_FOR_P12_INTEGRATION`, explicitly not production activation evidence.
- Source verification is implemented by `tools/spatial-v3/p12-source-approval.mjs` and is now a fail-closed dependency of the P12 authoring importer. It verifies all package-member digests and the approved finite counts: 195 canonical G5 records, 358 physical source pairs / 716 directions, 600 classified mappings, and 17/195/195 scene-family/profile/candidate records.
- This closes the absence of an approved **source** catalogue. It does not claim branch-contract compilation or an authoring import: the package itself requires exact target endpoint/profile compilation and isolated PostgreSQL readback. Until that produces a contract-valid non-empty P12 bundle, the four target manifest data gaps and P28 remain correctly blocking; no production composition or write path changes.
- Checks: `spatial-v3:test-p12-source`, `spatial-v3:check-p12-source`, `spatial-v3:test-p12`, `spatial-v3:check-p12`, `spatial-v3:test-p28`, and `spatial-v3:check-p28` passed. The P28 negative gate remains intentionally non-mutating.
- P12 V1.1 repository binding is fail-closed pending an explicit dependency-closure evidence commit. The verifier accepts only a current two-commit chain: the binding file is first introduced by the exact evidence commit, its sole parent is the subject commit, its diff is limited to declared evidence paths, and every declared subject-tree file matches a SHA-256 pinned in the binding. A reachable ancestor, replayed/future checkout, broad evidence commit, absent subject file, digest drift, or unapproved closure is rejected. This record does not authorize target DDL or production activation.

## P12 target-contract compilation specification — immutable input, not a compiler result

- The supplied `P12_TARGET_CONTRACT_COMPILATION_SPEC_V1.zip` is retained byte-pinned at `data/world-catalogs/novgorod/spatial-v3/target-contract-spec/`. Its SHA-256 is `1833b383e5ee2568330ab88ae40c7d5b9d057dbde81aa4f43641c48ecd3eb6f3`; it binds the previously approved source ZIP `e3342beac492ff6433a03ecbf7c32dbffdc9dafce8e7ebd623af826b33d7bbbe`.
- `tools/spatial-v3/p12-target-contract-specification.mjs` verifies the identity, byte pin and explicit non-activation status. It rejects a modified or absent ZIP and cannot be used as a P28 authorization object.
- The supplied package itself marks the proposed connection contracts as `proposed_not_active` and retains hard blocks for the exact target world revision/G2-G3 pins, approved connection profiles, ordered route chains, and real P27/fresh-checkout signed evidence. Those values are not inferable from the approved source inventory; consequently the four P12 authoring data gaps remain unresolved and no target DDL/import rows, production writes, or composition changes are made by this integration.

## P24 — data and save migration v2→v3

- Scope: target-only, explicit migration inventory and isolated PostgreSQL apply rehearsal; no production v2 composition, dual write, mixed authoritative read or fallback.
- Navigation: `repo-intel:ensure`, `repo-intel:status`, and query `P24 spatial architecture integration, infrastructure, external contracts and target shadow boundary`; Graphify query `P24 Data and save migration v2 v3 inventory world party journey rollback`.
- Normatives read: target standard §15, code-driven materialization architecture, table requirements, read-only graph boundary, movement and time target sections, critic invocation rule.
- Readiness: branch `codex/spatial-architecture-g0-g6-v4-2`, HEAD `9f2a8c1477793e3baac376d558a64b1b2272cc4a`; repository graph ready (Graphify 0.9.17); knowledge source degraded warning only.
- P24 accepts a read-only, coverage-declared v2 extract only: every source row carries its source table/key digest, evidence and dependency pins. Missing coverage, a pin/evidence mismatch, or a non-reviewed mapping is a typed hard gap before a target transaction.
- The target surface is explicit rather than a `spatial_*` prefix: canonical world chains cover revision, G0–G5 containment, G1 grid, G4 exits, profiles, routes and templates; party chains cover G5/scene/position, NPC/items/containers/ownership/control, and P14 PGC or an approved anchor. A partial declared chain is rejected.
- The isolated PostgreSQL rehearsals prove target-only dry-run rollback, readback, and database-error rollback for both world and party writes. The world witness applies the reviewed canonical revision, G0–G5 containment and normalized class rows, G1 grid, G4 exit, orientation/cost profiles, route/segment/context and both endpoint bindings, then expansion and scene-template candidate chain through the same P24 migration tool. No test opens or mutates v2/operator data.
- Rescue: inverse coverage now requires exactly one inventory disposition for every row returned by the finite v2 reader. An explicit `hard_gap` is still a disposition but fails acceptance; an extra real `party_positions` legacy row produces `migration_source_inventory_coverage_gap` before a target transaction and leaves target tables empty. The isolated party rehearsal also executes `safe_explicit_anchor` through `party_route_anchor_identities` and its location binding with reviewed approval/evidence/pins, verifies readback, and proves missing approval returns `journey_migration_gap` with no anchor write.

## P25 — compatibility, shadow, cutover and rollback tooling

- Scope: target/shadow-only. `production_v2` remains the only production profile; `shadow_v3` is structurally read-only and cannot write target state. P28 is the only phase allowed to activate v3.
- Navigation: `repo-intel:ensure`, `repo-intel:status`, query `P25 spatial architecture plan implementation contracts target shadow current P24 handoff`; Graphify query with the same need.
- Normatives read: target standard §0.4, §15.7–15.8 and release checklist; code-driven materialization active/target and activation boundaries; P24 migration log and P06 no-mixing contract.
- P25 module: `tools/spatial-v3/p25-activation-tooling.mjs` requires an immutable explicit `request_profiles` input and binds every adapter call to exactly one `(party_id, request_id, profile)` owner, so conflicting v2/v3 ownership is rejected without hidden process state. It defines a deterministic no-write comparison over endpoints/time/visibility/errors/migration classifications, rehearsal-only cutover gates, and an explicit rollback boundary. Intentional differences require an exact registered path and values; each registry entry must be consumed exactly once, while duplicate, stale, or unregistered divergences fail closed.
- Rehearsal order: shadow parity → P24 target-only migration+rollback evidence → startup probes → isolated target schema switch → smoke tests → optional isolated target write. Any failed gate invokes abort before the next handler and reports zero production writes. `mode: production` is rejected.
- Rollback: before first v3-only mutation return to v2; after it use only a validated reverse migration or snapshot restore. The isolated PostgreSQL drill proves a missing restore is blocked and a snapshot restores the actual target rows.
- Checks: `spatial-v3:test-p25` 4/4 (including isolated PostgreSQL), `spatial-v3:check-p25`, `spatial-v3:test-p24`, `spatial-v3:check-p24`, `docs:generate`, `docs:check`, `architecture:check`, `graphify update .` and `repo-intel:ensure` passed. Full `npm test` reached `test:domain` but has three existing RAG/corpus expectation failures: two fixed document-count assertions expect 24 while the current corpus has 25; the materialization-boundary control query no longer ranks the expected document in top-5. This P25 phase does not alter RAG ranking or corpus policy; repair is deferred to the generated-artifacts/RAG phase.

## P26 — generated artifacts and repository intelligence

- Readiness: repository `C:\\Users\\Slaven\\Documents\\Новгород`, branch `codex/spatial-architecture-g0-g6-v4-2`, HEAD and `origin/main` `9f2a8c1477793e3baac376d558a64b1b2272cc4a`; Graphify `0.9.17`. `repo-intel:ensure` and `repo-intel:status` are ready; the known baseline semantic-coverage condition remains an explicitly reported `degraded` warning, not a repository-graph blocker.
- Navigation: `repo-intel:query -- --query "P26 activation production cutover spatial architecture G0 G6 conditions"`; Graphify queries for P26 artifact owners and P25 cutover dependencies. Follow-up graph inspection confirms `spatial-v3-repository.js` is the explicit P16 party repository and `detectDependencyCycles` remains confined to the stage-24 v2 write-plan validator; no unexpected v3 production writer or ownership cycle was found.
- Sources: P26 plan; target standard §16.2–§16.4; navigation active/target boundary; code-driven materialization ownership/commit boundary; P24 and accepted P25 handoff. P26 does not activate v3, change the production v2 profile, or perform a production write.
- Regeneration: ran `docs:generate`/`docs:check`; `world-db:schema-check` and `world-db:schema-doc-check` (174 world-base tables, digest `731ffacb19e7e0b401ccf7154dcbc0db6ee61fbf9b6ba6845e05dc2211888b5e`); `knowledge:inventory`, `knowledge:generate`, `knowledge:check` (30 documents); and `repo-intel:build`/`repo-intel:status`.
- Fresh DDL evidence: isolated PostgreSQL `spatial-v3:test-p11-postgres` applies all schema parts 01–14 from an empty database, safely reapplies part 14 and rejects malformed finite-scene authoring.
- RAG repair: P25's deferred failures were genuine stale assertions, not waived checks. Tests now derive the active baseline-gap count from the policy plus corpus status (so proposed/deprecated gaps are not miscounted), and the materialization-boundary control query uses the stable code/LLM/candidate-set terminology. After regeneration, targeted knowledge tests pass 11/11 and `test:domain` passes 123/123; `knowledge:check` and `controls` pass.
- Regression checks: `spatial-v3:check-p24` and `spatial-v3:check-p25` pass. P26 is ready for an independent audit; P27+ are not started.

## P27 — full verification and release hygiene rescue

- Navigation: `repo-intel:ensure`, `repo-intel:status`, and query `P27 release hygiene checker release:check scope secret scan historical archives tests`; repository graph is ready at Graphify `0.9.17`; knowledge-source remains the documented `degraded` warning only.
- Targeted serial suite: `node --test --test-concurrency=1 test/spatial-v3/*.test.js` passed 108/108. This is the serial evidence for the target spatial contracts, migration, no-mixing, property and negative cases.
- Targeted phase handoff evidence: `npm run spatial-v3:verify-red`, `npm run spatial-v3:check-p06`, `npm run spatial-v3:test-p12`, `npm run spatial-v3:test-p12-postgres`, `npm run spatial-v3:test-p15-postgres`, `npm run spatial-v3:test-p24`, `npm run spatial-v3:check-p24`, `npm run spatial-v3:test-p25`, and `npm run spatial-v3:check-p25` passed. These cover the P06 compatibility boundary, P12 importer, P15 journey, P24 migration and P25 cutover/rollback handoffs specifically, rather than relying only on the aggregate suite.
- Repeated concurrency evidence: `npm run spatial-v3:test-p11-capacity`, `npm run spatial-v3:test-p16`, and `npm run spatial-v3:test-p23-postgres` were each repeated twice without a flaky result; the independent critic additionally ran the P23 PostgreSQL concurrency witness three sequential times, all passing.
- PostgreSQL E2E evidence: isolated `npm run spatial-v3:test-p24-postgres`, `npm run spatial-v3:test-p24-world-postgres`, and `npm run spatial-v3:test-p25-postgres` passed, covering party/world v2→v3 migration readback/rollback and the P25 rollback drill. P12/P15 PostgreSQL import and journey witnesses also passed in the P27 suite. These checks use only isolated local test databases, never an operator/production database.
- Full project evidence: `npm test` passed. Actual Chrome E2E was run with `RUS_CHROMIUM_PATH='C:\Program Files\Google\Chrome\Application\chrome.exe'`; `npm run test:browser-e2e` passed 1/1.
- Generated/schema/architecture evidence: `npm run docs:generate`, `npm run docs:check`, `npm run world-db:schema-check`, `npm run world-db:schema-doc-check`, `npm run architecture:check`, `graphify update .`, `npm run repo-intel:ensure`, and `npm run repo-intel:status` passed. Graphify retains the known non-blocking warnings for zero-node files and unavailable SQL parser; Repository Intelligence is ready.
- Release-scope repair: `release:check` now obtains Git's release set (`tracked` plus non-ignored new files), never walks `.git`, `node_modules`, or local working directories. It scans only package/release source roots and root package/config files for live assignments, preserves tracked historical archives and documented examples, and retains checks for tracked `.env` files, release-scope private keys, oversized SQL dumps, and seed intermediates. `npm run spatial-v3:test-p27-release` passes 2/2 (positive historical archive/example and negative live source-secret/local-file scope cases); `npm run release:check` passes.
- Status: P27-S01 through P27-S04 now have recorded local evidence. P27-S05 remains an independent-critic decision; this log does not self-accept the phase or authorize P28.

## P28 — atomic activation gate

- P28-S01 is intentionally **not applied**. The gate is a fail-closed assessment in `tools/spatial-v3/p28-activation-gate.mjs`; it has no migration, composition or production-write side effect. It can authorize an activation patch only after every Appendix D item has independent evidence.
- Gate hardening: `release-evidence.v1.json` is the single versioned Appendix D manifest (all 58 mandatory items). Its exact `activation_candidate_commit` must equal the current Git HEAD and must be bound identically into the P27 audit, every signed fresh-checkout item, and the release-authority decision. `activation-trust-store.v1.json` contains exactly the independently role-bound `p27_critic`, `fresh_checkout_attestor`, and `p28_release_authority` entries: every role requires a distinct key ID and a distinct canonical Ed25519 SPKI DER SHA-256 identity (not merely distinct PEM text); malformed, non-Ed25519, shared, unknown, revoked or role-misused keys fail closed. Evidence SHA-256 is calculated over raw bytes; paths are canonical repository-relative POSIX paths and reject empty, drive, UNC, traversal, ambiguous and realpath/symlink-escape forms. Each passed checklist item must name hash-verified evidence. The four P12 authoring gaps are individually pinned to their exact inventory quantities and require hash-verified resolution evidence. Caller-provided `activation_permitted` objects are ignored and can never authorize activation.
- Current quantitative blockers: Novgorod authoring manifest has **4/4 blocking typed gaps** — `CANONICAL_G5_INVENTORY_DATA_GAP` (`195` G4 inventory), `DIRECTIONAL_EXIT_READINESS_DATA_GAP` (`358` physical edges), `ROUTE_BINDING_DATA_GAP` (`600` graph edges), and `APPROVED_PROFILE_DATA_GAP` (G4 scene profiles). The G1 catalog additionally states `Production import: not_performed` and `Production readiness: not_verified`.
- This work log has no persisted independent P27-S05 acceptance. That independently fails target standard §0.4 and Appendix D. The planned conflict register and proposed ADR are inputs to the one eventual activation patch; they are not falsely marked resolved before the evidence exists. No documentation status is flipped, v2 stays the sole production composition, and no v3 request may use it as fallback.
- Required owner recovery: P12 must close the four authoring gaps with approved, version-pinned data and PostgreSQL import/readback evidence; P27 must persist an independent acceptable critic verdict; then P28 must rerun the full fresh-checkout/reproducibility checklist before any atomic activation patch. This is a release blocker, not a permissible NOTE.
- P28 fresh checkout evidence: **not_run**. The shared worktree deliberately contains the uncommitted implementation under review, so treating it as clean evidence would be false. The gate requires a separately recorded passed marker produced only from an isolated clean checkout after the owner phases and audit are accepted.
- Checks run: `npm run spatial-v3:test-p28` exercises the role/revocation, commit-binding and Windows-path negative gates; the direct gate exits **1** with the listed blockers (expected). No negative test alters production writes or composition. Repository Intelligence remains ready; knowledge-source remains its documented `degraded` warning.

## P12 V1.1 dependency closure

- Readiness was recorded on branch `codex/spatial-architecture-g0-g6-v4-2` at intake HEAD `99938a6dc90a0f12a2ecb07872ca8fde4c48a5cb`. Node `24.16.0`, npm `11.13.0`, Python `3.13.3`, uv `0.8.12`, Docker `29.5.3`, Compose `5.1.4`, and Graphify `0.9.17` were available. Repository Intelligence is ready; the known knowledge-source `degraded` status remains a warning only.
- Repository Intelligence and Graphify were queried independently for: `P12 dependency closure exact bundle and verifier`; `G0 G1 G2 G3 parent graph Novgorod`; `universal category dependencies spatial v3`; `source provenance records P12`; `scene template selection applicability rule dependencies`; and `P12 subject evidence commit chain`.
- Fully read norms include `AGENTS.md`, `.github/AGENTS.md`, `development_rules.txt`, `code_critic_invocation_rule.txt`, `code_driven_world_materialization_architecture.md`, `llm_documentation_navigation.md`, `world_base_materialization_table_requirements.md`, `read_only_database_and_graph_architecture.md`, `map_g0_g4_workflow.txt`, the Novgorod `G1_SEMANTIC_CATALOG.md`, and `SCHEMA_REFERENCE.md`.
- The reproducible closure bundle is under `data/world-catalogs/novgorod/spatial-v3/target-materialization-approval/dependency-closure/v1/`. It binds the immutable source, target-specification, and V1.1 approval archives, the historical V1.1 subject commit, and the expanded DDL digest. It contains the exact 11-entry source ledger plus repository provenance, the 49-node G0–G3 parent graph, 32 explicit conservative G3 decisions, 57 editorial categories with digest-bound resolvable anchors, and scene-template counts `17/17/17/51/34/68` with zero stable structures and portals.
- The target-only DDL adds normalized regional basis, selector/applicability, source-pair, topological orientation, connection, entry, and traversal contracts. The deterministic V1.1 physical projection covers every immutable matrix contract and imports only exact version-pinned rows. Existing primary keys are accepted only after full canonical-row equality; mismatches fail and roll back without update, overwrite, upsert, or delete.
- Evidence Chain A preserves `e6be7c0 → 99938a6` as immutable historical intake and accepts `99938a6` only as an ancestor of the current checkout. Chain B reads its binding from the evidence commit itself, requires an evidence-only current HEAD with a sole content parent, and verifies the complete unique path-safe content manifest by raw-byte SHA-256.
- Isolated PostgreSQL evidence applies all DDL from an empty database, imports the dependency closure, rehearses rollback, imports the complete V1.1 physical projection, verifies readback counts/digests, repeats exact-idempotently, and proves mismatch rollback. The test database has an explicit local P12 identity and never uses an operator or production connection.
- Independent data critic verdict: `PASS`. It verified all 57 anchors, 32/32 G3 decisions, source/provenance exactness, reproducibility, and absence of stronger historical or runtime claims. Code-critic re-audit is required before the subject commit. P28 remains blocked and v2 remains the production owner.
