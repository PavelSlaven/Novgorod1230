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

## P02 — target materialization/DB/map normatives with an explicit pre-P28 boundary

### Scope and document architecture

P02 is implemented as four paired normative owners. The pre-P28 production
owner remains the byte-pinned active materialization-v2 document; its
`spatial_v3_target_*` supplement contains the target v3 replacement. This
separation satisfies the plan without relabelling target text as production
active:

| Active production v2 until P28 | Separate target v3 supplement |
|---|---|
| `code_driven_world_materialization_architecture.md` | `spatial_v3_target_code_driven_world_materialization_architecture.md` |
| `world_base_materialization_table_requirements.md` | `spatial_v3_target_world_base_materialization_table_requirements.md` |
| `read_only_database_and_graph_architecture.md` | `spatial_v3_target_read_only_database_and_graph_architecture.md` |
| `map_g0_g4_workflow.txt` | `spatial_v3_target_map_g0_g4_workflow.txt` |

The target supplements cover canonical G0–G5, finite party-generated G5,
party G6/positions, finite expansion, typed data gaps, proposal/commit
ownership, normalized authoring/import readiness, exact cross-database pins,
save/load from pinned records, explicit topology and the G0–G5 authoring
workflow. The compatibility workflow filename does not authorize G7/G8.
Physical coexistence remains non-authoritative: dual write, mixed reads,
fallback and partial activation are forbidden.

The formal authority for that boundary is the versioned, strict
`evidence/p02-boundary-declaration.json`, validated against
`data/contracts/spatial-v3/p02-boundary-declaration.schema.json`. It declares
the sole v2 production read/write owner, inactive-until-P28 target status,
negative activation flags, G5 ownership, maximum level and the exact four
active/target path and whole-document digest pairs. Prose marker checks and
contradiction detection are defense-in-depth; they are not the authoritative
proof of production ownership.
The checker also embeds independent reviewed P02 SHA-256 trust anchors for all
four active-v2 documents. An active file must match its hardcoded reviewed anchor and
the declaration pin must equal the same anchor, so jointly editing active text
and its mutable declaration cannot authorize drift. Target supplements may be
repinned only as an explicit reviewed P02 change. The JSON Schema itself is
anchored by an independent checker SHA-256 and is executed by the checker's
JSON Schema validator before the additional P02 invariants.

### Readiness, navigation and verification

- Intake: repository `C:\Users\Slaven\Documents\Новгород`, branch
  `codex/spatial-architecture-g0-g6-v4-2`, HEAD
  `93c0b5f27d488c1ce6c7084c573580ed6485fb3d`; `origin/main`
  `9f2a8c1477793e3baac376d558a64b1b2272cc4a`.
- Toolchain: Node `v24.16.0`, npm `11.13.0`, Python `3.13.3`, uv `0.8.12`,
  Docker `29.5.3`, Compose `5.1.4`, Graphify `0.9.17`.
- Repository Intelligence query:
  `P02 normative target-document architecture active v2 production owner proposed spatial-v3 supplement P28 activation boundary checker tests documentation`.
  Repository graph was rebuilt for the intake HEAD and reported ready; the
  knowledge-source `degraded` semantic-coverage warning was recorded and did
  not replace complete normative reading.
- Independent Graphify query:
  `P02 active target document architecture v2 production owner proposed supplement P28 activation boundary checker`.
  It identified `check-p02.mjs`, `check-p05.mjs`, documentation tooling and the
  P28 gate as the relevant implementation boundary.
- Red: the former `spatial-v3:check-p02` required target/P28/G6 wording inside
  the active v2 documents and therefore failed against the intended document
  architecture.
- Green: `check-p02.mjs` now validates each active/target pair, pins the active
  v2 bytes, rejects premature v3 activation and checks the P02 target
  requirements only in the target supplements. It performs no DDL, import,
  runtime composition or P28 mutation.
- Critic repair: `node --test test/spatial-v3/p02-normative-boundary.test.js`
  passes 56/56 isolated cases. Temporary copies prove fail-closed behavior for
  English and Russian variants of pre-P28 dual write, mixed read/execution
  authority, v3→v2 fallback, partial activation, canonical-G5 prohibition or
  party-only ownership, G7/G8 introduction, and mutation of a pinned active
  document. Regression cases include `Dual write is enabled before P28`,
  production writing each change to both stores, `the v3 path falls back to
  v2`, canonical G5 nonexistence/party-only ownership and a split-line
  permission assertion. Controls prove that explicit prohibition wording and
  `G7 is not introduced and is not required` remain valid.
  Unsafe target-prose fixtures repin both the target digest and whole-document
  section digest before execution, and assert the named contradiction-policy
  diagnostic instead of accepting an earlier digest mismatch. Separate active
  owner fixtures omit the target supplement, canonical target standard, P12
  manifest, approved `37`/`data_gaps: []` state and sole-v2 ownership in turn;
  each asserts its intended routing diagnostic before the immutable trust-anchor
  check. Every top-level declaration field is mutated independently; additional and
  missing properties, duplicate/unknown pair identity, active/target path and
  digest changes, section identity/digest changes and pin-level extra
  properties all fail closed. Safe prose controls pass only after their exact
  target digest is explicitly repinned in the temporary declaration.
  A separate regression proves that modifying an active document and repinning
  the declaration to the same modified digest still fails the independent
  reviewed P02 trust anchor. Schema mutations of `dual_write.const`,
  `required`, `pair_id`, `documentPin.additionalProperties` and exact
  four-pair cardinality also fail the independently pinned schema check.
  `npm run spatial-v3:check-p02`, `npm run spatial-v3:check-p05`,
  `npm run docs:check`, `npm run architecture:check` and
  `npm run knowledge:check` all pass after the repair.

### Reopened P02 — owner-document routing reconciliation

