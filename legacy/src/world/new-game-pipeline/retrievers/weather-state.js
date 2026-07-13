import { validateWeatherState, WEATHER_STATE_SCHEMA } from '@rus/contracts/weather-state';
export { validateWeatherState, WEATHER_STATE_SCHEMA };
export async function retrieveWeatherState(input = {}, { resolver, provided = null } = {}) {
  const candidate = provided ?? (typeof resolver === 'function' ? await resolver(structuredClone(input)) : null);
  if (!candidate) {
    const error = new Error('weather_state_retriever requires a provided weather_state or resolver.');
    error.semanticRecoveryRoute = { repair_kind:'retrieval', return_to_stage:'weather_state_retriever', rerun_from_stage:17, reason_code:'WEATHER_STATE_MISSING' };
    throw error;
  }
  const concerns = validateWeatherState(candidate);
  if (concerns.length > 0) {
    const error = new Error('weather_state_retriever returned invalid weather_state.');
    error.lifecycle = { stage_id:17, stage_slug:'weather_state_retriever', failed_gate:'structural_validation', concerns, terminal_status:'stage_failed' };
    error.semanticRecoveryRoute = { repair_kind:'retrieval', return_to_stage:'weather_state_retriever', rerun_from_stage:17, reason_code:'WEATHER_STATE_INVALID' };
    throw error;
  }
  return structuredClone(candidate);
}
