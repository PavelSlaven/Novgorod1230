import assert from 'node:assert/strict';
import test from 'node:test';
import { assessEnvironmentFeatureReadiness, MATERIALIZATION_AUTHORING_TABLES, MATERIALIZATION_FOREIGN_KEYS } from '../src/materialization-readiness.js';
import { digestValue } from '../src/digest.js';

const approved = { status: 'approved' };
const scope = { world_revision_id: 'rev-1', region_id: 'region-1', valid_from: '1220-01-01', valid_to: '1260-12-31' };
const category = (id) => ({ id, domain: 'environment', stable_code: `environment.${id}`, facet: 'kind', preferred_label: id, definition: `Test category ${id}.`, scope_note: 'Readiness test fixture.', inclusion_rules: 'Used only by this fixture.', exclusion_rules: 'No other meaning.', title: id, ...approved });

function fixture() {
  const recordsByTable = {
    regions: [{ id: 'region-1' }],
    source_records: [{ id: 'source-1', title: 'Verified source' }],
    world_revisions: [{ id: 'rev-1', title: 'Revision', catalog_digest: 'a'.repeat(64), ...approved }],
    universal_categories: ['landmark', 'cue', 'emitter', 'trace', 'trace_source'].map(category),
    environment_landmark_templates: [{ id: 'landmark-1', ...scope, category_id: 'landmark', public_label_key: 'landmark', icon_key: 'landmark', navigation_value: 'high', distinctiveness: 'high', recognition_difficulty: 'ordinary', morphology_policy: {}, ...approved }],
    environment_landmark_profiles: [{ id: 'landmark-profile-1', ...scope, profile_policy: {}, ...approved }],
    environment_landmark_profile_entries: [{ profile_id: 'landmark-profile-1', template_id: 'landmark-1', weight: 1, required: true }],
    environment_landmark_rules: [{ id: 'landmark-rule-1', ...scope, profile_id: 'landmark-profile-1', min_count: 1, max_count: 1, required: true, weight: 1, ...approved }],
    environment_cue_templates: [{ id: 'cue-1', world_revision_id: 'rev-1', category_id: 'cue', public_label_key: 'cue', icon_key: 'cue', sense: 'sight', base_intensity: 1, recognition_difficulty: 'ordinary', navigation_value: 'none', fading_duration_minutes: 10, expiry_duration_minutes: 20, propagation_policy: { schema: 'environment_cue_propagation_v1', wind_effects: { west: { intensity_multiplier: 1, drift_band: 'eastward' } } }, valid_from: '1220-01-01', valid_to: '1260-12-31', ...approved }],
    environment_emission_rules: [{ id: 'emission-1', ...scope, cue_template_id: 'cue-1', emitter_category_id: 'emitter', source_type: 'hearth', weather_applicability: {}, ...approved }],
    environment_trace_templates: [{ id: 'trace-1', world_revision_id: 'rev-1', category_id: 'trace', public_label_key: 'trace', icon_key: 'trace', recognition_difficulty: 'ordinary', navigation_value: 'none', valid_from: '1220-01-01', valid_to: '1260-12-31', ...approved }],
    environment_decay_profiles: [{ id: 'decay-1', world_revision_id: 'rev-1', readable_at_or_above: 0.7, faint_at_or_above: 0.2, decay_per_minute: 0.01, precipitation_multiplier: 2, decay_policy: { schema: 'environment_decay_policy_v1', weather_multipliers: { clear: 1, rain: 2 } }, ...approved }],
    environment_trace_creation_rules: [{ id: 'trace-rule-1', ...scope, trace_template_id: 'trace-1', decay_profile_id: 'decay-1', source_category_id: 'trace_source', source_kind: 'movement', movement_mode: 'cart', required: true, creation_policy: {}, ...approved }]
  };
  const runtimeTables = ['environment_landmark_templates', 'environment_landmark_profiles', 'environment_landmark_rules', 'environment_cue_templates', 'environment_emission_rules', 'environment_trace_templates', 'environment_decay_profiles', 'environment_trace_creation_rules'];
  recordsByTable.record_sources = runtimeTables.flatMap((table) => recordsByTable[table].map((record) => ({ id: `source:${table}:${record.id}`, source_id: 'source-1', target_table: table, target_record_id: record.id, support_type: 'supports', confidence: 'high' })));
  return { recordsByTable, manifest: manifestFor(recordsByTable) };
}

function manifestFor(recordsByTable) {
  const tables = Object.keys(recordsByTable).filter((table) => MATERIALIZATION_AUTHORING_TABLES.includes(table));
  const orders = dependencyOrders(tables);
  return {
    version: 2, schema: 'world_catalog_import_manifest_v2', world_revision_id: 'rev-1', approval: 'approved', deletion_mode: 'none',
    provenance: { source_ids: ['source-1'], minimum_confidence: 'high', effective_at: '1230-05-01T00:00:00.000Z', json_schema_version: 'environment-v1', negative_fixture_evidence: true },
    tables: tables.sort((left, right) => orders.get(left) - orders.get(right) || left.localeCompare(right)).map((table_name) => ({ table_name, payload_digest: digestValue(recordsByTable[table_name]), record_count: recordsByTable[table_name].length, dependency_order: orders.get(table_name) }))
  };
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
    const order = [...dependencies.get(table)].reduce((maximum, dependency) => Math.max(maximum, visit(dependency, next) + 1), 0);
    memo.set(table, order); return order;
  };
  for (const table of tableNames) visit(table);
  return memo;
}

const validators = {
  'environment_cue_templates.propagation_policy': () => true,
  'environment_emission_rules.weather_applicability': () => true,
  'environment_decay_profiles.decay_policy': () => true
};

test('environment readiness accepts a complete approved and provenance-bound runtime catalog', () => {
  const { manifest, recordsByTable } = fixture();
  const result = assessEnvironmentFeatureReadiness({ manifest, recordsByTable, regionId: 'region-1', historicalYear: 1230, season: 'summer', jsonSchemaValidators: validators });
  assert.equal(result.pass, true);
  assert.deepEqual(result.concerns, []);
});

test('environment readiness hard-blocks an empty landmark profile and unproven decay policy', () => {
  const { recordsByTable } = fixture();
  recordsByTable.environment_landmark_profile_entries = [];
  recordsByTable.record_sources = recordsByTable.record_sources.filter((record) => record.target_record_id !== 'decay-1');
  const result = assessEnvironmentFeatureReadiness({ manifest: manifestFor(recordsByTable), recordsByTable, regionId: 'region-1', historicalYear: 1230, season: 'summer', jsonSchemaValidators: validators });
  assert.equal(result.pass, false);
  assert.ok(result.concerns.includes('ENVIRONMENT_LANDMARK_PROFILE_EMPTY:landmark-profile-1'));
  assert.ok(result.concerns.includes('PROVENANCE_NOT_READY:environment_decay_profiles:decay-1'));
});
