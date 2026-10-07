import assert from 'node:assert/strict';
import test from 'node:test';
import { assertCurrentSceneSelfIdentity } from './lower-dvina-trace-current-scene-self-identity.js';
import {
  projectDirectSeedChanges,
  projectCurrentSceneForNoOperationDirect,
  projectCurrentSceneForVisibleOverlay,
  withLowerDvinaTraceCurrentScene as projectCommittedScene
} from
  '../src/runtime/lower-dvina-trace-turn-step-current-scene.js';
import { projectLowerDvinaTracePlayerSafeState } from
  '../src/runtime/lower-dvina-trace-player-safe-state.js';
import { projectTurnStepModelRequest } from
  '../src/runtime/lower-dvina-trace-turn-step-model-projection.js';
import { factPresentationForRef } from
  '../src/runtime/lower-dvina-trace-scene-presentation.js';
import { createLowerDvinaTraceTurnStepVisibleProjector } from
  '../src/runtime/lower-dvina-trace-turn-step-fire-visible.js';
import { existingItemObservationChanges, lowerDvinaTraceDirectResultChanges,
  lowerDvinaTraceVisibleSceneItems } from
  '../src/runtime/lower-dvina-trace-visible-scene-items.js';

const locationProfiles = [{ location_profile_id: 'shed',
  display_name: 'Старая сушильня', landscape_basis: 'Доски и мокрая трава.',
  economic_basis: 'Пустая сушильня.' }];
const scenePresentation = { locations: [{ location_ref: 'shed',
  display_name: 'Старая сушильня',
  player_visible_physical_facts: [] }] };

function withLowerDvinaTraceCurrentScene(input) {
  return projectCommittedScene({ scenePresentation, ...input });
}

test('current committed scene replaces stale entities, cues, facts, and dialogue title', () => {
  const state = committedState();
  state.current_visible_context.visible_scene = 'Ратша сказала: «Иду к лодкам». ';
  state.current_visible_context.sensory_details = [
    'Старый предмет пахнет смолой.', 'Еремей: Перебирает верёвку.'
  ];
  state.conversation_statements = [{ utterance_text: 'Иду к лодкам.' }];
  state.current_visible_context.visible_npc.push({
    entity_ref: { entity_kind: 'npc', entity_id: 'moved' },
    display_label: 'Еремей', recognition: 'recognized'
  });
  state.current_visible_context.visible_objects = [
    { entity_ref: { entity_kind: 'item', entity_id: 'held' },
      display_label: 'длинная жердь', recognition: 'recognized',
      visible_status: 'available' },
    { entity_ref: { entity_kind: 'item', entity_id: 'removed' },
      display_label: 'старый предмет', recognition: 'recognized',
      visible_status: 'available' }
  ];
  state.current_spatial_context = {
    ...structuredClone(committedState().current_visible_context),
    visible_scene: 'Старая сушильня',
    sensory_details: ['На настиле видны свежие следы.'],
    visible_objects: [{ entity_ref: { entity_kind: 'item', entity_id: 'held' },
      display_label: 'устаревшая жердь', recognition: 'recognized',
      visible_status: 'available' }],
    visible_npc: [{ entity_ref: { entity_kind: 'npc', entity_id: 'onisim' },
      display_label: 'ошибочное имя', recognition: 'recognized',
      observable_cues: { identity: { display_name: 'старый cue' } } }]
  };
  state.current_spatial_context_is_fresh = true;
  state.items = [{ item_id: 'held', name: 'длинная жердь',
    placement: { holder_character_id: 'player', physical_position: 'hands' } }];
  const current = withLowerDvinaTraceCurrentScene({ committedState: state,
    locationProfiles, scenePresentation: { locations: [{
      location_ref: 'shed', display_name: 'Старая сушильня',
      player_visible_physical_facts: ['Под настилом видна вода.']
    }] } }).current_visible_context;

  assert.equal(current.visible_scene, 'Старая сушильня');
  assert.deepEqual(current.sensory_details, ['На настиле видны свежие следы.']);
  assert.deepEqual(current.visible_changes, []);
  assert.equal(current.visible_npc.some(({ entity_ref: ref }) =>
    ref.entity_id === 'moved'), false);
  assert.deepEqual(current.visible_objects.filter(({ entity_ref: ref }) =>
    ref.entity_kind === 'item').map(({ entity_ref: ref, visible_status: status }) =>
    [ref.entity_id, status]), [['held', 'у вас в руках']]);
  assert.equal(JSON.stringify(current).includes('устаревшая жердь'), false);
  assert.equal(JSON.stringify(current).includes('старый cue'), false);
  assert.equal(JSON.stringify(current).includes('Ратша сказала'), false);
  assert.equal(JSON.stringify(current).includes('старый предмет пахнет'), false);
  const withoutApprovedTitle = structuredClone(state);
  delete withoutApprovedTitle.current_spatial_context;
  delete withoutApprovedTitle.scene_presentation;
  withoutApprovedTitle.current_spatial_context_is_fresh = false;
  assert.throws(() => projectCommittedScene({ committedState: withoutApprovedTitle,
    locationProfiles }), { code: 'TRACE_CURRENT_SCENE_PROJECTION_INVALID' });
});

test('approved scene presentation supplies title when fresh Spatial context has no title', () => {
  const state = committedState();
  state.current_spatial_context = { visible_scene: null,
    sensory_details: ['У настила видна вода.'], visible_objects: [],
    known_context: [] };
  state.current_spatial_context_is_fresh = true;
  const current = withLowerDvinaTraceCurrentScene({
    committedState: state, scenePresentation
  }).current_visible_context;
  assert.equal(current.visible_scene, 'Старая сушильня');
  assert.deepEqual(current.sensory_details, ['У настила видна вода.']);
});

