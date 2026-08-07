import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveTracePhase7ScheduleTemporalAdvance } from
  '../src/runtime/lower-dvina-trace-phase-7-schedule-temporal.js';

const at = (minutes) => ({
  whole_minutes: String(minutes),
  subminute_numerator: '0',
  subminute_denominator: '1'
});

function baseActorStep() {
  return {
    started_at: at(125),
    result: { npc_ref: 'zhdanko-1' },
    working_projection: {
      active_npc_actor_step: {
        npc_ref: 'zhdanko-1',
        status: 'started',
        planned_exact_elapsed: {
          exact_minutes: { numerator: '5', denominator: '1' }
        },
        semantic_operation: { op: 'request_activity' },
        decision_trace_ref: {
          entity_kind: 'npc_semantic_decision_trace',
          entity_id: 'trace-1'
        }
      },
      cumulative_elapsed_minutes: 25
    }
  };
}

function baseTemporal() {
  return {
    execution_id: 'exec-1',
    limit_timestamp: at(130),
    result: {
      temporal_status: 'paused',
      clock_after: at(125),
      trace: { processed_boundary_ids: ['wait-terminal'] }
    }
  };
}

test('external interrupting boundary returns paused without TEMPORAL_INTERRUPTED',
  () => {
    const advanced = resolveTracePhase7ScheduleTemporalAdvance({
      state: {
        party_id: 'party-1',
        party_state: { turn_number: 7, state_version: 7 },
        clock: at(100),
        temporal_boundary_candidates: [{
          boundary_id: 'external-interrupt',
          scheduled_at: at(127)
        }]
      },
      temporal: baseTemporal(),
      actorStep: baseActorStep(),
      temporalAdvanceOwner: {
        advance: () => ({
          result: {
            temporal_status: 'paused',
            clock_before: at(125),
            clock_after: at(127)
          },
          state_projection: {
            cumulative_elapsed_minutes: 27,
            active_npc_actor_step: {
              npc_ref: 'zhdanko-1',
              status: 'started'
            }
          }
        })
      },
      commandIdempotencyKey: 'idem-1'
    });
    assert.equal(advanced.result.temporal_status, 'paused');
    assert.equal(advanced.elapsed_after_decision, 2);
  });

test('uninterrupted schedule advance still requires completed T+30 path', () => {
  assert.throws(() => resolveTracePhase7ScheduleTemporalAdvance({
    state: {
      party_id: 'party-1',
      party_state: { turn_number: 7, state_version: 7 },
      clock: at(100),
      temporal_boundary_candidates: []
    },
    temporal: baseTemporal(),
    actorStep: baseActorStep(),
    temporalAdvanceOwner: {
      advance: () => ({
        result: {
          temporal_status: 'completed',
          clock_before: at(125),
          clock_after: at(128)
        },
        state_projection: {
          cumulative_elapsed_minutes: 28,
          active_npc_actor_step: {
            npc_ref: 'zhdanko-1',
            status: 'started'
          }
        }
      })
    },
    commandIdempotencyKey: 'idem-2'
  }), ({ code }) => code === 'TRACE_PHASE_7_SCHEDULE_TEMPORAL_INTERRUPTED');

  const ok = resolveTracePhase7ScheduleTemporalAdvance({
    state: {
      party_id: 'party-1',
      party_state: { turn_number: 7, state_version: 7 },
      clock: at(100),
      temporal_boundary_candidates: []
    },
    temporal: baseTemporal(),
    actorStep: baseActorStep(),
    temporalAdvanceOwner: {
      advance: () => ({
        result: {
          temporal_status: 'completed',
          clock_before: at(125),
          clock_after: at(130)
        },
        state_projection: {
          cumulative_elapsed_minutes: 30,
          active_npc_actor_step: {
            npc_ref: 'zhdanko-1',
            status: 'completed',
            completed_at: at(130)
          }
        }
      })
    },
    commandIdempotencyKey: 'idem-3'
  });
  assert.equal(ok.result.temporal_status, 'completed');
  assert.equal(ok.elapsed_after_decision, 5);
});
