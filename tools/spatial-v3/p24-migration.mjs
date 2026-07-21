import { createHash } from 'node:crypto';

const ACTIONS = new Set(['keep', 'reclassify', 'convert', 'migrate', 'deprecate', 'hard_gap']);
const REVIEW = new Set(['reviewed', 'blocked']);
const JOURNEY = new Set(['reconstructable', 'safe_explicit_anchor', 'ambiguous']);
// P24 is deliberately an enumerated migration, not a "copy every spatial_* row"
// mechanism.  Adding a target table requires an explicit source adapter and an
// invariant below; a prefix match would silently turn future authoring tables into
// a migration surface.
const WORLD_TABLES = new Set([
  'spatial_v3_world_revisions', 'spatial_v3_authoring_versions',
  'spatial_v3_nodes', 'spatial_v3_node_parents', 'spatial_v3_node_classes',
  'spatial_v3_g1_grid_cells', 'spatial_v3_g4_directional_exits',
  'spatial_v3_orientation_reference_frames', 'spatial_v3_movement_orientation_profiles',
  'spatial_v3_transition_environment_profiles', 'spatial_v3_movement_method_cost_profiles', 'spatial_v3_dynamic_recheck_policies',
  'spatial_v3_world_routes', 'spatial_v3_world_route_points',
  'spatial_v3_world_route_segments', 'spatial_v3_world_route_segment_spatial_contexts',
  'spatial_v3_world_route_endpoint_bindings', 'spatial_v3_g4_expansion_profiles',
  'spatial_v3_g5_generation_templates', 'spatial_v3_terminal_policies', 'spatial_v3_expansion_slots', 'spatial_v3_expansion_slot_templates', 'spatial_v3_expansion_profile_template_limits', 'spatial_v3_g5_successor_frontier_rules',
  'spatial_v3_scene_templates', 'spatial_v3_scene_materialization_profiles',
  'spatial_v3_scene_materialization_candidates', 'spatial_v3_g6_template_slots',
  'spatial_v3_scene_position_templates', 'spatial_v3_scene_endpoint_slots'
]);
const PARTY_TABLES = new Set(['party_g5_sites', 'party_scene_baselines', 'party_g6_instances', 'scene_position_nodes', 'entity_placements', 'party_entity_controls', 'party_npc_spatial_schedules', 'party_containers', 'party_items', 'party_item_placements', 'party_ownership', 'party_route_plans', 'party_route_plan_steps', 'party_route_plan_executions', 'party_route_plan_execution_events', 'traveller_travel_states', 'party_route_anchor_identities', 'party_route_anchor_location_bindings']);
const canonicalize = (value) => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  return value;
};
const digest = (value) => createHash('sha256').update(JSON.stringify(canonicalize(value))).digest('hex');
const issue = (code, subject_ref) => Object.freeze({ code, subject_ref });
const text = (value) => typeof value === 'string' && value.trim() !== '';
const freeze = (value) => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
};

const WORLD_CHAIN = Object.freeze([
  ['world_revision', ['spatial_v3_world_revisions']],
  ['g0_g5', ['spatial_v3_authoring_versions', 'spatial_v3_nodes', 'spatial_v3_node_classes', 'spatial_v3_node_parents']],
  ['g1_grid', ['spatial_v3_g1_grid_cells']],
  ['g4_exit', ['spatial_v3_g4_directional_exits']],
  ['profiles', ['spatial_v3_orientation_reference_frames', 'spatial_v3_movement_orientation_profiles', 'spatial_v3_transition_environment_profiles', 'spatial_v3_movement_method_cost_profiles', 'spatial_v3_dynamic_recheck_policies']],
  ['routes', ['spatial_v3_world_routes', 'spatial_v3_world_route_points', 'spatial_v3_world_route_segments', 'spatial_v3_world_route_segment_spatial_contexts', 'spatial_v3_world_route_endpoint_bindings']],
  ['templates', ['spatial_v3_g4_expansion_profiles', 'spatial_v3_g5_generation_templates', 'spatial_v3_expansion_slots', 'spatial_v3_expansion_slot_templates', 'spatial_v3_scene_templates', 'spatial_v3_scene_materialization_profiles', 'spatial_v3_scene_materialization_candidates']]
]);
const PARTY_CHAIN = Object.freeze([
  ['g5_scene_position', ['party_scene_baselines', 'party_g6_instances', 'scene_position_nodes']],
  ['dynamic_entities', ['entity_placements', 'party_entity_controls', 'party_npc_spatial_schedules', 'party_containers', 'party_items', 'party_item_placements', 'party_ownership']],
  ['journey_pgc', ['party_route_plans', 'party_route_plan_steps', 'party_route_plan_executions', 'traveller_travel_states']],
  ['approved_anchor', ['party_route_anchor_identities', 'party_route_anchor_location_bindings']]
]);

