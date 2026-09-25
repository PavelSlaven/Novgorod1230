import assert from 'node:assert/strict';
import historicalRequest from '../../../data/world-catalogs/novgorod/procedural-scene-v2/actor-base-attributes-v1/runtime-import-v1/request.json' with { type: 'json' };
import { validateActorBaseAttributesImportRequest } from
  '../../../scripts/generate-actor-base-attributes-import-request.mjs';
import { buildBaseWorldCompatibilityManifest, digestEnvelope,
  verifyDecisionAttestation, buildActivationPartyPreflight } from './artifact-contracts.js';
import { ACTOR_BASE_ATTRIBUTES_WORLD_MIGRATION,
  ACTOR_BASE_ATTRIBUTES_WORLD_MIGRATION_V17_BOOTSTRAP } from
  './forward-migrations.js';

const ACTOR_REVISION = 'actor_base_attributes_spatial_v3_target_001';
const ITEM_REVISION = 'item_container_spatial_v3_target_001';
const WORLD_REVISION = 'novgorod_spatial_v3_target_contract_approval_001';
const WORLD_DIGEST = '0ed3a9388930b0245fecdf6ec8adfa08d74d5fe88d5458bd452bee20de16fb1e';
const MANIFEST_SHA = '4056b93acc2a3c7ed4c76c18182d74b7ef5b9f5fc9c31f206670f11a6283192e';
const IMPORT_SCHEMA = 'rus.actor_base_attributes_import_request.v2';
const ACTIVATION_SCHEMA = 'rus.actor_base_attributes_runtime_activation_request.v2';

export function isActorBaseAttributesSuccessor(request) {
  return request?.schema === IMPORT_SCHEMA || request?.schema === ACTIVATION_SCHEMA;
}

export function buildActorBaseAttributesSuccessorImportRequest({
  subjectCommit, parentCatalog, compatibilityManifest,
  schemaMigration = ACTOR_BASE_ATTRIBUTES_WORLD_MIGRATION
}) {
  const migration = resolveWorldMigration(schemaMigration);
  const v17 = migration.migration_id === ACTOR_BASE_ATTRIBUTES_WORLD_MIGRATION_V17_BOOTSTRAP.migration_id;
  validateActorBaseAttributesImportRequest(historicalRequest);
  assert.deepEqual(Object.keys(parentCatalog ?? {}).sort(), [
    'catalog_scope', 'catalog_revision_id', 'catalog_digest',
    'import_readback_ref', 'import_readback_digest',
    'compatible_world_pin_manifest_digest'
  ].sort(), 'ACTOR_SUCCESSOR_PARENT_INVALID');
  assert.equal(parentCatalog.catalog_scope, 'item_container_materialization_v2');
  assert.equal(parentCatalog.catalog_revision_id, ITEM_REVISION);
  for (const field of ['catalog_digest', 'import_readback_digest',
    'compatible_world_pin_manifest_digest']) {
    assert.match(parentCatalog[field] ?? '', /^[a-f0-9]{64}$/u);
  }
  assert.ok(typeof parentCatalog.import_readback_ref === 'string'
    && parentCatalog.import_readback_ref.length > 0);
  const runtimeConfiguration = {
    schema: 'rus.spatial_v3_target_catalog_configuration.v1',
    release_id: 'spatial-v3-production-v17',
    world_revision_id: WORLD_REVISION, world_catalog_digest: WORLD_DIGEST,
    world_manifest_sha256: MANIFEST_SHA
  };
  const compatibleWorld = v17 ? structuredClone(compatibilityManifest) : buildBaseWorldCompatibilityManifest({
    compatibleWorldRevisionId: WORLD_REVISION,
    compatibleWorldCatalogDigest: WORLD_DIGEST,
    sourceRuntimeConfigurationDigest: digestEnvelope(runtimeConfiguration),
    sourceArtifactPaths: [
      'data/world-catalogs/novgorod/spatial-v3/manifest.json',
      'data/world-catalogs/novgorod/spatial-v3/datasets/spatial_v3_world_revisions.json'
    ],
    sourceCommitSha: subjectCommit,
    validationContractVersion: 'base_world_compatibility_v2'
  });
  if (v17) {
    assert.equal(compatibleWorld?.schema, 'rus.base_world_compatibility_manifest.v2');
    assert.equal(compatibleWorld.compatible_world_revision_id, WORLD_REVISION);
    assert.equal(compatibleWorld.compatible_world_catalog_digest, WORLD_DIGEST);
    assert.equal(compatibleWorld.source_runtime_configuration_digest,
      digestEnvelope(runtimeConfiguration));
    const { compatible_world_pin_manifest_digest: claimed, ...payload } = compatibleWorld;
    assert.equal(claimed, digestEnvelope(payload));
    assert.equal(claimed, parentCatalog.compatible_world_pin_manifest_digest);
  }
  const request = structuredClone(historicalRequest);
  request.schema = IMPORT_SCHEMA;
  request.version = v17 ? 3 : 2;
  if (v17) delete request.subject_commit;
  else request.subject_commit = subjectCommit;
  request.target_revision_id = ACTOR_REVISION;
  request.parent_catalog = structuredClone(parentCatalog);
  request.compatible_world = compatibleWorld;
  request.owner_rows[0].row.catalog_revision_id = ACTOR_REVISION;
  request.target_catalog_digest = digestEnvelope({
    schema: 'rus.actor_base_attributes_catalog_payload.v1',
    catalog_scope: request.catalog_scope,
    target_revision_id: request.target_revision_id,
    parent_catalog: request.parent_catalog,
    compatible_world: request.compatible_world,
    record_registry_digest: request.record_registry_digest,
    runtime_contract_digest: request.runtime_contract_digest,
    owner_rows: request.owner_rows
  });
  Object.assign(request.import_plan.world_revision, {
    id: ACTOR_REVISION, parent_revision_id: ITEM_REVISION,
    catalog_digest: request.target_catalog_digest
  });
  Object.assign(request.import_plan.domain_catalog_revision, {
    catalog_revision_id: ACTOR_REVISION,
    target_catalog_digest: request.target_catalog_digest
  });
  request.import_plan.schema_migration = {
    migration_id: migration.migration_id,
    migration_digest: migration.migration_digest
  };
  delete request.request_digest;
  return seal(request, 'request_digest');
}

