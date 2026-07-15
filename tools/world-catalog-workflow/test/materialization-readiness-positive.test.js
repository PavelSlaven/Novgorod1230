import assert from 'node:assert/strict';
import test from 'node:test';
import { assessMaterializationReadiness, assessTravelProfileReadiness, MATERIALIZATION_AUTHORING_TABLES, MATERIALIZATION_FOREIGN_KEYS } from '../src/materialization-readiness.js';
import { digestValue } from '../src/digest.js';

const approved = { status: 'approved' };
const scope = { world_revision_id: 'rev-1', region_id: 'region-1', valid_from: '1220-01-01', valid_to: '1260-12-31' };
const policy = { schema: 'policy_v1', state: 'open' };

function readyFixture() {
  const recordsByTable = {
    regions: [{ id: 'region-1', ...approved }],
    graph_nodes: [{ id: 'g4-1', region_id: 'region-1', ...approved }],
    building_templates: [{ id: 'building-1', ...approved }],
    item_templates: [{ id: 'item-template-1', category_id: 'category-1', ...approved }],
    region_social_roles: [{ id: 'role-1', ...approved }],
    source_records: [{ id: 'source-1', title: 'Verified source' }],
    world_revisions: [{ id: 'rev-1', title: 'Revision 1', catalog_digest: 'a'.repeat(64), ...approved }],
    universal_categories: [{ id: 'category-1', domain: 'materialization', stable_code: 'materialization.category', facet: 'kind', preferred_label: 'Category', definition: 'A test materialization category.', scope_note: 'Test-only fixture.', inclusion_rules: 'Used by the readiness fixture.', exclusion_rules: 'No other meaning.', title: 'Category', ...approved }, { id: 'item-size-1', domain: 'item', stable_code: 'item.size.hand', facet: 'size_band', preferred_label: 'Hand-sized', definition: 'A test packing size band.', scope_note: 'Test-only fixture.', inclusion_rules: 'Used by the readiness fixture.', exclusion_rules: 'No other meaning.', title: 'Hand-sized', ...approved }],
    item_template_category_bindings: [{ id: 'item-size-binding-1', item_template_id: 'item-template-1', category_id: 'item-size-1', binding_kind: 'size_band', packing_slot_cost: 1, packing_bundle_size: 1, ...approved }],
    region_category_options: [{ id: 'option-1', world_revision_id: 'rev-1', region_id: 'region-1', category_id: 'category-1', applicability: { allowed_seasons: ['spring'] }, ...approved }],
    room_templates: [{ id: 'room-1', region_id: 'region-1', room_category_id: 'category-1', access_policy: policy, visibility_policy: policy, ...approved }],
    building_layout_templates: [{ id: 'layout-1', ...scope, building_template_id: 'building-1', ...approved }],
    building_layout_nodes: [
      { id: 'layout-node-1', layout_template_id: 'layout-1', room_template_id: 'room-1', slot_key: 'room-a' },
      { id: 'layout-node-2', layout_template_id: 'layout-1', room_template_id: 'room-1', slot_key: 'room-b' }
    ],
    building_layout_edges: [{ id: 'layout-edge-1', layout_template_id: 'layout-1', from_node_id: 'layout-node-1', to_node_id: 'layout-node-2', passage_category_id: 'category-1', access_policy: policy }],
    g5_minilocation_templates: [{ id: 'g5-node-template-1', category_id: 'category-1', access_policy: policy, visibility_policy: policy, initial_state: { state_version: 1 }, ...approved }],
    g5_anchor_templates: [{ id: 'g5-anchor-template-1', category_id: 'category-1', can_hold_npc: true, can_hold_item: true, can_hold_container: true, npc_capacity: 2, item_capacity: 2, container_capacity: 2, access_policy: policy, visibility_policy: policy, initial_state: { state_version: 1 }, ...approved }],
    g5_edge_templates: [{ id: 'g5-edge-template-1', passage_category_id: 'category-1', access_policy: policy, visibility_policy: policy, initial_state: { state_version: 1 }, ...approved }],
    g4_materialization_profiles: [{ id: 'profile-1', ...scope, layout_template_id: 'layout-1', maximum_g5_nodes: 2, player_start_anchor_slot_key: 'start', visibility_model: policy, access_model: policy, ...approved }],
    g4_materialization_bindings: [{ id: 'binding-1', profile_id: 'profile-1', graph_node_id: 'g4-1', priority: 100, applicability: { allowed_seasons: ['spring'] }, ...approved }],
    materialization_slot_rules: [
      { id: 'slot-node', profile_id: 'profile-1', slot_key: 'main', slot_domain: 'g5_node', min_count: 1, max_count: 1, required: true, g5_minilocation_template_id: 'g5-node-template-1', applicability: { allowed_seasons: ['spring'] }, ...approved },
      { id: 'slot-start', profile_id: 'profile-1', slot_key: 'start', slot_domain: 'anchor', min_count: 1, max_count: 1, required: true, g5_anchor_template_id: 'g5-anchor-template-1', parent_node_slot_key: 'main', entry_role: 'start', applicability: { allowed_seasons: ['spring'] }, ...approved },
      { id: 'slot-exit', profile_id: 'profile-1', slot_key: 'exit', slot_domain: 'anchor', min_count: 1, max_count: 1, required: true, g5_anchor_template_id: 'g5-anchor-template-1', parent_node_slot_key: 'main', entry_role: 'exit', applicability: { allowed_seasons: ['spring'] }, ...approved },
      { id: 'slot-npc', profile_id: 'profile-1', slot_key: 'npc', slot_domain: 'npc', min_count: 1, max_count: 1, required: true, applicability: { allowed_seasons: ['spring'] }, ...approved },
      { id: 'slot-item', profile_id: 'profile-1', slot_key: 'item', slot_domain: 'item', min_count: 1, max_count: 1, required: true, applicability: { allowed_seasons: ['spring'] }, ...approved },
      { id: 'slot-container', profile_id: 'profile-1', slot_key: 'container', slot_domain: 'container', min_count: 1, max_count: 1, required: true, applicability: { allowed_seasons: ['spring'] }, ...approved }
    ],
    g4_materialization_layout_edges: [{ id: 'runtime-edge-1', profile_id: 'profile-1', from_anchor_slot_key: 'start', to_anchor_slot_key: 'exit', g5_edge_template_id: 'g5-edge-template-1', ordinal: 0, ...approved }],
    region_npc_archetypes: [{ id: 'archetype-1', world_revision_id: 'rev-1', region_id: 'region-1', social_role_id: 'role-1', ...approved }],
    region_demographic_profiles: [{ id: 'demographic-1', region_id: 'region-1', demographic_option_id: 'option-1', ...approved }],
    region_appearance_profiles: [{ id: 'appearance-1', region_id: 'region-1', appearance_option_id: 'option-1', ...approved }],
    region_behavior_profiles: [{ id: 'behavior-1', region_id: 'region-1', behavior_option_id: 'option-1', ...approved }],
    region_activity_profiles: [{ id: 'activity-1', region_id: 'region-1', activity_option_id: 'option-1', presence_reason: 'approved place function', graph_node_id: 'g4-1', ...approved }],
    region_npc_profile_sets: [{ id: 'npc-profile-1', world_revision_id: 'rev-1', archetype_id: 'archetype-1', demographic_profile_id: 'demographic-1', appearance_profile_id: 'appearance-1', behavior_profile_id: 'behavior-1', activity_profile_id: 'activity-1', profile_level: 'background', ...approved }],
    item_profile_sets: [{ id: 'item-profile-1', world_revision_id: 'rev-1', region_id: 'region-1', context_domain: 'g4', applicability: { allowed_seasons: ['spring'] }, ...approved }],
    item_profile_entries: [{ id: 'item-entry-1', profile_id: 'item-profile-1', item_template_id: 'item-template-1', slot_key: 'tool', min_quantity: 1, max_quantity: 1, required: true }],
    container_templates: [{ id: 'container-template-1', world_revision_id: 'rev-1', region_id: 'region-1', category_id: 'category-1', capacity: 2, packing_slot_cost: 1, capacity_policy: { version: 1, mode: 'packing_slots', unit: 'packing_slot' }, access_policy: policy, ...approved }],
    g4_npc_materialization_rules: [{ id: 'npc-rule-1', world_revision_id: 'rev-1', graph_node_id: 'g4-1', slot_rule_id: 'slot-npc', npc_profile_set_id: 'npc-profile-1', min_count: 1, max_count: 1, presence_reason: 'approved place function', causal_basis_type: 'place_function', causal_basis_id: 'activity-1', applicability: { allowed_seasons: ['spring'] }, ...approved }],
    g4_item_materialization_rules: [{ id: 'item-rule-1', world_revision_id: 'rev-1', graph_node_id: 'g4-1', slot_rule_id: 'slot-item', item_profile_id: 'item-profile-1', min_count: 1, max_count: 1, economic_basis: 'household', causal_basis_type: 'place_function', causal_basis_id: 'g4-1', applicability: { allowed_seasons: ['spring'] }, ...approved }],
    g4_container_materialization_rules: [{ id: 'container-rule-1', world_revision_id: 'rev-1', graph_node_id: 'g4-1', slot_rule_id: 'slot-container', container_template_id: 'container-template-1', min_count: 1, max_count: 1, causal_basis_type: 'place_function', causal_basis_id: 'g4-1', applicability: { allowed_seasons: ['spring'] }, ...approved }]
  };
  const provenanceTargets = Object.entries(recordsByTable).filter(([table]) => MATERIALIZATION_AUTHORING_TABLES.includes(table) && table !== 'record_sources').flatMap(([table, records]) => records.map((record) => ({ table, id: record.id })));
  recordsByTable.record_sources = provenanceTargets.map(({ table, id }, index) => ({ id: `provenance-${index}`, source_id: 'source-1', target_table: table, target_record_id: id, support_type: 'supports', confidence: 'high' }));
  const manifestTables = Object.keys(recordsByTable).filter((table) => MATERIALIZATION_AUTHORING_TABLES.includes(table));
  const order = dependencyOrders(manifestTables);
  const tables = manifestTables.sort((left, right) => order.get(left) - order.get(right) || left.localeCompare(right)).map((table_name) => ({ table_name, payload_digest: digestValue(recordsByTable[table_name]), record_count: recordsByTable[table_name].length, dependency_order: order.get(table_name) }));
  const manifest = { version: 2, schema: 'world_catalog_import_manifest_v2', world_revision_id: 'rev-1', approval: 'approved', deletion_mode: 'none', provenance: { source_ids: ['source-1'], minimum_confidence: 'high', effective_at: '1230-05-01T00:00:00.000Z', json_schema_version: 'materialization-v2', negative_fixture_evidence: true }, tables };
  return { manifest, recordsByTable };
}