- At HEAD `2a478e9c23d2f4b33f5f132d2ba4bd0e16ab401b`, the earlier P02 arrangement kept the four active v2 owner documents byte-identical to `origin/main` and described target v3 only in supplements. This left the main owners without an explicit route to their target replacement and therefore did not prove literal P02-S01–S04 synchronization. The reconciliation query was `P02 active v2 owner documents target v3 supplements approved P12 routing production ownership before P28 activation`; both RAG and Graphify were executed first. Knowledge retrieval remained available with its existing `degraded` coverage warning; Graphify `0.9.17` identified the P02 checker/declaration boundary.
- Each active owner now contains one small `P02 target routing (inactive until P28)` section naming its exact `spatial_v3_target_*` supplement and the canonical target standard. The section also routes to the approved root P12 manifest (`37` SHA-256-pinned datasets, `data_gaps: []`) and explicitly states that authoring approval grants no production import, runtime use, write or activation. The complete v2 body remains authoritative for production, and v2 remains the sole production owner until P28; no target rule was copied into the active body, no fact was created and no v3 activation occurred.
- TDD evidence: the new routing contract failed first against all four untouched owners, then passed after the minimal document changes. After critic repair, `node --test test/spatial-v3/p02-normative-boundary.test.js` passes `56/56`: unsafe target mutations are explicitly repinned and reach the intended contradiction diagnostics, while five independent routing omissions reach their exact semantic diagnostics. `npm run spatial-v3:check-p02` passes. The nonexistent `spatial-v3:test-p02` npm alias was also attempted and reported as missing; the canonical targeted invocation is the direct Node test command above.
- The strict P02 declaration and checker now pin the reviewed routed owner bytes through reviewed P02 trust anchors; jointly repinning an arbitrary active mutation still fails the independent hardcoded trust anchor. The baseline context remains separate: the branch was created from `origin/main` commit `9f2a8c1477793e3baac376d558a64b1b2272cc4a`, while the routing reconciliation was performed at HEAD `2a478e9c23d2f4b33f5f132d2ba4bd0e16ab401b`. Because indexed normatives and P02 evidence changed, the existing P05 normative freeze digests are intentionally stale and must be regenerated/re-audited by the separate P05 owner before release. This P02 executor did not edit P05, P04 or P28 artifacts and did not run production DB/import/composition operations.

## P05 normative re-freeze after the formal P02 boundary gate

P05 was deliberately reopened at HEAD
`6fb08b856b709daa9c6ffa9383ce5b9bba368c02`. The reproducibility gate exposed
that `normative-freeze.json` still described the pre-P02 document layout:
active-v2 paths carried old target-v3 digests, while the four target
supplements and the formal P02 declaration/schema were not frozen at all.
Consequently the old `check-p05.mjs` could report `PASS` while
`spatial-v3:freeze-check` failed. The previous critic verdict was retired and
P05 was audited again from the full current artifacts.

Freeze schema v1.2 now binds all 24 sources, including the exact four
active-v2/target-v3 pairs and the closed P02 declaration/schema. It records
`active_owner=v2`, `target_status=inactive_until_P28` and v2-only production
read/write; it grants no runtime, DDL or P28 activation. It also freezes the
complete ownership surface (160 contract rows and 58 typed-error rows) and the
exact ten-item conflict register (`NC-01..NC-10`) with zero open findings.
`check-p05.mjs` independently recomputes those sets and digests and checks every
P02 pair against the actual document bytes.

The first independent re-review found that the v1.1 digests were still
circular: a coordinated source/declaration/freeze repin or owner/freeze repin
could bless itself. The repair adds the manually reviewed, non-generated
`data/contracts/spatial-v3/p05-reviewed-baseline.json`. Its whole-file SHA-256
is hardcoded in shared P05 tool source. Both generator and checker require the
current 24 source bytes, contract/error names, complete owner matrices and
exact conflict set to match that reviewed baseline before accepting or writing
a freeze. Any intended semantic or ownership change therefore requires an
explicit trust-anchor code review; regeneration alone cannot approve it.
The shared P02 validator also requires exactly four unique pair IDs with exact
active/target paths and pins, so duplicate, omitted and unknown pairs fail in
both tools.

The independent re-review returned `PASS`. It confirmed that all three
coordinated-repin findings are closed, the reviewed baseline is not generated,
its whole-file SHA is anchored in tool source, and checker/generator both
reject duplicate/omitted/unknown P02 pairs, contract/error count drift,
coordinated NC changes and trust-store tampering. P05-S01..S04 are therefore
closed with zero open normative findings. This documentation verdict does not
activate v3 or P28.

- Information need:
  `P05 cross-document audit normative freeze current P02 formal boundary manifest schema active v2 target v3 no P28 activation contract error owner conflict matrix`.
- Repository Intelligence: `repo-intel:ensure` rebuilt the graph for
  `6fb08b856b709daa9c6ffa9383ce5b9bba368c02`; `repo-intel:status` reported
  Graphify `0.9.17` ready and only the documented knowledge-source semantic
  coverage warning. The combined query located the P02 checker/schema,
  P05 checker/generator, P28 gate, contract matrix and active/target normative
  boundary.
- Independent RAG/Graphify queries used the same need. RAG confirmed that v2
  remains the sole production owner until P28 and that target v3 permits only
  documentation/contracts/fixtures/migration/shadow composition. Graphify
  linked `p02-normative-boundary.test.js`, `check-p05.mjs`,
  `p28-activation-gate.mjs`, contract ownership and typed-error surfaces.
- Red: `spatial-v3:freeze-check` failed as stale; the initial v1.1 negative
  suite then reproduced the critic's coordinated-repin bypasses. Green: freeze
  v1.2 is reproducible and the 11 isolated cases require both checker and
  generator to reject coordinated target/declaration/freeze,
  schema/declaration/freeze, owner/all-dependent-freeze, count and NC repins;
  duplicate/omitted/unknown P02 pairs; and trust-store tampering.
- Validation: P01/P02/P03/P04/P05 checks pass; the P02 isolated negative suite
  passes 50/50; `docs:generate`, `docs:check`, `knowledge:check`,
  `architecture:check` and the complete `npm test` pass. The full suite reports
  only its existing environment-dependent skips: five optional real-PostgreSQL
  integration cases and one browser E2E because no Chromium executable was
  available to that command. The production PostgreSQL adapter integration
  cases that are part of the default suite pass.
