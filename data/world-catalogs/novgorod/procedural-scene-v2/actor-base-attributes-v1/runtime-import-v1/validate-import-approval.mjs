import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { canonicalDigest } from '@rus/materialization';
import { validateActorBaseAttributesImportRequest } from
  '../../../../../../scripts/generate-actor-base-attributes-import-request.mjs';

const root = resolve(import.meta.dirname);
const REQUEST_DIGEST =
  'aa7c7ede56c1fd4a9e86533184e5bb2e40906dd8df5966a819065b447b7f4c82';
const REVIEWED_HEAD = 'fe52b346b0277c79f961528de6adea1b7ff738fc';
const requestRef = 'data/world-catalogs/novgorod/procedural-scene-v2/'
  + 'actor-base-attributes-v1/runtime-import-v1/request.json';

const authority = Object.freeze({
  authoring_approved: true,
  import_authorized: true,
  transactional_import_readback_only: true,
  exact_readback_required: true,
  runtime_authorized: false,
  activation_authorized: false,
  production_authorized: false,
  equipment_allocation_activation_authorized: false,
  functional_allocation_runtime_selection_authorized: false,
  runtime_item_creation_authorized: false,
  new_development_party_activation_authorized: false,
  existing_party_migration_authorized: false,
  old_save_rematerialization_authorized: false,
  world_schema_migration_authorized: false,
  party_schema_migration_authorized: false
});

export async function loadActorBaseAttributesImportApproval() {
  const [request, attestation] = await Promise.all([
    readJson('request.json'), readJson('import-approval-attestation.json')
  ]);
  validateActorBaseAttributesImportApproval({ request, attestation });
  return Object.freeze({ request, attestation });
}

export function validateActorBaseAttributesImportApproval({ request,
  attestation }) {
  validateActorBaseAttributesImportRequest(request);
  const owner = request.owner_rows?.[0];
  const targetBinding = {
    catalog_scope: request.catalog_scope,
    target_revision_id: request.target_revision_id,
    target_catalog_digest: request.target_catalog_digest,
    record_registry_digest: request.record_registry_digest,
    runtime_contract_digest: request.runtime_contract_digest
  };
  const authoringBinding = {
    candidate_digest: request.authoring_approval.candidate_digest,
    profile_digest: request.authoring_approval.profile_digest,
    authoring_request_digest: request.authoring_approval.request_digest,
    authoring_attestation_digest: request.authoring_approval.attestation_digest
  };
  const ownerScope = {
    table_name: owner?.table_name,
    operation: owner?.operation,
    profile_id: owner?.row?.profile_id,
    profile_digest: owner?.row?.profile_digest,
    owner_row_digest: canonicalDigest(owner?.row),
    record_count: request.owner_rows.length
  };
  const importScope = {
    transaction: request.import_plan.transaction,
    requested_operations: request.requested_operations,
    exact_readback_required: true,
    activation_event_count: request.import_plan.activation_event_count
  };
  if (!exact(attestation, ['schema','version','status','decision',
    'reviewed_repository_head','auditor_ref','independence_basis','reviewed_at',
    'request_ref','request_digest','target_binding','authoring_binding',
    'owner_scope','import_scope','authority','database_mutated',
    'activation_request','attestation_digest'])
      || attestation.schema !==
        'rus.actor_base_attributes_import_approval_attestation.v1'
      || attestation.version !== 1
      || attestation.status !== 'approved_transactional_import_readback_only'
      || attestation.decision !==
        'approve_exact_actor_base_attributes_transactional_import_readback'
      || attestation.reviewed_repository_head !== REVIEWED_HEAD
      || attestation.auditor_ref !== '/root/m3_chain_auditor'
      || typeof attestation.independence_basis !== 'string'
      || attestation.independence_basis.length === 0
      || attestation.reviewed_at !== '2026-09-22'
      || attestation.request_ref !== requestRef
      || request.request_digest !== REQUEST_DIGEST
      || attestation.request_digest !== request.request_digest
      || canonicalDigest(attestation.target_binding) !==
        canonicalDigest(targetBinding)
      || canonicalDigest(attestation.authoring_binding) !==
        canonicalDigest(authoringBinding)
      || canonicalDigest(attestation.owner_scope) !== canonicalDigest(ownerScope)
      || canonicalDigest(attestation.import_scope) !==
        canonicalDigest(importScope)
      || canonicalDigest(attestation.authority) !== canonicalDigest(authority)
      || attestation.database_mutated !== false
      || attestation.activation_request !== null) {
    throw new Error('ACTOR_BASE_ATTRIBUTES_IMPORT_APPROVAL_INVALID');
  }
  const { attestation_digest: claimed, ...core } = attestation;
  if (claimed !== canonicalDigest(core)) {
    throw new Error('ACTOR_BASE_ATTRIBUTES_IMPORT_APPROVAL_DIGEST_INVALID');
  }
  return true;
}

function exact(value, keys) {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === keys.length
    && keys.every((key) => Object.hasOwn(value, key));
}

async function readJson(name) {
  return JSON.parse(await readFile(resolve(root, name), 'utf8'));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { attestation } = await loadActorBaseAttributesImportApproval();
  console.log(JSON.stringify({ pass: true,
    request_digest: REQUEST_DIGEST,
    attestation_digest: attestation.attestation_digest }));
}
