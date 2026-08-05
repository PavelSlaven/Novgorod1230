import assert from 'node:assert/strict';
import test from 'node:test';
import { requestPlayerConversationContribution } from '../src/player-conversation.js';

const ref = (entity_kind, entity_id) => ({ entity_kind, entity_id });

function request() {
  return {
    schema: 'player_conversation_input_v1',
    request_id: 'request-1',
    conversation_id: 'conversation-1',
    state_version: 2,
    speaker_ref: ref('player_character', 'player'),
    raw_text: 'попросить Еремея рассказать правду',
    received_at: 'input-1',
    player_safe_context: {
      allowed_duration_classes: ['moment', 'brief', 'short', 'domain_owned'],
      allowed_references: {
        actor_refs: [
          ref('npc', 'eremey'),
          ref('player_character', 'player')
        ],
        entity_refs: [],
        knowledge_refs: [],
        combat_target_refs: []
      }
    },
    operation_contract: {}
  };
}

function plan(source = request()) {
  return {
    schema: 'player_conversation_contribution_plan_v1',
    request_id: source.request_id,
    conversation_id: source.conversation_id,
    state_version: source.state_version,
    speaker_ref: source.speaker_ref,
    input_mode: 'intent_paraphrase',
    contribution_kind: 'speech',
    primary_addressee_ref: ref('npc', 'eremey'),
    intended_addressee_refs: [ref('npc', 'eremey')],
    affected_actor_refs: [],
    speech: {
      utterance_text: 'Еремей, скажи по совести: что ты видел?',
      dominant_act: 'question',
      interaction_tags: ['requests_information'],
      topic_refs: [],
      claims: [],
      response_expectation: { kind: 'answer', target_refs: [ref('npc', 'eremey')] }
    },
    interpretation: {
      intent: 'узнать правду',
      grounded_contribution: 'задать естественный вопрос',
      adaptation: 'historical_equivalent'
    },
    resolution: 'automatic',
    activity: { duration_class: 'brief', effort: 'none' },
    supporting_operations: [],
    check: null,
    handoff: null
  };
}

test('one invalid player contribution receives one structural repair attempt', async () => {
  const source = request();
  const calls = [];
  const result = await requestPlayerConversationContribution({
    request: source,
    conversationModel: async (_request, context) => {
      calls.push(context);
      return calls.length === 1 ? { schema: 'broken' } : plan(source);
    },
    revalidateStateVersion: async () => 2
  });

  assert.equal(result.status, 'planned');
  assert.equal(calls.length, 2);
  assert.equal(calls[0].repair, null);
  assert.deepEqual(calls[1].repair.original_output, { schema: 'broken' });
  assert.equal(calls[1].repair.validation_errors.length, 1);
});

test('second invalid player response returns a typed contract failure', async () => {
  let modelCalls = 0;
  await assert.rejects(requestPlayerConversationContribution({
    request: request(),
    conversationModel: async () => {
      modelCalls += 1;
      return { schema: 'broken' };
    },
    revalidateStateVersion: async () => 2
  }), (error) => error?.code === 'TURN_CONVERSATION_PLAN_INVALID');
  assert.equal(modelCalls, 2);
});