- Fully read normative scope: project agent rules; development and critic
  rules; code-driven materialization, documentation navigation,
  materialization table, G0–G4 workflow, Novgorod G1 catalog, read-only
  database/graph and schema references; target spatial standard and P05 plan.
- No production database or service was used. No runtime, DDL, importer,
  composition profile or activation evidence was changed.

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

## P04 — semantic catalog and ownership synchronization

- Reopened P04-S03 synchronization at `2a478e9c23d2f4b33f5f132d2ba4bd0e16ab401b` used the RAG/Graphify query `P04 G1 semantic catalog ownership authoring status versus approved P12 target compilation datasets gaps production import readiness activation`. Repository Graph was current at Graphify `0.9.17`; knowledge-source returned the applicable target/materialization norms with its existing `degraded` coverage warning. Fully read inputs included both AGENTS files, `development_rules.txt`, `code_critic_invocation_rule.txt`, `code_driven_world_materialization_architecture.md`, `llm_documentation_navigation.md`, `world_base_materialization_table_requirements.md`, `map_g0_g4_workflow.txt`, the complete target standard, P04/P12 plan sections, the regional catalog, and both P12 source/root manifests. The catalog and target ownership registry now distinguish approved authoring compilation (32 target G4 sectors, 195 canonical G5, 358 physical pairs/716 directions, 600 typed mappings, 17 families and 195 profiles/candidates, 37 datasets, zero authoring gaps) from production import/runtime/P28, which remain `not_performed`/`not_verified`/`not_performed`. No source fact, production write, runtime readiness or activation claim was added.
- Critic hardening makes `spatial-v3:check-p04` verify the raw-byte SHA-256 of all 37 approved datasets and derive the evidence rather than trust prose: 32 retained-G3→target-G4 identities and parents, zero compounds, four blocked external boundaries, and the disjoint 227 intra-G4 + 32 host-entry + 43 direct-route + (32 + 24) route-context partition. `spatial-v3:test-p04` is part of `test:tools` and rejects 227→999, four→forty, forged all-zero manifest SHA, compound, and missing-G4 evidence mutations. The focused P04 suite passes 7/7, `spatial-v3:check-p04` passes, and `spatial-v3:test-p12` passes 16/16. Documentation generation completed, but final `docs:check`/`test:tools` are temporarily blocked by the concurrently changed P05 normative/corpus parity baseline; P04 did not modify or refreeze that baseline.

## P12 rescue — approved Novgorod source package

- Immutable editorial input is committed under `data/world-catalogs/novgorod/spatial-v3/source-approval/p12_novgorod_source_approval_001/`. Its package manifest is digest-verified and its approval record is `APPROVED_FOR_P12_INTEGRATION`, explicitly not production activation evidence.
- Source verification is implemented by `tools/spatial-v3/p12-source-approval.mjs` and is now a fail-closed dependency of the P12 authoring importer. It verifies all package-member digests and the approved finite counts: 195 canonical G5 records, 358 physical source pairs / 716 directions, 600 classified mappings, and 17/195/195 scene-family/profile/candidate records.
- **Superseded by the approved target projection below.** This source-package intake originally closed only the absence of an approved source catalogue. The later deterministic target compilation produced a contract-valid non-empty P12 bundle and isolated PostgreSQL readback, so the four source/target authoring gaps are now closed. This historical intake still does not authorize production composition, a production write, or P28.
- Checks: `spatial-v3:test-p12-source`, `spatial-v3:check-p12-source`, `spatial-v3:test-p12`, `spatial-v3:check-p12`, `spatial-v3:test-p28`, and `spatial-v3:check-p28` passed. The P28 negative gate remains intentionally non-mutating.
- P12 V1.1 repository binding is fail-closed pending an explicit dependency-closure evidence commit. The verifier accepts only a current two-commit chain: the binding file is first introduced by the exact evidence commit, its sole parent is the subject commit, its diff is limited to declared evidence paths, and every declared subject-tree file matches a SHA-256 pinned in the binding. A reachable ancestor, replayed/future checkout, broad evidence commit, absent subject file, digest drift, or unapproved closure is rejected. This record does not authorize target DDL or production activation.

## P12 target-contract compilation specification — immutable input, not a compiler result

- The supplied `P12_TARGET_CONTRACT_COMPILATION_SPEC_V1.zip` is retained byte-pinned at `data/world-catalogs/novgorod/spatial-v3/target-contract-spec/`. Its SHA-256 is `1833b383e5ee2568330ab88ae40c7d5b9d057dbde81aa4f43641c48ecd3eb6f3`; it binds the previously approved source ZIP `e3342beac492ff6433a03ecbf7c32dbffdc9dafce8e7ebd623af826b33d7bbbe`.
- `tools/spatial-v3/p12-target-contract-specification.mjs` verifies the identity, byte pin and explicit non-activation status. It rejects a modified or absent ZIP and cannot be used as a P28 authorization object.
- **Superseded for P12 authoring-gap status.** The supplied specification was correctly `proposed_not_active` at intake, but the later V1.1 approval, dependency closure, deterministic compiler, approved main manifest, and isolated readback now provide the exact target revision pins, connection profiles, and route chains. Appendix D is covered by the final candidate audit; the live P28 GitHub approval and completion proof remain incomplete, so no production write or composition change follows from the closed P12 authoring gaps.

## P12 approved target projection — current status

