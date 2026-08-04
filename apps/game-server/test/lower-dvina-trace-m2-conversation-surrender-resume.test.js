import assert from 'node:assert/strict';
import test from 'node:test';
import { addElapsedTime } from '@rus/time-events-history';
import { appendSemanticNegotiation } from
  '../src/infrastructure/postgres/lower-dvina-trace-phase-4-write-projection-semantic.js';
import { nextPhase4State } from
  '../src/infrastructure/postgres/lower-dvina-trace-phase-4-state.js';
import { promiseOfferStage } from
  '../src/runtime/lower-dvina-trace-phase-4-command-shared.js';
import { assertLowerDvinaTraceSemanticConversationRows } from
  '../src/infrastructure/postgres/lower-dvina-trace-semantic-conversation-read.js';
import { semanticReadPool } from
  './lower-dvina-trace-semantic-persistence-read-pool.js';
import { digest, phase4ArrivalState, ref, runPhase4 } from
  './lower-dvina-trace-m2-conversation-fixture.js';

test('interrupted NPC surrender resumes after reload without another LLM call',
  async () => {
    const { state, contracts } = phase4ArrivalState();
    state.promise_instances[0].created_change_set_id = 'change:phase4-arrival';
    const offerStage = promiseOfferStage(state, contracts);
    state.temporal_boundary_candidates = [boundaryCandidate(
      state, plusMinutes(state.clock, '7')
    )];
    const exchange = await runPhase4({ state, contracts,
      rawText: 'Ратша, сдавайся.', inputDigest: digest('f'),
      responseKind: 'surrender', checkResult: null, checkRequest: null,
      offerStage, playerPlanOptions: { offer: true },
      resolveTemporalBoundary: interruptResolution });
    assert.equal(exchange.result.exchange.time_budget.status, 'paused');
    assert.equal(exchange.result.surrender, null);

    const factual = phase4Factual(state, contracts, exchange.result,
      offerStage, 'interrupted-npc-surrender');
    const restarted = nextPhase4State({ state, factual,
      nextVersion: state.party_state.state_version + 1,
      turnNumber: state.party_state.turn_number + 1,
      inputDigest: digest('f'), changeSetId: 'change:interrupted-surrender',
      contracts, rootTurnId: 'turn:interrupted-surrender', workingRevision: 0 });
    assert.equal(restarted.ratsha_surrendered, undefined);
    assert.equal(restarted.promise_instances[0].current_state, 'offered');
    const writes = semanticWrites({ state, next: restarted, factual, contracts,
      suffix: 'interrupted-surrender' });
    assert.equal(JSON.stringify(writes).includes(
      'ratsha_surrender_without_further_harm_committed'), false);
    restarted.npc_semantic_decision_traces =
      await assertLowerDvinaTraceSemanticConversationRows(
        semanticReadPool(writes), restarted
      );
    restarted.temporal_boundary_candidates = [];

    const resumedOfferStage = promiseOfferStage(restarted, contracts);
    const resumed = await runPhase4({ state: restarted, contracts,
      rawText: 'Продолжить.', inputDigest: digest('0'),
      responseKind: 'speech', checkResult: null, checkRequest: null,
      offerStage: resumedOfferStage });
    assert.equal(resumed.playerCalls, 0);
    assert.equal(resumed.npcCalls, 0);
    assert.equal(resumed.result.exact_elapsed_minutes, 3);
    assert.equal(resumed.result.response_kind, 'surrender');
    const resumedFactual = phase4Factual(restarted, contracts, resumed.result,
      resumedOfferStage, 'resumed-npc-surrender');
    const completed = nextPhase4State({ state: restarted,
      factual: resumedFactual,
      nextVersion: restarted.party_state.state_version + 1,
      turnNumber: restarted.party_state.turn_number + 1,
      inputDigest: digest('0'), changeSetId: 'change:resumed-surrender',
      contracts, rootTurnId: 'turn:resumed-surrender', workingRevision: 0 });
    assert.equal(completed.ratsha_surrendered, true);
    assert.equal(completed.promise_instances[0].current_state, 'active');
    const resumedWrites = semanticWrites({ state: restarted, next: completed,
      factual: resumedFactual, contracts, suffix: 'resumed-surrender' });
    assert.equal(resumedWrites.appends.filter(({ target_table: table }) =>
      table === 'party_npc_decision_traces').length, 0);
    assert.equal(resumedWrites.updates.some(({ target_table: table, id }) =>
      table === 'party_timed_activity_executions'
        && id === restarted.pending_npc_conversation_execution
          .activity_execution_id), true);
    assert.equal(resumedWrites.appends.filter(({ target_table: table }) =>
      table === 'party_timed_activity_attempts')[0].record
      .actual_time_numerator, 3);
  });

