import assert from 'node:assert/strict';
import test from 'node:test';
import {
  resolveTracePhase4Contracts
} from '../src/runtime/lower-dvina-trace-phase-4-contracts.js';
import { prepareTracePhase4PlayerConversationPlan } from
  '../src/runtime/lower-dvina-trace-m2-conversation-player.js';
import {
  phase2PublicResult
} from '../src/infrastructure/postgres/lower-dvina-trace-phase-2-projection.js';
import {
  phase4SemanticCommitContext
} from '../src/infrastructure/postgres/lower-dvina-trace-phase-4-commit.js';
import { appendSemanticNegotiation } from
  '../src/infrastructure/postgres/lower-dvina-trace-phase-4-write-projection-semantic.js';
import { semanticNegotiationCommand } from
  '../src/runtime/lower-dvina-trace-phase-4-semantic-command.js';
import { promiseOfferStage } from
  '../src/runtime/lower-dvina-trace-phase-4-command-shared.js';
import {
  assertPersistedStatePayloadSafe,
  checkResult,
  createM2ConversationModels,
  digest,
  phase4ArrivalState,
  phase4Factual,
  projectPhase4Negotiation,
  ref,
  revision14Bundle,
  runPhase4
} from './lower-dvina-trace-m2-conversation-fixture.js';

test('Phase 4 persists an unheard promise', async () => {
  const { state, contracts } = phase4ArrivalState();
  state.promise_instances[0].created_change_set_id = 'change:phase4-arrival';
  const ratsha = state.npcs.find(({ participant_slot_ref: slot }) =>
    slot === 'ratsha_storehouse_helper');
  ratsha.machine_state = { ...ratsha.machine_state, hearing_capability: 'none' };
  const offerStage = promiseOfferStage(state, contracts);
  const exchange = await runPhase4({ state, contracts,
    rawText: 'Ратша, сдавайся — я обещаю тебе защиту.',
    inputDigest: digest('2'), responseKind: 'speech',
    checkResult: null, checkRequest: null, offerStage,
    playerPlanOptions: { offer: true } });
  assert.equal(exchange.npcCalls, 0);
  const next = projectPhase4Negotiation({ state, contracts,
    result: exchange.result, inputDigest: digest('2') });
  const factual = phase4Factual({ state, contracts,
    result: exchange.result, inputDigest: digest('2') });
  factual.consequence.negotiation.offer_stage = offerStage;
  const writes = { inserts: [], updates: [], appends: [] };
  assert.doesNotThrow(() => appendSemanticNegotiation({
    ...writes, partyId: state.party_id, state, next, factual,
    turnNumber: state.party_state.turn_number + 1,
    changeSetId: 'change:phase4-unheard', idemId: 'idem:phase4-unheard',
    contracts, rootTurnId: 'turn:phase4-unheard', workingRevision: 0
  }));
  assert.equal(writes.appends.some(({ target_table: table }) =>
    table === 'party_npc_decision_traces'), false);
  assert.equal(writes.appends.some(({ target_table: table }) =>
    table === 'party_obligation_transitions'), true);
});

test('one arrival event creates distinct others and objective signals', () => {
  const { state, contracts } = phase4ArrivalState();
  const ratshaId = contracts.actors.ratsha_storehouse_helper.instance_id;
  const signals = state.npc_decision_signals
    .map(({ signal }) => signal)
    .filter(({ subject_ref: subjectRef }) => subjectRef.entity_id === ratshaId)
    .filter(({ category }) => ['others', 'objective'].includes(category));

  assert.equal(signals.length, 2);
  assert.equal(new Set(signals.map(({ signal_id: id }) => id)).size, 2);
  assert.deepEqual(
    signals.map(({ category }) => category).sort(),
    ['objective', 'others']
  );
  assert.equal(new Set(signals.map(
    ({ source_event_ref: source }) =>
      `${source.entity_kind}:${source.entity_id}`
  )).size, 1);
  assert.equal(signals.every(
    ({ source_event_ref: source }) => source.entity_kind === 'temporal_event'
  ), true);
  const perceived = signals.find(({ category }) => category === 'others');
  const objective = signals.find(({ category }) => category === 'objective');
  assert.equal(perceived.source_perception_ref.entity_kind, 'perception_result');
  assert.equal(objective.source_perception_ref, null);
});

