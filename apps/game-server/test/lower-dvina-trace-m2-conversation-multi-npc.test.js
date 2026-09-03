import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveTracePhase3Contracts } from
  '../src/runtime/lower-dvina-trace-phase-3-contracts.js';
import { createTracePhase3VisibleProjector } from
  '../src/runtime/lower-dvina-trace-phase-3-effects.js';
import { projectSemanticConversationSnapshot } from
  '../src/infrastructure/postgres/lower-dvina-trace-conversation-state.js';
import { buildNpcSemanticConversationWriteInput } from
  '../src/infrastructure/postgres/npc-semantic-conversation-write-input.js';
import { appendNpcSemanticConversationWrites } from
  '../src/infrastructure/postgres/npc-semantic-conversation-writes.js';
import { assertLowerDvinaTraceSemanticConversationRows } from
  '../src/infrastructure/postgres/lower-dvina-trace-semantic-conversation-read.js';
import { semanticReadPool } from
  './lower-dvina-trace-semantic-persistence-read-pool.js';
import {
  digest,
  phase2ConversationPayload,
  phase3State,
  projectPhase3Conversation,
  ref,
  revision14Bundle,
  runPhase3,
  withAccessibleBlueWool
} from './lower-dvina-trace-m2-conversation-fixture.js';

test('late Eremey route disclosure is the applied target outcome', async () => {
  const state = phase3State();
  const contracts = resolveContracts(state);
  withAccessibleBlueWool(state, contracts);
  const eremey = npcBySlot(state, 'eremey_fisher');
  const responder = npcBySlot(state, 'background_fisher_1');
  const eremeyRef = ref('npc', eremey.instance_id);
  const responderRef = ref('npc', responder.instance_id);
  const exchange = await runPhase3({ state, contracts,
    rawText: 'Еремей, спроси рыбака и скажи, где сушильня.',
    inputDigest: digest('b'),
    responseKind: (_request, callIndex) =>
      callIndex === 3 ? 'route_disclosure' : 'speech',
    playerPlanOptions: { evidence: true },
    transformNpcPlan(plan, { call_index: callIndex }) {
      const targetRef = callIndex === 1 ? responderRef
        : callIndex === 2 ? eremeyRef : null;
      if (targetRef !== null) {
        plan.primary_addressee_ref = targetRef;
        plan.intended_addressee_refs = [targetRef];
        plan.speech.response_expectation = {
          kind: 'answer', target_refs: [targetRef]
        };
      }
      return plan;
    }
  });

  assert.equal(exchange.npcCalls, 3);
  assert.equal(exchange.result.response_kind, 'route_disclosure');
  const next = projectPhase3Conversation({ state, contracts,
    result: exchange.result, inputDigest: digest('b') });
  assert.equal(next.route_knowledge.includes(
    contracts.disclosureMapping.route_knowledge_disclosure.route_ref), true);
});

test('leaving first responder does not end the remaining NPC conversation',
  async () => {
    const state = phase3State();
    const contracts = resolveContracts(state);
    const eremey = npcBySlot(state, 'eremey_fisher');
    const responder = npcBySlot(state, 'background_fisher_1');
    const exchange = await runPhase3({ state, contracts,
      rawText: 'Еремей и рыбак, что вы видели?', inputDigest: digest('4'),
      responseKind: (_request, callIndex) => callIndex === 1
        ? 'leave_conversation' : 'speech', playerPlanOptions: {
        primaryAddresseeRef: ref('npc', eremey.instance_id),
        intendedAddresseeRefs: [
          ref('npc', eremey.instance_id),
          ref('npc', responder.instance_id)
        ]
      } });

    assert.equal(exchange.npcCalls, 2);
    assert.equal(exchange.result.exchange.stop_reason, 'player_response');
    assert.equal(exchange.result.exact_elapsed_minutes, 5);
    const restarted = projectSemanticConversationSnapshot({
      state,
      semanticExchange: exchange.result,
      rootTurnId: 'turn:multi-npc:first-leaves',
      workingRevision: 0,
      appliedChangeSetId: 'change:multi-npc:first-leaves'
    });
    const session = restarted.conversation_sessions.at(-1);
    assert.equal(session.status, 'active');
    assert.deepEqual(session.active_participant_refs, [
      ref('npc', responder.instance_id),
      ref('player_character', state.actor_id)
    ]);
    const writeInput = buildNpcSemanticConversationWriteInput({
      state,
      next: restarted,
      semanticExchange: exchange.result
    });
    const writes = { inserts: [], updates: [], appends: [] };
    appendNpcSemanticConversationWrites({
      ...writes,
      partyId: state.party_id,
      changeSetId: 'change:multi-npc:first-leaves',
      idempotencyRecordId: 'idem:multi-npc:first-leaves',
      rootTurnId: 'turn:multi-npc:first-leaves',
      workingRevision: 0,
      ...writeInput
    });
    assert.equal((await assertLowerDvinaTraceSemanticConversationRows(
      semanticReadPool(writes), restarted
    )).length, 2);
  });

