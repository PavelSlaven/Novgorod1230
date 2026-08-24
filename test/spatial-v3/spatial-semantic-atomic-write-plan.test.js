import test from 'node:test';
import assert from 'node:assert/strict';
import { admitSpatialSemanticRemainder, prepareSpatialSemanticRemainder } from
  '@rus/materialization/internal/lower-dvina-trace-s1';
import { createSpatialSemanticAtomicWritePlan, spatialSemanticPhysicalKeys, spatialSemanticRows } from
  '../../apps/game-server/src/infrastructure/postgres/spatial-semantic-atomic-write-plan.js';

function fixture() {
  const envelope = { envelope_ref: 'envelope-a', kind: 'ordinary_structure',
    scope_kind: 'current_position_local_reference', structural_variant: 'open_one_space', available_mechanics: [], required_semantic_requirements: ['interior_space'],
    baseline_ref: 'baseline-a', g5_ref: 'g5-a', g6_ref: 'g6-a', position_ref: 'position-a',
    property_ref: 'property-a', function_ref: 'function-a',
    environment_ref: 'environment-a', semantic_context: semanticContext('ordinary_structure'),
    profile_ref: 'profile-a', profile_version: 1,
    policy_ref: 'policy-a', policy_version: 1, baseline_state_version: 1,
    g5_state_version: 1, g6_state_version: 1, position_state_version: 1,
    topology: { baseline_ref: 'baseline-a', g5_ref: 'g5-a', position_ref: 'position-a',
      interior_position_ref: 'position:interior', g6_instance_ref: 'g6:interior',
      movement_edge_refs: ['edge:out', 'edge:back'],
      visibility_link_refs: ['visibility:out', 'visibility:back'] },
    capacity_total: 2, consumed_count: 0, state_version: 1 };
  const causal_identity = { request_id: 'request-a', root_turn_id: 'turn-a',
    action_ref: 'action-a', step_index: 1, actor_ref: 'actor-a' };
  const prepared = prepareSpatialSemanticRemainder({ schema: 'rus.s1_spatial_semantic_request.v1',
    request_id: causal_identity.request_id, causal_request_ref: causal_identity.action_ref,
    party_id: 'party-a', need: 'perception', envelope });
  return { schema: 'spatial_semantic_atomic_write_plan_v1', party_id: 'party-a',
    base_party_state_version: 4, change_set_id: 'change-a', causal_identity,
    envelope_ref: envelope.envelope_ref, expected_envelope_state_version: 1,
    formal_spatial_context: { baseline_ref: envelope.baseline_ref, g5_ref: envelope.g5_ref,
      kind: envelope.kind, structural_variant: envelope.structural_variant,
      available_mechanics: envelope.available_mechanics,
      required_semantic_requirements: envelope.required_semantic_requirements,
      topology: envelope.topology },
    resolution: structuredClone(admitSpatialSemanticRemainder({ prepared, proposal: {
      schema: 'rus.s1_spatial_semantic_proposal.v1', request_id: 'request-a',
      name: 'навес', description: 'Небольшой навес у берега.', semantic_requirements: ['interior_space'] } })) };
}
function semanticContext(allowed_kind) { return { allowed_kind, period: 'period', region: 'region',
  place_type: 'place', environment: 'environment', material_culture: 'culture',
  ordinary_boundary: 'ordinary only' }; }

test('S1 atomic plan binds existing causal IDs and envelope version without reservation or digest', () => {
  const plan = createSpatialSemanticAtomicWritePlan(fixture());
  assert.equal('reservation_pin' in plan, false);
  assert.equal('write_plan_digest' in plan, false);
  assert.deepEqual(plan.causal_identity, { request_id: 'request-a', root_turn_id: 'turn-a',
    action_ref: 'action-a', step_index: 1, actor_ref: 'actor-a' });
  assert.deepEqual(spatialSemanticPhysicalKeys(plan), [
    'party_runtime.party_spatial_semantic_envelopes:party-a:envelope-a',
    'party_runtime.party_spatial_semantic_resolutions:party-a:request-a',
    'party_runtime.entity_placements:ordinary_structure:s1-local:request-a'
  ]);
});

test('S1 open one-space binds prebuilt local topology and writes only placement', () => {
  const rows = spatialSemanticRows(fixture());
  const edges = rows.filter(({ target_table }) =>
    target_table === 'scene_movement_edges');
  assert.equal(edges.length, 0);
  const placement = rows.find(({ target_table }) => target_table === 'entity_placements');
  assert.equal(placement.record.position_node_id, 'position:interior');
  assert.equal(rows.length, 1);
});

