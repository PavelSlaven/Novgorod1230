import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildNpcConversationResponseRequest,
  buildPlayerConversationContributionPlan,
  buildPlayerConversationInput,
  validateConversationContributionPlan,
  validatePlayerConversationContributionPlan
} from '../src/index.js';

const ref = (entity_kind, entity_id) => ({ entity_kind, entity_id });
const at = (whole_minutes = '10') => ({ whole_minutes,
  subminute_numerator: '0', subminute_denominator: '1' });
const deliveryByOutcome = {
  clean_success: 'compelling',
  success: 'credible',
  success_with_cost: 'credible_with_visible_cost',
  failure_with_consequence: 'unconvincing',
  severe_failure: 'transparently_manipulative'
};
const checkOutcomes = () => Object.fromEntries(
  Object.entries(deliveryByOutcome).map(([outcome, delivery_quality]) => [
    outcome, { delivery_quality, observable_effects: [] }
  ]));

function speechBody(overrides = {}) {
  return {
    contribution_kind: 'speech',
    primary_addressee_ref: ref('npc', 'listener'),
    intended_addressee_refs: [ref('npc', 'listener')],
    affected_actor_refs: [],
    speech: {
      utterance_text: 'Слушай меня.',
      dominant_act: 'inform',
      interaction_tags: [],
      topic_refs: [],
      claims: [],
      response_expectation: { kind: 'none', target_refs: [] }
    },
    interpretation: {
      intent: 'сообщить сведения',
      grounded_contribution: 'обратиться к собеседнику',
      adaptation: 'literal'
    },
    resolution: 'check_required',
    activity: { duration_class: 'brief', effort: 'none' },
    supporting_operations: [{ op: 'emit_interaction', gesture: 'points' }],
    check: {
      purpose: 'говорить убедительно',
      attribute_ref: 'influence',
      skill_ref: 'communication',
      difficulty_band: 'risky',
      outcomes: checkOutcomes()
    },
    handoff: null,
    ...overrides
  };
}

function npcRequest() {
  return {
    schema: 'npc_conversation_response_request_v1',
    request_id: 'request-2',
    boundary_id: 'boundary-2',
    conversation_id: 'conversation-1',
    exchange_id: 'exchange-1',
    state_version: 2,
    requested_at: at(),
    npc_ref: ref('npc', 'speaker'),
    decision_reasons: {
      significance: 'critical',
      categories: ['self', 'communication'],
      signal_refs: [ref('npc_decision_signal', 'signal-a'),
        ref('npc_decision_signal', 'signal-z')],
      perceived_changes: ['Услышан прямой вопрос.']
    },
    npc: {},
    perceived_message: {
      source_statement_ref: ref('conversation_statement', 'statement-1'),
      perception_result_ref: ref('perception_result', 'perception-1')
    },
    public_conversation_history: [],
    knowledge: {},
    memory: {},
    social_context: {},
    available_resources: [],
    allowed_references: {
      actor_refs: [ref('npc', 'listener'), ref('npc', 'speaker'),
        ref('player_character', 'player')],
      entity_refs: [], knowledge_refs: [], combat_target_refs: []
    },
    decision_scope: {
      conversation_mode: true,
      action_handoff_available: true,
      combat_handoff_available: false,
      allowed_attribute_refs: ['influence'],
      allowed_skill_refs: ['communication'],
      allowed_check_profile_refs: ['risky'],
      allowed_duration_classes: ['brief'],
      operation_contract: { emit_interaction: {} }
    }
  };
}

function npcPlan(request) {
  return {
    schema: 'conversation_contribution_plan_v1',
    request_id: request.request_id,
    boundary_id: request.boundary_id,
    conversation_id: request.conversation_id,
    exchange_id: request.exchange_id,
    state_version: request.state_version,
    speaker_ref: request.npc_ref,
    ...speechBody(),
    reason: 'NPC решил ответить.'
  };
}

test('NPC speech rejects mixed-script words with and without a formal request', () => {
  const request = buildNpcConversationResponseRequest(npcRequest());
  const mixed = ['Мuжик', 'дѣlо', 'о\u0301nlайн'];

  for (const utterance of mixed) {
    const plan = npcPlan(request);
    plan.speech.utterance_text = utterance;
    assert.equal(validateConversationContributionPlan(plan, request), false,
      `request-bound plan should reject ${utterance}`);
    assert.equal(validateConversationContributionPlan(plan), false,
      `request-null formal plan should reject ${utterance}`);
  }
});

test('NPC speech accepts clean scripts, separate language tokens, and combining marks', () => {
  const request = buildNpcConversationResponseRequest(npcRequest());
  const clean = ['Человек отвечает.', 'A traveler answers.', 'Hello, мир.',
    'Дѣло решено.', 'Сте\u0301пь видна.'];

  for (const utterance of clean) {
    const plan = npcPlan(request);
    plan.speech.utterance_text = utterance;
    assert.equal(validateConversationContributionPlan(plan, request), true,
      `request-bound plan should accept ${utterance}`);
    assert.equal(validateConversationContributionPlan(plan), true,
      `request-null formal plan should accept ${utterance}`);
  }
});

test('player verbatim conversation preserves mixed-script text unchanged', () => {
  const rawText = 'Мuжик';
  const request = buildPlayerConversationInput({
    schema: 'player_conversation_input_v1',
    request_id: 'request-player-script',
    conversation_id: 'conversation-1',
    state_version: 0,
    speaker_ref: ref('player_character', 'player'),
    raw_text: rawText,
    received_at: 'system-time-1',
    player_safe_context: {
      allowed_duration_classes: ['brief'],
      allowed_references: {
        actor_refs: [ref('npc', 'listener'), ref('player_character', 'player')],
        entity_refs: [], knowledge_refs: [], combat_target_refs: []
      }
    },
    operation_contract: { emit_interaction: {} }
  });
  const plan = {
    schema: 'player_conversation_contribution_plan_v1',
    request_id: request.request_id,
    conversation_id: request.conversation_id,
    state_version: request.state_version,
    speaker_ref: request.speaker_ref,
    input_mode: 'verbatim',
    ...speechBody({ resolution: 'automatic', check: null,
      supporting_operations: [], speech: {
        utterance_text: rawText,
        dominant_act: 'inform',
        interaction_tags: [],
        topic_refs: [],
        claims: [],
        response_expectation: { kind: 'none', target_refs: [] }
      } })
  };

  assert.equal(validatePlayerConversationContributionPlan(plan, request), true);
  const built = buildPlayerConversationContributionPlan(plan, request);
  assert.equal(built.speech.utterance_text, rawText);
});