test('an intended NPC who did not perceive speech is not an active participant',
  async () => {
    const state = phase3State();
    const contracts = resolveContracts(state);
    const eremey = npcBySlot(state, 'eremey_fisher');
    const unheard = npcBySlot(state, 'background_fisher_1');
    unheard.machine_state = {
      ...unheard.machine_state,
      hearing_capability: 'none'
    };
    const eremeyRef = ref('npc', eremey.instance_id);
    const unheardRef = ref('npc', unheard.instance_id);
    const exchange = await runPhase3({
      state,
      contracts,
      rawText: 'Еремей и рыбак, что вы видели?',
      inputDigest: digest('5'),
      responseKind: 'speech',
      playerPlanOptions: {
        primaryAddresseeRef: eremeyRef,
        intendedAddresseeRefs: [eremeyRef, unheardRef]
      }
    });

    assert.equal(exchange.npcCalls, 1);
    const restarted = projectSemanticConversationSnapshot({
      state,
      semanticExchange: exchange.result,
      rootTurnId: 'turn:multi-npc:unheard-target',
      workingRevision: 0,
      appliedChangeSetId: 'change:multi-npc:unheard-target'
    });
    const session = restarted.conversation_sessions.at(-1);
    assert.deepEqual(session.active_participant_refs, [
      eremeyRef,
      ref('player_character', state.actor_id)
    ]);
  });

test('Phase 3 presents the actual ordinary NPC speaker, not Eremey', async () => {
  const state = phase3State();
  const contracts = resolveContracts(state);
  const fisher = npcBySlot(state, 'background_fisher_1');
  const exchange = await runPhase3({ state, contracts,
    rawText: 'Рыбак в буром кафтане, ответь мне.', inputDigest: digest('8'),
    responseKind: 'speech', targetActorId: fisher.instance_id });
  const visible = await createTracePhase3VisibleProjector({
    phase2Projector: { project() {
      throw new Error('Unexpected Phase 2 projection.');
    } },
    contracts
  }).project({ consequence: { phase3_kind: 'conversation', conversation: {
    npc_id: fisher.instance_id, semantic_exchange: exchange.result
  } } });

  assert.match(visible.visible_scene, /^Рыбак говорит:/u);
  assert.deepEqual(visible.visible_changes, ['Рыбак ответил.']);
  assert.equal(visible.visible_scene.includes('Еремей'), false);
  assert.equal(visible.visible_npc.find(({ entity_ref: ref }) =>
    ref.entity_id === fisher.instance_id).visible_status, 'говорит с вами');
  assert.equal(visible.visible_npc.find(({ display_label: label }) =>
    label === 'Еремей').visible_status, undefined);
});

test('second responder receives only the perceived part of the first reply',
  async () => {
    const state = phase3State();
    const contracts = resolveContracts(state);
    const eremey = npcBySlot(state, 'eremey_fisher');
    const responder = npcBySlot(state, 'background_fisher_1');
    responder.machine_state = {
      ...responder.machine_state,
      hearing_capability: 'partial'
    };
    const exchange = await runPhase3({ state, contracts,
      rawText: 'Еремей и рыбак, что вы видели?', inputDigest: digest('3'),
      responseKind: 'speech', playerPlanOptions: {
        primaryAddresseeRef: ref('npc', eremey.instance_id),
        intendedAddresseeRefs: [ref('npc', eremey.instance_id)]
      }, transformNpcPlan: (plan, { call_index: callIndex }) => {
        if (callIndex !== 1) return plan;
        const responderRef = ref('npc', responder.instance_id);
        plan.primary_addressee_ref = responderRef;
        plan.intended_addressee_refs = [responderRef];
        plan.speech.response_expectation = {
          kind: 'answer', target_refs: [responderRef]
        };
        return plan;
      } });
    const firstStatement = exchange.result.statements.find(
      ({ speaker_ref: speaker }) => speaker.entity_id === eremey.instance_id
    );
    const receivedFirstReply = exchange.npcRequests[1]
      .public_conversation_history.find(
        ({ source_statement_ref: statementRef }) =>
          statementRef?.entity_id === firstStatement.statement_id
      );

    assert.equal(receivedFirstReply.perception_result, 'perceived_partial');
    assert.equal(receivedFirstReply.utterance_text, null);
    assert.deepEqual(receivedFirstReply.claims, []);
  });