function dependencyOrders(tableNames) {
  const names = new Set(tableNames);
  const dependencies = new Map(tableNames.map((table) => [table, new Set()]));
  for (const [source, , target] of MATERIALIZATION_FOREIGN_KEYS) if (source !== target && names.has(source) && names.has(target)) dependencies.get(source).add(target);
  const memo = new Map();
  const visit = (table, stack = new Set()) => {
    if (memo.has(table)) return memo.get(table);
    if (stack.has(table)) throw new Error(`dependency cycle at ${table}`);
    const next = new Set(stack); next.add(table);
    const value = [...dependencies.get(table)].reduce((maximum, dependency) => Math.max(maximum, visit(dependency, next) + 1), 0);
    memo.set(table, value); return value;
  };
  for (const table of tableNames) visit(table);
  return memo;
}

const permissiveValidators = new Proxy({}, { get: () => () => true });

test('complete approved catalog reconstructs one period-bound runtime G4 materialization bundle', () => {
  const fixture = readyFixture();
  const result = assessMaterializationReadiness({ ...fixture, regionId: 'region-1', g4Id: 'g4-1', historicalYear: 1230, season: 'spring', jsonSchemaValidators: permissiveValidators });
  assert.deepEqual(result.concerns, []);
  assert.equal(result.pass, true);
});