// These are deliberately *legacy source* relations, not a caller supplied
// `source_table` escape hatch.  P24 can only read this finite, reviewed v2
// surface.  The readers serialize every row before any target mapping is
// accepted, so the source digest is evidence over actual database records.
export const V2_WORLD_SOURCE_TABLES = Object.freeze([
  'graph_scale_rules','graph_edge_modifiers','landscape_templates','water_body_templates','route_templates','land_use_templates','place_templates','source_records',
  'regions','region_landscape_templates','region_water_body_templates','region_land_use_templates','region_place_templates','region_neighbors','region_laws','region_economy',
  'social_classes','social_role_archetypes','legal_status_archetypes','dependency_archetypes','mobility_archetypes','social_position_archetypes','class_role_rules','occupation_archetypes',
  'skill_catalog','occupation_skill_defaults','role_occupation_rules','universal_archetype_proposals','region_social_roles','region_occupations','region_place_generation_rules','region_material_culture',
  'region_risks','conflict_templates','rumor_templates','price_bands','seasonal_rules','religious_context','region_npc_knowledge','region_npc_generation_rules',
  'place_generation_limits','llm_context_packs','llm_validation_rules','region_gaps','places','graph_nodes','graph_edges','historical_anchors','historical_events','historical_figures','place_locations','place_minilocations','scene_anchors','place_buildings','historical_event_phases','item_templates',
  'building_templates','location_object_rules','weather_profiles','graph_edge_knowledge_rules','record_sources','audit_log','world_revisions','universal_categories','universal_category_relations','classification_schemes','category_labels','category_scheme_mappings','universal_parameter_definitions','region_category_options','decision_command_catalog','decision_policy_profiles','decision_policy_options','region_npc_archetypes','region_demographic_profiles','region_name_pools','region_name_pool_entries','region_appearance_profiles','region_clothing_profiles','region_equipment_profiles','region_equipment_profile_entries','region_knowledge_profiles','region_behavior_profiles','region_activity_profiles','region_schedule_profiles','region_npc_profile_sets',
  'room_templates','building_layout_templates','building_layout_nodes','building_layout_edges','g5_minilocation_templates','g5_anchor_templates','g5_edge_templates','g4_materialization_profiles','g4_materialization_bindings','materialization_slot_rules','g4_materialization_layout_edges','container_templates','item_profile_sets','item_profile_entries','container_content_profiles','container_content_profile_entries','item_template_category_bindings','item_template_inventory_profiles','item_template_source_bindings','container_template_source_bindings','quantity_unit_definitions','item_template_quantity_profiles','container_template_inventory_profiles','container_template_facet_bindings','container_content_category_relations','item_classification_migration_inventory','property_profiles','property_profile_rules','transport_templates','g4_npc_materialization_rules','g4_item_materialization_rules','g4_container_materialization_rules','catalog_imports','catalog_import_tables'
]);
export const V2_PARTY_SOURCE_TABLES = Object.freeze([
  'delivery_attempts','delivery_acknowledgements','commit_idempotency','parties','party_server_sessions','party_state_snapshots','party_positions','party_player_characters','party_character_knowledge','party_materialization_runs','party_materialization_choices','party_g5_nodes','party_g5_anchors','party_g5_edges','party_npcs','party_npc_traits','party_npc_relations','party_npc_knowledge','party_npc_schedules','party_containers','party_items','party_item_placements','party_ownership','party_decision_requests','party_decision_options','party_decision_results','party_change_sets','party_autonomous_updates','party_visible_read_models'
]);

