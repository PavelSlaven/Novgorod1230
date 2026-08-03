import assert from 'node:assert/strict';
import test from 'node:test';
import { buildNpcDecisionBoundary } from '@rus/npc-runtime';
import {
  createNpcSemanticDecisionStore
} from '../src/infrastructure/postgres/lower-dvina-trace-npc-semantic-decision-store.js';

const PARTY_ID = 'party-1';
const requestedAt = Object.freeze({
  whole_minutes: '10',
  subminute_numerator: '0',
  subminute_denominator: '1'
});
const ref = (entity_kind, entity_id) => ({ entity_kind, entity_id });

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

test('first claim is acquired and completed without persisting semantic request', async () => {
  const pool = claimPool();
  const store = createNpcSemanticDecisionStore({ partyPool: pool, partyId: PARTY_ID });
  const decisionRequest = request();
  const decisionPlan = plan(decisionRequest);
  let modelCalls = 0;

  const result = await store.resolve({
    boundary: boundary(),
    request: decisionRequest,
    semanticModel: async () => {
      modelCalls += 1;
      return decisionPlan;
    }
  });

  assert.deepEqual(result, decisionPlan);
  assert.notStrictEqual(result, decisionPlan);
  assert.equal(modelCalls, 1);
  assert.equal(pool.claims.length, 1);
  assert.equal(pool.claims[0].status, 'completed');
  assert.equal(Object.hasOwn(pool.claims[0], 'semantic_request'), false);
});

test('concurrent pending claim fails closed without a second model call', async () => {
  const pool = claimPool();
  const store = createNpcSemanticDecisionStore({ partyPool: pool, partyId: PARTY_ID });
  const decisionRequest = request();
  let releaseModel;
  let markModelStarted;
  const modelGate = new Promise((resolve) => { releaseModel = resolve; });
  const modelStarted = new Promise((resolve) => { markModelStarted = resolve; });
  let modelCalls = 0;
  const semanticModel = async () => {
    modelCalls += 1;
    markModelStarted();
    await modelGate;
    return plan(decisionRequest);
  };

  const first = store.resolve({
    boundary: boundary(),
    request: decisionRequest,
    semanticModel
  });
  await modelStarted;

  await assert.rejects(
    store.resolve({
      boundary: boundary(),
      request: structuredClone(decisionRequest),
      semanticModel
    }),
    (error) => error?.code === 'NPC_SEMANTIC_DECISION_PENDING'
  );
  assert.equal(modelCalls, 1);

  releaseModel();
  await first;
});

test('completed claim replays without calling the model', async () => {
  const pool = claimPool();
  const store = createNpcSemanticDecisionStore({ partyPool: pool, partyId: PARTY_ID });
  const decisionRequest = request();
  const decisionPlan = plan(decisionRequest);
  await store.resolve({
    boundary: boundary(),
    request: decisionRequest,
    semanticModel: async () => decisionPlan
  });
  const replayed = await store.resolve({
    boundary: boundary(),
    request: structuredClone(decisionRequest)
  });

  assert.deepEqual(replayed, decisionPlan);
  assert.notStrictEqual(replayed, pool.claims[0].semantic_plan);
});

test('claim rejects conflicting mode and canonical input digest', async () => {
  const pool = claimPool();
  const store = createNpcSemanticDecisionStore({ partyPool: pool, partyId: PARTY_ID });
  const decisionRequest = request();
  let modelCalls = 0;
  const semanticModel = async () => {
    modelCalls += 1;
    return plan(decisionRequest);
  };
  await store.resolve({ boundary: boundary(), request: decisionRequest, semanticModel });

  await assert.rejects(
    store.resolve({
      boundary: boundary({ decision_mode: 'autonomous' }),
      request: decisionRequest,
      semanticModel
    }),
    (error) => error?.code === 'NPC_SEMANTIC_DECISION_IDENTITY_CONFLICT'
  );
  await assert.rejects(
    store.resolve({
      boundary: boundary(),
      request: request({ memory: { private_note: 'different input' } }),
      semanticModel
    }),
    (error) => error?.code === 'NPC_SEMANTIC_DECISION_IDENTITY_CONFLICT'
  );
  assert.equal(modelCalls, 1);
});

