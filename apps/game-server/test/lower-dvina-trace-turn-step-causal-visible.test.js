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
