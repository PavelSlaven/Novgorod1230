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

test('autonomous request uses one model call and returns signal consumption', async () => {
  let calls = 0;
  const sourceRequest = autonomousRequest();
  const result = await requestNpcSemanticDecision({
    boundary: autonomousBoundary(),
    request: sourceRequest,
    semanticModel: async () => {
      calls += 1;
      return autonomousPlan(sourceRequest);
    },
    revalidateStateVersion: async () => 2
  });
  assert.equal(result.status, 'planned');
  assert.equal(calls, 1);
  assert.deepEqual(result.signal_ids_to_consume, ['signal-1']);
});

test('applicability runs only after current state revalidation',
  async () => {
    const sourceRequest = autonomousRequest();
    let modelCalls = 0;
    let revalidationCalls = 0;
    const result = await requestNpcSemanticDecision({
      boundary: autonomousBoundary(),
      request: sourceRequest,
      semanticModel: async () => {
        modelCalls += 1;
        return autonomousPlan(sourceRequest);
      },
      validatePlan: () => ({
        pass: false,
        errors: [{
          code: 'NPC_ACTIVITY_EXECUTION_NOT_APPLICABLE',
          category: 'applicability',
          retryable: false
        }]
      }),
      revalidateStateVersion: async () => {
        revalidationCalls += 1;
        return 2;
      }
    });

    assert.equal(modelCalls, 1);
    assert.equal(revalidationCalls, 1);
    assert.equal(result.status, 'domain_rejected');
    assert.equal(result.domain_result.pass, false);
    assert.equal(result.domain_result.errors[0].code,
      'NPC_ACTIVITY_EXECUTION_NOT_APPLICABLE');
    assert.deepEqual(result.signal_ids_to_consume, []);
  });

test('trace-only autonomous replay returns committed decision', async () => {
  const sourceRequest = autonomousRequest();
  const trace = buildNpcSemanticDecisionTrace({
    request: sourceRequest,
    plan: autonomousPlan(sourceRequest),
    applied_change_set_id: 'change-trace-only'
  });
  let calls = 0;
  const result = await requestNpcSemanticDecision({
    boundary: autonomousBoundary(),
    request: sourceRequest,
    persistedTrace: trace,
    semanticModel: async () => {
      calls += 1;
      return assert.fail('model must not be called');
    },
    revalidateStateVersion: async () => 2
  });
  assert.equal(result.status, 'replayed');
  assert.equal(calls, 0);
});

test('fresh legacy boundary identity cannot call the NPC model', async () => {
  const legacyId = 'npc-decision:batch-1:speaker';
  const legacyBoundary = {
    ...structuredClone(autonomousBoundary()),
    boundary_id: legacyId,
    idempotency_key: legacyId
  };
  let modelCalls = 0;

  await assert.rejects(requestNpcSemanticDecision({
    boundary: legacyBoundary,
    request: autonomousRequest({ boundary_id: legacyId }),
    semanticModel: async () => {
      modelCalls += 1;
      return autonomousPlan();
    },
    revalidateStateVersion: async () => 2
  }), ({ code }) => code === 'TURN_NPC_LEGACY_BOUNDARY_REPLAY_REQUIRED');
  assert.equal(modelCalls, 0);
});

test('persisted legacy boundary identity replays without model call', async () => {
  const legacyId = 'npc-decision:batch-1:speaker';
  const legacyBoundary = {
    ...structuredClone(autonomousBoundary()),
    boundary_id: legacyId,
    idempotency_key: legacyId
  };
  const legacyRequest = autonomousRequest({ boundary_id: legacyId });
  const legacyPlan = autonomousPlan(legacyRequest);
  const persistedTrace = buildNpcSemanticDecisionTrace({
    request: legacyRequest,
    plan: legacyPlan,
    applied_change_set_id: 'change-legacy'
  });
  const { persistedInput, orderedSignals } = persistedInputFor(
    legacyBoundary, legacyRequest, persistedTrace);
  let modelCalls = 0;

  const result = await requestNpcSemanticDecision({
    boundary: legacyBoundary,
    request: legacyRequest,
    persistedTrace,
    persistedInput,
    orderedSignals,
    semanticModel: async () => {
      modelCalls += 1;
      return assert.fail('model must not be called');
    },
    revalidateStateVersion: async () => 2
  });

  assert.equal(result.status, 'replayed');
  assert.equal(result.trace.boundary_id, legacyId);
  assert.equal(modelCalls, 0);
});

