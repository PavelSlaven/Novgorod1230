import { canonicalStringify } from './canonical-records.js';
import { createHash } from 'node:crypto';

export const RUNTIME_CATALOG_ACTIVATION_LOCK_KEY = '742019261003';

export const RUNTIME_CATALOG_CONTRACT = deepFreeze({
  schema: 'rus.runtime_catalog_contract.v2',
  catalog_scope: 'item_container_materialization_v2',
  pin_schema: 'rus.runtime_catalog_pin.v2',
  loader_contract_version: 2,
  record_registry_schema: 'rus.catalog_record_registry.v1',
  required_world_schema_migration_id: 'world_runtime_catalog_activation_v1',
  required_party_schema_migration_id: 'party_runtime_catalog_pins_v1',
  materialization_catalog_binding: {
    catalog_digest: 'exact_domain_catalog_pin_digest',
    catalog_bundle_digest: 'canonical_applicable_projection_digest'
  },
  materialization_contracts: {
    stage_8: 'item_profile_candidates_v2',
    stage_13: 'g5_materialization_v2',
    stage_14: 'g5_audit_v2',
    stage_16: 'item_placement_v2',
    stage_24: 'party_db_write_plan_v1',
    stage_25: 'party_commit_v1'
  }
});

export const RUNTIME_CATALOG_CONTRACT_DIGEST = createHash('sha256')
  .update(canonicalStringify(RUNTIME_CATALOG_CONTRACT))
  .digest('hex');

/**
 * First-playable release contract. The v2 contract above remains immutable for
 * historical pins; this contract binds the same catalog semantics to the
 * append-only schema-19 / party-011 activation migrations.
 */
export const RUNTIME_CATALOG_FIRST_PLAYABLE_CONTRACT = deepFreeze({
  ...RUNTIME_CATALOG_CONTRACT,
  schema: 'rus.runtime_catalog_contract.v3',
  required_world_schema_migration_id: 'world_runtime_catalog_activation_v2',
  required_party_schema_migration_id: 'party_runtime_catalog_pins_v2'
});

export const RUNTIME_CATALOG_FIRST_PLAYABLE_CONTRACT_DIGEST =
  createHash('sha256')
    .update(canonicalStringify(RUNTIME_CATALOG_FIRST_PLAYABLE_CONTRACT))
    .digest('hex');

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}
