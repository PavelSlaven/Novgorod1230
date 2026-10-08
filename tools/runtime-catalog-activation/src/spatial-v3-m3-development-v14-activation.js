import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { canonicalStringify, createRuntimeCatalogLoader } from
  '@rus/runtime-catalog';
import { RUNTIME_CATALOG_FIRST_PLAYABLE_CONTRACT_DIGEST } from
  '@rus/runtime-catalog/runtime-contract';
import {
  buildSpatialV3M3CurrentSchemaReleaseArtifacts,
  validateSpatialV3M3CurrentSchemaReleaseApproval
} from '../../../scripts/generate-spatial-v3-m3-current-schema-release-request.mjs';
import {
  applyFirstPlayableV2ActivationBundle,
  buildFirstPlayableV2ActivationBundle
} from './first-playable-v2-activation.js';
import { digestEnvelope } from './artifact-contracts.js';
import { SPATIAL_V3_M3_DEVELOPMENT_V14_RELEASE as RELEASE } from
  './spatial-v3-production-v12-activation.js';

const ARTIFACT_ROOT = 'data/world-catalogs/novgorod/runtime-catalog/'
  + 'spatial-v3-m3-current-schema-development-v1';

export async function activateSpatialV3M3DevelopmentV14({ worldPool,
  partyPool, repositoryRoot }) {
  const root = resolve(repositoryRoot);
  const [candidate, request, attestation, generated] = await Promise.all([
    readJson(root, `${ARTIFACT_ROOT}/candidate.json`),
    readJson(root, `${ARTIFACT_ROOT}/approval-request.json`),
    readJson(root, `${ARTIFACT_ROOT}/runtime-approval-attestation.json`),
    buildSpatialV3M3CurrentSchemaReleaseArtifacts()
  ]);
  if (canonicalStringify({ candidate, request }) !==
      canonicalStringify(generated)) {
    fail('SPATIAL_V3_M3_RELEASE_ARTIFACT_DRIFT');
  }
  validateSpatialV3M3CurrentSchemaReleaseApproval({ candidate, request,
    attestation });
  assertReleaseBinding(candidate);

  const authorizationRef =
    `runtime-approval-attestation:${attestation.attestation_digest}`;
  const bundle = await buildFirstPlayableV2ActivationBundle({ worldPool,
    partyPool, repositoryRoot: root, gitCommitSha: candidate.subject_commit,
    authorizationRef, release: RELEASE });
  assertDerivedBundle({ bundle, candidate, request, attestation,
    authorizationRef });
  await applyFirstPlayableV2ActivationBundle({ worldPool, partyPool, bundle,
    release: RELEASE, activationScope: 'new_development_parties_only',
    transactional: true });
  return readActivationResult({ worldPool, bundle, candidate, request,
    attestation });
}

export async function validateSpatialV3M3DevelopmentV14Result({ worldPool,
  repositoryRoot, result }) {
  const root = resolve(repositoryRoot);
  const [candidate, request, attestation] = await Promise.all([
    readJson(root, `${ARTIFACT_ROOT}/candidate.json`),
    readJson(root, `${ARTIFACT_ROOT}/approval-request.json`),
    readJson(root, `${ARTIFACT_ROOT}/runtime-approval-attestation.json`)
  ]);
  validateSpatialV3M3CurrentSchemaReleaseApproval({ candidate, request,
    attestation });
  const persisted = await readResultEvent(worldPool);
  const expected = buildResult({ candidate, request, attestation,
    event: persisted });
  if (canonicalStringify(result) !== canonicalStringify(expected)) {
    fail('SPATIAL_V3_M3_ACTIVATION_RESULT_INVALID');
  }
  return true;
}

async function readActivationResult({ worldPool, bundle, candidate, request,
  attestation }) {
  const loader = createRuntimeCatalogLoader({
    worldBaseReader: { read: (sql, parameters) =>
      worldPool.query(sql, parameters) },
    supportedRuntimeContractDigests: [
      RUNTIME_CATALOG_FIRST_PLAYABLE_CONTRACT_DIGEST
    ]
  });
  const pin = await loader.loadActivePin({
    catalogScope: 'item_container_materialization_v2'
  });
  await loader.loadApprovedItemCatalog({ pin });
  const event = await readResultEvent(worldPool);
  if (event.event_id !== pin.activation_event_id
      || event.catalog_revision_id !== bundle.import_ledger.root.target_revision_id
      || event.catalog_digest !== bundle.import_ledger.root.target_catalog_digest
      || event.import_id !== bundle.import_ledger.root.import_id
      || event.import_audit_digest !== bundle.import_ledger.root.import_audit_digest
      || event.request_digest !== bundle.activation_request.activation_request_digest
      || event.attestation_digest !== bundle.activation_attestation.attestation_digest) {
    fail('SPATIAL_V3_M3_ACTIVATION_READBACK_MISMATCH', { event, pin,
      expected: {
        catalog_revision_id: bundle.import_ledger.root.target_revision_id,
        catalog_digest: bundle.import_ledger.root.target_catalog_digest,
        import_id: bundle.import_ledger.root.import_id,
        import_audit_digest: bundle.import_ledger.root.import_audit_digest,
        request_digest: bundle.activation_request.activation_request_digest,
        attestation_digest: bundle.activation_attestation.attestation_digest
      } });
  }
  return buildResult({ candidate, request, attestation, event });
}

