import { buildTimeDrivenUpdateRequest } from '@rus/time-events-history/legacy';
import { addElapsedTime } from '@rus/time-events-history';
import { freezeOutput } from './shared.js';

export async function buildTimeUpdateStage({
  retrievedState,
  consequence,
  temporalAdvance = null
}) {
  const clock = retrievedState.clock_weather_light?.clock ?? retrievedState.clock ?? {};
  const duration = consequence.duration_minutes ?? 0;
  if (typeof temporalAdvance === 'function') {
    const result = await temporalAdvance({
      clock_before: structuredClone(clock),
      exact_elapsed: {
        exact_minutes: {
          numerator: String(duration),
          denominator: '1'
        }
      },
      relevant_state: structuredClone(retrievedState),
      consequence: structuredClone(consequence)
    });
    if (!result?.clock_after) {
      const error = new Error('Temporal owner did not return exact clock_after.');
      error.code = 'TURN_TEMPORAL_ADVANCE_INVALID';
      throw error;
    }
    return freezeOutput({
      version: 2,
      schema: 'turn_time_update',
      owner: '@rus/time-events-history',
      ...structuredClone(result)
    });
  }
  if (typeof clock?.whole_minutes === 'string') {
    return freezeOutput({
      version: 2,
      schema: 'turn_time_update',
      owner: '@rus/time-events-history',
      clock_before: structuredClone(clock),
      clock_after: addElapsedTime(clock, {
        exact_minutes: {
          numerator: String(duration),
          denominator: '1'
        }
      }),
      exact_elapsed: {
        exact_minutes: {
          numerator: String(duration),
          denominator: '1'
        }
      },
      nearest_boundary: null
    });
  }
  const state = {
    delayed_events: retrievedState.relevant_events ?? [],
    historical_events: retrievedState.historical_events ?? []
  };
  const update = buildTimeDrivenUpdateRequest(clock, duration, state);
  return freezeOutput({ version: 1, schema: 'turn_time_update', ...update });
}
