import {
  buildActivationRequest, buildDevelopmentPartyPreflight,
  buildRuntimeReleaseIdentity, digestEnvelope
} from './artifact-contracts.js';
import { activateApprovedCatalog } from './operator-executors.js';
import { RUNTIME_CATALOG_FIRST_PLAYABLE_CONTRACT_DIGEST } from
  '@rus/runtime-catalog/runtime-contract';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import registry from '../../../data/runtime-catalog/item-container-record-registry.v1.json'
  with { type: 'json' };
import { RECORD_ADAPTERS } from './record-adapters.generated.js';
import {
  buildBaselineRegistrationId, buildBaselineRegistrationRequest,
  buildOperatorBaselineSnapshotManifest
} from './artifact-contracts.js';
import { WORLD_RUNTIME_CATALOG_MIGRATION } from './forward-migrations.js';
import { importProceduralFinalCandidatePack } from './procedural-v6-import.js';

export async function buildProceduralFinalDevelopmentActivation({ worldPool,
  partyPool, pack, ledger, gitCommitSha, authorizationRef }) {
  if (pack?.independent_attestation?.authority
      ?.new_development_party_activation_authorized !== false
      || pack.target_revision_id !== ledger?.root?.target_revision_id
      || pack.target_catalog_digest !== ledger.root.target_catalog_digest) {
    throw Object.assign(new Error('Development activation input mismatch.'),
      { code: 'PROCEDURAL_DEVELOPMENT_ACTIVATION_INPUT_INVALID' });
  }
  const policy = ledger.root.development_activation_policy;
  if (policy?.activation_scope !== 'new_development_parties_only'
      || policy.production_deploy_authorized !== false
      || policy.existing_party_migration_authorized !== false
      || policy.old_save_rematerialization_authorized !== false
      || policy.audited_candidate_digest !==
        pack.independent_attestation.candidate_digest
      || policy.imported_candidate_digest !== pack.candidate_digest
      || policy.source_pack_digest !== pack.source_pack_digest
      || policy.record_operations_digest !==
        pack.append_only_import_plan.records_digest
      || policy.compatible_world_pin_manifest_digest !==
        pack.compatible_world_tuple.compatible_world_pin_manifest_digest) {
    throw Object.assign(new Error('Development activation policy mismatch.'),
      { code: 'PROCEDURAL_DEVELOPMENT_ACTIVATION_POLICY_INVALID' });
  }
  const runtimeRelease = buildRuntimeReleaseIdentity({ gitCommitSha,
    buildReleaseManifestDigest: digestEnvelope({
      schema: 'rus.procedural_final_development_release.v1',
      candidate_digest: pack.candidate_digest,
      import_audit_digest: ledger.root.import_audit_digest,
      activation_scope: 'new_development_parties_only',
      production_deploy: false
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
  const previous = (await worldPool.query(
    `SELECT event_id FROM world_base.runtime_catalog_activation_events
      WHERE catalog_scope='item_container_materialization_v2'
      ORDER BY event_sequence DESC LIMIT 1`)).rows[0]?.event_id ?? null;
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
    expected_previous_event_id: previous,
    runtime_release_id: runtimeRelease.runtime_release_id
  }, partyPreflight });
  const attestationPayload = {
    schema: 'rus.runtime_catalog_activation_attestation.v2',
    activation_request_digest: request.activation_request_digest,
    catalog_scope: request.catalog_scope,
    target_revision_id: request.target_revision_id,
    target_catalog_digest: request.target_catalog_digest,
    import_id: request.import_id,
    import_audit_digest: request.import_audit_digest,
    runtime_contract_digest: request.runtime_contract_digest,
    runtime_release_id: request.runtime_release_id,
    decision: 'approve_activation',
    activation_scope: 'new_development_parties_only',
    audited_candidate_digest: pack.independent_attestation.candidate_digest,
    independent_import_approval_attestation_digest:
      pack.independent_attestation.attestation_digest,
    imported_candidate_digest: pack.candidate_digest,
    source_pack_digest: pack.source_pack_digest,
    record_operations_digest: pack.append_only_import_plan.records_digest,
    existing_party_migration_authorized: false,
    old_save_rematerialization_authorized: false,
    production_deploy_authorized: false,
    attested_by: authorizationRef
  };
  return Object.freeze({ schema:
    'rus.procedural_final_development_activation_bundle.v1',
    activation_scope: 'new_development_parties_only', runtimeRelease,
    partyPreflight, request,
    attestation: Object.freeze({ ...attestationPayload,
      attestation_digest: digestEnvelope(attestationPayload) }) });
}

export function applyProceduralFinalDevelopmentActivation({ worldPool,
  partyPool, bundle }) {
  assertDevelopmentActivationBoundary(bundle);
  return activateApprovedCatalog({ worldPool, partyPool,
    request: bundle.request, attestation: bundle.attestation,
    activationScope: bundle.activation_scope });
}

export function assertDevelopmentActivationBoundary(bundle) {
  const attestation = bundle?.attestation;
  const { attestation_digest: claimed, ...payload } = attestation ?? {};
  if (bundle?.activation_scope !== 'new_development_parties_only'
      || claimed !== digestEnvelope(payload)
      || attestation.activation_scope !== 'new_development_parties_only'
      || attestation.production_deploy_authorized !== false
      || attestation.existing_party_migration_authorized !== false
      || attestation.old_save_rematerialization_authorized !== false
      || attestation.audited_candidate_digest !==
        '12a160383a5aba4dfbda9aa5f6ef64273d712944322d9fb44f3a1eb1d45d5d67'
      || attestation.independent_import_approval_attestation_digest !==
        '0204d109cbe18d06aed0957be3c10d12a088e15368cc0e7eb865b1382538ef7c'
      || attestation.imported_candidate_digest !==
        '29e67ec2f4b365f3728af1d29d5b3aec3a86c9e368cf3c705d11552a9dfa51d1'
      || attestation.source_pack_digest !==
        '4ddd8a0bd3770312808166599e8a57801939c7fc2b915c2fcc3c7db7030422af'
      || attestation.record_operations_digest !==
        'ceb7fc4bd4f9a54eb1b5d6ecc1db597db47b6548e383bd8a5dd828ee697921f2'
      || attestation.import_audit_digest !== bundle.request.import_audit_digest
      || attestation.target_revision_id !== bundle.request.target_revision_id
      || attestation.target_catalog_digest !== bundle.request.target_catalog_digest) {
    throw Object.assign(new Error('Exact development activation boundary is invalid.'),
      { code: 'PROCEDURAL_DEVELOPMENT_ACTIVATION_BOUNDARY_INVALID' });
  }
  return bundle;
}

export async function installProceduralFinalDevelopmentCatalog({ worldPool,
  partyPool, repositoryRoot, gitCommitSha, authorizationRef }) {
  const root = resolve(repositoryRoot);
  const pack = JSON.parse(await readFile(resolve(root,
    'data/world-catalogs/novgorod/procedural-scene-v2/'
      + 'final-candidate-pack-v1/candidate.json'), 'utf8'));
  const rowsByTable = {};
  for (const entry of registry.entries) rowsByTable[entry.table_name] =
    (await worldPool.query(RECORD_ADAPTERS[entry.table_name].select_all_sql))
      .rows;
  delete rowsByTable.world_revisions;
  const baselineManifest = buildOperatorBaselineSnapshotManifest({
    schemaFingerprint: WORLD_RUNTIME_CATALOG_MIGRATION.target_schema_fingerprint,
    registry, rowsByTable
  });
  const request = buildBaselineRegistrationRequest({
    parentRevisionId: 'procedural_final_development_baseline_001',
    parentCatalogDigest: baselineManifest.records_aggregate_digest,
    baselineManifest, compatibleWorldTuple: pack.compatibility_manifest
  });
  const baselinePayload = {
    schema: 'rus.baseline_registration_attestation.v2',
    registration_request_digest: request.registration_request_digest,
    decision: 'approve_register_baseline',
    parent_tuple: { parent_revision_id: request.parent_revision_id,
      parent_catalog_digest: request.parent_catalog_digest,
      parent_snapshot_manifest_digest: request.parent_snapshot_manifest_digest },
    compatible_world_tuple: {
      compatible_world_revision_id: request.compatible_world_revision_id,
      compatible_world_catalog_digest: request.compatible_world_catalog_digest,
      compatible_world_pin_manifest_digest:
        request.compatible_world_pin_manifest_digest },
    action: 'register_baseline', attested_by: authorizationRef
  };
  const baseline = { request,
    attestation: { ...baselinePayload,
      attestation_digest: digestEnvelope(baselinePayload) }, baselineManifest,
    compatibilityManifest: pack.compatibility_manifest,
    runtimeConfigurationTuple: {
      compatible_world_revision_id:
        pack.compatibility_manifest.compatible_world_revision_id,
      compatible_world_catalog_digest:
        pack.compatibility_manifest.compatible_world_catalog_digest,
      source_runtime_configuration_digest:
        pack.compatibility_manifest.source_runtime_configuration_digest },
    registrationId: buildBaselineRegistrationId(request) };
  const imported = await importProceduralFinalCandidatePack({ worldPool,
    pool: worldPool, baseline, pack,
    runtimeContractDigest: RUNTIME_CATALOG_FIRST_PLAYABLE_CONTRACT_DIGEST });
  const bundle = await buildProceduralFinalDevelopmentActivation({ worldPool,
    partyPool, pack, ledger: imported.ledger, gitCommitSha, authorizationRef });
  const activated = await applyProceduralFinalDevelopmentActivation({
    worldPool, partyPool, bundle });
  return Object.freeze({ pack, imported, bundle, activated });
}