test('autonomous v1 rejects prototype-only NPC fields', async () => {
  const sourceRequest = autonomousRequest();
  sourceRequest.npc.profile_ref = 'zhdanko-profile';
  sourceRequest.npc.current_location = {
    location_ref: 'storehouse',
    zone_ref: 'storehouse_inside'
  };
  let modelCalls = 0;
  await assert.rejects(requestNpcSemanticDecision({
    boundary: autonomousBoundary(),
    request: sourceRequest,
    semanticModel: async () => {
      modelCalls += 1;
      return autonomousPlan(sourceRequest);
    },
    revalidateStateVersion: async () => 2
  }), ({ code }) => code === 'TURN_NPC_REQUEST_INVALID');
  assert.equal(modelCalls, 0);
});

test('autonomous replay tolerates digest drift when boundary_id matches',
  async () => {
    const decisionBoundary = autonomousBoundary({
      categories: ['self', 'objective'],
      signal_refs: [
        ref('npc_decision_signal', 'signal-objective'),
        ref('npc_decision_signal', 'signal-self')
      ]
    });
    const decisionRequest = autonomousRequest();
    decisionRequest.decision_reasons.categories = ['self', 'objective'];
    decisionRequest.decision_reasons.signal_refs =
      structuredClone(decisionBoundary.signal_refs);
    const decisionPlan = autonomousPlan(decisionRequest);
    const trace = buildNpcSemanticDecisionTrace({
      request: decisionRequest,
      plan: decisionPlan,
      applied_change_set_id: 'change-multi'
    });
    const orderedSignals = [
      { signal_id: 'signal-objective', category: 'objective' },
      { signal_id: 'signal-self', category: 'self' }
    ];
    const persistedInput = {
      trace,
      request_snapshot: structuredClone(decisionRequest),
      boundary_snapshot: structuredClone(decisionBoundary),
      signal_records: structuredClone(orderedSignals),
      canonical_input_digest: 'stale-digest-not-rechecked'
    };
    const result = await requestNpcSemanticDecision({
      boundary: decisionBoundary,
      request: decisionRequest,
      persistedTrace: trace,
      persistedInput,
      orderedSignals: [...orderedSignals,
        { signal_id: 'signal-extra', category: 'environment' }],
      semanticModel: async () => assert.fail('model must not be called'),
      revalidateStateVersion: async () => 2
    });
    assert.equal(result.status, 'replayed');

    const foreignInput = {
      ...persistedInput,
      boundary_snapshot: {
        ...structuredClone(decisionBoundary),
        boundary_id: 'npc-decision:foreign-boundary'
      }
    };
    await assert.rejects(requestNpcSemanticDecision({
      boundary: decisionBoundary,
      request: decisionRequest,
      persistedTrace: trace,
      persistedInput: foreignInput,
      orderedSignals,
      semanticModel: async () => decisionPlan,
      revalidateStateVersion: async () => 2
    }), ({ code }) => code === 'TURN_NPC_TRACE_INPUT_MISMATCH');
  });

test('persisted autonomous trace must pass caller operation contract gate',
  async () => {
    const sourceRequest = autonomousRequest();
    const sourcePlan = autonomousPlan(sourceRequest);
    const persistedTrace = buildNpcSemanticDecisionTrace({
      request: sourceRequest,
      plan: sourcePlan,
      applied_change_set_id: 'change-1'
    });
    const decisionBoundary = autonomousBoundary();
    const { persistedInput, orderedSignals } = persistedInputFor(
      decisionBoundary, sourceRequest, persistedTrace);
    let modelCalls = 0;
    let revalidationCalls = 0;
    await assert.rejects(requestNpcSemanticDecision({
      boundary: decisionBoundary,
      request: sourceRequest,
      persistedTrace,
      persistedInput,
      orderedSignals,
      semanticModel: async () => {
        modelCalls += 1;
        return sourcePlan;
      },
      revalidateStateVersion: async () => {
        revalidationCalls += 1;
        return 2;
      },
      validatePlan: () => false
    }), ({ code }) => code === 'TURN_NPC_TRACE_INVALID');
    assert.equal(modelCalls, 0);
    assert.equal(revalidationCalls, 0);
  });

