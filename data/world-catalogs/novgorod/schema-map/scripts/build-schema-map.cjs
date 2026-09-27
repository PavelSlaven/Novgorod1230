// Build world_base schema map: every v17 DDL table -> domain, kind, content columns,
// row count in docker world_db, row count in v17 (attested snapshot), v17 import stage.
// Read-only. Usage: node build-schema-map.cjs <outDir>
// Inputs (read-only): Novgorod-runtime checkout (DDL, v17 manifests/attestations), docker world_db.
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const RT = 'C:/Users/Slaven/Documents/Novgorod-runtime';
const NOV = `${RT}/data/world-catalogs/novgorod`;
const V17 = `${NOV}/live-world-runtime-v17`;
const outDir = process.argv[2] || path.resolve(__dirname, '..');
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));

// 1. DDL
execFileSync(process.execPath, [path.join(__dirname, 'parse-ddl.cjs'), path.join(outDir, 'ddl-columns.json')]);
const ddl = readJson(path.join(outDir, 'ddl-columns.json'));

// 2. docker world_db counts (gate1 seed baseline, old DDL)
const q = (sql) => execFileSync('docker', ['exec', 'world-base-postgres-1', 'psql', '-U', 'world_admin', '-d', 'world_db', '-Atc', sql], { encoding: 'utf8' });
const dbTables = q("SELECT tablename FROM pg_tables WHERE schemaname='world_base' ORDER BY 1").trim().split(/\r?\n/);
const dbCount = {};
const unionSql = dbTables.map((t) => `SELECT '${t}', count(*) FROM world_base.${t}`).join(' UNION ALL ');
for (const line of q(unionSql).trim().split(/\r?\n/)) { const [t, n] = line.split('|'); dbCount[t] = Number(n); }

// 3. v17 attested per-table snapshot (appearance-v3 execution attestation readback, novgorod_world_v17)
const att = readJson(`${V17}/appearance-transfer-v3-v17-import-execution-attestation.json`);
if (att.target.database !== 'novgorod_world_v17') throw new Error('attestation target mismatch');
const v17Snap = att.readback.table_counts;

// 4. v17 bootstrap stages (scripts/bootstrap-live-world-v17.mjs order)
const stage = {}; const addStage = (t, s, n) => { (stage[t] ||= []).push(n == null ? s : `${s}:${n}`); };
const gate1Seed = readJson(`${NOV}/runtime-catalog/gate1-owner-data-v1/seed-closure-v1/candidate.json`);
JSON.stringify(gate1Seed).replace(/"table":"(\w+)"/g, (_, t) => { addStage(t, 'gate1_seed'); return _; });
const recon = readJson(`${NOV}/runtime-catalog/gate1-owner-data-v1/source-record-reconciliation-v1/candidate.json`);
const findManifest = (o, d = 0) => { if (!o || typeof o !== 'object' || d > 6) return null; if (o.amended_stage3c_manifest) return o.amended_stage3c_manifest; for (const k in o) { const r = findManifest(o[k], d + 1); if (r) return r; } return null; };
for (const ds of findManifest(recon).datasets) addStage(ds.table, 'gate1_item_container', ds.record_count ?? ds.row_count);
const p12 = readJson(`${NOV}/m2c-p12-v17-after-gate1-v1/request.json`);
for (const [t, n] of Object.entries(p12.expected_readback.by_table)) addStage(t, 'p12', n);
const cap = readJson(`${NOV}/m2c-open-capacity-v2-import-manifest.json`);
const capAdded = {};
for (const ds of cap.datasets) {
  const rows = readJson(`${NOV}/${ds.file}`);
  const v2 = rows.filter((r) => Object.entries(r).some(([k, v]) => /version$/.test(k) && Number(v) === 2)).length;
  capAdded[ds.table] = ds.table === 'source_records' ? rows.length : v2;
  addStage(ds.table, 'capacity_v2', capAdded[ds.table]);
}
const owner = { source_records: 2, spatial_v3_authoring_versions: 10, spatial_v3_g4_npc_composition_bindings: 6, spatial_v3_g6_acoustic_baselines: 4 }; // from owner-import.mjs buildAdditionalStartOwnerRows (counted by script run 2026-09-26)
for (const [t, n] of Object.entries(owner)) addStage(t, 'additional_start_owners', n);
const app = readJson(`${V17}/appearance-transfer-v3-v17-import-request.json`);
for (const [t, n] of Object.entries(app.expected_import_readback.by_table)) addStage(t, 'appearance_v3', n);
addStage('procedural_scene_compiled_records', 'item_catalog_import(natural baseline/presentation/placement + nature_successor 64)');