test('without fresh Spatial context, the previous package supplies no current facts', () => {
  const state = committedState();
  state.items.push({ item_id: 'board', name: 'обломок доски', state: {},
    placement: { location_ref: 'shed', anchor_id: 'shed-anchor' } });
  state.current_visible_context.visible_scene = 'Да.';
  state.current_visible_context.visible_objects = [
    { entity_ref: { entity_kind: 'item', entity_id: 'board' },
      display_label: 'старая доска', recognition: 'recognized',
      visible_status: 'у вас в руках' },
    { entity_ref: { entity_kind: 'item', entity_id: 'gone' },
      display_label: 'исчезнувшая вещь', recognition: 'recognized',
      visible_status: 'available' },
    { entity_ref: { entity_kind: 'scene_movement_edge', entity_id: 'edge' },
      display_label: 'К проходу во двор', recognition: 'known' }
  ];
  state.current_visible_context.visible_npc = [{
    entity_ref: { entity_kind: 'npc', entity_id: 'moved' },
    display_label: 'Еремей', recognition: 'recognized',
    observable_cues: { identity: { display_name: 'old cue' } }
  }, {
    entity_ref: { entity_kind: 'npc', entity_id: 'onisim' },
    display_label: 'человек', recognition: 'recognized',
    observable_cues: { identity: { display_name: 'stale cue' } }
  }];

  const current = withLowerDvinaTraceCurrentScene({ committedState: state,
    locationProfiles, currentSpatialContextIsFresh: false,
    currentSpatialContextFiltersEntities: false }).current_visible_context;

  assert.equal(current.visible_scene, 'Старая сушильня');
  assert.equal(current.known_context.includes('Да.'), false);
  assert.deepEqual(current.visible_objects.filter(({ entity_ref: ref }) =>
    ref.entity_kind === 'item').map(({ entity_ref: ref, display_label: label,
      visible_status: status }) => [ref.entity_id, label, status]), [
    ['board', 'обломок доски', 'available']
  ]);
  assert.deepEqual(current.visible_objects.filter(({ entity_ref: ref }) =>
    ref.entity_kind === 'scene_movement_edge').map(({ entity_ref: ref }) =>
    ref.entity_id), []);
  assert.deepEqual(current.visible_npc.map(({ entity_ref: ref }) =>
    ref.entity_id), ['onisim']);
  assert.notEqual(JSON.stringify(current).includes('stale cue'), true);
});

test('direct overlay rebuilds current entities instead of forwarding stale package rows', () => {
  const state = committedState();
  delete state.current_spatial_context;
  state.current_spatial_context_is_fresh = false;
  state.current_visible_context.visible_scene = 'Да.';
  state.current_visible_context.visible_objects = [{
    entity_ref: { entity_kind: 'item', entity_id: 'board' },
    display_label: 'старая доска', recognition: 'recognized',
    visible_status: 'у вас в руках'
  }];
  state.current_visible_context.visible_npc[0].observable_cues = {
    identity: { display_name: 'устаревшая внешность' }
  };
  state.items.push({ item_id: 'board', name: 'обломок доски', state: {},
    placement: { location_ref: 'shed', anchor_id: 'shed-anchor' } });

  const visible = projectCurrentSceneForVisibleOverlay({
    input: { retrieved_state: state, consequence: { visible_seed: {} },
      mode_resolution: { decision_trace: { remaining_intent: null,
        step_traces: [] } } }, directSeedKeys: [], body: {}, locationProfiles,
    scenePresentation
  });

  assert.equal(visible.visible_scene, 'Старая сушильня');
  assert.deepEqual(visible.visible_objects.filter(({ entity_ref: ref }) =>
    ref?.entity_kind === 'item').map(({ display_label: label,
      visible_status: status }) => [label, status]), [['обломок доски', 'available']]);
  assert.equal(JSON.stringify(visible).includes('устаревшая внешность'), false);
  assert.equal(visible.visible_objects.some(({ entity_ref: ref }) =>
    ref?.entity_kind === 'scene_movement_edge'), false);
});

test('filtered current Spatial NPCs define the observed committed scene set', () => {
  const state = committedState();
  state.current_spatial_context = {
    ...structuredClone(state.current_spatial_context),
    visible_npc: [structuredClone(state.current_visible_context.visible_npc[0])]
  };
  state.current_spatial_context_is_fresh = true;
  state.current_spatial_context_filters_entities = true;
  state.npcs.push({ instance_id: 'not-observed', location_ref: 'shed',
    anchor_id: 'shed-anchor', zone_ref: 'yard',
    identity_state: { canonical_name: 'Скрытый человек' } });

  const current = withLowerDvinaTraceCurrentScene({ committedState: state,
    locationProfiles }).current_visible_context;

  assert.deepEqual(current.visible_npc.map(({ entity_ref: ref }) => ref.entity_id),
    ['onisim']);
  assert.equal(current.visible_npc.some(({ entity_ref: ref }) =>
    ref.entity_id === 'not-observed'), false);
});

for (const speech of ['Длинная реплика: «Я пойду к лодкам».', 'Да.']) {
  test(`prior ${speech.length < 8 ? 'short' : 'long'} speech is never a current scene title`, () => {
    const state = committedState();
    delete state.current_spatial_context;
    state.current_visible_context.visible_scene = speech;
    state.current_visible_context.known_context.push(speech);
    state.conversation_statements = [{ utterance_text: speech }];
    const current = withLowerDvinaTraceCurrentScene({ committedState: state,
      locationProfiles }).current_visible_context;

    assert.equal(current.visible_scene, 'Старая сушильня');
    assert.equal(current.visible_scene.includes(speech), false);
    assert.equal(current.known_context.includes(speech), false);
  });
}

