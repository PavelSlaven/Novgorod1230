import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { canonicalDigest } from '@rus/materialization';
import {
  SPATIAL_V3_DEVELOPMENT_V13_RELEASE,
  SPATIAL_V3_PRODUCTION_V12_RELEASE
} from '../tools/runtime-catalog-activation/src/spatial-v3-production-v12-activation.js';
import {
  ACTOR_BASE_ATTRIBUTES_PARTY_MIGRATION,
  ACTOR_BASE_ATTRIBUTES_WORLD_MIGRATION,
  WORLD_RUNTIME_CATALOG_MIGRATION_V3
} from '../tools/runtime-catalog-activation/src/forward-migrations.js';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const artifactRoot = 'data/world-catalogs/novgorod/runtime-catalog/'
  + 'spatial-v3-m3-current-schema-development-v1';
const SUBJECT_COMMIT = '9b9749f63b0b98fb5246714976b8892c87ff8bb1';
const RELEASE = Object.freeze({
  release_id: 'spatial-v3-m3-development-v14',
  baseline_revision_id:
    'world_revision_novgorod_1230_runtime_catalog_baseline_m3_dev_001',
  domain_revision_id:
    'runtime_catalog_lower_dvina_spatial_v3_m3_dev_001'
});
const paths = Object.freeze({
  candidate: `${artifactRoot}/candidate.json`,
  request: `${artifactRoot}/approval-request.json`,
  actorImportRequest: 'data/world-catalogs/novgorod/procedural-scene-v2/'
    + 'actor-base-attributes-v1/runtime-import-v1/request.json',
  actorImportAttestation: 'data/world-catalogs/novgorod/procedural-scene-v2/'
    + 'actor-base-attributes-v1/runtime-import-v1/'
    + 'import-approval-attestation.json',
  actorActivationRequest: 'data/world-catalogs/novgorod/procedural-scene-v2/'
    + 'actor-base-attributes-v1/runtime-activation-v1/request.json',
  actorActivationAttestation:
    'data/world-catalogs/novgorod/procedural-scene-v2/'
    + 'actor-base-attributes-v1/runtime-activation-v1/'
    + 'runtime-activation-approval-attestation.json',
  actorActivationResult: 'data/world-catalogs/novgorod/procedural-scene-v2/'
    + 'actor-base-attributes-v1/runtime-activation-v1/'
    + 'activation-readback-result.json'
});

const permissions = () => Object.freeze({
  activate_for_new_development_parties_only: true,
  production_activation: false,
  default_runtime_cutover: false,
  existing_party_migration: false,
  old_save_rematerialization: false,
  runtime_item_creation: false,
  functional_allocation_runtime_selection: false,
  equipment_allocation_activation: false,
  actor_world_owner_migration_execution: false,
  actor_party_pin_migration_execution: false,
  broader_m3_activation: false
});

const pendingAuthority = () => Object.freeze({
  approval_attestation_present: false,
  runtime_authorized: false,
  activation_authorized: false,
  production_authorized: false,
  default_runtime_cutover_authorized: false,
  new_development_party_activation_authorized: false,
  existing_party_migration_authorized: false,
  old_save_rematerialization_authorized: false,
  runtime_item_creation_authorized: false,
  functional_allocation_runtime_selection_authorized: false,
  equipment_allocation_activation_authorized: false,
  actor_world_owner_migration_execution_authorized: false,
  actor_party_pin_migration_execution_authorized: false,
  broader_m3_attested: false
});

const approvedPermissions = () => Object.freeze({
  transactional_registration_activation_readback_for_new_development_parties_only:
    true,
  production_activation: false,
  default_runtime_cutover: false,
  existing_party_migration: false,
  old_save_rematerialization: false,
  runtime_item_creation: false,
  functional_allocation_runtime_selection: false,
  equipment_allocation_activation: false,
  actor_world_owner_migration_execution: false,
  actor_party_pin_migration_execution: false,
  actor_base_attributes_runtime_activation_execution: false,
  party_pin_writes: false,
  gameplay_writes: false,
  broader_m3_activation: false
});

const approvedAuthority = () => Object.freeze({
  approval_attestation_present: true,
  release_registration_authorized: true,
  activation_authorized: true,
  exact_readback_required: true,
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
});