test('Phase 4 does not create a promise or check for an ordinary question', async () => {
  const { state, contracts } = phase4ArrivalState();
  const baseModel = createM2ConversationModels().playerConversationModel;
  let playerRequest;
  const command = semanticNegotiationCommand({
    contracts,
    inputDigest: digest('1'),
    playerConversationModel: async (request) => {
      playerRequest = structuredClone(request);
      const plan = structuredClone(await baseModel(request));
      plan.resolution = 'automatic';
      plan.check = null;
      plan.supporting_operations = [];
      return plan;
    },
    npcSemanticModel: async () => null,
    revalidateStateVersion: async () => state.party_state.state_version
  });
  const availability = await command.availability({
    retrievedState: state,
    playerInput: { raw_text: 'Скажи, как тебя зовут и что случилось?' },
    modeResolution: { decision_trace: { step_traces: [{ approved_plan: {
      operations: [{ op: 'emit_interaction', interaction_kind: 'request',
        target_actor_refs: [
          contracts.actors.onisim_boatman.instance_id
        ] }]
    } }] } }
  });

  assert.equal(availability.status, 'available');
  assert.deepEqual(availability.check_requests, []);
  assert.equal(availability.causal_stages.some(
    ({ schema }) => schema === 'rus.trace_promise_offer_stage.v1'
  ), false);
  assert.equal(playerRequest.player_safe_context.target_npc_ref.entity_id,
    contracts.actors.onisim_boatman.instance_id);
  assert.deepEqual(playerRequest.operation_contract, {});
});

test('selected Phase 4 promise requires one contribution', async () => {
  const { state, contracts } = phase4ArrivalState();
  const requests = [];
  const { playerConversationModel } = createM2ConversationModels();
  const prepare = (raw_text, model = playerConversationModel,
    requiresPromise = false) =>
    prepareTracePhase4PlayerConversationPlan({
    state, contracts, playerInput: { raw_text }, inputDigest: digest('promise'),
    requiresPromise,
    playerConversationModel: async (request) => {
      requests.push(structuredClone(request));
      return model(request);
    }, revalidateStateVersion: async () => state.party_state.state_version
  });
  const plan = await prepare(
    'Обещаю тебе защиту, если ты сдашься.',
    playerConversationModel, true);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].player_safe_context.required_resolution,
    'check_required');
  assert.deepEqual(requests[0].player_safe_context.required_check, {
    attribute_ref: contracts.check.attribute, skill_ref: contracts.check.skill,
    difficulty_band: contracts.check.check_id
  });
  assert.deepEqual(requests[0].player_safe_context.required_supporting_operation,
    { op: 'offer_conditional_protection' });
  assert.equal(plan.resolution, 'check_required');
  assert.deepEqual(plan.supporting_operations,
    [{ op: 'offer_conditional_protection' }]);

  const ordinary = await prepare('Ратша, кто велел тебе прийти сюда?',
    async (request) => {
      const ordinaryPlan = structuredClone(await playerConversationModel(request));
      ordinaryPlan.resolution = 'automatic';
      ordinaryPlan.check = null;
      ordinaryPlan.supporting_operations = [];
      return ordinaryPlan;
    });
  assert.equal(requests.length, 2);
  assert.equal(requests[1].player_safe_context.required_resolution, undefined);
  assert.equal(requests[1].player_safe_context.required_supporting_operation,
    undefined);
  assert.equal(ordinary.resolution, 'automatic');
  assert.deepEqual(ordinary.supporting_operations, []);
});

test('Phase 4 action-set evaluation does not invoke the conversation interpreter', async () => {
  const { state, contracts } = phase4ArrivalState();
  let playerCalls = 0;
  const command = semanticNegotiationCommand({
    contracts,
    inputDigest: digest('action-set'),
    playerConversationModel: async () => {
      playerCalls += 1;
      throw new Error('interpreter must not run while listing actions');
    },
    npcSemanticModel: async () => null,
    revalidateStateVersion: async () => state.party_state.state_version
  });

  const availability = await command.availability({
    committed_state: state,
    action_set_evaluation: true
  });

  assert.equal(availability.status, 'available');
  assert.deepEqual(availability.check_requests, []);
  assert.equal(playerCalls, 0);
});

