import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildNpcSemanticDecisionTrace,
  validateNpcSemanticDecisionTrace
} from '@rus/npc-runtime';
import { buildNpcDecision } from
  '../src/runtime/lower-dvina-trace-m2-conversation-decision.js';
import { createM2ConversationModels } from
  './lower-dvina-trace-m2-conversation-fixture.js';
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

test('nonmatching replay snapshots fall back to the rebuilt request', async (t) => {
  const fixture = await committedClaimFixture();
  // Synthetic in-memory inputs exercise the selector boundary; mismatched
  // snapshots here are not claims about rows accepted by the PostgreSQL reader.
  const cases = [
    ['no saved input', () => []],
    ['duplicate matching inputs', ({ persistedInput }) => [
      structuredClone(persistedInput), structuredClone(persistedInput)
    ]],
    ['different exchange identity', ({ persistedInput }) => [{
      ...structuredClone(persistedInput),
      request_snapshot: {
        ...persistedInput.request_snapshot,
        exchange_id: `${persistedInput.request_snapshot.exchange_id}:other`
      }
    }]],
    ['different state version', ({ persistedInput }) => [{
      ...structuredClone(persistedInput),
      request_snapshot: {
        ...persistedInput.request_snapshot,
        state_version: `${persistedInput.request_snapshot.state_version}:other`
      }
    }]],
    ['different NPC', ({ persistedInput }) => [{
      ...structuredClone(persistedInput),
      request_snapshot: {
        ...persistedInput.request_snapshot,
        npc_ref: ref('npc', 'another-npc')
      }
    }]],
    ['same request with a different trace digest', ({ persistedInput }) => {
      const differentTrace = buildNpcSemanticDecisionTrace({
        request: persistedInput.request_snapshot,
        plan: fixture.decision.proposal.plan,
        root_turn_id: 'turn-unrelated-replay-input', working_revision: 0,
        applied_change_set_id: 'change-unrelated-replay-input'
      });
      return [{ ...structuredClone(persistedInput), trace: differentTrace }];
    }]
  ];

  const rebuiltRequest = buildDirectDecision(fixture, []).request;
  assert.notDeepEqual(rebuiltRequest, fixture.persistedInput.request_snapshot);
  assert.equal(validateNpcSemanticDecisionTrace(fixture.trace,
    rebuiltRequest), false);

  for (const [name, inputsFor] of cases) {
    await t.test(name, async () => {
      const inputs = inputsFor(fixture);
      const directResult = buildDirectDecision(fixture, inputs);
      assert.deepEqual(directResult.request, rebuiltRequest);
      assert.notDeepEqual(directResult.request,
        fixture.persistedInput.request_snapshot);

      const replayState = structuredClone(fixture.initialState);
      hydrateSemanticDecisionReplay(replayState, [fixture.trace], inputs);
      let modelCalls = 0;
      let prepareCalls = 0;
      const replayModel = async () => {
        modelCalls += 1;
        throw new Error('committed decision must not call the model');
      };
      replayModel.prepareRequest = async () => {
        prepareCalls += 1;
        throw new Error('committed decision must not prepare again');
      };

      await assert.rejects(runPhase3({
        state: replayState, contracts: fixture.contracts,
        rawText: 'Как ловят рыбу?', inputDigest: digest('a'),
        responseKind: 'speech', npcSemanticModel: replayModel
      }), (error) => {
        assert.equal(error.code, 'TURN_CONVERSATION_NPC_DECISION_INVALID');
        return true;
      });
      assert.equal(modelCalls, 0);
      assert.equal(prepareCalls, 0);
    });
  }

  const matchingResult = buildDirectDecision(fixture, [
    structuredClone(fixture.persistedInput)
  ]);
  assert.deepEqual(matchingResult.request,
    fixture.persistedInput.request_snapshot);
});

