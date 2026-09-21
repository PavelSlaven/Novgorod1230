import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { canonicalDigest } from '@rus/materialization';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const gate1Root =
  'data/world-catalogs/novgorod/runtime-catalog/gate1-owner-data-v1';
const paths = Object.freeze({
  predecessor: `${gate1Root}/activation-request.json`,
  result: `${gate1Root}/import-readback-result.json`,
  parentAttestation: `${gate1Root}/authoring-approval-attestation.json`,
  reconciliationCandidate:
    `${gate1Root}/source-record-reconciliation-v1/candidate.json`,
  reconciliationRequest:
    `${gate1Root}/source-record-reconciliation-v1/request.json`,
  reconciliationAttestation:
    `${gate1Root}/source-record-reconciliation-v1/authoring-approval-attestation.json`,
  seedAttestation:
    `${gate1Root}/seed-closure-v1/authoring-approval-attestation.json`,
  output: `${gate1Root}/activation-amendment-v1/request.json`,
  restartTest: 'test/integration/gate1-owner-data-import-postgres.test.js'
});

const readJson = async (path) => JSON.parse(await readFile(
  resolve(repositoryRoot, path), 'utf8'));
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const fileBinding = async (path) => Object.freeze({ path,
  sha256: sha256(await readFile(resolve(repositoryRoot, path))) });
const noAuthority = () => Object.freeze({
  approval_attestation_present: false,
  import_authorized: false,
  activation_authorized: false,
  production_authorized: false,
  existing_party_migration_authorized: false,
  old_save_rematerialization_authorized: false,
  authoring_only_functional_allocation_runtime_selection: false,
  runtime_item_creation_authorized: false
});

export async function buildGate1ActivationAmendmentRequest() {
  const [predecessor, result, parentAttestation, reconciliationCandidate,
    reconciliationRequest, reconciliationAttestation, seedAttestation,
    predecessorFile, resultFile, parentAttestationFile,
    reconciliationCandidateFile, reconciliationRequestFile,
    reconciliationAttestationFile, seedAttestationFile, restartTestFile] =
    await Promise.all([
      readJson(paths.predecessor), readJson(paths.result),
      readJson(paths.parentAttestation),
      readJson(paths.reconciliationCandidate),
      readJson(paths.reconciliationRequest),
      readJson(paths.reconciliationAttestation),
      readJson(paths.seedAttestation),
      fileBinding(paths.predecessor), fileBinding(paths.result),
      fileBinding(paths.parentAttestation),
      fileBinding(paths.reconciliationCandidate),
      fileBinding(paths.reconciliationRequest),
      fileBinding(paths.reconciliationAttestation),
      fileBinding(paths.seedAttestation), fileBinding(paths.restartTest)
    ]);
  const readback = result.first_state?.gate1_owner_readback;
  if (predecessor.status !== 'pending_independent_runtime_approval'
      || result.status !== 'imported_exact_readback_verified'
      || result.rollback !== 'pass'
      || result.repeat_clean_apply !== true
      || canonicalDigest(result.first_state) !==
        canonicalDigest(result.repeated_state)
      || result.activation_performed !== false
      || result.production_activation !== false
      || result.existing_parties_rematerialized !== false
      || result.runtime_item_creation_authorized !== false
      || result.candidate_digest !==
        reconciliationRequest.amended_stage3c_candidate_digest
      || result.approval_request_digest !==
        reconciliationRequest.amended_stage3c_approval_request_digest
      || result.target_revision_id !==
        predecessor.requested_catalog.target_revision.id
      || readback?.authoring_attestation_digest !==
        parentAttestation.attestation_digest
      || readback?.reconciliation_attestation_digest !==
        reconciliationAttestation.attestation_digest
      || readback?.seed_closure_attestation_digest !==
        seedAttestation.attestation_digest
      || canonicalDigest(readback?.compatible_worlds) !== canonicalDigest(
        predecessor.compatible_worlds.map(({ release_id, world_revision_id,
          world_catalog_digest }) => ({ release_id, world_revision_id,
          world_catalog_digest })))) {
    throw new Error('GATE1_ACTIVATION_AMENDMENT_SOURCE_INVALID');
  }
  const payload = {
    schema: 'rus.gate1_v5_v6_activation_request_amendment.v1',
    status: 'pending_independent_runtime_approval',
    operation: 'amend_activation_request_after_exact_import_readback',
    predecessor: Object.freeze({ ...predecessorFile,
      request_digest: predecessor.request_digest,
      canonical_digest: canonicalDigest(predecessor) }),
    completed_import_readback: Object.freeze({ ...resultFile,
      canonical_digest: canonicalDigest(result),
      status: result.status,
      rollback: result.rollback,
      repeat_clean_apply: result.repeat_clean_apply,
      restart_verified: true,
      restart_verification: restartTestFile,
      import_completed: true,
      requests_new_import_authority: false }),
    reconciled_stage3c: Object.freeze({
      candidate: Object.freeze({ ...reconciliationCandidateFile,
        reconciliation_candidate_digest:
          reconciliationCandidate.candidate_digest,
        amended_stage3c_candidate_digest:
          reconciliationCandidate.amended_stage3c_manifest.candidate_digest }),
      request: Object.freeze({ ...reconciliationRequestFile,
        reconciliation_request_digest: reconciliationRequest.request_digest,
        amended_stage3c_candidate_digest:
          reconciliationRequest.amended_stage3c_candidate_digest,
        amended_stage3c_approval_request_digest:
          reconciliationRequest.amended_stage3c_approval_request_digest })
    }),
    target_catalog: Object.freeze({
      revision_id: result.target_revision_id,
      catalog_digest: result.target_catalog_digest,
      status: result.first_state.target_revision_status
    }),
    approval_chain: Object.freeze({
      parent: Object.freeze({ ...parentAttestationFile,
        attestation_digest: parentAttestation.attestation_digest }),
      reconciliation: Object.freeze({ ...reconciliationAttestationFile,
        attestation_digest: reconciliationAttestation.attestation_digest }),
      seed_closure: Object.freeze({ ...seedAttestationFile,
        attestation_digest: seedAttestation.attestation_digest })
    }),
    compatible_world_pins: Object.freeze(predecessor.compatible_worlds.map(
      (world) => Object.freeze({ ...world }))),
    world_revisions_digest: readback.world_revisions_digest,
    requested_permissions: Object.freeze({
      activate_for_new_development_parties_only: true,
      import_approved_item_container_catalog: false,
      production_activation: false,
      existing_party_migration: false,
      old_save_rematerialization: false,
      authoring_only_functional_allocation_runtime_selection: false,
      runtime_item_creation: false
    }),
    required_independent_decision:
      'approve_exact_new_development_runtime_activation_amendment',
    authority: noAuthority()
  };
  const request = Object.freeze({ ...payload,
    request_digest: canonicalDigest(payload) });
  validatePendingGate1ActivationAmendment(request);
  return request;
}

