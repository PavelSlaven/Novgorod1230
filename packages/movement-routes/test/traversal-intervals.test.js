import assert from 'node:assert/strict';
import test from 'node:test';
import { planExactTraversalIntervals } from '../src/index.js';

const rational = (numerator, denominator = '1') => ({ numerator, denominator });

test('exact traversal intervals split 100 minutes at 30-minute boundaries', () => {
  const result = planExactTraversalIntervals({ total_time: rational('100'), fixed_time_interval: rational('30') });
  assert.deepEqual(result.intervals.map((interval) => interval.planned_time),
    [rational('30'), rational('30'), rational('30'), rational('10')]);
  assert.deepEqual(result.intervals.map((interval) => [
    interval.cumulative_progress_before_ppm, interval.cumulative_progress_after_ppm
  ]), [[0, 300_000], [300_000, 600_000], [600_000, 900_000], [900_000, 1_000_000]]);
});

test('exact traversal intervals retain rational remainder and floor cumulative ppm', () => {
  const result = planExactTraversalIntervals({ total_time: rational('45', '2'), fixed_time_interval: rational('15') });
  assert.deepEqual(result.intervals.map((interval) => interval.planned_time),
    [rational('15'), rational('15', '2')]);
  assert.deepEqual(result.intervals.map((interval) => interval.cumulative_progress_after_ppm),
    [666_666, 1_000_000]);
});

test('exact traversal intervals keep global floor ppm across replanned slices', () => {
  let distanceRemaining = rational('1', '2');
  const progress = [];
  for (const total_time of [rational('100'), rational('70'), rational('40'), rational('10')]) {
    const interval = planExactTraversalIntervals({ total_time,
      fixed_time_interval: rational('30'), distance_remaining: distanceRemaining }).intervals[0];
    progress.push([interval.cumulative_progress_before_ppm,
      interval.cumulative_progress_after_ppm]);
    distanceRemaining = interval.distance_remaining_after;
  }
  assert.deepEqual(progress, [[500_000, 650_000], [650_000, 800_000],
    [800_000, 950_000], [950_000, 1_000_000]]);
  assert.deepEqual(distanceRemaining, rational('0'));
});

test('exact one-third progress floors to 333333 ppm', () => {
  const result = planExactTraversalIntervals({ total_time: rational('3'),
    fixed_time_interval: rational('1') });
  assert.deepEqual(result.intervals.map((interval) => interval.cumulative_progress_after_ppm),
    [333_333, 666_666, 1_000_000]);
});

test('exact traversal planner multiplies base minutes by rational factors', () => {
  const result = planExactTraversalIntervals({ base_minutes: rational('20'),
    factors: [rational('3', '2'), rational('3'), rational('1')],
    fixed_time_interval: rational('30') });
  assert.deepEqual(result.intervals.map((interval) => interval.planned_time),
    [rational('30'), rational('30'), rational('30')]);
  assert.deepEqual(result.intervals.map((interval) => interval.cumulative_progress_after_ppm),
    [333_333, 666_666, 1_000_000]);
});

test('traversal shorter than the recheck interval remains one exact slice', () => {
  const result = planExactTraversalIntervals({ total_time: rational('7'), fixed_time_interval: rational('30') });
  assert.equal(result.intervals.length, 1);
  assert.equal(result.intervals[0].planned_time.numerator, '7');
  assert.equal(result.intervals[0].cumulative_progress_after_ppm, 1_000_000);
});

test('zero and negative traversal durations return the typed duration error', () => {
  for (const [total_time, fixed_time_interval] of [
    [rational('0'), rational('30')],
    [rational('7'), rational('0')],
    [rational('-1'), rational('30')],
    [rational('7'), rational('-1')]
  ]) {
    assert.throws(() => planExactTraversalIntervals({ total_time, fixed_time_interval }), {
      name: 'TypeError', code: 'TRAVERSAL_INTERVAL_DURATION_INVALID'
    });
  }
});
