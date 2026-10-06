import assert from 'node:assert/strict';
import test from 'node:test';
import { addElapsedTime } from '@rus/time-events-history';
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
    duration_minutes: 1 / 3,
    movement: { cost_kind: 'time' },
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

  await assert.rejects(advance(inputFor()), (error) => {
    assert.equal(error.code, 'TRACE_PHASE_3_TEMPORAL_STATE_INVALID');
    assert.match(error.message, /"duration_minutes":0\.3333333333333333/u);
    assert.match(error.message, /"root_elapsed":\{"numerator":"1","denominator":"3"\}/u);
    assert.match(error.message, /"root_clock_before":\{"whole_minutes":"10","subminute_numerator":"0","subminute_denominator":"1"\}/u);
    assert.doesNotMatch(error.message, /actor|party|player|input|request/u);
    return true;
  });
});

test('legacy action traversal without a clock proof keeps the local clock unchanged', async () => {
  const advance = createTracePhase3TemporalAdvance({
    async phase2Advance() {
      assert.fail('legacy action traversal must not advance the clock through Phase 2');
    }
  });
  const input = inputFor(
    clockBefore,
    { numerator: '0', denominator: '1' }
  );
  input.consequence.duration_minutes = 0;
  input.consequence.movement = { cost_kind: 'action' };
  input.consequence.spatial_v3_traversal = {
    plan: { classification: 'legacy_generated' },
    result: { status: 'arrived' }
  };

  const result = await advance(input);

  assert.deepEqual(result.clock_before, clockBefore);
  assert.deepEqual(result.clock_after, clockBefore);
  assert.deepEqual(result.exact_elapsed, input.exact_elapsed);
});

test('timed line rejects a traversal proof that differs from the root turn', async () => {
  const advance = createTracePhase3TemporalAdvance({
    async phase2Advance() {
      assert.fail('mismatched traversal proof must be rejected before Phase 2');
    }
  });
  const input = inputFor();
  input.consequence.spatial_v3_traversal.clock_update.actual_elapsed = {
    numerator: '2', denominator: '3'
  };

  await assert.rejects(advance(input), (error) => {
    assert.equal(error.code, 'TRACE_PHASE_3_TEMPORAL_STATE_INVALID');
    assert.match(error.message, /Timed line clock proof does not match/u);
    return true;
  });
});

test('timed line without a clock update is rejected as invalid temporal state', async () => {
  const advance = createTracePhase3TemporalAdvance({
    async phase2Advance() {
      assert.fail('missing timed proof must be rejected before Phase 2');
    }
  });
  const input = inputFor();
  delete input.consequence.spatial_v3_traversal.clock_update;

  await assert.rejects(advance(input), (error) => {
    assert.equal(error.code, 'TRACE_PHASE_3_TEMPORAL_STATE_INVALID');
    assert.match(error.message, /Timed line clock proof does not match/u);
    return true;
  });
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
  const temporalEngine = createTemporalAdvanceOwner({
    source_registrations: [npcRoutineTemporalRegistration()],
    effect_registrations: [
      ...npcTemporalEffectRegistrations(),
      ...lowerDvinaTracePhase6TemporalEffectRegistrations(),
      ...lowerDvinaTracePhase7TemporalEffectRegistrations()
    ]
  });
  let phase6Projection;
  const phase2Advance = createTracePhase2TemporalAdvance({
    contracts: { activity: {
      nearest_temporal_boundary_rule: 'split_before_earliest_boundary'
    } },
    temporalAdvanceOwner: {
      advance(input) {
        const result = temporalEngine.advance(input);
        phase6Projection = result.state_projection;
        return result;
      }
    }
  });
  const lineElapsed = { numerator: '91', denominator: '3' };
  const clockAfter = addElapsedTime(state.clock, {
    exact_minutes: lineElapsed
  });
  const advance = createTracePhase3TemporalAdvance({ phase2Advance });

  const result = await advance({
    clock_before: state.clock,
    exact_elapsed: { exact_minutes: lineElapsed },
    relevant_state: state,
    consequence: {
      phase3_kind: 'movement',
      movement: { cost_kind: 'time' },
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
  assert.deepEqual(phase6Projection.cumulative_elapsed_minutes,
    lineElapsed);
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
