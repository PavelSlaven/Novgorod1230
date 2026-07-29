import { canonicalDigest } from '@rus/materialization';
import {
  RUNTIME_CATALOG_FIRST_PLAYABLE_CONTRACT_DIGEST
} from '@rus/runtime-catalog/runtime-contract';

export function lowerDvinaTracePhase1ADomainPin(bundle) {
  const world = bundle.location_topology_set.spatial_source_ref;
  const source = bundle.item_container_set.canonical_item_catalog_source_ref;
  return Object.freeze({
    schema: 'rus.runtime_catalog_pin.v2',
    catalog_scope: 'item_container_materialization_v2',
    catalog_revision_id: source.promoted_world_revision_id,
    catalog_digest: canonicalDigest(source),
    import_id: `trace_phase_1a_import_${canonicalDigest(source).slice(0, 24)}`,
    import_audit_digest: canonicalDigest(source.approval_attestation),
    record_registry_digest: canonicalDigest(source.datasets),
    runtime_contract_digest: RUNTIME_CATALOG_FIRST_PLAYABLE_CONTRACT_DIGEST,
    compatible_world_revision_id: world.world_revision_id,
    compatible_world_catalog_digest: world.world_revision_catalog_digest,
    compatible_world_pin_manifest_digest: world.manifest_digest,
    activation_event_id: `trace_phase_1a_activation_${canonicalDigest({
      source,
      world
    }).slice(0, 24)}`
  });
}