test('model failure leaves a pending claim that is never retried', async () => {
  const pool = claimPool();
  const store = createNpcSemanticDecisionStore({ partyPool: pool, partyId: PARTY_ID });
  const modelFailure = new Error('model unavailable');
  let modelCalls = 0;
  const semanticModel = async () => {
    modelCalls += 1;
    throw modelFailure;
  };

  await assert.rejects(
    store.resolve({ boundary: boundary(), request: request(), semanticModel }),
    (error) => error === modelFailure
  );
  assert.equal(pool.claims[0].status, 'pending');

  await assert.rejects(
    store.resolve({ boundary: boundary(), request: request(), semanticModel }),
    (error) => error?.code === 'NPC_SEMANTIC_DECISION_PENDING'
  );
  assert.equal(modelCalls, 1);
});

test('completed replay is validated by the shared NPC plan contract', async () => {
  const pool = claimPool();
  const store = createNpcSemanticDecisionStore({ partyPool: pool, partyId: PARTY_ID });
  const decisionRequest = request();
  await store.resolve({
    boundary: boundary(),
    request: decisionRequest,
    semanticModel: async () => plan(decisionRequest)
  });
  pool.claims[0].semantic_plan.speech = null;
  let replayModelCalls = 0;

  await assert.rejects(
    store.resolve({
      boundary: boundary(),
      request: decisionRequest,
      semanticModel: async () => {
        replayModelCalls += 1;
        return plan(decisionRequest);
      }
    }),
    (error) => error?.code === 'NPC_SEMANTIC_DECISION_PLAN_INVALID'
  );
  assert.equal(replayModelCalls, 0);
});

test('the same boundary id can be claimed independently by different parties', async () => {
  const pool = claimPool();
  const decisionBoundary = boundary();
  const decisionRequest = request();
  const firstStore = createNpcSemanticDecisionStore({
    partyPool: pool,
    partyId: 'party-1'
  });
  const secondStore = createNpcSemanticDecisionStore({
    partyPool: pool,
    partyId: 'party-2'
  });

  await firstStore.resolve({
    boundary: decisionBoundary,
    request: decisionRequest,
    semanticModel: async () => plan(decisionRequest)
  });
  await secondStore.resolve({
    boundary: decisionBoundary,
    request: decisionRequest,
    semanticModel: async () => plan(decisionRequest)
  });

  assert.equal(pool.claims.length, 2);
  assert.deepEqual(pool.claims.map(({ party_id }) => party_id), [
    'party-1',
    'party-2'
  ]);
});

function claimPool() {
  const claims = [];
  return {
    claims,
    async query(sql, params) {
      if (sql.includes('INSERT INTO party_runtime.party_npc_semantic_decision_claims')) {
        assert.doesNotMatch(sql, /\bsemantic_request\b/);
        assert.equal(params.length, 6);
        const [
          boundaryId,
          partyId,
          npcId,
          sameTimeBatchId,
          decisionMode,
          canonicalInputDigest
        ] = params;
        const duplicate = claims.some((claim) => (
          claim.party_id === partyId
          && (
            claim.boundary_id === boundaryId
            || (
              claim.npc_id === npcId
              && claim.same_time_batch_id === sameTimeBatchId
            )
          )
        ));
        if (duplicate) {
          return { rowCount: 0, rows: [] };
        }
        claims.push({
          boundary_id: boundaryId,
          party_id: partyId,
          npc_id: npcId,
          same_time_batch_id: sameTimeBatchId,
          decision_mode: decisionMode,
          canonical_input_digest: canonicalInputDigest,
          semantic_plan: null,
          status: 'pending'
        });
        return { rowCount: 1, rows: [{ boundary_id: boundaryId }] };
      }
      if (sql.includes('SELECT boundary_id,decision_mode,canonical_input_digest')) {
        const [partyId, npcId, sameTimeBatchId] = params;
        const rows = claims.filter((claim) => (
          claim.party_id === partyId
          && claim.npc_id === npcId
          && claim.same_time_batch_id === sameTimeBatchId
        ));
        return { rowCount: rows.length, rows: structuredClone(rows) };
      }
      if (sql.includes('UPDATE party_runtime.party_npc_semantic_decision_claims')) {
        const [partyId, boundaryId, canonicalInputDigest, semanticPlan] = params;
        const claim = claims.find((candidate) => (
          candidate.party_id === partyId
          && candidate.boundary_id === boundaryId
          && candidate.canonical_input_digest === canonicalInputDigest
          && candidate.status === 'pending'
        ));
        if (!claim) {
          return { rowCount: 0, rows: [] };
        }
        claim.semantic_plan = JSON.parse(semanticPlan);
        claim.status = 'completed';
        return { rowCount: 1, rows: [] };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    }
  };
}
