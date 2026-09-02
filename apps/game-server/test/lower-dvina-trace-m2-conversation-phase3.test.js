import assert from 'node:assert/strict';
import test from 'node:test';
import {
  resolveTracePhase3Contracts
} from '../src/runtime/lower-dvina-trace-phase-3-contracts.js';
import {
  projectSemanticConversationSnapshot
} from '../src/infrastructure/postgres/lower-dvina-trace-conversation-state.js';
import {
  phase2PublicResult
} from '../src/infrastructure/postgres/lower-dvina-trace-phase-2-projection.js';
import {
  phase3SemanticCommitContext
} from '../src/infrastructure/postgres/lower-dvina-trace-phase-3-commit-support.js';
import { createTracePhase3ConversationCommand } from
  '../src/runtime/lower-dvina-trace-phase-3-conversation-command.js';
import {
  assertPersistedStatePayloadSafe,
  checkResult,
  createM2ConversationModels,
  digest,
  phase2ConversationPayload,
  phase3State,
  projectPhase3Conversation,
  ref,
  revision14Bundle,
  runPhase3,
  withAccessibleBlueWool
} from './lower-dvina-trace-m2-conversation-fixture.js';
import { createLowerDvinaTraceNpcSemanticModel } from
  '../src/runtime/lower-dvina-trace-phase-2-llm.js';
import { projectM2ConversationExecutionResult } from
  '../src/runtime/lower-dvina-trace-m2-conversation-result.js';

test('multi-NPC result selects the addressed NPC as the primary decision', () => {
  const background = ref('npc', 'background');
  const target = ref('npc', 'target');
  const decisions = [background, target].map((npcRef) => ({
    request: { request_id: `request:${npcRef.entity_id}`, npc_ref: npcRef }
  }));
  const outcomes = new Map(decisions.map(({ request }) => [
    request.request_id,
    { kind: 'speech', contributionRef: ref('conversation_statement',
      `statement:${request.npc_ref.entity_id}`) }
  ]));
  const result = projectM2ConversationExecutionResult({
    exchange: {
      npc_decisions: decisions,
      contributions: [...outcomes.values()].map(({ contributionRef }) => ({
        schema: 'conversation_statement_event_v1',
        statement_id: contributionRef.entity_id
      })),
      working_state: { statements: [], audiences: [],
        supporting_operation_perceptions: [], new_signal_records: [],
        consumed_signal_ids: [], terminal_npc_outcomes: [], clock: {},
        elapsed_minutes: 0 },
      temporal_boundary_refs: []
    },
    context: { targetRef: target, socialDeliveryResult: null },
    pendingExecution: null,
    pendingPlayerExecution: null,
    npcOutcomes: outcomes,
    resumedOutcome: null
  });
  assert.equal(result.decision.request.npc_ref.entity_id, 'target');
  assert.equal(result.npcOutcome.contributionRef.entity_id, 'statement:target');
});

test('player conversation meaning controls whether the common social check runs', async () => {
  const state = phase3State();
  const contracts = resolveTracePhase3Contracts({ state, bundle: revision14Bundle });
  const baseModel = createM2ConversationModels().playerConversationModel;
  const common = {
    contracts,
    evidence: false,
    npcSemanticModel: async () => null,
    revalidateStateVersion: async () => state.party_state.state_version
  };
  const ordinary = createTracePhase3ConversationCommand({
    ...common,
    inputDigest: digest('a'),
    playerConversationModel: baseModel
  });
  const ordinaryAvailability = await ordinary.availability({
    retrievedState: state,
    playerInput: { raw_text: 'Еремей, что ты видел?' }
  });
  assert.equal(ordinaryAvailability.status, 'available');
  assert.deepEqual(ordinaryAvailability.check_requests, []);

  const persuasive = createTracePhase3ConversationCommand({
    ...common,
    inputDigest: digest('b'),
    playerConversationModel: async (request) => {
      const plan = structuredClone(await baseModel(request));
      plan.resolution = 'check_required';
      plan.check = socialCheck(request.player_safe_context.available_check);
      return plan;
    }
  });
  const persuasiveAvailability = await persuasive.availability({
    retrievedState: state,
    playerInput: { raw_text: 'Убеди Еремея рассказать всё, что он скрывает.' }
  });
  assert.equal(persuasiveAvailability.status, 'check_required');
  assert.equal(persuasiveAvailability.check_requests.length, 1);
});

