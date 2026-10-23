import assert from 'node:assert/strict';
import test from 'node:test';
import {
  diagnoseConversationPlan,
  projectNpcConversationSubject,
  validateConversationContributionPlan,
  validateNpcConversationResponseRequest
} from '@rus/npc-runtime';
import { auditFreshNpcSpeech } from
  '../src/runtime/lower-dvina-trace-npc-speech-grounding-audit.js';

const ref = (entity_kind, entity_id) => ({ entity_kind, entity_id });
const requestedAt = {
  whole_minutes: '10',
  subminute_numerator: '0',
  subminute_denominator: '1'
};
const playerRef = ref('player_character', 'player-1');

function hypothesisCase({
  speakerId,
  otherNpcId,
  hypothesisId,
  hypothesisSummary,
  utteranceText,
  claimSummary
}) {
  const npcRef = ref('npc', speakerId);
  const otherNpcRef = ref('npc', otherNpcId);
  const hypothesisRef = ref('hypothesis', hypothesisId);
  const subject = projectNpcConversationSubject({
    npc_ref: npcRef,
    npc_snapshot: { instance_id: speakerId },
    current_activity_snapshot: {
      status: 'idle',
      can_continue_automatically: false
    },
    knowledge_snapshot: {
      known_facts: [],
      beliefs: [],
      hypotheses: [{
        hypothesis_ref: hypothesisRef,
        summary: hypothesisSummary,
        state: 'open',
        confidence: 'low'
      }]
    }
  });
  const request = {
    schema: 'npc_conversation_response_request_v1',
    request_id: `request-${speakerId}`,
    boundary_id: `boundary-${speakerId}`,
    conversation_id: `conversation-${speakerId}`,
    exchange_id: `exchange-${speakerId}`,
    state_version: 1,
    requested_at: requestedAt,
    npc_ref: npcRef,
    decision_reasons: {
      significance: 'material',
      categories: ['communication'],
      signal_refs: [ref('npc_decision_signal', `signal-${speakerId}`)],
      perceived_changes: ['Собеседник задал вопрос.']
    },
    npc: subject.npc,
    perceived_message: {
      source_statement_ref: ref('conversation_statement', `statement-${speakerId}`),
      perception_result_ref: ref('perception_result', `heard-${speakerId}`)
    },
    public_conversation_history: [],
    knowledge: subject.knowledge,
    memory: subject.memory,
    social_context: {},
    available_resources: subject.available_resources,
    allowed_references: {
      actor_refs: [npcRef, otherNpcRef, playerRef].sort((left, right) => {
        const leftKey = `${left.entity_kind}\u0000${left.entity_id}`;
        const rightKey = `${right.entity_kind}\u0000${right.entity_id}`;
        return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
      }),
      entity_refs: [],
      knowledge_refs: subject.knowledge_refs,
      combat_target_refs: []
    },
    decision_scope: {
      conversation_mode: true,
      action_handoff_available: false,
      combat_handoff_available: false,
      allowed_attribute_refs: [],
      allowed_skill_refs: [],
      allowed_check_profile_refs: [],
      allowed_duration_classes: ['domain_owned'],
      operation_contract: {}
    }
  };
  const plan = {
    schema: 'conversation_contribution_plan_v1',
    request_id: request.request_id,
    boundary_id: request.boundary_id,
    conversation_id: request.conversation_id,
    exchange_id: request.exchange_id,
    state_version: request.state_version,
    speaker_ref: npcRef,
    contribution_kind: 'speech',
    primary_addressee_ref: playerRef,
    intended_addressee_refs: [playerRef],
    affected_actor_refs: [],
    speech: {
      utterance_text: utteranceText,
      dominant_act: 'answer',
      interaction_tags: [],
      topic_refs: [],
      claims: [{
        claim_id: 'claim-hypothesis',
        content_summary: claimSummary,
        form: 'assertion',
        speaker_posture: 'uncertain',
        source_knowledge_refs: [hypothesisRef],
        mentioned_entity_refs: [otherNpcRef]
      }],
      response_expectation: { kind: 'none', target_refs: [] }
    },
    interpretation: {
      intent: 'ответить предположением',
      grounded_contribution: 'сообщить собственное предположение',
      adaptation: 'literal'
    },
    resolution: 'automatic',
    activity: { duration_class: 'domain_owned', effort: 'none' },
    supporting_operations: [],
    check: null,
    handoff: null,
    reason: 'NPC отвечает предположением.'
  };
  return { request, plan, hypothesisRef };
}

