import {
  computeSpatialV3CanonicalDigest,
  createSpatialV3TypedError
} from './registry.js';

export const SPATIAL_V3_PORT_STATUS = 'target_stub';

/**
 * Produces the only allowed result from a P08 public port. The skeleton is
 * deliberately fail-closed until its owning implementation phase supplies a
 * validated adapter; it never reads a compatibility path or performs a write.
 */
export function createSpatialV3PortUnavailableResult(port_name) {
  if (typeof port_name !== 'string' || !port_name.trim()) throw new TypeError('port_name is required.');
  const subject_ref = Object.freeze({ entity_kind: 'world_revision', entity_id: 'spatial-v3-target' });
  const pins = Object.freeze([Object.freeze({
    dependency_role: 'source_authoring',
    entity_ref: subject_ref,
    version_pin: Object.freeze({ pin_kind: 'authoring_version', authoring_version: '4.5.0-target.1' })
  })]);
  const dependency_pins = Object.freeze({
    pins,
    canonical_digest: computeSpatialV3CanonicalDigest(pins).replace('sha256:', '')
  });
  return Object.freeze({
    ok: false,
    status: SPATIAL_V3_PORT_STATUS,
    error: createSpatialV3TypedError('generated_schema_mismatch', {
      subject_ref,
      dependency_pins,
      diagnostics: { port_name: port_name.trim(), reason: 'P08 API skeleton has no implementation adapter.' }
    })
  });
}
