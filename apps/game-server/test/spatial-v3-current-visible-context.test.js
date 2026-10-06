import assert from 'node:assert/strict';
import test from 'node:test';
import { approvedNaturalPerceptionFixture } from './g4-natural-perception-fixture.js';
import { prepareG4NaturalScenePerceptionInput } from '../src/runtime/g4-natural-perception.js';
import { projectSpatialV3CurrentVisibleContext,
  readAndProjectSpatialV3CurrentVisibleContext } from
  '../src/runtime/spatial-v3-current-visible-context.js';

test('canonical and generated current scenes compose admitted natural, entities and exits', async () => {
  const args = { partyId: 'party:1', actorId: 'player:1',
    entityObservations: [{ entity_kind: 'npc',
      entity_id: 'npc:1', visibility: 'clear', display_label: 'незнакомец',
      exterior: { sex_category: 'male', age_category: 'adult',
        appearance: { build: 'thin' }, visible_equipment: [] } }, { entity_kind: 'item',
      entity_id: 'item:1', visibility: 'partial', display_label: 'корзина',
      exterior: { condition_state: 'intact' } }],
    localEdges: [{ edge_id: 'edge:1', display_label: 'проход во двор' }],
    directionalExits: [{ directional_exit_id: 'exit:1', display_label: 'тропа к реке' }] };
  for (const origin of ['canonical', 'generated']) {
    const { input } = await approvedNaturalPerceptionFixture({ canonical: origin === 'canonical' });
    const transaction = { query() {} };
    const state = { marker: 'committed' };
    const directionalExits = [{ id: 'exit:1' }];
    const result = await readAndProjectSpatialV3CurrentVisibleContext({ transaction,
      partyId: args.partyId, actorId: args.actorId,
      positionId: input.currentFacts.observer.position_id,
      state, directionalExits,
      readCurrentSources: async (received) => {
        assert.equal(received.transaction, transaction);
        assert.equal(received.state, state);
        assert.equal(received.directionalExits, directionalExits);
        return { ...args, naturalInput: prepareG4NaturalScenePerceptionInput(input) };
      } });
    assert.equal(result.schema, 'visible_context_package', origin);
    assert.ok(result.sensory_details.length > 0, origin);
    assert.deepEqual(result.visible_npc.map((row) => row.entity_ref.entity_id), ['npc:1']);
    assert.deepEqual(result.visible_objects.map((row) => row.entity_ref.entity_id),
      ['item:1', 'edge:1', 'exit:1']);
    assert.deepEqual(Object.keys(result.visible_npc[0].observable_cues), ['identity', 'equipment']);
    assert.equal(result.visible_objects[0].visible_status, undefined);
  }
});

test('a young_adult NPC is disclosed with the player-safe age word `young`', async () => {
  const { input } = await approvedNaturalPerceptionFixture();
  const result = projectSpatialV3CurrentVisibleContext({ naturalInput: prepareG4NaturalScenePerceptionInput(input),
    partyId: 'party:1', actorId: 'player:1', positionId: 'position:inside', localEdges: [], directionalExits: [],
    entityObservations: [{ entity_kind: 'npc', entity_id: 'npc:1', visibility: 'clear', display_label: 'человек',
      exterior: { sex_category: 'male', age_category: 'young_adult', appearance: { build: 'thin' }, visible_equipment: [] } }] });
  assert.equal(result.visible_npc[0].observable_cues.identity.age_category, 'young');
});

test('an item without a safe label remains visible by ref with a typed label gap', async () => {
  const { input } = await approvedNaturalPerceptionFixture();
  const naturalInput = prepareG4NaturalScenePerceptionInput(input);
  const baseline = projectSpatialV3CurrentVisibleContext({
    naturalInput, partyId: 'party:1', actorId: 'player:1',
    positionId: 'position:inside', entityObservations: [], localEdges: [],
    directionalExits: [] });
  const result = projectSpatialV3CurrentVisibleContext({
    naturalInput,
    partyId: 'party:1', actorId: 'player:1', positionId: 'position:inside',
    localEdges: [], directionalExits: [], entityObservations: [{
      entity_kind: 'item', entity_id: 'item:unlabeled', visibility: 'clear',
      exterior: { condition_state: 'serviceable' },
      label_gap: { code: 'player_safe_item_label_required' }
    }] });
  assert.deepEqual(result.visible_objects, [{
    entity_ref: { entity_kind: 'item', entity_id: 'item:unlabeled' },
    label_gap: { code: 'player_safe_item_label_required' },
    visible_status: 'serviceable'
  }]);
  assert.deepEqual(result.uncertainties, baseline.uncertainties);
  assert.throws(() => projectSpatialV3CurrentVisibleContext({
    naturalInput, partyId: 'party:1', actorId: 'player:1',
    positionId: 'position:inside', localEdges: [], directionalExits: [],
    entityObservations: [{ entity_kind: 'item', entity_id: 'item:bad-gap',
      visibility: 'clear', exterior: { condition_state: 'serviceable' },
      label_gap: { code: 'unknown_gap' } }]
  }), (error) => error.details?.reason
    === 'complete_current_entity_observation_required');
});

