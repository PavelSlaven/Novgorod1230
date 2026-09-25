import assert from 'node:assert/strict';
import test from 'node:test';
import { buildBaseWorldCompatibilityManifest, digestEnvelope } from '../src/artifact-contracts.js';
import { buildActorBaseAttributesSuccessorImportRequest,
  buildActorBaseAttributesSuccessorActivationRequest,
  validateActorBaseAttributesSuccessorActivationApproval,
  validateActorBaseAttributesSuccessorImportApproval,
  buildActorBaseAttributesSuccessorPreflight } from '../src/actor-base-attributes-successor.js';
import { runActorBaseAttributesImport } from '../../../scripts/run-actor-base-attributes-import.mjs';
import { buildActorBaseAttributesImportLedger } from '../src/actor-base-attributes-import.js';
import { ACTOR_BASE_ATTRIBUTES_WORLD_MIGRATION_V17_BOOTSTRAP } from
  '../src/forward-migrations.js';

test('actor successor requires exact parent, reviewed import-only approval and preserves historical artifacts', async () => {
  const runtimeConfiguration = {
    schema: 'rus.spatial_v3_target_catalog_configuration.v1',
    release_id: 'spatial-v3-production-v17',
    world_revision_id: 'novgorod_spatial_v3_target_contract_approval_001',
    world_catalog_digest: '0ed3a9388930b0245fecdf6ec8adfa08d74d5fe88d5458bd452bee20de16fb1e',
    world_manifest_sha256: '4056b93acc2a3c7ed4c76c18182d74b7ef5b9f5fc9c31f206670f11a6283192e'
  };
  const compatibilityManifest = buildBaseWorldCompatibilityManifest({
    compatibleWorldRevisionId: runtimeConfiguration.world_revision_id,
    compatibleWorldCatalogDigest: runtimeConfiguration.world_catalog_digest,
    sourceRuntimeConfigurationDigest: digestEnvelope(runtimeConfiguration),
    sourceArtifactPaths: ['data/world.json', 'schema.sql'],
    sourceArtifactDigests: [
      { path: 'data/world.json', sha256: 'e'.repeat(64) },
      { path: 'schema.sql', sha256: 'f'.repeat(64) }
    ],
    sourceCommitSha: 'a'.repeat(40),
    validationContractVersion: 'base_world_compatibility_v2'
  });
  const request = buildActorBaseAttributesSuccessorImportRequest({
    subjectCommit: 'a'.repeat(40),
    compatibilityManifest,
    schemaMigration: ACTOR_BASE_ATTRIBUTES_WORLD_MIGRATION_V17_BOOTSTRAP,
    parentCatalog: {
      catalog_scope: 'item_container_materialization_v2',
      catalog_revision_id: 'item_container_spatial_v3_target_001',
      catalog_digest: 'b'.repeat(64), import_readback_ref: 'test-only:readback',
      import_readback_digest: 'c'.repeat(64),
      compatible_world_pin_manifest_digest: compatibilityManifest.compatible_world_pin_manifest_digest
    }
  });
  const payload = { schema: 'rus.actor_base_attributes_successor_import_attestation.v1',
    request_digest: request.request_digest,
    decision: 'approve_exact_actor_base_attributes_successor_import',
    reviewed_source_digest: request.compatible_world.compatible_world_pin_manifest_digest,
    attested_by: 'unit-test-only', independence_basis: 'unit test fixture', database_mutated: false,
    authority: { import_authorized: true, activation_authorized: false,
      production_authorized: false, existing_party_migration_authorized: false,
      old_save_rematerialization_authorized: false } };
  const attestation = { ...payload, attestation_digest: digestEnvelope(payload) };
  assert.equal(validateActorBaseAttributesSuccessorImportApproval({ request, attestation }), true);
  const sameContent = buildActorBaseAttributesSuccessorImportRequest({
    subjectCommit: '9'.repeat(40), compatibilityManifest,
    schemaMigration: ACTOR_BASE_ATTRIBUTES_WORLD_MIGRATION_V17_BOOTSTRAP,
    parentCatalog: request.parent_catalog
  });
  assert.equal(sameContent.request_digest, request.request_digest);
  assert.equal(sameContent.target_catalog_digest, request.target_catalog_digest);
  const importResultPayload = { status: 'imported_exact_readback_verified',
    request_digest: request.request_digest,
    target_catalog_digest: request.target_catalog_digest,
    target_revision_id: request.target_revision_id };
  const importResult = { ...importResultPayload,
    result_digest: digestEnvelope(importResultPayload) };
  const partyPreflight = { party_count: 0, pinned_party_count: 0,
    missing_domain_pin_count: 0, inflight_count: 0 };
  assert.equal(buildActorBaseAttributesSuccessorActivationRequest({
    importRequest: request, importResult, previousEvent: null, partyPreflight
  }).request_digest, buildActorBaseAttributesSuccessorActivationRequest({
    importRequest: sameContent, importResult, previousEvent: null, partyPreflight
  }).request_digest);
  const changedContent = structuredClone(compatibilityManifest);
  changedContent.source_artifact_digests[1].sha256 = '0'.repeat(64);
  const { compatible_world_pin_manifest_digest: oldPin, ...changedCompatibilityPayload } = changedContent;
  changedContent.compatible_world_pin_manifest_digest = digestEnvelope(changedCompatibilityPayload);
  const changedParent = { ...request.parent_catalog,
    compatible_world_pin_manifest_digest: changedContent.compatible_world_pin_manifest_digest };
  const changedRequest = buildActorBaseAttributesSuccessorImportRequest({
    subjectCommit: 'a'.repeat(40), compatibilityManifest: changedContent,
    schemaMigration: ACTOR_BASE_ATTRIBUTES_WORLD_MIGRATION_V17_BOOTSTRAP,
    parentCatalog: changedParent
  });
  assert.notEqual(changedRequest.request_digest, request.request_digest);
  assert.notEqual(changedRequest.target_catalog_digest, request.target_catalog_digest);
  const wrongApproval = { ...payload, request_digest: changedRequest.request_digest };
  assert.throws(() => validateActorBaseAttributesSuccessorImportApproval({
    request, attestation: { ...wrongApproval, attestation_digest: digestEnvelope(wrongApproval) }
  }));
  const ledger = buildActorBaseAttributesImportLedger({ request, attestation });
  assert.deepEqual(request.import_plan.schema_migration, {
    migration_id: ACTOR_BASE_ATTRIBUTES_WORLD_MIGRATION_V17_BOOTSTRAP.migration_id,
    migration_digest: ACTOR_BASE_ATTRIBUTES_WORLD_MIGRATION_V17_BOOTSTRAP.migration_digest
  });
  assert.equal(ledger.root.schema_migration_digest,
    ACTOR_BASE_ATTRIBUTES_WORLD_MIGRATION_V17_BOOTSTRAP.migration_digest);
  const changedMigration = structuredClone(request);
  changedMigration.import_plan.schema_migration.migration_digest = '0'.repeat(64);
  assert.throws(() => buildActorBaseAttributesImportLedger({
    request: changedMigration, attestation
  }));
  assert.throws(() => validateActorBaseAttributesSuccessorImportApproval({ request, attestation: null }));
  const changed = structuredClone(request);
  changed.owner_rows[0].row.profile_payload.ordinary_array[0] = 99;
  const { request_digest: ignored, ...changedPayload } = changed;
  changed.request_digest = digestEnvelope(changedPayload);
  assert.throws(() => validateActorBaseAttributesSuccessorImportApproval({ request: changed, attestation }));
  const production = { ...payload, authority: { ...payload.authority, production_authorized: true } };
  assert.throws(() => validateActorBaseAttributesSuccessorImportApproval({ request,
    attestation: { ...production, attestation_digest: digestEnvelope(production) } }));
  await assert.rejects(runActorBaseAttributesImport({ databaseUrl: 'unused',
    approval: { request, attestation }, resultPath: 'data/world-catalogs/novgorod/'
      + 'procedural-scene-v2/actor-base-attributes-v1/runtime-import-v1/import-readback-result.json'
  }), /ACTOR_SUCCESSOR_HISTORICAL_RESULT_PATH_FORBIDDEN/u);
  assert.deepEqual(buildActorBaseAttributesSuccessorPreflight({
    party_count: 2, pinned_party_count: 2, missing_domain_pin_count: 0, inflight_count: 0
  }), { party_count: 2, pinned_party_count: 2, missing_domain_pin_count: 0, inflight_count: 0 });
  assert.throws(() => buildActorBaseAttributesSuccessorPreflight({
    party_count: 2, pinned_party_count: 1, missing_domain_pin_count: 1, inflight_count: 0
  }), { code: 'ACTIVATION_PARTY_PREFLIGHT_BLOCKED' });
});

