import assert from 'node:assert/strict';
import test from 'node:test';
import { narrationWire, narrationWorldKnowledgePromptData, NARRATION_WK_QUALIFIER_RULE } from '../src/runtime/lower-dvina-trace-narration-llm.js';
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
    const shown = wire['Переданные сведения об обстановке']['Предметы и ориентиры'];
    assert.deepEqual(shown, ['штаны']);
    assert.doesNotMatch(JSON.stringify(wire), /Проход|выход 1/u);
  }
});

test('an observation or arrival reports scene objects as seen, never the passages (they are route choices)', () => {
  const scene = request([]).visible_context;
  assert.deepEqual(lowerDvinaTraceObservedSceneChanges(scene), ['В поле зрения — штаны.']);
});


test('narrator input removes service markers from visible text and preserves clean data', () => {
  const wire = narrationWire({ visible_context: {
    visible_scene: 'INFERENCE: private scene',
    visible_changes: ['npc_internal_1 moved', { change_kind: 'environment_state',
      summary: 'Вода отступила.' }], uncertainties: ['status: pending'],
    do_not_imply: ['digest:0123456789abcdef'], allowed_tensions: [],
    visible_npc: [], visible_objects: []
  }, context: {} });
  assert.equal(wire['Переданные сведения об обстановке']['Место'], undefined);
  assert.deepEqual(wire['Обязательные положения текущего эпизода'], ['Вода отступила.']);
  assert.deepEqual(wire['Обязательные положения текущего эпизода'], ['Вода отступила.']);
  assert.deepEqual(wire['Границы рассказа']['Не утверждать'], []);
});

test('narration WK prose removes calibration prefixes but keeps exact qualifiers and references', () => {
  const facts = ['FACT', 'INFERENCE', 'ANALOGY', 'EDITORIAL', 'UNCERTAIN'].map((marker, index) => ({
    claim_ref: `claim:fixture-${index}`, evidence_refs: [`evidence:fixture-${index}`],
    runtime_text: `${marker}: Берёза растёт у воды.`,
    qualifiers: { directness: ['direct', 'inferred', 'analogical', 'editorial', 'unknown'][index],
      confidence: 'medium', typicality: 'unknown' }
  }));
  const slice = { schema: 'world_knowledge_slice_v1', pack_ref: 'pack:fixture',
    pack_revision: 'v1', coverage: [], hard_constraints: [facts[0]], facts,
    disputes: [{ claims: [facts[2]] }], gaps: [], context_text: 'INFERENCE claim:fixture-1' };
  const original = structuredClone(slice);
  const projected = narrationWorldKnowledgePromptData(slice);
  assert.deepEqual(slice, original, 'canonical slice is unchanged');
  assert.equal(Object.hasOwn(projected, 'context_text'), false);
  for (let index = 0; index < facts.length; index++) {
    assert.deepEqual(projected.facts[index], { ...facts[index], runtime_text: 'Берёза растёт у воды.' });
  }
  assert.equal(projected.hard_constraints[0].runtime_text, 'Берёза растёт у воды.');
  assert.equal(projected.disputes[0].claims[0].runtime_text, 'Берёза растёт у воды.');
  const proseFacts = narrationWire({ ...request([]), world_knowledge: slice })['Сведения о мире'];
  assert.equal(proseFacts.length, 7);
  assert.match(proseFacts[2], /По имеющимся сведениям можно предположить/u);
  assert.doesNotMatch(JSON.stringify(proseFacts), /claim:|evidence:|directness|confidence|runtime_text/u);
  assert.match(NARRATION_WK_QUALIFIER_RULE, /русскими фразами/u);
});

test('narration WK rejects contaminated factual text while leaving machine refs intact', () => {
  const slice = { schema: 'world_knowledge_slice_v1', pack_ref: 'pack:fixture', pack_revision: 'v1',
    coverage: [], hard_constraints: [], facts: [
      { claim_ref: 'claim:good', runtime_text: 'Берёза у воды.', evidence_refs: ['evidence:good'],
        qualifiers: { directness: 'inferred', confidence: 'low', typicality: 'unknown' } },
      { claim_ref: 'claim:bad', runtime_text: 'INFERENCE: npc_internal_1 стоит у воды.' }
    ], disputes: [], gaps: [] };
  const projected = narrationWorldKnowledgePromptData(slice);
  assert.deepEqual(projected.facts, [slice.facts[0], { claim_ref: 'claim:bad' }]);
});