async function readResultEvent(worldPool) {
  const rows = (await worldPool.query(
    `SELECT event_id,event_sequence,event_digest,catalog_revision_id,
            catalog_digest,import_id,import_audit_digest,
            record_registry_digest,runtime_contract_digest,
            compatible_world_revision_id,compatible_world_catalog_digest,
            compatible_world_pin_manifest_digest,request_digest,
            attestation_digest,expected_previous_event_id,runtime_release_id,
            operator_principal
       FROM world_base.runtime_catalog_activation_events
      WHERE catalog_scope='item_container_materialization_v2'
      ORDER BY event_sequence DESC LIMIT 1`)).rows;
  if (rows.length !== 1) fail('SPATIAL_V3_M3_ACTIVATION_READBACK_MISSING');
  return Object.freeze({ ...rows[0],
    event_sequence: Number(rows[0].event_sequence) });
}

function buildResult({ candidate, request, attestation, event }) {
  const payload = {
    schema: 'rus.spatial_v3_m3_development_v14_activation_readback_result.v1',
    status: 'activated_exact_postgresql_readback_verified',
    candidate_digest: candidate.candidate_digest,
    approval_request_digest: request.request_digest,
    runtime_approval_attestation_digest: attestation.attestation_digest,
    release_id: candidate.proposed_release.release_id,
    baseline_revision_id: candidate.proposed_release.baseline_revision_id,
    catalog_revision_id: event.catalog_revision_id,
    catalog_digest: event.catalog_digest,
    import_id: event.import_id,
    import_audit_digest: event.import_audit_digest,
    event_id: event.event_id,
    event_sequence: event.event_sequence,
    event_digest: event.event_digest,
    request_digest: event.request_digest,
    event_attestation_digest: event.attestation_digest,
    expected_previous_event_id: event.expected_previous_event_id,
    runtime_release_id: event.runtime_release_id,
    operator_principal: event.operator_principal,
    world_schema_migration_id:
      candidate.proposed_release.world_schema_migration_id,
    world_schema_migration_digest:
      candidate.proposed_release.world_schema_migration_digest,
    world_schema_target_fingerprint:
      candidate.proposed_release.world_schema_target_fingerprint,
    compatible_world: structuredClone(candidate.compatible_world),
    preserved_actor_approval_chain:
      structuredClone(candidate.preserved_actor_approval_chain),
    activation_scope: 'fresh_new_development_parties_only',
    new_development_party_activation_authorized: true,
    production_authorized: false,
    default_runtime_cutover_authorized: false,
    existing_party_migration_authorized: false,
    old_save_rematerialization_authorized: false,
    runtime_item_creation_authorized: false,
    functional_allocation_runtime_selection_authorized: false,
    equipment_allocation_activation_authorized: false,
    actor_world_owner_migration_execution_authorized: false,
    actor_party_pin_migration_execution_authorized: false,
    actor_base_attributes_runtime_activation_execution_authorized: false,
    party_pin_writes_authorized: false,
    gameplay_writes_authorized: false,
    broader_m3_attested: false
  };
  return Object.freeze({ ...payload, result_digest: digestEnvelope(payload) });
}

function assertReleaseBinding(candidate) {
  const proposed = candidate.proposed_release;
  if (proposed.release_id !== RELEASE.releaseId
      || proposed.baseline_revision_id !== RELEASE.baselineRevision
      || proposed.domain_revision_id !== RELEASE.domainRevision
      || proposed.world_schema_target_fingerprint !==
        RELEASE.worldSchemaFingerprint
      || proposed.bindings_file !== RELEASE.bindingsFile
      || candidate.compatible_world.world_revision_id !== RELEASE.worldRevision
      || candidate.compatible_world.world_catalog_digest !==
        RELEASE.worldCatalogDigest
      || candidate.compatible_world.world_manifest_sha256 !==
        RELEASE.worldManifestSha256) {
    fail('SPATIAL_V3_M3_RELEASE_BINDING_INVALID');
  }
}

function assertDerivedBundle({ bundle, candidate, attestation,
  authorizationRef }) {
  const derivedAttestations = [bundle.baseline_attestation,
    bundle.overlay_attestation, bundle.activation_attestation];
  if (bundle.git_commit_sha !== candidate.subject_commit
      || bundle.runtime_configuration_tuple.compatible_world_revision_id !==
        candidate.compatible_world.world_revision_id
      || bundle.runtime_configuration_tuple.compatible_world_catalog_digest !==
        candidate.compatible_world.world_catalog_digest
      || bundle.activation_request.expected_previous_event_id == null
      || derivedAttestations.some((value) =>
        value.attested_by !== authorizationRef)
      || bundle.activation_attestation.source_authorization !==
        RELEASE.activationBasis
      || attestation.activation_scope !==
        'fresh_new_development_parties_only') {
    fail('SPATIAL_V3_M3_DERIVED_BUNDLE_INVALID');
  }
}

async function readJson(root, path) {
  return JSON.parse(await readFile(resolve(root, path), 'utf8'));
}

function fail(code, details = {}) {
  throw Object.assign(new Error(code), { code, details });
}
