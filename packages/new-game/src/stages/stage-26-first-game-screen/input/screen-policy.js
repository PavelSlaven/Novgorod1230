import { REQUIRED_SCREEN_POLICY } from '../policy/constants.js';
import { deepFreeze, isObject, safeClone } from '../shared/utils.js';

export function normalizeStage26ScreenPolicy(additionalPolicy = {}) {
  if (!isObject(additionalPolicy)) throw new Error('Stage 26 screen policy must be an object.');
  for (const [key, required] of Object.entries(REQUIRED_SCREEN_POLICY)) {
    if (Object.hasOwn(additionalPolicy, key) && additionalPolicy[key] !== required) {
      throw new Error(`Stage 26 screen policy cannot weaken required invariant: ${key}.`);
    }
  }
  return deepFreeze({ ...REQUIRED_SCREEN_POLICY, ...safeClone(additionalPolicy) });
}