export function validateActorBaseAttributesSuccessorImportApproval({ request,
  attestation }) {
  const expected = buildActorBaseAttributesSuccessorImportRequest({
    subjectCommit: request?.subject_commit,
    parentCatalog: request?.parent_catalog,
    compatibilityManifest: request?.compatible_world,
    schemaMigration: request?.import_plan?.schema_migration
  });
  assert.deepEqual(request, expected, 'ACTOR_SUCCESSOR_IMPORT_REQUEST_INVALID');
  verifySuccessorAttestation({ request, attestation,
    schema: 'rus.actor_base_attributes_successor_import_attestation.v1',
    decision: 'approve_exact_actor_base_attributes_successor_import',
    authority: { import_authorized: true, activation_authorized: false,
      production_authorized: false, existing_party_migration_authorized: false,
      old_save_rematerialization_authorized: false }
  });
  return true;
}

export function buildActorBaseAttributesSuccessorActivationRequest({
  importRequest, importResult, previousEvent, partyPreflight
}) {
  assert.deepEqual(importRequest,
    buildActorBaseAttributesSuccessorImportRequest({
      subjectCommit: importRequest.subject_commit,
      parentCatalog: importRequest.parent_catalog,
      compatibilityManifest: importRequest.compatible_world,
      schemaMigration: importRequest.import_plan.schema_migration
    }));
  const { result_digest: resultDigest, ...payload } = importResult;
  assert.equal(resultDigest, digestEnvelope(payload));
  assert.equal(importResult.status, 'imported_exact_readback_verified');
  assert.equal(importResult.request_digest, importRequest.request_digest);
  assert.equal(importResult.target_catalog_digest, importRequest.target_catalog_digest);
  assert.equal(importResult.target_revision_id, importRequest.target_revision_id);
  const row = importRequest.owner_rows[0].row;
  const preflight = buildActorBaseAttributesSuccessorPreflight(partyPreflight);
  assert.ok(previousEvent == null ? preflight.party_count === 0
    : previousEvent.event_id && Number.isSafeInteger(previousEvent.event_sequence)
      && previousEvent.event_sequence > 0, 'ACTOR_SUCCESSOR_PREDECESSOR_REQUIRED');
  return seal({
    schema: ACTIVATION_SCHEMA, version: importRequest.version,
    status: 'pending_independent_runtime_approval',
    ...(importRequest.version === 2 ? { subject_commit: importRequest.subject_commit } : {}),
    activation_scope: 'new_production_parties_only',
    runtime_capability: 'actor_base_attributes_runtime_selection',
    import_request: importRequest,
    completed_import_readback: importResult,
    expected_previous_event: previousEvent == null ? null : {
      event_id: previousEvent.event_id, event_sequence: previousEvent.event_sequence },
    party_preflight: preflight,
    target_binding: {
      catalog_scope: importRequest.catalog_scope,
      target_revision_id: importRequest.target_revision_id,
      target_catalog_digest: importRequest.target_catalog_digest,
      record_registry_digest: importRequest.record_registry_digest,
      runtime_contract_digest: importRequest.runtime_contract_digest,
      parent_catalog: importRequest.parent_catalog,
      compatible_world: importRequest.compatible_world,
      profile_id: row.profile_id, profile_digest: row.profile_digest,
      owner_row_digest: digestEnvelope(row)
    },
    independent_runtime_activation_attestation: null
  }, 'request_digest');
}

