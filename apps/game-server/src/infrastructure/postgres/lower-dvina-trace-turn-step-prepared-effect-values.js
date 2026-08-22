import { plain } from './lower-dvina-trace-turn-step-persistence-support.js';
import { preparedEffectFail, samePreparedValue } from
  './lower-dvina-trace-turn-step-prepared-effect-authority.js';

export function samePreparedTimeBase(expected, actual) {
  return ['version', 'schema', 'owner', 'clock_before', 'clock_after',
    'exact_elapsed', 'nearest_boundary', 'boundary_trace',
    'prepared_effect_ledger_digest', 'prepared_effect_ledger']
    .every((key) => samePreparedValue(expected[key], actual?.[key]));
}

export function mergePreparedRecord(left, right) {
  if (!plain(left) || !plain(right)) {
    preparedEffectFail('prepared consequence record is invalid');
  }
  const output = structuredClone(left);
  for (const [key, value] of Object.entries(right)) {
    if (Object.hasOwn(output, key)
        && !samePreparedValue(output[key], value)) {
      preparedEffectFail(`prepared consequence record conflicts on ${key}`);
    }
    output[key] = structuredClone(value);
  }
  return output;
}