- `data/world-catalogs/novgorod/spatial-v3/manifest.json` is the approved compiled authoring manifest: 37 SHA-256-pinned datasets and zero typed data gaps. It is reproducible through `npm run spatial-v3:generate-p12-approved-target` from the immutable approved source, dependency-closure, and V1.1 target-approval inputs.
- Exact source coverage is preserved without new facts: 195 canonical G5; 358 physical pairs / 716 directions; 600 mappings = 47 retained hierarchy + 195 G5 parent + 358 physical; and 17 scene families with 195 profiles and 195 candidates. The physical partition is disjoint and complete: 227 intra-G4 + 32 host-entry + 43 direct-route + 56 route-context = 358.
- Exact target evidence includes 276 nodes, 275 parents, all 358 approved source-pair registry rows, 454 connection bindings, 32 entry bindings, 32 correctly typed traversal profiles, 86 direction contexts/exits/routes/segments, 172 route points/endpoints, 195 profiles/candidates, and 3,249 authoring dependency edges.
- Both generation and default validation are gated by the immutable V1.1 approval and fail closed on ZIP digest/binding drift. The gate explicitly preserves `materialization_authorized=false` and P28 `not_authorized`.
- Targeted P12 tests pass 16/16; V1.1 tests pass with only the Windows symlink-capability skip; isolated PostgreSQL import/readback passes after loading every schema part declared by `schema.sql`. The independent critic verdict is **PASS**; see `p12-approved-target-projection-critic-report.md`.
- This closes the four P12 source/target authoring gaps only. The atomic P28 gate still requires its live exact-head GitHub approval and completion proof. Production is not activated and v2 remains the sole production composition.

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
- Checks: `spatial-v3:test-p25` 8/8 (including isolated PostgreSQL), `spatial-v3:check-p25`, `spatial-v3:test-p24`, `spatial-v3:check-p24`, `docs:generate`, `docs:check`, `architecture:check`, `graphify update .` and `repo-intel:ensure` passed. **Historical P25 result, now superseded:** the P25 handoff recorded three RAG/corpus expectation failures: two fixed document-count assertions expected 24 while the corpus then had 25, and the materialization-boundary control query did not rank the expected document in the top five. Later P26 regeneration and the exact-subject P27 evidence record the knowledge checks and full `npm test` as PASS for their stated subjects. This history is retained for phase traceability and is not a current failure or P28 authority.

## P26 — generated artifacts and repository intelligence

- Readiness: repository `C:\\Users\\Slaven\\Documents\\Новгород`, branch `codex/spatial-architecture-g0-g6-v4-2`, HEAD and `origin/main` `9f2a8c1477793e3baac376d558a64b1b2272cc4a`; Graphify `0.9.17`. `repo-intel:ensure` and `repo-intel:status` are ready; the known baseline semantic-coverage condition remains an explicitly reported `degraded` warning, not a repository-graph blocker.
- Navigation: `repo-intel:query -- --query "P26 activation production cutover spatial architecture G0 G6 conditions"`; Graphify queries for P26 artifact owners and P25 cutover dependencies. Follow-up graph inspection confirms `spatial-v3-repository.js` is the explicit P16 party repository and `detectDependencyCycles` remains confined to the stage-24 v2 write-plan validator; no unexpected v3 production writer or ownership cycle was found.
- Sources: P26 plan; target standard §16.2–§16.4; navigation active/target boundary; code-driven materialization ownership/commit boundary; P24 and accepted P25 handoff. P26 does not activate v3, change the production v2 profile, or perform a production write.
- Regeneration: ran `docs:generate`/`docs:check`; `world-db:schema-check` and `world-db:schema-doc-check` (186 world-base tables, digest `fccc625773089749ca676831ee69f8b3656e914f5f0e53cbbfaff8773df905fe`); `knowledge:inventory`, `knowledge:generate`, `knowledge:check` (35 documents); and `repo-intel:build`/`repo-intel:status`.
- Fresh DDL evidence: isolated PostgreSQL `spatial-v3:test-p11-postgres` applies all schema parts 01–14 from an empty database, safely reapplies part 14 and rejects malformed finite-scene authoring.
- P11 independent closure is recorded in `p11-expansion-scene-ddl-critic-report.md`: `PASS WITH NOTES` at commit `2983d7ef941acc161b7d327b063b15259c62ea49`. It records static 20-table coverage, deterministic capacity proofs, an isolated fresh/reapply/deferred-negative PostgreSQL rehearsal, and P12 importer-consumer regression coverage. Its only note is the deliberate target-only fixture scope; it does not approve P12 data or P28 activation.
- RAG repair: P25's deferred failures were genuine stale assertions, not waived checks. Tests now derive the active baseline-gap count from the policy plus corpus status (so proposed/deprecated gaps are not miscounted), and the materialization-boundary control query uses the stable code/LLM/candidate-set terminology. After regeneration, targeted knowledge tests pass 11/11 and `test:domain` passes 123/123; `knowledge:check` and `controls` pass.
- Regression checks: `spatial-v3:check-p24` and `spatial-v3:check-p25` pass. **Superseded status:** the former pre-audit handoff is replaced by the accepted generated-artifact audit, exact-subject project audit and the completion matrix below.

## P27 — full verification and release hygiene rescue