test('current committed scene replaces stale objects, NPCs, facts, and dialogue title', () => {
  const state = committedState();
  state.current_visible_context.visible_scene = 'Ратша сказала: «Иду к лодкам». ';
  state.current_visible_context.sensory_details = [
    'Старый предмет пахнет смолой.', 'Еремей: Перебирает верёвку.'
  ];
  state.conversation_statements = [{ utterance_text: 'Иду к лодкам.' }];
  state.current_visible_context.visible_npc.push({
    entity_ref: { entity_kind: 'npc', entity_id: 'moved' },
    display_label: 'Еремей', recognition: 'recognized'
  });
  state.current_visible_context.visible_objects = [
    { entity_ref: { entity_kind: 'item', entity_id: 'held' },
      display_label: 'длинная жердь', recognition: 'recognized',
      visible_status: 'available' },
    { entity_ref: { entity_kind: 'item', entity_id: 'removed' },
      display_label: 'старый предмет', recognition: 'recognized',
      visible_status: 'available' }
  ];
  state.items = [{ item_id: 'held', name: 'длинная жердь',
    placement: { holder_character_id: 'player', physical_position: 'hands' } }];
  const current = withLowerDvinaTraceCurrentScene({ committedState: state,
    locationProfiles, scenePresentation: { locations: [{
      location_ref: 'shed', display_name: 'Старая сушильня',
      player_visible_physical_facts: ['Под настилом видна вода.']
    }] } }).current_visible_context;

  assert.equal(current.visible_scene, 'Старая сушильня');
  assert.deepEqual(current.sensory_details, ['Под настилом видна вода.']);
  assert.deepEqual(current.visible_changes, []);
  assert.equal(current.visible_npc.some(({ entity_ref: ref }) =>
    ref.entity_id === 'moved'), false);
  assert.deepEqual(current.visible_objects.filter(({ entity_ref: ref }) =>
    ref.entity_kind === 'item').map(({ entity_ref: ref, visible_status: status }) =>
    [ref.entity_id, status]), [['held', 'у вас в руках']]);
  assert.equal(JSON.stringify(current).includes('Ратша сказала'), false);
  assert.equal(JSON.stringify(current).includes('старый предмет пахнет'), false);
  const withoutPresentation = withLowerDvinaTraceCurrentScene({ committedState: state,
    locationProfiles }).current_visible_context;
  assert.equal(withoutPresentation.visible_scene, 'Старая сушильня');
  assert.deepEqual(withoutPresentation.sensory_details, []);
});

test('current scene rebuilds environment facts from the synchronized approved snapshot', () => {
  const state = committedState();
  state.current_visible_context.visible_changes = [
    'Лето.', 'Светло.', 'Небо ясное.', 'Осадков нет.'
  ];
  state.environment_snapshot = { schema: 'rus.approved_initial_environment.v1',
    season: 'autumn', day_part: 'evening', light_state: 'dark',
    weather_state: { sky: 'overcast', precipitation: 'rain',
      visibility: 'reduced', wind: 'strong' } };
  state.items = [{ item_id: 'boat', name: 'лодка', condition_state: 'damaged',
    physical_facts: ['На борту заметны царапины.'],
    placement: { location_ref: 'shed' } }];

  const current = withLowerDvinaTraceCurrentScene({ committedState: state,
    locationProfiles }).current_visible_context;

  assert.deepEqual(current.visible_changes, ['Осень.', 'Вечер.', 'Темно.',
    'Небо затянуто облаками.', 'Идёт дождь.', 'Видимость снижена.',
    'Сильный ветер.']);
  assert.ok(current.sensory_details.includes('На борту заметны царапины.'));
  assert.doesNotMatch(JSON.stringify(current), /Лето\.|Светло\.|Небо ясное|Осадков нет/u);
});

test('current scene carries disclosed local edge into turn visible package', () => {
  const state = committedState();
  state.current_spatial_context.visible_objects.push({
    entity_ref: { entity_kind: 'scene_movement_edge', entity_id: 'edge' },
    display_label: 'Проход 1', recognition: 'known' });
  state.current_spatial_context_is_fresh = true;
  const current = withLowerDvinaTraceCurrentScene({ committedState: state,
    locationProfiles });
  assert.equal(current.current_visible_context.visible_objects.some((row) =>
    row.entity_ref?.entity_kind === 'scene_movement_edge'
      && row.entity_ref.entity_id === 'edge'), true);
});

test('current scene carries approved directional exit after first turn', () => {
  const state = committedState();
  state.current_spatial_context = {
    ...structuredClone(state.current_visible_context), visible_objects: []
  };
  state.current_spatial_context_is_fresh = true;
  state.current_spatial_context_filters_entities = true;
  state.current_spatial_context_is_fresh = true;
  state.current_spatial_context.visible_objects.push({
    entity_ref: { entity_kind: 'g4_directional_exit', entity_id: 'pine-exit' },
    display_label: 'Продолжить путь — выход 2', recognition: 'known' });
  const current = withLowerDvinaTraceCurrentScene({ committedState: state,
    locationProfiles });
  const movement = current.current_visible_context.visible_objects.filter((row) =>
    ['scene_movement_edge', 'g4_directional_exit', 'g5_site_connection']
      .includes(row.entity_ref?.entity_kind));
  assert.deepEqual(movement.map((row) => row.entity_ref.entity_id), ['pine-exit']);
  assert.equal(current.current_visible_context.visible_objects.some((row) =>
    row.entity_ref?.entity_kind === 'g4_directional_exit'
      && row.entity_ref.entity_id === 'pine-exit'), true);
});

test('current scene carries a disclosed canonical connection after a local move', () => {
  const state = committedState();
  state.current_spatial_context.visible_objects.push({
    entity_ref: { entity_kind: 'g5_site_connection', entity_id: 'binding-1' },
    display_label: 'Проход 3', recognition: 'known' });
  state.current_spatial_context_is_fresh = true;
  const current = withLowerDvinaTraceCurrentScene({ committedState: state, locationProfiles });
  assert.equal(current.current_visible_context.visible_objects.some((row) =>
    row.entity_ref?.entity_kind === 'g5_site_connection'
      && row.entity_ref.entity_id === 'binding-1'), true);
});

test('direct sustained activity exposes the performed attempt without elapsed-time prose', () => {
  const changes = projectDirectSeedChanges({
    input: { consequence: { visible_seed: { turn_step_1: {
      kind: 'semantic_activity', duration_minutes: 60
    } } }, time_update: { semantic_activity_resolutions: [{
      execution: { status: 'completed' }
    }] } },
    directSeedKeys: ['turn_step_1'],
    appliedPlan: { resolution: 'direct', direct_result_kind: null,
      activity: { requested_duration_minutes: 60 },
      interpretation: { grounded_attempt: 'Жду здесь.' } }
  });

  assert.deepEqual(changes, ['Жду здесь.']);
  assert.equal(JSON.stringify(changes).includes('один час'), false);
});

