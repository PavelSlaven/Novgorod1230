const blocked = async () => Object.freeze({
  ok: false,
  status: 'hard_block',
  error: Object.freeze({
    code: 'generated_schema_mismatch',
    message: 'The cutover smoke binding does not execute game commands.'
  })
});

const releaseBinding = Object.freeze({
  release_id: 'spatial-v3-production-v3',
  composition_id: 'builtin:production-spatial-v3',
  contract_version: '4.5.0-first-playable.1',
  temporal_contract_id: 'temporal-world-v1.1',
  party_schema_version: 'party_runtime_v3_first_playable',
  world_revision_id: 'novgorod_spatial_v3_production_v3_candidate_001',
  world_catalog_digest:
    '1cf914ed9a19801f94b8b1463a717dbb0be7f1d51ea2351e6d1d5a51c492215e',
  world_catalog_manifest_sha256:
    '593ccb341084f7433ec4ae9d7d0b2ea8b1dea07833636ef385550ba5a295ecea',
  dependency_pin_mode: 'exact_only',
  runtime_catalog_pin_schema: 'rus.runtime_catalog_pin.v2',
  runtime_catalog_scope: 'item_container_materialization_v2',
  runtime_catalog_resolution:
    'active_for_new_party_persisted_for_existing_party',
  runtime_catalog_contract_digest:
    '60c3a601bcb561c39017fed915cb9b9cdaa779115f4f0f2c0175db3eda64a0c7',
  party_runtime_catalog_migration_id:
    'party_runtime_catalog_pins_v2',
  party_runtime_catalog_migration_digest:
    '9f574d2782cdbaeeba190d8237fe38c26bddd65775f060749079d3d0163ef32d',
  party_runtime_catalog_target_fingerprint:
    '47cb21b39db8be7336d10533ed319fe314f5bda65d850f1297c8321de6c9d165',
  target_migration_count: 15,
  target_migration_chain_digest:
    '1e075ca34cda4c00fe7d9acc051c8c902785d2adcf604e695f70d18167d11d8f',
  compatible_world_pin_manifest_digest: 'e'.repeat(64),
  rollback_source_release_id: 'spatial-v3-production-v2',
  rollback_runtime_selectable: false,
  release_status: 'active',
  production_activation: true,
  runtime_selectable_in_canonical_production: true,
  boundary_crossing_capability: 'ready_for_runtime_acceptance',
  scenario_binding_id: 'lower_dvina_late_summer_open_water_v1'
});

const runtimeCatalogPin = Object.freeze({
  schema: 'rus.runtime_catalog_pin.v2',
  catalog_scope: 'item_container_materialization_v2',
  catalog_revision_id: 'cutover-runtime-catalog-v1',
  catalog_digest: 'a'.repeat(64),
  activation_event_id: 'cutover-runtime-activation-v1',
  import_id: 'cutover-runtime-import-v1',
  import_audit_digest: 'b'.repeat(64),
  record_registry_digest: 'c'.repeat(64),
  runtime_contract_digest: 'd'.repeat(64),
  compatible_world_revision_id:
    'novgorod_spatial_v3_production_v3_candidate_001',
  compatible_world_catalog_digest:
    '1cf914ed9a19801f94b8b1463a717dbb0be7f1d51ea2351e6d1d5a51c492215e',
  compatible_world_pin_manifest_digest: 'e'.repeat(64)
});

/**
 * Test-only deployment binding used to prove that the real v3 production
 * composition can be loaded against isolated PostgreSQL. Every gameplay port
 * fails closed; the fixture is never exported by a production package.
 */
export function createSpatialV3RuntimeBindings() {
  return Object.freeze({
    targetCompositionPorts: Object.freeze({
      planner: Object.freeze({ resolve: blocked }),
      activationValidator: Object.freeze({ validate: blocked }),
      executionEngine: Object.freeze({}),
      targetPreparation: Object.freeze({ prepare: blocked }),
      frontierResolver: Object.freeze({ resolve: blocked }),
      loadSnapshots: blocked,
      validateProposal: blocked,
      advanceTemporal: blocked,
      deriveVisiblePackage: blocked,
      loadCommittedVisiblePackage: blocked,
      claimPresentationAttempt: blocked,
      narrate: blocked,
      persistNarrationOutput: blocked,
      finalizePresentationAttempt: blocked,
      projectScreen: blocked,
      verifyApproval: blocked,
      loadStartSnapshot: blocked,
      prepareStart: blocked,
      buildStartWritePlanInput: blocked,
      modeHandoff: Object.freeze({ handoff: blocked }),
      buildModeHandoffProposal: blocked
    }),
    commitRecheck: blocked,
    createPublicRuntimeFacade: async () => Object.freeze({
      listScenarios: blocked,
      startNewGame: blocked,
      acknowledgeOpening: blocked,
      submitTurn: blocked,
      getPartyScreen: blocked
    }),
    releaseBinding,
    runtimeCatalogPin
  });
}
