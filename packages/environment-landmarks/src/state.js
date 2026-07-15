import { EnvironmentFeatureError } from './errors.js';
import { requiredObject, text } from './utils.js';

export function normalizeState(value) {
  requiredObject(value, 'environment_state');
  if (!Number.isInteger(value.state_version) || value.state_version < 0) throw new EnvironmentFeatureError('ENVIRONMENT_STATE_INVALID', 'environment_state.state_version must be a non-negative integer.');
  const state = { state_version: value.state_version };
  for (const key of ['baselines', 'landmarks', 'cues', 'traces', 'applied_update_keys']) {
    if (!Array.isArray(value[key])) throw new EnvironmentFeatureError('ENVIRONMENT_STATE_INVALID', `environment_state.${key} must be an array.`);
    state[key] = structuredClone(value[key]);
  }
  if (new Set(state.applied_update_keys).size !== state.applied_update_keys.length || state.applied_update_keys.some((key) => !text(key))) {
    throw new EnvironmentFeatureError('ENVIRONMENT_STATE_INVALID', 'environment_state.applied_update_keys must be unique non-empty strings.');
  }
  return state;
}
