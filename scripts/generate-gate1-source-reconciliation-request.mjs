import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { canonicalDigest } from '@rus/materialization';
import { loadVerifiedParentSourceRecords } from './stage3b1-parent-source-bundle.mjs';
import { buildPr17Stage3CApprovalRequest } from
  '../tools/world-catalog-workflow/src/internal/pr17-stage3c.js';
import { digestValue } from '../tools/world-catalog-workflow/src/digest.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const candidateRoot = resolve(root,
  'data/knowledge-source/imports/item-container-120-v5/candidate');
const gate1Root = resolve(root,
  'data/world-catalogs/novgorod/runtime-catalog/gate1-owner-data-v1');
const outputRoot = resolve(gate1Root, 'source-record-reconciliation-v1');
const evidenceRoot = resolve(root,
  'docs/implementation/item-container-120-approval-audit/evidence');
const collisionIds = Object.freeze([
  'src_novgorod_agriculture',
  'src_novgorod_promysly'
]);
const embeddedPath = '../../../../world-catalogs/novgorod/runtime-catalog/'
  + 'gate1-owner-data-v1/source-record-reconciliation-v1/'
  + 'source-records-embedded.json';
const sourceColumns = Object.freeze([
  'id', 'title', 'slug', 'source_type', 'author', 'publication_year',
  'period_covered', 'region_covered', 'url', 'file_reference',
  'page_or_section', 'quote_short', 'summary', 'reliability_level',
  'bias_notes', 'usefulness', 'limitations', 'checked_by', 'checked_at',
  'status', 'confidence', 'audit_notes', 'created_at', 'updated_at'
]);

const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));

function noAuthority() {
  return Object.freeze({
    approval_attestation_present: false,
    import_authorized: false,
    source_status_promotion_authorized: false,
    activation_authorized: false,
    production_authorized: false,
    existing_party_migration_authorized: false,
    runtime_item_creation_authorized: false
  });
}

function projectCanonicalSourceRow(row) {
  return Object.freeze(Object.fromEntries(sourceColumns.flatMap((column) => {
    const value = row[column];
    if (value == null || String(value).trim() === '') return [];
    return [[column, column === 'publication_year' ? Number(value) : value]];
  })));
}

