import { deepFreeze } from '@rus/kernel';
import {
  compareRationalMinutes,
  normalizeElapsedTime,
  normalizeRationalMinutes
} from '@rus/time-events-history';
import {
  computeSpatialV3CanonicalDigest,
  createSpatialV3TypedError,
  validateSpatialV3Contract
} from '@rus/contracts/spatial-v3/registry';

export function record(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function stableId(value) {
  return typeof value === 'string' && value.trim() === value && value.length > 0;
}

export function positiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

export function exactKeys(value, expectedKeys) {
  if (!record(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  return actual.length === expected.length
    && actual.every((key, index) => key === expected[index]);
}

export function freeze(value) {
  return deepFreeze(structuredClone(value));
}

export function digest(value) {
  return computeSpatialV3CanonicalDigest(value);
}

export function sealedRecord(value) {
  if (!record(value) || typeof value.canonical_digest !== 'string') return false;
  const payload = Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'canonical_digest'));
  return value.canonical_digest === digest(payload);
}

export function valid(contractName, value) {
  return validateSpatialV3Contract(contractName, value).length === 0;
}

export function sameRef(left, right) {
  return left.entity_kind === right.entity_kind && left.entity_id === right.entity_id;
}

export function sameEndpoint(left, right) {
  return left.endpoint_kind === right.endpoint_kind && left.endpoint_id === right.endpoint_id;
}

export function dependencyPins(value) {
  return valid('dependency_pin_set', value) && sealedRecord(value);
}

export function pinned(pinSet, dependencyRole, reference) {
  return pinSet.pins.some((pin) => pin.dependency_role === dependencyRole
    && sameRef(pin.entity_ref, reference.entity_ref)
    && pin.version_pin.pin_kind === 'authoring_version'
    && pin.version_pin.authoring_version === reference.authoring_version);
}

export function typed(code, state, diagnostics = {}) {
  try {
    if (stableId(state?.party_id) && dependencyPins(state?.dependency_pins)) {
      return freeze({
        ok: false,
        status: 'hard_block',
        error: createSpatialV3TypedError(code, {
          subject_ref: { entity_kind: 'party', entity_id: state.party_id },
          dependency_pins: state.dependency_pins,
          diagnostics
        })
      });
    }
  } catch {
    // Invalid public state still returns a closed error code below.
  }
  return freeze({ ok: false, status: 'hard_block', error: { code, diagnostics } });
}

export function success(payload) {
  const resultPayload = { ok: true, ...payload };
  return freeze({ ...resultPayload, canonical_digest: digest(resultPayload) });
}

export function sameRational(left, right) {
  try {
    return compareRationalMinutes(normalizeRationalMinutes(left), normalizeRationalMinutes(right)) === 0;
  } catch {
    return false;
  }
}

export function isZeroRational(value) {
  try {
    return normalizeRationalMinutes(value).numerator === '0';
  } catch {
    return false;
  }
}

export function validElapsedTime(value) {
  try {
    normalizeElapsedTime(value);
    return true;
  } catch {
    return false;
  }
}
