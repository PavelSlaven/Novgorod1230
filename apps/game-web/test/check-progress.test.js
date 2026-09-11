import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createUiStore,
  renderAppState,
  renderScreen,
  validateTurnProgress,
  validatePublicScreen
} from '../src/index.js';

function firstScreen() {
  return {
    version: 1,
    schema: 'first_game_screen',
    screen_status: 'ready',
    party_id: 'party-1',
    main_prose: 'Дорога уходит к реке.'
  };
}

test('turn screen validates and renders committed check arithmetic', () => {
  const check = {
    ordinal: 1, actor_label: '<Микула>',
    action_label: 'Перепрыгнуть канаву', die: 'd20',
    formula: 'd20 + модификаторы', roll: 12, difficulty: 15,
    modifiers: [
      { kind: 'attribute', label: 'Характеристика: Ловкость', value: 2 },
      { kind: 'skill', label: 'Навык: Атлетика', value: 1 },
      { kind: 'state', label: 'Состояние', value: -1 },
      { kind: 'equipment', label: 'Снаряжение и нагрузка', value: -2 },
      { kind: 'circumstances', label: 'Обстоятельства', value: 0 }
    ], total: 12, outcome: { band: 'success_with_cost', margin: -3,
      success: false, cost_required: true, severe_failure: false,
      roll_note: null }, consequence_label: 'Итог проверки: успех с ценой.'
  };
  const screen = { ...firstScreen(), schema: 'lower_dvina_trace_turn_screen',
    turn_id: 'turn-1', turn_number: 1,
    input_panel: { input_contract: 'intent_not_fact' }, checks: [check] };
  assert.doesNotThrow(() => validatePublicScreen(screen));
  const html = renderScreen(screen);
  assert.match(html, /d20: <strong>12<\/strong>/u);
  assert.match(html, /против сложности <strong>15<\/strong>/u);
  assert.match(html, /успех с ценой/u);
  assert.match(html, /Итог проверки: успех с ценой\./u);
  assert.match(html, /Навык: Атлетика<\/dt><dd>\+1/u);
  assert.match(html, /&lt;Микула&gt;/u);
  assert.doesNotMatch(html, /<Микула>/u);
  assert.throws(() => validatePublicScreen({ ...screen,
    checks: [{ ...check, modifiers: check.modifiers.slice(1) }] }), {
    code: 'SCREEN_CHECKS_INVALID'
  });
});

test('turn loading shows safe phase, elapsed time, commit state, and no fake ETA', () => {
  const store = createUiStore();
  store.setScreen(firstScreen());
  store.setLoading({ phase: 'resolving_world', commit_state: 'unconfirmed',
    elapsed_seconds: 42 });
  let html = renderAppState(store.getState());
  assert.match(html, /Определяем последствия/u);
  assert.match(html, /Прошло 42 с/u);
  assert.match(html, /Точное время окончания неизвестно/u);
  assert.doesNotMatch(html, /%|осталось/u);
  assert.match(html, /<strong role="status" aria-live="polite" aria-atomic="true">Определяем последствия<\/strong><span aria-hidden="true">Прошло 42 с/u);

  store.setTurnProgress({ phase: 'recovering_saved_result',
    commit_state: 'committed', elapsed_seconds: 43 });
  html = renderAppState(store.getState());
  assert.match(html, /Результат сохранён\. Восстанавливаем сохранённый результат/u);

  assert.equal(validateTurnProgress({ version: 1, schema: 'turn_progress_v1',
    status: 'running', request_id: 'request', phase: 'accepted', sequence: 0,
    started_at: 1, phase_started_at: 1, commit_state: 'unconfirmed',
    elapsed_seconds: 0, remaining_seconds: null }).phase, 'accepted');
  assert.throws(() => validateTurnProgress({ version: 1,
    schema: 'turn_progress_v1', status: 'running', request_id: 'request',
    phase: 'npc_decision', sequence: 0, started_at: 1, phase_started_at: 1,
    commit_state: 'unconfirmed', elapsed_seconds: 0, remaining_seconds: null }),
  /player-safe/u);
});