export async function buildSpatialV3M3CurrentSchemaReleaseArtifacts() {
  const actor = await loadActorChain();
  const candidatePayload = {
    schema: 'rus.spatial_v3_m3_current_schema_development_release_candidate.v1',
    version: 1,
    status: 'pending_independent_runtime_approval',
    subject_commit: SUBJECT_COMMIT,
    operation: 'append_only_current_schema_development_release_rebind',
    lineage: {
      immutable_production_predecessor_release_id:
        SPATIAL_V3_PRODUCTION_V12_RELEASE.releaseId,
      immutable_disposable_release_id:
        SPATIAL_V3_DEVELOPMENT_V13_RELEASE.releaseId,
      mutates_predecessor_release: false,
      mutates_disposable_release: false
    },
    proposed_release: {
      ...RELEASE,
      catalog_scope: 'item_container_materialization_v2',
      world_schema_migration_id:
        WORLD_RUNTIME_CATALOG_MIGRATION_V3.migration_id,
      world_schema_migration_digest:
        WORLD_RUNTIME_CATALOG_MIGRATION_V3.migration_digest,
      world_schema_source_fingerprint:
        WORLD_RUNTIME_CATALOG_MIGRATION_V3.source_schema_fingerprint,
      world_schema_target_fingerprint:
        WORLD_RUNTIME_CATALOG_MIGRATION_V3.target_schema_fingerprint,
      bindings_file: SPATIAL_V3_PRODUCTION_V12_RELEASE.bindingsFile
    },
    compatible_world: {
      world_revision_id: SPATIAL_V3_PRODUCTION_V12_RELEASE.worldRevision,
      world_catalog_digest:
        SPATIAL_V3_PRODUCTION_V12_RELEASE.worldCatalogDigest,
      world_manifest_sha256:
        SPATIAL_V3_PRODUCTION_V12_RELEASE.worldManifestSha256
    },
    preserved_actor_approval_chain: actor,
    requested_permissions: permissions(),
    authority: pendingAuthority(),
    independent_runtime_approval_attestation: null,
    activation_executed: false,
    database_mutated: false
  };
  const candidate = Object.freeze({ ...candidatePayload,
    candidate_digest: canonicalDigest(candidatePayload) });
  const requestPayload = {
    schema: 'rus.spatial_v3_m3_current_schema_development_release_approval_request.v1',
    version: 1,
    status: 'pending_independent_runtime_approval',
    subject_commit: SUBJECT_COMMIT,
    operation: candidate.operation,
    candidate_ref: paths.candidate,
    candidate_digest: candidate.candidate_digest,
    requested_release: structuredClone(candidate.proposed_release),
    compatible_world: structuredClone(candidate.compatible_world),
    requested_permissions: permissions(),
    authority: pendingAuthority(),
    required_independent_decision:
      'approve_exact_current_schema_m3_development_release_for_new_parties_only',
    independent_runtime_approval_attestation: null
  };
  const request = Object.freeze({ ...requestPayload,
    request_digest: canonicalDigest(requestPayload) });
  validateSpatialV3M3CurrentSchemaReleaseArtifacts({ candidate, request });
  return Object.freeze({ candidate, request });
}

