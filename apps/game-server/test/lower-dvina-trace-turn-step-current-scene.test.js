import assert from 'node:assert/strict';
import test from 'node:test';
import {
  projectCurrentSceneForNoOperationDirect,
  withLowerDvinaTraceCurrentScene
} from
  '../src/runtime/lower-dvina-trace-turn-step-current-scene.js';
import { projectLowerDvinaTracePlayerSafeState } from
  '../src/runtime/lower-dvina-trace-player-safe-state.js';
import { factPresentationForRef } from
  '../src/runtime/lower-dvina-trace-scene-presentation.js';

const locationProfiles = [{ location_profile_id: 'shed',
  display_name: 'Старая сушильня', landscape_basis: 'Доски и мокрая трава.',
  economic_basis: 'Пустая сушильня.' }];

test('current scene keeps prior player-safe co-located NPC observations only', () => {
  const state = committedState();
  const current = withLowerDvinaTraceCurrentScene({ committedState: state,
    locationProfiles });
  assert.deepEqual(current.current_visible_context.visible_npc, [{
    entity_ref: { entity_kind: 'npc', entity_id: 'onisim' },
    display_label: 'раненый мужчина',
    recognition: 'unrecognized'
  }]);
  assert.equal(current.current_visible_context.known_context.includes(
    'раненый мужчина: injured_unable_to_walk'), true);
  const projected = projectLowerDvinaTracePlayerSafeState({
    committed_state: current, actor_id: state.actor_id
  }).player_safe_state;
  assert.equal(projected.npcs.find(({ instance_id: id }) => id === 'onisim')
    .body_condition, 'injured_unable_to_walk');
  assert.equal(projected.npcs.some(({ instance_id: id }) => id === 'moved'), false);
  assert.equal(projected.npcs.some(({ instance_id: id }) => id === 'hidden'), false);
  assert.equal(current.party_state.state_version, 9);
  assert.deepEqual(current.route_history, state.route_history);
  const direct = projectCurrentSceneForNoOperationDirect({ input: {
    consequence: { status: 'partial', visible_seed: { turn_step_1: {
      kind: 'semantic_activity' } } }, retrieved_state: current, mode_resolution: {
      decision_trace: { remaining_intent: null,
        step_traces: [{ approved_plan: { resolution: 'direct',
          goal_result: 'not_achieved', operations: [], check: null } }] }
    } }, directSeedKeys: ['turn_step_1'], body: {} });
  assert.deepEqual(direct.visible_npc, current.current_visible_context.visible_npc);
  assert.equal(direct.known_context.includes(
    'раненый мужчина: injured_unable_to_walk'),
    true);
  assert.deepEqual(direct.visible_changes,
    ['Прошло некоторое время.']);
  assert.deepEqual(direct.uncertainties, ['Задуманное не удалось.']);
});

test('current scene exposes only authored physical facts, never taxonomy IDs', () => {
  const state = committedState();
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
  state.position.location_ref = 'unseen-bank';
  const current = withLowerDvinaTraceCurrentScene({ committedState: state,
    locationProfiles: [], scenePresentation: { locations: [{
      location_ref: 'unseen-bank', display_name: 'тихий берег',
      player_visible_physical_facts: ['Ольха растёт над тёмной водой.']
    }] } });
  assert.deepEqual(current.current_visible_context.sensory_details,
    ['Ольха растёт над тёмной водой.']);
});

test('fact presentation reads an unseen committed fact generically', () => {
  const presentation = factPresentationForRef({ scenePresentation: {
    fact_presentations: [{ fact_ref: 'unseen:fact', text: 'На камне видна свежая зарубка.',
      source_basis: 'committed_player_visible_observation',
      perception_requirement: 'committed_observation' }]
  }, factRef: 'unseen:fact' });
  assert.equal(presentation.text, 'На камне видна свежая зарубка.');
});

function committedState() {
  return { actor_id: 'player', party_state: { state_version: 9 },
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
      identity_state: { canonical_name: 'Онисим' }, machine_state: {
        body_condition: { state: 'injured_unable_to_walk' }
      } }, { instance_id: 'moved', location_ref: 'camp', anchor_id: 'shed-anchor',
      zone_ref: 'yard', identity_state: { canonical_name: 'Еремей' } },
    { instance_id: 'hidden', location_ref: 'shed', anchor_id: 'shed-anchor',
      zone_ref: 'yard', visibility_state: 'hidden',
      identity_state: { canonical_name: 'Ратша' } }] };
}