test('NPC response expectation creates one perceived follow-up responder',
  async () => {
    const state = phase3State();
    const contracts = resolveContracts(state);
    const eremey = npcBySlot(state, 'eremey_fisher');
    const responder = npcBySlot(state, 'background_fisher_1');
    const bystander = npcBySlot(state, 'background_fisher_2');
    const eremeyRef = ref('npc', eremey.instance_id);
    const responderRef = ref('npc', responder.instance_id);
    const exchange = await runPhase3({ state, contracts,
      rawText: 'Еремей, что ты видел?', inputDigest: digest('2'),
      responseKind: 'speech', playerPlanOptions: {
        primaryAddresseeRef: eremeyRef,
        intendedAddresseeRefs: [eremeyRef]
      }, transformNpcPlan: (plan, { call_index: callIndex }) => {
        if (callIndex !== 1) return plan;
        plan.primary_addressee_ref = responderRef;
        plan.intended_addressee_refs = [responderRef];
        plan.speech.response_expectation = {
          kind: 'answer',
          target_refs: [responderRef]
        };
        return plan;
      } });

    assert.equal(exchange.npcCalls, 2);
    assert.deepEqual(exchange.npcRequests.map(({ npc_ref: npcRef }) => npcRef),
      [eremeyRef, responderRef]);
    assert.equal(exchange.npcRequests.some(({ npc_ref: npcRef }) =>
      npcRef.entity_id === bystander.instance_id), false);
    const eremeyStatement = exchange.result.statements.find(
      ({ speaker_ref: speakerRef }) => speakerRef.entity_id === eremey.instance_id
    );
    assert.equal(exchange.npcRequests[1].public_conversation_history.some(
      ({ source_statement_ref: statementRef }) =>
        statementRef?.entity_id === eremeyStatement.statement_id), true);
    const followUpSignal = exchange.result.new_signal_records.find(
      ({ signal }) => signal.subject_ref.entity_id === responder.instance_id
        && signal.source_event_ref.entity_id === eremeyStatement.statement_id
    ).signal;
    assert.equal(followUpSignal.category, 'communication');
    assert.equal(followUpSignal.significance, 'material');
    assert.equal(exchange.result.consumed_signal_ids.includes(
      followUpSignal.signal_id), true);
  });

