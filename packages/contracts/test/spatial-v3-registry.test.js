import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canonicalizeSpatialV3, computeSpatialV3CanonicalDigest, contractDefinitions, contractImplementationBatches,
  controlledVocabularyDefinitions, createSpatialV3TypedError, typedErrorDefinitions,
  validateControlledVocabulary, validateSpatialV3Contract
} from '../src/spatial-v3/registry.js';
import { loadCanonicalTarget } from '../../../tools/spatial-v3/red-contract-harness.mjs';
import { stateMachineDefinitions } from '../src/spatial-v3/state-machines.js';

test('P07 registry exposes exactly the current 213 contracts and 82 typed errors once', async () => {
  const target = await loadCanonicalTarget();
  assert.equal(contractDefinitions.length, 213);
  assert.equal(new Set(contractDefinitions.map(({ contract_name }) => contract_name)).size, 213);
  assert.ok(contractImplementationBatches.every(({ contract_names }) => contract_names.length <= 20));
  assert.equal(typedErrorDefinitions.length, 82);
  assert.equal(new Set(typedErrorDefinitions.map(({ error_code }) => error_code)).size, 82);
  assert.deepEqual(contractDefinitions.map(({ contract_name }) => contract_name).sort(), target.contracts);
  assert.deepEqual(typedErrorDefinitions.map(({ error_code }) => error_code).sort(), target.errors);
  assert.ok(typedErrorDefinitions.every(({ required_reaction, player_safe_message_key, subject_ref, diagnostic_dependency_pins }) => required_reaction && player_safe_message_key && subject_ref && diagnostic_dependency_pins));
});

test('P07 primitive refs reject bare IDs and invalid XOR branches', () => {
  assert.ok(validateSpatialV3Contract('entity_ref', { entity_id: 'only-id' }).every(({ code }) => code === 'generated_schema_mismatch'));
  assert.deepEqual(validateSpatialV3Contract('version_pin', { pin_kind: 'authoring_version', authoring_version: 'w1', state_version: 1 }).map(({ code }) => code), ['authoring_dependency_pin_missing']);
  assert.deepEqual(validateSpatialV3Contract('journey_location', { location_kind: 'scene', scene_position_id: 'p1', travel_state_id: 't1' }).map(({ code }) => code), ['journey_location_ownership_mismatch']);
});

test('P07 canonical serialization is order independent', () => {
  assert.deepEqual(canonicalizeSpatialV3({ b: 1, a: { z: 2, y: 3 } }), { a: { y: 3, z: 2 }, b: 1 });
  assert.equal(computeSpatialV3CanonicalDigest({ b: 1, a: 2 }), computeSpatialV3CanonicalDigest({ a: 2, b: 1 }));
});

test('P07 controlled vocabularies are exact, approved, versioned, digest-pinned and fail closed for unknown values', () => {
  assert.equal(controlledVocabularyDefinitions.length, 21);
  for (const definition of controlledVocabularyDefinitions) {
    assert.match(definition.registry_path, /^data\/contracts\/spatial-v3\/controlled-vocabularies\.v3\.json#\/vocabularies\/\d+$/);
    assert.match(definition.digest, /^[a-f0-9]{64}$/);
    assert.equal(definition.status, 'approved');
    assert.ok(definition.values.length > 0);
  }
  assert.deepEqual(validateControlledVocabulary('controlled_entity_kind', 'access_class'), []);
  assert.deepEqual(validateControlledVocabulary('controlled_entity_kind', 'decision_command'), []);
  assert.deepEqual(validateControlledVocabulary('controlled_entity_kind', 'invented').map(({ code }) => code), ['controlled_vocabulary_gap']);
});

test('P07 typed error serialization requires typed subject/pins, rejects unknown codes and never exposes diagnostics as a public message', () => {
  const error = createSpatialV3TypedError('route_chain_discontinuous', {
    subject_ref: { entity_kind: 'route', entity_id: 'r1' }, dependency_pins: { pins: [], canonical_digest: 'sha256:0000000000000000000000000000000000000000000000000000000000000000' }, diagnostics: { internal: { route: 'hidden' } }
  });
  assert.equal(error.code, 'route_chain_discontinuous');
  assert.equal(error.message_key, 'spatial_v3.error.route_chain_discontinuous');
  assert.equal(error.message, 'The requested spatial operation cannot be completed safely.');
  assert.throws(() => createSpatialV3TypedError('route_chain_discontinuous'), /requires valid subject_ref and dependency_pins/);
  assert.throws(() => createSpatialV3TypedError('route_chain_discontinuous', { subject_ref: { entity_kind: 'route' }, dependency_pins: {} }), /requires valid subject_ref and dependency_pins/);
  assert.throws(() => createSpatialV3TypedError('invented_error'), /Unknown spatial v3 typed error code/);
});

test('P07 execution event kind must match the exact Appendix A transition and exposes its gate', () => {
  assert.equal(stateMachineDefinitions.validateStateMachine({ machine: 'execution', from: 'active', to: 'waiting_at_anchor', event_kind: 'wait_started' }).ok, true);
  assert.match(stateMachineDefinitions.validateStateMachine({ machine: 'execution', from: 'active', to: 'waiting_at_anchor', event_kind: 'wait_started' }).gate, /exact endpoint/);
  assert.equal(stateMachineDefinitions.validateStateMachine({ machine: 'execution', from: 'active', to: 'waiting_at_anchor', event_kind: 'completed' }).ok, false);
  assert.equal(stateMachineDefinitions.validateStateMachine({ machine: 'execution', from: 'active', to: 'completed', event_kind: 'wait_started' }).ok, false);
  assert.equal(stateMachineDefinitions.validateStateMachine({ machine: 'frontier', from: 'open', to: 'consumed' }).ok, true);
  assert.equal(stateMachineDefinitions.validateStateMachine({ machine: 'frontier', from: 'consumed', to: 'open' }).ok, false);
});
