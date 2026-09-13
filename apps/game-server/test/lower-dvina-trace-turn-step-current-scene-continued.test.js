import assert from 'node:assert/strict';
import test from 'node:test';
import { assertCurrentSceneSelfIdentity } from './lower-dvina-trace-current-scene-self-identity.js';
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
import { createLowerDvinaTraceTurnStepVisibleProjector } from
  '../src/runtime/lower-dvina-trace-turn-step-fire-visible.js';
import { lowerDvinaTraceDirectResultChanges } from
  '../src/runtime/lower-dvina-trace-visible-scene-items.js';

const locationProfiles = [{ location_profile_id: 'shed',
  display_name: 'Старая сушильня', landscape_basis: 'Доски и мокрая трава.',
  economic_basis: 'Пустая сушильня.' }];

test('carried item observation exposes concrete player-safe belongings', () => {
  const state = committedState();
  state.items.push({ item_id: 'case', name: 'кожаный футляр',
    condition_state: 'serviceable', placement: {
      holder_character_id: state.actor_id, physical_position: 'worn_quick'
    } }, { item_id: 'flask', name: 'глиняная фляга',
    condition_state: 'damaged', placement: {
      holder_character_id: state.actor_id, physical_position: 'hands'
    } }, { item_id: 'nearby-log', name: 'полено',
    condition_state: 'serviceable', placement: {
      location_ref: 'shed', anchor_id: 'shed-anchor'
    } });
  const current = withLowerDvinaTraceCurrentScene({
    committedState: state, locationProfiles
  });
  const visible = projectCurrentSceneForNoOperationDirect({ input: {
    consequence: { status: 'resolved', visible_seed: {} },
    retrieved_state: current, mode_resolution: { decision_trace: {
      remaining_intent: null, step_traces: [{ applied: true, approved_plan: {
        resolution: 'direct', goal_result: 'achieved', operations: [],
        check: null, direct_result_kind: 'player_safe_item_observation'
      } }] } }
  }, directSeedKeys: [], body: {} });

  assert.deepEqual(visible.visible_changes, [
    'При вас находятся кожаный футляр и глиняная фляга.',
    'Подтверждено пригодное к обычному использованию состояние: кожаный футляр.',
    'Подтверждено повреждённое состояние: глиняная фляга.'
  ]);
  assert.equal(visible.visible_changes.some((change) =>
    change.includes('полено')), false);
});

test('body observation projects the current confirmed condition without a body write',
  async () => {
    const projector = createLowerDvinaTraceTurnStepVisibleProjector({
      fallback: { project: async () => assert.fail('fallback not expected') }
    });
    const state = committedState();
    state.body_state = { active_conditions: [{ id: 'hand_soreness',
      label: 'болезненность кисти' }] };
    const visible = await projector.project({
      consequence: { status: 'resolved', visible_seed: {
        completed_steps: [{ step_index: 1, summary: 'осмотреть кисть' }]
      } },
      retrieved_state: state,
      mode_resolution: { decision_trace: { remaining_intent: null,
        step_traces: [{ applied: true, approved_plan: {
          resolution: 'direct', goal_result: 'partially_achieved',
          operations: [], check: null,
          direct_result_kind: 'player_safe_body_observation'
        } }] } }
    });
    assert.equal(visible.visible_changes.includes(
      'Подтверждённые вам телесные состояния: болезненность кисти.'), true);
  });

test('ordinary scene seed augments the current scene in the same turn', async () => {
  const projector = createLowerDvinaTraceTurnStepVisibleProjector({
    fallback: { project: async () => assert.fail('fallback not expected') }
  });
  const state = committedState();
  state.current_visible_context.sensory_details = ['Мокрый песок у воды.'];
  const visible = await projector.project({
    consequence: { status: 'resolved', visible_seed: {
      completed_steps: [{ step_index: 1, summary: 'осмотреть берег' }],
      ordinary_scene_seed: { kind: 'ordinary_scene_seed',
        sensory_details: ['В ивняке застряли плавник и речной сор.'] }
    } },
    retrieved_state: state,
    body_update: { state_after: {} },
    mode_resolution: { decision_trace: { remaining_intent: null,
      step_traces: [{ approved_plan: { resolution: 'domain_request',
        goal_result: 'pending', operations: [{ op: 'request_discovery' }],
        check: null } }] } }
  });
  assert.deepEqual(visible.sensory_details,
    ['Мокрый песок у воды.',
      'В ивняке застряли плавник и речной сор.']);
  assert.deepEqual(visible.visible_npc.map(({ entity_ref, display_label,
    recognition }) => ({ entity_ref, display_label, recognition })),
  state.current_visible_context.visible_npc);
  assert.equal(JSON.stringify(visible).includes('ordinary_scene_seed'), false);
});

