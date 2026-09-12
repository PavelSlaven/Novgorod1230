import { deepFreeze, sha256 } from '@rus/kernel';
import { compareRationalMinutes, normalizeElapsedTime, normalizeGameTimestamp,
  subtractGameTimestamp } from '@rus/time-events-history';
import { turnFailure } from './errors.js';

export const LEDGER_SCHEMA = 'turn_step_prepared_effect_ledger_v1';
export const SLICE_SCHEMA = 'turn_step_prepared_effect_slice_v1';
const EFFECT_KINDS = new Set(['domain_command', 'semantic_activity']);
const RAW_KEYS = new Set(['step_index', 'effect_kind', 'owner_ref',
  'operation_ref', 'availability', 'consequence', 'time_update', 'body_update',
  'body_state_before']);
const SLICE_KEYS = new Set(['version', 'schema', 'ordinal', 'step_index',
  'effect_kind', 'owner_ref', 'operation_ref', 'availability', 'consequence',
  'time_update', 'body_update', 'body_state_before_digest',
  'projection_before_digest', 'projection_after_digest',
  'previous_slice_digest', 'slice_digest']);
export const LEDGER_KEYS = new Set(['version', 'schema', 'root_turn_id',
  'committed_state_version', 'slices', 'ledger_digest']);