async function relationExists(client, schema, relation) {
  const { rows } = await client.query('SELECT to_regclass($1) AS name', [`${schema}.${relation}`]);
  return rows[0]?.name !== null;
}
async function readEnumeratedV2Rows(pool, schema, tables, sourceScope, { party_id = null, world_revision_id = null } = {}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN READ ONLY');
    const records = [];
    for (const table of tables) {
      if (!(await relationExists(client, schema, table))) continue;
      const relation = `${schema}.${table}`;
      let sql = `SELECT to_jsonb(t) AS payload FROM ${relation} t`;
      const values = [];
      if (party_id) {
        if (table === 'commit_idempotency') {
          sql += ' WHERE EXISTS (SELECT 1 FROM party_runtime.party_server_sessions s WHERE s.party_id=$1 AND s.request_id=t.request_id)'; values.push(party_id);
        } else {
          sql += " WHERE to_jsonb(t) ? 'party_id' AND t.party_id=$1"; values.push(party_id);
        }
      }
      if (world_revision_id) {
        sql += `${values.length ? ' AND' : ' WHERE'} to_jsonb(t) ? 'world_revision_id' AND t.world_revision_id=$${values.length + 1}`;
        values.push(world_revision_id);
      }
      sql += ' ORDER BY 1';
      const { rows } = await client.query(sql, values);
      rows.forEach(({ payload }, index) => {
        const payloadDigest = digest(payload);
        const identity = `${relation}:${payload.id ?? payload.party_id ?? index}:${payloadDigest}`;
        records.push(Object.freeze({ source_identity: identity, source_table: relation, source_digest: payloadDigest, pin_mapping: `legacy:${relation}:${payloadDigest}`, evidence: `read_only:${relation}:${payloadDigest}`, payload: freeze(payload) }));
      });
    }
    await client.query('ROLLBACK');
    return buildSpatialV3SourceExtract({ source_scope: sourceScope, adapter_kind: 'enumerated_v2_reader', records, expected_source_ids: records.map((r) => r.source_identity), party_id, world_revision_id, source_tables: tables });
  } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; } finally { client.release(); }
}
export const readV2WorldSource = (pool, { world_revision_id = null } = {}) => readEnumeratedV2Rows(pool, 'world_base', V2_WORLD_SOURCE_TABLES, 'enumerated read-only v2 world source', { world_revision_id });
export const readV2PartySource = (pool, { party_id } = {}) => {
  if (!text(party_id)) throw new TypeError('P24 party source requires one explicit party_id; all-party snapshots need a separate atomic interface');
  return readEnumeratedV2Rows(pool, 'party_runtime', V2_PARTY_SOURCE_TABLES, `enumerated read-only v2 party source:${party_id}`, { party_id });
};

/**
 * A v2 export is read-only input: every source record has its source table/key,
 * content digest and dependency pins.  The caller must state coverage explicitly
 * so an omitted source row becomes a typed hard gap before any target transaction.
 */
export function buildSpatialV3SourceExtract({ source_scope, records = [], expected_source_ids = [], adapter_kind = 'manual_fixture', party_id = null, world_revision_id = null, source_tables = [] } = {}) {
  const errors = []; const seen = new Set();
  if (!text(source_scope)) errors.push(issue('migration_source_scope_missing', 'source_extract'));
  for (const row of records) {
    const ref = row?.source_identity ?? 'unknown';
    if (!row || !text(row.source_identity) || !text(row.source_table) || !text(row.source_digest) || !text(row.pin_mapping) || !text(row.evidence)) errors.push(issue('migration_source_extract_incomplete', ref));
    else if (seen.has(row.source_identity)) errors.push(issue('migration_duplicate_source', row.source_identity));
    seen.add(row?.source_identity);
  }
  for (const sourceId of expected_source_ids) if (!seen.has(sourceId)) errors.push(issue('migration_source_coverage_gap', sourceId));
  const canonical = records.map(({ source_identity, source_table, source_digest, pin_mapping, evidence }) => ({ source_identity, source_table, source_digest, pin_mapping, evidence }));
  return Object.freeze({ ok: errors.length === 0, source_scope, adapter_kind, party_id, world_revision_id, source_tables: Object.freeze([...source_tables]), records: Object.freeze(records), source_digest: digest(canonical), errors: Object.freeze(errors) });
}

function requireSourceRows(rows, extract, errors) {
  const exported = new Map((extract?.records ?? []).map((row) => [row.source_identity, row]));
  for (const row of rows) {
    const source = exported.get(row.source_identity);
    if (!source || source.pin_mapping !== row.pin_mapping || source.evidence !== row.evidence) errors.push(issue('migration_source_pin_gap', row.source_identity));
  }
}

