import assert from 'node:assert/strict';
import test from 'node:test';
import { addElapsedTime } from '@rus/time-events-history';
import { buildPhase4CheckRequest, promiseOfferStage } from
  '../src/runtime/lower-dvina-trace-phase-4-command-shared.js';
import { nextPhase4State } from
  '../src/infrastructure/postgres/lower-dvina-trace-phase-4-state.js';
import { appendSemanticNegotiation } from
  '../src/infrastructure/postgres/lower-dvina-trace-phase-4-write-projection-semantic.js';
import { resumedPendingConversationActivity } from
  '../src/infrastructure/postgres/lower-dvina-trace-pending-activity-state.js';
import {
  checkResult,
  digest,
  phase4ArrivalState,
  phase4Factual,
  ref,
  runPhase4
} from './lower-dvina-trace-m2-conversation-fixture.js';

test('checked player contribution resumes without another model or check',
  async () => {
    const { state, contracts } = phase4ArrivalState();
    state.promise_instances[0].created_change_set_id = 'change:phase4-arrival';
    const offerStage = promiseOfferStage(state, contracts);
    const checkRequest = buildPhase4CheckRequest(contracts.check, offerStage);
    const resolvedCheck = checkResult(contracts.check.check_id, 'success');
    state.temporal_boundary_candidates = [boundaryCandidate(
      state, plusMinutes(state.clock, '2')
    )];
    const first = await runPhase4({ state, contracts,
      rawText: 'Ратша, сдавайся, и я обещаю защиту.', inputDigest: digest('d'),
      responseKind: 'surrender', checkResult: resolvedCheck, checkRequest,
      offerStage, playerPlanOptions: { offer: true },
      resolveTemporalBoundary: hardInterrupt });
    assert.equal(first.playerCalls, 1);
    assert.equal(first.npcCalls, 0);
    assert.deepEqual(first.result.pending_player_execution.check_result,
      resolvedCheck);

    const factual = phase4Factual({ state, contracts, result: first.result,
      inputDigest: digest('d') });
    factual.consequence.negotiation.offer_stage = offerStage;
    factual.consequence.negotiation.check_request = checkRequest;
    factual.consequence.negotiation.check_result = resolvedCheck;
    factual.availability = { check_requests: [checkRequest] };
    const restarted = nextPhase4State({ state, factual,
      nextVersion: state.party_state.state_version + 1,
      turnNumber: state.party_state.turn_number + 1,
      inputDigest: digest('d'), changeSetId: 'change:checked-player-pause',
      contracts, rootTurnId: 'turn:checked-player-pause', workingRevision: 0 });
    assert.deepEqual(restarted.pending_player_conversation_execution
      .check_result, resolvedCheck);
    assert.equal(restarted.pending_player_conversation_execution.exchange_id,
      first.result.pending_player_execution.exchange_id);
    assert.equal(resumedPendingConversationActivity(restarted, {
      resumed_player_execution: { exchange_id:
        first.result.pending_player_execution.exchange_id }
    }).activity_state_version, 2);
    const writes = { inserts: [], updates: [], appends: [] };
    appendSemanticNegotiation({
      ...writes, partyId: state.party_id, state, next: restarted, factual,
      turnNumber: state.party_state.turn_number + 1,
      changeSetId: 'change:checked-player-pause',
      idemId: 'idem:checked-player-pause', contracts,
      rootTurnId: 'turn:checked-player-pause', workingRevision: 0
    });
    assert.deepEqual(writes.inserts.find(({ target_table: table }) =>
      table === 'party_timed_activity_executions').record
      .execution_context_snapshot.pending_player_execution.check_result,
    resolvedCheck);
    restarted.temporal_boundary_candidates = [];

    const resumed = await runPhase4({ state: restarted, contracts,
      rawText: 'Продолжить.', inputDigest: digest('e'), responseKind: 'surrender',
      checkResult: null, checkRequest: null, offerStage: null });
    assert.equal(resumed.playerCalls, 0);
    assert.equal(resumed.npcCalls, 1);
    assert.equal(resumed.result.exact_elapsed_minutes, 8);
    assert.equal(resumed.result.pending_player_execution, null);
    assert.equal(resumed.result.statements[0].utterance_text,
      'Ратша, сдавайся, и я обещаю защиту.');
    assert.deepEqual(resumed.result.social_delivery_result,
      first.result.social_delivery_result);
  });

test('player resume requires its persisted activity for commit CAS', () => {
  assert.throws(() => resumedPendingConversationActivity({
    pending_player_conversation_execution: null
  }, {
    resumed_player_execution: { exchange_id: 'exchange:missing-activity' }
  }), ({ message }) =>
    message === 'TRACE_M2_PENDING_CONVERSATION_ACTIVITY_INVALID');
});

function plusMinutes(timestamp, numerator) {
  return addElapsedTime(timestamp, {
    exact_minutes: { numerator, denominator: '1' }
  });
}

function boundaryCandidate(state, scheduledAt) {
  return {
    boundary_id: 'boundary:player-resume',
    boundary_kind: 'exact_timer', scheduled_at: scheduledAt,
    source_ref: ref('party_route_plan_execution_event', 'timer:player-resume'),
    primary_subject_ref: ref('actor', state.npcs[0].instance_id),
    subject_refs: [], scope_ref: ref('party', state.party_id),
    rule_ref: { entity_ref: ref('action_contract', 'rule:player-resume'),
      authoring_version: '1' },
    policy_ref: {
      entity_ref: ref('activity_contract', 'policy:player-resume'),
      authoring_version: '1'
    },
    preconditions_digest: digest('a'), resolution_class: 'execution_outcome',
    interrupt_effect: 'hard_interrupt',
    visibility_policy_ref: {
      entity_ref: ref('visibility_modifier', 'visible:player-resume'),
      authoring_version: '1'
    },
    idempotency_key: 'timer:player-resume:2', causal_parent_refs: []
  };
}

function hardInterrupt(_candidate, { projection }) {
  return { disposition: 'execute', proposals: [],
    state_projection: projection, follow_up_candidates: [],
    stop_after_current_batch: true };
}
