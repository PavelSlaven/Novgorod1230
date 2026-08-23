import test from 'node:test';
import assert from 'node:assert/strict';
import { admitSpatialSemanticRemainder, prepareSpatialSemanticRemainder } from
  '@rus/materialization/internal/lower-dvina-trace-s1';
import { createSpatialSemanticAtomicWritePlan, spatialSemanticPhysicalKeys } from
  '../../apps/game-server/src/infrastructure/postgres/spatial-semantic-atomic-write-plan.js';

function fixture() {
  const envelope = { envelope_ref: 'envelope-a', kind: 'ordinary_structure',
    scope_kind: 'current_position_local_reference', mechanics_class: 'descriptive_only',
    baseline_ref: 'baseline-a', g5_ref: 'g5-a', g6_ref: 'g6-a', position_ref: 'position-a',
    property_ref: 'property-a', function_ref: 'function-a',
    environment_ref: 'environment-a', semantic_context: semanticContext('ordinary_structure'),
    profile_ref: 'profile-a', profile_version: 1,
    policy_ref: 'policy-a', policy_version: 1, baseline_state_version: 1,
    g5_state_version: 1, g6_state_version: 1, position_state_version: 1,
    capacity_total: 2, consumed_count: 0, state_version: 1 };
  const causal_identity = { request_id: 'request-a', root_turn_id: 'turn-a',
    action_ref: 'action-a', step_index: 1, actor_ref: 'actor-a' };
  const prepared = prepareSpatialSemanticRemainder({ schema: 'rus.s1_spatial_semantic_request.v1',
    request_id: causal_identity.request_id, causal_request_ref: causal_identity.action_ref,
    party_id: 'party-a', need: 'perception', envelope });
  return { schema: 'spatial_semantic_atomic_write_plan_v1', party_id: 'party-a',
    base_party_state_version: 4, change_set_id: 'change-a', causal_identity,
    envelope_ref: envelope.envelope_ref, expected_envelope_state_version: 1,
    resolution: structuredClone(admitSpatialSemanticRemainder({ prepared, proposal: {
      schema: 'rus.s1_spatial_semantic_proposal.v1', request_id: 'request-a',
      name: 'навес', description: 'Небольшой навес у берега.' } })) };
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
    'party_runtime.party_spatial_semantic_resolutions:party-a:request-a'
  ]);
});

test('S1 atomic plan rejects stale envelope or mismatched semantic result', () => {
  for (const mutate of [
    (input) => { input.expected_envelope_state_version = 0; },
    (input) => { input.resolution.envelope_ref = 'other'; },
    (input) => { input.resolution.semantics.mechanics_class = 'combat'; }
  ]) {
    const input = fixture();
    mutate(input);
    assert.throws(() => createSpatialSemanticAtomicWritePlan(input),
      { code: 'SPATIAL_SEMANTIC_PLAN_INVALID' });
  }
});
