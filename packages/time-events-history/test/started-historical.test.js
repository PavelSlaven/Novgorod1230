import assert from 'node:assert/strict';
import test from 'node:test';
import {
  StartedHistoricalError,
  startedHistoricalEventIds,
  startedHistoricalEventsAndPhases
} from '../src/started-historical.js';

const ts = (m) => ({
  whole_minutes: String(m), subminute_numerator: '0', subminute_denominator: '1'
});

test('future phase stays hidden until party clock reaches start', () => {
  const events = [{
    id: 'event:posadnik-change',
    phases: [
      { id: 'background', start_at_minutes: 0 },
      { id: 'impact', start_at_minutes: 10_000 }
    ]
  }];
  const before = startedHistoricalEventsAndPhases(ts(100), events);
  assert.equal(before.length, 1);
  assert.equal(before[0].phase.id, 'background');
  assert.deepEqual(startedHistoricalEventIds(ts(100), events),
    ['event:posadnik-change']);

  const noneYet = startedHistoricalEventsAndPhases(ts(50),
    [{ id: 'event:famine', phases: [{ id: 'start', start_at_minutes: 200 }] }]);
  assert.deepEqual(noneYet, []);
  assert.deepEqual(startedHistoricalEventIds(ts(50),
    [{ id: 'event:famine', phases: [{ id: 'start', start_at_minutes: 200 }] }]),
  []);

  const after = startedHistoricalEventsAndPhases(
    { total_minutes: 10_000 }, events);
  assert.equal(after[0].phase.id, 'impact');
});

test('N-1 invalid start_at_minutes never opens at minute 0', () => {
  for (const bad of [null, '', false, '0', undefined]) {
    assert.deepEqual(startedHistoricalEventIds(ts(100), [{
      id: 'event:leaky',
      phases: [{ id: 'start', start_at_minutes: bad }]
    }]), []);
  }
});

test('N-2 v3 start_at compared via GameTimestamp', () => {
  const events = [{
    id: 'event:famine-v3',
    phases: [{ id: 'start', start_at: ts(200), end_at: ts(400),
      phase_id: 'start', status: 'scheduled', event_ref: 'event:famine-v3',
      scope_ref: 'world', applicability: {}, source_refs: [], provenance_refs: [],
      local_effect_rule_ref: 'r', boundary_policy_ref: 'b',
      visibility_policy_ref: 'v', interrupt_effect: 'notice',
      allow_derived_visible_effects: false, dependency_pins: {},
      canonical_digest: 'd' }]
  }];
  // Only start_at is read by started-historical; extra v3 fields ignored.
  const slim = [{
    id: 'event:famine-v3',
    phases: [{ id: 'start', start_at: ts(200) }]
  }];
  assert.deepEqual(startedHistoricalEventIds(ts(100), slim), []);
  assert.deepEqual(startedHistoricalEventIds(ts(200), slim),
    ['event:famine-v3']);
  assert.deepEqual(startedHistoricalEventIds(ts(250), events),
    ['event:famine-v3']);
});

test('N-2 invalid clock is StartedHistoricalError', () => {
  assert.throws(() => startedHistoricalEventIds('nope', []),
    (err) => err instanceof StartedHistoricalError
      && err.code === 'STARTED_HISTORICAL_CLOCK_INVALID');
});
