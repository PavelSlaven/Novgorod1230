# world_base schema map (v17)

What: every table of the v17 `world_base` DDL (208 tables), grouped by game domain, with
content columns, row count in docker `world_db`, row count in the v17 database and the v17
import stage that writes it. Purpose: show which game-content tables exist, which are filled,
and which are empty, before the game base is built.

## Files

| file | content |
|---|---|
| `world_base_tables.csv` | one row per DDL table (208). Columns below. |
| `summary.json` | counts by domain and kind, filled/empty lists, category breakdown, table-set differences |
| `ddl-columns.json` | parsed DDL: table -> file, columns |
| `scripts/parse-ddl.cjs` | parses `infra/world-base/schema/*.sql` (CREATE TABLE + ALTER TABLE ADD COLUMN) |
| `scripts/build-schema-map.cjs` | builds everything above; read-only; `node scripts/build-schema-map.cjs .` |

CSV columns: `table, domain, kind, note, ddl_file, content_columns` (all columns minus
meta: id, slug, status, confidence, sources, audit_notes, digests, versions, timestamps,
game_use, limits), `world_db_rows`, `v17_rows_attested_snapshot`,
`v17_rows_added_after_snapshot`, `v17_import_stages`, `v17_imported`, `empty_in_v17`.

`kind`: `content` (templates, catalogs, regional permissions, profiles, pools, rules, limits,
schedules), `world_instance` (authored concrete world: places, figures, anchors),
`spatial_structure` (graph/topology), `provenance_infra`, `migration_evidence`,
`legacy_deprecated`. Domain and kind are a manual classification (table name + columns +
contract), listed in the script.

## Sources and method

- DDL: `Novgorod-runtime/infra/world-base/schema/01..26.sql` (PR #98 worktree), 208 tables.
- Contracts: `data/knowledge-source/corpus/DOCUMENTS/world_base_materialization_table_requirements.md`
  (v2 table purpose, now migration/rollback source) and
  `spatial_v3_target_world_base_materialization_table_requirements.md` (production v3).
- `world_db_rows`: live `SELECT count(*)` in docker `world-base-postgres-1` / `world_db`.
  That database is the old gate1 seed (30 tables, 42 577 rows, same as
  `runtime-catalog/gate1-owner-data-v1` seed closure) on an older DDL. It is not v17.
- `v17_rows_attested_snapshot`: `readback.table_counts` of
  `live-world-runtime-v17/appearance-transfer-v3-v17-import-execution-attestation.json`
  (target `novgorod_world_v17`). The v17 database itself lives in the Codex MSIX LocalCache
  and was not opened here.
- `v17_import_stages`: from `scripts/bootstrap-live-world-v17.mjs` order: gate1 seed
  (seed-closure candidate), gate1 item/container datasets (source-record-reconciliation
  candidate), P12 (`m2c-p12-v17-after-gate1-v1/request.json` expected_readback.by_table),
  open-capacity v2 manifest, additional-start owner rows, appearance v3, item catalog import
  (`procedural_scene_compiled_records`), actor import.
- `v17_rows_added_after_snapshot`: the snapshot has no capacity-v2 or owner rows
  (e.g. `spatial_v3_scene_templates`=17, `spatial_v3_g4_npc_composition_bindings`=33 = P12 only).
  The column adds the capacity-v2 version-2 rows and owner rows counted from their files.
  `procedural_scene_compiled_records` count is not attested (at least the 64 nature-successor records).

## Counts (from summary.json)

- DDL tables 208; kinds: content 154, spatial_structure 26, provenance_infra 18, world_instance 5,
  migration_evidence 3, legacy_deprecated 2.
- world_db (docker): 31 non-empty tables (30 seed + schema_migrations).
- v17: 122 non-empty in the snapshot, 123 imported by the bootstrap.
- Content tables empty in v17: 60 of 154.
- universal_categories in v17: 465, only for domains item (263), container (100),
  actor_appearance (42), spatial_materialization/structure (60). region_category_options: 404
  (item 262, container 100, actor_appearance 42).

## Main findings

1. Empty content domains in v17 (0 rows): names (`region_name_pools`, `_entries`), economy
   (`region_economy`, `price_bands`), law (`region_laws`), religion (`religious_context`),
   knowledge/rumors (4 tables), risks/conflicts (2), weather (`weather_profiles`), time and
   schedules (`seasonal_rules`, `region_activity_profiles`, `region_schedule_profiles`,
   `temporal_authoring_records`), history (`historical_events`, `_phases`, `historical_figures`),
   material culture (`region_material_culture`, `location_object_rules`), clothing
   (`region_clothing_profiles`), transport (`transport_templates`), decisions/LLM (5 tables),
   v2 NPC line (`region_npc_*`, behavior, relationship).
2. No table exists for flora/fauna species, food/dishes, crafts/processes or health/diseases.
   Nature in v17 = 70 landscape + 41 water templates with regional permissions, and G4 natural
   baseline/presentation JSON payloads in `procedural_scene_compiled_records`.
   Food, disease and clothing effects exist only as columns of the empty `seasonal_rules`;
   crafts only as `region_economy.production_method` (empty) and temporal activity profiles.
3. `temporal_authoring_records` is 0 in the v17 snapshot and is not written by
   `bootstrap-live-world-v17.mjs`, but `target-authored-start-runtime.js` requires an approved
   calendar record there (`SPATIAL_V3_TARGET_START_TEMPORAL_REQUIRED`). Source data exists:
   `data/world-catalogs/novgorod/temporal-v4/datasets` (22 records), importer
   `tools/temporal-v4/import-approved-data.mjs`. Must be checked in the real v17 DB.
4. v17 lost rows the v16 DB had: all `spatial_v3_traversal_*` (risk, hazards, checks,
   availability), `spatial_v3_visibility_link_templates` (4), transition contracts,
   boundary crossings. See `readback.old_database_snapshots` in the same attestation.
5. Filled content is thin and item-centric: 102 item templates, 18 containers, 9 buildings,
   9 rooms, 64 place templates, 71 regional social roles, 68 regional occupations, 12 skills,
   1 demographic profile, 1 appearance profile (36 entries), 1 equipment profile (1 entry),
   48 v3 NPC runtime profiles.
6. v2 tables keyed by concrete `graph_node_id` (`g4_*_materialization_rules`) are rollback
   sources by contract §8; the M2c presence-rule table of contract §8.1 has no DDL yet.

## Known gaps of this map

- The v17 database was not queried; its counts come from the attested snapshot plus file
  counts. Stages after appearance (item catalog, actor profiles, catalog ledger) are not
  counted per table.
- 7 tables made by bootstrap migrations are outside the 208 DDL (catalog ledger,
  `schema_migrations`, `actor_base_attribute_profiles`); listed in `summary.json` `extra`.
- Whether the v17 runtime reads a table is not checked here.
