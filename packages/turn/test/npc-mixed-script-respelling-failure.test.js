import assert from 'node:assert/strict';
import test from 'node:test';
import { buildNpcDecisionBoundary, projectNpcConversationSubject } from '@rus/npc-runtime';
import { requestNpcSemanticDecision } from '../src/npc-semantic-decision.js';

const ref = (entity_kind, entity_id) => ({ entity_kind, entity_id });
const requestedAt = { whole_minutes: '10', subminute_numerator: '0', subminute_denominator: '1' };
const expectedRespelling = [{ path: '$.speech.utterance_text',
  before: 'Здpавствуй', after: 'Здравствуй' }];

function fixture(utterance) {
  const npc_ref = ref('npc', 'speaker');
  const subject = projectNpcConversationSubject({ npc_ref,
    npc_snapshot: { instance_id: 'speaker' },
    current_activity_snapshot: { status: 'idle', can_continue_automatically: false } });
  const boundary = buildNpcDecisionBoundary({ decision_mode: 'conversation',
    scheduled_at: requestedAt, npc_ref,
    same_time_batch_ref: ref('temporal_batch', 'batch-1'), significance: 'material',
    categories: ['communication'], signal_refs: [ref('npc_decision_signal', 'signal-1')],
    state_version: '2' });
  const request = {
    schema: 'npc_conversation_response_request_v1', request_id: 'request-1',
    boundary_id: boundary.boundary_id, conversation_id: 'conversation-1',
    exchange_id: 'exchange-1', state_version: 2, requested_at: requestedAt, npc_ref,
    decision_reasons: { significance: 'material', categories: ['communication'],
      signal_refs: [ref('npc_decision_signal', 'signal-1')],
      perceived_changes: ['Услышана реплика.'] },
    npc: subject.npc, perceived_message: {
      source_statement_ref: ref('conversation_statement', 'statement-1'),
      perception_result_ref: ref('perception_result', 'perception-1') },
    public_conversation_history: [], knowledge: subject.knowledge, memory: subject.memory,
    social_context: {}, available_resources: subject.available_resources,
    allowed_references: { actor_refs: [npc_ref, ref('player_character', 'player')],
      entity_refs: [], knowledge_refs: subject.knowledge_refs, combat_target_refs: [] },
    decision_scope: { conversation_mode: true, action_handoff_available: true,
      combat_handoff_available: false, allowed_attribute_refs: [], allowed_skill_refs: [],
      allowed_check_profile_refs: [],
      allowed_duration_classes: ['moment', 'brief', 'short', 'domain_owned'],
      operation_contract: {} }
  };
  const plan = {
    schema: 'conversation_contribution_plan_v1', request_id: request.request_id,
    boundary_id: request.boundary_id, conversation_id: request.conversation_id,
    exchange_id: request.exchange_id, state_version: request.state_version,
    speaker_ref: npc_ref, contribution_kind: 'speech',
    primary_addressee_ref: ref('player_character', 'player'),
    intended_addressee_refs: [ref('player_character', 'player')], affected_actor_refs: [],
    speech: { utterance_text: utterance, dominant_act: 'answer', interaction_tags: [],
      topic_refs: [], claims: [], response_expectation: { kind: 'none', target_refs: [] } },
    interpretation: { intent: 'ответить', grounded_contribution: 'подтвердить, что реплика услышана',
      adaptation: 'literal' }, resolution: 'automatic',
    activity: { duration_class: 'brief', effort: 'none' },
    supporting_operations: [], check: null, handoff: null, reason: 'Прямой ответ уместен.'
  };
  return { boundary, request, plan };
}

const groundingFailure = { pass: false, errors: [{
  code: 'TRACE_NPC_SPEECH_GROUNDING_UNSUPPORTED', category: 'semantic_grounding',
  retryable: true, path: '$.speech.utterance_text', quote: 'Здравствуй'
}] };

for (const [utterance, expected] of [
  ['Здpавствуй.', expectedRespelling],
  ['Здравствуй.', null]
]) {
  test(`exhausted semantic repair ${expected ? 'keeps' : 'omits'} script respellings`, async () => {
    const { boundary, request, plan } = fixture(utterance);
    let calls = 0;
    await assert.rejects(requestNpcSemanticDecision({ boundary, request,
      semanticModel: async () => {
        const answer = structuredClone(plan);
        if (++calls === 2) answer.speech.utterance_text = 'Здравствуй.';
        return answer;
      },
      validateFreshPlan: () => groundingFailure,
      revalidateStateVersion: async () => 2,
      maxRepairAttempts: 1
    }), error => {
      assert.equal(error.code, 'TURN_NPC_CONVERSATION_CONTRACT_FAILURE');
      assert.equal(error.details.category, 'semantic');
      if (expected) assert.deepEqual(error.details.script_respellings, expected);
      else assert.equal(Object.hasOwn(error.details, 'script_respellings'), false);
      return true;
    });
    assert.equal(calls, 2);
  });
}

test('an unrepairable response keeps the first answer’s script respelling', async () => {
  const { boundary, request, plan } = fixture('Здpавствуй.');
  let calls = 0;
  await assert.rejects(requestNpcSemanticDecision({ boundary, request,
    semanticModel: async () => {
      if (++calls === 1) return structuredClone(plan);
      const error = new Error('Response declared unrepairable');
      error.code = 'TURN_NPC_CONVERSATION_CONTRACT_FAILURE';
      error.details = { category: 'semantic', validation_errors: [] };
      throw error;
    },
    validateFreshPlan: () => groundingFailure,
    revalidateStateVersion: async () => 2,
    maxRepairAttempts: 1
  }), error => {
    assert.equal(error.code, 'TURN_NPC_CONVERSATION_CONTRACT_FAILURE');
    assert.equal(error.details.category, 'semantic');
    assert.deepEqual(error.details.script_respellings, expectedRespelling);
    return true;
  });
  assert.equal(calls, 2);
});
