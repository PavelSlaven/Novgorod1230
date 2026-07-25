const blocked = async () => Object.freeze({
  ok: false,
  status: 'hard_block',
  error: Object.freeze({
    code: 'generated_schema_mismatch',
    message: 'The cutover smoke binding does not execute game commands.'
  })
});

const releaseBinding = Object.freeze({
  release_id: 'spatial-v3-production-v1',
  composition_id: 'builtin:production-spatial-v3',
  contract_version: '4.4.0-target.1',
  temporal_contract_id: 'temporal-world-v1.1',
  party_schema_version: 'party_runtime_v3_target',
  world_revision_id: 'novgorod_spatial_v3_target_contract_approval_001',
  world_catalog_digest:
    '0ed3a9388930b0245fecdf6ec8adfa08d74d5fe88d5458bd452bee20de16fb1e',
  world_catalog_manifest_sha256:
    '4056b93acc2a3c7ed4c76c18182d74b7ef5b9f5fc9c31f206670f11a6283192e',
  dependency_pin_mode: 'exact_only',
  runtime_catalog_pin_schema: 'rus.runtime_catalog_pin.v2',
  runtime_catalog_scope: 'item_container_materialization_v2',
  runtime_catalog_resolution:
    'active_for_new_party_persisted_for_existing_party',
  party_runtime_catalog_migration_id:
    'party_runtime_catalog_pins_v1',
  party_runtime_catalog_migration_digest:
    'f251623759b60799ea75b17b7234833a092b97a5443b8b831643c0544ef25a31',
  party_runtime_catalog_target_fingerprint:
    '329a84c3c5ccd76e4a84b67454bcbd6e6c176fafbd285e77d44824dddcd8d2dd',
  target_migration_count: 10,
  target_migration_chain_digest:
    'a71b95540c6422ccee5b3d598cb6b0cefe108de3bf41216dea96a99068a5a370',
  compatible_world_pin_manifest_digest: 'e'.repeat(64),
  rollback_source_release_id: 'production-v2',
  rollback_runtime_selectable: false
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
    'novgorod_spatial_v3_target_contract_approval_001',
  compatible_world_catalog_digest:
    '0ed3a9388930b0245fecdf6ec8adfa08d74d5fe88d5458bd452bee20de16fb1e',
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
    acknowledgeOpening: blocked,
    getPartyScreen: blocked,
    releaseBinding,
    runtimeCatalogPin
  });
}
