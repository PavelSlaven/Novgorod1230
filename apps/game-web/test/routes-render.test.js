import assert from 'node:assert/strict';
import test from 'node:test';
import { collectMovementLabels, renderMovementShortcuts } from
  '../src/features/routes/render.js';
import { stateLabel } from '../src/features/panel-helpers.js';
import { renderProse } from '../src/features/prose/render.js';

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

test('exact committed NPC speech is rendered as escaped typed text', () => {
  const html = renderProse({ main_prose: 'Еремей отвечает.',
    visible_context: { visible_npc: [{ entity_ref: {
      entity_kind: 'npc', entity_id: 'npc-1'
    }, display_label: 'Еремей' }] },
    exact_npc_utterances: [{ speaker_ref: {
      entity_kind: 'npc', entity_id: 'npc-1'
    }, utterance_text: '<говорит>' }] });
  assert.match(html, /Еремей/u);
  assert.match(html, /&lt;говорит&gt;/u);
  assert.doesNotMatch(html, /<p><говорит><\/p>/u);
  const repeated = renderProse({ main_prose: 'Еремей говорит: «До вечера.»',
    exact_npc_utterances: [{ speaker_ref: {
      entity_kind: 'npc', entity_id: 'npc-1'
    }, utterance_text: 'До вечера.' }] });
  assert.equal((repeated.match(/До вечера\./gu) ?? []).length, 1);
});