function semanticWrites({ state, next, factual, contracts, suffix }) {
  const writes = { inserts: [], updates: [], appends: [] };
  appendSemanticNegotiation({ ...writes, partyId: state.party_id, state, next,
    factual, turnNumber: state.party_state.turn_number + 1,
    changeSetId: `change:${suffix}`, idemId: `idem:${suffix}`, contracts,
    rootTurnId: `turn:${suffix}`, workingRevision: 0 });
  return writes;
}

function plusMinutes(timestamp, numerator) {
  return addElapsedTime(timestamp, {
    exact_minutes: { numerator, denominator: '1' }
  });
}

function boundaryCandidate(state, scheduledAt) {
  return {
    boundary_id: 'boundary:conversation-interruption',
    boundary_kind: 'exact_timer', scheduled_at: scheduledAt,
    source_ref: ref('party_route_plan_execution_event',
      'timer:conversation-interruption'),
    primary_subject_ref: ref('actor', state.npcs[0].instance_id),
    subject_refs: [], scope_ref: ref('party', state.party_id),
    rule_ref: { entity_ref: ref('action_contract',
      'rule:conversation-interruption'), authoring_version: '1' },
    policy_ref: { entity_ref: ref('activity_contract',
      'policy:conversation-interruption'), authoring_version: '1' },
    preconditions_digest: digest('a'), resolution_class: 'execution_outcome',
    interrupt_effect: 'hard_interrupt',
    visibility_policy_ref: { entity_ref: ref('visibility_modifier',
      'visible:conversation-interruption'), authoring_version: '1' },
    idempotency_key: 'timer:conversation-interruption:2',
    causal_parent_refs: []
  };
}

function interruptResolution(_candidate, { projection }) {
  return { disposition: 'execute', proposals: [],
    state_projection: projection, follow_up_candidates: [],
    stop_after_current_batch: true };
}

function phase4Factual(state, contracts, semanticExchange, offerStage, suffix) {
  const duration = semanticExchange.exact_elapsed_minutes;
  return {
    player_input: { request_id: `request:${suffix}`,
      idempotency_key: `idempotency:${suffix}`,
      raw_text: semanticExchange.statements[0]?.utterance_text
        ?? 'interrupted conversation contribution' },
    mode_resolution: { turn_id: `turn:${suffix}`,
      option_id: contracts.ids.negotiationOption,
      decision_trace: { action_set_digest: `action-set:${suffix}` } },
    time_update: { clock_before: structuredClone(state.clock),
      clock_after: structuredClone(semanticExchange.clock_after),
      exact_elapsed: { exact_minutes: {
        numerator: String(duration), denominator: '1' } } },
    consequence: { phase4_kind: 'negotiation', negotiation: {
      activity_ref: contracts.negotiation.profile_id,
      offer_committed_before_check: true,
      offer_stage: structuredClone(offerStage),
      check_request: null, check_result: null, outcome_ref: null,
      semantic_exchange: semanticExchange,
      response_kind: null,
      participating_fisher_id:
        contracts.actors.participating_fisher.instance_id,
      promise_state: 'offer_only', objective_fact_outputs: [],
      player_response_boundary: null,
      activity_roots: [{ activity_ref: contracts.negotiation.profile_id,
        duration_minutes: semanticExchange.exchange.time_budget.total_minutes }]
    } }
  };
}
