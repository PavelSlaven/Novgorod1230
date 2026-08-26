import test from 'node:test';
import assert from 'node:assert/strict';

import { validatePublicScreen } from '../src/index.js';
import { renderConversationPortrait } from
  '../src/features/conversation-portrait/render.js';
import { SAMPLE_PORTRAIT_SPEC } from '../src/portrait-lab/sample.js';

function screen(active_interlocutor) {
  return {
    version: 1,
    schema: 'first_game_screen',
    screen_status: 'ready',
    party_id: 'party-1',
    main_prose: 'Дорога уходит к реке.',
    visible_context: {},
    action_panel: { suggested_actions: [] },
    panels: { people: { visible: true, data: { active_interlocutor } } }
  };
}

test('conversation portrait selects authored, procedural and SVG visuals from explicit fields', () => {
  const active = {
    entity_ref: { entity_kind: 'npc', entity_id: 'npc-eremey' },
    display_label: 'Еремей',
    portrait_spec_v1: SAMPLE_PORTRAIT_SPEC
  };
  const procedural = screen(active);
  assert.doesNotThrow(() => validatePublicScreen(procedural));
  assert.match(renderConversationPortrait(procedural), /data-conversation-portrait-canvas/u);

  const authored = renderConversationPortrait(screen({
    entity_ref: active.entity_ref, display_label: active.display_label,
    portrait_asset_id: 'lower-dvina-eremey'
  }));
  assert.match(authored, /data-conversation-portrait-canvas/u);
  assert.match(authored, /data-conversation-portrait-fallback hidden/u);

  const unknownWithSpec = renderConversationPortrait(screen({
    ...active, portrait_asset_id: 'unknown-portrait'
  }));
  assert.match(unknownWithSpec, /data-conversation-portrait-canvas/u);
  assert.doesNotMatch(unknownWithSpec, /<svg/u);

  const svg = renderConversationPortrait(screen({
    entity_ref: active.entity_ref, display_label: active.display_label,
    portrait_asset_id: 'unknown-portrait'
  }));
  assert.match(svg, /<svg/u);
  assert.doesNotMatch(svg, /data-conversation-portrait-canvas/u);
  assert.match(renderConversationPortrait(screen({
    entity_ref: active.entity_ref, display_label: active.display_label
  })), /<svg/u);

  for (const [field, value] of [
    ['display_label', 'lower-dvina-eremey'],
    ['role_label', 'lower-dvina-eremey'],
    ['main_prose', 'lower-dvina-eremey']
  ]) {
    const changed = screen({
      entity_ref: active.entity_ref,
      display_label: field === 'display_label' ? value : active.display_label,
      ...(field === 'role_label' ? { role_label: value } : {})
    });
    changed[field] = value;
    const portrait = renderConversationPortrait(changed);
    assert.match(portrait, /<svg/u);
    assert.doesNotMatch(portrait, /data-conversation-portrait-canvas/u);
  }
  assert.throws(() => validatePublicScreen(screen({
    ...active,
    portrait_spec_v1: { ...SAMPLE_PORTRAIT_SPEC, inferred_from_name: true }
  })), { code: 'ACTIVE_INTERLOCUTOR_INVALID' });
});
