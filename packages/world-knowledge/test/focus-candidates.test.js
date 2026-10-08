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

test('focus candidates require an applicable claim under party date and access', () => {
  const source = bundle();
  source.claims = [
    { claim_ref: 'claim:one', domain: 'material',
      applicability: { context_scope: 'universal' },
      knowledge_access: { class: 'general', required_facets: [] } },
    { claim_ref: 'claim:two', domain: 'material',
      applicability: {
        conditions: [{ facet: 'started_historical_events', operator: 'includes',
          value: 'event:future' }]
      },
      knowledge_access: { class: 'general', required_facets: [] } },
    { claim_ref: 'claim:three', domain: 'material',
      applicability: { context_scope: 'universal' },
      knowledge_access: { class: 'domain_internal_only', required_facets: [] } },
    { claim_ref: 'claim:four', domain: 'other',
      applicability: { context_scope: 'universal' },
      knowledge_access: { class: 'general', required_facets: [] } }
  ];
  const context = { time: { year: 1230 }, place_refs: [], actor_facets: {},
    conditions: { started_historical_events: [] } };
  // claim:two (event-gated) and claim:three (domain_internal) stay out for conversation.
  assert.deepEqual(candidateWorldKnowledgeFocusRefs(source, 'обычный', 'ru',
    ['material'], { limit: 8, purpose: 'conversation', context }),
    ['concept:a', 'concept:e']);
  assert.deepEqual(candidateWorldKnowledgeFocusRefs(source, 'лампы', 'ru',
    ['material'], { limit: 8, purpose: 'conversation', context }), []);
  context.conditions.started_historical_events = ['event:future'];
  const withEvent = candidateWorldKnowledgeFocusRefs(source, 'обычный', 'ru',
    ['material'], { limit: 8, purpose: 'conversation', context });
  assert.ok(withEvent.includes('concept:d'), withEvent);
  assert.ok(withEvent.includes('concept:a'), withEvent);
  assert.equal(withEvent.includes('concept:b'), false);
});

test('N-5a focus domains skip claims missing applicability', () => {
  const source = bundle();
  source.lexical_indexes.ru.обычный = ['claim:one', 'claim:two'];
  source.claims = [
    { claim_ref: 'claim:one', domain: 'material',
      knowledge_access: { class: 'general', required_facets: [] } },
    { claim_ref: 'claim:two', domain: 'material',
      applicability: { context_scope: 'universal' },
      knowledge_access: { class: 'general', required_facets: [] } },
    { claim_ref: 'claim:three', domain: 'material',
      applicability: { context_scope: 'universal' },
      knowledge_access: { class: 'general', required_facets: [] } },
    { claim_ref: 'claim:four', domain: 'other',
      applicability: { context_scope: 'universal' },
      knowledge_access: { class: 'general', required_facets: [] } }
  ];
  const context = { time: { year: 1230 }, place_refs: [], actor_facets: {},
    conditions: { started_historical_events: [] } };
  // claim:one dropped → concept:e out; concept:a/d survive via claim:two.
  assert.deepEqual(candidateWorldKnowledgeFocusRefs(source, 'обычный', 'ru',
    ['material'], { limit: 8, purpose: 'conversation', context }),
    ['concept:a', 'concept:d']);
});

test('N-5b focus skips claims missing knowledge_access for purpose', () => {
  const source = bundle();
  source.lexical_indexes.ru.обычный = ['claim:one', 'claim:two'];
  source.claims = [
    { claim_ref: 'claim:one', domain: 'material',
      applicability: { context_scope: 'universal' } },
    { claim_ref: 'claim:two', domain: 'material',
      applicability: { context_scope: 'universal' },
      knowledge_access: { class: 'general', required_facets: [] } },
    { claim_ref: 'claim:three', domain: 'material',
      applicability: { context_scope: 'universal' },
      knowledge_access: { class: 'general', required_facets: [] } },
    { claim_ref: 'claim:four', domain: 'other',
      applicability: { context_scope: 'universal' },
      knowledge_access: { class: 'general', required_facets: [] } }
  ];
  const context = { time: { year: 1230 }, place_refs: [], actor_facets: {},
    conditions: { started_historical_events: [] } };
  assert.deepEqual(candidateWorldKnowledgeFocusRefs(source, 'обычный', 'ru',
    ['material'], { limit: 8, purpose: 'conversation', context }),
    ['concept:a', 'concept:d']);
});
