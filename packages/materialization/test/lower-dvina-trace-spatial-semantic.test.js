import test from 'node:test';
import assert from 'node:assert/strict';
import {
  admitSpatialSemanticRemainder, prepareSpatialSemanticRemainder,
  validateSpatialSemanticResolution
} from '../src/lower-dvina-trace-spatial-semantic.js';
import { MaterializationError as MaterializationFailure } from '../src/core.js';

function request(overrides = {}) {
  return { schema: 'rus.s1_spatial_semantic_request.v1', request_id: 'request-a',
    causal_request_ref: 'turn-a', party_id: 'party-a', need: 'interaction',
    envelope: { envelope_ref: 'envelope-a', kind: 'ordinary_structure',
      scope_kind: 'current_position_local_reference', mechanics_class: 'descriptive_only',
      baseline_ref: 'baseline-a', g5_ref: 'g5-a', g6_ref: 'g6-a', position_ref: 'position-a',
      template_ref: 'template-a', property_ref: 'property-a', function_ref: 'function-a',
      environment_ref: 'environment-a', profile_ref: 'profile-a', profile_version: 1,
      policy_ref: 'policy-a', policy_version: 1, baseline_state_version: 1,
      g5_state_version: 1, g6_state_version: 1, position_state_version: 1,
      capacity_total: 1, consumed_count: 0, state_version: 1 }, ...overrides };
}
function proposal(overrides = {}) {
  return { schema: 'rus.s1_spatial_semantic_proposal.v1', request_id: 'request-a',
    name: 'Рядовой навес', description: 'Невысокий навес у берега с грубым настилом.', ...overrides };
}
function code(error) { return error instanceof MaterializationFailure && error.code; }

test('S1 accepts open unseen local concretization inside code-owned envelope', () => {
  const prepared = prepareSpatialSemanticRemainder(request());
  assert.equal('reservation' in prepared, false);
  assert.equal(prepared.code_owned.envelope.scope_kind, 'current_position_local_reference');
  assert.equal(prepared.code_owned.envelope.mechanics_class, 'descriptive_only');
  const result = admitSpatialSemanticRemainder({ prepared, proposal: proposal({
    name: 'Плетёный заслон', description: 'Низкий заслон из прутьев у кромки воды.' }) });
  assert.equal(result.local_ref, 's1-local:request-a');
  assert.equal(result.envelope_ref, 'envelope-a');
  assert.equal(result.position_ref, 'position-a');
  assert.deepEqual(result.semantics, { kind: 'ordinary_structure', name: 'Плетёный заслон',
    description: 'Низкий заслон из прутьев у кромки воды.', mechanics_class: 'descriptive_only' });
  assert.deepEqual(Object.keys(prepared.model_request.proposal_example).sort(),
    ['description', 'name', 'request_id', 'schema']);
  assert.equal(Object.isFrozen(result), true);
});

test('S1 proposal cannot set authority, IDs, topology, kind, or mechanics', () => {
  const prepared = prepareSpatialSemanticRemainder(request());
  for (const extra of [
    { kind: 'local_natural_feature' }, { local_ref: 'forged' }, { position_ref: 'new-position' },
    { topology: 'new-route' }, { mechanics_class: 'movement' }, { authority: 'canonical' }
  ]) {
    assert.throws(() => admitSpatialSemanticRemainder({ prepared, proposal: proposal(extra) }),
      (error) => code(error) === 'S1_SPATIAL_PROPOSAL_INVALID');
  }
});

test('S1 rejects exhausted envelope and validates only code-owned result shape', () => {
  assert.throws(() => prepareSpatialSemanticRemainder(request({ envelope: {
    ...request().envelope, consumed_count: 1 } })),
  (error) => code(error) === 'S1_SPATIAL_CAPACITY_INVALID');
  const result = admitSpatialSemanticRemainder({ prepared: prepareSpatialSemanticRemainder(request()),
    proposal: proposal() });
  assert.deepEqual(validateSpatialSemanticResolution(result), result);
  assert.equal('resolution_digest' in result, false);
});
