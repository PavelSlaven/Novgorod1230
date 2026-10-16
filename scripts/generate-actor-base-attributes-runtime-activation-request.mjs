import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { canonicalDigest } from '@rus/materialization';
import { loadActorBaseAttributesImportApproval } from
  '../data/world-catalogs/novgorod/procedural-scene-v2/actor-base-attributes-v1/runtime-import-v1/validate-import-approval.mjs';
import { validateActorBaseAttributesImportResult } from
  '../tools/runtime-catalog-activation/src/actor-base-attributes-import.js';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const artifactRoot = 'data/world-catalogs/novgorod/procedural-scene-v2/'
  + 'actor-base-attributes-v1';
const importRoot = `${artifactRoot}/runtime-import-v1`;
const activationRoot = `${artifactRoot}/runtime-activation-v1`;
const SUBJECT_COMMIT = '4dd9ce8f37a30383d9ebf0ac01f259f4711c419f';
const REVIEWED_REQUEST_HEAD =
  'be80cd6e8f3d559e7029784f2502d3e487ddf306';
const RESULT_DIGEST =
  'a7b53cba14db670ad3b4b18e2944a64058cdab95458ee7a4848c85352b122f55';
const paths = Object.freeze({
  importRequest: `${importRoot}/request.json`,
  importAttestation: `${importRoot}/import-approval-attestation.json`,
  importResult: `${importRoot}/import-readback-result.json`,
  output: `${activationRoot}/request.json`
});

const requestedPermissions = () => Object.freeze({
  activate_actor_base_attributes_runtime_selection_for_new_development_parties_only:
    true,
  import_actor_base_attributes_catalog: false,
  production_activation: false,
  equipment_allocation_activation: false,
  functional_allocation_runtime_selection: false,
  runtime_item_creation: false,
  existing_party_migration: false,
  old_save_rematerialization: false,
  world_schema_migration: false,
  party_schema_migration: false
});

const pendingAuthority = () => Object.freeze({
  approval_attestation_present: false,
  import_authorized: false,
  runtime_authorized: false,
  activation_authorized: false,
  actor_base_attributes_runtime_selection_authorized: false,
  new_development_party_activation_authorized: false,
  production_authorized: false,
  equipment_allocation_activation_authorized: false,
  functional_allocation_runtime_selection_authorized: false,
  runtime_item_creation_authorized: false,
  existing_party_migration_authorized: false,
  old_save_rematerialization_authorized: false,
  world_schema_migration_authorized: false,
  party_schema_migration_authorized: false
});

export async function buildActorBaseAttributesRuntimeActivationRequest() {
  const approval = await loadActorBaseAttributesImportApproval();
  const result = JSON.parse(await readFile(resolve(repositoryRoot,
    paths.importResult), 'utf8'));
  validateActorBaseAttributesImportResult({ result, ...approval });
  if (result.result_digest !== RESULT_DIGEST
      || result.activation_event_count !== 0) {
    throw new Error('ACTOR_BASE_ATTRIBUTES_ACTIVATION_SOURCE_INVALID');
  }
  const payload = {
    schema: 'rus.actor_base_attributes_runtime_activation_request.v1',
    version: 1,
    status: 'pending_independent_runtime_approval',
    subject_commit: SUBJECT_COMMIT,
    operation:
      'activate_actor_base_attributes_for_new_development_parties_only',
    activation_scope: 'new_development_parties_only',
    runtime_capability: 'actor_base_attributes_runtime_selection',
    completed_import_readback: {
      request_ref: paths.importRequest,
      request_digest: approval.request.request_digest,
      import_approval_attestation_ref: paths.importAttestation,
      import_approval_attestation_digest:
        approval.attestation.attestation_digest,
      result_ref: paths.importResult,
      result_digest: result.result_digest,
      import_id: result.import_id,
      import_audit_digest: result.import_audit_digest,
      activation_event_count: result.activation_event_count,
      exact_readback_verified: true,
      requests_new_import_authority: false
    },
    target_binding: {
      catalog_scope: approval.request.catalog_scope,
      target_revision_id: result.target_revision_id,
      target_catalog_digest: result.target_catalog_digest,
      record_registry_digest: result.record_registry_digest,
      runtime_contract_digest: result.runtime_contract_digest,
      parent_catalog: approval.request.parent_catalog,
      compatible_world: approval.request.compatible_world,
      profile_id: result.profile_id,
      profile_digest: result.profile_digest,
      owner_row_digest: result.owner_row_digest
    },
    requested_permissions: requestedPermissions(),
    required_independent_decision:
      'approve_exact_actor_base_attributes_new_development_runtime_activation',
    authority: pendingAuthority(),
    independent_runtime_activation_attestation: null
  };
  const request = Object.freeze({ ...payload,
    request_digest: canonicalDigest(payload) });
  validatePendingActorBaseAttributesRuntimeActivationRequest(request);
  return request;
}