test('readiness blocks missing provenance, invalid JSONB schema, wrong period and ambiguous binding', () => {
  const fixture = readyFixture();
  fixture.recordsByTable.record_sources = fixture.recordsByTable.record_sources.filter((link) => !(link.target_table === 'g5_anchor_templates' && link.target_record_id === 'g5-anchor-template-1'));
  fixture.recordsByTable.g4_materialization_bindings.push({ ...fixture.recordsByTable.g4_materialization_bindings[0], id: 'binding-2' });
  const result = assessMaterializationReadiness({ ...fixture, regionId: 'region-1', g4Id: 'g4-1', historicalYear: 1300, season: 'spring', jsonSchemaValidators: { 'g4_materialization_profiles.visibility_model': () => false } });
  assert.equal(result.pass, false);
  assert.ok(result.concerns.some((value) => value.startsWith('PROVENANCE_NOT_READY:g5_anchor_templates:')));
  assert.ok(result.concerns.some((value) => value.startsWith('JSONB_SCHEMA_INVALID:')));
  assert.ok(result.concerns.some((value) => value.startsWith('G4_BINDING_AMBIGUOUS:')));
  assert.ok(result.concerns.includes('G4_MATERIALIZATION_BINDING_NOT_READY') || result.concerns.some((value) => value.startsWith('REQUIRED_APPROVED_TABLE_EMPTY:')));
});