function firstCase() {
  return hypothesisCase({
    speakerId: 'npc-fisher',
    otherNpcId: 'npc-eremey',
    hypothesisId: 'hypothesis-net',
    hypothesisSummary: 'Рыбак предполагает, что Еремей мог оставить сеть у причала.',
    utteranceText: 'Может, Еремей оставил сеть у причала.',
    claimSummary: 'Еремей мог оставить сеть у причала.'
  });
}

async function assertAuditorReceivesPlan(request, plan) {
  const calls = [];
  const result = await auditFreshNpcSpeech({
    roleRunner: { async run(call) {
      calls.push(call);
      return { output: { pass: true, concerns: [] } };
    } },
    plan,
    request
  });
  assert.equal(result, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].role_id, 'npc_conversation_grounding_auditor');
  assert.deepEqual(JSON.parse(calls[0].messages[1].content), { request, plan });
}

test('hc1: a projected hypothesis ref reaches plan validation and speech audit',
  async () => {
    const { request, plan, hypothesisRef } = firstCase();
    assert.deepEqual(request.knowledge.hypotheses[0].hypothesis_ref, hypothesisRef);
    assert.equal(request.allowed_references.knowledge_refs.some((entry) =>
      entry.entity_kind === hypothesisRef.entity_kind
      && entry.entity_id === hypothesisRef.entity_id), true);
    assert.equal(validateNpcConversationResponseRequest(request), true);
    assert.deepEqual(diagnoseConversationPlan(plan, request), []);
    assert.equal(validateConversationContributionPlan(plan, request), true);
    await assertAuditorReceivesPlan(request, plan);
  });

test('hc2: a hypothesis ref absent from allowed references is rejected', () => {
  const { request, plan } = firstCase();
  plan.speech.claims[0].source_knowledge_refs = [
    ref('hypothesis', 'hypothesis-unseen')
  ];
  assert.equal(validateNpcConversationResponseRequest(request), true);
  assert.equal(validateConversationContributionPlan(plan, request), false);
  assert.deepEqual(diagnoseConversationPlan(plan, request).map(
    ({ code, category, path }) => ({ code, category, path })), [{
    code: 'reference_not_allowed',
    category: 'semantic_grounding',
    path: '$.speech.claims[0].source_knowledge_refs[0]'
  }]);
});

test('hc3: another NPC can cite a distinct hypothesis about another person and event',
  async () => {
    const { request, plan, hypothesisRef } = hypothesisCase({
      speakerId: 'npc-trader',
      otherNpcId: 'npc-boris',
      hypothesisId: 'hypothesis-bridge',
      hypothesisSummary: 'Торговец предполагает, что Борис мог вчера проехать через мост.',
      utteranceText: 'Возможно, Борис вчера проехал через мост.',
      claimSummary: 'Борис мог вчера проехать через мост.'
    });
    assert.deepEqual(request.knowledge.hypotheses[0].hypothesis_ref, hypothesisRef);
    assert.equal(request.allowed_references.knowledge_refs.some((entry) =>
      entry.entity_kind === hypothesisRef.entity_kind
      && entry.entity_id === hypothesisRef.entity_id), true);
    assert.equal(validateNpcConversationResponseRequest(request), true);
    assert.deepEqual(diagnoseConversationPlan(plan, request), []);
    assert.equal(validateConversationContributionPlan(plan, request), true);
    await assertAuditorReceivesPlan(request, plan);
  });