test('NPC adapter retries an initial JSON parse failure with its format role',
  async () => {
    const state = phase3State();
    const contracts = resolveTracePhase3Contracts({ state, bundle: revision14Bundle });
    const calls = [];
    const baseModel = createM2ConversationModels().npcSemanticModel;
    const npcSemanticModel = createLowerDvinaTraceNpcSemanticModel({
      roleRunner: { async run(call) {
        calls.push(call);
        if (calls.length === 1) throw Object.assign(new Error('bad JSON'), {
          code: 'json_parse_failed'
        });
        if (call.role_id === 'npc_conversation_grounding_auditor') {
          return { output: { pass: true, concerns: [] } };
        }
        const payload = JSON.parse(call.messages[1].content);
        return { output: baseModel(payload.request ?? payload) };
      } }
    });
    const exchange = await runPhase3({
      state, contracts, rawText: 'Что случилось?', inputDigest: digest('a'),
      responseKind: 'speech', npcSemanticModel
    });
    assert.equal(exchange.result.response_kind, 'withhold');
    assert.deepEqual(calls.map(({ role_id }) => role_id), [
      'npc_conversation_responder',
      'npc_conversation_responder_format_repair',
      'npc_conversation_grounding_auditor'
    ]);
  });

test('fresh NPC speech audit passes exact route disclosure and ordinary reply', async (t) => {
  const state = phase3State();
  const contracts = resolveTracePhase3Contracts({ state, bundle: revision14Bundle });
  withAccessibleBlueWool(state, contracts);
  const baseModel = createM2ConversationModels().npcSemanticModel;
  const calls = [];
  const npcSemanticModel = createLowerDvinaTraceNpcSemanticModel({
    roleRunner: { async run(call) {
      calls.push(call);
      if (call.role_id === 'npc_conversation_grounding_auditor') {
        return { output: { pass: true, concerns: [] } };
      }
      const payload = JSON.parse(call.messages[1].content);
      return { output: baseModel(payload.request ?? payload) };
    } }
  });
  await t.test('exact supplied route candidate commits without repair', async () => {
    const exchange = await runPhase3({
      state, contracts,
      rawText: 'Show the evidence and ask for directions.', inputDigest: digest('b'),
      responseKind: 'route_disclosure',
      checkResult: checkResult(contracts.check.check_id, 'success'),
      playerPlanOptions: { evidence: true }, npcSemanticModel
    });
    assert.equal(exchange.result.response_kind, 'route_disclosure');
    assert.equal(exchange.result.route_disclosure.route_ref,
      'trace_ld_v1_route_camp_to_shed');
    assert.equal(exchange.result.statements.filter(({ speaker_ref: speaker }) =>
      speaker.entity_kind === 'npc').length, 1);
    assert.deepEqual(calls.map(({ role_id }) => role_id), [
      'npc_conversation_responder', 'npc_conversation_grounding_auditor'
    ]);
  });

  await t.test('ordinary grounded reply commits without repair', async () => {
    const ordinaryCalls = [];
    const ordinaryModel = createLowerDvinaTraceNpcSemanticModel({
      roleRunner: { async run(call) {
        ordinaryCalls.push(call);
        if (call.role_id === 'npc_conversation_grounding_auditor') {
          return { output: { pass: true, concerns: [] } };
        }
        const payload = JSON.parse(call.messages[1].content);
        return { output: baseModel(payload.request ?? payload) };
      } }
    });
    const ordinary = await runPhase3({
      state, contracts, rawText: 'What did you notice?', inputDigest: digest('c'),
      responseKind: 'withhold', npcSemanticModel: ordinaryModel
    });
    assert.equal(ordinary.result.response_kind, 'withhold');
    assert.deepEqual(ordinaryCalls.map(({ role_id }) => role_id), [
      'npc_conversation_responder', 'npc_conversation_grounding_auditor'
    ]);
  });
});