// snapshot ordering: attestation was taken after gate1+p12+appearance, before capacity_v2/owner rows/item import (see README)
const laterAdded = {};
for (const [t, n] of Object.entries(capAdded)) laterAdded[t] = (laterAdded[t] || 0) + n;
for (const [t, n] of Object.entries(owner)) laterAdded[t] = (laterAdded[t] || 0) + n;

// 5. Domain / kind classification (judgment; see README)
const K = { C: 'content', W: 'world_instance', T: 'spatial_structure', P: 'provenance_infra', L: 'legacy_deprecated', M: 'migration_evidence' };
const map = {
  // nature / terrain
  landscape_templates: ['nature', K.C], region_landscape_templates: ['nature', K.C, 'regional permission+weight'],
  water_body_templates: ['nature', K.C], region_water_body_templates: ['nature', K.C, 'regional permission+weight'],
  graph_edge_modifiers: ['nature', K.C, 'terrain/season movement multipliers'],
  procedural_scene_compiled_records: ['nature', K.C, 'compiled JSON payloads: natural baseline/presentation/placement per G4; only nature content imported'],
  // categories registry
  universal_categories: ['categories', K.C, 'generic category registry across domains'], universal_category_relations: ['categories', K.C],
  universal_parameter_definitions: ['categories', K.C], region_category_options: ['categories', K.C, 'regional permission+weight of any category'],
  category_labels: ['categories', K.C, 'names/labels of categories'], category_scheme_mappings: ['categories', K.C], classification_schemes: ['categories', K.C],
  // places / geography
  regions: ['places', K.C], region_neighbors: ['places', K.C], place_templates: ['places', K.C], region_place_templates: ['places', K.C, 'regional permission+weight'],
  region_place_generation_rules: ['places', K.C, 'limits'], place_generation_limits: ['places', K.C, 'limits'],
  land_use_templates: ['places', K.C, 'land use (fields, hayfields, fishing grounds)'], region_land_use_templates: ['places', K.C, 'regional permission+weight'],
  places: ['places', K.W], place_locations: ['places', K.W], graph_scale_rules: ['places', K.C, 'scale G0-G5 rules'],
  graph_nodes: ['places', K.T, 'v2 G0-G4 world graph'], graph_edges: ['places', K.T, 'v2 world graph edges'],
  place_minilocations: ['places', K.L, 'deprecated by contract §13'], scene_anchors: ['places', K.L, 'deprecated by contract §13'],
  // buildings / interiors
  building_templates: ['buildings', K.C], place_buildings: ['buildings', K.W], building_layout_templates: ['buildings', K.C], building_layout_nodes: ['buildings', K.C], building_layout_edges: ['buildings', K.C],
  room_templates: ['buildings', K.C], g4_materialization_profiles: ['buildings', K.C, 'v2 G4->G5 profile'], g4_materialization_bindings: ['buildings', K.C, 'v2'], g4_materialization_layout_edges: ['buildings', K.C, 'v2'],
  g5_minilocation_templates: ['buildings', K.C, 'v2 G5'], g5_anchor_templates: ['buildings', K.C, 'v2 G5'], g5_edge_templates: ['buildings', K.C, 'v2 G5'], materialization_slot_rules: ['buildings', K.C, 'v2 slot min/max'],
  // items
  item_templates: ['items', K.C], item_template_category_bindings: ['items', K.C], item_template_inventory_profiles: ['items', K.C, 'mass/carry'], item_template_quantity_profiles: ['items', K.C],
  item_template_source_bindings: ['items', K.P], item_profile_sets: ['items', K.C], item_profile_entries: ['items', K.C], quantity_unit_definitions: ['items', K.C],
  location_object_rules: ['items', K.C, 'object presence by place/location/building'], region_material_culture: ['items', K.C, 'material culture catalog'],
  g4_item_materialization_rules: ['items', K.C, 'v2 per graph_node presence'], item_classification_migration_inventory: ['items', K.M],
  // containers / property
  container_templates: ['containers', K.C], container_template_facet_bindings: ['containers', K.C], container_template_inventory_profiles: ['containers', K.C], container_template_source_bindings: ['containers', K.P],
  container_content_profiles: ['containers', K.C], container_content_profile_entries: ['containers', K.C], container_content_category_relations: ['containers', K.C],
  g4_container_materialization_rules: ['containers', K.C, 'v2 per graph_node presence'],
  property_profiles: ['property_ownership', K.C], property_profile_rules: ['property_ownership', K.C],
  // clothing / appearance / equipment
  region_appearance_profiles: ['clothing_appearance', K.C], region_appearance_profile_entries: ['clothing_appearance', K.C], region_clothing_profiles: ['clothing_appearance', K.C],
  region_equipment_profiles: ['clothing_appearance', K.C, 'equipment sets by role/occupation'], region_equipment_profile_entries: ['clothing_appearance', K.C],
  // people / social
  social_classes: ['people_social', K.C], social_role_archetypes: ['people_social', K.C], dependency_archetypes: ['people_social', K.C], mobility_archetypes: ['people_social', K.C],
  social_position_archetypes: ['people_social', K.C], class_role_rules: ['people_social', K.C], region_social_roles: ['people_social', K.C], universal_archetype_proposals: ['people_social', K.C, 'proposal queue'],
  region_demographic_profiles: ['people_social', K.C], region_demographic_profile_entries: ['people_social', K.C, 'sex/age weights'],
  region_npc_archetypes: ['people_social', K.C, 'legacy v2 NPC line'], region_npc_profile_sets: ['people_social', K.C, 'legacy v2 NPC line'], region_npc_generation_rules: ['people_social', K.C, 'legacy v2 NPC line'],
  region_behavior_profiles: ['people_social', K.C, 'legacy v2 NPC line'], region_relationship_profiles: ['people_social', K.C, 'legacy v2 NPC line'],
  g4_npc_materialization_rules: ['people_social', K.C, 'v2 per graph_node presence'],
  spatial_v3_npc_runtime_profiles: ['people_social', K.C, 'v3 production NPC profiles (JSON payload)'], spatial_v3_npc_regional_context_profiles: ['people_social', K.C, 'v3'],
  spatial_v3_g4_npc_composition_bindings: ['people_social', K.C, 'v3 NPC presence per G4 (min/max)'],
  // occupations
  occupation_archetypes: ['occupations_skills', K.C], skill_catalog: ['occupations_skills', K.C], occupation_skill_defaults: ['occupations_skills', K.C], role_occupation_rules: ['occupations_skills', K.C], region_occupations: ['occupations_skills', K.C],
  // economy
  region_economy: ['economy', K.C, 'production/resources/goods, incl. crafts'], price_bands: ['economy', K.C],
  // law
  region_laws: ['law', K.C], legal_status_archetypes: ['law', K.C],
  // religion
  religious_context: ['religion', K.C],
  // knowledge / rumors
  region_npc_knowledge: ['knowledge_rumors', K.C], region_knowledge_profiles: ['knowledge_rumors', K.C], graph_edge_knowledge_rules: ['knowledge_rumors', K.C], rumor_templates: ['knowledge_rumors', K.C],
  // names
  region_name_pools: ['names', K.C], region_name_pool_entries: ['names', K.C],
  // time / calendar / schedules
  seasonal_rules: ['time_calendar_schedules', K.C, 'per-season effects incl. food/disease/clothing'], region_activity_profiles: ['time_calendar_schedules', K.C], region_schedule_profiles: ['time_calendar_schedules', K.C],
  temporal_authoring_records: ['time_calendar_schedules', K.C, 'JSON payload families: calendar, activity, weather transition, body-time effects, place access schedule, npc schedule/reaction, historical phase effects'],
  temporal_source_history: ['time_calendar_schedules', K.P], temporal_provenance: ['time_calendar_schedules', K.P], temporal_normalized_references: ['time_calendar_schedules', K.P],
  // weather
  weather_profiles: ['weather', K.C],
  // history
  historical_events: ['history_events', K.C], historical_event_phases: ['history_events', K.C], historical_figures: ['history_events', K.W], historical_anchors: ['history_events', K.W, 'historical places/landmarks'],
  // risks / conflicts
  region_risks: ['risks_conflicts', K.C], conflict_templates: ['risks_conflicts', K.C],
  // transport / movement
  route_templates: ['transport_movement', K.C], transport_templates: ['transport_movement', K.C],
  // decisions / LLM
  decision_command_catalog: ['decisions_llm', K.C], decision_policy_profiles: ['decisions_llm', K.C], decision_policy_options: ['decisions_llm', K.C],
  llm_context_packs: ['decisions_llm', K.C], llm_validation_rules: ['decisions_llm', K.C], region_gaps: ['decisions_llm', K.P, 'known data gaps registry'],
  // provenance / infra
  source_records: ['provenance', K.P, 'bibliographic sources'], record_sources: ['provenance', K.P], audit_log: ['provenance', K.P], world_revisions: ['provenance', K.P],
  catalog_imports: ['provenance', K.P], catalog_import_tables: ['provenance', K.P],
};
const spatialDomain = (t) => {
  if (/traversal|movement_method|transition_environment|dynamic_recheck|activity_contracts|action_contracts|movement_mode|recovery_transition/.test(t)) return ['transport_movement', K.C, 'v3 movement cost/risk/check rules'];
  if (/scene_|g6_|portal|stable_structure|visibility_link|acoustic|position|local_movement|regional_scene_template_bases/.test(t)) return ['scenes_g5_g6', K.C, 'v3 scene templates (places interior)'];
  if (/expansion|g5_generation|frontier|terminal_policies|continuation_length/.test(t)) return ['scenes_g5_g6', K.C, 'v3 G4->G5 expansion/capacity'];
  if (/world_revisions|authoring_versions|dependency_edges|controlled_vocabulary|external_dependency|approved_physical_source/.test(t)) return ['provenance', K.P];
  if (/migration/.test(t)) return ['provenance', K.M];
  return ['places', K.T, 'v3 world topology'];
};
const META = new Set(['created_at', 'updated_at', 'status', 'confidence', 'sources', 'audit_notes', 'canonical_digest', 'provenance_ref', 'world_revision_id', 'entity_kind', 'version', 'deprecated_at', 'review_status', 'id', 'slug', 'game_use', 'limits']);