test('travel profile readiness requires an approved, period-bound route binding and its closed profiles', () => {
  const recordsByTable = {
    regions: [{ id: 'region-1' }],
    source_records: [{ id: 'source-1' }],
    world_revisions: [{ id: 'rev-1', ...approved }],
    travel_pace_profiles: [{ id: 'pace-1', ...scope, source_id: 'source-1', pace_key: 'normal', time_multiplier: 1, fatigue_multiplier: 1, ...approved }],
    travel_navigation_profiles: [{ id: 'navigation-1', ...scope, source_id: 'source-1', navigation_key: 'land', orientation_policy: { schema: 'travel_navigation_policy_v1', rules: { visibility: 'approved' } }, ...approved }],
    travel_rest_profiles: [{ id: 'rest-1', ...scope, source_id: 'source-1', rest_key: 'overnight', minimum_minutes: 480, rest_policy: { schema: 'travel_rest_policy_v1', rules: { shelter: 'approved' } }, ...approved }],
    travel_interruption_profiles: [{ id: 'interruption-1', ...scope, source_id: 'source-1', interruption_source_type: 'weather', interruption_policy: { schema: 'travel_interruption_policy_v1', rules: { cause: 'weather' } }, required: false, ...approved }],
    route_travel_profile_bindings: [{ id: 'route-binding-1', ...scope, route_template_id: 'route-1', pace_profile_id: 'pace-1', navigation_profile_id: 'navigation-1', rest_profile_id: 'rest-1', interruption_profile_id: 'interruption-1', source_id: 'source-1', ...approved }]
  };
  const targets = Object.entries(recordsByTable).filter(([table]) => MATERIALIZATION_AUTHORING_TABLES.includes(table) && table !== 'source_records').flatMap(([table, records]) => records.map((record) => ({ table, id: record.id })));
  recordsByTable.record_sources = targets.map(({ table, id }, index) => ({ id: `link-${index}`, source_id: 'source-1', target_table: table, target_record_id: id, support_type: 'supports', confidence: 'high' }));
  const orders = dependencyOrders(Object.keys(recordsByTable).filter((table) => MATERIALIZATION_AUTHORING_TABLES.includes(table)));
  const tables = [...orders.keys()].sort((left, right) => orders.get(left) - orders.get(right) || left.localeCompare(right)).map((table_name) => ({ table_name, payload_digest: digestValue(recordsByTable[table_name]), record_count: recordsByTable[table_name].length, dependency_order: orders.get(table_name) }));
  const manifest = { version: 2, schema: 'world_catalog_import_manifest_v2', world_revision_id: 'rev-1', approval: 'approved', deletion_mode: 'none', provenance: { source_ids: ['source-1'], minimum_confidence: 'high', effective_at: '1230-05-01T00:00:00.000Z', json_schema_version: 'materialization-v2', negative_fixture_evidence: true }, tables };
  const validators = {
    'travel_navigation_profiles.orientation_policy': () => true,
    'travel_rest_profiles.rest_policy': () => true,
    'travel_interruption_profiles.interruption_policy': () => true
  };
  const ready = assessTravelProfileReadiness({ manifest, recordsByTable, regionId: 'region-1', routeTemplateId: 'route-1', historicalYear: 1230, season: 'spring', jsonSchemaValidators: validators });
  assert.equal(ready.pass, true);
  recordsByTable.route_travel_profile_bindings = [];
  const bindingTable = manifest.tables.find((table) => table.table_name === 'route_travel_profile_bindings');
  bindingTable.record_count = 0;
  bindingTable.payload_digest = digestValue([]);
  const blocked = assessTravelProfileReadiness({ manifest, recordsByTable, regionId: 'region-1', routeTemplateId: 'route-1', historicalYear: 1230, season: 'spring', jsonSchemaValidators: validators });
  assert.equal(blocked.pass, false);
  assert.equal(blocked.concerns.includes('ROUTE_TRAVEL_PROFILE_BINDING_NOT_READY'), true);
});