export function validatePendingActorBaseAttributesRuntimeActivationRequest(
  request) {
  const importReadback = request?.completed_import_readback;
  const binding = request?.target_binding;
  const permissions = request?.requested_permissions ?? {};
  const truePermissions = Object.entries(permissions)
    .filter(([, value]) => value === true).map(([key]) => key);
  if (!exact(request, ['schema', 'version', 'status', 'subject_commit',
    'operation', 'activation_scope', 'runtime_capability',
    'completed_import_readback', 'target_binding', 'requested_permissions',
    'required_independent_decision', 'authority',
    'independent_runtime_activation_attestation', 'request_digest'])
      || request.schema !==
        'rus.actor_base_attributes_runtime_activation_request.v1'
      || request.version !== 1
      || request.status !== 'pending_independent_runtime_approval'
      || request.subject_commit !== SUBJECT_COMMIT
      || request.operation !==
        'activate_actor_base_attributes_for_new_development_parties_only'
      || request.activation_scope !== 'new_development_parties_only'
      || request.runtime_capability !==
        'actor_base_attributes_runtime_selection'
      || !exact(importReadback, ['request_ref', 'request_digest',
        'import_approval_attestation_ref',
        'import_approval_attestation_digest', 'result_ref', 'result_digest',
        'import_id', 'import_audit_digest', 'activation_event_count',
        'exact_readback_verified', 'requests_new_import_authority'])
      || importReadback.request_ref !== paths.importRequest
      || importReadback.request_digest !==
        'aa7c7ede56c1fd4a9e86533184e5bb2e40906dd8df5966a819065b447b7f4c82'
      || importReadback.import_approval_attestation_ref !==
        paths.importAttestation
      || importReadback.import_approval_attestation_digest !==
        '325c5a239767aeddede89dc3dba69b536e3707dcbc040689e24a9b6725a58d1d'
      || importReadback.result_ref !== paths.importResult
      || importReadback.result_digest !== RESULT_DIGEST
      || importReadback.import_id !==
        'actor_base_attributes_import_325c5a239767aeddede89dc3dba69b536e3707dcbc040689'
      || importReadback.import_audit_digest !==
        '4cf3405afcdef240f5237a3ac1f7734907694bdab66ac0995750a4a75a788522'
      || importReadback.activation_event_count !== 0
      || importReadback.exact_readback_verified !== true
      || importReadback.requests_new_import_authority !== false
      || !exact(binding, ['catalog_scope', 'target_revision_id',
        'target_catalog_digest', 'record_registry_digest',
        'runtime_contract_digest', 'parent_catalog', 'compatible_world',
        'profile_id', 'profile_digest', 'owner_row_digest'])
      || binding.catalog_scope !== 'actor_base_attributes_v1'
      || binding.target_revision_id !==
        'actor_base_attributes_runtime_profile_v1_001'
      || binding.target_catalog_digest !==
        '8c10492236dfcc5e1c00f44960a76f7811b9b4e4d8c62e6698a3f12502dd25b8'
      || binding.record_registry_digest !==
        '6815792a38bf8e0a10f405941bd7116b597805ef68ce8f0a5c4b9c95123e2e64'
      || binding.runtime_contract_digest !==
        '2151d75852f23b3b70b0c1f0cafec50bad98de5759c580e00e4eead5a06512c0'
      || binding.compatible_world?.compatible_world_pin_manifest_digest !==
        'a5bb6d732ea34fb6c37b3889398b362cc8ed18ce73f9fb387ea9d9d657cb5ddd'
      || binding.profile_id !==
        'novgorod_ordinary_actor_base_attributes_v1'
      || binding.profile_digest !==
        '5643edda6b0993cfe100bee8c1366928167b3b487d6c51d91a70e546644965b7'
      || binding.owner_row_digest !==
        '865bbf0155ae1206860536bd3eaff15ceddea14ce21507e7579188994cbc4b82'
      || truePermissions.length !== 1
      || truePermissions[0] !==
        'activate_actor_base_attributes_runtime_selection_for_new_development_parties_only'
      || canonicalDigest(permissions) !==
        canonicalDigest(requestedPermissions())
      || Object.values(request.authority ?? {})
        .some((value) => value !== false)
      || canonicalDigest(request.authority) !==
        canonicalDigest(pendingAuthority())
      || request.required_independent_decision !==
        'approve_exact_actor_base_attributes_new_development_runtime_activation'
      || request.independent_runtime_activation_attestation !== null) {
    throw new Error('ACTOR_BASE_ATTRIBUTES_RUNTIME_ACTIVATION_REQUEST_INVALID');
  }
  const { request_digest: claimed, ...payload } = request;
  if (claimed !== canonicalDigest(payload)) {
    throw new Error(
      'ACTOR_BASE_ATTRIBUTES_RUNTIME_ACTIVATION_REQUEST_DIGEST_INVALID');
  }
  return true;
}

