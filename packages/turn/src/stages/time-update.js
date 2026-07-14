import { buildTimeDrivenUpdateRequest } from '@rus/time-events-history';
import { freezeOutput } from './shared.js';

export function buildTimeUpdateStage({ retrievedState, consequence }) {
  const clock = retrievedState.clock_weather_light?.clock ?? retrievedState.clock ?? {};
  const state = {
    delayed_events: retrievedState.relevant_events ?? [],
    historical_events: retrievedState.historical_events ?? []
  };
  const update = buildTimeDrivenUpdateRequest(clock, consequence.duration_minutes ?? 0, state);
  return freezeOutput({ version: 1, schema: 'turn_time_update', ...update });
}
