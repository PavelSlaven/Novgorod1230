import assert from 'node:assert/strict';
import test from 'node:test';
import { validateSpatialV3Contract } from '../src/spatial-v3/registry.js';

// The registry imports the generated current specifications.json. This fixture
// uses the valid P22 shape from temporal-world-v1.test.js; only the version varies.
function envelope(version) {
  return {
    package_id: 'initial-visible', party_id: 'initial-party', turn_id: 'initial-turn',
    committed_state_version: version, change_set_id: 'initial-change',
    package_digest: 'a'.repeat(64),
    visible_payload: {
      schema: 'temporal_visible_package.v1', perceived_scene: 'Телега стоит у ворот.',
      perceived_changes: [], sensory_details: [], visible_npcs: [], visible_objects: [],
      known_context: [], uncertainties: [], hypotheses: [],
      player_safe_interruption: null, allowed_action_affordances: [],
    },
    presentation_status: 'pending',
    projection_policy_ref: { entity_ref: { entity_kind: 'visibility_modifier',
      entity_id: 'projection-1' }, authoring_version: 'v1' },
    dependency_pins: { pins: [], canonical_digest: 'b'.repeat(64) },
    idempotency_record_id: 'initial-idempotency',
  };
}

for (const version of ['0', '1', '2']) {
  test(`P22 generated contract accepts committed state version ${version}`, () => {
    const errors = validateSpatialV3Contract('visible_package_persistence_envelope', envelope(version));
    const diagnostic = errors.map(({ code, path }) => ({ code, path }));
    assert.equal(errors.length, 0, `committed baseline contract: ${JSON.stringify(diagnostic)}`);
  });
}

for (const [label, version] of [
  ['negative', '-1'], ['leading zero', '01'], ['empty', ''], ['number', 0], ['null', null],
]) {
  test(`P22 generated contract rejects ${label} committed state version`, () => {
    const errors = validateSpatialV3Contract('visible_package_persistence_envelope', envelope(version));
    assert.ok(errors.some(({ code }) => code === 'generated_schema_mismatch'),
      'the generated version type must reject noncanonical or non-string input');
  });
}