function buildDirectDecision(fixture, inputs) {
  const savedRequest = fixture.persistedInput.request_snapshot;
  const targetRef = fixture.decision.boundary.npc_ref;
  const targetContract = fixture.contracts.actors.find(
    ({ instance_id: id }) => id === targetRef.entity_id
  );
  const targetStateActor = fixture.initialState.npcs.find(
    ({ instance_id: id }) => id === targetRef.entity_id
  );
  assert.ok(targetContract && targetStateActor,
    'fixture boundary NPC must be present in the active contract and state');
  const targetActor = {
    ...structuredClone(targetContract),
    ...structuredClone(targetStateActor),
    ref: targetContract.ref
  };
  const state = structuredClone(fixture.initialState);
  state.npc_semantic_decision_traces = [structuredClone(fixture.trace)];
  state.npc_semantic_decision_inputs = structuredClone(inputs);
  const latestContribution = [...fixture.exchange.statements].reverse().find(
    ({ speaker_ref: speaker }) =>
      speaker?.entity_kind === 'player_character'
  ) ?? null;
  const context = {
    phase: 'phase_3', state,
    stateVersion: state.party_state.state_version,
    targetRef, targetActor,
    actualNpcActors: [targetActor],
    conversationActorRefs: savedRequest.allowed_references.actor_refs,
    batchKey: fixture.decision.boundary.same_time_batch_ref.entity_id,
    conversationId: savedRequest.conversation_id,
    exchangeId: savedRequest.exchange_id,
    contracts: fixture.contracts,
    npcDecisionScope: {
      action_handoff_available:
        savedRequest.decision_scope.action_handoff_available,
      combat_handoff_available:
        savedRequest.decision_scope.combat_handoff_available,
      ...(savedRequest.decision_scope.allowed_contribution_kinds === undefined
        ? {} : { allowed_contribution_kinds:
          savedRequest.decision_scope.allowed_contribution_kinds }),
      ...(savedRequest.decision_scope.required_resolution === undefined
        ? {} : {
          required_resolution:
            savedRequest.decision_scope.required_resolution,
          required_check: savedRequest.decision_scope.required_check
        })
    },
    npcOperationContract: savedRequest.decision_scope.operation_contract,
    npcContributionReferencePolicy: {
      entity_refs: [ref('route',
        fixture.contracts.disclosureMapping
          .route_knowledge_disclosure.route_ref)],
      knowledge_refs: [ref('knowledge_scope',
        fixture.contracts.eremeyKnowledge.knowledge_scope_ref)],
      combat_target_refs: []
    },
    npcSocialCheckProfile: null,
    evidencePresentation: null,
    evidencePresented: false,
    offerStage: null
  };
  return buildNpcDecision(context, {
    new_signal_records: fixture.exchange.new_signal_records,
    consumed_signal_ids: fixture.exchange.consumed_signal_ids,
    statements: fixture.exchange.statements,
    audiences: fixture.exchange.audiences,
    supporting_operation_perceptions:
      fixture.exchange.supporting_operation_perceptions
  }, fixture.decision.boundary, latestContribution);
}

async function committedClaimFixture() {
  const initialState = phase3State();
  const contracts = resolveTracePhase3Contracts({
    state: initialState, bundle: revision14Bundle
  });
  const knowledgeRef = ref('knowledge_record', 'claim:negative-cases');
  const models = createM2ConversationModels();
  let unpreparedRequest;
  const semanticModel = async (request) => {
    const plan = await models.npcSemanticModel(request);
    plan.speech.utterance_text = 'Рыбацкая работа связана с сетями.';
    plan.speech.claims = [{ claim_id: 'net-fishing',
      content_summary: 'Рыбацкая работа связана с сетями.',
      form: 'assertion', speaker_posture: 'believed_true',
      source_knowledge_refs: [knowledgeRef], mentioned_entity_refs: [] }];
    return plan;
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
    state: structuredClone(initialState), contracts,
    rawText: 'Как ловят рыбу?', inputDigest: digest('a'),
    responseKind: 'speech', npcSemanticModel: semanticModel
  });
  const decision = first.result.exchange.npc_decisions[0];
  const trace = buildNpcSemanticDecisionTrace({
    request: decision.request, plan: decision.proposal.plan,
    root_turn_id: 'turn-negative-replay-cases', working_revision: 0,
    applied_change_set_id: 'change-negative-replay-cases'
  });
  const persistedInput = {
    trace,
    request_snapshot: structuredClone(decision.request),
    boundary_snapshot: structuredClone(decision.boundary),
    signal_records: []
  };
  assert.equal(validateNpcSemanticDecisionTrace(trace, decision.request), true);
  assert.notDeepEqual(decision.request, unpreparedRequest);
  assert.equal(validateNpcSemanticDecisionTrace(trace, unpreparedRequest), false);
  return {
    initialState, contracts, decision, trace, persistedInput,
    unpreparedRequest, exchange: first.result
  };
}
