import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildNpcDecisionBoundary,
  buildNpcSemanticDecisionTrace
} from '@rus/npc-runtime';
import { requestNpcSemanticDecision } from '../src/npc-semantic-decision.js';

const ref = (entity_kind, entity_id) => ({ entity_kind, entity_id });
const requestedAt = {
  whole_minutes: '10',
  subminute_numerator: '0',
  subminute_denominator: '1'
};

function boundary(overrides = {}) {
  return buildNpcDecisionBoundary({
    decision_mode: 'conversation',
    scheduled_at: requestedAt,
    npc_ref: ref('npc', 'speaker'),
    same_time_batch_ref: ref('temporal_batch', 'batch-1'),
    significance: 'material',
    categories: ['communication'],
    signal_refs: [ref('npc_decision_signal', 'signal-1')],
    state_version: '2',
    ...overrides
  });
}

function request(overrides = {}) {
  return {
    schema: 'npc_conversation_response_request_v1',
    request_id: 'request-1',
    boundary_id: 'npc-decision:batch-1:speaker',
    conversation_id: 'conversation-1',
    exchange_id: 'exchange-1',
    state_version: 2,
    requested_at: requestedAt,
    npc_ref: ref('npc', 'speaker'),
    decision_reasons: {
      significance: 'material',
      categories: ['communication'],
      signal_refs: [ref('npc_decision_signal', 'signal-1')],
      perceived_changes: ['Услышана реплика.']
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
    decision_scope: {
      conversation_mode: true,
      action_handoff_available: true,
      combat_handoff_available: false,
      allowed_attribute_refs: [],
      allowed_skill_refs: [],
      operation_contract: {}
    },
    ...overrides
  };
}

function plan(sourceRequest = request()) {
  return {
    schema: 'conversation_contribution_plan_v1',
    request_id: sourceRequest.request_id,
    boundary_id: sourceRequest.boundary_id,
    conversation_id: sourceRequest.conversation_id,
    exchange_id: sourceRequest.exchange_id,
    state_version: sourceRequest.state_version,
    speaker_ref: sourceRequest.npc_ref,
    contribution_kind: 'speech',
    primary_addressee_ref: ref('player_character', 'player'),
    intended_addressee_refs: [ref('player_character', 'player')],
    affected_actor_refs: [],
    speech: {
      utterance_text: 'Я слышу.',
      dominant_act: 'answer',
      interaction_tags: [],
      topic_refs: [],
      claims: [],
      response_expectation: { kind: 'none', target_refs: [] }
    },
    interpretation: {
      intent: 'ответить',
      grounded_contribution: 'подтвердить, что реплика услышана',
      adaptation: 'literal'
    },
    resolution: 'automatic',
    activity: { duration_class: 'brief', effort: 'none' },
    supporting_operations: [],
    check: null,
    handoff: null,
    reason: 'Прямой ответ уместен.'
  };
}

test('concurrent identical boundary input shares one NPC model call and conflicting input does not call it again', async () => {
  const decisionBoundary = boundary();
  const decisionRequest = request();
  let releaseModel;
  const modelGate = new Promise((resolve) => { releaseModel = resolve; });
  let modelCalls = 0;
  const semanticModel = async () => {
    modelCalls += 1;
    await modelGate;
    return plan(decisionRequest);
  };
  const revalidateStateVersion = async () => 2;

  const first = requestNpcSemanticDecision({
    boundary: decisionBoundary,
    request: decisionRequest,
    semanticModel,
    revalidateStateVersion
  });
  const duplicate = requestNpcSemanticDecision({
    boundary: decisionBoundary,
    request: structuredClone(decisionRequest),
    semanticModel,
    revalidateStateVersion
  });
  const conflictingRequest = request({
    public_conversation_history: [{ statement_id: 'earlier-statement' }]
  });

  await assert.rejects(
    requestNpcSemanticDecision({
      boundary: decisionBoundary,
      request: conflictingRequest,
      semanticModel,
      revalidateStateVersion
    }),
    (error) => error?.code === 'TURN_NPC_IDENTITY_MISMATCH'
  );
  assert.equal(modelCalls, 1);

  releaseModel();
  const [firstResult, duplicateResult] = await Promise.all([first, duplicate]);
  assert.deepEqual(duplicateResult, firstResult);
  assert.equal(modelCalls, 1);
});

test('committed semantic trace replays without model or state revalidation calls', async () => {
  const decisionBoundary = boundary();
  const decisionRequest = request();
  const decisionPlan = plan(decisionRequest);
  const persistedTrace = buildNpcSemanticDecisionTrace({
    request: decisionRequest,
    plan: decisionPlan,
    root_turn_id: 'turn-1',
    working_revision: 0,
    applied_change_set_id: 'change-set-1'
  });
  let modelCalls = 0;
  let revalidationCalls = 0;

  const result = await requestNpcSemanticDecision({
    boundary: decisionBoundary,
    request: decisionRequest,
    persistedTrace,
    semanticModel: async () => {
      modelCalls += 1;
      return decisionPlan;
    },
    revalidateStateVersion: async () => {
      revalidationCalls += 1;
      return 2;
    }
  });

  assert.equal(result.status, 'replayed');
  assert.deepEqual(result.plan, decisionPlan);
  assert.deepEqual(result.signal_ids_to_consume, []);
  assert.equal(modelCalls, 0);
  assert.equal(revalidationCalls, 0);
});

test('one invalid NPC response receives one structural repair attempt', async () => {
  const decisionRequest = request();
  const calls = [];
  const result = await requestNpcSemanticDecision({
    boundary: boundary(),
    request: decisionRequest,
    semanticModel: async (_request, context) => {
      calls.push(context);
      return calls.length === 1 ? { schema: 'broken' } : plan(decisionRequest);
    },
    revalidateStateVersion: async () => 2
  });

  assert.equal(result.status, 'planned');
  assert.equal(calls.length, 2);
  assert.equal(calls[0].repair, null);
  assert.deepEqual(calls[1].repair.original_output, { schema: 'broken' });
  assert.equal(calls[1].repair.validation_errors.length, 1);
});

test('failed uncommitted NPC decision releases its in-flight claim for retry', async () => {
  const decisionRequest = request();
  let modelCalls = 0;
  const semanticModel = async () => {
    modelCalls += 1;
    if (modelCalls === 1) throw new Error('temporary outage');
    return plan(decisionRequest);
  };

  await assert.rejects(requestNpcSemanticDecision({
    boundary: boundary(),
    request: decisionRequest,
    semanticModel,
    revalidateStateVersion: async () => 2
  }), (error) => error?.code === 'TURN_NPC_MODEL_FAILED');

  const retry = await requestNpcSemanticDecision({
    boundary: boundary(),
    request: decisionRequest,
    semanticModel,
    revalidateStateVersion: async () => 2
  });
  assert.equal(retry.status, 'planned');
  assert.equal(modelCalls, 2);
});

test('stale uncommitted NPC response allows a new request for changed state', async () => {
  let modelCalls = 0;
  await assert.rejects(requestNpcSemanticDecision({
    boundary: boundary(),
    request: request(),
    semanticModel: async (source) => {
      modelCalls += 1;
      return plan(source);
    },
    revalidateStateVersion: async () => 3
  }), (error) => error?.code === 'TURN_NPC_STATE_STALE');

  const currentRequest = request({ state_version: 3 });
  const result = await requestNpcSemanticDecision({
    boundary: boundary({ state_version: '3' }),
    request: currentRequest,
    semanticModel: async (source) => {
      modelCalls += 1;
      return plan(source);
    },
    revalidateStateVersion: async () => 3
  });
  assert.equal(result.status, 'planned');
  assert.equal(modelCalls, 2);
});

test('second invalid NPC response returns a typed contract failure', async () => {
  let modelCalls = 0;
  await assert.rejects(requestNpcSemanticDecision({
    boundary: boundary(),
    request: request(),
    semanticModel: async () => {
      modelCalls += 1;
      return { schema: 'broken' };
    },
    revalidateStateVersion: async () => 2
  }), (error) => error?.code === 'TURN_NPC_PLAN_INVALID');
  assert.equal(modelCalls, 2);
});
