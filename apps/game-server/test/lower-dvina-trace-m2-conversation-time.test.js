import assert from 'node:assert/strict';
import test from 'node:test';
import { addElapsedTime } from '@rus/time-events-history';
import { projectConversationTemporalAdvance } from
  '../src/runtime/lower-dvina-trace-m2-conversation-time.js';
import { phase3State, ref } from
  './lower-dvina-trace-m2-conversation-fixture.js';

test('conversation temporal projection preserves owner order and exact nearest batch', () => {
  const clockBefore = phase3State().clock;
  const at = (minutes) => addElapsedTime(clockBefore, {
    exact_minutes: { numerator: minutes, denominator: '1' }
  });
  const earlier = at('2');
  const later = at('4');
  const projected = projectConversationTemporalAdvance({
    clockBefore,
    semanticExchange: {
      exact_elapsed_minutes: 5,
      clock_after: at('5'),
      temporal_boundary_refs: [
        ref('temporal_boundary_candidate', 'z-earlier'),
        ref('temporal_boundary_candidate', 'a-later')
      ]
    },
    candidates: [
      { boundary_id: 'a-later', scheduled_at: later },
      { boundary_id: 'z-earlier', scheduled_at: earlier }
    ],
    roots: []
  });

  assert.deepEqual(projected.boundary_trace.processed_boundary_ids,
    ['z-earlier', 'a-later']);
  assert.deepEqual(projected.nearest_boundary, {
    scheduled_at: earlier,
    boundary_ids: ['z-earlier']
  });
});
