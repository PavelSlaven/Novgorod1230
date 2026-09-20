import { importApprovedCatalog, registerCatalogBaseline } from
  './operator-executors.js';
import { buildImportLedger, digestEnvelope, verifyDecisionAttestation } from
  './artifact-contracts.js';
import { WORLD_RUNTIME_CATALOG_MIGRATION } from './forward-migrations.js';

export async function importProceduralV6Overlay({ pool, baseline, overlay }) {
  const registered = await registerCatalogBaseline({ pool, ...baseline });
  const imported = await importApprovedCatalog({ pool, ...overlay });
  const readback = (await pool.query(
    `SELECT i.id AS import_id, i.world_revision_id, i.target_catalog_digest,
            d.compatible_world_revision_id, d.compatible_world_catalog_digest,
            (SELECT count(*)::int
               FROM world_base.runtime_catalog_activation_events a
              WHERE a.catalog_revision_id=i.world_revision_id)
              AS activation_event_count
       FROM world_base.catalog_imports i
       JOIN world_base.domain_catalog_revisions d
         ON d.catalog_revision_id=i.world_revision_id
      WHERE i.id=$1`,
    [overlay.ledger.root.import_id]
  )).rows[0];
  if (!readback
      || readback.world_revision_id !== overlay.ledger.root.target_revision_id
      || readback.target_catalog_digest !== overlay.ledger.root.target_catalog_digest
      || readback.compatible_world_revision_id
        !== overlay.ledger.root.compatible_world_revision_id
      || readback.compatible_world_catalog_digest
        !== overlay.ledger.root.compatible_world_catalog_digest
      || readback.activation_event_count !== 0) throw Object.assign(new Error(
    'Procedural v6 overlay import readback mismatch.'), {
    code: 'PROCEDURAL_V6_IMPORT_READBACK_MISMATCH', details: { readback }
  });
  return Object.freeze({ registered, imported,
    readback: Object.freeze({ ...readback }) });
}

export async function importProceduralAuthoringPack({
  pool,
  baseline,
  pack,
  approvalAttestation,
  runtimeContractDigest
}) {
  assertPackIntegrity(pack);
  assertPackAuthority(pack);
  verifyDecisionAttestation({
    attestation: approvalAttestation,
    expectedSchema: 'rus.procedural_authoring_import_approval_attestation.v1',
    requestDigestField: 'approval_request_digest',
    expectedRequestDigest: pack.approvalRequest.approval_request_digest,
    expectedDecision: 'approve_disposable_local_authoring_import',
    expectedBindings: {
      scope: 'disposable_local_pr_candidate_database',
      candidate_digest: pack.candidate.candidate_digest,
      promotion_manifest_digest:
        pack.promotionManifest.promotion_manifest_digest,
      target_revision_id: pack.candidate.target_revision_id,
      target_catalog_digest: pack.candidate.target_catalog_digest
    }
  });
  const ledger = buildImportLedger({
    importId: pack.importLedger.import_id,
    rootFields: {
      catalog_scope: 'item_container_materialization_v2',
      parent_revision_id: baseline.request.parent_revision_id,
      parent_catalog_digest: baseline.request.parent_catalog_digest,
      parent_snapshot_manifest_digest:
        baseline.request.parent_snapshot_manifest_digest,
      ...pack.candidate.compatible_world_tuple,
      target_revision_id: pack.candidate.target_revision_id,
      target_catalog_digest: pack.candidate.target_catalog_digest,
      record_registry_digest: pack.importLedger.record_registry_digest,
      promotion_manifest_digest:
        pack.promotionManifest.promotion_manifest_digest,
      approval_request_digest:
        pack.approvalRequest.approval_request_digest,
      approval_attestation_digest: approvalAttestation.attestation_digest,
      schema_migration_digest:
        WORLD_RUNTIME_CATALOG_MIGRATION.migration_digest
    },
    tables: [],
    records: [],
    dependencyAssertions: [],
    importedBy: approvalAttestation.attested_by
  });
  const registered = await registerCatalogBaseline({ pool, ...baseline });
  const imported = await importApprovedCatalog({
    pool,
    ledger,
    domainRevision: {
      parent_registration_id: baseline.registrationId,
      runtime_contract_digest: runtimeContractDigest,
      title: 'Disposable procedural authoring import'
    },
    approvalAttestation,
    approvalContract: {
      schema: 'rus.procedural_authoring_import_approval_attestation.v1',
      request_digest_field: 'approval_request_digest',
      decision: 'approve_disposable_local_authoring_import'
    }
  });
  const readback = (await pool.query(
    `SELECT i.id AS import_id, i.world_revision_id AS target_revision_id,
            i.target_catalog_digest, i.import_audit_digest,
            d.status AS revision_status,
            (SELECT count(*)::int
               FROM world_base.runtime_catalog_activation_events a
              WHERE a.catalog_revision_id=i.world_revision_id)
              AS activation_event_count
       FROM world_base.catalog_imports i
       JOIN world_base.domain_catalog_revisions d
         ON d.catalog_revision_id=i.world_revision_id
      WHERE i.id=$1`,
    [ledger.root.import_id]
  )).rows[0];
  if (!readback
      || readback.target_revision_id !== pack.candidate.target_revision_id
      || readback.target_catalog_digest !== pack.candidate.target_catalog_digest
      || readback.import_audit_digest !== ledger.root.import_audit_digest
      || readback.activation_event_count !== 0) fail(
    'PROCEDURAL_AUTHORING_IMPORT_READBACK_MISMATCH', { readback });
  return Object.freeze({ registered, imported, ledger,
    readback: Object.freeze({ ...readback,
      runtime_capabilities_authorized: [],
      candidate_rows_by_table:
        structuredClone(pack.candidate.candidate_rows_by_table) }) });
}