- Navigation: `repo-intel:ensure`, `repo-intel:status`, and query `P27 release hygiene checker release:check scope secret scan historical archives tests`; repository graph is ready at Graphify `0.9.17`; knowledge-source remains the documented `degraded` warning only.
- Targeted serial suite: `node --test --test-concurrency=1 test/spatial-v3/*.test.js` passed 108/108. This is the serial evidence for the target spatial contracts, migration, no-mixing, property and negative cases.
- Targeted phase handoff evidence: `npm run spatial-v3:verify-red`, `npm run spatial-v3:check-p06`, `npm run spatial-v3:test-p12`, `npm run spatial-v3:test-p12-postgres`, `npm run spatial-v3:test-p15-postgres`, `npm run spatial-v3:test-p24`, `npm run spatial-v3:check-p24`, `npm run spatial-v3:test-p25`, and `npm run spatial-v3:check-p25` passed. These cover the P06 compatibility boundary, P12 importer, P15 journey, P24 migration and P25 cutover/rollback handoffs specifically, rather than relying only on the aggregate suite.
- Repeated concurrency evidence: `npm run spatial-v3:test-p11-capacity`, `npm run spatial-v3:test-p16`, and `npm run spatial-v3:test-p23-postgres` were each repeated twice without a flaky result; the independent critic additionally ran the P23 PostgreSQL concurrency witness three sequential times, all passing.
- PostgreSQL E2E evidence: isolated `npm run spatial-v3:test-p24-postgres`, `npm run spatial-v3:test-p24-world-postgres`, and `npm run spatial-v3:test-p25-postgres` passed, covering party/world v2→v3 migration readback/rollback and the P25 rollback drill. P12/P15 PostgreSQL import and journey witnesses also passed in the P27 suite. These checks use only isolated local test databases, never an operator/production database.
- Full project evidence: `npm test` passed. Actual Chrome E2E was run with `RUS_CHROMIUM_PATH='C:\Program Files\Google\Chrome\Application\chrome.exe'`; `npm run test:browser-e2e` passed 1/1.
- Generated/schema/architecture evidence: `npm run docs:generate`, `npm run docs:check`, `npm run world-db:schema-check`, `npm run world-db:schema-doc-check`, `npm run architecture:check`, `graphify update .`, `npm run repo-intel:ensure`, and `npm run repo-intel:status` passed. Graphify retains the known non-blocking warnings for zero-node files and unavailable SQL parser; Repository Intelligence is ready.
- Release-scope repair: `release:check` now obtains Git's release set (`tracked` plus non-ignored new files), never walks `.git`, `node_modules`, or local working directories. It scans only package/release source roots and root package/config files for live assignments, preserves tracked historical archives and documented examples, and retains checks for tracked `.env` files, release-scope private keys, oversized SQL dumps, and seed intermediates. `npm run spatial-v3:test-p27-release` passes 2/2 (positive historical archive/example and negative live source-secret/local-file scope cases); `npm run release:check` passes.
- **Superseded status statement.** The earlier claim that only P27-S01 through P27-S04 had evidence and P27-S05 was absent predates the exact-commit critic run.
- Historical P27-S01 through P27-S05 acceptance for `45b4b9697663426a9543cd959bc927081334da5c` remains recorded in `p27-exact-commit-critic-report.md`, but it is not the current P28 subject. The current candidate-bound independent-review evidence is `p27-candidate-evidence.md`, hash-pinned by the direct evidence-child manifest. Both records are evidence about their own subject trees, never P28 authority.

## P28 — atomic activation gate

- P28-S01 production activation is intentionally **deferred**. The gate is a fail-closed assessment in `tools/spatial-v3/p28-activation-gate.mjs`; it has no migration, composition or production-write side effect. It accepts release readiness only after every Appendix D item has hash-bound evidence and the live GitHub proof succeeds; actual production activation remains a separate owner operation.
- Gate hardening: `release-evidence.v1.json` is the single versioned Appendix D manifest (all 58 mandatory items). Its `activation_candidate_commit` identifies the immutable candidate parent; the manifest must be committed in one strict direct-child evidence HEAD, avoiding self-referential SHA. That evidence child must be current HEAD, have exactly the candidate as its sole parent, contain the exact assessed manifest bytes, and change only the manifest plus the candidate-declared evidence documents; descendants, merge commits, runtime/composition files and working-tree substitutions fail closed. Every passed checklist item and every resolved P12 gap is raw-byte SHA-256 bound to its tracked HEAD blob.
- Evidence-commit scope is exact rather than a directory wildcard and is immutable: `p28-evidence-scope.v1.json` is committed in the candidate parent, while the evidence child may contain only its manifest and the two listed evidence documents. The reviewed implementation, tests, package/checker and generated manifest belong to the candidate tree, not the mutable child. The gate reads the scope blob from the candidate parent and rejects every other child path, including a runtime file paired with a self-added child allowlist entry.
- P28 authority is exclusively a live GitHub proof through the explicit adapter: exact `PavelSlaven/Novgorod1230` PR targeting canonical `main`, PR head equal to the exact evidence commit, an `APPROVED` review recorded for that commit, and every manifest-versioned required CI check (currently `clean-clone-generation-test`) with `status: completed` and `conclusion: success`. Completion is either GitHub-verified merge ancestry containing the evidence commit or a signed annotated tag that points exactly to it and passes local `git verify-tag` trust. The signed-tag alternative does not require the PR to be merged; the merge alternative does. Draft PRs, wrong base repository/ref, stale/missing approval, unavailable GitHub proof, missing/pending/failed/non-completed checks, merge/tag mismatch, or an invalid local tag signature all fail closed. A successful proof accepts the release evidence and does not request a post-merge repository patch; production activation remains a separately deferred owner operation. Required checks are versioned in the manifest because branch-protection API access is not assumed. `assessSpatialV3Activation` exposes adapters only as test seams; production `requireSpatialV3Activation` ignores caller-supplied proof and performs the real local/GitHub verification.
- The required CI check is risk-based. A commit that changes code, contracts, DDL, imports, data, behavior or CI itself runs the complete clean-clone suite. A strict direct evidence child whose diff is limited by the candidate-owned P28 scope runs only P28 contract/local-evidence checks and documentation consistency. The live exact-head required check is the fresh-checkout proof; there is no second `p28_fresh_checkout` authority object and no repeated PostgreSQL/browser cycle for evidence-only metadata.
- Current deferred state: the approved Novgorod P12 compilation has **0/4** source/target data gaps and the final evidence child records all **58** Appendix D rows as locally passed by one independent final audit. PR #14 remains draft without exact-head GitHub approval or merge/tag completion proof. No production status changes, v2 stays sole production composition, and no v3 request may use P28 as fallback.
- `npm run spatial-v3:p28-github-release-proof` is read-only. It validates the committed manifest/evidence chain then calls the explicit GitHub adapter; it writes no files or database and cannot alter composition. No offline signer, trust store, public key or caller-provided approval can unlock the gate. `npm run spatial-v3:test-p28` covers direct-child binding, exact approval, non-completed/success check rejection, and merge/tag negative cases; the direct gate exits **1** while the deferred blockers remain.

## P00–P28 completion evidence matrix

This is a compact index into the detailed sections and persisted reports above; it does not replace their exact commands, counts or scope qualifications. `PASS` means the cited checker/test or persisted critic accepted the implemented phase scope, not that production activation occurred.