test('N1 visible seed makes the committed observation a required current beat', () => {
  const key = 'turn_step_background_npc_observation_1';
  const seed = { kind: 'background_npc_observation', npc_ref: 'npc:ordinary',
    display_label: 'незнакомого рыбака',
    ordinary_descriptor: 'Коренастый мужчина в мокрой рубахе.' };
  assert.deepEqual(projectDirectSeedChanges({
    input: { consequence: { visible_seed: { [key]: seed } } },
    directSeedKeys: [key]
  }), ['Вы рассмотрели незнакомого рыбака: Коренастый мужчина в мокрой рубахе.']);
  assert.throws(() => projectDirectSeedChanges({
    input: { consequence: { visible_seed: { [key]: {
      ...seed, ordinary_descriptor: '' } } } }, directSeedKeys: [key]
  }), { code: 'TRACE_CURRENT_SCENE_PROJECTION_INVALID' });
});

test('current scene rebuilds co-located NPC cues from committed state', () => {
  const state = committedState();
  state.current_visible_context.visible_npc[0].visible_status =
    'говорит с вами';
  state.current_spatial_context = {
    ...structuredClone(state.current_visible_context),
    visible_npc: []
  };
  state.current_spatial_context_is_fresh = true;
  const current = withLowerDvinaTraceCurrentScene({ committedState: state,
    locationProfiles });
  assert.deepEqual(current.current_visible_context.visible_npc.map((npc) => ({
    entity_ref: npc.entity_ref,
    display_label: npc.display_label,
    recognition: npc.recognition
  })), [{
    entity_ref: { entity_kind: 'npc', entity_id: 'onisim' },
    display_label: 'раненый мужчина',
    recognition: 'unrecognized'
  }]);
  assert.equal(Object.hasOwn(
    current.current_visible_context.visible_npc[0], 'visible_status'), false);
  const cues = current.current_visible_context.visible_npc[0].observable_cues;
  assert.equal(cues.identity.age_category, 'middle_aged');
  assert.equal(cues.identity.appearance.build, 'stocky');
  assert.equal(cues.equipment[0].visual_profile_snapshot.visible_fabric,
    'light_linen');
  assert.equal(cues.outward_presentation.gaze, 'down');
  assert.equal(Object.hasOwn(cues.outward_presentation, 'emotion'), false);
  assert.equal(JSON.stringify(current.current_visible_context).includes(
    'injured_unable_to_walk'), false);
  const projected = projectLowerDvinaTracePlayerSafeState({
    committed_state: current, actor_id: state.actor_id
  }).player_safe_state;
  assert.equal(projected.npcs.find(({ instance_id: id }) => id === 'onisim')
    .body_condition, 'injured_unable_to_walk');
  assert.equal(projected.current_visible_context.visible_npc[0]
    .observable_cues.identity.appearance.build, 'stocky');
  assert.equal(projected.npcs.some(({ instance_id: id }) => id === 'moved'), false);
  assert.equal(projected.npcs.some(({ instance_id: id }) => id === 'hidden'), false);
  assert.equal(current.party_state.state_version, 9);
  assert.deepEqual(current.route_history, state.route_history);
  const direct = projectCurrentSceneForNoOperationDirect({ input: {
    consequence: { status: 'partial', visible_seed: { turn_step_1: {
      kind: 'semantic_activity' } } }, retrieved_state: current, mode_resolution: {
      decision_trace: { remaining_intent: null,
        step_traces: [{ approved_plan: { resolution: 'direct',
          interpretation: { player_goal: 'определить узор на досках',
            grounded_attempt: 'поднести доску к глазам' },
          goal_result: 'not_achieved', operations: [], check: null } }] }
    } }, directSeedKeys: ['turn_step_1'], body: {} });
  assert.deepEqual(direct.visible_npc, current.current_visible_context.visible_npc);
  assert.equal(JSON.stringify(direct).includes('injured_unable_to_walk'), false);
  assert.deepEqual(direct.visible_changes, []);
  assert.deepEqual(direct.uncertainties, []);
  assert.equal(direct.do_not_imply.includes('unconfirmed_attempt_success'), true);
});

test('current scene carries committed scene-read NPCs without leaking authored identity', () => {
  const state = committedState();
  state.position.position_id = 'player-position';
  state.position.g6_instance_id = 'g6-1';
  state.scene_position_g6 = { 'player-position': 'g6-1', 'npc-position': 'g6-1' };
  state.npcs.push({ instance_id: 'scene-npc', location_ref: 'shed',
    position_id: 'npc-position', g6_instance_id: 'g6-1',
    runtime_source: 'party_db_scene_read',
    identity_state: { canonical_name: 'Степан' } });
  state.current_visible_context.visible_npc.push({
    entity_ref: { entity_kind: 'npc', entity_id: 'scene-npc' },
    display_label: 'Степан', recognition: 'known'
  });

  const current = withLowerDvinaTraceCurrentScene({ committedState: state,
    locationProfiles });
  assert.deepEqual(current.current_visible_context.visible_npc.map((npc) => ({
    entity_ref: npc.entity_ref, display_label: npc.display_label,
    recognition: npc.recognition
  })).filter(({ entity_ref }) => entity_ref.entity_id === 'scene-npc'), [{
    entity_ref: { entity_kind: 'npc', entity_id: 'scene-npc' },
    display_label: 'Степан', recognition: 'known'
  }]);
  assert.equal(JSON.stringify(current.current_visible_context).includes(
    'other-location'), false);
});

test('current scene binds safe self identity separately from a namesake NPC across reload', () => {
  assertCurrentSceneSelfIdentity({ committedState, locationProfiles,
    scenePresentation });
});

test('current scene never promotes an authored NPC name into player knowledge', () => {
  const state = committedState();
  state.npcs.push({
    instance_id: 'unknown', location_ref: 'shed', anchor_id: 'shed-anchor',
    zone_ref: 'yard', role_ref: 'fisher', occupation_ref: 'fisher',
    identity_state: { display_name: 'Незнакомое имя' }
  });
  state.current_spatial_context.visible_npc.push({
    entity_ref: { entity_kind: 'npc', entity_id: 'unknown' },
    display_label: 'человек', recognition: 'unrecognized'
  });
  const current = withLowerDvinaTraceCurrentScene({
    committedState: state, locationProfiles
  });
  const unknown = current.current_visible_context.visible_npc.find(
    ({ entity_ref: ref }) => ref.entity_id === 'unknown');
  assert.equal(unknown.display_label, 'человек');
  assert.equal(unknown.recognition, 'unrecognized');
  assert.equal(JSON.stringify(unknown).includes('Незнакомое имя'), false);
});