export function validateSpatialV3M3CurrentSchemaReleaseArtifacts({ candidate,
  request }) {
  const proposed = candidate?.proposed_release;
  const world = candidate?.compatible_world;
  const requested = request?.requested_permissions;
  const truePermissions = Object.entries(requested ?? {})
    .filter(([, value]) => value === true).map(([key]) => key);
  if (!exact(candidate, ['schema', 'version', 'status', 'subject_commit',
    'operation', 'lineage', 'proposed_release', 'compatible_world',
    'preserved_actor_approval_chain', 'requested_permissions', 'authority',
    'independent_runtime_approval_attestation', 'activation_executed',
    'database_mutated', 'candidate_digest'])
      || !exact(candidate?.lineage,
        ['immutable_production_predecessor_release_id',
          'immutable_disposable_release_id', 'mutates_predecessor_release',
          'mutates_disposable_release'])
      || !exact(proposed, ['release_id', 'baseline_revision_id',
        'domain_revision_id', 'catalog_scope', 'world_schema_migration_id',
        'world_schema_migration_digest', 'world_schema_source_fingerprint',
        'world_schema_target_fingerprint', 'bindings_file'])
      || !exact(world, ['world_revision_id', 'world_catalog_digest',
        'world_manifest_sha256'])
      || !exact(request, ['schema', 'version', 'status', 'subject_commit',
        'operation', 'candidate_ref', 'candidate_digest',
        'requested_release', 'compatible_world', 'requested_permissions',
        'authority', 'required_independent_decision',
        'independent_runtime_approval_attestation', 'request_digest'])
      || candidate?.schema !==
        'rus.spatial_v3_m3_current_schema_development_release_candidate.v1'
      || candidate.version !== 1
      || candidate.status !== 'pending_independent_runtime_approval'
      || candidate.subject_commit !== SUBJECT_COMMIT
      || candidate.operation !==
        'append_only_current_schema_development_release_rebind'
      || candidate.lineage?.immutable_production_predecessor_release_id !==
        SPATIAL_V3_PRODUCTION_V12_RELEASE.releaseId
      || candidate.lineage?.immutable_disposable_release_id !==
        SPATIAL_V3_DEVELOPMENT_V13_RELEASE.releaseId
      || candidate.lineage?.mutates_predecessor_release !== false
      || candidate.lineage?.mutates_disposable_release !== false
      || canonicalDigest(proposed) !== canonicalDigest({
        ...RELEASE,
        catalog_scope: 'item_container_materialization_v2',
        world_schema_migration_id:
          WORLD_RUNTIME_CATALOG_MIGRATION_V3.migration_id,
        world_schema_migration_digest:
          WORLD_RUNTIME_CATALOG_MIGRATION_V3.migration_digest,
        world_schema_source_fingerprint:
          WORLD_RUNTIME_CATALOG_MIGRATION_V3.source_schema_fingerprint,
        world_schema_target_fingerprint:
          WORLD_RUNTIME_CATALOG_MIGRATION_V3.target_schema_fingerprint,
        bindings_file: SPATIAL_V3_PRODUCTION_V12_RELEASE.bindingsFile
      })
      || world?.world_revision_id !==
        SPATIAL_V3_PRODUCTION_V12_RELEASE.worldRevision
      || world?.world_catalog_digest !==
        SPATIAL_V3_PRODUCTION_V12_RELEASE.worldCatalogDigest
      || world?.world_manifest_sha256 !==
        SPATIAL_V3_PRODUCTION_V12_RELEASE.worldManifestSha256
      || !validActorChain(candidate.preserved_actor_approval_chain)
      || canonicalDigest(candidate.requested_permissions) !==
        canonicalDigest(permissions())
      || Object.values(candidate.authority ?? {}).some(Boolean)
      || canonicalDigest(candidate.authority) !==
        canonicalDigest(pendingAuthority())
      || candidate.independent_runtime_approval_attestation !== null
      || candidate.activation_executed !== false
      || candidate.database_mutated !== false
      || request?.schema !==
        'rus.spatial_v3_m3_current_schema_development_release_approval_request.v1'
      || request.version !== 1
      || request.status !== 'pending_independent_runtime_approval'
      || request.subject_commit !== SUBJECT_COMMIT
      || request.operation !== candidate.operation
      || request.candidate_ref !== paths.candidate
      || request.candidate_digest !== candidate.candidate_digest
      || canonicalDigest(request.requested_release) !==
        canonicalDigest(proposed)
      || canonicalDigest(request.compatible_world) !== canonicalDigest(world)
      || canonicalDigest(requested) !== canonicalDigest(permissions())
      || truePermissions.length !== 1
      || truePermissions[0] !== 'activate_for_new_development_parties_only'
      || Object.values(request.authority ?? {}).some(Boolean)
      || canonicalDigest(request.authority) !==
        canonicalDigest(pendingAuthority())
      || request.required_independent_decision !==
        'approve_exact_current_schema_m3_development_release_for_new_parties_only'
      || request.independent_runtime_approval_attestation !== null) {
    throw new Error('SPATIAL_V3_M3_CURRENT_SCHEMA_RELEASE_REQUEST_INVALID');
  }
  assertDigest(candidate, 'candidate_digest',
    'SPATIAL_V3_M3_CURRENT_SCHEMA_RELEASE_CANDIDATE_DIGEST_INVALID');
  assertDigest(request, 'request_digest',
    'SPATIAL_V3_M3_CURRENT_SCHEMA_RELEASE_REQUEST_DIGEST_INVALID');
  return true;
}