const rows = Object.entries(ddl).map(([t, v]) => {
  const [domain, kind, note = ''] = map[t] || (t.startsWith('spatial_v3_') ? spatialDomain(t) : ['UNCLASSIFIED', '?']);
  const v17 = v17Snap[t];
  const later = laterAdded[t] || 0;
  const imported = (stage[t] || []).length > 0;
  return {
    table: t, domain, kind, note, ddl_file: v.file,
    content_columns: v.columns.filter((c) => !META.has(c)).join(' '),
    world_db_rows: dbCount[t] ?? null,
    v17_rows_attested_snapshot: v17 ?? null,
    v17_rows_added_after_snapshot: later,
    v17_import_stages: (stage[t] || []).join('; '),
    v17_imported: imported ? 'yes' : 'no',
    empty_in_v17: (v17 ?? 0) + later === 0 && !imported ? 'EMPTY' : '',
  };
}).sort((a, b) => a.domain.localeCompare(b.domain) || a.table.localeCompare(b.table));

const csvEsc = (x) => { const s = x == null ? '' : String(x); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const cols = Object.keys(rows[0]);
fs.writeFileSync(path.join(outDir, 'world_base_tables.csv'), '\ufeff' + [cols.join(','), ...rows.map((r) => cols.map((c) => csvEsc(r[c])).join(','))].join('\n') + '\n');

const byDomain = {};
for (const r of rows) {
  const d = (byDomain[r.domain] ||= { tables: 0, content_tables: 0, content_empty_in_v17: 0, v17_rows: 0, world_db_rows: 0, empty: [], filled: [] });
  d.tables++; d.world_db_rows += r.world_db_rows || 0; d.v17_rows += (r.v17_rows_attested_snapshot || 0) + r.v17_rows_added_after_snapshot;
  if (r.kind === K.C) { d.content_tables++; if (r.empty_in_v17) d.content_empty_in_v17++; }
  (r.empty_in_v17 ? d.empty : d.filled).push(r.empty_in_v17 ? r.table : `${r.table}=${(r.v17_rows_attested_snapshot || 0) + r.v17_rows_added_after_snapshot}`);
}
const extra = {
  not_in_ddl_but_in_v17: 'catalog_baseline_registrations, domain_catalog_revisions, catalog_import_records, catalog_import_dependency_assertions, runtime_catalog_activation_events, schema_migrations, actor_base_attribute_profiles (added by tools/runtime-catalog-activation/migrations/world/001,002 during bootstrap; infra except actor_base_attribute_profiles = people content, profile novgorod_ordinary_actor_base_attributes_v1)',
  world_db_docker_tables_not_in_v17_ddl: dbTables.filter((t) => !ddl[t]),
  v17_ddl_tables_missing_in_world_db_docker: Object.keys(ddl).filter((t) => !dbTables.includes(t)),
};
// universal_categories / region_category_options imported into v17, by domain (gate1 + p12 + appearance files)
const catFiles = [`${RT}/data/knowledge-source/imports/item-container-120-v5/candidate/tables/universal_categories.json`,
  `${NOV}/spatial-v3/candidates/m2c-g4-expansion-v1/datasets/universal_categories.json`,
  `${V17}/appearance-transfer-v3-datasets/universal_categories.json`];
const cats = new Map();
for (const f of catFiles) for (const c of readJson(f)) cats.set(c.id, c);
const catByDomain = {};
for (const c of cats.values()) { const k = `${c.domain}/${c.facet ?? '-'}`; catByDomain[k] = (catByDomain[k] || 0) + 1; }
const optFiles = [`${RT}/data/knowledge-source/imports/item-container-120-v5/candidate/tables/region_category_options.json`,
  `${V17}/appearance-transfer-v3-datasets/region_category_options.json`];
const optByDomain = {};
for (const f of optFiles) for (const o of readJson(f)) { const c = cats.get(o.category_id); const k = c ? c.domain : 'unknown'; optByDomain[k] = (optByDomain[k] || 0) + 1; }
extra.universal_categories_v17 = { distinct: cats.size, by_domain_facet: Object.fromEntries(Object.entries(catByDomain).sort()) };
extra.region_category_options_v17_by_category_domain = optByDomain;

const summary = { generated_by: 'scripts/build-schema-map.cjs', ddl_tables: rows.length,
  world_db_nonempty_tables: Object.values(dbCount).filter((n) => n > 0).length,
  v17_nonempty_tables_snapshot: Object.values(v17Snap).filter((n) => n > 0).length,
  v17_tables_imported: rows.filter((r) => r.v17_imported === 'yes').length,
  content_tables: rows.filter((r) => r.kind === K.C).length,
  content_tables_empty_in_v17: rows.filter((r) => r.kind === K.C && r.empty_in_v17).length,
  by_kind: rows.reduce((a, r) => ((a[r.kind] = (a[r.kind] || 0) + 1), a), {}),
  by_domain: byDomain, extra };
fs.writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify(summary, null, 1) + '\n');
console.log(JSON.stringify({ ...summary, by_domain: Object.fromEntries(Object.entries(byDomain).map(([k, v]) => [k, { tables: v.tables, content: v.content_tables, content_empty: v.content_empty_in_v17, v17_rows: v.v17_rows }])) }, null, 1));