test('current scene maps actor age into the player-safe portrait vocabulary', () => {
  const state = committedState();
  state.npcs[0].identity_state.age_category = 'young_adult';
  const current = withLowerDvinaTraceCurrentScene({
    committedState: state, locationProfiles
  });
  assert.equal(current.current_visible_context.visible_npc[0]
    .observable_cues.identity.age_category, 'young');
});

test('current scene keeps private NPC schedule summaries out of observations', () => {
  const state = committedState();
  state.npcs[0].machine_state.current_activity = {
    status: 'active', can_continue_automatically: true,
    activity_ref: 'unseen-routine', summary: 'Private schedule instruction.'
  };

  const current = withLowerDvinaTraceCurrentScene({
    committedState: state, locationProfiles
  });

  const npc = current.current_visible_context.visible_npc[0];
  assert.equal(Object.hasOwn(npc, 'visible_status'), false);
  assert.equal(npc.observable_cues.identity.appearance.build, 'stocky');
  assert.equal(npc.observable_cues.equipment.length, 1);
  assert.equal(JSON.stringify(current.current_visible_context)
    .includes('Private schedule instruction.'), false);
});

test('version zero scene uses a safe label and gains committed observable cues', () => {
  const state = committedState();
  state.party_state.state_version = 0;
  const current = withLowerDvinaTraceCurrentScene({
    committedState: state, locationProfiles
  });
  assert.equal(current.current_visible_context.visible_npc[0]
    .display_label, 'раненый мужчина');
  assert.equal(current.current_visible_context.visible_npc[0]
    .recognition, 'unrecognized');
  assert.equal(current.current_visible_context.visible_npc[0]
    .observable_cues.identity.appearance.build, 'stocky');
});

test('version zero scene keeps unnamed carried equipment as a typed label gap', () => {
  const state = committedState();
  state.party_state.state_version = 0;
  state.items.push({ item_id: 'unseen-equipped-layer',
    visual_profile_snapshot: { equipment_slot: 'outer_garment' },
    placement: { holder_character_id: state.actor_id,
      physical_position: 'equipped',
      equipment_slot_category_id: 'outer_garment' } }, {
    item_id: 'unseen-belt-tool', placement: {
      holder_character_id: state.actor_id, physical_position: 'worn_quick' }
  });

  const current = withLowerDvinaTraceCurrentScene({
    committedState: state, locationProfiles
  });

  assert.deepEqual(current.current_visible_context.visible_objects, [{
    entity_ref: { entity_kind: 'item', entity_id: 'unseen-equipped-layer' },
    label_gap: { code: 'player_safe_item_label_required' },
    visible_status: 'при вас'
  }, {
    entity_ref: { entity_kind: 'item', entity_id: 'unseen-belt-tool' },
    label_gap: { code: 'player_safe_item_label_required' },
    visible_status: 'при вас'
  }]);
});

test('version zero scene omits physical facts from unnamed items', () => {
  const state = committedState();
  state.party_state.state_version = 0;
  state.current_visible_context.sensory_details = [];
  state.items = [{ item_id: 'named-item', name: 'весло',
    physical_facts: ['На весле видна зарубка.'],
    placement: { location_ref: 'shed' } },
  { item_id: 'gap-item', physical_facts: ['GAP_ITEM_FACT_MUST_NOT_REACH_MODEL.'],
    placement: { location_ref: 'shed' } }];

  const visible = withLowerDvinaTraceCurrentScene({ committedState: state,
    locationProfiles }).current_visible_context;

  assert.deepEqual(visible.sensory_details, ['На весле видна зарубка.']);
  assert.ok(visible.visible_objects.some((item) =>
    item.entity_ref?.entity_id === 'gap-item'
      && item.label_gap?.code === 'player_safe_item_label_required'));
});

test('current scene resolves approved item template labels and keeps gaps without category fallback', () => {
  const state = committedState();
  state.current_visible_context.uncertainties = ['Сохраняемая неопределённость.'];
  state.items.push({ item_id: 'approved-template-item', template_id: 'tpl-approved',
    physical_facts: ['На ремне закреплён маленький нож.'],
    placement: { location_ref: 'shed', anchor_id: 'shed-anchor' } }, {
    item_id: 'unlabeled-template-item', template_id: 'tpl-gap',
    physical_facts: ['GAP_ITEM_PHYSICAL_FACT_MUST_NOT_REACH_MODEL.'],
    placement: { location_ref: 'shed', anchor_id: 'shed-anchor' }
  });

  const current = withLowerDvinaTraceCurrentScene({ committedState: state,
    locationProfiles, itemLabels: { 'tpl-approved': 'хозяйственный нож' } });

  assert.deepEqual(current.current_visible_context.visible_objects, [{
    entity_ref: { entity_kind: 'item', entity_id: 'approved-template-item' },
    display_label: 'хозяйственный нож', recognition: 'recognized',
    visible_status: 'available'
  }, {
    entity_ref: { entity_kind: 'item', entity_id: 'unlabeled-template-item' },
    label_gap: { code: 'player_safe_item_label_required' },
    visible_status: 'available'
  }]);
  assert.deepEqual(current.current_visible_context.uncertainties,
    ['Сохраняемая неопределённость.']);
  assert.ok(current.current_visible_context.sensory_details.includes(
    'На ремне закреплён маленький нож.'));
  assert.equal(current.current_visible_context.sensory_details.includes(
    'GAP_ITEM_PHYSICAL_FACT_MUST_NOT_REACH_MODEL.'), false);
});

test('item observations omit label gaps and continue with named carried items', () => {
  const items = lowerDvinaTraceVisibleSceneItems([
    { item_id: 'named', name: 'плетёный шнур', condition_state: 'serviceable',
      placement: { holder_character_id: 'player', physical_position: 'hands' } },
    { item_id: 'gap', template_id: 'missing-template', condition_state: 'damaged',
      physical_facts: ['UNNAMED_ITEM_FACT'],
      placement: { holder_character_id: 'player', physical_position: 'worn_quick' } }
  ], { location_ref: 'shore' }, 'player');
  const changes = lowerDvinaTraceDirectResultChanges({ mode_resolution: {
    decision_trace: { step_traces: [{ applied: true, approved_plan: {
      resolution: 'direct', goal_result: 'achieved', operations: [], check: null,
      direct_result_kind: 'player_safe_item_observation'
    } }] }
  } }, items);

  assert.deepEqual(changes, ['При вас находятся плетёный шнур.',
    'Подтверждено пригодное к обычному использованию состояние: плетёный шнур.']);
  assert.deepEqual(existingItemObservationChanges({ item_id: 'gap',
    physical_facts: ['UNNAMED_ITEM_FACT'], placement: {
      holder_character_id: 'player', physical_position: 'worn_quick'
    } }, 'player'), []);
  assert.equal(changes.some((entry) => entry.includes('UNNAMED_ITEM_FACT')), false);
});

