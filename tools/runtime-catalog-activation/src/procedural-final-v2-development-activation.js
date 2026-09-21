import {
  buildActivationRequest, buildDevelopmentPartyPreflight,
  buildRuntimeReleaseIdentity, digestEnvelope
} from './artifact-contracts.js';
import { activateApprovedCatalog } from './operator-executors.js';
import { RUNTIME_CATALOG_FIRST_PLAYABLE_CONTRACT_DIGEST } from
  '@rus/runtime-catalog/runtime-contract';

const V1 = Object.freeze({
  revision: 'procedural_scene_final_candidate_v1_001',
  catalog: '4ece07fb44abff19490f998a8712144ff18c76daa3080489b51f1df3e705950c',
  approval: '0204d109cbe18d06aed0957be3c10d12a088e15368cc0e7eb865b1382538ef7c',
  event: 'runtime_catalog_activation_94447901cebfed28716db756f089d0e4',
  importAudit: 'd5ab73748cd0f79a9064be2434899faa5eac70e96f011f2d09d48657031aa117',
  activationAttestation:
    'c81c4965fea835ed8f5769a0cb21fec3b4be50cbb9a87735808bf4020487f97a'
});
const V2 = Object.freeze({
  revision: 'procedural_scene_final_candidate_v2_001',
  catalog: '6fcf5c50d01bd56605a037de3d79cd1aa5e56a1c520db70bd0ab5b6ade6b1361',
  candidate: '65d973f8f06ab78a38b5bda7b24cf8661da1b8b9a581742c224cfa8b1c39bdc6',
  importApproval: '2917b993a9e9c63e1989725cee35e63bd0ed32dfece583a782dfb27f1c3f4772',
  allocationApproval: '692960ad7561b60a0793f1f3fb097e757f8975aa91ec42251296edc6213b552a',
  importId: 'procedural_final_v2_import_2917b993a9e9c63e1989725cee35e63b',
  importAudit: '6ad18c6f40185fa540bf7e3ec3bbb5d5b96e95c370b5e70c657a0db73c29f3b2'
});
const USER_AUTHORIZATION = 'user_authorization_current_task';
const CURRENT_SCHEMA_SUCCESSOR = 'procedural_final_current_schema_v2_successor';

export async function buildProceduralFinalV2DevelopmentActivation({ worldPool,
  partyPool, v1Pack, v2Pack, v2ApprovalAttestation, ledger, gitCommitSha,
  authorizationRef = USER_AUTHORIZATION, currentSchemaSuccessor = false }) {
  assertV2Inputs({ v1Pack, v2Pack, v2ApprovalAttestation, ledger,
    authorizationRef });
  const runtimeRelease = buildRuntimeReleaseIdentity({ gitCommitSha,
    buildReleaseManifestDigest: digestEnvelope({
      schema: currentSchemaSuccessor
        ? 'rus.procedural_final_current_schema_v2_development_release.v1'
        : 'rus.procedural_final_v2_development_release.v1',
      candidate_digest: V2.candidate,
      import_audit_digest: ledger.root.import_audit_digest,
      activation_scope: 'new_development_parties_only',
      production_deploy: false,
      ...(currentSchemaSuccessor ? { activation_chain: CURRENT_SCHEMA_SUCCESSOR } : {})
    }),
    supportedRuntimeContractDigests: [
      RUNTIME_CATALOG_FIRST_PLAYABLE_CONTRACT_DIGEST]
  });
  const counts = (await partyPool.query(
    `SELECT
       (SELECT count(*)::int FROM party_runtime.parties) AS party_count,
       (SELECT count(DISTINCT party_id)::int
          FROM party_runtime.party_catalog_pins
         WHERE catalog_scope='item_container_materialization_v2')
          AS pinned_party_count,
       (SELECT count(*)::int FROM party_runtime.parties p
          LEFT JOIN party_runtime.party_catalog_pins c
            ON c.party_id=p.party_id
           AND c.catalog_scope='item_container_materialization_v2'
         WHERE c.party_id IS NULL) AS missing_domain_pin_count,
       (SELECT count(*)::int FROM party_runtime.commit_idempotency
         WHERE status IN ('reserved','transaction_committed')) AS inflight_count`
  )).rows[0];
  const partyPreflight = buildDevelopmentPartyPreflight({
    partyCount: Number(counts.party_count),
    pinnedPartyCount: Number(counts.pinned_party_count),
    missingDomainPinCount: Number(counts.missing_domain_pin_count),
    inflightStage24Stage25Count: Number(counts.inflight_count),
    runtimeReleaseId: runtimeRelease.runtime_release_id,
    runtimeContractDigest: RUNTIME_CATALOG_FIRST_PLAYABLE_CONTRACT_DIGEST
  });
  const predecessor = (await worldPool.query(
    `SELECT event_id,event_sequence,catalog_revision_id,catalog_digest,
            import_audit_digest,attestation_digest,request_digest,runtime_release_id
       FROM world_base.runtime_catalog_activation_events
      WHERE catalog_scope='item_container_materialization_v2'
      ORDER BY event_sequence DESC LIMIT 1`
  )).rows[0];
  if (!(currentSchemaSuccessor
    ? validCurrentSchemaV1Activation(predecessor)
    : predecessor?.event_id === V1.event
      && predecessor.catalog_revision_id === V1.revision
      && predecessor.catalog_digest === V1.catalog
      && predecessor.import_audit_digest === V1.importAudit
      && predecessor.attestation_digest === V1.activationAttestation)) fail(
    'PROCEDURAL_FINAL_V2_PREDECESSOR_INVALID');
  const request = buildActivationRequest({ fields: {
    parent_revision_id: ledger.root.parent_revision_id,
    parent_catalog_digest: ledger.root.parent_catalog_digest,
    parent_snapshot_manifest_digest: ledger.root.parent_snapshot_manifest_digest,
    compatible_world_revision_id: ledger.root.compatible_world_revision_id,
    compatible_world_catalog_digest: ledger.root.compatible_world_catalog_digest,
    compatible_world_pin_manifest_digest:
      ledger.root.compatible_world_pin_manifest_digest,
    target_revision_id: ledger.root.target_revision_id,
    target_catalog_digest: ledger.root.target_catalog_digest,
    record_registry_digest: ledger.root.record_registry_digest,
    runtime_contract_digest: RUNTIME_CATALOG_FIRST_PLAYABLE_CONTRACT_DIGEST,
    import_id: ledger.root.import_id,
    import_audit_digest: ledger.root.import_audit_digest,
    promotion_manifest_digest: ledger.root.promotion_manifest_digest,
    approval_request_digest: ledger.root.approval_request_digest,
    approval_attestation_digest: ledger.root.approval_attestation_digest,
    expected_previous_event_id: predecessor.event_id,
    runtime_release_id: runtimeRelease.runtime_release_id
  }, partyPreflight });
  const payload = activationAttestationPayload({ request, predecessor,
    currentSchemaSuccessor });
  const attestation = Object.freeze({ ...payload,
    attestation_digest: digestEnvelope(payload) });
  return Object.freeze({
    schema: currentSchemaSuccessor
      ? 'rus.procedural_final_current_schema_v2_development_activation_bundle.v1'
      : 'rus.procedural_final_v2_development_activation_bundle.v1',
    activation_scope: 'new_development_parties_only', runtimeRelease,
    partyPreflight, request, attestation
  });
}

