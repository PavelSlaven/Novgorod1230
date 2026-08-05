import assert from 'node:assert/strict';
import test from 'node:test';
import { addElapsedTime } from '@rus/time-events-history';
import { buildNpcSemanticDecisionTrace } from '@rus/npc-runtime';
import { appendSemanticNegotiation } from
  '../src/infrastructure/postgres/lower-dvina-trace-phase-4-write-projection-semantic.js';
import { promiseOfferStage } from
  '../src/runtime/lower-dvina-trace-phase-4-command-shared.js';
import { digest, phase4ArrivalState, phase4Factual,
  projectPhase4Negotiation, ref, runPhase4 } from
  './lower-dvina-trace-m2-conversation-fixture.js';

test('Phase 4 exact-end resume persists without more time or LLM', async () => {
  const { state, contracts } = phase4ArrivalState();
  state.promise_instances[0].created_change_set_id = 'change:phase4-arrival';
  state.temporal_boundary_candidates = [boundaryCandidate(
    state, addElapsedTime(state.clock, {
      exact_minutes: { numerator: '10', denominator: '1' }
    })
  )];
  const offerStage = promiseOfferStage(state, contracts);
  const first = await runPhase4({ state, contracts,
    rawText: 'Ратша, сдавайся — я обещаю тебе защиту.',
    inputDigest: digest('0'), responseKind: 'speech',
    checkResult: null, checkRequest: null, offerStage,
    playerPlanOptions: { offer: true },
    resolveTemporalBoundary: hardInterrupt });
  assert.equal(first.npcCalls, 1);
  assert.equal(first.result.pending_npc_execution.remaining_minutes, 0);
  const projected = projectPhase4Negotiation({ state, contracts,
    result: first.result, inputDigest: digest('0') });
  const firstWrites = persist(state, projected, contracts, first.result,
    'phase4-exact-first');
  assert.equal(firstWrites.appends.some(({ target_table: table }) =>
    table === 'party_npc_decision_traces'), true);
  projected.npc_semantic_decision_traces = first.result.decisions.map(
    ({ request, proposal }) => buildNpcSemanticDecisionTrace({ request,
      plan: proposal.plan, root_turn_id: 'turn:phase4-exact-first',
      working_revision: 0,
      applied_change_set_id: 'change:phase4-exact-first',
      status: 'committed' }));
  projected.temporal_boundary_candidates = [];

  const resumed = await runPhase4({ state: projected, contracts,
    rawText: 'Продолжить.', inputDigest: digest('1'),
    responseKind: 'bargain', checkResult: null, checkRequest: null,
    offerStage: null });
  assert.equal(resumed.playerCalls, 0);
  assert.equal(resumed.npcCalls, 0);
  assert.equal(resumed.result.exact_elapsed_minutes, 0);
  assert.equal(resumed.result.pending_npc_execution, null);
  const completed = projectPhase4Negotiation({ state: projected, contracts,
    result: resumed.result, inputDigest: digest('1') });
  assert.equal(completed.pending_npc_conversation_execution, undefined);
  const resumedWrites = persist(projected, completed, contracts,
    resumed.result, 'phase4-exact-resume');
  assert.equal(resumedWrites.updates.some(({ target_table: table }) =>
    table === 'party_timed_activity_executions'), true);
});

function persist(state, next, contracts, result, suffix) {
  const factual = phase4Factual({ state, contracts, result,
    inputDigest: digest(suffix === 'phase4-exact-first' ? '0' : '1') });
  factual.consequence.negotiation.offer_committed_before_check =
    result.offer_stage !== null;
  const writes = { inserts: [], updates: [], appends: [] };
  appendSemanticNegotiation({ ...writes, partyId: state.party_id,
    state, next, factual,
    turnNumber: state.party_state.turn_number + 1,
    changeSetId: `change:${suffix}`, idemId: `idem:${suffix}`, contracts,
    rootTurnId: `turn:${suffix}`, workingRevision: 0 });
  return writes;
}

function boundaryCandidate(state, scheduledAt) {
  return {
    boundary_id: 'boundary:phase4-exact-end',
    boundary_kind: 'exact_timer', scheduled_at: scheduledAt,
    source_ref: ref('party_route_plan_execution_event',
      'timer:phase4-exact-end'),
    primary_subject_ref: ref('actor', state.npcs[0].instance_id),
    subject_refs: [], scope_ref: ref('party', state.party_id),
    rule_ref: { entity_ref: ref('action_contract', 'rule:phase4-exact-end'),
      authoring_version: '1' },
    policy_ref: { entity_ref: ref('activity_contract',
      'policy:phase4-exact-end'), authoring_version: '1' },
    preconditions_digest: digest('a'), resolution_class: 'execution_outcome',
    interrupt_effect: 'hard_interrupt',
    visibility_policy_ref: { entity_ref: ref('visibility_modifier',
      'visible:phase4-exact-end'), authoring_version: '1' },
    idempotency_key: 'timer:phase4-exact-end', causal_parent_refs: []
  };
}

function hardInterrupt(_candidate, { projection }) {
  return { disposition: 'execute', proposals: [], state_projection: projection,
    follow_up_candidates: [], stop_after_current_batch: true };
}
