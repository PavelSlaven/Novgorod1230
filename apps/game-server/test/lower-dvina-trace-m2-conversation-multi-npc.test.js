import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveTracePhase3Contracts } from
  '../src/runtime/lower-dvina-trace-phase-3-contracts.js';
import {
  digest,
  phase3State,
  ref,
  revision14Bundle,
  runPhase3
} from './lower-dvina-trace-m2-conversation-fixture.js';

test('terminal first responder does not spend the remaining NPC slot',
  async () => {
    const state = phase3State();
    const contracts = resolveContracts(state);
    const eremey = npcBySlot(state, 'eremey_fisher');
    const responder = npcBySlot(state, 'background_fisher_1');
    const exchange = await runPhase3({ state, contracts,
      rawText: 'Еремей и рыбак, что вы видели?', inputDigest: digest('4'),
      responseKind: 'leave_conversation', playerPlanOptions: {
        primaryAddresseeRef: ref('npc', eremey.instance_id),
        intendedAddresseeRefs: [
          ref('npc', eremey.instance_id),
          ref('npc', responder.instance_id)
        ]
      } });

    assert.equal(exchange.npcCalls, 1);
    assert.equal(exchange.result.exchange.stop_reason, 'session_ended');
    assert.equal(exchange.result.exact_elapsed_minutes, 4);
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

function resolveContracts(state) {
  return resolveTracePhase3Contracts({ state, bundle: revision14Bundle });
}

function npcBySlot(state, slot) {
  return state.npcs.find(({ participant_slot_ref: candidate }) =>
    candidate === slot);
}