function requireInventorySourceBindings(inventory, targets, extract, errors) {
  const source = new Map((extract?.records ?? []).map((row) => [row.source_identity, row]));
  const mapped = new Map();
  for (const target of targets) {
    if (!mapped.has(target.source_identity)) mapped.set(target.source_identity, []);
    mapped.get(target.source_identity).push(target);
  }
  for (const row of inventory?.records ?? []) {
    if (row.action === 'hard_gap') continue;
    const extractRow = source.get(row.old_identity);
    const targetRowsForIdentity = mapped.get(row.old_identity) ?? [];
    if (!extractRow || extractRow.pin_mapping !== row.pin_mapping || extractRow.evidence !== row.evidence) errors.push(issue('migration_inventory_source_identity_gap', row.old_identity));
    // `keep`/`deprecate` have an explicit immutable source snapshot in the
    // coverage artifact. They do not fabricate a v3 target row merely to make
    // a count look complete.
    if (row.action === 'keep' || row.action === 'deprecate') continue;
    if (!targetRowsForIdentity.length) errors.push(issue('migration_inventory_target_mapping_gap', row.old_identity));
    for (const target of targetRowsForIdentity) if (target.pin_mapping !== row.pin_mapping || target.evidence !== row.evidence) errors.push(issue('migration_inventory_target_identity_gap', row.old_identity));
  }
}

// The extract is the finite source-of-truth for one migration attempt.  Forward
// checks alone are insufficient: they can prove that every supplied inventory
// row has a source, while silently leaving a newly discovered legacy row
// unmapped.  Require a single reviewed inventory disposition for every actual
// reader record before a target transaction is opened.  A `hard_gap` counts as
// a disposition here; acceptance rejects it separately, so it cannot turn into
// a partial write.
function requireInverseInventoryCoverage(inventory, extract, errors) {
  const bySource = new Map();
  for (const row of inventory?.records ?? []) {
    if (!bySource.has(row.old_identity)) bySource.set(row.old_identity, []);
    bySource.get(row.old_identity).push(row);
  }
  for (const source of extract?.records ?? []) {
    const dispositions = bySource.get(source.source_identity) ?? [];
    if (dispositions.length !== 1) errors.push(issue('migration_source_inventory_coverage_gap', source.source_identity));
  }
  for (const row of inventory?.records ?? []) {
    const source = (extract?.records ?? []).find((candidate) => candidate.source_identity === row.old_identity);
    if (!source) errors.push(issue('migration_inventory_source_identity_gap', row.old_identity));
  }
}

function validateChain(rows, chain, errors, subject) {
  const present = new Set(rows.map((row) => row.table));
  for (const [stage, tables] of chain) {
    const touched = tables.some((table) => present.has(table));
    if (!touched) continue;
    // A partial stage is never inferred.  It is safe for a source export to omit a
    // whole stage (e.g. no route), but not to omit a member of a declared chain.
    for (const table of tables) if (!present.has(table)) errors.push(issue('migration_chain_gap', `${subject}:${stage}:${table}`));
  }
}

/**
 * P24 deliberately accepts an explicit source extract, never a live v2 reader.
 * That keeps v2 read-only and makes each migration/review input auditable.
 */
export function buildSpatialV3MigrationInventory({ world_records = [], party_records = [] } = {}) {
  const errors = []; const records = [];
  for (const record of [...world_records, ...party_records]) {
    const subject = record?.old_identity ?? 'unknown';
    const required = ['old_identity', 'old_type', 'old_level', 'target_contract', 'action', 'reason', 'evidence', 'pin_mapping', 'review_status'];
    if (!record || typeof record !== 'object' || required.some((key) => !text(record[key]))) { errors.push(issue('migration_inventory_incomplete', subject)); continue; }
    if (!ACTIONS.has(record.action) || !REVIEW.has(record.review_status)) { errors.push(issue('migration_inventory_invalid', subject)); continue; }
    if (record.action === 'hard_gap' && record.review_status !== 'blocked') errors.push(issue('migration_hard_gap_not_blocked', subject));
    if (record.action !== 'hard_gap' && record.review_status !== 'reviewed') errors.push(issue('migration_mapping_not_reviewed', subject));
    records.push(Object.freeze({ ...record, source_kind: world_records.includes(record) ? 'world' : 'party' }));
  }
  const duplicate = new Set(); for (const row of records) { if (duplicate.has(row.old_identity)) errors.push(issue('migration_duplicate_source', row.old_identity)); duplicate.add(row.old_identity); }
  return Object.freeze({ ok: errors.length === 0, records: Object.freeze(records), errors: Object.freeze(errors), source_digest: digest(records), target_digest: digest(records.map(({ old_identity, target_contract, action, pin_mapping }) => ({ old_identity, target_contract, action, pin_mapping }))) });
}

