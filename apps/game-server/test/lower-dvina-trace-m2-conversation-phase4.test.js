import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveTracePhase4Contracts } from '../src/runtime/lower-dvina-trace-phase-4-contracts.js';
import { phase2PublicResult } from '../src/infrastructure/postgres/lower-dvina-trace-phase-2-projection.js';
import { phase4SemanticCommitContext } from '../src/infrastructure/postgres/lower-dvina-trace-phase-4-commit.js';
import { appendSemanticNegotiation } from '../src/infrastructure/postgres/lower-dvina-trace-phase-4-write-projection-semantic.js';
import { semanticNegotiationCommand } from '../src/runtime/lower-dvina-trace-phase-4-semantic-command.js';
import { promiseOfferStage } from '../src/runtime/lower-dvina-trace-phase-4-command-shared.js';
import { phase3NpcReadProof } from '../src/infrastructure/postgres/lower-dvina-trace-phase-3-read-proofs.js';
import { isLowerDvinaTraceSemanticRevision } from '../src/infrastructure/postgres/lower-dvina-trace-semantic-conversation-read.js';
import { loadScenarioBundle } from './lower-dvina-trace-phase-2-fixture.js';
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
  runPhase4,
} from './lower-dvina-trace-m2-conversation-fixture.js';
test('Phase 4 revision 24 retains semantic NPC decision bindings', async () => {
  const { state } = phase4ArrivalState();
  const contracts = resolveTracePhase4Contracts({
    state,
    bundle: await loadScenarioBundle(24),
  });
  assert.notEqual(contracts.conversationBindings, null);
  assert.notEqual(contracts.combatBindings, null);
  assert.equal(
    isLowerDvinaTraceSemanticRevision({
      materialization_trace: {
        seed_context: { scenario_definition_revision: 24 },
      },
    }),
    true,
  );
});
test('Phase 3 proof keeps a first-entry NPC anchor after Phase 4 moves it', () => {
  const payload = {
    first_entry_preparation: {
      spatial_v3: { target: { status: 'prepared' } },
      scene: { anchor: { instance_id: 'anchor:camp' } },
      npcs: [{ instance_id: 'npc:eremey' }],
    },
    npcs: [
      {
        instance_id: 'npc:eremey',
        participant_slot_ref: 'eremey_fisher',
        profile_level: 'scene',
        anchor_id: 'anchor:shed',
      },
    ],
  };
  const proof = phase3NpcReadProof(payload, [
    {
      npc_id: 'npc:eremey',
      semantic_state: { participant_slot_ref: 'eremey_fisher' },
      profile_level: 'scene',
      anchor_id: 'anchor:shed',
    },
  ]);
  assert.deepEqual(proof.actual, proof.expected);
});
test('Phase 4 persists an offered promise when the target hears nothing', async () => {
  const { state, contracts } = phase4ArrivalState();
  state.promise_instances[0].created_change_set_id = 'change:phase4-arrival';
  const ratsha = state.npcs.find(({ participant_slot_ref: slot }) => slot === 'ratsha_storehouse_helper');
  ratsha.machine_state = {
    ...ratsha.machine_state,
    hearing_capability: 'none',
  };
  const offerStage = promiseOfferStage(state, contracts);
  const exchange = await runPhase4({
    state,
    contracts,
    rawText:
      '\u0420\u0430\u0442\u0448\u0430, \u0441\u0434\u0430\u0432\u0430\u0439\u0441\u044F \u2014 \u044F \u043E\u0431\u0435\u0449\u0430\u044E \u0442\u0435\u0431\u0435 \u0437\u0430\u0449\u0438\u0442\u0443.',
    inputDigest: digest('2'),
    responseKind: 'speech',
    checkResult: null,
    checkRequest: null,
    offerStage,
    playerPlanOptions: { offer: true },
  });
  assert.equal(exchange.npcCalls, 0);
  const next = projectPhase4Negotiation({
    state,
    contracts,
    result: exchange.result,
    inputDigest: digest('2'),
  });
  const factual = phase4Factual({
    state,
    contracts,
    result: exchange.result,
    inputDigest: digest('2'),
  });
  factual.consequence.negotiation.offer_stage = offerStage;
  const writes = { inserts: [], updates: [], appends: [] };
  assert.doesNotThrow(() =>
    appendSemanticNegotiation({
      ...writes,
      partyId: state.party_id,
      state,
      next,
      factual,
      turnNumber: state.party_state.turn_number + 1,
      changeSetId: 'change:phase4-unheard',
      idemId: 'idem:phase4-unheard',
      contracts,
      rootTurnId: 'turn:phase4-unheard',
      workingRevision: 0,
    }),
  );
  assert.equal(
    writes.appends.some(({ target_table: table }) => table === 'party_npc_decision_traces'),
    false,
  );
  assert.equal(
    writes.appends.some(({ target_table: table }) => table === 'party_obligation_transitions'),
    true,
  );
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
  assert.deepEqual(signals.map(({ category }) => category).sort(), ['objective', 'others']);
  assert.equal(new Set(signals.map(({ source_event_ref: source }) => `${source.entity_kind}:${source.entity_id}`)).size, 1);
  assert.equal(
    signals.every(({ source_event_ref: source }) => source.entity_kind === 'temporal_event'),
    true,
  );
  const perceived = signals.find(({ category }) => category === 'others');
  const objective = signals.find(({ category }) => category === 'objective');
  assert.equal(perceived.source_perception_ref.entity_kind, 'perception_result');
  assert.equal(objective.source_perception_ref, null);
});
test('Phase 4 does not create a promise or check for an ordinary question', async () => {
  const { state, contracts } = phase4ArrivalState();
  const baseModel = createM2ConversationModels().playerConversationModel;
  const command = semanticNegotiationCommand({
    contracts,
    inputDigest: digest('1'),
    playerConversationModel: async (request) => {
      const plan = structuredClone(await baseModel(request));
      plan.resolution = 'automatic';
      plan.check = null;
      plan.supporting_operations = [];
      return plan;
    },
    npcSemanticModel: async () => null,
    revalidateStateVersion: async () => state.party_state.state_version,
  });
  const availability = await command.availability({
    retrievedState: state,
    playerInput: {
      raw_text: '\u0420\u0430\u0442\u0448\u0430, \u043A\u0442\u043E \u0432\u0435\u043B\u0435\u043B \u0442\u0435\u0431\u0435 \u043F\u0440\u0438\u0439\u0442\u0438 \u0441\u044E\u0434\u0430?',
    },
  });
  assert.equal(availability.status, 'available');
  assert.deepEqual(availability.check_requests, []);
  assert.equal(
    availability.causal_stages.some(({ schema }) => schema === 'rus.trace_promise_offer_stage.v1'),
    false,
  );
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
    revalidateStateVersion: async () => state.party_state.state_version,
  });
  const availability = await command.availability({
    committed_state: state,
    action_set_evaluation: true,
  });
  assert.equal(availability.status, 'available');
  assert.deepEqual(availability.check_requests, []);
  assert.equal(playerCalls, 0);
});
test('semantic revisions accept exact Phase 4 semantic lineage', () => {
  const semanticExchange = { response_kind: 'surrender' };
  const turnId = 'turn:party-1:4';
  const factual = {
    mode_resolution: { turn_id: turnId },
    consequence: {
      phase4_kind: 'negotiation',
      negotiation: { semantic_exchange: semanticExchange },
    },
  };
  assert.deepEqual(
    phase4SemanticCommitContext({
      scenarioRevision: 14,
      factual,
      writePlan: {
        turn_id: turnId,
        command_trace: { decision_protocol: 'code_exact_fast_path_v1' },
      },
    }),
    { rootTurnId: turnId, workingRevision: 0, semanticExchange },
  );
  assert.deepEqual(
    phase4SemanticCommitContext({
      scenarioRevision: 24,
      factual,
      writePlan: {
        turn_id: turnId,
        command_trace: { decision_protocol: 'code_exact_fast_path_v1' },
      },
    }),
    { rootTurnId: turnId, workingRevision: 0, semanticExchange },
  );
  assert.deepEqual(
    phase4SemanticCommitContext({
      scenarioRevision: 14,
      factual,
      writePlan: {
        turn_id: turnId,
        command_trace: { decision_protocol: 'turn_step_plan_v1' },
        turn_step_commit: {
          schema: 'turn_step_commit_envelope_v1',
          root_turn_id: turnId,
          loop_trace: { root_turn_id: turnId, working_revision: 2 },
        },
      },
    }),
    { rootTurnId: turnId, workingRevision: 2, semanticExchange },
  );
  for (const decisionProtocol of ['bounded_decision_v2', 'unknown']) {
    assert.throws(
      () =>
        phase4SemanticCommitContext({
          scenarioRevision: 14,
          factual,
          writePlan: {
            turn_id: turnId,
            command_trace: { decision_protocol: decisionProtocol },
          },
        }),
      { code: 'TRACE_M2_PHASE_4_SEMANTIC_LINEAGE_INVALID' },
    );
  }
  assert.throws(
    () =>
      phase4SemanticCommitContext({
        scenarioRevision: 14,
        factual,
        writePlan: {
          turn_id: 'turn:party-1:forged',
          command_trace: { decision_protocol: 'code_exact_fast_path_v1' },
        },
      }),
    { code: 'TRACE_M2_PHASE_4_SEMANTIC_LINEAGE_INVALID' },
  );
});
test('the same code-owned social check exposes delivery cues but does not choose Ratsha branch', async () => {
  const { state, contracts, offerStage, checkRequest } = phase4ArrivalState();
  const common = {
    state,
    contracts,
    rawText:
      '\u0420\u0430\u0442\u0448\u0430, \u0441\u0434\u0430\u0432\u0430\u0439\u0441\u044F. \u0411\u0435\u0437 \u0441\u0443\u0434\u0430 \u0442\u0435\u0431\u044F \u043D\u0435 \u0443\u0431\u044C\u044E\u0442.',
    checkResult: checkResult(contracts.check.check_id, 'success_with_cost'),
    offerStage,
    checkRequest,
  };
  const lied = await runPhase4({
    ...common,
    inputDigest: digest('3'),
    responseKind: 'lie',
  });
  const bargained = await runPhase4({
    ...common,
    inputDigest: digest('4'),
    responseKind: 'bargain',
  });
  assert.equal(lied.result.response_kind, 'lie');
  assert.equal(bargained.result.response_kind, 'bargain');
  assert.deepEqual(lied.npcRequest.social_context.delivery_cues, ['delivery_credible_with_visible_cost']);
  assert.deepEqual(bargained.npcRequest.social_context.delivery_cues, lied.npcRequest.social_context.delivery_cues);
  assert.equal(lied.npcRequest.social_context.offer_stage_ref, offerStage.fact_id);
  assert.equal(lied.npcRequest.social_context.offer_policy_ref, contracts.promisePolicy.policy_id);
  assert.deepEqual(lied.result.social_delivery_result, bargained.result.social_delivery_result);
});
test('partial offer perception does not disclose offer or policy refs to Ratsha', async () => {
  const { state, contracts } = phase4ArrivalState();
  const ratsha = state.npcs.find(({ participant_slot_ref: slot }) => slot === 'ratsha_storehouse_helper');
  ratsha.machine_state = {
    ...ratsha.machine_state,
    hearing_capability: 'partial',
  };
  const offerStage = promiseOfferStage(state, contracts);
  const exchange = await runPhase4({
    state,
    contracts,
    rawText: '\u0420\u0430\u0442\u0448\u0430, \u0441\u0434\u0430\u0432\u0430\u0439\u0441\u044F, \u0438 \u044F \u043E\u0431\u0435\u0449\u0430\u044E \u0437\u0430\u0449\u0438\u0442\u0443.',
    inputDigest: digest('5'),
    responseKind: 'speech',
    checkResult: null,
    checkRequest: null,
    offerStage,
    playerPlanOptions: { offer: true },
  });
  assert.equal(exchange.npcCalls, 1);
  const received = exchange.result.audiences[0].received_messages.find(({ listener_ref: listener }) => listener.entity_id === ratsha.instance_id);
  assert.equal(received.comprehension, 'partial');
  assert.equal(received.utterance_text, null);
  assert.equal(Object.hasOwn(exchange.npcRequest.social_context, 'offer_stage_ref'), false);
  assert.equal(Object.hasOwn(exchange.npcRequest.social_context, 'offer_policy_ref'), false);
  const serialized = JSON.stringify(exchange.npcRequest);
  assert.equal(serialized.includes(offerStage.fact_id), false);
  assert.equal(serialized.includes(contracts.promisePolicy.policy_id), false);
});
test('Ratsha responds once to the post-elapsed surrender demand boundary', async () => {
  const { state, contracts, offerStage, checkRequest } = phase4ArrivalState();
  const eremey = state.npcs.find(({ participant_slot_ref: slot }) => slot === 'eremey_fisher');
  eremey.knowledge_profile_snapshot.private_test_marker = 'eremey-private-knowledge-must-not-reach-ratsha';
  const currentContracts = resolveTracePhase4Contracts({
    state,
    bundle: revision14Bundle,
  });
  const exchange = await runPhase4({
    state,
    contracts: currentContracts,
    rawText: '\u0421\u0434\u0430\u0432\u0430\u0439\u0441\u044F \u0438 \u043E\u0442\u0434\u0430\u0439 \u043D\u043E\u0436.',
    inputDigest: digest('5'),
    responseKind: 'surrender',
    checkResult: checkResult(currentContracts.check.check_id, 'clean_success'),
    offerStage,
    checkRequest: {
      ...checkRequest,
      check_id: currentContracts.check.check_id,
    },
  });
  assert.deepEqual(exchange.result.decision_boundary.categories, ['communication']);
  assert.equal(exchange.result.exchange.npc_decisions.length, 1);
  assert.equal(exchange.npcCalls, 1);
  assert.equal(JSON.stringify(exchange.npcRequest).includes('eremey-private-knowledge-must-not-reach-ratsha'), false);
  assert.deepEqual(exchange.npcRequest.knowledge, currentContracts.actors.ratsha_storehouse_helper.knowledge_profile_snapshot);
});
test('incapacitated Ratsha does not receive a conversation LLM request', async () => {
  const { state, contracts } = phase4ArrivalState();
  const ratsha = state.npcs.find(({ participant_slot_ref: slot }) => slot === 'ratsha_storehouse_helper');
  ratsha.machine_state = {
    ...ratsha.machine_state,
    status: 'incapacitated',
    speech_capability: 'none',
  };
  const exchange = await runPhase4({
    state,
    contracts,
    rawText: '\u0420\u0430\u0442\u0448\u0430, \u043E\u0442\u0432\u0435\u0447\u0430\u0439.',
    inputDigest: digest('c'),
    responseKind: 'speech',
    checkResult: null,
    offerStage: null,
    checkRequest: null,
  });
  assert.equal(exchange.npcCalls, 0);
  assert.equal(exchange.result.decision_request, null);
  assert.equal(exchange.result.response_kind, null);
});
test('Ratsha semantic boundary also accepts ordinary valid speech without a scenario outcome', async () => {
  const { state, contracts, offerStage, checkRequest } = phase4ArrivalState();
  const responseKinds = ['surrender', 'lie', 'bargain', 'speech', 'silence', 'leave_conversation', 'combat_handoff'];
  const digestCharacters = ['6', '7', '8', 'd', '9', 'f', 'e'];
  const results = new Map();
  for (const [index, responseKind] of responseKinds.entries()) {
    const exchange = await runPhase4({
      state,
      contracts,
      rawText: '\u0427\u0442\u043E \u0442\u044B \u043E\u0442\u0432\u0435\u0442\u0438\u0448\u044C?',
      inputDigest: digest(digestCharacters[index]),
      responseKind,
      checkResult: checkResult(contracts.check.check_id, 'success'),
      offerStage,
      checkRequest,
    });
    results.set(responseKind, exchange.result);
    assert.equal(exchange.result.response_kind, responseKind);
    assert.equal(exchange.npcCalls, 1);
    if (responseKind === 'silence') {
      assert.equal(exchange.result.silence, true);
    } else {
      assert.ok(exchange.result[responseKind]);
    }
    if (responseKind === 'leave_conversation') {
      const projected = projectPhase4Negotiation({
        state,
        contracts,
        result: exchange.result,
        inputDigest: digest(digestCharacters[index]),
      });
      assert.equal(projected.conversation_sessions.at(-1).status, 'ended');
    }
  }
  for (const responseKind of ['lie', 'bargain', 'speech', 'silence', 'leave_conversation', 'combat_handoff']) {
    assert.equal(results.get(responseKind).commitment, null);
    assert.equal(results.get(responseKind).knife_transition_eligibility, null);
  }
  const combat = results.get('combat_handoff');
  assert.deepEqual(combat.combat_handoff, {
    kind: 'combat',
    intent: 'transfer control to the combat owner',
    target_actor_refs: [ref('player_character', state.actor_id)],
  });
  assert.equal(combat.exchange.session_status, 'suspended');
  assert.equal(combat.statements.length, 1);
  assert.deepEqual(combat.objective_truth_writes, []);
  assert.equal(Object.hasOwn(combat, 'attack'), false);
  assert.equal(Object.hasOwn(combat, 'harm'), false);
  assert.equal(Object.hasOwn(combat, 'escape'), false);
});
test('Ratsha combat handoff rejects a target outside the request safe context', async () => {
  const { state, contracts, offerStage, checkRequest } = phase4ArrivalState();
  await assert.rejects(
    runPhase4({
      state,
      contracts,
      rawText: '\u0427\u0442\u043E \u0442\u044B \u0441\u0434\u0435\u043B\u0430\u0435\u0448\u044C?',
      inputDigest: digest('a'),
      responseKind: 'combat_handoff',
      checkResult: checkResult(contracts.check.check_id, 'success'),
      offerStage,
      checkRequest,
      transformNpcPlan: (plan) => {
        plan.handoff.target_actor_refs = [ref('npc', 'unknown-target')];
        return plan;
      },
    }),
    ({ code }) => code === 'TURN_NPC_PLAN_INVALID',
  );
});
test('player combat handoff reaches the persisted combat boundary', async () => {
  const { state, contracts } = phase4ArrivalState();
  const targetRef = ref('npc', contracts.actors.ratsha_storehouse_helper.instance_id);
  const handoff = {
    kind: 'combat',
    intent: 'attack Ratsha',
    target_actor_refs: [targetRef],
  };
  const exchange = await runPhase4({
    state,
    contracts,
    rawText: '\u0411\u0440\u043E\u0441\u0430\u044E\u0441\u044C \u043D\u0430 \u0420\u0430\u0442\u0448\u0443.',
    inputDigest: digest('4'),
    responseKind: 'speech',
    checkResult: null,
    offerStage: null,
    checkRequest: null,
    transformPlayerPlan(plan) {
      plan.contribution_kind = 'combat_handoff';
      plan.primary_addressee_ref = null;
      plan.intended_addressee_refs = [];
      plan.speech = null;
      plan.interpretation = {
        intent: 'start combat with Ratsha',
        grounded_contribution: handoff.intent,
        adaptation: 'literal',
      };
      plan.resolution = 'automatic';
      plan.check = null;
      plan.supporting_operations = [];
      plan.handoff = handoff;
      return plan;
    },
  });
  assert.deepEqual(exchange.result.combat_handoff, handoff);
  const next = projectPhase4Negotiation({
    state,
    contracts,
    result: exchange.result,
    inputDigest: digest('4'),
  });
  assert.deepEqual(next.player_response_boundary, handoff);
});
test('late Ratsha surrender applies after another NPC contribution', async () => {
  const { state, contracts, offerStage, checkRequest } = phase4ArrivalState();
  const ratshaRef = ref('npc', contracts.actors.ratsha_storehouse_helper.instance_id);
  const fisherRef = ref('npc', contracts.actors.participating_fisher.instance_id);
  const exchange = await runPhase4({
    state,
    contracts,
    rawText: '\u0420\u0430\u0442\u0448\u0430, \u0441\u0434\u0430\u0432\u0430\u0439\u0441\u044F \u0438 \u043E\u0442\u0434\u0430\u0439 \u043D\u043E\u0436.',
    inputDigest: digest('1'),
    responseKind: (_request, callIndex) => (callIndex === 1 ? 'bargain' : callIndex === 2 ? 'speech' : 'surrender'),
    checkResult: checkResult(contracts.check.check_id, 'success'),
    offerStage,
    checkRequest,
    transformNpcPlan(plan, { call_index: callIndex }) {
      const targetRef = callIndex === 1 ? fisherRef : callIndex === 2 ? ratshaRef : null;
      if (targetRef !== null) {
        plan.primary_addressee_ref = targetRef;
        plan.intended_addressee_refs = [targetRef];
        plan.speech.response_expectation = {
          kind: 'answer',
          target_refs: [targetRef],
        };
      }
      return plan;
    },
  });
  assert.equal(exchange.npcCalls, 3);
  assert.equal(exchange.result.response_kind, 'surrender');
  assert.equal(exchange.result.commitment.status, 'active');
  const ratshaStatements = exchange.result.statements.filter(({ speaker_ref: speaker }) => speaker.entity_id === ratshaRef.entity_id);
  assert.equal(ratshaStatements.length, 2);
  assert.equal(exchange.result.surrender.source_statement_ref.entity_id, ratshaStatements.at(-1).statement_id);
  const next = projectPhase4Negotiation({
    state,
    contracts,
    result: exchange.result,
    inputDigest: digest('1'),
  });
  assert.equal(next.ratsha_surrendered, true);
});
test('late Ratsha combat handoff terminates the causal exchange', async () => {
  const { state, contracts, offerStage, checkRequest } = phase4ArrivalState();
  const ratshaRef = ref('npc', contracts.actors.ratsha_storehouse_helper.instance_id);
  const fisherRef = ref('npc', contracts.actors.participating_fisher.instance_id);
  const exchange = await runPhase4({
    state,
    contracts,
    rawText: '\u0420\u0430\u0442\u0448\u0430, \u0440\u0435\u0448\u0430\u0439.',
    inputDigest: digest('2'),
    responseKind: (_request, callIndex) => (callIndex === 1 ? 'bargain' : callIndex === 2 ? 'speech' : 'combat_handoff'),
    checkResult: checkResult(contracts.check.check_id, 'success'),
    offerStage,
    checkRequest,
    transformNpcPlan(plan, { call_index: callIndex }) {
      const targetRef = callIndex === 1 ? fisherRef : callIndex === 2 ? ratshaRef : null;
      if (targetRef !== null) {
        plan.primary_addressee_ref = targetRef;
        plan.intended_addressee_refs = [targetRef];
        plan.speech.response_expectation = {
          kind: 'answer',
          target_refs: [targetRef],
        };
      }
      return plan;
    },
  });
  assert.equal(exchange.npcCalls, 3);
  assert.equal(exchange.result.response_kind, 'combat_handoff');
  assert.equal(exchange.result.exchange.stop_reason, 'handoff');
  assert.deepEqual(exchange.result.combat_handoff.target_actor_refs, [ref('player_character', state.actor_id)]);
});
