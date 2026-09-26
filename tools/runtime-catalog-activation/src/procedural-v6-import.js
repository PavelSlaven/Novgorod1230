import { importApprovedCatalog, registerCatalogBaseline } from
  './operator-executors.js';
import { buildImportLedger, digestEnvelope, verifyDecisionAttestation } from
  './artifact-contracts.js';
import { WORLD_RUNTIME_CATALOG_MIGRATION } from './forward-migrations.js';
import { canonicalStringify } from '@rus/runtime-catalog/canonical-records';
import { computeCanonicalRecordDigest, projectCanonicalRecord } from
  '@rus/runtime-catalog/canonical-records';
import { computeTablePayloadDigest } from '@rus/runtime-catalog/ledger-digests';
import registry from '../../../data/runtime-catalog/item-container-record-registry.v1.json'
  with { type: 'json' };
import { createHash } from 'node:crypto';

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
      title: 'Disposable procedural authoring import',
      readback_mode: 'authoring_only_no_runtime_projection'
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
  assertProceduralFinalCandidatePackIntegrity(pack);
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
        WORLD_RUNTIME_CATALOG_MIGRATION.migration_digest,
      development_activation_policy: {
        schema: 'rus.procedural_final_development_activation_policy.v1',
        activation_scope: 'new_development_parties_only',
        audited_candidate_digest: attestation.candidate_digest,
        imported_candidate_digest: pack.candidate_digest,
        source_pack_digest: pack.source_pack_digest,
        record_operations_digest: pack.append_only_import_plan.records_digest,
        compatible_world_pin_manifest_digest:
          pack.compatible_world_tuple.compatible_world_pin_manifest_digest,
        production_deploy_authorized: false,
        existing_party_migration_authorized: false,
        old_save_rematerialization_authorized: false
      }
    },
    tables: pack.append_only_import_plan.tables,
    records,
    dependencyAssertions: [],
    importedBy: attestation.auditor
  });
}

