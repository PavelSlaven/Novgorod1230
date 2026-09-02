import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildNpcDecisionBoundary,
  buildNpcSemanticDecisionTrace
} from '@rus/npc-runtime';
import { canonicalDigest } from '@rus/materialization';
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
    boundary_id: 'npc-decision:conversation:batch-1:speaker',
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
    allowed_references: {
      actor_refs: [
        ref('npc', 'speaker'),
        ref('player_character', 'player')
      ],
      entity_refs: [],
      knowledge_refs: [],
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

function autonomousBoundary(overrides = {}) {
  return boundary({
    decision_mode: 'autonomous',
    categories: ['objective'],
    state_version: '2',
    ...overrides
  });
}

function autonomousRequest(overrides = {}) {
  return {
    schema: 'npc_action_decision_request_v1',
    request_id: 'autonomous-request-1',
    root_turn_id: 'turn-1',
    boundary_id: 'npc-decision:autonomous:batch-1:speaker',
    committed_state_version: 2,
    working_revision: 0,
    decision_index: 1,
    occurred_at: requestedAt,
    npc_ref: 'speaker',
    decision_reasons: {
      significance: 'material',
      categories: ['objective'],
      signal_refs: [ref('npc_decision_signal', 'signal-1')],
      perceived_changes: ['Ожидание завершилось без возвращения Ратши.']
    },
    historical_context: {
      year: 1230,
      season: 'late_summer',
      region: 'Нижняя Двина',
      applicable_norms: [],
      known_local_customs: []
    },
    npc: {
      profile_level: 'scene',
      identity: { name_or_label: 'Жданко', age_range: 'adult', origin: null },
      social_role: {
        role_ref: 'storehouse_controller',
        status: 'управляющий',
        authority: [],
        dependencies: []
      },
      attributes: [],
      skills: [],
      body_state: { summary: 'может действовать', conditions: [] },
      mood: { state: 'тревожен', intensity: 'material' },
      temperament: [],
      values: [],
      goals: [{ goal_ref: 'prepare_departure' }],
      fears: [{ fear_ref: 'accountability' }],
      obligations: [],
      relationships: [],
      current_activity: {
        activity_ref: 'wait-ratsha',
        summary: 'ожидает возвращения Ратши',
        status: 'decision_required',
        can_continue_automatically: false
      },
      available_resources: [{ item_ref: 'road-bag' }]
    },
    perception: {
      visible_scene: [], perceived_changes: [], heard: [], felt: [],
      present_actors: [], visible_objects: [], known_routes_and_exits: [],
      uncertainties: []
    },
    knowledge: { known_facts: [], beliefs: [], hypotheses: [] },
    memory: {
      recent_events: [], relevant_long_term_events: [], previous_decisions: []
    },
    decision_scope: {
      mode: 'autonomous_action',
      allowed_attribute_refs: [],
      allowed_skill_refs: [],
      operation_contract: { request_activity: { activity_refs: ['move-bag'] } }
    },
    ...overrides
  };
}

function autonomousPlan(sourceRequest = autonomousRequest()) {
  return {
    schema: 'npc_step_plan_v1',
    request_id: sourceRequest.request_id,
    root_turn_id: sourceRequest.root_turn_id,
    boundary_id: sourceRequest.boundary_id,
    committed_state_version: sourceRequest.committed_state_version,
    working_revision: sourceRequest.working_revision,
    decision_index: sourceRequest.decision_index,
    npc_ref: sourceRequest.npc_ref,
    interpretation: {
      npc_goal: 'подготовиться к уходу',
      grounded_attempt: 'начать перенос дорожной сумки',
      adaptation: 'literal'
    },
    resolution: 'domain_request',
    goal_result: 'pending',
    activity: { owner: 'domain', duration_class: null, effort: null },
    operations: [{
      op: 'request_activity',
      actor_ref: sourceRequest.npc_ref,
      activity_kind: 'work',
      target_refs: ['road-bag'],
      description: 'Начать перенос дорожной сумки.'
    }],
    check: null,
    reason_code: 'prepare_departure',
    reason: 'Ратша не вернулся к сроку.'
  };
}

function persistedInputFor(decisionBoundary, decisionRequest, trace) {
  const orderedSignals = decisionBoundary.signal_refs.map(
    ({ entity_id: signalId }) => ({ signal_id: signalId }));
  return {
    orderedSignals,
    persistedInput: {
      trace,
      request_snapshot: structuredClone(decisionRequest),
      boundary_snapshot: structuredClone(decisionBoundary),
      signal_records: structuredClone(orderedSignals),
      canonical_input_digest: canonicalDigest({
        schema: 'npc_semantic_decision_input_v1',
        request: decisionRequest,
        boundary: decisionBoundary,
        signal_records: orderedSignals
      })
    }
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

test('initial NPC JSON parse failure reaches exactly one format repair', async () => {
  const decisionRequest = request();
  const calls = [];
  const result = await requestNpcSemanticDecision({
    boundary: boundary(), request: decisionRequest,
    semanticModel: async (_request, context) => {
      calls.push(context);
      if (calls.length === 1) throw Object.assign(new Error('bad JSON'), {
        code: 'json_parse_failed'
      });
      return plan(decisionRequest);
    },
    revalidateStateVersion: async () => 2
  });
  assert.equal(result.status, 'planned');
  assert.equal(calls.length, 2);
  assert.equal(calls[0].repair, null);
  assert.deepEqual(calls[1].repair.original_output, {});
});

test('NPC repair parse failure and non-parse model failure do not retry again', async (t) => {
  await t.test('repair parse failure', async () => {
    let calls = 0;
    await assert.rejects(requestNpcSemanticDecision({
      boundary: boundary(), request: request(),
      semanticModel: async () => {
        calls += 1;
        throw Object.assign(new Error('bad JSON'), { code: 'json_parse_failed' });
      },
      revalidateStateVersion: async () => 2
    }), { code: 'TURN_NPC_MODEL_FAILED' });
    assert.equal(calls, 2);
  });
  await t.test('non-parse failure', async () => {
    let calls = 0;
    await assert.rejects(requestNpcSemanticDecision({
      boundary: boundary(), request: request(),
      semanticModel: async () => {
        calls += 1;
        throw Object.assign(new Error('provider failed'), { code: 'http_500' });
      },
      revalidateStateVersion: async () => 2
    }), { code: 'TURN_NPC_MODEL_FAILED' });
    assert.equal(calls, 1);
  });
});

test('invalid NPC dominant_act repair identifies its enum path', async () => {
  const decisionRequest = request();
  const calls = [];
  const invalidPlan = plan(decisionRequest);
  invalidPlan.speech.dominant_act = 'deny';
  const result = await requestNpcSemanticDecision({
    boundary: boundary(),
    request: decisionRequest,
    semanticModel: async (_request, context) => {
      calls.push(context);
      return calls.length === 1 ? invalidPlan : plan(decisionRequest);
    },
    revalidateStateVersion: async () => 2
  });

  assert.equal(result.status, 'planned');
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1].repair.validation_errors, [{
    code: 'invalid_enum',
    path: '$.speech.dominant_act',
    message: 'dominant_act must be one of the allowed values.',
    allowed_values: [
      'greet', 'farewell', 'question', 'answer', 'inform', 'request',
      'command', 'offer', 'accept', 'refuse', 'negotiate', 'promise',
      'threaten', 'accuse', 'confess', 'evade', 'warn', 'challenge',
      'apologize'
    ]
  }]);
});

test('one retryable NPC semantic inconsistency receives one repair', async () => {
  const decisionRequest = request();
  const calls = [];
  const result = await requestNpcSemanticDecision({
    boundary: boundary(),
    request: decisionRequest,
    semanticModel: async (_request, context) => {
      calls.push(context);
      return plan(decisionRequest);
    },
    validatePlan: () => calls.length === 1 ? {
      pass: false,
      errors: [{ code: 'TEST_SEMANTIC_INCONSISTENCY',
        category: 'semantic_consistency', retryable: true }]
    } : true,
    revalidateStateVersion: async () => 2
  });

  assert.equal(result.status, 'planned');
  assert.equal(calls.length, 2);
  assert.equal(calls[1].repair.validation_errors[0].code,
    'TEST_SEMANTIC_INCONSISTENCY');
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
