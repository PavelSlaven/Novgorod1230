import assert from 'node:assert/strict';
import test from 'node:test';
import { loadApprovedG4NaturalPresentationCatalog } from '@rus/runtime-catalog';
import { buildG4NaturalPresentationCompiledRecords } from '../../../tools/runtime-catalog-activation/src/g4-natural-presentation-compiled-records.js';
import { prepareG4NaturalScenePerceptionInput, projectG4NaturalPerception } from '../src/runtime/g4-natural-perception.js';
import { approvedNaturalPerceptionFixture } from './g4-natural-perception-fixture.js';

const project = (input) => projectG4NaturalPerception({ input: prepareG4NaturalScenePerceptionInput(input),
  partyId: 'party:1', actorId: 'player:1', positionId: 'position:inside' });

test('approved real descriptors load only with exact compiled membership and natural digest', async () => {
  const { input, candidateBytes, approval } = await approvedNaturalPerceptionFixture();
  const catalog = loadApprovedG4NaturalPresentationCatalog(input);
  assert.equal(catalog.profiles.length, 32);
  assert.ok(Object.isFrozen(catalog.profiles[0]));
  assert.throws(() => buildG4NaturalPresentationCompiledRecords({ candidateBytes: `${candidateBytes} `, approval }));
  for (const mutate of [
    (v) => { v.verifiedCatalog.verified = false; },
    (v) => { v.pin = { ...v.pin, catalog_digest: 'c'.repeat(64) }; },
    (v) => { v.verifiedCatalog.records_by_table.procedural_scene_compiled_records.pop(); },
    (v) => { v.verifiedCatalog.records_by_table.procedural_scene_compiled_records.at(-1).payload.layers[0].clear_text = 'Changed'; }
  ]) {
    const changed = structuredClone(input); mutate(changed);
    // Removing an unrelated profile is permitted; selecting it must then fail.
    if (changed.verifiedCatalog.records_by_table.procedural_scene_compiled_records.length
      < input.verifiedCatalog.records_by_table.procedural_scene_compiled_records.length) {
      assert.equal(loadApprovedG4NaturalPresentationCatalog(changed).profiles.length, 31);
    } else assert.throws(() => loadApprovedG4NaturalPresentationCatalog(changed));
  }
});

test('real approved descriptors obey darkness, source absence, partial sound and current portal', async () => {
  const { input } = await approvedNaturalPerceptionFixture();
  const result = project(input);
  assert.ok(result.perceived_facts.some((row) => row.channel === 'visual'));
  assert.deepEqual(result.perceived_facts.filter((row) => row.channel === 'acoustic').map((row) => row.text), ['Доносится неясный шум.']);
  const dark = structuredClone(input);
  for (const layer of dark.currentFacts.layer_admissions) if (layer.visual_conditions) layer.visual_conditions.lighting = 'none';
  assert.equal(project(dark).perceived_facts.some((row) => row.channel === 'visual'), false);
  dark.currentFacts.layer_admissions.find((row) => row.layer === 'audible_context').source_state = 'absent';
  assert.deepEqual(project(dark).perceived_facts, []);
  const scene = input.currentFacts.scene;
  scene.g6.push({ ...scene.g6[0], id: 'g6:shore' });
  scene.positions[1].g6_instance_id = 'g6:shore';
  scene.visibility_links = [{ from_position_id: 'position:inside', to_position_id: 'position:shore', base_result: 'clear', portal_id: 'door' }];
  scene.acoustic_edges = [{ from_g6_id: 'g6:shore', to_g6_id: 'g6:inside', base_loss: 0, portal_id: 'door' }];
  scene.portals = { door: { state: 'closed', condition_profile_ref: 'door@1',
    visibility_by_state: { open: 'clear', closed: 'none', locked: 'none', destroyed: 'clear' },
    acoustic_loss_by_state: { open: 0, closed: 'blocked', locked: 'blocked', destroyed: 0 } } };
  assert.deepEqual(project(input).perceived_facts, []);
  scene.portals.door.state = 'open';
  assert.deepEqual(project(input).perceived_facts, result.perceived_facts);
});

test('unadmitted source, missing current light and ambiguous committed endpoint fail closed', async () => {
  for (const mutate of [
    (v) => { v.currentFacts.layer_admissions = []; },
    (v) => { v.currentFacts.source_bindings = []; },
    (v) => { delete v.currentFacts.layer_admissions[0].visual_conditions.lighting; },
    (v) => { v.currentFacts.scene.positions.push({ ...v.currentFacts.scene.positions[1], id: 'duplicate' }); },
    (v) => { v.currentFacts.source_endpoint.endpoint_role = 'departure'; }
  ]) {
    const { input } = await approvedNaturalPerceptionFixture(); mutate(input);
    assert.throws(() => prepareG4NaturalScenePerceptionInput(input), { code: 'NATURAL_SCENE_PERCEPTION_DATA_GAP' });
  }
});
