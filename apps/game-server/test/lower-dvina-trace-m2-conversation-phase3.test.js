import assert from 'node:assert/strict';
import test from 'node:test';
import {
  resolveTracePhase3Contracts
} from '../src/runtime/lower-dvina-trace-phase-3-contracts.js';
import {
  projectSemanticConversationSnapshot
} from '../src/infrastructure/postgres/lower-dvina-trace-conversation-state.js';
import {
  appendNpcSemanticConversationWrites,
  buildNpcSemanticConversationWriteInput
} from '../src/infrastructure/postgres/npc-semantic-conversation-writes.js';
import { assertLowerDvinaTraceSemanticConversationRows } from
  '../src/infrastructure/postgres/lower-dvina-trace-semantic-conversation-read.js';
import { semanticReadPool } from
  './lower-dvina-trace-semantic-persistence-read-pool.js';
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

test('revision 14 exact commands bind semantic persistence to the root turn without a fabricated M1 envelope', () => {
  const semanticExchange = { response_kind: 'withhold' };
  const factual = {
    mode_resolution: { turn_id: 'turn:party-1:3' },
    consequence: {
      phase3_kind: 'conversation',
      conversation: { semantic_exchange: semanticExchange }
    }
  };
  assert.deepEqual(phase3SemanticCommitContext({
    scenarioRevision: 14,
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

test('a social check does not present evidence without the supporting operation', async () => {
  const state = phase3State();
  const contracts = resolveTracePhase3Contracts({ state, bundle: revision14Bundle });
  const exchange = await runPhase3({
    state,
    contracts,
    rawText: 'Еремей, ты обязан сказать правду.',
    inputDigest: digest('3'),
    responseKind: 'speech',
    checkResult: checkResult(contracts.check.check_id, 'success')
  });

  assert.deepEqual(exchange.result.decision_boundary.categories, [
    'communication'
  ]);
  assert.equal(
    JSON.stringify(exchange.npcRequest).includes('presented_evidence_ref'),
    false
  );
  assert.equal(exchange.result.new_signal_records.some(
    ({ signal }) => signal.source_event_ref.entity_kind
      === 'evidence_presentation'
  ), false);
  assert.equal(exchange.result.evidence_presentation, null);
});

test('evidence presentation requires and executes its supporting operation', async () => {
  const state = phase3State();
  const contracts = resolveTracePhase3Contracts({ state, bundle: revision14Bundle });
  withAccessibleBlueWool(state, contracts);
  const exchange = await runPhase3({
    state,
    contracts,
    rawText: 'Вот синяя шерсть с берега. Что ты знаешь?',
    inputDigest: digest('4'),
    responseKind: 'route_disclosure',
    checkResult: checkResult(contracts.check.check_id, 'success'),
    playerPlanOptions: { evidence: true }
  });

  assert.deepEqual(exchange.result.decision_boundary.categories, [
    'environment',
    'communication'
  ]);
  assert.equal(exchange.result.new_signal_records.some(
    ({ signal }) => signal.source_event_ref.entity_kind
      === 'evidence_presentation'
  ), true);
  assert.equal(
    exchange.result.evidence_presentation.interaction_kind,
    'present_item_as_evidence'
  );
  const tampered = structuredClone(exchange.result);
  tampered.evidence_presentation.entity_ref.entity_id = 'item:not-held';
  assert.throws(() => projectPhase3Conversation({
    state,
    contracts,
    result: tampered,
    inputDigest: digest('4')
  }), { code: 'TRACE_M2_PHASE_3_EVIDENCE_EVENT_INVALID' });
});

test('hearing evidence words without seeing the item creates only communication signal', async () => {
  const state = phase3State();
  const eremey = state.npcs.find(
    ({ participant_slot_ref: slot }) => slot === 'eremey_fisher'
  );
  eremey.machine_state = {
    ...eremey.machine_state,
    visual_capability: 'none'
  };
  const contracts = resolveTracePhase3Contracts({ state, bundle: revision14Bundle });
  withAccessibleBlueWool(state, contracts);

  const exchange = await runPhase3({
    state,
    contracts,
    rawText: 'Вот синяя шерсть с берега. Что ты знаешь?',
    inputDigest: digest('e'),
    responseKind: 'withhold',
    checkResult: checkResult(contracts.check.check_id, 'success'),
    playerPlanOptions: { evidence: true }
  });

  assert.deepEqual(
    exchange.result.new_signal_records.map(({ signal }) => signal.category),
    ['communication']
  );
  const restarted = projectPhase3Conversation({
    state,
    contracts,
    result: exchange.result,
    inputDigest: digest('e')
  });
  assert.equal(
    restarted.supporting_operation_perceptions.at(-1).result_kind,
    'not_perceived'
  );
  const writes = conversationWrites(
    state, restarted, exchange.result, 'evidence-not-seen'
  );
  const perceptionId =
    restarted.supporting_operation_perceptions.at(-1).perception_id;
  assert.equal(writes.appends.some(({ target_table: table, record }) =>
    table === 'party_perception_witnesses'
      && record.perception_id === perceptionId), false);
  assert.equal((await assertLowerDvinaTraceSemanticConversationRows(
    semanticReadPool(writes), restarted)).length, 1);
});

test('seeing evidence without hearing the words creates only environment signal', async () => {
  const state = phase3State();
  const eremey = state.npcs.find(
    ({ participant_slot_ref: slot }) => slot === 'eremey_fisher'
  );
  eremey.machine_state = {
    ...eremey.machine_state,
    hearing_capability: 'none',
    visual_capability: 'full'
  };
  const contracts = resolveTracePhase3Contracts({ state, bundle: revision14Bundle });
  withAccessibleBlueWool(state, contracts);

  const exchange = await runPhase3({
    state,
    contracts,
    rawText: 'Вот синяя шерсть с берега. Что ты знаешь?',
    inputDigest: digest('d'),
    responseKind: 'withhold',
    checkResult: checkResult(contracts.check.check_id, 'success'),
    playerPlanOptions: { evidence: true }
  });

  assert.equal(exchange.npcCalls, 0);
  assert.equal(exchange.result.decision_boundary, null);
  assert.deepEqual(
    exchange.result.new_signal_records.map(({ signal }) => signal.category),
    ['environment']
  );
  const environmentSignal = exchange.result.new_signal_records[0].signal;
  assert.equal(
    environmentSignal.source_event_ref.entity_kind,
    'evidence_presentation'
  );
  assert.equal(
    environmentSignal.source_perception_ref.entity_id.includes(
      'evidence-presentation'
    ),
    true
  );
  const restarted = projectPhase3Conversation({
    state,
    contracts,
    result: exchange.result,
    inputDigest: digest('d')
  });
  assert.equal(
    restarted.supporting_operation_perceptions.at(-1).result_kind,
    'recognized'
  );
  assert.equal(
    restarted.npc_decision_signals.some(
      ({ signal }) => signal.signal_id === environmentSignal.signal_id
    ),
    true
  );
  const writes = conversationWrites(
    state, restarted, exchange.result, 'evidence-visual-perception'
  );
  const persistedPerception = writes.appends.find(
    ({ target_table: table, record }) =>
      table === 'party_perception_records'
        && record.perception_id ===
          restarted.supporting_operation_perceptions.at(-1).perception_id
  );
  assert.equal(persistedPerception.record.result_kind, 'recognized');
  assert.deepEqual(persistedPerception.record.signal_refs, [{
    entity_kind: 'npc_decision_signal',
    entity_id: environmentSignal.signal_id
  }]);
  assert.equal((await assertLowerDvinaTraceSemanticConversationRows(
    semanticReadPool(writes), restarted)).length, 0);
  const tampered = structuredClone(writes);
  tampered.appends.find(({ target_table: table, record }) =>
    table === 'party_perception_records'
      && record.perception_id === persistedPerception.record.perception_id
  ).record.signal_refs = [];
  await assert.rejects(
    () => assertLowerDvinaTraceSemanticConversationRows(
      semanticReadPool(tampered), restarted
    ),
    { code: 'TRACE_PHASE_2_SESSION_READ_INVALID' }
  );
});

test('ordinary NPC response keeps one session active across player boundaries', async () => {
  const state = phase3State();
  const contracts = resolveTracePhase3Contracts({ state, bundle: revision14Bundle });
  const first = await runPhase3({
    state,
    contracts,
    rawText: 'Еремей, что ты видел?',
    inputDigest: digest('5'),
    responseKind: 'speech'
  });
  assert.equal(first.result.exchange.session_status, 'active');
  assert.equal(first.result.exchange.stop_reason, 'player_response');
  const continuedState = projectSemanticConversationSnapshot({
    state,
    semanticExchange: first.result,
    rootTurnId: 'turn:conversation:first',
    workingRevision: 0,
    appliedChangeSetId: 'change:conversation:first'
  });
  const secondContracts = resolveTracePhase3Contracts({
    state: continuedState,
    bundle: revision14Bundle
  });
  const second = await runPhase3({
    state: continuedState,
    contracts: secondContracts,
    rawText: 'А что было потом?',
    inputDigest: digest('6'),
    responseKind: 'speech'
  });

  assert.equal(
    second.result.decision_request.conversation_id,
    first.result.decision_request.conversation_id
  );
  assert.ok(second.npcRequest.public_conversation_history.length >= 3);
  assert.equal(second.result.exchange.session_status, 'active');
});

test('Eremey may leave a conversation through the common contribution contract', async () => {
  const state = phase3State();
  const contracts = resolveTracePhase3Contracts({ state, bundle: revision14Bundle });
  const exchange = await runPhase3({
    state,
    contracts,
    rawText: 'Еремей, задержись.',
    inputDigest: digest('7'),
    responseKind: 'leave_conversation'
  });
  assert.equal(exchange.result.response_kind, 'leave_conversation');
  assert.equal(exchange.result.exchange.session_status, 'ended');
  const projected = projectPhase3Conversation({
    state,
    contracts,
    result: exchange.result,
    inputDigest: digest('7')
  });
  assert.equal(projected.conversation_sessions.at(-1).status, 'ended');
});

test('conversation audience uses listener hearing state instead of fixed recognition', async () => {
  const state = phase3State();
  const fisher = state.npcs.find(
    ({ participant_slot_ref: slot }) => slot === 'background_fisher_1'
  );
  fisher.machine_state = { ...fisher.machine_state, hearing_capability: 'none' };
  const contracts = resolveTracePhase3Contracts({ state, bundle: revision14Bundle });
  const exchange = await runPhase3({
    state,
    contracts,
    rawText: 'Еремей, что ты видел?',
    inputDigest: digest('0'),
    responseKind: 'speech'
  });
  const audience = exchange.result.audiences[0];
  assert.equal(audience.actual_listener_refs.some(
    ({ entity_id: id }) => id === fisher.instance_id
  ), false);
  assert.equal(audience.witness_candidate_refs.some(
    ({ entity_id: id }) => id === fisher.instance_id
  ), false);
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

function conversationWrites(state, next, semanticExchange, suffix) {
  const writeInput = buildNpcSemanticConversationWriteInput({
    state,
    next,
    semanticExchange
  });
  const writes = { inserts: [], updates: [], appends: [] };
  const traceRef = (next.npc_semantic_decision_refs ?? []).find(
    ({ request_id: requestId }) =>
      requestId === semanticExchange.decision_request?.request_id
  ) ?? null;
  appendNpcSemanticConversationWrites({
    ...writes,
    partyId: state.party_id,
    changeSetId: traceRef?.applied_change_set_id ?? `change:${suffix}`,
    idempotencyRecordId: `idem:${suffix}`,
    rootTurnId: traceRef?.root_turn_id ?? `turn:${suffix}`,
    workingRevision: traceRef?.working_revision ?? 0,
    ...writeInput
  });
  return writes;
}
