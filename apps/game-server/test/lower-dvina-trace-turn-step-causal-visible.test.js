import assert from 'node:assert/strict';
import test from 'node:test';
import { createLowerDvinaTraceTurnStepVisibleProjector } from '../src/runtime/lower-dvina-trace-turn-step-fire-visible.js';

for (const fire of [false, true]) {
  test(`authored projection retains findings, body and utterance with remaining intent (fire=${fire})`, async () => {
    const state = committedState();
    const base = { ...state.current_visible_context,
      visible_changes: ['На доске видна зарубка.'], known_context: ['energy:83'] };
    const projector = createLowerDvinaTraceTurnStepVisibleProjector({
      fallback: { project: async () => base }
    });
    const spoken = 'Отзовитесь!';
    const visible = await projector.project({ retrieved_state: state,
      consequence: { phase2_kind: 'inspect', status: 'partial', visible_seed:
        fire ? { turn_step_world_process_2: {
          schema: 'rus.lower_dvina_trace_turn_step_world_process_visible_result.v1',
          process_kind: 'fire', action: 'start', outcome: 'started', status: 'active'
        } } : {} }, mode_resolution: { decision_trace: {
        remaining_intent: 'Проверить пространство под настилом.',
        step_traces: [{ applied: true, approved_plan: {
          resolution: 'direct', direct_result_kind: 'player_utterance',
          utterance: { speaker_ref: 'player', utterance_text: spoken }
        } }] } } });
    assert.ok(visible.visible_changes.includes('На доске видна зарубка.'));
    assert.ok(visible.visible_changes.includes(`Вы произнесли: «${spoken}»`));
    assert.deepEqual(visible.known_context, ['energy:83']);
    assert.ok(visible.uncertainties.includes(
      'Ещё не выполнено: «Проверить пространство под настилом.». Результат этой попытки не установлен.'));
    assert.ok(visible.do_not_imply.includes('uncompleted_remaining_intent'));
    assert.ok(visible.do_not_imply.includes('unconfirmed_speech_audience_or_response'));
    assert.equal(JSON.stringify(visible).includes('никто'), false);
  });
}

function committedState() {
  return { current_visible_context: { version: 1, schema: 'visible_context_package',
    visible_scene: 'Берег.', visible_changes: [], sensory_details: [], visible_npc: [],
    visible_objects: [], known_context: [], uncertainties: [], allowed_tensions: [],
    do_not_imply: [] } };
}

for (const [scene, detail, query] of [
  ['Берег у воды.', 'Мокрые доски лежат у кромки воды.', 'Бумаги или вещи, которые могли быть при мне.'],
  ['Гончарный навес.', 'На полке стоят пустые обожжённые чаши.', 'Найти шнур или полоску ткани.']
]) {
  test(`charged discovery preserves committed scene and exact unresolved remainder: ${scene}`, async () => {
    const state = committedState();
    Object.assign(state.current_visible_context, { visible_scene: scene,
      sensory_details: [detail], visible_objects: [{ display_label: 'деревянная полка',
        entity_ref: { entity_kind: 'item', entity_id: 'shelf' } }] });
    const original = structuredClone(state);
    const projector = createLowerDvinaTraceTurnStepVisibleProjector({
      fallback: { project: async () => assert.fail('no domain-native projection') }
    });
    const remaining = 'После поиска связать свёрток.';
    for (const resolution of ['no_change', 'authority_required', 'absent']) {
      const visible = await projector.project({ retrieved_state: state,
        consequence: { status: 'partial', visible_seed: { completed_steps: [],
          turn_step_search: { kind: 'semantic_activity', duration_minutes: 15, discovery_kind: 'search' },
          ordinary_presence_seed: { kind: 'ordinary_presence_seed', resolution, query } } },
        mode_resolution: { decision_trace: { remaining_intent: remaining,
          step_traces: [{ applied: true, approved_plan: { resolution: 'domain_request',
            goal_result: 'pending', operations: [{ op: 'request_discovery' }], check: null } }] } } });
      assert.equal(visible.visible_scene, scene);
      assert.deepEqual(visible.sensory_details, [detail]);
      assert.deepEqual(visible.visible_objects, state.current_visible_context.visible_objects);
      assert.ok(visible.visible_changes.includes('Поиск занял 15 минут.'));
      assert.ok(visible[resolution === 'absent' ? 'visible_changes' : 'uncertainties']
        .some(value => value.includes(`«${query}»`)));
      assert.ok(visible.uncertainties.includes(`Ещё не выполнено: «${remaining}». Результат этой попытки не установлен.`));
      assert.ok(visible.do_not_imply.includes('uncompleted_remaining_intent'));
      assert.ok(!JSON.stringify(visible).includes('Удалось осуществить лишь часть'));
    }
    const activity = await projector.project({ retrieved_state: state,
      consequence: { status: 'resolved', visible_seed: { completed_steps: [],
        turn_step_rest: { kind: 'semantic_activity', duration_minutes: 5 } } } });
    assert.equal(activity.visible_scene, scene);
    assert.deepEqual(activity.visible_changes, ['Прошло 5 минут.']);
    assert.deepEqual(state, original);
  });
}