for (const [resolution, change] of Object.entries({
  absent: 'По этому вопросу отсутствие установлено',
  no_change: 'Результат по этому вопросу не установлен',
  authority_required: 'Имеющихся данных недостаточно для ответа'
})) {
  test(`persisted ordinary ${resolution} result is visible to the player`, async () => {
    const projector = createLowerDvinaTraceTurnStepVisibleProjector({
      fallback: { project: async () => assert.fail('fallback not expected') }
    });
    const visible = await projector.project({
      consequence: { status: 'resolved', visible_seed: {
        ordinary_scene_seed: { kind: 'ordinary_scene_seed',
          sensory_details: ['На песке остались следы от пешни.'] },
        ordinary_presence_seed: { kind: 'ordinary_presence_seed', resolution,
          query: '  Найти мою грамоту или личную вещь  ' }
      } },
      retrieved_state: committedState(), body_update: { state_after: {} },
      mode_resolution: { decision_trace: { remaining_intent: null,
        step_traces: [{ approved_plan: { resolution: 'domain_request',
          goal_result: 'pending', operations: [{ op: 'request_discovery' }],
          check: null } }] } }
    });
    const result = `${change}: «  Найти мою грамоту или личную вещь  ».`;
    assert.deepEqual(visible.visible_changes, ['На песке остались следы от пешни.',
      ...(resolution === 'absent' ? [result] : [])]);
    assert.deepEqual(visible.uncertainties, resolution === 'absent' ? [] : [result]);
    assert.equal(visible.visible_scene, committedState().current_visible_context.visible_scene);
    assert.deepEqual(visible.visible_objects, committedState().current_visible_context.visible_objects);
    assert.ok(visible.do_not_imply.includes(
      'discovery_query_as_existence_ownership_or_executed_action'));
  });
}

test('unfinished domain prerequisite preserves the scene without inventing partial success', async () => {
  const projector = createLowerDvinaTraceTurnStepVisibleProjector({
    fallback: { project: async () => assert.fail('fallback not expected') }
  });
  const state = committedState();
  state.current_visible_context.sensory_details = ['На досках лежит мокрая трава.'];
  const visible = await projector.project({
    consequence: { status: 'partial', visible_seed: { completed_steps: [] } },
    retrieved_state: state, body_update: { state_after: {} },
    mode_resolution: { decision_trace: { remaining_intent: 'Скрутить траву в жгут.',
      step_traces: [{ approved_plan: { resolution: 'domain_request',
        goal_result: 'pending', operations: [{ op: 'request_discovery' }], check: null } }] } }
  });
  assert.equal(visible.visible_scene, state.current_visible_context.visible_scene);
  assert.deepEqual(visible.sensory_details, ['На досках лежит мокрая трава.']);
  assert.deepEqual(visible.visible_changes, []);
  assert.equal(visible.uncertainties.some((value) =>
    value.includes('Скрутить траву в жгут.')), false);
  assert.ok(visible.do_not_imply.includes('uncompleted_remaining_intent'));
});

test('visible turn projection includes the current authored camp-fire state', () => {
  const state = committedState();
  state.position = { location_ref: 'trace_ld_v1_loc_fishing_camp',
    g5_anchor_id: 'camp-anchor' };
  state.current_visible_context.visible_scene = 'Рыбацкий стан';
  const before = projectCurrentSceneForVisibleOverlay({
    input: { retrieved_state: state, consequence: { visible_seed: {} } },
    directSeedKeys: [], body: {}
  });
  assert.ok(before.sensory_details.includes(
    'На очаговой площадке сейчас не видно ни пламени, ни тлеющих углей.'));

  state.environment_snapshot = {
    environment_profile_id: 'trace_ld_v1_env_camp_fire',
    source: 'party_environment_snapshot', facts: ['lit_fire'],
    scope: { location_ref: 'trace_ld_v1_loc_fishing_camp' }
  };
  const after = projectCurrentSceneForVisibleOverlay({
    input: { retrieved_state: state, consequence: { visible_seed: {} } },
    directSeedKeys: [], body: {}
  });
  assert.ok(after.sensory_details.includes(
    'На очаговой площадке горит огонь; рядом устроено место для просушки.'));
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
