import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildNpcDecisionBoundary,
  projectNpcConversationSubject
} from '@rus/npc-runtime';
import { requestNpcSemanticDecision } from '../src/npc-semantic-decision.js';

const ref = (entity_kind, entity_id) => ({ entity_kind, entity_id });
const requestedAt = {
  whole_minutes: '10',
  subminute_numerator: '0',
  subminute_denominator: '1'
};

test('format repair retains the semantic findings and the original intent anchor',
  async () => {
    const npcRef = ref('npc', 'speaker');
    const signalRefs = [ref('npc_decision_signal', 'signal-1')];
    const subject = projectNpcConversationSubject({
      npc_ref: npcRef,
      npc_snapshot: { instance_id: 'speaker' },
      current_activity_snapshot: {
        status: 'idle', can_continue_automatically: false
      }
    });
    const boundary = buildNpcDecisionBoundary({
      decision_mode: 'conversation',
      scheduled_at: requestedAt,
      npc_ref: npcRef,
      same_time_batch_ref: ref('temporal_batch', 'batch-1'),
      significance: 'material',
      categories: ['communication'],
      signal_refs: signalRefs,
      state_version: '2'
    });
    const decisionRequest = {
      schema: 'npc_conversation_response_request_v1',
      request_id: 'request-1',
      boundary_id: 'npc-decision:conversation:batch-1:speaker',
      conversation_id: 'conversation-1',
      exchange_id: 'exchange-1',
      state_version: 2,
      requested_at: requestedAt,
      npc_ref: npcRef,
      decision_reasons: {
        significance: 'material',
        categories: ['communication'],
        signal_refs: signalRefs,
        perceived_changes: ['Услышана реплика.']
      },
      npc: subject.npc,
      perceived_message: {
        source_statement_ref: ref('conversation_statement', 'statement-1'),
        perception_result_ref: ref('perception_result', 'perception-1')
      },
      public_conversation_history: [],
      knowledge: subject.knowledge,
      memory: subject.memory,
      social_context: {},
      available_resources: subject.available_resources,
      allowed_references: {
        actor_refs: [npcRef, ref('player_character', 'player')],
        entity_refs: [],
        knowledge_refs: subject.knowledge_refs,
        combat_target_refs: []
      },
      decision_scope: {
        conversation_mode: true,
        action_handoff_available: true,
        combat_handoff_available: false,
        allowed_attribute_refs: [],
        allowed_skill_refs: [],
        allowed_check_profile_refs: [],
        allowed_duration_classes: ['moment', 'brief', 'short', 'domain_owned'],
        operation_contract: {}
      }
    };
    const initial = {
      schema: 'conversation_contribution_plan_v1',
      request_id: decisionRequest.request_id,
      boundary_id: decisionRequest.boundary_id,
      conversation_id: decisionRequest.conversation_id,
      exchange_id: decisionRequest.exchange_id,
      state_version: decisionRequest.state_version,
      speaker_ref: npcRef,
      contribution_kind: 'speech',
      primary_addressee_ref: ref('player_character', 'player'),
      intended_addressee_refs: [ref('player_character', 'player')],
      affected_actor_refs: [],
      speech: {
        utterance_text: 'Вчера я видел переправу.',
        dominant_act: 'answer',
        interaction_tags: [],
        topic_refs: [],
        claims: [],
        response_expectation: { kind: 'none', target_refs: [] }
      },
      interpretation: {
        intent: 'сообщить о переправе',
        grounded_contribution: 'ответить о переправе',
        adaptation: 'literal'
      },
      resolution: 'automatic',
      activity: { duration_class: 'brief', effort: 'none' },
      supporting_operations: [],
      check: null,
      handoff: null,
      reason: 'Прямой ответ уместен.'
    };
    const semanticErrors = [
      {
        code: 'TRACE_NPC_SPEECH_GROUNDING_UNSUPPORTED',
        category: 'semantic_grounding',
        path: '$.speech.utterance_text',
        message: 'Реплика не подтверждена знанием персонажа.',
        retryable: true
      },
      {
        code: 'TRACE_NPC_SPEECH_GROUNDING_UNSUPPORTED',
        category: 'semantic_grounding',
        path: '$.interpretation.intent',
        message: 'Намерение не подтверждено знанием персонажа.',
        retryable: true
      }
    ];
    const semanticRepair = structuredClone(initial);
    semanticRepair.interpretation.intent = 'уточнить, что известно о переправе';
    semanticRepair.speech.utterance_text = 'Что вы знаете о переправе?';
    semanticRepair.interpretation.adaptation = 17;
    const formatRepair = structuredClone(semanticRepair);
    formatRepair.interpretation.adaptation = 'literal';
    const calls = [];
    let auditCalls = 0;
    const result = await requestNpcSemanticDecision({
      boundary,
      request: decisionRequest,
      semanticModel: async (_request, context) => {
        calls.push(context);
        return [initial, semanticRepair, formatRepair][calls.length - 1];
      },
      validateFreshPlan: () => ++auditCalls === 1
        ? { pass: false, errors: semanticErrors } : true,
      revalidateStateVersion: async () => 2
    });

    assert.equal(result.status, 'planned');
    assert.equal(calls.length, 3);
    assert.equal(calls[0].repair, null);
    assert.equal(calls[1].repair.kind, 'semantic');
    assert.deepEqual(calls[1].repair.validation_errors, semanticErrors);
    assert.equal(calls[2].repair.kind, 'format');
    assert.deepEqual(calls[2].repair.act_anchor, initial);
    assert.deepEqual(calls[2].repair.original_output, semanticRepair);
    assert.equal(JSON.stringify(calls[2].repair.original_output),
      JSON.stringify(semanticRepair));
    assert.ok(calls[2].repair.validation_errors.some((error) =>
      error.category === 'format'
      && error.path === '$.interpretation.adaptation'));
    assert.deepEqual(calls[2].repair.act_anchor_semantic_repair, {
      kind: 'semantic', validation_errors: semanticErrors
    });
  });
