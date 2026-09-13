import assert from 'node:assert/strict';
import test from 'node:test';
import { createTemporalAdvanceOwner, npcTemporalEffectRegistrations } from '@rus/turn/temporal-advance';
import { npcRoutineTemporalRegistration } from '../src/runtime/npc-routine-temporal.js';
import { lowerDvinaTracePhase7TemporalEffectRegistrations } from '../src/runtime/lower-dvina-trace-phase-7-temporal-effect-owner.js';
import { buildLowerDvinaTracePhase7Commit } from
  '../src/infrastructure/postgres/lower-dvina-trace-phase-7-commit.js';
import { assertPhase7NormalizedRows } from
  '../src/infrastructure/postgres/lower-dvina-trace-phase-7-read.js';
import { createTracePhase7BodyEffect } from
  '../src/runtime/lower-dvina-trace-phase-7-effects.js';
import { approvedPhase7Contracts as approvedContracts,
  phase7AutonomousPlan as autonomousPlan } from
  './lower-dvina-trace-phase-7-contract-fixture.js';
import { phase7Command as commandFor,
  phase7CommittedState as committedState,
  phase7PlayerInput as playerInput } from
  './lower-dvina-trace-phase-7-runtime-fixture.js';
import { addPhase7RoutineBoundary, factualTurn, phase7ReadPool, rows, visibleContext } from
  './lower-dvina-trace-phase-7-persistence-fixture.js';

const digest = 'a'.repeat(64);

test('Phase 7 commits prior routine changes before its NPC result and keeps later boundaries pending', async () => {
  for (const boundaryMinute of [120, 131]) {
    const state = committedState();
    const npc = addPhase7RoutineBoundary(state, boundaryMinute);
    const contracts = approvedContracts(state);
    const command = commandFor({ state, contracts,
      model: async (request) => autonomousPlan(request, 'move_bag'),
      temporalAdvanceOwner: createTemporalAdvanceOwner({
        source_registrations: [npcRoutineTemporalRegistration()],
        effect_registrations: [...npcTemporalEffectRegistrations(),
          ...lowerDvinaTracePhase7TemporalEffectRegistrations()]
      }) });
    const consequence = await command.consequence({ retrievedState: state,
      playerInput: playerInput(state, 'routine') });
    const timeUpdate = { clock_before: state.clock,
      clock_after: consequence.phase7.schedule_execution.clock_after,
      exact_elapsed: { exact_minutes: { numerator: '30', denominator: '1' } } };
    const bodyUpdate = createTracePhase7BodyEffect({ contracts, fallback: null })
      .apply({ committed_state: state, consequence, time_update: timeUpdate });
    const factual = factualTurn(state, consequence, timeUpdate, bodyUpdate);
    const commit = (candidate) => buildLowerDvinaTracePhase7Commit({
      partyId: state.party_id, factual: candidate, state, inputDigest: digest,
      visibleContext: visibleContext(), phase7Contracts: contracts });
    const { plan } = await commit(factual);
    const snapshot = rows(plan, 'party_state_snapshots')[0].record.state_payload;
    const persisted = rows(plan, 'party_npcs').find(({ id }) => id === npc.instance_id);
    const after = snapshot.npcs.find(({ instance_id: id }) => id === npc.instance_id);
    assert.deepEqual(persisted.record.machine_state, after.machine_state);
    assert.equal(after.machine_state.last_schedule_execution.status, 'executed');
    assert.equal(rows(plan, 'party_npc_runtime_transitions').length, boundaryMinute === 120 ? 1 : 0);
    assert.equal(snapshot.npc_schedule_runtime[0].causal_state_ref.routine_state.phase_index,
      boundaryMinute === 120 ? 1 : 0);
    if (boundaryMinute === 120) {
      assert.equal(after.machine_state.schedule_state, 'rest');
      const forged = structuredClone(factual);
      const transition = forged.consequence.phase7.temporal.result.combined_change_set.proposals
        .find((proposal) => proposal.npc_routine_transition)?.npc_routine_transition;
      transition.occurred_at = { whole_minutes: '131', subminute_numerator: '0', subminute_denominator: '1' };
      await assert.rejects(commit(forged), { code: 'TRACE_PHASE_7_TEMPORAL_WRITE_CONFLICT' });
    } else assert.equal(snapshot.temporal_boundary_candidates[0].scheduled_at.whole_minutes, '131');
  }
});

