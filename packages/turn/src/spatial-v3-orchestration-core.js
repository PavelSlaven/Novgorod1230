import {
  computeSpatialV3CanonicalDigest,
  createSpatialV3TypedError
} from '@rus/contracts/spatial-v3/registry';

export const clone = (value) => structuredClone(value);
export const text = (value) => typeof value === 'string' ? value.trim() : '';
export const record = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
export const freeze = (value) => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
};
export const digest = (value) => computeSpatialV3CanonicalDigest(value);
export const sealed = (value) => {
  if (!record(value) || !text(value.canonical_digest)) return false;
  const payload = { ...value }; delete payload.canonical_digest;
  return value.canonical_digest === digest(payload);
};
export const same = (left, right) => digest(left) === digest(right);
export const pins = (value) => record(value) && Array.isArray(value.pins) && value.pins.length > 0 && text(value.canonical_digest) && value.canonical_digest === digest(value.pins).replace('sha256:', '');
export const exact = (value, kind, partyId, dependencyPins) => sealed(value) && value.kind === kind && value.party_id === partyId && (!dependencyPins || (pins(value.dependency_pins) && same(value.dependency_pins, dependencyPins)));

export function fail(code, partyId = 'unknown', diagnostics = {}) {
  const pins = [{ dependency_role: 'source_authoring', entity_ref: { entity_kind: 'world_revision', entity_id: 'target' }, version_pin: { pin_kind: 'authoring_version', authoring_version: '4.2.0-target.1', state_version: null } }];
  return freeze({ ok: false, error: createSpatialV3TypedError(code, {
    subject_ref: { entity_kind: 'party_route_plan_execution', entity_id: partyId || 'unknown' },
    dependency_pins: { pins, canonical_digest: digest(pins).replace('sha256:', '') }, diagnostics
  }) });
}

export function requirePort(value, name) {
  if (typeof value !== 'function') throw new TypeError(`P21 ${name} port is required.`);
}
