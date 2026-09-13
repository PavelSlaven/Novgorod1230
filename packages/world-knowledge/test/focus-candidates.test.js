import assert from 'node:assert/strict';
import test from 'node:test';
import { candidateWorldKnowledgeFocusRefs } from '../src/index.js';

function bundle() {
  return { claims: ['one', 'two', 'three', 'four'].map(id => ({
    claim_ref: `claim:${id}`, domain: id === 'four' ? 'other' : 'material' })),
  concepts: ['a', 'b', 'c', 'd', 'e'].map(id => ({ concept_ref: `concept:${id}`, domain: 'material' })),
  exact_indexes: { concept_to_claim_refs: {
    'concept:a': ['claim:one', 'claim:two'], 'concept:b': ['claim:three'],
    'concept:c': ['claim:four'], 'concept:d': ['claim:two'], 'concept:e': ['claim:one'] } },
  lexical_indexes: { ru: { обычный: ['claim:one', 'claim:two', 'claim:three'],
    редкий: ['claim:three'], пояс: ['claim:one'], поясе: ['claim:two'],
    лампа: ['claim:three'], усилие: ['claim:four'], переправа: ['claim:four'] },
    en: { rare: ['claim:three'] } } };
}

test('compiled token boundaries reject embedded words and arbitrary four-letter prefixes', () => {
  assert.deepEqual(candidateWorldKnowledgeFocusRefs(bundle(), 'или перебрать', 'ru', ['material']), []);
  assert.deepEqual(candidateWorldKnowledgeFocusRefs(bundle(), 'лампы', 'ru', ['material']), ['concept:b']);
  assert.deepEqual(candidateWorldKnowledgeFocusRefs(bundle(), 'RARE', 'en', ['material']), ['concept:b']);
  assert.deepEqual(candidateWorldKnowledgeFocusRefs(bundle(), 'rare', 'ru', ['material']), []);
});

test('rare postings outrank common tokens and multiple claims do not multiply concept relevance', () => {
  const source = bundle();
  const before = structuredClone(source);
  assert.deepEqual(candidateWorldKnowledgeFocusRefs(source, 'обычный редкий', 'ru', ['material'], 2),
    ['concept:b', 'concept:a']);
  assert.deepEqual(candidateWorldKnowledgeFocusRefs(source, 'обычный обычный', 'ru', ['material'], 3),
    ['concept:a', 'concept:b', 'concept:d']);
  assert.deepEqual(source, before);
});

test('Russian exact and anchored stem postings form one union with stable domain-filtered results', () => {
  const source = bundle();
  // Exact token and its inflection bridge must both contribute, without double counting.
  assert.deepEqual(candidateWorldKnowledgeFocusRefs(source, 'поясе', 'ru', ['material']),
    ['concept:a', 'concept:d', 'concept:e']);
  source.lexical_indexes.ru.пояс.push('claim:two');
  assert.deepEqual(candidateWorldKnowledgeFocusRefs(source, 'поясе', 'ru', ['material']),
    ['concept:a', 'concept:d', 'concept:e']);
  source.concepts.find(({ concept_ref }) => concept_ref === 'concept:b').domain = 'other';
  assert.deepEqual(candidateWorldKnowledgeFocusRefs(source, 'лампы', 'ru', ['material']), ['concept:b']);
  assert.deepEqual(candidateWorldKnowledgeFocusRefs(source, 'лампы', 'ru', ['unrelated']), []);
});