test('NPC A may decide again after NPC B creates a new causal batch',
  async () => {
    const state = phase3State();
    const contracts = resolveContracts(state);
    withAccessibleBlueWool(state, contracts);
    const eremey = npcBySlot(state, 'eremey_fisher');
    const responder = npcBySlot(state, 'background_fisher_1');
    const eremeyRef = ref('npc', eremey.instance_id);
    const responderRef = ref('npc', responder.instance_id);
    const exchange = await runPhase3({
      state,
      contracts,
      rawText: 'Еремей, спроси рыбака и ответь на его вопрос.',
      inputDigest: digest('a'),
      responseKind: 'speech',
      playerPlanOptions: {
        primaryAddresseeRef: eremeyRef,
        intendedAddresseeRefs: [eremeyRef],
        evidence: true
      },
      transformNpcPlan: (plan, { call_index: callIndex }) => {
        const targetRef = callIndex === 1
          ? responderRef : callIndex === 2 ? eremeyRef : null;
        if (targetRef === null) return plan;
        plan.primary_addressee_ref = targetRef;
        plan.intended_addressee_refs = [targetRef];
        plan.speech.response_expectation = {
          kind: 'answer', target_refs: [targetRef]
        };
        return plan;
      }
    });

    assert.equal(exchange.npcCalls, 3);
    assert.deepEqual(exchange.npcRequests.map(({ npc_ref: npcRef }) => npcRef),
      [eremeyRef, responderRef, eremeyRef]);
    assert.equal(new Set(exchange.npcRequests.map(
      ({ request_id: requestId }) => requestId)).size, 3);
    assert.equal(
      exchange.result.exchange.working_state.temporal_advance_results.length,
      exchange.result.exchange.contributions.length
    );
    assert.equal(exchange.result.exact_elapsed_minutes, 10);

    const projectedPhase3 = projectPhase3Conversation({
      state,
      contracts,
      result: exchange.result,
      inputDigest: digest('b')
    });
    assert.equal(projectedPhase3.conversation_statements.filter(
      ({ speaker_ref: speaker }) => speaker.entity_kind === 'npc'
    ).length, 3);

    const restarted = projectSemanticConversationSnapshot({
      state,
      semanticExchange: exchange.result,
      rootTurnId: 'turn:multi-npc:a-b-a',
      workingRevision: 0,
      appliedChangeSetId: 'change:multi-npc:a-b-a'
    });
    const writeInput = buildNpcSemanticConversationWriteInput({
      state,
      next: restarted,
      semanticExchange: exchange.result
    });
    const writes = { inserts: [], updates: [], appends: [] };
    appendNpcSemanticConversationWrites({
      ...writes,
      partyId: state.party_id,
      changeSetId: 'change:multi-npc:a-b-a',
      idempotencyRecordId: 'idem:multi-npc:a-b-a',
      rootTurnId: 'turn:multi-npc:a-b-a',
      workingRevision: 0,
      ...writeInput
    });
    const persisted = await assertLowerDvinaTraceSemanticConversationRows(
      semanticReadPool(writes), restarted
    );
    assert.equal(persisted.length, 3);
    assert.equal(new Set(persisted.map(({ request_id: requestId }) =>
      requestId)).size, 3);
    const consumedBoundarySignalIds = new Set(exchange.result.decisions.flatMap(
      ({ boundary }) => boundary.signal_refs.map(({ entity_id: id }) => id)));
    assert.equal(restarted.consumed_npc_decision_signal_ids.length,
      consumedBoundarySignalIds.size);

    const publicPayload = phase2ConversationPayload({
      state,
      optionId: contracts.ids.talkOption,
      check: null,
      activityRef: contracts.talk.profile_id,
      result: exchange.result
    });
    const projectedStatementRefs = publicPayload.last_turn.consequence
      .conversation.semantic_exchange_projection.statement_refs;
    assert.deepEqual(projectedStatementRefs, [ref(
      'conversation_statement',
      exchange.result.statements.filter(({ speaker_ref: speaker }) =>
        speaker.entity_id === eremey.instance_id).at(-1).statement_id
    )]);
    const visible = await createTracePhase3VisibleProjector({
      phase2Projector: { project: async () => null },
      contracts
    }).project({
      consequence: {
        phase3_kind: 'conversation',
        conversation: { semantic_exchange: exchange.result }
      }
    });
    assert.equal(visible.visible_scene,
      'Еремей говорит: «Я отвечу лишь на то, что сам видел.»');
  });

