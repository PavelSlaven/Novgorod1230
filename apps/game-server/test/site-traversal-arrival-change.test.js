import assert from 'node:assert/strict';
import test from 'node:test';
import { createLowerDvinaTraceTurnStepVisibleProjector } from '../src/runtime/lower-dvina-trace-turn-step-fire-visible.js';

// Current-position facts recorded by lead-r3b h7's spatial owner.
const destinationFacts = [
  'Поверхность покрыта илистым и глинистым грунтом.',
  'Местность низкая и ровная.',
  'Виден речной проток.',
  'Видна кромка берега.',
  'Видны отдельные деревья.',
  'Виден нижний ярус растительности.',
  'Землю покрывают трава, осоки и кустарник.',
  'У воды видна растительность.',
  'На поверхности видны остатки трав и осок, обломки кустарниковых ветвей.'
];
const destination = (overrides = {}) => ({ schema: 'visible_context_package', version: 1,
  visible_scene: 'Окрестности.', visible_changes: [], sensory_details: destinationFacts, visible_npc: [],
  visible_objects: [], known_context: [], uncertainties: [], allowed_tensions: [], do_not_imply: [], ...overrides });
const traversal = (context, origin = 'generated') => ({ position_transition: { owner: '@rus/turn/spatial-v3-site-connection-traversal' },
  visible_seed: { destination_site_origin: origin,
    destination_visible_context: context } });

