import test from 'node:test';
import assert from 'node:assert/strict';
import { activeHistoricalPhases, addMinutes, buildTimeDrivenUpdateRequest, dueTimers } from '../src/index.js';

test('time-events-history advances clock and selects already approved due records', () => {
  const next = addMinutes({ day:2, hour:23, minute:50 }, 20);
  assert.deepEqual([next.day,next.hour,next.minute], [3,0,10]);
  const timers = [{ id:'x', due_at_minutes:next.total_minutes, status:'scheduled' }];
  assert.equal(dueTimers(next, timers)[0].id, 'x');
  const phases = activeHistoricalPhases(next, [{ id:'h', phases:[{ id:'background', start_at_minutes:0 }, { id:'impact', start_at_minutes:next.total_minutes }] }]);
  assert.equal(phases[0].phase.id, 'impact');
  assert.equal(buildTimeDrivenUpdateRequest({ day:0 }, 60, {}).duration_minutes, 60);
});
