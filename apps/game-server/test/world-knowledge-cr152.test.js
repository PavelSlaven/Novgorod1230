import assert from 'node:assert/strict';
import test from 'node:test';
import { WorldKnowledgeError } from '@rus/world-knowledge';
import { semanticInputOf } from '../src/runtime/world-knowledge-request-context.js';
import { groundingSufficiencyOf } from '../src/runtime/world-knowledge-sufficiency.js';
import { omitWorldKnowledgeContextText } from '../src/runtime/world-knowledge-prompt-wire.js';

test('npc_action_decision semantic_input uses perceived_changes text', () => {
  const text = semanticInputOf({
    schema: 'npc_action_decision_request_v1',
    decision_reasons: { perceived_changes: ['Слышен треск сучьев.', 'Запах дыма.'] },
    perception: { visible_scene: ['Лесная опушка.'], perceived_changes: [],
      heard: [], felt: [] }
  });
  assert.match(text, /Слышен треск сучьев/);
  assert.match(text, /Запах дыма/);
  assert.match(text, /Лесная опушка/);
  assert.doesNotMatch(text, /npc_action_decision_request_v1/);
});

test('npc_conversation semantic_input uses history utterance text', () => {
  const text = semanticInputOf({
    schema: 'npc_conversation_response_request_v1',
    decision_reasons: { perceived_changes: ['Игрок обратился к NPC.'] },
    public_conversation_history: [
      { utterance_text: 'Где дорога на Торжок?' }
    ]
  });
  assert.match(text, /Игрок обратился/);
  assert.match(text, /Торжок/);
});

test('unknown schema without text fields throws typed semantic_input error', () => {
  assert.throws(() => semanticInputOf({ schema: 'unknown_request_v1', id: 1 }),
    (error) => error instanceof WorldKnowledgeError
      && error.code === 'WORLD_KNOWLEDGE_SEMANTIC_INPUT_UNAVAILABLE');
});

test('sufficiency marks partial when a search hint misses admitted claims', () => {
  assert.equal(groundingSufficiencyOf({
    facts: [{ claim_ref: 'claim:a' }], hard_constraints: [],
    coverage: [{ domain: 'materials_substances', status: 'covered' }],
    search_hint_hits: [false], verdict: 'supported'
  }), 'PARTIAL_KNOWLEDGE');
  assert.equal(groundingSufficiencyOf({
    facts: [{ claim_ref: 'claim:a' }], hard_constraints: [],
    coverage: [{ domain: 'materials_substances', status: 'covered' }],
    search_hint_hits: [true], verdict: 'supported'
  }), 'SUFFICIENT_KNOWLEDGE');
  assert.equal(groundingSufficiencyOf({
    facts: [], hard_constraints: [],
    coverage: [{ domain: 'materials_substances', status: 'covered' }],
    search_hint_hits: [false], verdict: 'unresolved'
  }), 'UNRESOLVED_KNOWLEDGE');
  assert.equal(groundingSufficiencyOf({
    facts: [], hard_constraints: [],
    coverage: [{ domain: 'future_tech', status: 'out_of_scope' }],
    search_hint_hits: [], verdict: 'unresolved'
  }), 'OUT_OF_SCOPE');
});

test('wire helper strips context_text when structured facts are present', () => {
  const stripped = omitWorldKnowledgeContextText({
    request_id: 'r1',
    world_knowledge: {
      schema: 'world_knowledge_slice_v1',
      facts: [{ claim_ref: 'c1' }], hard_constraints: [],
      context_text: 'duplicate'
    }
  });
  assert.equal(Object.hasOwn(stripped.world_knowledge, 'context_text'), false);
  assert.equal(stripped.world_knowledge.facts.length, 1);
  const kept = omitWorldKnowledgeContextText({
    request_id: 'r2',
    world_knowledge: { schema: 'world_knowledge_slice_v1',
      facts: [], hard_constraints: [], context_text: 'only prose' }
  });
  assert.equal(kept.world_knowledge.context_text, 'only prose');
});
