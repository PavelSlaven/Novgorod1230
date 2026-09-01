import assert from 'node:assert/strict';
import test from 'node:test';
import {
  projectCurrentSceneForNoOperationDirect,
  projectCurrentSceneForVisibleOverlay,
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
  assert.deepEqual(current.current_visible_context.visible_npc.map((npc) => ({
    entity_ref: npc.entity_ref,
    display_label: npc.display_label,
    recognition: npc.recognition
  })), [{
    entity_ref: { entity_kind: 'npc', entity_id: 'onisim' },
    display_label: 'раненый мужчина',
    recognition: 'unrecognized'
  }]);
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
          goal_result: 'not_achieved', operations: [], check: null } }] }
    } }, directSeedKeys: ['turn_step_1'], body: {} });
  assert.deepEqual(direct.visible_npc, current.current_visible_context.visible_npc);
  assert.equal(JSON.stringify(direct).includes('injured_unable_to_walk'), false);
  assert.deepEqual(direct.visible_changes, []);
  assert.deepEqual(direct.uncertainties, []);
  assert.equal(direct.do_not_imply.includes('unconfirmed_attempt_success'), true);
});

test('current scene never promotes an authored NPC name into player knowledge', () => {
  const state = committedState();
  state.npcs.push({
    instance_id: 'unknown', location_ref: 'shed', anchor_id: 'shed-anchor',
    zone_ref: 'yard', identity_state: { display_name: 'Незнакомое имя' }
  });
  const current = withLowerDvinaTraceCurrentScene({
    committedState: state, locationProfiles
  });
  assert.equal(current.current_visible_context.visible_npc.some(
    ({ entity_ref: ref }) => ref.entity_id === 'unknown'), false);
});

test('version zero scene retains safe labels and gains observable cues', () => {
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

test('current scene retains committed co-located physical objects', () => {
  const state = committedState();
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
    items: [{ holder_npc_id: 'onisim', physical_position: 'worn',
      equipment_slot_category_id: 'base_garment', state: {
        visual_profile_snapshot: { schema: 'item_visual_profile_snapshot_v1',
          version: 1, equipment_slot: 'base_garment', neckline: 'round',
          sleeve_form: 'narrow', outer_form: 'none',
          visible_fabric: 'light_linen', trim: 'none',
          main_visible_color: 'undyed_linen',
          secondary_visible_color: 'undyed_linen', headwear_kind: 'none' }
      } }] };
}