**Process-evidence exception:** repository artifacts and Git history do not prove that every historical phase was originally executed by its own distinct subagent in the required sequence. No such sequencing is reconstructed or claimed here. Final plan acceptance therefore requires an explicit plan-owner decision accepting this process-evidence exception; the exception cannot be converted into Appendix D or activation evidence by documentation alone.

| Phase | Implementation evidence | Actual verification status | Remaining limitation |
|---|---|---|---|
| P00 | this README baseline/readiness sections and `contract-implementation-matrix.*` | `PASS WITH NOTES`; forensic recovery accepted as recorded above | retrospective evidence does not prove original execution ordering; covered by the explicit process exception |
| P01 | `data/knowledge-source/corpus/DOCUMENTS/spatial_architecture_standard_g0_g6.md`, `docs/adr/ADR-001-materialization-v3-spatial-g0-g6.md`, `normative-conflicts.md` | `spatial-v3:check-p01` PASS in the accepted project suite | target standard and ADR remain non-production until atomic authority exists |
| P02 | four active-owner target routes, four `spatial_v3_target_*` supplements, `evidence/p02-boundary-declaration.json` | latest critic repair PASS; boundary test 56/56 and `spatial-v3:check-p02` PASS | v2 bodies remain active owners; routing grants no import or runtime authority |
| P03 | movement/time/formula/orchestration normatives and `tools/spatial-v3/check-p03.mjs` | checker PASS in the accepted project suite | normative synchronization only; runtime switching is outside this phase |
| P04 | `data/world-catalogs/novgorod/G1_SEMANTIC_CATALOG.md`, `target-registries.md`, `data/world-catalogs/novgorod/spatial-v3/manifest.json` | latest critic repair PASS; focused catalog suite 8/8 and `spatial-v3:check-p04` PASS | catalog records authoring approval, while production import/readiness remain unverified |
| P05 | current `normative-freeze.json` and `tools/spatial-v3/p05-reviewed-baseline.mjs`; `p05-document-critic-report.md` is historical evidence for the earlier baseline only | current reopened baseline: `spatial-v3:test-p05`, `spatial-v3:check-p05` and `spatial-v3:freeze-check` PASS; independent re-review PASS, with no persisted SHA-bound report claimed | freeze proves document consistency only and grants no activation |
| P06 | `red-contract-harness.mjs` and `test/spatial-v3/p06-red-*.test.js` | `spatial-v3:verify-red` and `spatial-v3:check-p06` PASS | compatibility harness is defensive evidence, not a production composition |
| P07 | `packages/contracts/src/spatial-v3/`, controlled-vocabulary registry and `p07-controlled-vocabulary-gap.md` | `spatial-v3:check-p07` and controlled-vocabulary integration test PASS | contracts do not independently materialize or activate data |
| P08 | `p08-public-interface-registry.json`, `p08-interaction-map.md`, module public ports | `spatial-v3:check-p08` and public-port tests PASS | API skeletons remain behind the target-only boundary |
| P09 | world-base schema part 12, graph-node migration tool and `p09-ddl-critic-report.md` | independent critic `PASS WITH NOTES`; static and isolated PostgreSQL checks PASS | accepted notes preserve target-only DDL scope; no production migration |
| P10 | world-base schema part 13, graph-edge migration tool and legacy-edge inventories | `spatial-v3:check-p10`, DDL/migration and isolated PostgreSQL tests PASS | migration mapping remains an offline target operation |
| P11 | world-base schema part 14, capacity proof and `p11-expansion-scene-ddl-critic-report.md` | independent critic `PASS WITH NOTES`; capacity and PostgreSQL checks PASS | finite-scene evidence uses isolated target fixtures only |
| P12 | approved source package, `data/world-catalogs/novgorod/spatial-v3/manifest.json`, 37 compiled datasets and `p12-approved-target-projection-critic-report.md` | exact approved compilation `PASS`: 195 canonical G5, 358 physical pairs, 600 typed mappings, 17 families plus 195 profiles/candidates; targeted and isolated PostgreSQL checks PASS | closes authoring gaps only; `materialization_authorized=false`, no production import or activation |
| P13 | party schema migration 002 and `p13-party-runtime-postgres.test.js` | isolated PostgreSQL test PASS in the accepted project suite | schema remains target-only and unselected by production composition |
| P14 | planning/execution DDL and `p14-planning-execution-ddl-critic-report.md` | repaired independent re-audit `PASS`; checker and PostgreSQL test PASS | DDL acceptance does not authorize runtime cutover |
| P15 | carrier/time/idempotency schema and `p15-party-journeys-postgres.test.js` | checker and isolated PostgreSQL journey test PASS | persisted target contracts remain inactive in production |
| P16 | repositories, combined atomic committer and `p16-persistence-critic-report.md` | sole-writer repair independently re-reviewed `PASS`; unit/PostgreSQL/architecture checks PASS | accepted writer is reachable only through target composition, which remains inactive |
| P17 | `packages/space-map/src/spatial-v3*.js` and `p17-space-map.test.js` | checker and targeted tests PASS | compatibility boundary still prevents production v3 ownership |
| P18 | `packages/movement-routes/src/spatial-v3*.js` and `p18-planner-critic-report.md` | independent critic `PASS`; checker and planner tests 22/22 PASS | planner proposes bounded target plans but cannot activate composition |
| P19 | turn execution/time modules and `p19-execution.test.js` | checker and targeted execution/property tests PASS | execution remains target-only and cannot bypass the atomic committer |
| P20 | `packages/materialization/src/spatial-v3*.js` and `p20-materialization.test.js` | checker and targeted materialization tests PASS | empty candidate sets still hard-block; no production materialization |
| P21 | turn/new-game target orchestration and `p21-orchestration-critic-report.md` | independent critic `PASS WITH NOTES`; checker and orchestration tests PASS | orchestration is not selected by the production profile |
| P22 | presentation projection plus visibility/knowledge resolvers and `p22-projection.test.js` | checker and player-safe projection tests PASS | read models do not confer hidden topology or activation authority |
| P23 | sealed cross-domain proposal path and `p23-cross-domain-critic-report.md` | independent critic `PASS WITH NOTES`; targeted and PostgreSQL concurrency checks PASS | domain integrations write only through the inactive target sole-writer path |
| P24 | migration inventories/tools and `p24-migration-critic-report.md` | repaired independent critic `PASS`; unit and party/world PostgreSQL migrations PASS | production migration has not been run; rollback evidence is isolated |
| P25 | explicit profiles, shadow/cutover/rollback tooling and `p25-compatibility-cutover-critic-report.md` | independent critic `PASS WITH NOTES`; checker, tests and PostgreSQL rollback drill PASS | `production_v2` remains the only active profile |
| P26 | generated schema/knowledge/repository-intelligence artifacts and `p26-generated-artifacts-critic-report.md` | independent critic `PASS WITH NOTES`; schema, knowledge and repository-intelligence checks passed with the documented semantic warning | generated evidence is commit-sensitive and must be refreshed after indexed changes |
| P27 | `p27-candidate-evidence.md`, historical `p27-exact-commit-critic-report.md`, and release-hygiene test | current candidate-bound independent-review evidence is hash-pinned in the P28 manifest; historical exact-subject critic record remains separately scoped | neither record is P28 authority; GitHub proof and all Appendix D requirements remain separate |
| P28 | activation gate, final Appendix D audit, risk-based required CI and GitHub-proof tests | local evidence is complete; activation assessment remains intentionally fail-closed until live GitHub proof | exact-head PR approval and merge/tag completion are external and absent; production activation remains deferred |

