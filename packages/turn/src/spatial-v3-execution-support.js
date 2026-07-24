import {
  addElapsedTime,
  compareRationalMinutes,
  countCrossedWholeMinuteBoundaries,
  wholeMinuteIndex
} from '@rus/time-events-history';
import {
  computeSpatialV3CanonicalDigest,
  createSpatialV3TypedError
} from '@rus/contracts/spatial-v3/registry';
import { normalized } from './spatial-v3-execution-validation.js';

export const clone = (value) => structuredClone(value);
export const zero = () => ({ numerator: '0', denominator: '1' });
export const sameRational = (left, right) => compareRationalMinutes(left, right) === 0;
export const timestampEqual = (left, right) => left?.whole_minutes === right?.whole_minutes &&
  left?.subminute_numerator === right?.subminute_numerator && left?.subminute_denominator === right?.subminute_denominator;

export function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

export function sealed(payload) {
  return deepFreeze({ ...payload, canonical_digest: computeSpatialV3CanonicalDigest(payload) });
}

export function payloadOf(value) {
  return Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'canonical_digest'));
}

export function typedError(code, diagnostics = {}) {
  const pins = [{
    dependency_role: 'source_authoring',
    entity_ref: { entity_kind: 'world_revision', entity_id: 'target' },
    version_pin: { pin_kind: 'authoring_version', authoring_version: '4.3.0-target.1', state_version: null }
  }];
  return deepFreeze({
    ok: false,
    error: createSpatialV3TypedError(code, {
      subject_ref: { entity_kind: 'party_route_plan_execution', entity_id: diagnostics.execution_id || 'execution' },
      dependency_pins: { pins, canonical_digest: computeSpatialV3CanonicalDigest(pins).replace('sha256:', '') },
      diagnostics
    })
  });
}

export function exactClockUpdate(before, elapsed) {
  const after = addElapsedTime(before, { exact_minutes: elapsed });
  return deepFreeze({
    world_time_after: after,
    whole_minute_index: wholeMinuteIndex(after),
    crossed_whole_minute_boundaries: countCrossedWholeMinuteBoundaries(before, after)
  });
}

export function replayRecord(replays, kind, input) {
  const key = `${kind}:${input.party_id}:${input.idempotency_key}`;
  const inputDigest = computeSpatialV3CanonicalDigest(input);
  const previous = replays.get(key);
  if (previous && previous.input_digest !== inputDigest) return typedError('idempotency_conflict', { execution_id: input.execution_id });
  return previous ? deepFreeze({ ...clone(previous.result), replayed: true }) : { key, input_digest: inputDigest };
}

export function rationalFields(prefix, value) {
  const fraction = normalized(value);
  return { [`${prefix}_numerator`]: fraction.numerator, [`${prefix}_denominator`]: fraction.denominator };
}