test('first actor successor activation binds a null predecessor only with no parties', () => {
  const importRequest = buildActorBaseAttributesSuccessorImportRequest({
    subjectCommit: 'a'.repeat(40), parentCatalog: {
      catalog_scope: 'item_container_materialization_v2',
      catalog_revision_id: 'item_container_spatial_v3_target_001',
      catalog_digest: 'b'.repeat(64), import_readback_ref: 'test-only:readback',
      import_readback_digest: 'c'.repeat(64), compatible_world_pin_manifest_digest: 'd'.repeat(64)
    }
  });
  const resultPayload = { status: 'imported_exact_readback_verified',
    request_digest: importRequest.request_digest,
    target_catalog_digest: importRequest.target_catalog_digest,
    target_revision_id: importRequest.target_revision_id };
  const importResult = { ...resultPayload, result_digest: digestEnvelope(resultPayload) };
  const partyPreflight = { party_count: 0, pinned_party_count: 0,
    missing_domain_pin_count: 0, inflight_count: 0 };
  const args = { importRequest, importResult, previousEvent: null, partyPreflight };
  const request = buildActorBaseAttributesSuccessorActivationRequest(args);
  assert.equal(request.expected_previous_event, null);
  const payload = { schema: 'rus.actor_base_attributes_successor_activation_attestation.v1',
    request_digest: request.request_digest,
    decision: 'approve_exact_actor_base_attributes_new_production_activation',
    reviewed_repository_head: request.subject_commit,
    attested_by: 'unit-test-only', independence_basis: 'unit test fixture',
    database_mutated: false,
    authority: { import_authorized: false, activation_authorized: true,
      production_authorized: true, existing_party_migration_authorized: false,
      old_save_rematerialization_authorized: false } };
  const attestation = { ...payload, attestation_digest: digestEnvelope(payload) };
  assert.equal(validateActorBaseAttributesSuccessorActivationApproval({ request, attestation }), true);
  assert.throws(() => buildActorBaseAttributesSuccessorActivationRequest({ ...args,
    partyPreflight: { ...partyPreflight, party_count: 1, pinned_party_count: 1 }
  }), /ACTOR_SUCCESSOR_PREDECESSOR_REQUIRED/u);
  assert.throws(() => buildActorBaseAttributesSuccessorActivationRequest({ ...args,
    previousEvent: { event_id: 'old', event_sequence: 0 }
  }), /ACTOR_SUCCESSOR_PREDECESSOR_REQUIRED/u);
});
