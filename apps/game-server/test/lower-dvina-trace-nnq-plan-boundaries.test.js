import assert from 'node:assert/strict';
import test from 'node:test';
import {
  classifyEremeyPlan,
  classifyOrdinaryConversationPlan,
  classifyRatshaPlan
} from '../src/runtime/lower-dvina-trace-m2-conversation-plans.js';
import { npcSpeechPlan } from
  './lower-dvina-trace-m2-conversation-speech-fixture.js';

const routeRef = 'route:camp-to-shed';
const knowledgeScopeRef = 'knowledge:local-fisher';

test('An ordinary NPC can promise a future act in speech without an operation.', () => {
  const plan = speechPlan({
    dominantAct: 'promise',
    utteranceText: 'Я завтра принесу тебе верёвку.'
  });

  assert.deepEqual(classifyOrdinaryConversationPlan(plan), {
    kind: 'speech', statementRef: null
  });
});

test('Another ordinary NPC can offer future help without an operation.', () => {
  const plan = speechPlan({
    npcId: 'npc:other-fisher',
    dominantAct: 'offer',
    utteranceText: 'Завтра сведу тебя к броду.'
  });

  assert.deepEqual(classifyOrdinaryConversationPlan(plan), {
    kind: 'speech', statementRef: null
  });
});

test('An ordinary NPC can accept a request for future help without an operation.', () => {
  const plan = speechPlan({
    dominantAct: 'accept',
    utteranceText: 'Согласен, завтра помогу тебе починить сеть.'
  });

  assert.deepEqual(classifyOrdinaryConversationPlan(plan), {
    kind: 'speech', statementRef: null
  });
});

test('Ratsha can promise a future act in speech without a surrender operation.', () => {
  const plan = speechPlan({
    npcId: 'npc:ratsha',
    dominantAct: 'promise',
    utteranceText: 'Завтра я вернусь и расскажу, что узнал.'
  });

  assert.deepEqual(classifyRatshaPlan(plan), {
    kind: 'speech', statementRef: null
  });
});

test('Eremey can offer future help without disclosing a route.', () => {
  const plan = speechPlan({
    npcId: 'npc:eremey',
    dominantAct: 'offer',
    utteranceText: 'Завтра помогу тебе связать сети.'
  });

  assert.deepEqual(classifyEremeyPlan(plan, {
    routeRef, knowledgeScopeRef
  }), { kind: 'speech', statementRef: null });
});

test('Eremey rejects an unsupported operation attached to speech.', () => {
  const plan = speechPlan({
    npcId: 'npc:eremey',
    dominantAct: 'offer',
    utteranceText: 'Завтра помогу тебе связать сети.',
    supportingOperations: [{ op: 'offer_conditional_protection' }]
  });

  assert.throws(() => classifyEremeyPlan(plan, {
    routeRef, knowledgeScopeRef
  }), { code: 'TRACE_M2_EREMEY_OPERATION_INVALID' });
});

test('Eremey rejects a route mention without the route disclosure operation.', () => {
  const plan = speechPlan({
    npcId: 'npc:eremey',
    dominantAct: 'offer',
    utteranceText: 'Завтра помогу тебе связать сети.',
    topicRefs: [routeRef]
  });

  assert.throws(() => classifyEremeyPlan(plan, {
    routeRef, knowledgeScopeRef
  }), { code: 'TRACE_M2_ROUTE_DISCLOSURE_UNBACKED' });
});

test('An ordinary NPC rejects every supporting operation.', () => {
  const plan = speechPlan({
    dominantAct: 'promise',
    utteranceText: 'Завтра помогу тебе починить сеть.',
    supportingOperations: [{ op: 'commit_surrender' }]
  });

  assert.throws(() => classifyOrdinaryConversationPlan(plan), {
    code: 'TRACE_M2_ORDINARY_NPC_RESPONSE_INVALID'
  });
});

test('Ratsha rejects a surrender operation without the surrender interaction tag.', () => {
  const plan = speechPlan({
    npcId: 'npc:ratsha',
    dominantAct: 'accept',
    utteranceText: 'Ладно, я подумаю над этим.',
    supportingOperations: [{ op: 'commit_surrender' }]
  });

  assert.throws(() => classifyRatshaPlan(plan), {
    code: 'TRACE_M2_RATSHA_RESPONSE_INVALID'
  });
});

function speechPlan({
  npcId = 'npc:ordinary',
  dominantAct,
  utteranceText,
  topicRefs = [],
  supportingOperations = []
}) {
  return npcSpeechPlan({
    request_id: 'request:plan-boundary',
    boundary_id: 'boundary:plan-boundary',
    conversation_id: 'conversation:plan-boundary',
    exchange_id: 'exchange:plan-boundary',
    state_version: 1,
    npc_ref: ref('npc', npcId),
    public_conversation_history: [{
      speaker_ref: ref('player_character', 'player:test')
    }]
  }, {
    dominantAct,
    utteranceText,
    topicRefs,
    supportingOperations
  });
}

function ref(entity_kind, entity_id) {
  return { entity_kind, entity_id };
}