export async function buildGate1SourceReconciliationArtifacts() {
  const [manifest, readiness, coverage, compilation, originalRequest,
    originalAttestation, parentRequest, parentAttestation, sourceManifest] =
    await Promise.all([
      readJson(resolve(candidateRoot, 'manifest.json')),
      readJson(resolve(candidateRoot, 'reports/EDITORIAL_READINESS_REPORT.json')),
      readJson(resolve(candidateRoot, 'reports/G4_COVERAGE_REPORT.json')),
      readJson(resolve(candidateRoot, 'reports/COMPILATION_REPORT.json')),
      readJson(resolve(evidenceRoot, 'FINAL_APPROVAL_REQUEST.json')),
      readJson(resolve(evidenceRoot, 'FINAL_APPROVAL_ATTESTATION.json')),
      readJson(resolve(gate1Root, 'parent-import-request.json')),
      readJson(resolve(gate1Root, 'authoring-approval-attestation.json')),
      readJson(resolve(root,
        'data/world-base-sources/rus13-base-v1.manifest.json'))
    ]);
  const recordsByTable = Object.fromEntries(await Promise.all(
    manifest.datasets.map(async (dataset) => [dataset.table,
      await readJson(resolve(candidateRoot, dataset.path))])));
  const originalRows = recordsByTable.source_records;
  const originalById = new Map(originalRows.map((row) => [row.id, row]));
  const canonicalRows = loadVerifiedParentSourceRecords(collisionIds)
    .map(projectCanonicalSourceRow);
  if (canonicalRows.some((row) => row.status !== 'usable_with_caution')
      || collisionIds.some((id) => originalById.get(id)?.status !== 'draft')) {
    throw new Error('GATE1_SOURCE_RECONCILIATION_STATUS_DRIFT');
  }
  const embeddedRows = Object.freeze(originalRows.filter(({ id }) =>
    !collisionIds.includes(id)));
  const datasets = manifest.datasets.map((dataset) => dataset.table ===
    'source_records' ? { ...dataset, path: embeddedPath,
      record_count: embeddedRows.length,
      sha256: digestValue(embeddedRows) } : dataset);
  const manifestCore = { ...manifest, datasets };
  delete manifestCore.candidate_digest;
  const amendedManifest = Object.freeze({ ...manifestCore,
    candidate_digest: digestValue(manifestCore) });
  const amendedCompilation = Object.freeze({ ...compilation,
    candidate_digest: amendedManifest.candidate_digest,
    counts: Object.freeze({ ...compilation.counts,
      source_records: embeddedRows.length }) });
  const amendedRecords = { ...recordsByTable, source_records: embeddedRows };
  const approval = buildPr17Stage3CApprovalRequest({
    candidate_manifest: amendedManifest,
    records_by_table: amendedRecords,
    editorial_readiness_report: readiness,
    g4_coverage_report: coverage,
    compilation_report: amendedCompilation,
    template_ids: [...amendedRecords.item_templates,
      ...amendedRecords.container_templates].map(({ id }) => id),
    target_revision: originalRequest.target_revision
  });
  if (approval.status !== 'ready_for_human_confirmation') {
    throw new Error(`GATE1_SOURCE_RECONCILIATION_REBIND_FAILED:${approval.errors
      .map(({ code }) => code).join(',')}`);
  }
  const sourceEntry = sourceManifest.files.find(({ path }) =>
    path === 'source_records_unified_v1.csv');
  const candidateCore = {
    schema: 'rus.gate1_stage3c_source_reconciliation_candidate.v1',
    status: 'pending_independent_authoring_approval',
    operation: 'externalize_duplicate_stage3c_sources_to_canonical_parent',
    original_stage3c_binding: Object.freeze({
      candidate_digest: manifest.candidate_digest,
      approval_request_digest: originalRequest.request_digest,
      approval_attestation_candidate_digest: originalAttestation.candidate_digest
    }),
    approved_parent_binding: Object.freeze({
      parent_request_digest: parentRequest.request_digest,
      parent_attestation_digest: parentAttestation.attestation_digest,
      archive_sha256: sourceManifest.archive.sha256,
      source_dataset_path: sourceEntry.path,
      source_dataset_sha256: sourceEntry.sha256
    }),
    collisions: Object.freeze(collisionIds.map((id) => Object.freeze({
      id,
      stage3c_row_to_externalize: Object.freeze(originalById.get(id)),
      canonical_parent_row: canonicalRows.find((row) => row.id === id),
      requested_transition: Object.freeze({ id,
        from_status: 'usable_with_caution', to_status: 'approved' })
    }))),
    amended_source_records: Object.freeze({
      embedded_path: embeddedPath,
      original_record_count: originalRows.length,
      embedded_record_count: embeddedRows.length,
      embedded_payload_digest: digestValue(embeddedRows),
      external_parent_record_count: canonicalRows.length,
      external_parent_payload_digest: digestValue(canonicalRows)
    }),
    amended_stage3c_manifest: amendedManifest,
    amended_compilation_report: amendedCompilation,
    amended_stage3c_approval_request: approval.request,
    authority: noAuthority()
  };
  const candidate = Object.freeze({ ...candidateCore,
    candidate_digest: canonicalDigest(candidateCore) });
  const requestCore = {
    schema: 'rus.gate1_stage3c_source_reconciliation_request.v1',
    status: 'pending_independent_authoring_approval',
    decision_requested:
      'approve_exact_parent_source_externalization_and_status_promotions',
    reconciliation_candidate_digest: candidate.candidate_digest,
    amended_stage3c_candidate_digest: amendedManifest.candidate_digest,
    amended_stage3c_approval_request_digest: approval.request.request_digest,
    requested_source_status_transitions: candidate.collisions.map(
      ({ requested_transition }) => requested_transition),
    requested_import_effect: Object.freeze({
      exclude_from_stage3c_inserts: collisionIds,
      require_exact_parent_rows: collisionIds,
      require_transactional_transition_and_readback: true,
      original_stage3c_attestation_does_not_authorize_amendment: true,
      grants_runtime_activation: false
    }),
    forbidden_scope: Object.freeze([
      'source row aliasing', 'source row overwrite', 'source row downgrade',
      'runtime catalog activation', 'production activation',
      'existing-party migration', 'runtime item creation'
    ]),
    authority: noAuthority()
  };
  const request = Object.freeze({ ...requestCore,
    request_digest: canonicalDigest(requestCore) });
  const artifacts = Object.freeze({ embeddedRows, candidate, request });
  validatePendingGate1SourceReconciliation(artifacts);
  return artifacts;
}