/**
 * Turns a finite, actual v2 read into a reviewable one-row-per-source inventory.
 * A missing review is deliberately a blocked hard gap, so expanding a legacy
 * table cannot become an invisible migration omission.
 */
export function buildSpatialV3MigrationInventoryFromSource({ source_extract, reviewed_records = [] } = {}) {
  const reviewed = new Map((reviewed_records ?? []).map((row) => [row?.old_identity, row]));
  const world_records = []; const party_records = [];
  for (const source of source_extract?.records ?? []) {
    const supplied = reviewed.get(source.source_identity);
    const record = supplied ?? {
      old_identity: source.source_identity,
      old_type: source.source_table,
      old_level: 'legacy_unclassified',
      target_contract: 'unreviewed_v2_source',
      action: 'hard_gap',
      reason: 'No reviewed P24 mapping exists for this actual v2 source row.',
      evidence: source.evidence,
      pin_mapping: source.pin_mapping,
      review_status: 'blocked'
    };
    const normalized = { ...record, old_identity: source.source_identity, evidence: source.evidence, pin_mapping: source.pin_mapping };
    if (String(source.source_table).startsWith('world_base.')) world_records.push(normalized); else party_records.push(normalized);
  }
  return buildSpatialV3MigrationInventory({ world_records, party_records });
}

export function buildSpatialV3MigrationCoverageArtifact({ source_extract, inventory, target_digest, party_id = null, world_revision_id = null } = {}) {
  const acceptance = validateSpatialV3MigrationAcceptance(inventory ?? { records: [], errors: [], source_digest: '', target_digest: '' });
  const scopeParty = party_id ?? source_extract?.party_id ?? null;
  const scopeRevision = world_revision_id ?? source_extract?.world_revision_id ?? null;
  const payload = {
    artifact_kind: 'spatial_v3_migration_coverage_v1',
    party_id: scopeParty,
    world_revision_id: scopeRevision,
    source_scope: source_extract?.source_scope ?? null,
    source_digest: source_extract?.source_digest ?? null,
    source_record_count: source_extract?.records?.length ?? 0,
    inventory_digest: inventory?.source_digest ?? null,
    inventory_target_digest: inventory?.target_digest ?? null,
    target_digest: target_digest ?? null,
    acceptance_ok: acceptance.ok,
    error_codes: acceptance.errors.map((error) => error.code),
    source_snapshot: (source_extract?.records ?? []).map(({ source_identity, source_table, source_digest, pin_mapping, evidence, payload: rowPayload }) => ({ source_identity, source_table, source_digest, pin_mapping, evidence, payload: rowPayload }))
  };
  return freeze({ ...payload, artifact_id: `p24:${digest(payload)}`, canonical_digest: digest(payload) });
}

export function validateSpatialV3MigrationAcceptance(inventory) {
  const gaps = inventory.records.filter((row) => row.action === 'hard_gap');
  return Object.freeze({ ok: inventory.ok && gaps.length === 0, errors: Object.freeze([...inventory.errors, ...gaps.map((row) => issue('migration_hard_gap', row.old_identity))]), source_digest: inventory.source_digest, target_digest: inventory.target_digest });
}

export function classifyV2PartyG5(record) {
  if (!record || !text(record.id)) return Object.freeze({ ok: false, error: issue('migration_inventory_incomplete', 'party_g5') });
  if (record.classification === 'canonical_projection' && record.canonical_g5_ref && record.pin_mapping) return Object.freeze({ ok: true, classification: record.classification, origin: 'canonical' });
  if (record.classification === 'generated_migration_source' && record.migration_source && record.pin_mapping) return Object.freeze({ ok: true, classification: record.classification, origin: 'generated' });
  return Object.freeze({ ok: false, error: issue('migration_g5_hard_gap', record.id) });
}