export function validateActorBaseAttributesRuntimeActivationAttestation({
  request, attestation
}) {
  validatePendingActorBaseAttributesRuntimeActivationRequest(request);
  const approvedBindings = {
    completed_import_readback: request.completed_import_readback,
    target_binding: request.target_binding
  };
  const authority = Object.freeze({
    approval_attestation_present: true,
    import_authorized: false,
    runtime_authorized: true,
    activation_authorized: true,
    actor_base_attributes_runtime_selection_authorized: true,
    new_development_party_activation_authorized: true,
    production_authorized: false,
    equipment_allocation_activation_authorized: false,
    functional_allocation_runtime_selection_authorized: false,
    runtime_item_creation_authorized: false,
    existing_party_migration_authorized: false,
    old_save_rematerialization_authorized: false,
    world_schema_migration_authorized: false,
    party_schema_migration_authorized: false
  });
  if (!exact(attestation, ['schema', 'version', 'status', 'decision',
    'reviewed_repository_head', 'auditor_ref', 'independence_basis',
    'reviewed_at', 'activation_request_ref', 'activation_request_digest',
    'activation_scope', 'runtime_capability', 'approved_bindings',
    'approved_permissions', 'authority', 'activation_executed',
    'database_mutated', 'broader_m3_attested', 'attestation_digest'])
      || attestation.schema !==
        'rus.actor_base_attributes_runtime_activation_approval_attestation.v1'
      || attestation.version !== 1
      || attestation.status !==
        'approved_new_development_parties_only_not_executed'
      || attestation.decision !==
        'approve_exact_actor_base_attributes_new_development_runtime_activation'
      || attestation.reviewed_repository_head !== REVIEWED_REQUEST_HEAD
      || attestation.auditor_ref !== '/root/m3_chain_auditor'
      || typeof attestation.independence_basis !== 'string'
      || attestation.independence_basis.length === 0
      || attestation.reviewed_at !== '2026-09-22'
      || attestation.activation_request_ref !== paths.output
      || attestation.activation_request_digest !== request.request_digest
      || attestation.activation_scope !== request.activation_scope
      || attestation.runtime_capability !== request.runtime_capability
      || canonicalDigest(attestation.approved_bindings) !==
        canonicalDigest(approvedBindings)
      || canonicalDigest(attestation.approved_permissions) !==
        canonicalDigest(request.requested_permissions)
      || canonicalDigest(attestation.authority) !== canonicalDigest(authority)
      || attestation.activation_executed !== false
      || attestation.database_mutated !== false
      || attestation.broader_m3_attested !== false) {
    throw new Error(
      'ACTOR_BASE_ATTRIBUTES_RUNTIME_ACTIVATION_ATTESTATION_INVALID');
  }
  const { attestation_digest: claimed, ...payload } = attestation;
  if (claimed !== canonicalDigest(payload)) {
    throw new Error(
      'ACTOR_BASE_ATTRIBUTES_RUNTIME_ACTIVATION_ATTESTATION_DIGEST_INVALID');
  }
  return true;
}

function exact(value, keys) {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === keys.length
    && keys.every((key) => Object.hasOwn(value, key));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const request = await buildActorBaseAttributesRuntimeActivationRequest();
  if (process.argv.includes('--write')) {
    await mkdir(dirname(resolve(repositoryRoot, paths.output)),
      { recursive: true });
    await writeFile(resolve(repositoryRoot, paths.output),
      `${JSON.stringify(request, null, 2)}\n`);
  } else {
    process.stdout.write(`${JSON.stringify(request, null, 2)}\n`);
  }
}