test('current scene exposes only authored physical facts, never taxonomy IDs', () => {
  const state = committedState();
  delete state.current_spatial_context;
  state.environment_snapshot = { facts: ['sheltered_from_wind', 'lit_fire'] };
  const current = withLowerDvinaTraceCurrentScene({ committedState: state,
    locationProfiles, scenePresentation: { locations: [{ location_ref: 'shed',
      display_name: 'Старая сушильня',
      player_visible_physical_facts: ['На досках лежит мокрая трава.'] }] } });
  assert.deepEqual(current.current_visible_context.sensory_details,
    ['На досках лежит мокрая трава.']);
  assert.equal(JSON.stringify(current.current_visible_context).includes(
    'sheltered_from_wind'), false);
  assert.equal(JSON.stringify(current.current_visible_context).includes(
    'lit_fire'), false);
});

test('current scene reads arbitrary authored location facts without code phrases', () => {
  const state = committedState();
  delete state.current_spatial_context;
  state.position.location_ref = 'unseen-bank';
  const current = withLowerDvinaTraceCurrentScene({ committedState: state,
    locationProfiles: [], scenePresentation: { locations: [{
      location_ref: 'unseen-bank', display_name: 'тихий берег',
      player_visible_physical_facts: ['Ольха растёт над тёмной водой.']
    }] } });
  assert.deepEqual(current.current_visible_context.sensory_details,
    ['Ольха растёт над тёмной водой.']);
});

test('current owner projection retains an authored fact regardless of the prior presentation', () => {
  const state = committedState();
  delete state.current_spatial_context;
  const fact = 'На досках лежит мокрая трава.';
  state.current_visible_context.sensory_details = [fact];
  const current = withLowerDvinaTraceCurrentScene({ committedState: state,
    scenePresentation: { locations: [{ location_ref: 'shed',
      display_name: 'Старая сушильня', player_visible_physical_facts: [fact] }] } });
  assert.equal(current.current_visible_context.visible_scene, 'Старая сушильня');
  assert.deepEqual(current.current_visible_context.sensory_details, [fact]);
});

test('current scene retains committed co-located physical objects', () => {
  const state = committedState();
  state.current_spatial_context.visible_objects.push({
    entity_ref: { entity_kind: 'item', entity_id: 'reed-bundle' },
    display_label: 'пучок камыша', recognition: 'recognized',
    visible_status: 'available'
  });
  state.items.push({ item_id: 'reed-bundle', name: 'пучок камыша',
    placement: { location_ref: 'shed', anchor_id: 'shed-anchor' } });
  state.items.push({ item_id: 'remote-board', name: 'доска',
    placement: { location_ref: 'camp', anchor_id: 'camp-anchor' } });
  const current = withLowerDvinaTraceCurrentScene({ committedState: state,
    locationProfiles });
  assert.deepEqual(current.current_visible_context.visible_objects, [{
    entity_ref: { entity_kind: 'item', entity_id: 'reed-bundle' },
    display_label: 'пучок камыша', recognition: 'recognized',
    visible_status: 'available'
  }]);
});

test('current scene retains a named item held by the player', () => {
  const state = committedState();
  state.items.push({ item_id: 'held-wool', state: {
    display_name: 'клочок шерсти' }, placement: {
    holder_character_id: state.actor_id, physical_position: 'hands'
  } });
  const current = withLowerDvinaTraceCurrentScene({ committedState: state,
    locationProfiles });
  assert.deepEqual(current.current_visible_context.visible_objects, [{
    entity_ref: { entity_kind: 'item', entity_id: 'held-wool' },
    display_label: 'клочок шерсти', recognition: 'recognized',
    visible_status: 'у вас в руках'
  }]);
});

test('game-created item name from ordinary metadata reaches the planner', () => {
  const state = committedState();
  state.items = [{ item_id: 'runtime-item:wood-block', template_id: null,
    state: { ordinary_metadata: { semantic_type: 'ordinary_wood_piece',
      name: 'обычный деревянный брусок' } },
    placement: { holder_character_id: state.actor_id, physical_position: 'hands' }
  }];
  const scene = withLowerDvinaTraceCurrentScene({ committedState: state,
    locationProfiles });
  const projected = projectLowerDvinaTracePlayerSafeState({
    committed_state: scene, actor_id: state.actor_id
  });
  const planner = projectTurnStepModelRequest({ root_player_action: 'Разделить вещь.',
    player_safe_state: projected.player_safe_state }).request;

  assert.equal(planner.player_safe_state.items.find(({ item_id: id }) =>
    id === 'runtime-item:wood-block')?.name, 'обычный деревянный брусок');
  assert.equal(planner.player_safe_state.current_visible_context.visible_objects
    .find(({ entity_ref: ref }) => ref?.entity_id === 'runtime-item:wood-block')
    ?.display_label, 'обычный деревянный брусок');
});

test('current scene carries committed physical facts of visible items', () => {
  const state = committedState();
  state.current_spatial_context.visible_objects.push({
    entity_ref: { entity_kind: 'item', entity_id: 'used-board' },
    display_label: 'обломки досок', recognition: 'recognized',
    visible_status: 'available'
  });
  state.items.push({ item_id: 'used-board', name: 'обломки досок', state: {
    ordinary_metadata: { semantic_facts: [{ fact_id: 'platform:1',
      text: 'обломки уложены как простой настил' }] }
  }, placement: { location_ref: 'shed', anchor_id: 'shed-anchor' } });
  const current = withLowerDvinaTraceCurrentScene({ committedState: state,
    locationProfiles });
  assert.deepEqual(current.current_visible_context.sensory_details,
    ['обломки уложены как простой настил']);
  assert.deepEqual(current.current_visible_context.visible_objects, [{
    entity_ref: { entity_kind: 'item', entity_id: 'used-board' },
    display_label: 'обломки досок', recognition: 'recognized',
    visible_status: 'available'
  }]);
});