export function validateSpatialV3M3CurrentSchemaReleaseApproval({ candidate,
  request, attestation }) {
  validateSpatialV3M3CurrentSchemaReleaseArtifacts({ candidate, request });
  const bindings = attestation?.approved_bindings;
  const permissions = attestation?.approved_permissions;
  const authority = attestation?.authority;
  const truePermissions = Object.entries(permissions ?? {})
    .filter(([, value]) => value === true).map(([key]) => key);
  if (!exact(attestation, ['schema', 'version', 'status', 'decision',
    'reviewed_repository_head', 'auditor_ref', 'independence_basis',
    'reviewed_at', 'activation_scope', 'operation', 'approved_bindings',
    'approved_permissions', 'authority', 'activation_executed',
    'database_mutated', 'actor_migrations_executed', 'party_pins_written',
    'gameplay_writes_performed', 'broader_m3_attested', 'limits',
    'attestation_digest'])
      || !exact(bindings, ['candidate_ref', 'candidate_digest',
        'approval_request_ref', 'approval_request_digest', 'subject_commit',
        'lineage', 'release', 'compatible_world',
        'preserved_actor_approval_chain'])
      || attestation?.schema !==
        'rus.spatial_v3_m3_current_schema_development_release_runtime_approval_attestation.v1'
      || attestation.version !== 1
      || attestation.status !==
        'approved_new_development_parties_only_not_executed'
      || attestation.decision !==
        'approve_exact_transactional_registration_activation_readback'
      || attestation.reviewed_repository_head !==
        '4ff55c911350746dc92d2c38d2c7f082196f5c06'
      || attestation.auditor_ref !== '/root/m3_chain_auditor'
      || typeof attestation.independence_basis !== 'string'
      || attestation.independence_basis.length === 0
      || attestation.reviewed_at !== '2026-09-22'
      || attestation.activation_scope !==
        'fresh_new_development_parties_only'
      || attestation.operation !==
        'transactional_registration_activation_exact_readback'
      || bindings?.candidate_ref !== paths.candidate
      || bindings?.candidate_digest !== candidate.candidate_digest
      || bindings?.approval_request_ref !== paths.request
      || bindings?.approval_request_digest !== request.request_digest
      || bindings?.subject_commit !== candidate.subject_commit
      || canonicalDigest(bindings?.lineage) !==
        canonicalDigest(candidate.lineage)
      || canonicalDigest(bindings?.release) !==
        canonicalDigest(candidate.proposed_release)
      || canonicalDigest(bindings?.compatible_world) !==
        canonicalDigest(candidate.compatible_world)
      || canonicalDigest(bindings?.preserved_actor_approval_chain) !==
        canonicalDigest(candidate.preserved_actor_approval_chain)
      || canonicalDigest(permissions) !==
        canonicalDigest(approvedPermissions())
      || truePermissions.length !== 1
      || truePermissions[0] !==
        'transactional_registration_activation_readback_for_new_development_parties_only'
      || canonicalDigest(authority) !== canonicalDigest(approvedAuthority())
      || attestation.activation_executed !== false
      || attestation.database_mutated !== false
      || attestation.actor_migrations_executed !== false
      || attestation.party_pins_written !== false
      || attestation.gameplay_writes_performed !== false
      || attestation.broader_m3_attested !== false
      || typeof attestation.limits !== 'string'
      || attestation.limits.length === 0) {
    throw new Error(
      'SPATIAL_V3_M3_CURRENT_SCHEMA_RELEASE_APPROVAL_ATTESTATION_INVALID'
    );
  }
  assertDigest(attestation, 'attestation_digest',
    'SPATIAL_V3_M3_CURRENT_SCHEMA_RELEASE_APPROVAL_ATTESTATION_DIGEST_INVALID');
  return true;
}

async function loadActorChain() {
  const [importRequest, importAttestation, activationRequest,
    activationAttestation, activationResult] = await Promise.all([
    readJson(paths.actorImportRequest), readJson(paths.actorImportAttestation),
    readJson(paths.actorActivationRequest),
    readJson(paths.actorActivationAttestation),
    readJson(paths.actorActivationResult)
  ]);
  assertDigest(importRequest, 'request_digest', 'ACTOR_IMPORT_REQUEST_INVALID');
  assertDigest(importAttestation, 'attestation_digest',
    'ACTOR_IMPORT_ATTESTATION_INVALID');
  assertDigest(activationRequest, 'request_digest',
    'ACTOR_ACTIVATION_REQUEST_INVALID');
  assertDigest(activationAttestation, 'attestation_digest',
    'ACTOR_ACTIVATION_ATTESTATION_INVALID');
  assertDigest(activationResult, 'result_digest',
    'ACTOR_ACTIVATION_RESULT_INVALID');
  return Object.freeze({
    world_owner_migration: migrationTuple(ACTOR_BASE_ATTRIBUTES_WORLD_MIGRATION),
    party_pin_migration: migrationTuple(ACTOR_BASE_ATTRIBUTES_PARTY_MIGRATION),
    import_request_ref: paths.actorImportRequest,
    import_request_digest: importRequest.request_digest,
    import_attestation_ref: paths.actorImportAttestation,
    import_attestation_digest: importAttestation.attestation_digest,
    activation_request_ref: paths.actorActivationRequest,
    activation_request_digest: activationRequest.request_digest,
    activation_attestation_ref: paths.actorActivationAttestation,
    activation_attestation_digest: activationAttestation.attestation_digest,
    activation_result_ref: paths.actorActivationResult,
    activation_result_digest: activationResult.result_digest
  });
}

