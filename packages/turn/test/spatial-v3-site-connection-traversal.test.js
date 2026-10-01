import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareSpatialV3SiteConnectionTraversal } from '../src/spatial-v3-execution.js';
import { computeSpatialV3CanonicalDigest as digest } from '@rus/contracts/spatial-v3/registry';

const seal = (value) => ({ ...value, canonical_digest: digest(value) });
const authoringRef = (kind, id) => ({ entity_ref: { entity_kind: kind, entity_id: id }, authoring_version: '1' });
function fixture() {
  const row = (id, fields = {}) => ({ id, party_id: 'party', state_version: 1, status: 'active', ...fields });
  const pin = { dependency_role: 'capability', entity_ref: { entity_kind: 'actor', entity_id: 'actor' },
    version_pin: { pin_kind: 'party_state_version', state_version: 2, authoring_version: null } };
  return { party_id: 'party', request_id: 'request', execution_id: 'execution', run_id: 'run',
    idempotency_key: 'key', idempotency_record_id: 'record', change_set_id: 'change', occurred_at_turn: 1,
    world_revision_id: 'world', catalog_digest: 'a'.repeat(64), movement_capacity_units: 1,
    footprint_rule_ref: authoringRef('footprint_rule', 'actor-footprint'),
    connection: row('edge', { from_site_id: 'source', to_site_id: 'generated',
      cost_kind: 'time', action_units: null, base_minutes: 90, passage_type_id: 'path',
      line_kind_id: 'path', line_kind_profile_ref: authoringRef('line_kind_profile', 'path'),
      line_name: 'лесной дорогой', line_discriminator: null,
      source_canonical_connection_ref: authoringRef('canonical_g5_connection_binding', 'source-binding'),
      baseline_movement_method_id: 'walk',
      movement_method_cost_profile_ref: authoringRef('movement_method_cost_profile', 'walk-cost'),
      transition_environment_profile_ref: authoringRef('transition_environment_profile', 'forest-env'),
      movement_orientation_profile_ref: authoringRef('movement_orientation_profile', 'forest-orientation'),
      dynamic_recheck_policy_ref: authoringRef('dynamic_recheck_policy', 'fixed-30') }),
    connection_profile: { id: 'profile', version: 1, status: 'approved', profile_scope: 'site_connection',
      cost_kind: 'time', action_units: null, passage_type_id: 'path',
      movement_method_cost_profile_ref: authoringRef('movement_method_cost_profile', 'walk-cost'),
      transition_environment_profile_ref: authoringRef('transition_environment_profile', 'forest-env'),
      movement_orientation_profile_ref: authoringRef('movement_orientation_profile', 'forest-orientation'),
      dynamic_recheck_policy_ref: authoringRef('dynamic_recheck_policy', 'fixed-30'),
      canonical_digest: 'b'.repeat(64) },
    journey_location: row('location', { owner_kind: 'actor', owner_id: 'actor', location_kind: 'scene',
      scene_position_id: 'position:source', transit_anchor_id: null, travel_state_id: null }),
    sites: ['source', 'generated'].map((id) => row(id, { parent_g4_id: 'g4' })),
    endpoint_bindings: ['from', 'to'].map((role, i) => row(`binding:${role}`, {
      site_connection_id: 'edge', endpoint_role: role, g5_site_id: i ? 'generated' : 'source',
      position_id: `position:${i ? 'generated' : 'source'}` })),
    scene_positions: ['source', 'generated'].map((id) => row(`position:${id}`, { g6_instance_id: `scene:${id}` })),
    g6_instances: ['source', 'generated'].map((id) => row(`scene:${id}`, {
      scene_baseline_id: `baseline:${id}`, host_kind: 'g5_site', host_id: id })),
    scene_baselines: ['source', 'generated'].map((id) => row(`baseline:${id}`, { host_kind: 'g5_site', host_id: id })),
    capability_context: seal({ cohort_membership_snapshot_pin: null, load_state_pin: null,
      root_carrier_attachment_pins: null, allowed_movement_methods: ['walk'], available_transport_pins: null,
      equipment_state_pins: null, legal_access_fact_pins: null, allowed_pace_modes: ['normal'],
      dependency_pins: { pins: [pin], canonical_digest: digest([pin]).replace('sha256:', '') } }),
    execution_context_snapshot: seal({ context_id: 'context', site_id: 'source' }),
    travel_state_id: 'travel-state',
    traversal_intervals: [0, 1, 2].map((ordinal) => ({
      clock_commit_mode: 'direct_party_clock',
      world_time_before: { whole_minutes: String(ordinal * 30), subminute_numerator: '0', subminute_denominator: '1' },
      progress_before_ppm: ordinal * 333333,
      planned_progress_after_ppm: ordinal === 2 ? 1000000 : (ordinal + 1) * 333333,
      actual_progress_after_ppm: ordinal === 2 ? 1000000 : (ordinal + 1) * 333333,
      planned_time: { numerator: '30', denominator: '1' },
      actual_time: { numerator: '30', denominator: '1' },
      cumulative_before: { numerator: String(ordinal * 30), denominator: '1' },
      dynamic_snapshot: seal({ snapshot_id: `dynamic-${ordinal}`, resolved_factors: [], resolved_delays: [] }),
      delay_occurrence_history: seal({ id: `delay-history-${ordinal}`, committed_occurrence_keys: [] }),
      source_signals: seal({ dependency_pins: seal({ pins: [pin] }) })
    })) };
}
const ports = (overrides = {}) => ({ validateCapability: async () => ({ ok: true }),
  loadCurrentState: async ({ option }) => ({ ok: true, expected_state_versions: option.expected_state_versions }),
  recheckActivation: async () => ({ ok: true }), ...overrides });