test('activated semantic revisions retain exact Phase 4 lineage', () => {
  const semanticExchange = { response_kind: 'surrender' };
  const turnId = 'turn:party-1:4';
  const factual = {
    mode_resolution: { turn_id: turnId },
    consequence: {
      phase4_kind: 'negotiation',
      negotiation: { semantic_exchange: semanticExchange }
    }
  };
  assert.deepEqual(phase4SemanticCommitContext({
    scenarioRevision: 14,
    factual,
    writePlan: {
      turn_id: turnId,
      command_trace: { decision_protocol: 'code_exact_fast_path_v1' }
    }
  }), {
    rootTurnId: turnId,
    workingRevision: 0,
    semanticExchange
  });
  assert.deepEqual(phase4SemanticCommitContext({
    scenarioRevision: 15,
    factual,
    writePlan: {
      turn_id: turnId,
      command_trace: { decision_protocol: 'code_exact_fast_path_v1' }
    }
  }), {
    rootTurnId: turnId,
    workingRevision: 0,
    semanticExchange
  });
  assert.deepEqual(phase4SemanticCommitContext({
    scenarioRevision: 32,
    factual,
    writePlan: {
      turn_id: turnId,
      command_trace: { decision_protocol: 'code_exact_fast_path_v1' }
    }
  }), {
    rootTurnId: turnId,
    workingRevision: 0,
    semanticExchange
  });
  assert.deepEqual(phase4SemanticCommitContext({
    scenarioRevision: 14,
    factual,
    writePlan: {
      turn_id: turnId,
      command_trace: { decision_protocol: 'turn_step_plan_v1' },
      turn_step_commit: {
        schema: 'turn_step_commit_envelope_v1',
        root_turn_id: turnId,
        loop_trace: { root_turn_id: turnId, working_revision: 2 }
      }
    }
  }), {
    rootTurnId: turnId,
    workingRevision: 2,
    semanticExchange
  });
  for (const decisionProtocol of ['bounded_decision_v2', 'unknown']) {
    assert.throws(() => phase4SemanticCommitContext({
      scenarioRevision: 14,
      factual,
      writePlan: {
        turn_id: turnId,
        command_trace: { decision_protocol: decisionProtocol }
      }
    }), { code: 'TRACE_M2_PHASE_4_SEMANTIC_LINEAGE_INVALID' });
  }
  assert.throws(() => phase4SemanticCommitContext({
    scenarioRevision: 14,
    factual,
    writePlan: {
      turn_id: 'turn:party-1:forged',
      command_trace: { decision_protocol: 'code_exact_fast_path_v1' }
    }
  }), { code: 'TRACE_M2_PHASE_4_SEMANTIC_LINEAGE_INVALID' });
});

test('successful social check exposes only Ratsha surrender follow-up', async () => {
  const { state, contracts, offerStage, checkRequest } = phase4ArrivalState();
  const common = {
    state,
    contracts,
    rawText: 'Ратша, сдавайся. Без суда тебя не убьют.',
    checkResult: checkResult(contracts.check.check_id, 'success_with_cost'),
    offerStage,
    checkRequest
  };
  const surrendered = await runPhase4({
    ...common,
    inputDigest: digest('3'),
    responseKind: 'surrender'
  });

  assert.equal(surrendered.result.response_kind, 'surrender');
  assert.deepEqual(
    surrendered.npcRequest.decision_scope.operation_contract,
    { commit_surrender: {
      required_dominant_acts: ['accept', 'promise', 'confess'],
      required_interaction_tag: 'surrender'
    } }
  );
  assert.deepEqual(surrendered.npcRequest.decision_scope
    .required_supporting_operation, { op: 'commit_surrender' });
  assert.equal(surrendered.npcRequest.decision_scope.combat_handoff_available,
    false);
  assert.deepEqual(
    surrendered.npcRequest.social_context.delivery_cues,
    ['delivery_credible_with_visible_cost']
  );
  assert.equal(surrendered.npcRequest.social_context.offer_stage_ref,
    offerStage.fact_id);
  assert.equal(surrendered.npcRequest.social_context.offer_policy_ref,
    contracts.promisePolicy.policy_id);
});

test('partial offer perception does not disclose offer or policy refs to Ratsha',
  async () => {
    const { state, contracts } = phase4ArrivalState();
    const ratsha = state.npcs.find(
      ({ participant_slot_ref: slot }) => slot === 'ratsha_storehouse_helper'
    );
    ratsha.machine_state = {
      ...ratsha.machine_state,
      hearing_capability: 'partial'
    };
    const offerStage = promiseOfferStage(state, contracts);
    const exchange = await runPhase4({ state, contracts,
      rawText: 'Ратша, сдавайся, и я обещаю защиту.',
      inputDigest: digest('5'), responseKind: 'speech',
      checkResult: null, checkRequest: null, offerStage,
      playerPlanOptions: { offer: true } });

    assert.equal(exchange.npcCalls, 1);
    const received = exchange.result.audiences[0].received_messages.find(
      ({ listener_ref: listener }) => listener.entity_id === ratsha.instance_id
    );
    assert.equal(received.comprehension, 'partial');
    assert.equal(received.utterance_text, null);
    assert.equal(Object.hasOwn(
      exchange.npcRequest.social_context, 'offer_stage_ref'
    ), false);
    assert.equal(Object.hasOwn(
      exchange.npcRequest.social_context, 'offer_policy_ref'
    ), false);
    const serialized = JSON.stringify(exchange.npcRequest);
    assert.equal(serialized.includes(offerStage.fact_id), false);
    assert.equal(serialized.includes(contracts.promisePolicy.policy_id), false);
  });