test('an invalid item label becomes a typed gap while invalid NPC labels still fail closed', async () => {
  const { input } = await approvedNaturalPerceptionFixture();
  const args = { naturalInput: prepareG4NaturalScenePerceptionInput(input),
    partyId: 'party:1', actorId: 'player:1', positionId: 'position:inside',
    localEdges: [], directionalExits: [], entityObservations: [{
      entity_kind: 'item', entity_id: 'item:unlabeled', visibility: 'clear',
      display_label: 'item_template_secret',
      exterior: { condition_state: 'serviceable' }
    }] };
  assert.deepEqual(projectSpatialV3CurrentVisibleContext(args).visible_objects, [{
    entity_ref: { entity_kind: 'item', entity_id: 'item:unlabeled' },
    label_gap: { code: 'player_safe_item_label_required' },
    visible_status: 'serviceable'
  }]);
  assert.throws(() => projectSpatialV3CurrentVisibleContext({ ...args,
    entityObservations: [{ entity_kind: 'npc', entity_id: 'npc:bad-label',
      visibility: 'clear', exterior: { appearance: {}, visible_equipment: [] } }] }),
  (error) => error.details?.reason === 'complete_current_entity_observation_required');
});

test('occupied local edge status passes through; directional exits carry none', async () => {
  const { input } = await approvedNaturalPerceptionFixture();
  const args = { naturalInput: prepareG4NaturalScenePerceptionInput(input),
    partyId: 'party:1', actorId: 'player:1', positionId: 'position:inside',
    entityObservations: [],
    localEdges: [{ edge_id: 'edge:1', display_label: 'проход', destination_status: 'occupied' },
      { edge_id: 'edge:2', display_label: 'другой проход', destination_status: 'open' }],
    directionalExits: [{ directional_exit_id: 'exit:1', display_label: 'тропа к реке' }] };
  const result = projectSpatialV3CurrentVisibleContext(args);
  assert.deepEqual(result.visible_objects.map(({ entity_ref: { entity_id: id }, visible_status: status,
    ...row }) => [id, status, 'status' in row]), [['edge:1', 'проход занят', false],
    ['edge:2', undefined, false], ['exit:1', undefined, false]]);
  assert.throws(() => projectSpatialV3CurrentVisibleContext({ ...args,
    localEdges: [{ edge_id: 'edge:1', display_label: 'проход', destination_status: 'blocked' }] }),
  (error) => error.details?.reason === 'complete_current_exit_disclosure_required');
});

test('incomplete or duplicated current observations fail closed', async () => {
  const { input } = await approvedNaturalPerceptionFixture();
  const args = { naturalInput: prepareG4NaturalScenePerceptionInput(input),
    partyId: 'party:1', actorId: 'player:1', positionId: 'position:inside',
    entityObservations: [], localEdges: [], directionalExits: [] };
  assert.throws(() => projectSpatialV3CurrentVisibleContext({ ...args,
    entityObservations: [{ entity_kind: 'item', entity_id: 'item:1',
      visibility: 'clear', exterior: {} }] }),
  (error) => error.details?.reason === 'complete_current_entity_observation_required');
  assert.throws(() => projectSpatialV3CurrentVisibleContext({ ...args,
    localEdges: [{ edge_id: 'edge:1', display_label: 'проход' },
      { edge_id: 'edge:1', display_label: 'проход' }] }),
  (error) => error.details?.reason === 'complete_current_exit_disclosure_required');
  assert.throws(() => projectSpatialV3CurrentVisibleContext({ ...args,
    positionId: 'wrong' }), { code: 'NATURAL_SCENE_PERCEPTION_DATA_GAP' });
});

test('disclosed canonical connections join the visible objects like exits and stay optional', async () => {
  const { input } = await approvedNaturalPerceptionFixture();
  const args = { naturalInput: prepareG4NaturalScenePerceptionInput(input),
    partyId: 'party:1', actorId: 'player:1', positionId: 'position:inside',
    entityObservations: [], localEdges: [], directionalExits: [] };
  assert.deepEqual(projectSpatialV3CurrentVisibleContext(args).visible_objects, [],
    'callers that know no connections are unchanged');
  const result = projectSpatialV3CurrentVisibleContext({ ...args, siteConnections: [
    { connection_binding_id: 'binding:1', display_label: 'Проход 3' }] });
  assert.deepEqual(result.visible_objects, [{ entity_ref: { entity_kind: 'g5_site_connection',
    entity_id: 'binding:1' }, display_label: 'Проход 3', recognition: 'known' }]);
  assert.throws(() => projectSpatialV3CurrentVisibleContext({ ...args, siteConnections: [
    { connection_binding_id: 'binding:1', display_label: 'Проход 3' },
    { connection_binding_id: 'binding:1', display_label: 'Проход 3' }] }),
  (error) => error.details?.reason === 'complete_current_exit_disclosure_required');
});