test('fresh scene does not inherit item facts without item perception', () => {
  const state = committedState();
  state.current_spatial_context = { visible_scene: null,
    sensory_details: ['У берега видна вода.'], visible_objects: [],
    visible_npc: [], known_context: [] };
  state.current_spatial_context_is_fresh = true;
  state.current_spatial_context_filters_entities = true;
  state.items = [{ item_id: 'used-board', name: 'обломки досок',
    physical_facts: ['обломки уложены как простой настил'],
    placement: { location_ref: 'shed', anchor_id: 'shed-anchor' } }];

  const current = withLowerDvinaTraceCurrentScene({ committedState: state,
    locationProfiles });

  assert.deepEqual(current.current_visible_context.sensory_details,
    ['У берега видна вода.']);
});

test('fact presentation reads an unseen committed fact generically', () => {
  const presentation = factPresentationForRef({ scenePresentation: {
    fact_presentations: [{ fact_ref: 'unseen:fact', text: 'На камне видна свежая зарубка.',
      source_basis: 'committed_player_visible_observation',
      perception_requirement: 'committed_observation' }]
  }, factRef: 'unseen:fact' });
  assert.equal(presentation.text, 'На камне видна свежая зарубка.');
});

test('in-place production forbids narration from inventing source relocation', () => {
  const state = committedState();
  const visible = projectCurrentSceneForVisibleOverlay({ input: {
    consequence: { status: 'resolved', visible_seed: { turn_step_1: {
      change: 'physical_change', physical_description: 'Доска стала опорой.'
    } } }, retrieved_state: state, mode_resolution: { decision_trace: {
      remaining_intent: null, step_traces: [{ approved_plan: {
        resolution: 'domain_request', goal_result: 'pending', operations: [{
          op: 'request_item_use', action_production: {
            source_refs: ['item:board']
          }
        }]
      } }]
    } }
  }, directSeedKeys: ['turn_step_1'], body: {} });

  assert.equal(visible.do_not_imply.includes(
    'uncommitted_action_production_source_relocation'), true);
});

test('a full pair of hands is narrated as a physical limit', () => {
  const visible = projectCurrentSceneForVisibleOverlay({ input: {
    consequence: { status: 'partial', visible_seed: { turn_step_1: {
      change: 'move_blocked', reason: 'hands_full',
      entity_ref: 'item:rope', display_label: 'кусок верёвки'
    } } },
    retrieved_state: committedState(),
    mode_resolution: { decision_trace: { remaining_intent: null,
      step_traces: [] } }
  }, directSeedKeys: ['turn_step_1'], body: {} });

  assert.deepEqual(visible.visible_changes,
    ['Вы не смогли взять кусок верёвки: руки заняты.']);
});

test('direct player-safe observation does not replay previous-package sensory facts', () => {
  const state = committedState();
  state.current_visible_context.sensory_details = ['Низкое сырое небо.'];
  state.current_visible_context.visible_objects = [{
    entity_ref: { entity_kind: 'item', entity_id: 'unseen-cloak' },
    display_label: 'верхняя одежда', recognition: 'recognized',
    visible_status: 'при вас'
  }];
  state.items.push({ item_id: 'unseen-cloak', name: 'верхняя одежда',
    placement: { holder_character_id: state.actor_id, physical_position: 'worn' } });
  const visible = projectCurrentSceneForNoOperationDirect({ input: {
    consequence: { status: 'resolved', visible_seed: {} },
    retrieved_state: state, mode_resolution: { decision_trace: {
      remaining_intent: null, step_traces: [{ approved_plan: {
        resolution: 'direct', goal_result: 'achieved', operations: [],
        check: null, direct_result_kind: 'player_safe_observation'
      }, applied: true }] } }
  }, directSeedKeys: [], body: {} });

  assert.deepEqual(visible.visible_changes,
    ['Вы внимательно изучили обстановку.', 'В поле зрения — раненый мужчина.']);
  assert.deepEqual(visible.sensory_details, []);
  assert.equal(visible.visible_objects[0].display_label, 'верхняя одежда');
  assert.deepEqual(visible.uncertainties, []);
  assert.deepEqual(lowerDvinaTraceDirectResultChanges({
    mode_resolution: { decision_trace: { step_traces: [{ applied: true,
      approved_plan: { resolution: 'direct', goal_result: 'achieved',
        operations: [], check: null, reason_code: 'player_safe_observation' }
    }] } }
  }), []);
  assert.deepEqual(lowerDvinaTraceDirectResultChanges({
    mode_resolution: { decision_trace: { step_traces: [{ applied: true,
      approved_plan: { resolution: 'direct', goal_result: 'achieved',
        operations: [], check: null, direct_result_kind: 'no_state_gesture' }
    }] } }
  }), ['Вы завершили простой жест.']);
  assert.deepEqual(lowerDvinaTraceDirectResultChanges({
    mode_resolution: { decision_trace: { step_traces: [{ applied: true,
      approved_plan: { resolution: 'direct', goal_result: 'partially_achieved',
        operations: [], check: null,
        direct_result_kind: 'player_safe_body_observation' }
    }] } }
  }, [], { active_conditions: [{ id: 'hand_soreness',
    label: 'болезненность кисти' }] }), [
    'Подтверждённые вам телесные состояния: болезненность кисти.',
    'Новое повреждение или диагноз этим осмотром не установлены.'
  ]);
  const unlabeled = lowerDvinaTraceDirectResultChanges({ mode_resolution: {
    decision_trace: { step_traces: [{ applied: true, approved_plan: {
      resolution: 'direct', goal_result: 'partially_achieved', operations: [],
      check: null, direct_result_kind: 'player_safe_body_observation'
    } }] }
  } }, [], { active_conditions: [{ id: 'hand_soreness' }] });
  assert.equal(unlabeled.some((change) => change.includes('hand_soreness')),
    false);
});