test('stale autonomous response rebuilds the current request before domain validation',
  async () => {
    const staleRequest = autonomousRequest();
    const currentRequest = autonomousRequest({
      request_id: 'autonomous-request-current',
      committed_state_version: 3,
      working_revision: 1
    });
    const currentBoundary = autonomousBoundary({ state_version: '3' });
    let modelCalls = 0;
    let revalidationCalls = 0;
    const validatedVersions = [];

    const result = await requestNpcSemanticDecision({
      boundary: autonomousBoundary(),
      request: staleRequest,
      semanticModel: async (source) => {
        modelCalls += 1;
        return autonomousPlan(source);
      },
      revalidateStateVersion: async () => {
        revalidationCalls += 1;
        return 3;
      },
      rebuildDecisionContext: async ({
        stale_boundary: staleBoundary,
        stale_request: discardedRequest,
        current_state_version: currentStateVersion
      }) => {
        assert.equal(staleBoundary.boundary_id,
          autonomousBoundary().boundary_id);
        assert.equal(discardedRequest.committed_state_version, 2);
        assert.equal(currentStateVersion, 3);
        return {
          boundary: currentBoundary,
          request: currentRequest,
          ordered_signals: [{ signal_id: 'signal-1' }]
        };
      },
      validatePlan: (_plan, validatedRequest) => {
        validatedVersions.push(validatedRequest.committed_state_version);
        return true;
      }
    });

    assert.equal(result.status, 'planned');
    assert.equal(result.plan.committed_state_version, 3);
    assert.equal(result.decision_context.request.request_id,
      'autonomous-request-current');
    assert.equal(modelCalls, 2);
    assert.equal(revalidationCalls, 2);
    assert.deepEqual(validatedVersions, [3]);
  });

test('stale autonomous response is discarded without another model call when its boundary is obsolete',
  async () => {
    let modelCalls = 0;
    let validationCalls = 0;
    const result = await requestNpcSemanticDecision({
      boundary: autonomousBoundary(),
      request: autonomousRequest(),
      semanticModel: async (source) => {
        modelCalls += 1;
        return autonomousPlan(source);
      },
      revalidateStateVersion: async () => 3,
      rebuildDecisionContext: async () => null,
      validatePlan: () => {
        validationCalls += 1;
        return true;
      }
    });

    assert.equal(result.status, 'stale_discarded');
    assert.equal(result.plan, null);
    assert.equal(modelCalls, 1);
    assert.equal(validationCalls, 0);
    assert.deepEqual(result.signal_ids_to_consume, []);
  });

test('stale autonomous rebuild rejects a different boundary identity',
  async () => {
    const currentRequest = autonomousRequest({
      request_id: 'autonomous-request-current',
      boundary_id: 'npc-decision:autonomous:different-batch:speaker',
      committed_state_version: 3,
      working_revision: 1
    });
    const currentBoundary = autonomousBoundary({
      same_time_batch_ref: ref('temporal_batch', 'different-batch'),
      state_version: '3'
    });
    await assert.rejects(requestNpcSemanticDecision({
      boundary: autonomousBoundary(),
      request: autonomousRequest(),
      semanticModel: async (source) => autonomousPlan(source),
      revalidateStateVersion: async () => 3,
      rebuildDecisionContext: async () => ({
        boundary: currentBoundary,
        request: currentRequest,
        ordered_signals: [{ signal_id: 'signal-1' }]
      })
    }), (error) =>
      error?.code === 'TURN_NPC_STATE_REBUILD_IDENTITY_MISMATCH');
  });
