import assert from 'node:assert/strict';
import test from 'node:test';
import { appendBoundaryIntervals } from
  '../src/infrastructure/postgres/first-playable/plan-boundary-intervals.js';
import { persistLocalTraversalInterval } from
  '../src/infrastructure/postgres/first-playable/traversal-interval.js';

test('first-playable boundary intervals identify their travel state', () => {
  const appends = [];
  appendBoundaryIntervals({
    appends,
    intervals: [{
      elapsed_minutes: 15,
      planned_minutes: 15,
      progress_before_ppm: 0,
      planned_progress_after_ppm: 1_000_000,
      actual_progress_after_ppm: 1_000_000,
      result_kind: 'segment_completed',
      result_code: 'completed',
      check: null,
      condition_snapshot: null,
      consequence: null
    }],
    partyId: 'party',
    executionId: 'execution',
    travelStateId: 'travel-state',
    stepOrdinal: 0,
    suffix: 'attempt',
    segment: { segment_ref: { entity_id: 'line' } },
    command: { verb: 'move' },
    state: { exact_pins: {} },
    changeSet: 'change',
    idemId: 'idem',
    turnNumber: 1,
    cumulativeElapsed: 0
  });

  assert.equal(appends[0].record.travel_state_id, 'travel-state');
});

test('first-playable local interval INSERT carries its travel state id', async () => {
  let query;
  let values;
  await persistLocalTraversalInterval({
    query: async (sql, args) => { query = sql; values = args; }
  }, {
    state: { exact_pins: {} },
    traversal: { success: true, elapsed_minutes: 15 },
    partyId: 'party',
    intervalId: 'interval',
    executionId: 'execution',
    travelStateId: 'travel-state',
    changeSet: 'change',
    turnNumber: 1,
    idemId: 'idem'
  });

  assert.match(query, /occurred_at_turn,travel_state_id/u);
  assert.equal(values.at(-1), 'travel-state');
});
