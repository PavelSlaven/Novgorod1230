import assert from 'node:assert/strict';
import test from 'node:test';
import { validatePublicScreen } from '../src/api/contracts.js';
import { renderProse } from '../src/features/prose/render.js';

function publicScreen() {
  return {
    version: 1,
    schema: 'turn_screen',
    screen_status: 'ready',
    party_id: 'party-605',
    turn_id: 'turn-605',
    turn_number: 1,
    input_panel: { input_contract: 'intent_not_fact' },
    checks: [],
    main_prose: 'Еремей остановился у ворот.',
    visible_context: {
      visible_npc: [{
        entity_ref: { entity_kind: 'npc', public_key: 'e1' },
        display_label: 'Еремей'
      }],
      visible_objects: [{
        entity_ref: { entity_kind: 'item', public_key: 'e2' },
        display_label: 'Льняной мешок'
      }]
    },
    exact_npc_utterances: [{
      speaker_ref: { entity_kind: 'npc', public_key: 'e1' },
      utterance_text: 'Мешок оставь у ворот.'
    }]
  };
}

test('issue #605: valid turn screen accepts public_key NPC and item leaves', () => {
  const screen = publicScreen();
  assert.equal(validatePublicScreen(screen), screen);
});

test('issue #605: exact speech joins a named visible NPC by public_key', () => {
  const screen = publicScreen();
  assert.equal(validatePublicScreen(screen), screen);
  assert.match(renderProse(screen),
    /<strong>Еремей<\/strong><p>Мешок оставь у ворот\.<\/p>/u);
  assert.doesNotMatch(renderProse(screen), /<strong>Собеседник<\/strong>/u);
});

// game-server/MODULE.md:61–63: HTTP visible refs use entity_kind/public_key.
// These regressions exercise malformed browser input, not a live server leak.
for (const [field, entityKind] of [
  ['visible_npc', 'npc'],
  ['visible_objects', 'item']
]) {
  for (const mixed of [false, true]) {
    const shape = mixed ? 'public_key+entity_id' : 'entity_id-only';
    test(`ожидаемо красный, issue #605: ${field} rejects ${shape}`, () => {
      const screen = publicScreen();
      const leaf = screen.visible_context[field][0];
      leaf.entity_ref = {
        entity_kind: entityKind,
        ...(mixed ? { public_key: leaf.entity_ref.public_key } : {}),
        entity_id: `${entityKind}-private-605`
      };

      assert.throws(() => validatePublicScreen(screen),
        `${field} must reject ${shape} HTTP refs; only public_key is public.`);
    });
  }
}