export function validatePendingGate1SourceReconciliation({ embeddedRows,
  candidate, request }) {
  const actualCollisionIds = candidate.collisions.map(({ id }) => id);
  if (candidate.schema !==
      'rus.gate1_stage3c_source_reconciliation_candidate.v1'
      || request.schema !==
      'rus.gate1_stage3c_source_reconciliation_request.v1'
      || candidate.status !== 'pending_independent_authoring_approval'
      || request.status !== 'pending_independent_authoring_approval'
      || embeddedRows.length !== 17
      || candidate.collisions.length !== 2
      || canonicalDigest(actualCollisionIds) !== canonicalDigest(collisionIds)
      || embeddedRows.some(({ id }) => collisionIds.includes(id))
      || candidate.collisions.some(({ id, canonical_parent_row: row,
        requested_transition: transition }) => row.id !== id
          || row.status !== 'usable_with_caution'
          || transition.id !== id
          || transition.from_status !== row.status
          || transition.to_status !== 'approved')
      || request.requested_source_status_transitions.length !== 2
      || request.reconciliation_candidate_digest !== candidate.candidate_digest
      || request.amended_stage3c_candidate_digest !==
        candidate.amended_stage3c_manifest.candidate_digest
      || request.amended_stage3c_approval_request_digest !==
        candidate.amended_stage3c_approval_request.request_digest
      || candidate.amended_source_records.embedded_payload_digest !==
        digestValue(embeddedRows)
      || candidate.original_stage3c_binding.candidate_digest ===
        candidate.amended_stage3c_manifest.candidate_digest) {
    throw new Error('GATE1_SOURCE_RECONCILIATION_INVALID');
  }
  for (const artifact of [candidate, request]) {
    if (Object.values(artifact.authority).some((value) => value !== false)) {
      throw new Error('GATE1_SOURCE_RECONCILIATION_AUTHORITY_FORBIDDEN');
    }
  }
  const { candidate_digest: claimedCandidate, ...candidateCore } = candidate;
  const { request_digest: claimedRequest, ...requestCore } = request;
  if (claimedCandidate !== canonicalDigest(candidateCore)
      || claimedRequest !== canonicalDigest(requestCore)) {
    throw new Error('GATE1_SOURCE_RECONCILIATION_DIGEST_INVALID');
  }
  return true;
}

export function validateGate1SourceReconciliationAuthoringAttestation({
  embeddedRows, candidate, request, attestation
}) {
  validatePendingGate1SourceReconciliation({ embeddedRows, candidate,
    request });
  const bindingTables = new Set(['container_template_source_bindings',
    'item_template_source_bindings', 'record_sources']);
  const expectedScope = {
    embedded_source_records: {
      record_count: embeddedRows.length,
      payload_digest: digestValue(embeddedRows)
    },
    canonical_parent_source_rows: candidate.collisions.map(({ id,
      canonical_parent_row: row, requested_transition: transition }) => ({
      id, payload_digest: digestValue(row),
      from_status: transition.from_status, to_status: transition.to_status
    })),
    unchanged_binding_datasets: candidate.amended_stage3c_manifest.datasets
      .filter(({ table }) => bindingTables.has(table))
      .map(({ table, record_count, sha256 }) => ({ table, record_count,
        sha256 })),
    requested_import_effect: request.requested_import_effect
  };
  const authority = attestation.authority ?? {};
  if (attestation.schema !==
      'rus.gate1_stage3c_source_reconciliation_authoring_approval_attestation.v1'
      || attestation.status !==
        'approved_authoring_and_transactional_import_readback'
      || attestation.reconciliation_candidate_digest !==
        candidate.candidate_digest
      || attestation.reconciliation_request_digest !== request.request_digest
      || attestation.amended_stage3c_candidate_digest !==
        candidate.amended_stage3c_manifest.candidate_digest
      || attestation.amended_stage3c_approval_request_digest !==
        candidate.amended_stage3c_approval_request.request_digest
      || attestation.original_stage3c_candidate_digest !==
        candidate.original_stage3c_binding.candidate_digest
      || attestation.original_stage3c_attestation_transfer_authorized !== false
      || canonicalDigest(attestation.approved_scope) !==
        canonicalDigest(expectedScope)
      || authority.approval_attestation_present !== true
      || authority.authoring_reconciliation_authorized !== true
      || authority.source_status_promotion_authorized !== true
      || authority.import_authorized !== true
      || authority.transactional_import_readback_only !== true
      || authority.exact_readback_required !== true
      || authority.activation_authorized !== false
      || authority.production_authorized !== false
      || authority.existing_party_migration_authorized !== false
      || authority.old_save_rematerialization_authorized !== false
      || authority.authoring_only_functional_allocation_runtime_selection !==
        false
      || authority.runtime_item_creation_authorized !== false) {
    throw new Error('GATE1_SOURCE_RECONCILIATION_ATTESTATION_INVALID');
  }
  const { attestation_digest: claimed, ...core } = attestation;
  if (claimed !== canonicalDigest(core)) {
    throw new Error('GATE1_SOURCE_RECONCILIATION_ATTESTATION_DIGEST_INVALID');
  }
  return true;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const artifacts = await buildGate1SourceReconciliationArtifacts();
  if (process.argv.includes('--write')) {
    await mkdir(outputRoot, { recursive: true });
    await Promise.all([
      writeFile(resolve(outputRoot, 'source-records-embedded.json'),
        `${JSON.stringify(artifacts.embeddedRows, null, 2)}\n`),
      writeFile(resolve(outputRoot, 'candidate.json'),
        `${JSON.stringify(artifacts.candidate, null, 2)}\n`),
      writeFile(resolve(outputRoot, 'request.json'),
        `${JSON.stringify(artifacts.request, null, 2)}\n`)
    ]);
  } else {
    process.stdout.write(`${JSON.stringify(artifacts, null, 2)}\n`);
  }
}