## P12 V1.1 dependency closure

- Readiness was recorded on branch `codex/spatial-architecture-g0-g6-v4-2` at intake HEAD `99938a6dc90a0f12a2ecb07872ca8fde4c48a5cb`. Node `24.16.0`, npm `11.13.0`, Python `3.13.3`, uv `0.8.12`, Docker `29.5.3`, Compose `5.1.4`, and Graphify `0.9.17` were available. Repository Intelligence is ready; the known knowledge-source `degraded` status remains a warning only.
- Repository Intelligence and Graphify were queried independently for: `P12 dependency closure exact bundle and verifier`; `G0 G1 G2 G3 parent graph Novgorod`; `universal category dependencies spatial v3`; `source provenance records P12`; `scene template selection applicability rule dependencies`; and `P12 subject evidence commit chain`.
- Fully read norms include `AGENTS.md`, `.github/AGENTS.md`, `development_rules.txt`, `code_critic_invocation_rule.txt`, `code_driven_world_materialization_architecture.md`, `llm_documentation_navigation.md`, `world_base_materialization_table_requirements.md`, `read_only_database_and_graph_architecture.md`, `map_g0_g4_workflow.txt`, the Novgorod `G1_SEMANTIC_CATALOG.md`, and `SCHEMA_REFERENCE.md`.
- The reproducible closure bundle is under `data/world-catalogs/novgorod/spatial-v3/target-materialization-approval/dependency-closure/v1/`. It binds the immutable source, target-specification, and V1.1 approval archives, the historical V1.1 subject commit, and the expanded DDL digest. It contains the exact 11-entry source ledger plus repository provenance, the 49-node G0–G3 parent graph, 32 explicit conservative G3 decisions, 57 editorial categories with digest-bound resolvable anchors, and scene-template counts `17/17/17/51/34/68` with zero stable structures and portals.
- The target-only DDL adds normalized regional basis, selector/applicability, source-pair, topological orientation, connection, entry, and traversal contracts. The deterministic V1.1 physical projection covers every immutable matrix contract and imports only exact version-pinned rows. Existing primary keys are accepted only after full canonical-row equality; mismatches fail and roll back without update, overwrite, upsert, or delete.
- Evidence Chain A preserves `e6be7c0 → 99938a6` as immutable historical intake and accepts `99938a6` only as an ancestor of the current checkout. Chain B reads its binding from the evidence commit itself, requires an evidence-only current HEAD with a sole content parent, and verifies the complete unique path-safe content manifest by raw-byte SHA-256.
- Isolated PostgreSQL evidence applies all DDL from an empty database, imports the dependency closure, rehearses rollback, imports the complete V1.1 physical projection, verifies readback counts/digests, repeats exact-idempotently, and proves mismatch rollback. The test database has an explicit local P12 identity and never uses an operator or production connection.
- Independent data critic verdict: `PASS`. It verified all 57 anchors, 32/32 G3 decisions, source/provenance exactness, reproducibility, and absence of stronger historical or runtime claims. Code-critic re-audit is required before the subject commit. P28 remains blocked and v2 remains the production owner.

## P09 independent DDL critic closure audit (2026-07-20)

- Reviewed commit: `b1939948003ca2775bc22a0cbf75e8f0c557fafd`; scope was
  P09-S01–P09-S04 only. Repository Intelligence was rebuilt at that commit,
  Graphify `0.9.17` was ready, and the knowledge source retained only its
  documented semantic-coverage warning.
- Existing owner evidence passes: `spatial-v3:check-p09` reports all ten P09
  tables in the 185-table schema; `world-db:schema-check` and
  `world-db:schema-doc-check` pass with generated-reference digest
  `c06b4498a3706dcd78dff8c576b4540b05e02cbdf295f4bb6d39b36d5bb1a918`;
  migration tests pass 2/2; isolated PostgreSQL fresh/reapply/negative tests
  pass 1/1.
- Independent negative probes found three uncovered MAJOR defects:
  `grid_east_north_v1` from the target standard is rejected in favor of a
  non-normative hardcoded convention; a second spatial class can commit for
  one node version despite the one-class-plus-facets contract; and the
  migration inventory summary digest is unchanged when one-row inventory
  content changes.
- Persisted critic verdict:
  [`p09-ddl-critic-report.md`](./p09-ddl-critic-report.md) —
  **`CHANGES REQUIRED`**. P09-S04 remains open until a separate implementation
  cycle corrects the findings, adds regression cases, regenerates affected
  target artifacts and receives an independent acceptable re-review.
