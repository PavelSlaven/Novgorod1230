import {
  SPATIAL_V3_TARGET_MIGRATIONS,
  SPATIAL_V3_TARGET_MIGRATION_CHAIN_DIGEST
} from '../infrastructure/postgres/spatial-v3-target-migrations.js';
import { serverError } from '../errors.js';

export const SPATIAL_V3_PRODUCTION_RELEASE_ID = 'spatial-v3-production-v15';
export const SPATIAL_V3_PRODUCTION_RELEASE = Object.freeze({
  release_id: SPATIAL_V3_PRODUCTION_RELEASE_ID,
  composition_id: 'builtin:production-spatial-v3',
  contract_version: '4.13.0-world-knowledge.2',
  temporal_contract_id: 'temporal-world-v1.1',
  party_schema_version: 'party_runtime_v3_first_playable',
  world_revision_id: 'novgorod_spatial_v3_production_v6_candidate_001',
  world_catalog_digest:
    '6e6cd611042ff86229c73409816893ea4e983c01722dd4699bac346acfb846ad',
  world_catalog_manifest_sha256:
    '776ab6989f5c8bb6c49858eb27b3bb9ac637a674e314f1c7e956a35cdbe569eb',
  world_knowledge_pack_ref: 'wk-pack:novgorod-1230',
  world_knowledge_pack_revision: 'revision:production-v1',
  world_knowledge_embedding_profile_ref:
    'wk-embedding:giga-480m-0826:v1',
  dependency_pin_mode: 'exact_only',
  runtime_catalog_pin_schema: 'rus.runtime_catalog_pin.v2',
  runtime_catalog_scope: 'item_container_materialization_v2',
  runtime_catalog_resolution:
    'active_for_new_party_persisted_for_existing_party',
  runtime_catalog_contract_digest:
    '60c3a601bcb561c39017fed915cb9b9cdaa779115f4f0f2c0175db3eda64a0c7',
  party_runtime_catalog_migration_id: 'party_runtime_catalog_pins_v2',
  party_runtime_catalog_migration_digest:
    '9f574d2782cdbaeeba190d8237fe38c26bddd65775f060749079d3d0163ef32d',
  party_runtime_catalog_target_fingerprint:
    '47cb21b39db8be7336d10533ed319fe314f5bda65d850f1297c8321de6c9d165',
  target_migration_count: SPATIAL_V3_TARGET_MIGRATIONS.length,
  target_migration_chain_digest: SPATIAL_V3_TARGET_MIGRATION_CHAIN_DIGEST,
  authoritative_reads: 'spatial_v3_only',
  authoritative_writes: 'spatial_v3_only',
  parent_release_exact_pins: Object.freeze({
    world_revision_id: 'novgorod_spatial_v3_production_v6_candidate_001',
    world_catalog_digest:
      '6e6cd611042ff86229c73409816893ea4e983c01722dd4699bac346acfb846ad',
    world_catalog_manifest_sha256:
      '776ab6989f5c8bb6c49858eb27b3bb9ac637a674e314f1c7e956a35cdbe569eb'
  }),
  boundary_crossing_capability: 'ready_for_runtime_acceptance',
  npc_conversation_capability: 'ready_for_runtime_acceptance',
  npc_autonomous_capability: 'ready_for_runtime_acceptance',
  npc_combat_capability: 'ready_for_runtime_acceptance',
  release_status: 'validated_candidate_not_active',
  production_activation: false,
  runtime_selectable_in_canonical_production: false,
  scenario_binding_id: 'lower_dvina_late_summer_open_water_v1',
  scenario_profile_exact_pins: Object.freeze({
    scenario_definition_revision: 32,
    scenario_definition_digest:
      '0c4b5d4992393ecde511cb35426933b01fb51b47552e0f5a859df2bfd359ab1f',
    phase_1a_package_id: 'lower_dvina_trace_phase_1a_v23',
    phase_1a_manifest_digest:
      '6c77be86edc484d291a8f944c7886b61fe41f76287d1810efb70ff8e033c7101',
    phase_1b_package_id: 'lower_dvina_trace_phase_1b_v27',
    phase_1b_manifest_digest:
      'bb05aff9ae0ec901063e4e5807e187d221aaa20fc709950270d1d8ced4895df1',
    phase_1b_binding_digest:
      '83cd8eca17879484867262199970bf0f70152f2adb69d22d8900a1466045e88a',
    n1_profile_id: 'lower_dvina_trace_n1_background_npc_v1',
    n1_profile_revision: 1,
    n1_profile_scenario_definition_revision: 31,
    n1_profile_digest:
      '0e44bc05cd6e27aa962eee7d3114209a1b9959d447fc72679e743c16176d4aeb'
  })
});

export function createSpatialV3ProductionRelease(compatibleWorldPinManifestDigest) {
  const digest = String(compatibleWorldPinManifestDigest ?? '').trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/u.test(digest)) {
    throw serverError(
      'RUNTIME_CATALOG_PIN_MANIFEST_DIGEST_REQUIRED',
      'Spatial-v3 production requires one exact compatible-world pin manifest digest.'
    );
  }
  return Object.freeze({
    ...SPATIAL_V3_PRODUCTION_RELEASE,
    compatible_world_pin_manifest_digest: digest
  });
}
