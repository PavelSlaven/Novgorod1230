import assert from 'node:assert/strict';
import test from 'node:test';
import {
  startedHistoricalEventIds,
  startedHistoricalEventsAndPhases
} from '../src/started-historical.js';

test('future phase stays hidden until party clock reaches start', () => {
  const events = [{
    id: 'event:posadnik-change',
    phases: [
      { id: 'background', start_at_minutes: 0 },
      { id: 'impact', start_at_minutes: 10_000 }
    ]
  }];
  const before = startedHistoricalEventsAndPhases(
    { whole_minutes: '100', subminute_numerator: '0', subminute_denominator: '1' },
    events);
  assert.equal(before.length, 1);
  assert.equal(before[0].phase.id, 'background');
  assert.deepEqual(startedHistoricalEventIds(
    { whole_minutes: '100', subminute_numerator: '0', subminute_denominator: '1' },
    events), ['event:posadnik-change']);

  const noneYet = startedHistoricalEventsAndPhases(
    { whole_minutes: '50', subminute_numerator: '0', subminute_denominator: '1' },
    [{ id: 'event:famine', phases: [{ id: 'start', start_at_minutes: 200 }] }]);
  assert.deepEqual(noneYet, []);
  assert.deepEqual(startedHistoricalEventIds(
    { whole_minutes: '50', subminute_numerator: '0', subminute_denominator: '1' },
    [{ id: 'event:famine', phases: [{ id: 'start', start_at_minutes: 200 }] }]), []);

  const after = startedHistoricalEventsAndPhases(
    { total_minutes: 10_000 }, events);
  assert.equal(after[0].phase.id, 'impact');
});