- The audit used disposable local PostgreSQL only. It changed no DDL, runtime,
  production composition, P10+ implementation or P28 evidence.

### P09 closure re-review (2026-07-21)

- Independent DDL critic result: **`PASS WITH NOTES`**. CRIT-01 canonical grid
  migration, CRIT-02 one-primary-class constraint and CRIT-03 content-sensitive
  inventory digest are closed. Evidence covered captured old-part-12 upgrade,
  unknown-grid and multi-class fail-closed rollback, fresh/reapply, FK/UNIQUE,
  deferred containment negatives, schema-reference generation and P10/P11
  target-only PostgreSQL compatibility checks.
- The unrelated global `AGENTS.md` whitespace diff remains outside P09 scope.
  P12 grid-package reapproval remains separately pending; P09 does not
  self-approve P12 and does not authorize P28 or production activation.

## Historical P12 canonical-grid reapproval package (superseded, 2026-07-20)

- This subsection records an interim fail-closed state. It is superseded by
  the approved dependency-closure package and current P12 completion evidence
  above; its pending/reapproval wording is not the current package status.

- P09 makes `grid_east_north_v1` the canonical target DDL convention. The P12
  dependency-closure generator and `spatial_v3_g1_grid_cells` import dataset
  were repinned from `novgorod_g1_cardinal_grid_v1` to that exact value.
- The generated bundle remains
  `PROPOSED_FOR_P12_DEPENDENCY_CLOSURE`. Its
  `REAPPROVAL_REQUEST.json` records the exact changed contract and digest,
  marks the historical `69b465f… → 690f850…` approval evidence as superseded
  for the changed subject tree, and requires a new independent acceptance plus
  a separate evidence-only binding commit.
- The old `subject-commit-binding.json` is intentionally removed. Therefore
  the repository-level P12 V1.1 verifier remains fail-closed until the new
  subject commit exists and receives independent reapproval. This is not a
  data gap and does not weaken deterministic import validation.
- No P28 or production activation is authorized; v2 remains the production
  owner.

## P14 planning/execution DDL independent critic (2026-07-21)

- Original independent critic result: **`CHANGES REQUIRED`**; final independent
  re-audit: **`PASS`**. The persisted review is
  [`p14-planning-execution-ddl-critic-report.md`](./p14-planning-execution-ddl-critic-report.md).
- Existing P14 static and PostgreSQL tests pass, as do the dependent P09/P13
  PostgreSQL regressions and the generated world schema-reference check. They
  do not prove complete execution-history integrity.
- CRIT-01 is **closed**: every execution-row update increments `state_version`,
  carries an exact matching append-only event/change-set, and retains a non-null current endpoint
  that matches the immutable current plan-step endpoint. Same-status writes
  cannot change lifecycle/final/suspension/abort/supersession fields and can
  advance an ordinal only through the matching `step_completed` causal event.
  The causally typed result/idempotency checks remain in force.
- PostgreSQL regression rejects the original forged same-status update and
  a version-only same-status update; it accepts a valid versioned causal
  `active → active` event and proves nested rollback/reapply preserves exact
  current/history lineage. `spatial-v3:check-p14`, P14/P13/P09 PostgreSQL
  suites pass after remediation; P15 PostgreSQL also passes.
- CRIT-02 is **closed** and makes event/result mapping physical:
  `step_progressed` accepts only positive nonterminal timed activity/traversal
  progress; non-final completed immediate actions use `step_completed`, while
  final completed actions/traversals use `completed`. The isolated suite rejects
  a completed action forged as progress.
- CRIT-03 is **closed** and adds a deferred bidirectional execution/event ledger:
  the contiguous latest event must equal the current execution status,
  `state_version - 1`, current step rule, and `updated_change_set_id`, while
  each execution update requires that exact event. The isolated suite rejects
  an event-only final transition and verifies unchanged current/history state.
- Exact independent re-audit probes covered CRIT-01 direct same-status and
  version-only rejection plus rollback/reapply, CRIT-02 completed-action mapping
  rejection, and CRIT-03 event-only final-transition rejection. **P14-S06 is
  accepted (`PASS`)**. No P28 state or production-owner boundary changed.

## P16/P23 sole-writer remediation (2026-07-21)

- The original P16 critic finding is **fixed and independently re-reviewed
  (`PASS`)**;
  evidence is in [`p16-persistence-critic-report.md`](./p16-persistence-critic-report.md).
- P23 no longer owns a connection/transaction, locks, idempotency lease/settlement,
  change-set insert or `entity_placements` update. It produces one sealed
  `combined_write_plan`; only P16 `CombinedAtomicCommitter` applies it.
- `entity_placements` is now a P16 allowlisted composite-key update, and P23
  validation reruns as an explicit committer recheck after the P16 lock order.
  The test suite proves replay, rollback and carrier-local/inverse-order
  concurrency through that path.
- Completed local checks: `spatial-v3:test-p16` (6/6),
  `spatial-v3:test-p23` (8/8), `spatial-v3:test-p23-postgres` (1/1),
  `spatial-v3:test-p16-committer-postgres` (1/1), P14/P15 PostgreSQL (1/1
  each), P14/P15/P16/P23 gates and `architecture:check`.
- P16-S05 is accepted for this remediation scope. No P28 state or v2
  production-owner boundary changed.

## P23 sealed-plan evidence (2026-07-21)

- `createSpatialV3P23DomainRepository()` is an explicit read/recheck port.
  It performs no target-v3 DML or transaction control; it cannot lease
  idempotency, create a change set or update a placement.
- `createSpatialV3DomainMutationService()` validates its persisted snapshot,
  seals the single approved `entity_placements` update plus change-set append,
  and passes that plan to the injected P16 committer. An injected approval
  verifier is mandatory and rejection stops before commit. The same validation is
  rerun in the committer transaction after ordered locks; a replay is returned
  before stale-version revalidation.
- The PostgreSQL evidence uses disposable Docker PostgreSQL and covers normal
  commit/replay, invalid schedule/access/template/capacity rollback,
  carrier-local root slice pins, and inverse actor/transport lock ordering.