test('fresh authoritative NPC presence retains labels of the same perceived people', () => {
  const state = committedState();
  const oldSpeech = 'Я Влас.';
  const oldBackground = 'На прежнем месте клубился дым.';
  const npc = (id, label, recognition = 'unrecognized') => ({
    entity_ref: { entity_kind: 'npc', entity_id: id },
    display_label: label, recognition
  });
  state.items = [];
  state.npcs = ['retained-a', 'retained-b', 'named', 'incoming', 'departed']
    .map((id) => ({ instance_id: id, location_ref: 'shed',
      anchor_id: 'shed-anchor', zone_ref: 'yard',
      identity_state: { canonical_name: 'Нераскрытое имя' } }));
  state.current_visible_context = {
    ...structuredClone(state.current_visible_context),
    visible_scene: oldSpeech, visible_changes: [oldSpeech],
    sensory_details: [oldBackground], known_context: [oldBackground],
    visible_npc: [npc('retained-a', 'коренастый рыбак'),
      npc('retained-b', 'седой мужчина'), npc('named', 'мужчина с веслом'),
      npc('departed', 'человек в плаще')]
  };
  for (const [index, build] of [[0, 'stocky'], [1, 'slim']]) {
    state.current_visible_context.visible_npc[index].observable_cues = {
      identity: { appearance: { build } }, equipment: [], outward_presentation: {}
    };
  }
  state.conversation_statements = [{ statement_id: 'heard-intro',
    speaker_ref: { entity_kind: 'npc', entity_id: 'named' },
    utterance_text: oldSpeech }];
  state.received_messages = [{
    source_statement_ref: { entity_kind: 'conversation_statement',
      entity_id: 'heard-intro' },
    listener_ref: { entity_kind: 'player_character', entity_id: 'player' },
    speaker_ref: { entity_kind: 'npc', entity_id: 'named' },
    comprehension: 'full', utterance_text: oldSpeech
  }];
  state.current_spatial_context = {
    ...structuredClone(state.current_visible_context),
    visible_scene: 'Старая сушильня', visible_changes: [],
    sensory_details: ['У настила видна вода.'], known_context: [],
    visible_npc: [npc('retained-a', 'человек'), npc('retained-b', 'человек'),
      npc('named', 'человек'), npc('incoming', 'незнакомый лодочник')]
  };
  state.current_spatial_context_is_fresh = true;
  state.current_spatial_context_filters_entities = true;
  state.current_spatial_context.visible_npc[3].observable_cues = {
    identity: { appearance: { build: 'average' } }, equipment: [], outward_presentation: {}
  };

  const current = withLowerDvinaTraceCurrentScene({
    committedState: state
  }).current_visible_context;

  assert.deepEqual(current.visible_npc.map(({ entity_ref }) => entity_ref.entity_id),
    ['retained-a', 'retained-b', 'named', 'incoming'],
    'fresh Spatial alone decides which people remain visible');
  assert.equal(current.visible_scene, 'Старая сушильня');
  assert.deepEqual(current.sensory_details, ['У настила видна вода.']);
  for (const stale of [oldSpeech, oldBackground, 'человек в плаще', 'Нераскрытое имя']) {
    assert.equal(JSON.stringify(current).includes(stale), false,
      'remembering a visible person must not restore old speech, scenery or private names');
  }
  assert.deepEqual(current.visible_npc.map(({ entity_ref, display_label, recognition,
    observable_cues }) => [entity_ref.entity_id, display_label, recognition,
      observable_cues?.identity?.appearance?.build ?? null]), [
    ['retained-a', 'коренастый рыбак', 'unrecognized', 'stocky'],
    ['retained-b', 'седой мужчина', 'unrecognized', 'slim'],
    ['named', 'Влас', 'recognized', null],
    ['incoming', 'незнакомый лодочник', 'unrecognized', 'average']
  ], 'same-entity perceptions survive generic fresh labels, while heard names win');
});

function committedState() {
  const state = { actor_id: 'player', party_state: { state_version: 9 },
    position: { location_ref: 'shed', g5_anchor_id: 'shed-anchor', zone_ref: 'yard' },
    current_visible_context: { version: 1,
      schema: 'visible_context_package', visible_scene: 'Старая сушильня',
      visible_changes: [], sensory_details: [], visible_npc: [{
        entity_ref: { entity_kind: 'npc', entity_id: 'onisim' },
        display_label: 'раненый мужчина', recognition: 'unrecognized' }],
      visible_objects: [], known_context: [], uncertainties: [],
      allowed_tensions: [], do_not_imply: [] },
    route_history: [{ route_ref: 'camp-shed' }], npcs: [{ instance_id: 'onisim',
      location_ref: 'shed', anchor_id: 'shed-anchor', zone_ref: 'yard',
      identity_state: { canonical_name: 'Онисим', sex_category: 'male',
        age_category: 'middle_aged', appearance: { build: 'stocky',
          skin_tone: 'light', face_shape: 'angular', hair: { color: 'dark_brown',
            length: 'short', style: 'straight', facial_hair: 'full_beard' },
          eyes: { color: 'gray' } } },
      player_safe_presentation: { gaze: 'down', body_pose: 'three_quarter',
        emotion: 'private_motive' },
      machine_state: {
        body_condition: { state: 'injured_unable_to_walk' }
      } }, { instance_id: 'moved', location_ref: 'camp', anchor_id: 'shed-anchor',
      zone_ref: 'yard', identity_state: { canonical_name: 'Еремей' } },
    { instance_id: 'hidden', location_ref: 'shed', anchor_id: 'shed-anchor',
      zone_ref: 'yard', visibility_state: 'hidden',
      identity_state: { canonical_name: 'Ратша' } }],
    items: [{ item_id: 'item:onisim-shirt', placement: {
      holder_npc_id: 'onisim', physical_position: 'worn',
      equipment_slot_category_id: 'base_garment'
    }, state: {
        visual_profile_snapshot: { schema: 'item_visual_profile_snapshot_v1',
          version: 1, equipment_slot: 'base_garment', neckline: 'round',
          sleeve_form: 'narrow', outer_form: 'none',
          visible_fabric: 'light_linen', trim: 'none',
          main_visible_color: 'undyed_linen',
          secondary_visible_color: 'undyed_linen', headwear_kind: 'none' }
      } }] };
  state.current_spatial_context = state.current_visible_context;
  state.location_profiles = locationProfiles;
  state.current_spatial_context_is_fresh = false;
  state.current_spatial_context_filters_entities = false;
  state.scene_presentation = scenePresentation;
  return state;
}