export function buildProceduralFinalCurrentSchemaV2DevelopmentActivation(options) {
  return buildProceduralFinalV2DevelopmentActivation({
    ...options, authorizationRef: USER_AUTHORIZATION,
    currentSchemaSuccessor: true
  });
}

export function applyProceduralFinalV2DevelopmentActivation({ worldPool,
  partyPool, bundle }) {
  assertProceduralFinalV2DevelopmentActivationBoundary(bundle);
  return activateApprovedCatalog({ worldPool, partyPool,
    request: bundle.request, attestation: bundle.attestation,
    activationScope: bundle.activation_scope });
}

export function applyProceduralFinalCurrentSchemaV2DevelopmentActivation({
  worldPool, partyPool, bundle
}) {
  assertProceduralFinalCurrentSchemaV2DevelopmentActivationBoundary(bundle);
  return activateApprovedCatalog({ worldPool, partyPool,
    request: bundle.request, attestation: bundle.attestation,
    activationScope: bundle.activation_scope });
}

export function assertProceduralFinalV2DevelopmentActivationBoundary(bundle) {
  const attestation = bundle?.attestation;
  const { attestation_digest: claimed, ...payload } = attestation ?? {};
  const predecessor = {
    event_id: bundle?.request?.expected_previous_event_id,
    catalog_revision_id: V1.revision,
    catalog_digest: V1.catalog,
    import_audit_digest: attestation?.predecessor_import_audit_digest,
    attestation_digest: attestation?.predecessor_activation_attestation_digest
  };
  if (bundle?.activation_scope !== 'new_development_parties_only'
      || claimed !== digestEnvelope(payload)
      || JSON.stringify(payload) !== JSON.stringify(
        activationAttestationPayload({ request: bundle.request, predecessor,
          currentSchemaSuccessor: bundle?.schema
            === 'rus.procedural_final_current_schema_v2_development_activation_bundle.v1' }))) {
    fail('PROCEDURAL_FINAL_V2_DEVELOPMENT_ACTIVATION_BOUNDARY_INVALID');
  }
  return bundle;
}

export function assertProceduralFinalCurrentSchemaV2DevelopmentActivationBoundary(bundle) {
  assertProceduralFinalV2DevelopmentActivationBoundary(bundle);
  if (bundle?.schema
      !== 'rus.procedural_final_current_schema_v2_development_activation_bundle.v1'
      || bundle.attestation?.activation_chain !== CURRENT_SCHEMA_SUCCESSOR) {
    fail('PROCEDURAL_CURRENT_SCHEMA_V2_ACTIVATION_BOUNDARY_INVALID');
  }
  return bundle;
}

