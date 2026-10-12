import assert from 'node:assert/strict';
import test from 'node:test';
import { validatePublicScreen } from '../src/api/contracts.js';
import { renderExactNpcUtterances } from '../src/features/prose/render.js';
import { renderConversationPortrait } from
  '../src/features/conversation-portrait/render.js';

function screen(overrides = {}) {
  return {
    version: 1,
    schema: 'first_game_screen',
    screen_status: 'ready',
    party_id: 'party-1',
    visible_context: {},
    panels: { people: { visible: true, data: {} } },
    ...overrides
  };
}

const npc = (public_key, display_label) => ({
  entity_ref: { entity_kind: 'npc', public_key }, display_label
});

test('public speech and active interlocutor accept exact short public refs', () => {
  const value = screen({
    visible_context: { visible_npc: [npc('e1', 'Еремей')] },
    exact_npc_utterances: [{
      speaker_ref: { entity_kind: 'npc', public_key: 'e1' },
      utterance_text: 'Добрый день.'
    }],
    panels: { people: { visible: true, data: { active_interlocutor: {
      entity_ref: { entity_kind: 'npc', public_key: 'e1' },
      display_label: 'Еремей'
    } } } }
  });

  assert.equal(validatePublicScreen(value), value);
  assert.match(renderExactNpcUtterances(value), /Еремей/u);
  assert.match(renderConversationPortrait(value),
    /data-interlocutor-key="e1"/u);
  assert.doesNotMatch(renderConversationPortrait(value),
    /data-interlocutor-id|entity_id/u);
});

test('public speech joins its speaker by key, not by a matching label', () => {
  const html = renderExactNpcUtterances({
    visible_context: { visible_npc: [npc('e1', 'Первый'), npc('e2', 'Второй')] },
    exact_npc_utterances: [{
      speaker_ref: { entity_kind: 'npc', public_key: 'e2' },
      utterance_text: 'Я отвечаю.'
    }]
  });

  assert.match(html, /<strong>Второй<\/strong><p>Я отвечаю\.<\/p>/u);
  assert.doesNotMatch(html, /<strong>Первый<\/strong>/u);
});

test('equal labels with different keys remain separate visible speakers', () => {
  const html = renderExactNpcUtterances({
    visible_context: { visible_npc: [npc('e1', 'Свидетель'), npc('e2', 'Свидетель')] },
    exact_npc_utterances: [
      { speaker_ref: { entity_kind: 'npc', public_key: 'e1' }, utterance_text: 'Первое.' },
      { speaker_ref: { entity_kind: 'npc', public_key: 'e2' }, utterance_text: 'Второе.' }
    ]
  });

  assert.equal((html.match(/<blockquote>/gu) ?? []).length, 2);
  assert.equal((html.match(/<strong>Свидетель<\/strong>/gu) ?? []).length, 2);
  assert.match(html, /Первое\./u);
  assert.match(html, /Второе\./u);
  assert.ok(html.indexOf('Первое.') < html.indexOf('Второе.'));
});

test('legacy entity_id refs are rejected for speech and active interlocutor', () => {
  assert.throws(() => validatePublicScreen(screen({
    exact_npc_utterances: [{
      speaker_ref: { entity_kind: 'npc', entity_id: 'npc-private-1' },
      utterance_text: 'Слово.'
    }]
  })), { code: 'SCREEN_EXACT_SPEECH_INVALID' });

  assert.throws(() => validatePublicScreen(screen({
    panels: { people: { visible: true, data: { active_interlocutor: {
      entity_ref: { entity_kind: 'npc', entity_id: 'npc-private-1' },
      display_label: 'Еремей'
    } } } }
  })), { code: 'ACTIVE_INTERLOCUTOR_INVALID' });
});