export function classifyV2Journey(record) {
  if (!record || !JOURNEY.has(record.classification)) return Object.freeze({ ok: false, error: issue('journey_migration_gap', record?.id ?? 'journey') });
  if (!text(record.source_identity) || !text(record.evidence) || !text(record.pin_mapping)) return Object.freeze({ ok: false, error: issue('journey_migration_gap', record.id) });
  if (record.classification === 'reconstructable' && text(record.segment_id) && text(record.direction_id) && text(record.carrier_id) && Number.isInteger(record.progress_ppm) && record.progress_ppm >= 0 && record.progress_ppm <= 1_000_000) return Object.freeze({ ok: true, mode: 'reconstructable' });
  if (record.classification === 'safe_explicit_anchor' && text(record.anchor_id) && record.anchor_approved === true && text(record.approved_anchor_evidence)) return Object.freeze({ ok: true, mode: 'safe_explicit_anchor' });
  return Object.freeze({ ok: false, error: issue('journey_migration_gap', record.id) });
}

/** Explicit adapters: source payload never becomes authoritative without its reviewed target row and pins. */
export function adaptV2PartyEntities({ npcs = [], items = [], containers = [], positions = [] } = {}) {
  const rows = []; const errors = [];
  const adapt = (records, kind, table) => records.forEach((source) => {
    if (!text(source?.id) || !source.reviewed_target || !text(source.evidence) || !text(source.pin_mapping)) errors.push(issue('migration_entity_hard_gap', `${kind}:${source?.id ?? 'unknown'}`));
    else rows.push(Object.freeze({ table, values: source.reviewed_target, source_identity: `${kind}:${source.id}`, evidence: source.evidence, pin_mapping: source.pin_mapping }));
  });
  adapt(npcs, 'npc', 'party_npc_spatial_schedules'); adapt(items, 'item', 'party_items'); adapt(containers, 'container', 'party_containers'); adapt(positions, 'position', 'entity_placements');
  return Object.freeze({ ok: errors.length === 0, target_rows: Object.freeze(rows), errors: Object.freeze(errors), digest: digest(rows) });
}

export function constructP14JourneyRows(record) {
  const classified = classifyV2Journey(record); if (!classified.ok) return Object.freeze({ ok: false, errors: Object.freeze([classified.error]) });
  if (!Array.isArray(record.reviewed_target_rows) || !record.reviewed_target_rows.length || record.reviewed_target_rows.some((row) => !text(row.table) || !row.values || !text(row.source_identity) || !text(row.pin_mapping))) return Object.freeze({ ok: false, errors: Object.freeze([issue('journey_migration_gap', record.id)]) });
  const required = classified.mode === 'reconstructable' ? ['party_route_plans', 'party_route_plan_steps', 'party_route_plan_executions', 'traveller_travel_states'] : ['party_route_anchor_identities', 'party_route_anchor_location_bindings'];
  if (required.some((table) => !record.reviewed_target_rows.some((row) => row.table === table)) || record.reviewed_target_rows.some((row) => row.source_identity !== record.source_identity || row.pin_mapping !== record.pin_mapping || row.evidence !== record.evidence)) return Object.freeze({ ok: false, errors: Object.freeze([issue('journey_migration_gap', record.id)]) });
  if (classified.mode === 'reconstructable') {
    const travel = record.reviewed_target_rows.find((row) => row.table === 'traveller_travel_states')?.values;
    const step = record.reviewed_target_rows.find((row) => row.table === 'party_route_plan_steps')?.values;
    const segment = step?.static_contract_snapshot?.segment_id ?? step?.static_contract_snapshot?.segment_ref?.entity_id;
    const carrier = travel?.movement_carrier_ref?.entity_id ?? travel?.movement_carrier_ref?.id;
    if (!travel || segment !== record.segment_id || travel.intended_direction_id !== record.direction_id || carrier !== record.carrier_id || travel.segment_progress_ppm !== record.progress_ppm) return Object.freeze({ ok: false, errors: Object.freeze([issue('journey_migration_gap', record.id)]) });
  }
  return Object.freeze({ ok: true, target_rows: Object.freeze(record.reviewed_target_rows), mode: classified.mode });
}