test('S1 atomic plan rejects stale envelope or mismatched semantic result', () => {
  for (const mutate of [
    (input) => { input.expected_envelope_state_version = 0; },
    (input) => { input.resolution.envelope_ref = 'other'; },
    (input) => { input.resolution.formal_spatial_refs.structural_variant = 'forged'; }
  ]) {
    const input = fixture();
    mutate(input);
    assert.throws(() => createSpatialSemanticAtomicWritePlan(input),
      { code: 'SPATIAL_SEMANTIC_PLAN_INVALID' });
  }
});

test('S1 atomic plan requires sealed semantics but permits descriptive empty semantics', () => {
  assert.doesNotThrow(() => createSpatialSemanticAtomicWritePlan(fixture()));
  const missing = fixture();
  missing.resolution.outcome.semantic_requirements = [];
  assert.throws(() => createSpatialSemanticAtomicWritePlan(missing),
    { code: 'SPATIAL_SEMANTIC_PLAN_INVALID' });

  const input = fixture();
  input.formal_spatial_context.kind = 'local_natural_feature';
  input.formal_spatial_context.structural_variant = 'descriptive_local_reference';
  input.formal_spatial_context.required_semantic_requirements = [];
  input.formal_spatial_context.topology = null;
  const envelope = { envelope_ref: 'envelope-a', kind: 'local_natural_feature',
    scope_kind: 'current_position_local_reference', structural_variant: 'descriptive_local_reference',
    available_mechanics: [], required_semantic_requirements: [], baseline_ref: 'baseline-a',
    g5_ref: 'g5-a', g6_ref: 'g6-a', position_ref: 'position-a', property_ref: 'property-a',
    function_ref: 'function-a', environment_ref: 'environment-a',
    semantic_context: semanticContext('local_natural_feature'), profile_ref: 'profile-a',
    profile_version: 1, policy_ref: 'policy-a', policy_version: 1, baseline_state_version: 1,
    g5_state_version: 1, g6_state_version: 1, position_state_version: 1, topology: null,
    capacity_total: 2, consumed_count: 0, state_version: 1 };
  const prepared = prepareSpatialSemanticRemainder({ schema: 'rus.s1_spatial_semantic_request.v1',
    request_id: 'request-a', causal_request_ref: 'action-a', party_id: 'party-a',
    need: 'perception', envelope });
  input.resolution = structuredClone(admitSpatialSemanticRemainder({ prepared, proposal: {
    schema: 'rus.s1_spatial_semantic_proposal.v1', request_id: 'request-a',
    name: 'выступ', description: 'Камень у воды.', semantic_requirements: [] } }));
  assert.doesNotThrow(() => createSpatialSemanticAtomicWritePlan(input));
});

test('S1 atomic plan rejects forged formal variant, mechanics and unsupported requirements', () => {
  for (const mutate of [
    (input) => { input.resolution.formal_spatial_refs.structural_variant = 'one_space_controlled_passage'; },
    (input) => { input.resolution.formal_spatial_refs.available_mechanics = ['hazard']; },
    (input) => { input.resolution.outcome.semantic_requirements = ['extractable_resource']; },
    (input) => { input.resolution.outcome.semantic_requirements = ['movement_constraint']; },
    (input) => { input.resolution.outcome.semantic_requirements = ['hazard']; }
  ]) {
    const input = fixture(); mutate(input);
    assert.throws(() => createSpatialSemanticAtomicWritePlan(input),
      { code: 'SPATIAL_SEMANTIC_PLAN_INVALID' });
  }
});

test('S1 atomic plan rejects controlled formal refs against descriptive context', () => {
  const input = fixture();
  input.formal_spatial_context.kind = 'local_natural_feature';
  input.formal_spatial_context.structural_variant = 'descriptive_local_reference';
  input.resolution.formal_spatial_refs.structural_variant = 'one_space_controlled_passage';
  assert.throws(() => createSpatialSemanticAtomicWritePlan(input),
    { code: 'SPATIAL_SEMANTIC_PLAN_INVALID' });
});

test('S1 atomic plan rejects an unbound controlled portal before P16 writes', () => {
  const input = fixture();
  input.formal_spatial_context.structural_variant = 'one_space_controlled_passage';
  input.formal_spatial_context.available_mechanics = ['controlled_passage'];
  input.resolution.formal_spatial_refs.structural_variant = 'one_space_controlled_passage';
  input.resolution.formal_spatial_refs.available_mechanics = ['controlled_passage'];
  assert.throws(() => createSpatialSemanticAtomicWritePlan(input),
    { code: 'SPATIAL_SEMANTIC_PLAN_INVALID' });
});