function assertV2Inputs({ v1Pack, v2Pack, v2ApprovalAttestation, ledger,
  authorizationRef }) {
  if (authorizationRef !== USER_AUTHORIZATION
      || v1Pack?.target_revision_id !== V1.revision
      || v1Pack?.target_catalog_digest !== V1.catalog
      || v1Pack?.independent_attestation?.attestation_digest !== V1.approval
      || v2Pack?.target_revision_id !== V2.revision
      || v2Pack?.target_catalog_digest !== V2.catalog
      || v2Pack?.candidate_digest !== V2.candidate
      || v2Pack?.allocation_source?.approval_attestation_digest
        !== V2.allocationApproval
      || v2ApprovalAttestation?.attestation_digest !== V2.importApproval
      || v2ApprovalAttestation?.candidate_digest !== V2.candidate
      || ledger?.root?.target_revision_id !== V2.revision
      || ledger.root.target_catalog_digest !== V2.catalog
      || ledger.root.approval_attestation_digest !== V2.importApproval
      || ledger.root.import_id !== V2.importId
      || ledger.root.import_audit_digest !== V2.importAudit) {
    fail('PROCEDURAL_FINAL_V2_DEVELOPMENT_ACTIVATION_INPUT_INVALID');
  }
}

function activationAttestationPayload({ request, predecessor,
  currentSchemaSuccessor = false }) {
  return {
    schema: 'rus.runtime_catalog_activation_attestation.v2',
    activation_request_digest: request?.activation_request_digest,
    catalog_scope: request?.catalog_scope,
    target_revision_id: request?.target_revision_id,
    target_catalog_digest: request?.target_catalog_digest,
    import_id: request?.import_id,
    import_audit_digest: request?.import_audit_digest,
    runtime_contract_digest: request?.runtime_contract_digest,
    runtime_release_id: request?.runtime_release_id,
    decision: 'approve_activation',
    activation_scope: 'new_development_parties_only',
    v2_candidate_digest: V2.candidate,
    v2_import_approval_attestation_digest: V2.importApproval,
    actor_allocation_approval_attestation_digest: V2.allocationApproval,
    predecessor_activation_event_id: predecessor?.event_id,
    predecessor_revision_id: predecessor?.catalog_revision_id,
    predecessor_catalog_digest: predecessor?.catalog_digest,
    predecessor_import_audit_digest: predecessor?.import_audit_digest,
    predecessor_activation_attestation_digest: predecessor?.attestation_digest,
    existing_party_migration_authorized: false,
    old_save_rematerialization_authorized: false,
    production_deploy_authorized: false,
    runtime_item_creation_authorized: false,
    attested_by: USER_AUTHORIZATION,
    ...(currentSchemaSuccessor ? { activation_chain: CURRENT_SCHEMA_SUCCESSOR } : {})
  };
}

function validCurrentSchemaV1Activation(row) {
  if (row?.catalog_revision_id !== V1.revision
      || row.catalog_digest !== V1.catalog
      || row.import_audit_digest !== V1.importAudit
      || typeof row.event_id !== 'string' || typeof row.request_digest !== 'string'
      || typeof row.runtime_release_id !== 'string') return false;
  const payload = {
    schema: 'rus.runtime_catalog_activation_attestation.v2',
    activation_request_digest: row.request_digest,
    catalog_scope: 'item_container_materialization_v2',
    target_revision_id: row.catalog_revision_id,
    target_catalog_digest: row.catalog_digest,
    import_id: 'procedural_final_import_0204d109cbe18d06aed0957be3c10d12',
    import_audit_digest: row.import_audit_digest,
    runtime_contract_digest: RUNTIME_CATALOG_FIRST_PLAYABLE_CONTRACT_DIGEST,
    runtime_release_id: row.runtime_release_id,
    decision: 'approve_activation',
    activation_scope: 'new_development_parties_only',
    audited_candidate_digest:
      '12a160383a5aba4dfbda9aa5f6ef64273d712944322d9fb44f3a1eb1d45d5d67',
    independent_import_approval_attestation_digest: V1.approval,
    imported_candidate_digest:
      '29e67ec2f4b365f3728af1d29d5b3aec3a86c9e368cf3c705d11552a9dfa51d1',
    source_pack_digest:
      '4ddd8a0bd3770312808166599e8a57801939c7fc2b915c2fcc3c7db7030422af',
    record_operations_digest:
      'ceb7fc4bd4f9a54eb1b5d6ecc1db597db47b6548e383bd8a5dd828ee697921f2',
    existing_party_migration_authorized: false,
    old_save_rematerialization_authorized: false,
    production_deploy_authorized: false,
    attested_by: USER_AUTHORIZATION,
    activation_chain: 'procedural_final_current_schema_v1_successor'
  };
  return row.attestation_digest === digestEnvelope(payload);
}

function fail(code) {
  throw Object.assign(new Error(code), { code });
}
