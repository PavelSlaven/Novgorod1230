import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildNpcSemanticDecisionTrace,
  validateNpcSemanticDecisionTrace
} from '@rus/npc-runtime';
import { normalizeNpcDecision } from
  '../../../packages/turn/src/conversation-exchange-npc-batch.js';
import {
  resolveTracePhase3Contracts
} from '../src/runtime/lower-dvina-trace-phase-3-contracts.js';
import {
  digest,
  phase3State,
  ref,
  revision14Bundle,
  runPhase3
} from './lower-dvina-trace-m2-conversation-fixture.js';
import { hydrateSemanticDecisionReplay } from
  '../src/infrastructure/postgres/lower-dvina-trace-phase-3-read.js';

test('an unseen-equivalent WK claim replays from its persisted prepared request', async () => {
  const initialState = phase3State();
  const contracts = resolveTracePhase3Contracts({
    state: initialState, bundle: revision14Bundle
  });
  const knowledgeRef = ref('knowledge_record', 'claim:net-fishing');
  let modelCalls = 0;
  let unpreparedRequest;
  const semanticModel = async (request) => {
    modelCalls += 1;
    const player = request.allowed_references.actor_refs.find(
      ({ entity_kind: kind }) => kind === 'player_character'
    );
    return {
      schema: 'conversation_contribution_plan_v1',
      request_id: request.request_id,
      boundary_id: request.boundary_id,
      conversation_id: request.conversation_id,
      exchange_id: request.exchange_id,
      state_version: request.state_version,
      speaker_ref: request.npc_ref,
      contribution_kind: 'speech',
      primary_addressee_ref: player,
      intended_addressee_refs: [player],
      affected_actor_refs: [],
      speech: {
        utterance_text: 'Сети служат для ловли рыбы.',
        dominant_act: 'inform', interaction_tags: [], topic_refs: [],
        claims: [{ claim_id: 'fish-net',
          content_summary: 'Сети служат для ловли рыбы.',
          form: 'assertion', speaker_posture: 'believed_true',
          source_knowledge_refs: [knowledgeRef],
          mentioned_entity_refs: [] }],
        response_expectation: { kind: 'none', target_refs: [] }
      },
      interpretation: { intent: 'ответить',
        grounded_contribution: 'рассказать о сетях', adaptation: 'literal' },
      resolution: 'automatic',
      activity: { duration_class: 'domain_owned', effort: 'none' },
      supporting_operations: [], check: null, handoff: null,
      reason: 'Ответ на вопрос.'
    };
  };
  semanticModel.prepareRequest = async (request) => {
    unpreparedRequest = structuredClone(request);
    return { request: {
      ...request,
      allowed_references: {
        ...request.allowed_references,
        knowledge_refs: [...request.allowed_references.knowledge_refs,
          knowledgeRef].sort((left, right) =>
          `${left.entity_kind}\u0000${left.entity_id}`.localeCompare(
            `${right.entity_kind}\u0000${right.entity_id}`))
      }
    } };
  };

  const first = await runPhase3({
    state: initialState, contracts,
    rawText: 'Как ловят рыбу?', inputDigest: digest('a'),
    responseKind: 'speech', npcSemanticModel: semanticModel
  });
  const committedDecision = first.result.exchange.npc_decisions[0];
  assert.deepEqual(committedDecision.proposal.plan.speech.claims[0]
    .source_knowledge_refs, [knowledgeRef]);
  assert.equal(modelCalls, 1);

  const trace = buildNpcSemanticDecisionTrace({
    request: committedDecision.request,
    plan: committedDecision.proposal.plan,
    root_turn_id: 'turn-wk-claim-replay', working_revision: 0,
    applied_change_set_id: 'change-wk-claim-replay'
  });
  // The exact boundary and fresh request are valid. Only the prepared WK ref
  // makes the committed claim legal during trace validation.
  assert.doesNotThrow(() => normalizeNpcDecision({
    boundary: committedDecision.boundary,
    request: unpreparedRequest,
    persisted_trace: null
  }, committedDecision.boundary));
  assert.equal(validateNpcSemanticDecisionTrace(trace,
    committedDecision.request), true);
  assert.equal(validateNpcSemanticDecisionTrace(trace,
    unpreparedRequest), false);
  const persistedInput = structuredClone({
    trace,
    request_snapshot: committedDecision.request,
    boundary_snapshot: committedDecision.boundary,
    signal_records: []
  });
  assert.deepEqual(persistedInput.boundary_snapshot,
    committedDecision.boundary);
  const replayState = structuredClone(initialState);
  hydrateSemanticDecisionReplay(replayState, [trace], [persistedInput]);
  let replayModelCalls = 0;
  const replayModel = async () => {
    replayModelCalls += 1;
    throw new Error('committed conversation must replay without the model');
  };
  replayModel.prepareRequest = async () => {
    throw new Error('committed conversation must not retrieve WK again');
  };
  // Control: the same integrated replay succeeds when only the WK claim is
  // absent. This excludes boundary drift and unrelated fixture failures.
  const controlPlan = structuredClone(committedDecision.proposal.plan);
  controlPlan.speech.claims = [];
  const controlTrace = buildNpcSemanticDecisionTrace({
    request: committedDecision.request, plan: controlPlan,
    root_turn_id: trace.root_turn_id, working_revision: trace.working_revision,
    applied_change_set_id: trace.applied_change_set_id
  });
  const controlState = structuredClone(initialState);
  hydrateSemanticDecisionReplay(controlState, [controlTrace], [{
    ...structuredClone(persistedInput), trace: controlTrace
  }]);
  const control = await runPhase3({
    state: controlState, contracts,
    rawText: 'Как ловят рыбу?', inputDigest: digest('a'),
    responseKind: 'speech', npcSemanticModel: replayModel
  });
  assert.equal(control.result.exchange.npc_decisions[0].proposal.status,
    'replayed');
  assert.equal(replayModelCalls, 0);

  let replay;
  await assert.doesNotReject(async () => {
    replay = await runPhase3({
      state: replayState, contracts,
      rawText: 'Как ловят рыбу?', inputDigest: digest('a'),
      responseKind: 'speech', npcSemanticModel: replayModel
    });
  }, 'P2: committed WK claim must replay with its persisted prepared request');

  assert.equal(replayModelCalls, 0);
  assert.equal(replay.result.exchange.npc_decisions[0].proposal.status,
    'replayed');
  assert.deepEqual(replay.result.exchange.npc_decisions[0].request,
    committedDecision.request);
});