function validActorChain(value) {
  const expected = {
    world_owner_migration: migrationTuple(
      ACTOR_BASE_ATTRIBUTES_WORLD_MIGRATION),
    party_pin_migration: migrationTuple(
      ACTOR_BASE_ATTRIBUTES_PARTY_MIGRATION),
    import_request_ref: paths.actorImportRequest,
    import_request_digest:
      'aa7c7ede56c1fd4a9e86533184e5bb2e40906dd8df5966a819065b447b7f4c82',
    import_attestation_ref: paths.actorImportAttestation,
    import_attestation_digest:
      '325c5a239767aeddede89dc3dba69b536e3707dcbc040689e24a9b6725a58d1d',
    activation_request_ref: paths.actorActivationRequest,
    activation_request_digest:
      'e7508e7f7df4aa509150b7f0f4ddad58cbf9a09ce986f82253c6f1ced54758c4',
    activation_attestation_ref: paths.actorActivationAttestation,
    activation_attestation_digest:
      '6946f9eb35e5bdabba77fe336eb6a17f1cd2cdb1038e56dac65287c70e2bbdc3',
    activation_result_ref: paths.actorActivationResult,
    activation_result_digest:
      '50916dc71538da994eebf5810f3397b68a88e43f51479af0abc7ea640fa08c7d'
  };
  return exact(value, ['world_owner_migration', 'party_pin_migration',
    'import_request_ref', 'import_request_digest', 'import_attestation_ref',
    'import_attestation_digest', 'activation_request_ref',
    'activation_request_digest', 'activation_attestation_ref',
    'activation_attestation_digest', 'activation_result_ref',
    'activation_result_digest'])
    && exact(value?.world_owner_migration, ['migration_id',
      'migration_digest', 'source_schema_fingerprint',
      'target_schema_fingerprint'])
    && exact(value?.party_pin_migration, ['migration_id', 'migration_digest',
      'source_schema_fingerprint', 'target_schema_fingerprint'])
    && canonicalDigest(value) === canonicalDigest(expected)
    && value?.world_owner_migration?.source_schema_fingerprint ===
      WORLD_RUNTIME_CATALOG_MIGRATION_V3.target_schema_fingerprint;
}

function migrationTuple(migration) {
  return Object.freeze({
    migration_id: migration.migration_id,
    migration_digest: migration.migration_digest,
    source_schema_fingerprint: migration.source_schema_fingerprint,
    target_schema_fingerprint: migration.target_schema_fingerprint
  });
}

function assertDigest(value, field, code) {
  const { [field]: claimed, ...payload } = value ?? {};
  if (claimed !== canonicalDigest(payload)) throw new Error(code);
}

function exact(value, keys) {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === keys.length
    && keys.every((key) => Object.hasOwn(value, key));
}

async function readJson(path) {
  return JSON.parse(await readFile(resolve(repositoryRoot, path), 'utf8'));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const artifacts = await buildSpatialV3M3CurrentSchemaReleaseArtifacts();
  if (process.argv.includes('--write')) {
    await mkdir(resolve(repositoryRoot, artifactRoot), { recursive: true });
    await Promise.all([
      writeFile(resolve(repositoryRoot, paths.candidate),
        `${JSON.stringify(artifacts.candidate, null, 2)}\n`),
      writeFile(resolve(repositoryRoot, paths.request),
        `${JSON.stringify(artifacts.request, null, 2)}\n`)
    ]);
  } else process.stdout.write(`${JSON.stringify(artifacts, null, 2)}\n`);
}