function targetRows(rows, allowed, prefix) {
  const errors = []; const accepted = [];
  for (const row of rows ?? []) {
    if (!row || !text(row.table) || !row.values || typeof row.values !== 'object' || Array.isArray(row.values) || !text(row.source_identity) || !text(row.evidence) || !text(row.pin_mapping)) { errors.push(issue('migration_target_row_incomplete', row?.source_identity ?? 'unknown')); continue; }
    if (!(allowed instanceof RegExp ? allowed.test(row.table) : allowed.has(row.table)) || Object.keys(row.values).length === 0 || Object.keys(row.values).some((key) => !/^[a-z][a-z0-9_]*$/u.test(key))) errors.push(issue('migration_target_row_invalid', row.source_identity));
    else accepted.push(row);
  }
  return { errors, rows: accepted, digest: digest(accepted.map(({ table, values, source_identity, pin_mapping }) => ({ table, values, source_identity, pin_mapping }))) };
}
async function insertRows(client, schema, rows) {
  for (const row of rows) {
    const keys = Object.keys(row.values).sort(); const values = keys.map((key) => row.values[key]);
    await client.query(`INSERT INTO ${schema}.${row.table} (${keys.join(',')}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(',')})`, values);
  }
}

async function persistCoverageArtifact(client, schema, artifact) {
  await client.query(
    `INSERT INTO ${schema}.spatial_v3_migration_coverage_artifacts
      (artifact_id,party_id,world_revision_id,source_scope,source_digest,source_record_count,inventory_digest,inventory_target_digest,target_digest,acceptance_ok,error_codes,source_snapshot,canonical_digest)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
    [artifact.artifact_id, artifact.party_id, artifact.world_revision_id, artifact.source_scope, artifact.source_digest, artifact.source_record_count, artifact.inventory_digest, artifact.inventory_target_digest, artifact.target_digest, artifact.acceptance_ok, artifact.error_codes, artifact.source_snapshot, artifact.canonical_digest]
  );
}

export async function applySpatialV3WorldMigration(pool, { inventory, source_extract, target_rows = [], dry_run = false } = {}) {
  const acceptance = validateSpatialV3MigrationAcceptance(inventory); const targets = targetRows(target_rows, WORLD_TABLES);
  const errors = [...acceptance.errors, ...(source_extract?.errors ?? [])];
  if (source_extract?.adapter_kind !== 'enumerated_v2_reader') errors.push(issue('migration_source_adapter_required', 'world'));
  requireSourceRows(targets.rows, source_extract, errors); requireInverseInventoryCoverage(inventory, source_extract, errors); requireInventorySourceBindings(inventory, targets.rows, source_extract, errors); validateChain(targets.rows, WORLD_CHAIN, errors, 'world');
  if (errors.length) return Object.freeze({ ok: false, errors: Object.freeze(errors) });
  const artifact = buildSpatialV3MigrationCoverageArtifact({ source_extract, inventory, target_digest: targets.digest });
  const client = await pool.connect();
  try { await client.query('BEGIN'); await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`spatial-v3-world-migration:${inventory.source_digest}`]); await insertRows(client, 'world_base', targets.rows); await persistCoverageArtifact(client, 'world_base', artifact); if (dry_run) await client.query('ROLLBACK'); else await client.query('COMMIT'); }
  catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; } finally { client.release(); }
  return Object.freeze({ ok: true, applied: targets.rows.length, dry_run, source_digest: inventory.source_digest, target_digest: targets.digest, coverage_artifact: artifact });
}

/** Applies only a reviewed immutable migration plan to a caller-selected target DB. */
export async function applySpatialV3PartyMigration(pool, { inventory, source_extract, party_id, change_set_id, g5_records = [], journeys = [], target_rows = [], dry_run = false } = {}) {
  const acceptance = validateSpatialV3MigrationAcceptance(inventory);
  const g5 = g5_records.map(classifyV2PartyG5); const journey = journeys.map(constructP14JourneyRows);
  const targets = targetRows([...target_rows, ...journey.filter((x) => x.ok).flatMap((x) => x.target_rows)], PARTY_TABLES); const errors = [...acceptance.errors, ...(source_extract?.errors ?? []), ...g5.filter((x) => !x.ok).map((x) => x.error), ...journey.filter((x) => !x.ok).flatMap((x) => x.errors), ...targets.errors];
  if (source_extract?.adapter_kind !== 'enumerated_v2_reader') errors.push(issue('migration_source_adapter_required', 'party'));
  if (source_extract?.party_id && source_extract.party_id !== party_id) errors.push(issue('migration_party_scope_gap', source_extract.party_id));
  requireSourceRows(targets.rows, source_extract, errors);
  requireInverseInventoryCoverage(inventory, source_extract, errors);
  const g5TargetBindings = g5_records.map((row) => ({ source_identity: row?.source_identity, pin_mapping: row?.pin_mapping, evidence: row?.evidence }));
  requireInventorySourceBindings(inventory, [...targets.rows, ...g5TargetBindings], source_extract, errors); validateChain(targets.rows, PARTY_CHAIN, errors, 'party');
  if (targets.rows.some((row) => ['party_scene_baselines', 'party_g6_instances', 'scene_position_nodes'].includes(row.table)) && g5_records.length === 0) errors.push(issue('migration_chain_gap', 'party:g5_scene_position:party_g5_sites'));
  const sourceRows = new Map((source_extract?.records ?? []).map((row) => [row.source_identity, row]));
  for (const record of g5_records) {
    const source = sourceRows.get(record?.source_identity);
    if (!source || source.pin_mapping !== record.pin_mapping || source.evidence !== record.evidence) errors.push(issue('migration_g5_hard_gap', record?.source_identity ?? record?.id ?? 'party_g5'));
  }
  for (const row of targets.rows) if (Object.hasOwn(row.values, 'party_id') && row.values.party_id !== party_id) errors.push(issue('migration_party_ownership_gap', row.source_identity));
  if (errors.length) return Object.freeze({ ok: false, errors: Object.freeze(errors), source_digest: inventory?.source_digest, target_digest: inventory?.target_digest });
  if (!text(party_id) || !text(change_set_id)) return Object.freeze({ ok: false, errors: Object.freeze([issue('migration_inventory_incomplete', 'party_id/change_set_id')]), source_digest: inventory.source_digest, target_digest: inventory.target_digest });
  const client = await pool.connect();
  try {
    await client.query('BEGIN'); await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`spatial-v3-migration:${inventory.source_digest}`]);
    for (let index = 0; index < g5_records.length; index += 1) {
      const row = g5_records[index]; const classified = g5[index]; const target = row.target_site;
      if (!target || !text(target.id) || !text(target.parent_g4_id)) throw Object.assign(new Error('migration target site is incomplete'), { code: 'migration_inventory_incomplete' });
      if (classified.origin === 'generated' && (![target.generated_template_ref, target.expansion_slot_ref, target.source_frontier_id].every(Boolean) || !Number.isInteger(target.generation_ordinal))) throw Object.assign(new Error('generated migration must preserve exact frontier/template/slot/ordinal'), { code: 'migration_g5_hard_gap' });
      if (!dry_run) await client.query(`INSERT INTO party_runtime.party_g5_sites(id,party_id,origin,parent_g4_id,canonical_g5_ref,generated_template_ref,expansion_slot_ref,source_frontier_id,generation_ordinal,status,state_version,created_change_set_id,updated_change_set_id)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'active',0,$10,$10)`, [target.id, party_id, classified.origin, target.parent_g4_id, classified.origin === 'canonical' ? row.canonical_g5_ref : null, classified.origin === 'generated' ? target.generated_template_ref : null, classified.origin === 'generated' ? target.expansion_slot_ref : null, classified.origin === 'generated' ? target.source_frontier_id : null, classified.origin === 'generated' ? target.generation_ordinal : null, change_set_id]);
    }
    await insertRows(client, 'party_runtime', targets.rows);
    const artifact = buildSpatialV3MigrationCoverageArtifact({ source_extract, inventory, target_digest: targets.digest, party_id });
    await persistCoverageArtifact(client, 'party_runtime', artifact);
    if (dry_run) await client.query('ROLLBACK'); else await client.query('COMMIT');
  }
  catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; } finally { client.release(); }
  return Object.freeze({ ok: true, applied: g5_records.length + targets.rows.length, dry_run, source_digest: inventory.source_digest, target_digest: targets.digest, coverage_artifact: buildSpatialV3MigrationCoverageArtifact({ source_extract, inventory, target_digest: targets.digest, party_id }), g5_classifications: Object.freeze(g5.map((x) => x.classification)), journey_modes: Object.freeze(journey.map((x) => x.mode)) });
}