export function requireRawEffect(value) {
  const raw = requireObject(value, 'prepared effect');
  if (!exactKeys(raw, RAW_KEYS) || !Number.isSafeInteger(raw.step_index)
      || raw.step_index < 1 || raw.step_index > 8
      || !EFFECT_KINDS.has(raw.effect_kind)
      || !text(raw.owner_ref) || !text(raw.operation_ref)
      || (raw.effect_kind === 'domain_command') !== (raw.availability != null)
      || !plain(raw.consequence) || !plain(raw.time_update)
      || raw.time_update.schema !== 'turn_time_update'
      || !validBodyUpdate(raw.body_update) || !plain(raw.body_state_before)) {
    invalid('Prepared effect has an invalid exact contract.');
  }
  validateEffectState(raw);
  return raw;
}
export function requirePreparedRequest(value) {
  const request = requireObject(value, 'prepared effect request');
  const keys = new Set(['effect_kind', 'owner_ref', 'operation_ref',
    'availability', 'consequence']);
  if (!exactKeys(request, keys) || !EFFECT_KINDS.has(request.effect_kind)
      || !text(request.owner_ref) || !text(request.operation_ref)
      || (request.effect_kind === 'domain_command') !== (request.availability != null)
      || !plain(request.consequence)) {
    invalid('Prepared effect request has an invalid exact contract.');
  }
  return request;
}
export function advanceWorkingClock(value, clockAfter) {
  const projection = requireObject(value, 'working projection');
  return { ...projection, clock: structuredClone(clockAfter),
    ...(plain(projection.clock_weather_light) ? { clock_weather_light: {
      ...projection.clock_weather_light, clock: structuredClone(clockAfter)
    } } : {}) };
}
export function validateSlice(slice, { ordinal, rootTurnId,
  committedStateVersion, previous }) {
  if (!exactKeys(slice, SLICE_KEYS) || slice.version !== 1
      || slice.schema !== SLICE_SCHEMA || slice.ordinal !== ordinal
      || !Number.isSafeInteger(slice.step_index)
      || slice.step_index < 1 || slice.step_index > 8
      || (previous != null && slice.step_index < previous.step_index)
      || !EFFECT_KINDS.has(slice.effect_kind)
      || !text(slice.owner_ref) || !text(slice.operation_ref)
      || (slice.effect_kind === 'domain_command') !== (slice.availability != null)
      || !plain(slice.consequence) || !plain(slice.time_update)
      || slice.time_update.schema !== 'turn_time_update'
      || !validBodyUpdate(slice.body_update)
      || ![slice.body_state_before_digest, slice.projection_before_digest,
        slice.projection_after_digest, slice.previous_slice_digest,
        slice.slice_digest].every(digest)) {
    invalid('Prepared effect slice has an invalid exact contract.', { ordinal });
  }
  validateEffectState(slice);
  if (previous != null && compareRationalMinutes(
    previous.time_update.exact_elapsed.exact_minutes,
    exactMinutes(previous.consequence.duration_minutes).exact_minutes) !== 0) {
    invalid('An interrupted prepared effect must end the chain.');
  }
  const expectedPrevious = previous?.slice_digest ?? sha256({
    schema: 'turn_step_prepared_effect_chain_seed_v1', root_turn_id: rootTurnId,
    committed_state_version: committedStateVersion,
    projection_before_digest: slice.projection_before_digest,
    body_state_before_digest: slice.body_state_before_digest,
    clock_before: slice.time_update.clock_before
  });
  const { slice_digest: actual, ...payload } = slice;
  if (slice.previous_slice_digest !== expectedPrevious
      || previous != null && (slice.body_state_before_digest
        !== sha256(previous.body_update.state_after)
        || !same(slice.time_update.clock_before, previous.time_update.clock_after))
      || sha256(payload) !== actual) {
    invalid('Prepared effect slice chain or digest is invalid.', { ordinal });
  }
}
function validateEffectState(effect) {
  const duration = requireIntegralDuration(effect.consequence.duration_minutes);
  assertExactWindow({ clockBefore: effect.time_update.clock_before,
    clockAfter: effect.time_update.clock_after,
    exactElapsed: effect.time_update.exact_elapsed },
  `prepared effect ${effect.step_index}`);
  const exact = normalizeElapsedTime(effect.time_update.exact_elapsed);
  const planned = exactMinutes(duration).exact_minutes;
  const comparison = compareRationalMinutes(exact.exact_minutes, planned);
  const interrupted = comparison < 0
    && effect.effect_kind === 'semantic_activity'
    && effect.time_update.temporal_results?.some((result) =>
      result.trace?.stopped_after_current_batch === true);
  if (comparison > 0 || (comparison !== 0 && !interrupted)) {
    invalid('Prepared effect consequence and exact time differ.', {
      step_index: effect.step_index });
  }
  if (effect.body_update.applied !== true
      && effect.body_state_before_digest != null
      && effect.body_state_before_digest !== sha256(effect.body_update.state_after)) {
    invalid('A non-applied body slice changed body state.', {
      step_index: effect.step_index });
  }
  if (Object.hasOwn(effect, 'body_state_before')
      && effect.body_update.applied !== true
      && !same(effect.body_state_before, effect.body_update.state_after)) {
    invalid('A non-applied body effect changed body state.', {
      step_index: effect.step_index });
  }
}
function validBodyUpdate(value) {
  return plain(value) && value.schema === 'turn_body_update'
    && typeof value.applied === 'boolean' && plain(value.state_after)
    && (value.applied === true ? plain(value.proposal) : value.proposal === null);
}
export function assertExactWindow({ clockBefore, clockAfter, exactElapsed }, label) {
  try {
    const before = normalizeGameTimestamp(clockBefore);
    const after = normalizeGameTimestamp(clockAfter);
    const elapsed = normalizeElapsedTime(exactElapsed);
    const actual = subtractGameTimestamp(after, before);
    if (compareRationalMinutes(actual, elapsed.exact_minutes) !== 0) {
      invalid(`${label} exact elapsed differs from its clock window.`);
    }
  } catch (cause) {
    if (cause?.code === 'TURN_STEP_PREPARED_EFFECT_INVALID') throw cause;
    invalid(`${label} has an invalid exact clock window.`, { cause: cause?.message });
  }
}
function requireIntegralDuration(value) {
  const number = Number(value ?? 0);
  if (!Number.isSafeInteger(number) || number < 0) {
    invalid('Prepared effect duration must be a non-negative integer.');
  }
  return number;
}
export function exactMinutes(value) {
  return { exact_minutes: { numerator: String(value), denominator: '1' } };
}
export function rationalAsNumber(value) {
  const normalized = normalizeElapsedTime({ exact_minutes: value }).exact_minutes;
  const result = Number(normalized.numerator) / Number(normalized.denominator);
  if (!Number.isFinite(result) || result < 0) {
    invalid('Prepared exact elapsed cannot be represented for presentation.');
  }
  return result;
}
export function requireObject(value, label) {
  if (!plain(value)) invalid(`${label} must be a JSON object.`);
  try { return structuredClone(value); }
  catch { invalid(`${label} must be detached JSON data.`); }
}
export function exactKeys(value, keys) {
  return plain(value) && Object.keys(value).length === keys.size
    && Object.keys(value).every((key) => keys.has(key));
}
export function same(left, right) { return sha256(left) === sha256(right); }
export function plain(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
export function text(value) {
  return typeof value === 'string' && value.trim() === value && value.length > 0;
}
export function digest(value) {
  return typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
}
export function invalid(message, details = {}) {
  throw turnFailure('TURN_STEP_PREPARED_EFFECT_INVALID', message, details);
}