test('action-set evaluation does not require player input or invoke the interpreter', async () => {
  const state = phase3State();
  const contracts = resolveTracePhase3Contracts({ state, bundle: revision14Bundle });
  let playerCalls = 0;
  const command = createTracePhase3ConversationCommand({
    contracts,
    evidence: false,
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

test('supported semantic revisions bind exact semantic persistence to the root turn', () => {
  const semanticExchange = { response_kind: 'withhold' };
  const factual = {
    mode_resolution: { turn_id: 'turn:party-1:3' },
    consequence: {
      phase3_kind: 'conversation',
      conversation: { semantic_exchange: semanticExchange }
    }
  };
  for (const scenarioRevision of [14, 15, 27, 32]) {
    assert.deepEqual(phase3SemanticCommitContext({
      scenarioRevision,
      factual,
      writePlan: {
        turn_id: 'turn:party-1:3',
        command_trace: { decision_protocol: 'code_exact_fast_path_v1' }
      }
    }), {
      rootTurnId: 'turn:party-1:3',
      workingRevision: 0,
      semanticExchange
    });
  }
  assert.throws(() => phase3SemanticCommitContext({
    scenarioRevision: 14,
    factual,
    writePlan: {
      turn_id: 'turn:party-1:3',
      command_trace: { decision_protocol: 'bounded_decision_v2' }
    }
  }), { code: 'TRACE_M2_PHASE_3_SEMANTIC_LINEAGE_INVALID' });
});

test('historical bounded Phase 3 does not require a semantic exchange', () => {
  assert.equal(phase3SemanticCommitContext({
    scenarioRevision: 14,
    factual: {
      mode_resolution: { turn_id: 'turn:historical:3' },
      consequence: {
        phase3_kind: 'conversation',
        conversation: { semantic_exchange: null }
      }
    },
    writePlan: {
      turn_id: 'turn:historical:3',
      command_trace: { decision_protocol: 'bounded_decision_v2' }
    }
  }), null);
});

test('revision 14 Eremey semantic plans withhold or disclose and persist the exact heard exchange', async () => {
  assert.equal(revision14Bundle.definition_revision, 14);
  const state = phase3State();
  const ratsha = state.npcs.find(
    ({ participant_slot_ref: slot }) => slot === 'ratsha_storehouse_helper'
  );
  ratsha.knowledge_profile_snapshot.private_test_marker =
    'ratsha-private-knowledge-must-not-reach-eremey';
  const eremey = state.npcs.find(
    ({ participant_slot_ref: slot }) => slot === 'eremey_fisher'
  );
  const persistenceMarker =
    'eremey-private-request-knowledge-must-not-reach-state-payload';
  eremey.knowledge_profile_snapshot.private_persistence_marker =
    persistenceMarker;
  const contracts = resolveTracePhase3Contracts({
    state,
    bundle: revision14Bundle
  });
  withAccessibleBlueWool(state, contracts);

  const withheld = await runPhase3({
    state,
    contracts,
    rawText: 'Еремей, что ты видел у лодки?',
    inputDigest: digest('1'),
    responseKind: 'withhold'
  });
  assert.equal(withheld.result.response_kind, 'withhold');
  assert.equal(withheld.result.route_disclosure, null);
  assert.equal(withheld.playerCalls, 1);
  assert.equal(withheld.npcCalls, 1);

  const utterance = 'Вот синяя шерсть с берега. Покажи дорогу к старой сушильне.';
  const disclosed = await runPhase3({
    state,
    contracts,
    rawText: utterance,
    inputDigest: digest('2'),
    responseKind: 'route_disclosure',
    checkResult: checkResult(contracts.check.check_id, 'success'),
    playerPlanOptions: { evidence: true }
  });

  assert.equal(disclosed.result.response_kind, 'route_disclosure');
  assert.equal(
    disclosed.result.route_disclosure.route_ref,
    'trace_ld_v1_route_camp_to_shed'
  );
  assert.deepEqual(
    disclosed.result.decision_boundary.categories,
    ['environment', 'communication']
  );
  assert.equal(disclosed.result.exchange.npc_decisions.length, 1);
  assert.equal(disclosed.npcCalls, 1);
  assert.equal(
    JSON.stringify(disclosed.npcRequest).includes(
      'ratsha-private-knowledge-must-not-reach-eremey'
    ),
    false
  );
  assert.deepEqual(
    disclosed.npcRequest.knowledge,
    contracts.actors.find(({ ref: actorRef }) =>
      actorRef === 'eremey_fisher').knowledge_profile_snapshot
  );
  assert.equal(
    disclosed.npcRequest.knowledge.private_persistence_marker,
    persistenceMarker
  );
  assert.equal(
    disclosed.npcRequest.public_conversation_history[0].utterance_text,
    utterance
  );
  assert.equal(
    Object.hasOwn(
      disclosed.npcRequest.public_conversation_history[0],
      'social_delivery_result'
    ),
    false
  );

  const projected = projectSemanticConversationSnapshot({
    state,
    semanticExchange: disclosed.result,
    rootTurnId: 'turn:m2-eremey-disclosure',
    workingRevision: 0,
    appliedChangeSetId: 'change:m2-eremey-disclosure'
  });
  assert.equal(
    Object.hasOwn(projected, 'npc_semantic_decision_traces'),
    false
  );
  assert.equal(
    projected.npc_semantic_decision_refs[0].request_id,
    disclosed.result.decision_request.request_id
  );
  const playerStatement = projected.conversation_statements.find(
    ({ speaker_ref: speaker }) => speaker.entity_kind === 'player_character'
  );
  assert.equal(playerStatement.utterance_text, utterance);
  const ordinaryFisherId = contracts.actors.find(
    ({ ref: actorRef }) => actorRef === 'background_fisher_1'
  ).instance_id;
  const receivedByFisher = projected.received_messages.find(
    ({ source_statement_ref: statementRef, listener_ref: listenerRef }) =>
      statementRef.entity_id === playerStatement.statement_id
      && listenerRef.entity_kind === 'npc'
      && listenerRef.entity_id === ordinaryFisherId
  );
  assert.equal(receivedByFisher.utterance_text, utterance);
  assert.equal(
    disclosed.result.decision_request.npc_ref.entity_id,
    contracts.actors.find(({ ref: actorRef }) =>
      actorRef === 'eremey_fisher').instance_id
  );

  const publicPayload = phase2ConversationPayload({
    state,
    optionId: contracts.ids.evidenceOption,
    check: checkResult(contracts.check.check_id, 'success'),
    activityRef: contracts.evidenceTalk.profile_id,
    result: disclosed.result
  });
  const publicResult = phase2PublicResult({
    payload: publicPayload,
    screen: { schema: 'test-screen' }
  });
  assert.deepEqual(publicResult.conversation.semantic_exchange, {
    response_kind: 'route_disclosure',
    npc_utterance: 'От лагеря иди к старой сушильне по тропе.',
    disclosed_route_ref: 'trace_ld_v1_route_camp_to_shed'
  });
  assert.deepEqual(
    Object.keys(publicResult.conversation.semantic_exchange).sort(),
    ['disclosed_route_ref', 'npc_utterance', 'response_kind']
  );
  for (const privateField of [
    'decision_request',
    'decision_plan',
    'audiences',
    'new_signal_records',
    'knowledge'
  ]) {
    assert.equal(
      Object.hasOwn(publicResult.conversation.semantic_exchange, privateField),
      false
    );
  }
  const npcStatement = disclosed.result.statements.find(
    ({ speaker_ref: speaker }) => speaker.entity_kind === 'npc'
  );
  const npcStatementRef = ref(
    'conversation_statement', npcStatement.statement_id
  );
  for (const statementRefs of [[], [npcStatementRef, npcStatementRef]]) {
    const invalid = structuredClone(publicPayload);
    invalid.last_turn.consequence.conversation
      .semantic_exchange_projection.statement_refs =
        structuredClone(statementRefs);
    assert.throws(
      () => phase2PublicResult({
        payload: invalid,
        screen: { schema: 'test-screen' }
      }),
      TypeError
    );
  }
  const wrongSpeaker = structuredClone(publicPayload);
  wrongSpeaker.conversation_statements.find(
    ({ statement_id: statementId }) => statementId === npcStatement.statement_id
  ).speaker_ref = ref('npc', 'trace_ld_v1_npc_ratsha');
  assert.throws(
    () => phase2PublicResult({
      payload: wrongSpeaker,
      screen: { schema: 'test-screen' }
    }),
    /does not belong to the projected NPC/u
  );
  for (const routeMutation of [
    (semantic) => { semantic.route_disclosure = null; },
    (semantic) => { semantic.response_kind = 'withhold'; }
  ]) {
    const invalidRoute = structuredClone(publicPayload);
    routeMutation(
      invalidRoute.last_turn.consequence.conversation
        .semantic_exchange_projection
    );
    assert.throws(
      () => phase2PublicResult({
        payload: invalidRoute,
        screen: { schema: 'test-screen' }
      }),
      /Semantic route disclosure is invalid/u
    );
  }
  const unsafe = structuredClone(publicPayload);
  delete unsafe.last_turn.consequence.conversation
    .semantic_exchange_projection;
  unsafe.last_turn.consequence.conversation.semantic_exchange =
    structuredClone(disclosed.result);
  assert.throws(
    () => phase2PublicResult({
      payload: unsafe,
      screen: { schema: 'test-screen' }
    }),
    /Private semantic exchange/u
  );

  delete eremey.knowledge_profile_snapshot.private_persistence_marker;
  const phase3StatePayload = projectPhase3Conversation({
    state,
    contracts,
    result: disclosed.result,
    inputDigest: digest('2')
  });
  assertPersistedStatePayloadSafe({
    payload: phase3StatePayload,
    persistenceMarker,
    historyBranch: phase3StatePayload.activity_history.at(-1)
      .execution_result
  });
});

test('Eremey may answer with ordinary speech and an intent paraphrase becomes natural utterance', async () => {
  const state = phase3State();
  const contracts = resolveTracePhase3Contracts({ state, bundle: revision14Bundle });
  const exchange = await runPhase3({
    state,
    contracts,
    rawText: 'попросить Еремея рассказать правду',
    inputDigest: digest('f'),
    responseKind: 'speech',
    playerPlanOptions: {
      inputMode: 'intent_paraphrase',
      utteranceText: 'Еремей, скажи по совести: что ты видел у лодки?'
    }
  });

  assert.equal(exchange.result.response_kind, 'speech');
  assert.equal(
    exchange.result.statements[0].utterance_text,
    'Еремей, скажи по совести: что ты видел у лодки?'
  );
});

test('an unsupported NPC promise is repaired into the exact route disclosure',
  async () => {
    const state = phase3State();
    const contracts = resolveTracePhase3Contracts({ state, bundle: revision14Bundle });
    withAccessibleBlueWool(state, contracts);
    const exchange = await runPhase3({
      state,
      contracts,
      rawText: 'Показываю улику и жду ответа.',
      inputDigest: digest('e'),
      responseKind: 'route_disclosure',
      checkResult: checkResult(contracts.check.check_id, 'success'),
      playerPlanOptions: { evidence: true },
      transformNpcPlan(plan, { call_index: call }) {
        if (call !== 1) return plan;
        plan.speech.dominant_act = 'promise';
        plan.supporting_operations = [];
        return plan;
      }
    });

    assert.equal(exchange.npcCalls, 2);
    assert.equal(exchange.result.response_kind, 'route_disclosure');
    assert.equal(exchange.result.route_disclosure.route_ref,
      'trace_ld_v1_route_camp_to_shed');
  });

test('structured route speech without its exact operation is repaired before commit',
  async () => {
    const state = phase3State();
    const contracts = resolveTracePhase3Contracts({ state, bundle: revision14Bundle });
    withAccessibleBlueWool(state, contracts);
    const exchange = await runPhase3({
      state,
      contracts,
      rawText: 'Показываю улику и жду ответа.',
      inputDigest: digest('f'),
      responseKind: 'route_disclosure',
      checkResult: checkResult(contracts.check.check_id, 'success'),
      playerPlanOptions: { evidence: true },
      transformNpcPlan(plan, { call_index: call }) {
        if (call === 1) plan.supporting_operations = [];
        return plan;
      }
    });

    assert.equal(exchange.npcCalls, 2);
    assert.equal(exchange.result.response_kind, 'route_disclosure');
    assert.equal(exchange.result.route_disclosure.route_ref,
      'trace_ld_v1_route_camp_to_shed');
  });

function socialCheck(profile) {
  return {
    purpose: 'resolve persuasive delivery',
    attribute_ref: profile.attribute_ref,
    skill_ref: profile.skill_ref,
    difficulty_band: profile.difficulty_band,
    outcomes: {
      clean_success: { delivery_quality: 'compelling', observable_effects: [] },
      success: { delivery_quality: 'credible', observable_effects: [] },
      success_with_cost: {
        delivery_quality: 'credible_with_visible_cost', observable_effects: []
      },
      failure_with_consequence: {
        delivery_quality: 'unconvincing', observable_effects: []
      },
      severe_failure: {
        delivery_quality: 'transparently_manipulative', observable_effects: []
      }
    }
  };
}