function assertPackIntegrity(pack) {
  for (const [artifact, digestField] of [
    [pack?.candidate, 'candidate_digest'],
    [pack?.promotionManifest, 'promotion_manifest_digest'],
    [pack?.approvalRequest, 'approval_request_digest'],
    [pack?.importLedger, 'import_audit_digest']
  ]) {
    const { [digestField]: claimed, ...payload } = artifact ?? {};
    if (claimed !== digestEnvelope(payload)) fail(
      'PROCEDURAL_AUTHORING_IMPORT_DIGEST_MISMATCH');
  }
  const candidate = pack.candidate;
  const rows = candidate.candidate_rows_by_table;
  const tables = new Set(['procedural_scene_authoring_candidates',
    'procedural_scene_functional_mappings',
    'procedural_scene_conditional_context',
    'procedural_scene_remaining_gaps']);
  if (Object.keys(rows ?? {}).length !== tables.size
      || Object.keys(rows).some((table) => !tables.has(table))
      || rows.procedural_scene_authoring_candidates.length !== 3
      || rows.procedural_scene_functional_mappings.length !== 7
      || rows.procedural_scene_remaining_gaps.length !== 5
      || rows.procedural_scene_authoring_candidates.some((row) =>
        row.status !== 'candidate_approval_pending'
          || !Array.isArray(row.forbidden_implications))
      || candidate.record_operations_by_table.some((operation) =>
        operation.records_digest !==
          digestEnvelope(rows[operation.table_name]))) fail(
    'PROCEDURAL_AUTHORING_IMPORT_ROW_PARITY_INVALID');
  if (pack.promotionManifest.candidate_digest !== candidate.candidate_digest
      || pack.approvalRequest.candidate_digest !== candidate.candidate_digest
      || pack.importLedger.candidate_digest !== candidate.candidate_digest
      || pack.importLedger.approval_request_digest !==
        pack.approvalRequest.approval_request_digest
      || pack.importLedger.approval_attestation_digest !== null) fail(
    'PROCEDURAL_AUTHORING_IMPORT_BINDING_INVALID');
}

function assertPackAuthority(pack) {
  const request = pack?.approvalRequest;
  const candidate = pack?.candidate;
  if (request?.decision_requested !==
        'approve_disposable_local_authoring_import'
      || request.scope !== 'disposable_local_pr_candidate_database'
      || candidate?.runtime_capabilities_authorized?.length !== 0
      || candidate?.activation_event_count !== 0
      || ['operator_authorized', 'production_authorized',
        'import_activation_authorized', 'default_authorized',
        'deploy_authorized', 'rematerialization_authorized']
        .some((field) => request[field] !== false)) fail(
    'PROCEDURAL_AUTHORING_IMPORT_AUTHORITY_INVALID');
}

function fail(code, details = {}) {
  throw Object.assign(new Error(code), { code, details });
}
