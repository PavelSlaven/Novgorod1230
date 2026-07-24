import { deepFreeze } from '@rus/kernel';
import {
  computeSpatialV3CanonicalDigest,
  createSpatialV3TypedError,
  validateSpatialV3Contract
} from '@rus/contracts/spatial-v3/registry';
import { normalizeGameTimestamp } from '@rus/time-events-history';

export function record(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function stableId(value) {
  return typeof value === 'string' && value.trim() === value && value.length > 0;
}

export function exactKeys(value, expectedKeys) {
  if (!record(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  return actual.length === expected.length
    && actual.every((key, index) => key === expected[index]);
}

export function allowedKeys(value, allowed, required) {
  return record(value)
    && Object.keys(value).every((key) => allowed.includes(key))
    && required.every((key) => Object.hasOwn(value, key));
}

export function clone(value) {
  return structuredClone(value);
}

export function freeze(value) {
  return deepFreeze(clone(value));
}

export function digest(value) {
  return computeSpatialV3CanonicalDigest(value);
}

export function sealedRecord(value) {
  if (!record(value) || typeof value.canonical_digest !== 'string') return false;
  const payload = Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'canonical_digest'));
  return value.canonical_digest === digest(payload);
}

export function formal(contractName, value) {
  return validateSpatialV3Contract(contractName, value).length === 0;
}

export function entityRef(value, expectedKind = null) {
  return formal('entity_ref', value) && (expectedKind === null || value.entity_kind === expectedKind);
}

export function versionedRef(value, expectedKind = null) {
  return formal('versioned_ref', value)
    && (expectedKind === null || value.entity_ref.entity_kind === expectedKind);
}

export function normalizeTimestamp(value) {
  try {
    return normalizeGameTimestamp(value);
  } catch {
    return null;
  }
}

export function positiveDecimal(value) {
  return typeof value === 'string' && /^[1-9][0-9]*$/u.test(value);
}

export function sameRef(left, right) {
  return left.entity_kind === right.entity_kind && left.entity_id === right.entity_id;
}

export function refKey(value) {
  return `${value.entity_kind}\u0000${value.entity_id}`;
}

export function uniqueEntityRefs(values) {
  return Array.isArray(values)
    && values.every((value) => entityRef(value))
    && new Set(values.map(refKey)).size === values.length;
}

export function uniqueStableIds(values) {
  return Array.isArray(values)
    && values.every(stableId)
    && new Set(values).size === values.length;
}

export function dependencyPins(value) {
  return formal('dependency_pin_set', value)
    && sealedRecord(value)
    && Array.isArray(value.pins)
    && value.pins.length > 0;
}

export function pinned(pinSet, dependencyRole, reference) {
  return pinSet.pins.some((pin) => pin.dependency_role === dependencyRole
    && sameRef(pin.entity_ref, reference.entity_ref)
    && pin.version_pin.pin_kind === 'authoring_version'
    && pin.version_pin.authoring_version === reference.authoring_version);
}

export function success(value) {
  return freeze({ ok: true, ...value });
}

export function blocked(code, message, subjectRef = null, pins = null) {
  if (subjectRef && pins) {
    try {
      return freeze({
        ok: false,
        status: 'hard_block',
        error: createSpatialV3TypedError(code, {
          subject_ref: subjectRef,
          dependency_pins: pins,
          diagnostics: { message }
        })
      });
    } catch {
      // Malformed caller input must still produce a closed typed-code result.
    }
  }
  return freeze({ ok: false, status: 'hard_block', error: { code, message } });
}