test('Phase 7 P16 persists decision, body and approved schedule atomically',
  async () => {
    const state = committedState();
    state.npc_semantic_decision_traces = [{ private_marker: 'private-plan' }];
    const contracts = approvedContracts(state);
    const command = commandFor({ state, contracts,
      model: async (request) => autonomousPlan(request, 'move_bag') });
    const consequence = await command.consequence({ retrievedState: state,
      playerInput: playerInput(state, 'persist') });
    const timeUpdate = { clock_before: state.clock,
      clock_after: consequence.phase7.schedule_execution.clock_after,
      exact_elapsed: { exact_minutes: { numerator: '30', denominator: '1' } } };
    const bodyUpdate = createTracePhase7BodyEffect({ contracts,
      fallback: { apply() { throw new Error('unexpected fallback'); } }
    }).apply({ committed_state: state, consequence, time_update: timeUpdate });
    const committed = await buildLowerDvinaTracePhase7Commit({
      partyId: state.party_id,
      factual: factualTurn(state, consequence, timeUpdate, bodyUpdate), state,
      inputDigest: digest, visibleContext: visibleContext(),
      phase7Contracts: contracts });
    const plan = committed.plan;
    assert.equal(plan.operation_kind, 'trace_phase_7_fire_rest');
    assert.equal(rows(plan, 'party_clocks').length, 1);
    assert.equal(rows(plan, 'party_timed_activity_attempts').length, 1);
    assert.equal(rows(plan, 'party_npc_decision_traces').length, 1);
    assert.equal(rows(plan, 'party_body_temporal_history').length, 1);
    assert.equal(rows(plan, 'party_npcs').length, 1);
    assert.equal(rows(plan, 'party_containers').length, 1);
    const trace = rows(plan, 'party_npc_decision_traces')[0].record;
    assert.equal(trace.decision_mode, 'autonomous');
    assert.equal(trace.semantic_request.schema, 'npc_action_decision_request_v1');
    assert.equal(trace.semantic_plan.schema, 'npc_step_plan_v1');
    const snapshot = rows(plan, 'party_state_snapshots')[0].record.state_payload;
    assert.equal(snapshot.phase7_fire_rest.exact_elapsed_minutes, 30);
    assert.equal(snapshot.phase7_fire_rest.schedule_option_id, 'move_bag');
    assert.equal(snapshot.clock.whole_minutes, '130');
    assert.equal(snapshot.containers[0].state.zone_ref, 'river_access');
    assert.equal(snapshot.npcs[1].machine_state.spatial_zone_ref, 'river_access');
    assert.equal(Object.hasOwn(snapshot, 'npc_semantic_decision_traces'), false);
    assert.equal(JSON.stringify(snapshot).includes('private-plan'), false);
    assert.equal(JSON.stringify(plan.visible_package_envelope)
      .includes('road_bag_new_location'), false);

    const pool = phase7ReadPool(plan, snapshot);
    await assert.doesNotReject(() => assertPhase7NormalizedRows(pool, snapshot));
    const tampered = structuredClone(snapshot);
    tampered.containers[0].state.zone_ref = 'storehouse_inside';
    await assert.rejects(() => assertPhase7NormalizedRows(pool, tampered),
      ({ code }) => code === 'TRACE_PHASE_2_SESSION_READ_INVALID');

    const forgedTracePlan = structuredClone(plan);
    const forgedCausality = rows(
      forgedTracePlan, 'party_timed_activity_attempts')[0].record.trace.causality;
    const forgedTraceRef = { entity_kind: 'npc_decision_trace',
      entity_id: 'unpersisted-request' };
    forgedCausality.decision_trace_ref = structuredClone(forgedTraceRef);
    forgedCausality.actor_step_completion_candidate.source_ref
      = structuredClone(forgedTraceRef);
    forgedCausality.actor_step_completion_candidate.causal_parent_refs
      = [structuredClone(forgedTraceRef)];
    await assert.rejects(() => assertPhase7NormalizedRows(
      phase7ReadPool(forgedTracePlan, snapshot), snapshot
    ), ({ code }) => code === 'TRACE_PHASE_2_SESSION_READ_INVALID');

    const scalarTamperedSnapshot = structuredClone(snapshot);
    const scalarTamperedPlan = structuredClone(plan);
    const candidateId = 'npc-waiting:substituted:zhdanko:terminal';
    const transitionId = `waiting-transition:${candidateId}`;
    const tamperedDecision = rows(
      scalarTamperedPlan, 'party_npc_decision_traces')[0].record;
    const signal = tamperedDecision.signal_records[0];
    const boundary = tamperedDecision.boundary_snapshot;
    const signalId =
      `decision-signal:npc_activity_factual_transition:${transitionId}:${
        signal.subject_ref.entity_id}:${signal.category}`;
    const batchId = 'temporal-batch:substituted';
    const boundaryId =
      `npc-decision:autonomous:${batchId}:${boundary.npc_ref.entity_id}`;
    scalarTamperedSnapshot.phase7_fire_rest.waiting_terminal_candidate_id
      = candidateId;
    scalarTamperedSnapshot.phase7_fire_rest.waiting_transition_id = transitionId;
    scalarTamperedSnapshot.phase7_fire_rest.decision_signal_id = signalId;
    scalarTamperedSnapshot.phase7_fire_rest.decision_boundary_id = boundaryId;
    const tamperedCausality = rows(
      scalarTamperedPlan, 'party_timed_activity_attempts')[0].record.trace.causality;
    tamperedCausality.waiting_terminal_candidate.boundary_id = candidateId;
    tamperedCausality.waiting_terminal_candidate.idempotency_key = candidateId;
    tamperedCausality.waiting_terminal_candidate_ref.entity_id = candidateId;
    tamperedCausality.waiting_transition.transition_id = transitionId;
    tamperedCausality.waiting_transition.source_candidate_ref.entity_id
      = candidateId;
    tamperedCausality.waiting_transition.causal_parent_refs[0].entity_id
      = candidateId;
    tamperedCausality.waiting_transition_ref.entity_id = transitionId;
    tamperedCausality.decision_signal_ref.entity_id = signalId;
    tamperedCausality.decision_boundary_ref.entity_id = boundaryId;
    signal.signal_id = signalId;
    signal.idempotency_key = signalId;
    signal.source_event_ref.entity_id = transitionId;
    signal.causal_parent_refs[0].entity_id = candidateId;
    boundary.same_time_batch_ref.entity_id = batchId;
    boundary.boundary_id = boundaryId;
    boundary.idempotency_key = boundaryId;
    boundary.signal_refs[0].entity_id = signalId;
    tamperedDecision.boundary_id = boundaryId;
    await assert.rejects(() => assertPhase7NormalizedRows(
      phase7ReadPool(scalarTamperedPlan, scalarTamperedSnapshot),
      scalarTamperedSnapshot
    ), ({ code }) => code === 'TRACE_PHASE_2_SESSION_READ_INVALID');
  });
