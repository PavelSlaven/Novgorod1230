import { serverError } from '../errors.js';

export function deriveActivatedReleaseFromReadback(
  candidate,
  runtimeCatalogPin
) {
  const exact =
    typeof runtimeCatalogPin?.activation_event_id === 'string'
    && runtimeCatalogPin.activation_event_id.length > 0
    && runtimeCatalogPin.compatible_world_revision_id
      === candidate.world_revision_id
    && runtimeCatalogPin.compatible_world_catalog_digest
      === candidate.world_catalog_digest
    && runtimeCatalogPin.runtime_contract_digest
      === candidate.runtime_catalog_contract_digest;
  if (!exact) {
    throw serverError(
      'SPATIAL_V3_RELEASE_NOT_ACTIVATED',
      'The exact candidate has no committed production activation readback.'
    );
  }
  return Object.freeze({
    ...candidate,
    release_status: 'active',
    production_activation: true,
    runtime_selectable_in_canonical_production: true,
    production_activation_event_id:
      runtimeCatalogPin.activation_event_id
  });
}