export function assertProceduralFinalCandidatePackIntegrity(pack) {
  const { candidate_digest: candidateDigest, ...payload } = pack ?? {};
  if (candidateDigest !== digestEnvelope(payload))
    fail('PROCEDURAL_FINAL_PACK_DIGEST_MISMATCH');
  const { independent_attestation: attestation, ...auditedPayload } = payload;
  if (!attestation || digestEnvelope(auditedPayload) !==
      attestation.candidate_digest)
    fail('PROCEDURAL_FINAL_PACK_AUDITED_SUBJECT_MISMATCH');
  const operations = pack.record_operations_by_table ?? [];
  const cache = operations.find(({ table_name: table }) =>
    table === 'procedural_scene_compiled_records');
  const metadata = pack.candidate_rows_by_table
    ?.procedural_scene_compiled_records?.find(({ record_id: id }) =>
      id === 'approval:final-candidate')?.payload;
  const expectedTarget = {
    target_revision_id: pack.target_revision_id,
    target_catalog_digest: pack.target_catalog_digest,
    catalog_scope: pack.append_only_import_plan?.catalog_scope,
    record_registry_digest: pack.record_registry_digest
  };
  const expectedRecord = {
    record_operations_count: operations.length,
    records_digest: pack.append_only_import_plan?.records_digest,
    total_record_count: operations.reduce((sum, operation) =>
      sum + operation.record_count, 0),
    regional_existing_member_count: ['landscape', 'water', 'land_use', 'place']
      .reduce((sum, key) => sum
        + Number(pack.source_summary?.regional_environment?.[key] ?? 0), 0),
    regional_drying_row_count:
      pack.source_summary?.regional_environment?.drying,
    v5_assert_existing_table_count: operations.filter((operation) =>
      operation.table_name !== 'procedural_scene_compiled_records').length,
    v5_assert_existing_record_count: operations.filter((operation) =>
      operation.table_name !== 'procedural_scene_compiled_records')
      .reduce((sum, operation) => sum + operation.record_count, 0),
    compiled_insert_table: cache?.table_name,
    compiled_insert_count: cache?.insert_count,
    compiled_insert_records_digest: cache?.records_digest,
    append_only_existing_table_only: true
  };
  const expectedCompatibility = {
    compatible_world_tuple: pack.compatible_world_tuple,
    compatibility_manifest_digest:
      pack.compatibility_manifest?.compatible_world_pin_manifest_digest,
    source_runtime_configuration_digest:
      pack.compatibility_manifest?.source_runtime_configuration_digest,
    validation_contract_version:
      pack.compatibility_manifest?.validation_contract_version
  };
  if (canonicalStringify(attestation.target_binding) !==
        canonicalStringify(expectedTarget)
      || attestation.source_binding?.source_pack_digest !==
        pack.source_pack_digest
      || attestation.source_binding?.source_closure_count !==
        pack.source_closure?.length
      || canonicalStringify(attestation.source_binding?.source_summary) !==
        canonicalStringify(pack.source_summary)
      || canonicalStringify(attestation.record_binding) !==
        canonicalStringify(expectedRecord)
      || canonicalStringify(attestation.compatibility_binding) !==
        canonicalStringify(expectedCompatibility)
      || metadata?.item_container?.asserted_table_count !== 39
      || metadata?.item_container?.asserted_record_count !== 3248)
    fail('PROCEDURAL_FINAL_PACK_ATTESTATION_BINDING_MISMATCH');
  return pack;
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

export function buildProceduralFinalV2ImportLedger({ baseline, v1Pack, v2Pack,
  attestation }) {
  assertProceduralFinalCandidatePackIntegrity(v1Pack);
  const { candidate_digest: v2Digest, ...v2Payload } = v2Pack ?? {};
  const sha = (value) => createHash('sha256')
    .update(JSON.stringify(value)).digest('hex');
  const expectedTarget = sha({ schema:
    'rus.procedural_scene_final_candidate_v2_target.v1',
  inherited_target_catalog_digest: v1Pack.target_catalog_digest,
  inherited_records_digest: v1Pack.append_only_import_plan.records_digest,
  appended_record: v2Pack.append_only_delta?.record });
  const appendedRow = v2Pack.append_only_delta?.record;
  if (v2Digest !== sha(v2Payload)
      || v2Pack.target_catalog_digest !== expectedTarget
      || v2Pack.target_revision_id !== 'procedural_scene_final_candidate_v2_001'
      || v2Pack.append_only_delta.table_name !==
        'procedural_scene_compiled_records'
      || v2Pack.append_only_delta.operation_kind !== 'insert'
      || v2Pack.append_only_delta.insert_count !== 1
      || v2Pack.append_only_delta.update_count !== 0
      || v2Pack.append_only_delta.delete_count !== 0
      || appendedRow.status !== 'approved_authoring_not_runtime_selectable'
      || appendedRow.payload_digest !== sha(appendedRow.payload)
      || appendedRow.source_pack_digest !== sha({ v1: v1Pack.candidate_digest,
        allocation: v2Pack.allocation_source.candidate_digest,
        attestation: v2Pack.allocation_source.approval_attestation_digest }))
    fail('PROCEDURAL_FINAL_V2_PACK_INVALID');
  const { attestation_digest: claimed, ...attested } = attestation ?? {};
  if (claimed !== digestEnvelope(attested)
      || claimed !== '2917b993a9e9c63e1989725cee35e63bd0ed32dfece583a782dfb27f1c3f4772'
      || attestation.candidate_digest !== v2Pack.candidate_digest
      || v2Pack.inherited_closure.candidate_digest !== v1Pack.candidate_digest
      || attestation.target_binding.target_revision_id !==
        v2Pack.target_revision_id
      || attestation.target_binding.target_catalog_digest !==
        v2Pack.target_catalog_digest
      || attestation.append_only_delta_binding.payload_digest !==
        appendedRow.payload_digest
      || attestation.append_only_delta_binding.source_pack_digest !==
        appendedRow.source_pack_digest
      || attestation.append_only_delta_binding.insert_count !== 1
      || attestation.append_only_delta_binding
        .expected_total_record_count_after_import !== 3270)
    fail('PROCEDURAL_FINAL_V2_ATTESTATION_INVALID');
  const entry = registry.entries.find(({ table_name: table }) => table ===
    'procedural_scene_compiled_records');
  const row = v2Pack.append_only_delta.record;
  const canonical = projectCanonicalRecord({ registryEntry: entry, row });
  const appended = { table_name: entry.table_name, operation_kind: 'insert',
    record_key: canonicalStringify(canonical.record_key),
    canonical_payload: canonical, record_digest:
      computeCanonicalRecordDigest(canonical), ordinal: 21 };
  const operations = v1Pack.record_operations_by_table.map((operation) => {
    if (operation.table_name !== entry.table_name) return structuredClone(operation);
    const records = operation.records.map((record, ordinal) => ({ ...structuredClone(record),
      operation_kind: 'assert_existing', ordinal }));
    records.push(appended);
    return { ...structuredClone(operation), insert_count: 1,
      assert_existing_count: 21, record_count: 22, records,
      records_digest: computeTablePayloadDigest(records) };
  });
  const importId = `procedural_final_v2_import_${claimed.slice(0, 32)}`;
  return buildImportLedger({ importId, rootFields: {
    catalog_scope: 'item_container_materialization_v2',
    parent_revision_id: baseline.request.parent_revision_id,
    parent_catalog_digest: baseline.request.parent_catalog_digest,
    parent_snapshot_manifest_digest: baseline.request.parent_snapshot_manifest_digest,
    ...v1Pack.compatible_world_tuple,
    target_revision_id: v2Pack.target_revision_id,
    target_catalog_digest: v2Pack.target_catalog_digest,
    record_registry_digest: v1Pack.record_registry_digest,
      promotion_manifest_digest: digestEnvelope(v2Pack.append_only_delta),
      approval_request_digest: v2Pack.candidate_digest,
      approval_attestation_digest: claimed,
      schema_migration_digest: WORLD_RUNTIME_CATALOG_MIGRATION.migration_digest
  }, tables: operations.map(({ records: ignored, records_digest, ...table }) =>
    ({ ...table, payload_digest: records_digest })),
  records: operations.flatMap((operation) => operation.records.map((record) =>
    ({ ...record, import_id: importId }))), dependencyAssertions: [],
  importedBy: attestation.auditor });
}

export async function importProceduralFinalV2Pack({ pool, baseline, v1Pack,
  v2Pack, attestation, runtimeContractDigest }) {
  const ledger = buildProceduralFinalV2ImportLedger({ baseline, v1Pack, v2Pack,
    attestation });
  const imported = await importApprovedCatalog({ pool, ledger,
    domainRevision: { parent_registration_id: baseline.registrationId,
      runtime_contract_digest: runtimeContractDigest,
      title: 'Disposable procedural final candidate v2 import',
      readback_mode: 'authoring_only_no_runtime_projection' },
    approvalAttestation: attestation, approvalContract: {
      schema: 'rus.procedural_final_candidate_v2_approval_attestation.v1',
      request_digest_field: 'candidate_digest', decision_field: 'verdict',
      decision: 'APPROVE_FOR_DISPOSABLE_IMPORT_READBACK_ONLY' } });
  const counts = (await pool.query(`SELECT
    (SELECT count(*)::int FROM world_base.catalog_import_records WHERE import_id=$1) ledger_count,
    (SELECT count(*)::int FROM world_base.procedural_scene_compiled_records) compiled_count,
    (SELECT count(*)::int FROM world_base.runtime_catalog_activation_events WHERE catalog_revision_id=$2) activation_count`,
  [ledger.root.import_id, v2Pack.target_revision_id])).rows[0];
  if (Number(counts.ledger_count) !== 3270 || Number(counts.compiled_count) !== 22
      || Number(counts.activation_count) !== 0) fail('PROCEDURAL_FINAL_V2_READBACK_MISMATCH');
  return { imported, ledger, readback: { ledger_record_count: 3270,
    compiled_record_count: 22, activation_event_count: 0 } };
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