export function validatePendingGate1ActivationAmendment(request) {
  const permissions = request.requested_permissions ?? {};
  const truePermissions = Object.entries(permissions)
    .filter(([, value]) => value === true).map(([key]) => key);
  if (request.schema !==
        'rus.gate1_v5_v6_activation_request_amendment.v1'
      || request.status !== 'pending_independent_runtime_approval'
      || request.predecessor?.request_digest !==
        '81435027867fdc0060c117c0afaa4b20ed6cb3650a4f6067855c15e299457f29'
      || request.completed_import_readback?.status !==
        'imported_exact_readback_verified'
      || request.completed_import_readback?.rollback !== 'pass'
      || request.completed_import_readback?.repeat_clean_apply !== true
      || request.completed_import_readback?.restart_verified !== true
      || request.completed_import_readback?.import_completed !== true
      || request.completed_import_readback?.requests_new_import_authority !==
        false
      || request.completed_import_readback?.path !== paths.result
      || request.completed_import_readback?.restart_verification?.path !==
        paths.restartTest
      || request.target_catalog?.status !== 'approved'
      || request.target_catalog?.revision_id !==
        'world_revision_novgorod_1230_item_container_approved_001'
      || request.target_catalog?.catalog_digest !==
        '1d5fd4cd3c7dd9946d68276011cd3264e6e2ccd12f67486171928e18b56451f5'
      || request.reconciled_stage3c?.candidate
        ?.amended_stage3c_candidate_digest !==
        request.reconciled_stage3c?.request?.amended_stage3c_candidate_digest
      || request.reconciled_stage3c?.request
        ?.amended_stage3c_approval_request_digest !==
        '06acf781d0a2c7eb3deba1884f4d1d004e50676ff1d95cd089498d87a79557d9'
      || request.compatible_world_pins?.length !== 2
      || request.world_revisions_digest !==
        '539c7191d85397403566e3562c9ce6ff7086a685dc291d93507512cb8c61b932'
      || canonicalDigest(request.compatible_world_pins.map(({ release_id,
        world_revision_id, world_catalog_digest }) => ({ release_id,
        world_revision_id, world_catalog_digest }))) !== canonicalDigest([
        { release_id: 'spatial-v3-production-v5',
          world_revision_id:
            'novgorod_spatial_v3_production_v5_candidate_001',
          world_catalog_digest:
            'e616cdd4b7a09db06b7adb7b3faf2a82e0840d6aa286ad65ebbd97e0b86260ad' },
        { release_id: 'spatial-v3-production-v6',
          world_revision_id:
            'novgorod_spatial_v3_production_v6_candidate_001',
          world_catalog_digest:
            '6e6cd611042ff86229c73409816893ea4e983c01722dd4699bac346acfb846ad' }
      ])
      || request.approval_chain?.parent?.path !== paths.parentAttestation
      || request.approval_chain?.reconciliation?.path !==
        paths.reconciliationAttestation
      || request.approval_chain?.seed_closure?.path !== paths.seedAttestation
      || Object.values(request.approval_chain ?? {}).some((binding) =>
        !/^[a-f0-9]{64}$/u.test(binding?.attestation_digest ?? ''))
      || truePermissions.length !== 1
      || truePermissions[0] !==
        'activate_for_new_development_parties_only'
      || permissions.import_approved_item_container_catalog !== false
      || permissions.production_activation !== false
      || permissions.existing_party_migration !== false
      || permissions.old_save_rematerialization !== false
      || permissions.authoring_only_functional_allocation_runtime_selection
        !== false
      || permissions.runtime_item_creation !== false) {
    throw new Error('GATE1_ACTIVATION_AMENDMENT_INVALID');
  }
  if (Object.values(request.authority ?? {}).some((value) => value !== false)) {
    throw new Error('GATE1_ACTIVATION_AMENDMENT_AUTHORITY_FORBIDDEN');
  }
  const { request_digest: claimed, ...payload } = request;
  if (claimed !== canonicalDigest(payload)) {
    throw new Error('GATE1_ACTIVATION_AMENDMENT_DIGEST_INVALID');
  }
  return true;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const request = await buildGate1ActivationAmendmentRequest();
  if (process.argv.includes('--write')) {
    await mkdir(dirname(resolve(repositoryRoot, paths.output)),
      { recursive: true });
    await writeFile(resolve(repositoryRoot, paths.output),
      `${JSON.stringify(request, null, 2)}\n`);
  } else {
    process.stdout.write(`${JSON.stringify(request, null, 2)}\n`);
  }
}
