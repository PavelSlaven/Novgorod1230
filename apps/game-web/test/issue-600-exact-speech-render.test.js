import assert from 'node:assert/strict';
import test from 'node:test';
import { renderScreen } from '../src/app/router.js';

const speech = 'До вечера не ходи к переправе.';
const speaker = { entity_ref: { entity_kind: 'npc', public_key: 'e1' },
  display_label: 'Еремей' };
const exact = [{ speaker_ref: { entity_kind: 'npc', public_key: 'e1' },
  utterance_text: speech }];

function turnScreen(overrides = {}) {
  return { version: 1, schema: 'turn_screen', screen_status: 'ready',
    party_id: 'party-1', turn_id: 'turn-1', turn_number: 1,
    visible_context: { visible_scene: 'У берега.', visible_npc: [speaker] },
    main_prose: `Еремей остановил вас и сказал: «${speech}»`,
    exact_npc_utterances: exact, action_panel: { suggested_actions: [] },
    actions: [], checks: [], panels: {}, ...overrides };
}

function factualScreen(overrides = {}) {
  return { version: 1, schema: 'factual_turn_delivery_screen',
    screen_status: 'ready', party_id: 'party-1', turn_id: 'turn-1', turn_number: 1,
    visible_context: { visible_scene: 'У берега.', visible_npc: [speaker] },
    exact_npc_utterances: exact, visible_changes: [], uncertainties: [],
    action_panel: { suggested_actions: [] }, actions: [], checks: [], panels: {},
    ...overrides };
}

test('TurnScreen keeps exact NPC speech once inside approved prose', () => {
  const html = renderScreen(turnScreen());
  assert.equal((html.match(new RegExp(speech, 'gu')) ?? []).length, 1,
    'exact speech must not be added as a second chat block');
  assert.match(html, new RegExp(`Еремей остановил вас и сказал: «${speech}»`, 'u'));
  assert.doesNotMatch(html, /<blockquote>/u);
  assert.doesNotMatch(html, /Собеседник/u);
});

test('FactualTurnDeliveryScreen retains exact speech and available speaker attribution', () => {
  const html = renderScreen(factualScreen());
  assert.equal((html.match(new RegExp(speech, 'gu')) ?? []).length, 1);
  assert.match(html, new RegExp(`<strong>Еремей</strong><p>${speech}</p>`, 'u'));
  assert.doesNotMatch(html, /Собеседник/u);
});

test('factual speech without a visible speaker does not show a service placeholder', () => {
  const html = renderScreen(factualScreen({
    visible_context: { visible_scene: 'У берега.', visible_npc: [] }
  }));
  assert.match(html, new RegExp(speech, 'u'));
  assert.doesNotMatch(html, /Собеседник/u);
});
