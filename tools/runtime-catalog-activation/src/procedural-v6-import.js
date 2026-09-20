import { importApprovedCatalog, registerCatalogBaseline } from
  './operator-executors.js';
import { buildImportLedger, digestEnvelope, verifyDecisionAttestation } from
  './artifact-contracts.js';
import { WORLD_RUNTIME_CATALOG_MIGRATION } from './forward-migrations.js';
import { canonicalStringify } from '@rus/runtime-catalog/canonical-records';

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
  const ledger = buildProceduralAuthoringImportLedger({
    baseline, pack, approvalAttestation
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
  const compiledRows = (await pool.query(
    `SELECT record_id,version,record_kind,family_candidate_ref,payload,
            payload_digest,source_pack_digest,status
       FROM world_base.procedural_scene_compiled_records
      WHERE source_pack_digest=$1
      ORDER BY record_id,version`,
    [pack.candidate.candidate_rows_by_table
      .procedural_scene_compiled_records[0].source_pack_digest]
  )).rows;
  const membershipCount = Number((await pool.query(
    `SELECT count(*)::int AS count
       FROM world_base.catalog_import_records
      WHERE import_id=$1 AND table_name='procedural_scene_compiled_records'`,
    [ledger.root.import_id]
  )).rows[0]?.count);
  if (!readback
      || readback.target_revision_id !== pack.candidate.target_revision_id
      || readback.target_catalog_digest !== pack.candidate.target_catalog_digest
      || readback.import_audit_digest !== ledger.root.import_audit_digest
      || readback.activation_event_count !== 0
      || membershipCount !== compiledRows.length
      || canonicalStringify(compiledRows) !== canonicalStringify(
        pack.candidate.candidate_rows_by_table
          .procedural_scene_compiled_records)) fail(
    'PROCEDURAL_AUTHORING_IMPORT_READBACK_MISMATCH', { readback });
  return Object.freeze({ registered, imported, ledger,
    readback: Object.freeze({ ...readback,
      runtime_capabilities_authorized: [],
      candidate_rows_by_table: Object.freeze({
        procedural_scene_compiled_records:
          Object.freeze(compiledRows.map(Object.freeze))
      }) }) });
}

export function buildProceduralAuthoringImportLedger({ baseline, pack,
  approvalAttestation }) {
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
  if (canonicalStringify(baseline.compatibilityManifest)
      !== canonicalStringify(pack.candidate.compatibility_manifest)
      || baseline.request.compatible_world_pin_manifest_digest !==
        pack.candidate.compatible_world_tuple
          .compatible_world_pin_manifest_digest) fail(
    'PROCEDURAL_AUTHORING_IMPORT_COMPATIBILITY_MISMATCH');
  return buildImportLedger({
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
    tables: pack.importLedger.tables,
    records: pack.importLedger.records,
    dependencyAssertions: [],
    importedBy: approvalAttestation.attested_by
  });
}

export function buildProceduralFinalCandidateImportLedger({ baseline, pack }) {
  const attestation = pack?.independent_attestation;
  verifyDecisionAttestation({
    attestation,
    expectedSchema: 'rus.procedural_final_candidate_approval_attestation.v1',
    requestDigestField: 'candidate_digest',
    expectedRequestDigest: attestation?.candidate_digest,
    expectedDecision: 'APPROVE_FOR_DISPOSABLE_IMPORT_READBACK_ONLY',
    decisionField: 'verdict',
    expectedBindings: {
      pack_subject_commit_sha: pack.subject_commit_sha,
      pack_id: pack.pack_id,
      pack_version: pack.version,
      target_binding: {
        target_revision_id: pack.target_revision_id,
        target_catalog_digest: pack.target_catalog_digest,
        catalog_scope: 'item_container_materialization_v2',
        record_registry_digest: pack.record_registry_digest
      }
    }
  });
  if (canonicalStringify(baseline.compatibilityManifest)
      !== canonicalStringify(pack.compatibility_manifest)
      || attestation.authority.import_authorized !== false
      || attestation.authority.activation_authorized !== false
      || attestation.authority.production_authorized !== false
      || attestation.authority.database_mutated !== false)
    fail('PROCEDURAL_FINAL_IMPORT_AUTHORITY_INVALID');
  const importId =
    `procedural_final_import_${attestation.attestation_digest.slice(0, 32)}`;
  const records = pack.record_operations_by_table.flatMap((operation) =>
    operation.records.map((record) => ({ ...record, import_id: importId })));
  return buildImportLedger({
    importId,
    rootFields: {
      catalog_scope: 'item_container_materialization_v2',
      parent_revision_id: baseline.request.parent_revision_id,
      parent_catalog_digest: baseline.request.parent_catalog_digest,
      parent_snapshot_manifest_digest:
        baseline.request.parent_snapshot_manifest_digest,
      ...pack.compatible_world_tuple,
      target_revision_id: pack.target_revision_id,
      target_catalog_digest: pack.target_catalog_digest,
      record_registry_digest: pack.record_registry_digest,
      promotion_manifest_digest: digestEnvelope({
        schema: 'rus.procedural_final_candidate_import_plan.v1',
        candidate_digest: attestation.candidate_digest,
        records_digest: pack.append_only_import_plan.records_digest,
        target_catalog_digest: pack.target_catalog_digest
      }),
      approval_request_digest: attestation.candidate_digest,
      approval_attestation_digest: attestation.attestation_digest,
      schema_migration_digest:
        WORLD_RUNTIME_CATALOG_MIGRATION.migration_digest
    },
    tables: pack.append_only_import_plan.tables,
    records,
    dependencyAssertions: [],
    importedBy: attestation.auditor
  });
}

export async function importProceduralFinalCandidatePack({ pool, baseline,
  pack, runtimeContractDigest }) {
  const ledger = buildProceduralFinalCandidateImportLedger({ baseline, pack });
  const registered = await registerCatalogBaseline({ pool, ...baseline });
  const imported = await importApprovedCatalog({
    pool, ledger,
    domainRevision: {
      parent_registration_id: baseline.registrationId,
      runtime_contract_digest: runtimeContractDigest,
      title: 'Disposable procedural final candidate import',
      readback_mode: 'authoring_only_no_runtime_projection'
    },
    approvalAttestation: pack.independent_attestation,
    approvalContract: {
      schema: 'rus.procedural_final_candidate_approval_attestation.v1',
      request_digest_field: 'candidate_digest',
      decision_field: 'verdict',
      decision: 'APPROVE_FOR_DISPOSABLE_IMPORT_READBACK_ONLY'
    }
  });
  const summary = (await pool.query(
    `SELECT
       (SELECT count(*)::int FROM world_base.catalog_import_records
         WHERE import_id=$1) AS ledger_record_count,
       (SELECT count(*)::int
          FROM world_base.procedural_scene_compiled_records
         WHERE source_pack_digest=$2) AS compiled_record_count,
       (SELECT count(*)::int
          FROM world_base.runtime_catalog_activation_events
         WHERE catalog_revision_id=$3) AS activation_event_count`,
    [ledger.root.import_id, pack.source_pack_digest,
      pack.target_revision_id]
  )).rows[0];
  if (Number(summary?.ledger_record_count) !== 3269
      || Number(summary?.compiled_record_count) !== 21
      || Number(summary?.activation_event_count) !== 0)
    fail('PROCEDURAL_FINAL_IMPORT_READBACK_MISMATCH', { summary });
  return Object.freeze({ registered, imported, ledger,
    readback: Object.freeze({ ledger_record_count: 3269,
      assert_existing_record_count: 3248, compiled_record_count: 21,
      activation_event_count: 0, target_revision_id: pack.target_revision_id,
      target_catalog_digest: pack.target_catalog_digest }) });
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
  const rows = candidate.candidate_rows_by_table
    ?.procedural_scene_compiled_records;
  const metadata = rows?.find(({ record_kind: kind }) =>
    kind === 'approval_metadata')?.payload;
  if (!Array.isArray(rows) || rows.length !== 11
      || Object.keys(candidate.candidate_rows_by_table).length !== 1
      || rows.filter(({ record_kind: kind }) => kind === 'profile').length !== 3
      || rows.filter(({ record_kind: kind }) => kind === 'mapping').length !== 7
      || rows.some((row) => row.status !==
        'approved_authoring_not_runtime_selectable'
          || row.payload_digest !== digestEnvelope(row.payload))
      || metadata?.remaining_gaps?.length !== 5
      || candidate.record_operations_by_table.length !== 1
      || candidate.record_operations_by_table[0].records.length !== 11
      || pack.importLedger.records.length !== 11) fail(
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