test('NPC A may perceive and react when NPC B deliberately stays silent',
  async () => {
    const state = phase3State();
    const contracts = resolveContracts(state);
    withAccessibleBlueWool(state, contracts);
    const eremey = npcBySlot(state, 'eremey_fisher');
    const responder = npcBySlot(state, 'background_fisher_1');
    const bystander = npcBySlot(state, 'background_fisher_2');
    const eremeyRef = ref('npc', eremey.instance_id);
    const responderRef = ref('npc', responder.instance_id);
    const exchange = await runPhase3({
      state,
      contracts,
      rawText: 'Еремей, спроси рыбака, почему он молчит.',
      inputDigest: digest('c'),
      responseKind: 'speech',
      playerPlanOptions: {
        primaryAddresseeRef: eremeyRef,
        intendedAddresseeRefs: [eremeyRef],
        evidence: true
      },
      transformNpcPlan: (plan, { call_index: callIndex }) => {
        if (callIndex === 1) {
          plan.primary_addressee_ref = responderRef;
          plan.intended_addressee_refs = [responderRef];
          plan.speech.response_expectation = {
            kind: 'answer', target_refs: [responderRef]
          };
        }
        if (callIndex === 2) {
          plan.contribution_kind = 'silence';
          plan.primary_addressee_ref = null;
          plan.intended_addressee_refs = [];
          plan.speech = null;
          plan.supporting_operations = [];
          plan.handoff = null;
        }
        return plan;
      }
    });

    assert.deepEqual(exchange.npcRequests.map(({ npc_ref: npcRef }) => npcRef),
      [eremeyRef, responderRef, eremeyRef]);
    const silence = exchange.result.exchange.contributions.find(
      ({ contribution_kind: contributionKind }) =>
        contributionKind === 'silence'
    );
    assert.equal(silence.nonverbal_audience.observations.some(
      ({ observer_ref: observerRef }) =>
        observerRef.entity_id === eremey.instance_id), true);
    assert.equal(silence.nonverbal_audience.observations.some(
      ({ observer_ref: observerRef }) =>
        observerRef.entity_id === bystander.instance_id), true);
    const silenceSignal = exchange.result.new_signal_records.find(
      ({ signal }) => signal.source_event_ref.entity_kind
        === 'conversation_contribution'
        && signal.source_event_ref.entity_id === silence.contribution_id
        && signal.subject_ref.entity_id === eremey.instance_id
    ).signal;
    assert.equal(silenceSignal.category, 'others');
    assert.equal(silenceSignal.significance, 'material');
    assert.equal(exchange.result.consumed_signal_ids.includes(
      silenceSignal.signal_id), true);
    assert.equal(exchange.npcRequests.some(({ npc_ref: npcRef }) =>
      npcRef.entity_id === bystander.instance_id), false);

    const restarted = projectSemanticConversationSnapshot({
      state,
      semanticExchange: exchange.result,
      rootTurnId: 'turn:multi-npc:silence',
      workingRevision: 0,
      appliedChangeSetId: 'change:multi-npc:silence'
    });
    const writeInput = buildNpcSemanticConversationWriteInput({
      state,
      next: restarted,
      semanticExchange: exchange.result
    });
    const unbackedInput = structuredClone(writeInput);
    const unbackedSilence = unbackedInput.contributions.find(
      ({ contribution_kind: contributionKind }) =>
        contributionKind === 'silence'
    );
    unbackedSilence.nonverbal_audience.observations =
      unbackedSilence.nonverbal_audience.observations.filter(
        ({ observer_ref: observerRef }) =>
          observerRef.entity_id !== eremey.instance_id
      );
    assert.throws(() => appendNpcSemanticConversationWrites({
      inserts: [], updates: [], appends: [],
      partyId: state.party_id,
      changeSetId: 'change:multi-npc:silence:unbacked',
      idempotencyRecordId: 'idem:multi-npc:silence:unbacked',
      rootTurnId: 'turn:multi-npc:silence:unbacked',
      workingRevision: 0,
      ...unbackedInput
    }), { code: 'NPC_SEMANTIC_CONVERSATION_PERSISTENCE_INVALID' });
    const duplicateObserverInput = structuredClone(writeInput);
    const duplicateObserverSilence = duplicateObserverInput.contributions.find(
      ({ contribution_kind: contributionKind }) =>
        contributionKind === 'silence'
    );
    duplicateObserverSilence.nonverbal_audience.observations[1].observer_ref =
      duplicateObserverSilence.nonverbal_audience.observations[0].observer_ref;
    assert.throws(() => appendNpcSemanticConversationWrites({
      inserts: [], updates: [], appends: [],
      partyId: state.party_id,
      changeSetId: 'change:multi-npc:silence:duplicate-observer',
      idempotencyRecordId: 'idem:multi-npc:silence:duplicate-observer',
      rootTurnId: 'turn:multi-npc:silence:duplicate-observer',
      workingRevision: 0,
      ...duplicateObserverInput
    }), { code: 'NPC_SEMANTIC_CONVERSATION_PERSISTENCE_INVALID' });
    const writes = { inserts: [], updates: [], appends: [] };
    appendNpcSemanticConversationWrites({
      ...writes,
      partyId: state.party_id,
      changeSetId: 'change:multi-npc:silence',
      idempotencyRecordId: 'idem:multi-npc:silence',
      rootTurnId: 'turn:multi-npc:silence',
      workingRevision: 0,
      ...writeInput
    });
    assert.equal((await assertLowerDvinaTraceSemanticConversationRows(
      semanticReadPool(writes), restarted
    )).length, 3);
  });

function resolveContracts(state) {
  return resolveTracePhase3Contracts({ state, bundle: revision14Bundle });
}

function npcBySlot(state, slot) {
  return state.npcs.find(({ participant_slot_ref: candidate }) =>
    candidate === slot);
}
