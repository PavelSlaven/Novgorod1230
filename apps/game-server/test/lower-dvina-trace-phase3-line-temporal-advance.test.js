import assert from 'node:assert/strict';
import test from 'node:test';
import { createTracePhase3TemporalAdvance } from
  '../src/runtime/lower-dvina-trace-phase-3-effects.js';

const clockBefore = {
  whole_minutes: '10',
  subminute_numerator: '0',
  subminute_denominator: '1'
};
const clockAfter = {
  whole_minutes: '10',
  subminute_numerator: '1',
  subminute_denominator: '3'
};
const elapsed = { numerator: '1', denominator: '3' };
const inputFor = (after = clockAfter, duration = elapsed) => ({
  clock_before: clockBefore,
  exact_elapsed: { exact_minutes: duration },
  relevant_state: {
    temporal_boundary_candidates: [{
      boundary_id: 'npc-routine:boundary-1',
      scheduled_at: after,
      boundary_kind: 'routine'
    }]
  },
  consequence: {
    phase3_kind: 'movement',
    position_transition: {
      owner: '@rus/turn/spatial-v3-site-connection-traversal'
    },
    spatial_v3_traversal: {
      clock_update: {
        actual_elapsed: elapsed,
        world_time_before: clockBefore,
        world_time_after: after
      }
    }
  }
});

test('line clock passes exact rational window and boundary candidates to Phase 2', async () => {
  let received;
  const phase2Result = {
    clock_before: clockBefore,
    clock_after: clockAfter,
    exact_elapsed: { exact_minutes: elapsed },
    nearest_boundary: { scheduled_at: clockAfter,
      boundary_ids: ['npc-routine:boundary-1'] },
    boundary_trace: { processed_boundary_ids: ['npc-routine:boundary-1'] }
  };
  const advance = createTracePhase3TemporalAdvance({
    async phase2Advance(input) {
      received = input;
      return phase2Result;
    }
  });

  const result = await advance(inputFor());

  assert.equal(received.exact_elapsed.exact_minutes.numerator, '1');
  assert.equal(received.exact_elapsed.exact_minutes.denominator, '3');
  assert.deepEqual(received.relevant_state.temporal_boundary_candidates,
    inputFor().relevant_state.temporal_boundary_candidates);
  assert.deepEqual(result, phase2Result,
    'the exact-matching Phase 2 result, including boundary processing, is returned');
});

test('line clock rejects a Phase 2 result with a different exact clock', async () => {
  const advance = createTracePhase3TemporalAdvance({
    async phase2Advance() {
      return {
        clock_after: { ...clockAfter, subminute_numerator: '2' },
        exact_elapsed: { exact_minutes: elapsed }
      };
    }
  });

  await assert.rejects(advance(inputFor()),
    { code: 'TRACE_PHASE_3_TEMPORAL_STATE_INVALID' });
});

test('line window resolves a real due NPC routine through Phase 2 temporal owner', async () => {
  const { createTemporalAdvanceOwner, npcTemporalEffectRegistrations } =
    await import('@rus/turn/temporal-advance');
  const { createTracePhase2TemporalAdvance } =
    await import('../src/runtime/lower-dvina-trace-phase-2-temporal.js');
  const { npcRoutineTemporalRegistration } =
    await import('../src/runtime/npc-routine-temporal.js');
  const { lowerDvinaTracePhase6TemporalEffectRegistrations } =
    await import('../src/runtime/lower-dvina-trace-phase-6-temporal-effect-owner.js');
  const { lowerDvinaTracePhase7TemporalEffectRegistrations } =
    await import('../src/runtime/lower-dvina-trace-phase-7-temporal-effect-owner.js');
  const { addPhase7RoutineBoundary } =
    await import('./lower-dvina-trace-phase-7-persistence-fixture.js');
  const { phase7CommittedState } =
    await import('./lower-dvina-trace-phase-7-runtime-fixture.js');

  const state = phase7CommittedState();
  const npc = addPhase7RoutineBoundary(state, 120);
  state.temporal_source_proof = {
    version: 2,
    schema: 'lower_dvina_trace_temporal_source_proof',
    owner: '@rus/time-events-history/temporal-boundaries',
    same_time_cascade_owner:
      '@rus/time-events-history/temporal-boundaries:resolveSameTimeCascade',
    admission_policy: 'pass_exact_candidates_to_temporal_activity_owner',
    pending_event_count: 0,
    active_schedule_count: 1,
    candidate_count: state.temporal_boundary_candidates.length,
    candidates: structuredClone(state.temporal_boundary_candidates)
  };
  const temporalOwner = createTemporalAdvanceOwner({
    source_registrations: [npcRoutineTemporalRegistration()],
    effect_registrations: [
      ...npcTemporalEffectRegistrations(),
      ...lowerDvinaTracePhase6TemporalEffectRegistrations(),
      ...lowerDvinaTracePhase7TemporalEffectRegistrations()
    ]
  });
  const phase2Advance = createTracePhase2TemporalAdvance({
    contracts: { activity: {
      nearest_temporal_boundary_rule: 'split_before_earliest_boundary'
    } },
    temporalAdvanceOwner: temporalOwner
  });
  const clockAfter = { ...clockBefore, whole_minutes: '130' };
  const lineElapsed = { numerator: '30', denominator: '1' };
  const advance = createTracePhase3TemporalAdvance({ phase2Advance });

  const result = await advance({
    clock_before: state.clock,
    exact_elapsed: { exact_minutes: lineElapsed },
    relevant_state: state,
    consequence: {
      phase3_kind: 'movement',
      position_transition: {
        owner: '@rus/turn/spatial-v3-site-connection-traversal'
      },
      spatial_v3_traversal: {
        clock_update: {
          actual_elapsed: lineElapsed,
          world_time_before: state.clock,
          world_time_after: clockAfter
        }
      }
    }
  });

  assert.deepEqual(result.clock_after, clockAfter);
  assert.deepEqual(result.exact_elapsed.exact_minutes, lineElapsed);
  const transitions = result.temporal_results[0].combined_change_set.proposals
    .map(({ npc_routine_transition: transition }) => transition)
    .filter(Boolean);
  assert.equal(transitions.length, 1);
  assert.equal(transitions[0].npc_id, npc.instance_id);
  assert.deepEqual(transitions[0].occurred_at,
    state.temporal_boundary_candidates[0].scheduled_at);
  assert.deepEqual(result.boundary_trace.processed_boundary_ids,
    [state.temporal_boundary_candidates[0].boundary_id]);
});
