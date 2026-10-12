import assert from 'node:assert/strict';
import test from 'node:test';
import { collectMovementLabels, renderMovementShortcuts } from
  '../src/features/routes/render.js';
import { stateLabel } from '../src/features/panel-helpers.js';
import { renderExactNpcUtterances, renderProse } from
  '../src/features/prose/render.js';

test('unknown technical state is omitted instead of shown raw', () => {
  assert.equal(stateLabel('unlisted_service_state', { known: 'известно' }),
    null);
  assert.equal(stateLabel('known', { known: 'известно' }), 'известно');
});

test('movement shortcuts render every route option label as a click target', () => {
  const screen = {
    panels: {
      route: {
        visible: true,
        data: {
          movement: {
            options: [
              { label: 'Переправлюсь на тот берег.' },
              { label: 'Иду к руслу.' },
              { label: 'Переправлюсь на тот берег.' }
            ]
          }
        }
      }
    }
  };
  assert.deepEqual(collectMovementLabels(screen), [
    'Переправлюсь на тот берег.',
    'Иду к руслу.'
  ]);
  const html = renderMovementShortcuts(screen);
  assert.match(html, /data-movement-label="Переправлюсь на тот берег\."/u);
  assert.match(html, /data-movement-label="Иду к руслу\."/u);
});

test('exact committed NPC speech stays typed in factual delivery and single in prose', () => {
  const factual = renderExactNpcUtterances({ main_prose: 'Еремей отвечает.',
    visible_context: { visible_npc: [{ entity_ref: {
      entity_kind: 'npc', public_key: 'e1'
    }, display_label: 'Еремей' }] },
    exact_npc_utterances: [{ speaker_ref: {
      entity_kind: 'npc', public_key: 'e1'
    }, utterance_text: '<говорит>' }] });
  assert.match(factual, /Еремей/u);
  assert.match(factual, /&lt;говорит&gt;/u);
  assert.doesNotMatch(factual, /<p><говорит><\/p>/u);
  const repeated = renderProse({ main_prose: 'Еремей говорит: «До вечера.»',
    exact_npc_utterances: [{ speaker_ref: {
      entity_kind: 'npc', public_key: 'e1'
    }, utterance_text: 'До вечера.' }] });
  assert.equal((repeated.match(/До вечера\./gu) ?? []).length, 1);
  assert.match(repeated, /<p>Еремей говорит: «До вечера.»<\/p>/u);
  assert.doesNotMatch(repeated, /<blockquote>/u);
  assert.doesNotMatch(repeated, /Собеседник/u);
});

test('exact factual speech without a visible speaker has no placeholder label', () => {
  const html = renderExactNpcUtterances({
    visible_context: { visible_npc: [] },
    exact_npc_utterances: [{ speaker_ref: {
      entity_kind: 'npc', public_key: 'e9'
    }, utterance_text: 'Подожди у ворот.' }]
  });
  assert.match(html, /<p>Подожди у ворот\.<\/p>/u);
  assert.doesNotMatch(html, /Собеседник/u);
});
