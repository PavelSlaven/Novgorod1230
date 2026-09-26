import test from 'node:test';
import assert from 'node:assert/strict';
import { projectSpatialV3NaturalScene } from '../src/spatial-v3-projection.js';
import { naturalSceneFixture } from './natural-scene-fixture.js';

test('natural projection uses exact approved descriptions and existing P22 perception', () => {
  const input = naturalSceneFixture(); const before = structuredClone(input);
  const result = projectSpatialV3NaturalScene(input);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.deepEqual(result.visible_context.sensory_details, ['Под ногами влажный ил.', 'Слышно движение воды.']);
  assert.equal(JSON.stringify(result).includes('machine-only'), false);
  assert.equal(JSON.stringify(result).includes('payload_digest'), false);
  assert.deepEqual(input, before);
  assert.equal(Object.isFrozen(result), true);
});

test('conditional fauna without an admitted sensory channel stays undisclosed', () => {
  const input = naturalSceneFixture();
  input.natural_baseline.layers.push({ layer: 'fauna', applicability: 'conditional', value: {}, limits: 'No live entity.' });
  input.presentation_profile.layers.push({ layer: 'fauna', channel: 'none', clear_text: null, partial_text: null });
  const result = projectSpatialV3NaturalScene(input);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.deepEqual(result.visible_context.sensory_details, ['Под ногами влажный ил.', 'Слышно движение воды.']);
});

test('darkness, occlusion and partial perception never reveal the full natural description', () => {
  for (const condition of ['lighting', 'dynamic_occlusion', 'weather']) {
    const input = naturalSceneFixture(); input.observations[0].visual_conditions[condition] = 'none';
    const result = projectSpatialV3NaturalScene(input);
    assert.equal(result.ok, true);
    assert.deepEqual(result.visible_context.sensory_details, ['Слышно движение воды.']);
  }
  const input = naturalSceneFixture(); input.observations[0].visual_conditions.lighting = 'partial';
  assert.equal(projectSpatialV3NaturalScene(input).visible_context.sensory_details[0], 'Внизу различима неровная поверхность.');
  delete input.presentation_profile.layers[0].partial_text;
  assert.deepEqual(projectSpatialV3NaturalScene(input).visible_context.sensory_details, ['Слышно движение воды.']);
});

test('closed portal and absent relation suppress remote natural observations and sound', () => {
  const input = naturalSceneFixture();
  input.scene.g6.push({ ...input.scene.g6[0], id: 'outside' });
  input.scene.positions[1].g6_instance_id = 'outside';
  input.scene.visibility_links = [{ from_position_id: 'position:inside', to_position_id: 'position:shore',
    base_result: 'clear', portal_id: 'door' }];
  input.scene.acoustic_edges = [{ from_g6_id: 'outside', to_g6_id: 'g6:inside', base_loss: 0, portal_id: 'door' }];
  input.scene.portals = { door: { state: 'closed', condition_profile_ref: 'door-profile',
    visibility_by_state: { open: 'clear', closed: 'none', locked: 'none', destroyed: 'clear' },
    acoustic_loss_by_state: { open: 0, closed: 'blocked', locked: 'blocked', destroyed: 0 } } };
  assert.deepEqual(projectSpatialV3NaturalScene(input).visible_context.sensory_details, []);
  input.scene.portals.door.state = 'open';
  assert.equal(projectSpatialV3NaturalScene(input).visible_context.sensory_details.length, 2);
  input.scene.visibility_links = []; input.scene.acoustic_edges = [];
  assert.deepEqual(projectSpatialV3NaturalScene(input).visible_context.sensory_details, []);
});

test('missing authoring, current state or exact scene binding is a typed gate', () => {
  for (const mutate of [
    (input) => { input.presentation_profile.status = 'candidate'; },
    (input) => { input.presentation_profile.natural_profile_ref.payload_digest = 'other'; },
    (input) => { input.presentation_profile.layers.pop(); },
    (input) => { input.observations.pop(); },
    (input) => { input.observations[0].source_position_id = 'invented'; },
    (input) => { input.observations[0].visual_conditions.lighting = undefined; },
    (input) => { input.observer.party_id = 'other'; },
    (input) => { input.scene.positions[0].party_id = 'other'; },
    (input) => { input.scene.scene_template_ref = { id: 'other', version: 1 }; },
    (input) => { input.scene.acoustic_profiles = []; },
    (input) => { input.presentation_profile.layers[0].clear_text = 'hidden_sentinel'; }
  ]) {
    const input = naturalSceneFixture(); mutate(input);
    const result = projectSpatialV3NaturalScene(input);
    assert.equal(result.ok, false);
    assert.equal(result.error.code, 'NATURAL_SCENE_PERCEPTION_DATA_GAP');
  }
});