test('persisted generated site traversal delegates timed movement to P18/P19', async () => {
  const input = fixture();
  const before = structuredClone(input);
  const result = await prepareSpatialV3SiteConnectionTraversal(input, ports());
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.plan.steps.length, 1);
  assert.equal(result.plan.steps[0].step_kind, 'timed_traversal');
  assert.equal(result.option.cost_summary.action_units_min, null);
  assert.deepEqual(result.option.cost_summary.minutes_min, { numerator: '90', denominator: '1' });
  assert.equal(result.traversal_intervals.length, 3);
  assert.equal(result.traversal_intervals.at(-1).result.result_kind, 'segment_completed');
  assert.equal(result.traversal_intervals[0].result.travel_state_id, 'travel-state');
  assert.equal(result.final_travel_state.status, 'closed');
  assert.deepEqual(result.clock_update.actual_elapsed, { numerator: '90', denominator: '1' });
  assert.equal(result.expected_state_versions.canonical_digest, result.option.expected_state_versions.canonical_digest);
  assert.ok(result.expected_state_versions.entries.some((entry) => entry.entity_ref.entity_id === 'edge'));
  assert.ok(result.dependency_pins.pins.some((pin) => pin.dependency_role === 'movement_footprint'));
  assert.ok(result.dependency_pins.pins.some((pin) => pin.entity_ref.entity_id === 'profile'));
  assert.equal(Object.isFrozen(result), true);
  assert.deepEqual(input, before);
});

test('traversal rejects invented, reversed, stale and cross-party endpoint evidence before execution', async () => {
  for (const change of [
    (input) => { input.endpoint_bindings.pop(); },
    (input) => { input.journey_location.scene_position_id = 'position:generated'; },
    (input) => { input.endpoint_bindings[1].g5_site_id = 'source'; },
    (input) => { input.scene_positions[1].party_id = 'other'; },
    (input) => { input.sites[1].parent_g4_id = 'other-g4'; },
    (input) => { input.connection.state_version = 0; },
    (input) => { input.connection.base_minutes = 0; },
    (input) => { input.connection.cost_kind = 'action'; },
    (input) => { input.connection.source_canonical_connection_ref = null; },
    (input) => { input.connection_profile.status = 'candidate'; },
    (input) => { input.footprint_rule_ref = null; }
  ]) {
    const input = fixture(); change(input);
    const result = await prepareSpatialV3SiteConnectionTraversal(input, ports());
    assert.equal(result.ok, false);
    assert.equal(result.location_update, undefined);
  }
});

test('traversal preserves capability and activation admission instead of bypassing them', async () => {
  assert.equal((await prepareSpatialV3SiteConnectionTraversal(fixture())).ok, false);
  for (const override of [
    { validateCapability: async () => ({ ok: false, code: 'movement_capability_missing' }) },
    { loadCurrentState: async () => ({ ok: false }) },
    { recheckActivation: async () => ({ ok: false, code: 'state_version_conflict' }) }
  ]) {
    const result = await prepareSpatialV3SiteConnectionTraversal(fixture(), ports(override));
    assert.equal(result.ok, false);
    assert.equal(result.result, undefined);
  }
});

test('resolved site traversal intervals require contiguous world clocks', async () => {
  const input = fixture();
  input.traversal_intervals[1].world_time_before.whole_minutes = '31';
  const result = await prepareSpatialV3SiteConnectionTraversal(input, ports());
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'travel_interval_conflict');
});