test('site arrival reports a grounded change with destination perception', async () => {
  const projector = createLowerDvinaTraceTurnStepVisibleProjector({
    fallback: { project: async () => assert.fail('a site traversal is projected from its destination') } });
  const result = await projector.project({ consequence: traversal(destination()) });
  assert.deepEqual(result.visible_changes,
    ['Вы прибыли. Поверхность покрыта илистым и глинистым грунтом.']);
  assert.equal(result.visible_scene, 'Окрестности.');
  assert.deepEqual(result.sensory_details, destinationFacts);
  const changed = await projector.project({ consequence: traversal(destination({
    sensory_details: ['Виден речной проток.'] })) });
  assert.deepEqual(changed.sensory_details, ['Виден речной проток.']);
  assert.deepEqual(changed.visible_changes,
    ['Вы прибыли. Виден речной проток.']);
  const withoutFacts = await projector.project({ consequence: traversal(destination({
    sensory_details: []
  })) });
  assert.deepEqual(withoutFacts.visible_changes, ['Вы прибыли.']);
  assert.deepEqual(withoutFacts.sensory_details, []);
  assert.equal(withoutFacts.visible_scene, 'Окрестности.');
  const missingFacts = await projector.project({ consequence: traversal(destination({
    sensory_details: undefined
  })) });
  assert.deepEqual(missingFacts.visible_changes, ['Вы прибыли.']);
  assert.deepEqual(missingFacts.sensory_details, []);

  const precommitDestination = await projector.project({ consequence: traversal(destination({
    visible_npc: [{ entity_ref: { entity_kind: 'npc', entity_id: 'npc:g5' },
      display_label: 'незнакомец', recognition: 'unrecognized',
      observable_cues: { identity: { display_name: 'скрытое имя' } } }],
    visible_objects: [{ entity_ref: { entity_kind: 'item', entity_id: 'item:g5' },
      display_label: 'нож', recognition: 'recognized', visible_status: 'available' }]
  })) });
  assert.deepEqual(precommitDestination.visible_npc, []);
  assert.deepEqual(precommitDestination.visible_objects, []);
  assert.equal(JSON.stringify(precommitDestination).includes('скрытое имя'), false);
  assert.equal(JSON.stringify(precommitDestination).includes('item:g5'), false);

  const heldItem = { entity_ref: { entity_kind: 'item', entity_id: 'item:held' },
    display_label: 'плащ', recognition: 'recognized', visible_status: 'при вас' };
  const generatedProjector = createLowerDvinaTraceTurnStepVisibleProjector({
    fallback: { project: async () => assert.fail('site traversal uses destination scene') },
    projectCurrentScene: () => ({ current_visible_context: {
      visible_objects: [heldItem, { entity_ref: {
        entity_kind: 'item', entity_id: 'item:destination' },
      display_label: 'сеть', visible_status: 'available' }],
      visible_npc: [{ entity_ref: { entity_kind: 'npc', entity_id: 'npc:source' } }]
    } })
  });
  const generatedArrival = await generatedProjector.project({
    consequence: { ...traversal(destination({ sensory_details: [],
      visible_npc: [{ entity_ref: { entity_kind: 'npc', entity_id: 'npc:g5' } }],
      visible_objects: [{ entity_ref: {
        entity_kind: 'item', entity_id: 'item:g5' }, visible_status: 'available' }]
    }), 'generated'), position_transition: { owner: '@rus/turn/spatial-v3-site-connection-traversal',
      destination_site_id: 'site:generated', to_position_ref: 'position:generated',
      destination_g6_instance_id: 'g6:generated' } },
    retrieved_state: { actor_id: 'actor:test', items: [{ item_id: 'item:held',
      placement: { holder_character_id: 'actor:test' } }], first_entry_preparation: {
      spatial_v3: { target: { status: 'prepared',
        position_id: 'position:generated', g6_instance_id: 'g6:generated' } }
    } }
  });
  assert.deepEqual(generatedArrival.sensory_details, []);
  assert.deepEqual(generatedArrival.visible_npc, []);
  assert.deepEqual(generatedArrival.visible_objects, [heldItem]);
  assert.deepEqual(generatedArrival.visible_changes, ['Вы прибыли.']);

  const committedNpc = { entity_ref: { entity_kind: 'npc', entity_id: 'npc:committed' },
    display_label: 'рыбак', recognition: 'unrecognized' };
  const committedItem = { entity_ref: { entity_kind: 'item', entity_id: 'item:committed' },
    display_label: 'сеть', recognition: 'known', visible_status: 'available' };
  const afterClock = { day: 2, hour: 18 };
  let loadedRequest;
  const committedProjector = createLowerDvinaTraceTurnStepVisibleProjector({
    fallback: { project: async () => assert.fail('site traversal uses destination scene') },
    partyId: 'party:test',
    loadPreparedMovementScene: async (request) => {
      loadedRequest = structuredClone(request);
      return { ...request.state, npcs: [{ instance_id: 'npc:committed' }],
        current_visible_context: null };
    },
    projectCurrentScene: (state) => ({ current_visible_context: {
      ...state.current_spatial_context,
      visible_npc: [committedNpc], visible_objects: [committedItem]
    } })
  });
  const committedDestination = await committedProjector.project({
    consequence: { ...traversal(destination({
      visible_npc: [{ entity_ref: { entity_kind: 'npc', entity_id: 'npc:stale' } }],
      visible_objects: [{ entity_ref: { entity_kind: 'item', entity_id: 'item:stale' } }]
    }), 'canonical'), position_transition: { owner: '@rus/turn/spatial-v3-site-connection-traversal',
      destination_site_id: 'site:committed', to_position_ref: 'position:destination',
      destination_g6_instance_id: 'g6:destination' } },
    time_update: { clock_after: afterClock },
    retrieved_state: { actor_id: 'actor:test', position: { site_id: 'site:source' },
      journey_location: { scene_position_id: 'position:source' },
      first_entry_preparation: { spatial_v3: { target: { status: 'prepared',
        position_id: 'position:destination', g6_instance_id: 'g6:destination' } } } }
  });
  assert.deepEqual(committedDestination.visible_npc, [committedNpc]);
  assert.deepEqual(committedDestination.visible_objects, [committedItem]);
  assert.deepEqual(loadedRequest.state.position, {
    site_id: 'site:committed', position_id: 'position:destination',
    g6_id: 'g6:destination', g6_instance_id: 'g6:destination'
  });
  assert.deepEqual(loadedRequest.state.journey_location, {
    scene_position_id: 'position:destination'
  });
  assert.deepEqual(loadedRequest.clock, afterClock);

  await assert.rejects(() => committedProjector.project({
    consequence: traversal(destination(), 'unknown')
  }), { code: 'TRACE_SITE_TRAVERSAL_DESTINATION_ORIGIN_INVALID' });
});

test('local movement does not turn a label without approved line provenance into prose', async () => {
  const fallback = { project: async () => ({
    version: 1, schema: 'visible_context_package',
    visible_scene: 'рыбацкий стан', visible_changes: [], sensory_details: [],
    visible_npc: [], visible_objects: [], known_context: [], uncertainties: [],
    allowed_tensions: [], do_not_imply: []
  }) };
  const projector = createLowerDvinaTraceTurnStepVisibleProjector({ fallback });
  const movement = (label) => ({ phase3_kind: 'movement', visible_seed: {
    destination_movement_objects: [], movement_display_label: label
  } });
  for (const label of ['Проход 2', 'Уйти по тропе']) {
    const result = await projector.project({ consequence: movement(label) });
    assert.deepEqual(result.visible_changes, []);
  }
});
