import assert from 'node:assert/strict';
import test from 'node:test';
import { createUiStore, renderScreen, validatePublicScreen } from '../src/index.js';
import { storedPendingTurn } from '../src/app/pending-turn.js';
import { submitRecoverableTurn } from '../src/app/turn-submission.js';

function factual(overrides = {}) {
  return {
    version: 1, schema: 'factual_turn_delivery_screen', screen_status: 'ready',
    party_id: 'party-1', turn_id: 'turn-7', turn_number: 7,
    package_id: 'package-7', committed_state_version: '39',
    visible_context: { visible_scene: 'У телеги мокрая ось.' },
    visible_changes: ['Верёвка снята с телеги.'],
    uncertainties: ['Прочность оси ещё не установлена.'],
    panels: { journal: { visible: true, data: { current_task: 'Осмотреть ось' } } },
    input_panel: { free_text_enabled: true, input_contract: 'intent_not_fact' },
    ...overrides
  };
}

function storage() {
  const values = new Map();
  return { getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key) };
}

test('factual delivery validates and renders committed fields with an enabled intent input', () => {
  const screen = factual();
  assert.equal(validatePublicScreen(screen), screen);
  const html = renderScreen(screen);
  for (const text of ['Текущий момент', 'У телеги мокрая ось.',
    'Верёвка снята с телеги.', 'Прочность оси ещё не установлена.',
    'Осмотреть ось', 'data-turn-form']) assert.match(html, new RegExp(text, 'u'));
  assert.match(html, /aria-label="Сохранённый результат хода"/u);
  assert.match(html, /<h1>Текущий момент<\/h1>/u);
  assert.doesNotMatch(html, /package-7|committed_state_version|diagnostics|main_prose/u);
  assert.doesNotMatch(html, /textarea[^>]+disabled/u);
});

test('factual delivery rejects prose, raw package metadata and private leaks', () => {
  for (const invalid of [
    factual({ main_prose: 'Запрещённая проза.' }),
    factual({ package_digest: 'private-digest' }),
    factual({ visible_context: { visible_scene: 'Берег.', private_motives: [] } })
  ]) assert.throws(() => validatePublicScreen(invalid), {
    code: invalid.visible_context.private_motives
      ? 'PUBLIC_PAYLOAD_HIDDEN_LEAK' : 'FACTUAL_TURN_DELIVERY_INVALID'
  });
});

test('invalid factual delivery does not replace retained screen or clear pending request', async () => {
  const store = createUiStore();
  const retained = { version: 1, schema: 'first_game_screen', screen_status: 'ready', party_id: 'party-1' };
  store.setScreen(retained);
  assert.throws(() => store.setScreen(factual({ main_prose: 'Запрещено.' })), {
    code: 'FACTUAL_TURN_DELIVERY_INVALID'
  });
  assert.deepEqual(store.getState().screen, retained);

  const saved = storage();
  await assert.rejects(submitRecoverableTurn({ async submitTurn() {
    return { screen: factual({ main_prose: 'Запрещено.' }) };
  } }, saved, 'party-1', { raw_text: 'Жду.' }), {
    code: 'FACTUAL_TURN_DELIVERY_INVALID'
  });
  assert.ok(storedPendingTurn(saved, 'party-1'));
});