export function validateActorBaseAttributesSuccessorActivationApproval({ request,
  attestation }) {
  assert.deepEqual(request, buildActorBaseAttributesSuccessorActivationRequest({
    importRequest: request?.import_request,
    importResult: request?.completed_import_readback,
    previousEvent: request?.expected_previous_event,
    partyPreflight: request?.party_preflight
  }), 'ACTOR_SUCCESSOR_ACTIVATION_REQUEST_INVALID');
  verifySuccessorAttestation({ request, attestation,
    schema: 'rus.actor_base_attributes_successor_activation_attestation.v1',
    decision: 'approve_exact_actor_base_attributes_new_production_activation',
    authority: { import_authorized: false, activation_authorized: true,
      production_authorized: true, existing_party_migration_authorized: false,
      old_save_rematerialization_authorized: false }
  });
  return true;
}

export function buildActorBaseAttributesSuccessorPreflight(counts) {
  buildActivationPartyPreflight({ activationScope: 'new_production_parties_only',
    partyCount: counts?.party_count, pinnedPartyCount: counts?.pinned_party_count,
    missingDomainPinCount: counts?.missing_domain_pin_count,
    inflightStage24Stage25Count: counts?.inflight_count,
    runtimeReleaseId: digestEnvelope('spatial-v3-production-v17'),
    runtimeContractDigest: historicalRequest.runtime_contract_digest });
  return { party_count: counts.party_count, pinned_party_count: counts.pinned_party_count,
    missing_domain_pin_count: counts.missing_domain_pin_count,
    inflight_count: counts.inflight_count };
}

function verifySuccessorAttestation({ request, attestation, schema, decision,
  authority }) {
  assert.ok(typeof attestation?.attested_by === 'string'
    && attestation.attested_by.length > 0
    && typeof attestation.independence_basis === 'string'
    && attestation.independence_basis.length > 0,
  'ACTOR_SUCCESSOR_INDEPENDENT_APPROVAL_REQUIRED');
  verifyDecisionAttestation({ attestation, expectedSchema: schema,
    requestDigestField: 'request_digest',
    expectedRequestDigest: request.request_digest,
    expectedDecision: decision,
    expectedBindings: { ...(request.version === 2
      ? { reviewed_repository_head: request.subject_commit }
      : { reviewed_source_digest: request.compatible_world.compatible_world_pin_manifest_digest }),
      authority, database_mutated: false }
  });
}

function resolveWorldMigration(declared) {
  for (const migration of [ACTOR_BASE_ATTRIBUTES_WORLD_MIGRATION,
    ACTOR_BASE_ATTRIBUTES_WORLD_MIGRATION_V17_BOOTSTRAP]) {
    if (declared?.migration_id === migration.migration_id
        && declared?.migration_digest === migration.migration_digest)
      return migration;
  }
  assert.fail('ACTOR_SUCCESSOR_SCHEMA_MIGRATION_INVALID');
}

function seal(payload, field) {
  return { ...payload, [field]: digestEnvelope(payload) };
}
