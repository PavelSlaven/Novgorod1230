import { serverError } from '../errors.js';

export function deriveActivatedReleaseFromReadback(
  candidate,
  runtimeCatalogPin,
  targetReadback = null
) {
  if (candidate.actor_base_attributes_catalog_revision_id != null
      && (candidate.scenario_binding_id == null || candidate.scenario_profile_exact_pins == null
        || targetReadback?.spatial?.status !== 'ready'
        || targetReadback.spatial.world_revision_id !== candidate.world_revision_id
        || targetReadback.spatial.runtime_catalog_activation_event_id !== runtimeCatalogPin?.activation_event_id
        || targetReadback.item_pin !== runtimeCatalogPin
        || targetReadback.actor_binding?.pin?.catalog_revision_id !== candidate.actor_base_attributes_catalog_revision_id
        || targetReadback.actor_binding.pin.compatible_world_revision_id !== candidate.world_revision_id
        || targetReadback.actor_binding.pin.compatible_world_catalog_digest !== candidate.world_catalog_digest)) {
    throw serverError('SPATIAL_V3_TARGET_ACTIVATION_APPROVAL_REQUIRED',
      'Target release requires exact item, actor and Spatial database readbacks.');
  }
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
