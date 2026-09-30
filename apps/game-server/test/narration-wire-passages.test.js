import assert from 'node:assert/strict';
import test from 'node:test';
import { narrationWire } from '../src/runtime/lower-dvina-trace-narration-llm.js';
import { lowerDvinaTraceObservedSceneChanges } from '../src/runtime/lower-dvina-trace-visible-scene-items.js';

const object = (entity_kind, entity_id, display_label) =>
  ({ entity_ref: { entity_kind, entity_id }, display_label, recognition: 'known' });
const request = (changes) => ({ visible_context: { visible_scene: 'Двор.', visible_changes: changes,
  uncertainties: [], do_not_imply: [], allowed_tensions: [], visible_npc: [],
  visible_objects: [object('scene_movement_edge', 'e1', 'Проход 1'),
    object('g5_site_connection', 'c1', 'Проход 3'), object('g4_directional_exit', 'x1', 'По руслу — выход 1'),
    object('item', 'i1', 'штаны')] }, context: {} });

test('narrator input: passages are route choices, not scene objects, with or without required changes', () => {
  for (const changes of [[], ['Вы осмотрелись.']]) {
    const wire = narrationWire(request(changes));
    const shown = wire.optional_support.visible_objects;
    if (changes.length === 0) assert.deepEqual(shown.map((row) => row.display_label), ['штаны']);
    else assert.equal(shown, undefined, 'with required changes only visible_scene is supplied');
    assert.doesNotMatch(JSON.stringify(wire), /Проход|выход 1/u);
  }
});

test('an observation or arrival reports scene objects as seen, never the passages (they are route choices)', () => {
  const scene = request([]).visible_context;
  assert.deepEqual(lowerDvinaTraceObservedSceneChanges(scene), ['В поле зрения — штаны.']);
});
