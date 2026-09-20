import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import registry from '../data/runtime-catalog/item-container-record-registry.v1.json'
  with { type: 'json' };
import { computeRecordRegistryDigest } from
  '../packages/runtime-catalog/src/canonical-records.js';
import {
  computeDependencyAssertionsSemanticDigest,
  computeTargetCatalogDigest
} from '../packages/runtime-catalog/src/ledger-digests.js';
import { digestEnvelope } from
  '../tools/runtime-catalog-activation/src/artifact-contracts.js';

const OUTPUT = 'data/world-catalogs/novgorod/procedural-scene-v2/import-pack-v1';
const ROOT = 'data/world-catalogs/novgorod/procedural-scene-v2';
const SUBJECT_COMMIT = 'b4e3bc488ae75d724cec541641121fbeaa4be5ad';
const OVERLAY_DIGEST =
  '52702c0010adc3e3235fd6a6417a10b28f7627d428e65f9dd48e74c3fb19cda3';
const FUNCTIONAL = Object.freeze({
  candidate: 'aac8ef388fee279d653832de033ce9b23c85fb371c159eb828e97b56080b0588',
  request: '229fa7d273e2201bd47d3cac75122507762a7ef7675a9bc25a89f2ff0c188245',
  attestation: '6979d4d4ca5af9527258e187011bd48f82bf998c5969fa5ee0000059bcf9c698'
});
const V5 = Object.freeze({
  candidate: 'e3bddda4b31cdbb91d430254db5e6f2d34a8d9d0a08e5f7e4c1e1d6cb9832a24',
  approval_request: '046344b570789b008da8685d0dad3824512d529f9c161a122ecdc59e3cb73771',
  approval_attestation: '67baf3e92a2aacde2566a60c13e5a3a2410e3544549f096684d473d8588f18f8',
  target_revision_id: 'world_revision_novgorod_1230_item_container_approved_001',
  target_catalog_digest: 'a24fe55497a8aca018fa28a43ab1f54e26e2f30a5c74931ed2570ab69bc07a87'
});
const WORLD = Object.freeze({
  revision_id: 'novgorod_spatial_v3_production_v6_candidate_001',
  catalog_digest: '6e6cd611042ff86229c73409816893ea4e983c01722dd4699bac346acfb846ad',
  pin_manifest_digest: '776ab6989f5c8bb6c49858eb27b3bb9ac637a674e314f1c7e956a35cdbe569eb'
});
const ROW_ATTESTATIONS = Object.freeze([
  'drying-storage-workspace-approval-attestation.json',
  'inland-fishing-worksite-approval-attestation.json',
  'natural-shore-approval-attestation.json'
]);
const GAP_CODES = Object.freeze([
  'FUNCTIONAL_CONTAINER_MAPPING_MISSING',
  'ACTIVE_PROCESS_TOOL_REF_REQUIRED',
  'ACTIVE_PROCESS_MATERIAL_REF_REQUIRED',
  'ACTIVE_PROCESS_CONTAINER_MAPPING_CONDITIONAL',
  'FINITE_WRECK_SOURCE_REF_REQUIRED'
]);
const TARGET_REVISION = 'procedural_authoring_import_v1_candidate_001';

export async function generateProceduralAuthoringImportPack(rootDir,
  overrides = {}) {
  const root = resolve(rootDir);
  const load = async (relative) => overrides[relative]
    ?? JSON.parse(await readFile(resolve(root, relative), 'utf8'));
  const spatialManifestPath =
    'data/world-catalogs/novgorod/spatial-v3/candidates/spatial-v3-production-v6/manifest.json';
  const overlayPath = `${ROOT}/authoring-overlay.json`;
  const functionalRoot = `${ROOT}/functional-mapping-v1`;
  const [overlay, functionalCandidate, functionalRequest,
    functionalAttestation, v5Manifest, v5Approval, v5Promotion,
    spatialManifest, ...rowAttestations] = await Promise.all([
    load(overlayPath), load(`${functionalRoot}/candidate.json`),
    load(`${functionalRoot}/approval-request.json`),
    load(`${functionalRoot}/approval-attestation.json`),
    load('data/knowledge-source/imports/item-container-120-v5/candidate/manifest.json'),
    load('docs/implementation/item-container-120-approval-audit/evidence/FINAL_APPROVAL_ATTESTATION.json'),
    load('docs/implementation/item-container-120-approval-audit/evidence/STAGE3C_PROMOTION_RESULT.json'),
    load(spatialManifestPath),
    ...ROW_ATTESTATIONS.map((file) => load(`${ROOT}/${file}`))
  ]);
  validateSources({ overlay, functionalCandidate, functionalRequest,
    functionalAttestation, v5Manifest, v5Approval, v5Promotion,
    spatialManifest,
    spatialManifestFileDigest: overrides[spatialManifestPath]
      ? null
      : digestBytes(await readFile(resolve(root, spatialManifestPath))),
    rowAttestations });

  const candidateRowsByTable = {
    procedural_scene_authoring_candidates:
      structuredClone(overlay.candidates),
    procedural_scene_functional_mappings:
      structuredClone(functionalCandidate.mappings),
    procedural_scene_conditional_context:
      structuredClone(functionalCandidate.conditional_context),
    procedural_scene_remaining_gaps:
      structuredClone(functionalCandidate.remaining_gaps)
  };
  const recordOperations = Object.entries(candidateRowsByTable).map(
    ([tableName, rows], dependencyOrder) => ({
      table_name: tableName,
      dependency_order: dependencyOrder,
      operation_kind: 'assert_immutable_authoring',
      record_count: rows.length,
      records_digest: digestEnvelope(rows),
      record_ids: rows.map(recordId)
    }));
  const rowAttestationRefs = rowAttestations.map((attestation, index) => ({
    path: `${ROOT}/${ROW_ATTESTATIONS[index]}`,
    candidate_ref: attestation.candidate_ref,
    attestation_digest: attestation.attestation_digest
  })).sort((left, right) => left.candidate_ref.localeCompare(right.candidate_ref));
  const registryDigest = computeRecordRegistryDigest(registry);
  const compatibleWorldTuple = {
    compatible_world_revision_id: WORLD.revision_id,
    compatible_world_catalog_digest: WORLD.catalog_digest,
    compatible_world_pin_manifest_digest: WORLD.pin_manifest_digest
  };
  const targetCatalogDigest = computeTargetCatalogDigest({
    schema: 'rus.domain_catalog_payload.v2',
    catalog_scope: 'item_container_materialization_v2',
    target_revision_id: TARGET_REVISION,
    compatible_world_tuple: compatibleWorldTuple,
    record_registry_digest: registryDigest,
    tables: [],
    dependency_assertions_semantic_digest:
      computeDependencyAssertionsSemanticDigest([])
  });
  const candidatePayload = {
    schema: 'rus.procedural_authoring_combined_candidate.v1',
    candidate_id: 'novgorod_procedural_authoring_combined_001',
    version: 1,
    status: 'authoring_approved_not_imported',
    subject_commit_sha: SUBJECT_COMMIT,
    target_revision_id: TARGET_REVISION,
    target_catalog_digest: targetCatalogDigest,
    compatible_world_tuple: compatibleWorldTuple,
    upstream: {
      overlay_digest: overlay.overlay_digest,
      row_attestations: rowAttestationRefs,
      functional_candidate_digest: functionalCandidate.candidate_digest,
      functional_request_digest: functionalRequest.request_digest,
      functional_attestation_digest: functionalAttestation.attestation_digest,
      v5_candidate_digest: v5Manifest.candidate_digest,
      v5_approval_request_digest: v5Approval.request_digest,
      v5_approval_attestation_digest: v5Promotion.approval_attestation_digest,
      v5_target_revision_id: v5Promotion.target_revision_id,
      v5_target_catalog_digest: v5Promotion.target_catalog_digest
    },
    candidate_rows_by_table: candidateRowsByTable,
    record_operations_by_table: recordOperations,
    authoring_approval_scopes: [
      'route_free_family_rows', 'functional_mapping_only'
    ],
    runtime_capabilities_authorized: [],
    activation_event_count: 0,
    import_authorized: false,
    activation_authorized: false,
    production_authorized: false,
    default_authorized: false,
    deploy_authorized: false,
    rematerialization_authorized: false
  };
  const candidate = { ...candidatePayload,
    candidate_digest: digestEnvelope(candidatePayload) };
  const promotionPayload = {
    schema: 'rus.procedural_authoring_promotion_manifest.v1',
    candidate_digest: candidate.candidate_digest,
    target_revision_id: TARGET_REVISION,
    target_catalog_digest: targetCatalogDigest,
    compatible_world_tuple: compatibleWorldTuple,
    record_registry_digest: registryDigest,
    record_operations_by_table: structuredClone(recordOperations),
    runtime_capabilities_authorized: [],
    activation_event_count: 0
  };
  const promotionManifest = { ...promotionPayload,
    promotion_manifest_digest: digestEnvelope(promotionPayload) };
  const requestPayload = {
    schema: 'rus.procedural_authoring_import_approval_request.v1',
    request_id: 'novgorod_procedural_authoring_import_review_001',
    decision_requested: 'approve_disposable_local_authoring_import',
    scope: 'disposable_local_pr_candidate_database',
    subject_commit_sha: SUBJECT_COMMIT,
    candidate_digest: candidate.candidate_digest,
    promotion_manifest_digest:
      promotionManifest.promotion_manifest_digest,
    target_revision_id: TARGET_REVISION,
    target_catalog_digest: targetCatalogDigest,
    compatible_world_tuple: compatibleWorldTuple,
    operator_authorized: false,
    production_authorized: false,
    import_activation_authorized: false,
    default_authorized: false,
    deploy_authorized: false,
    rematerialization_authorized: false
  };
  const approvalRequest = { ...requestPayload,
    approval_request_digest: digestEnvelope(requestPayload) };
  const importId =
    `procedural_authoring_import_${approvalRequest.approval_request_digest.slice(0, 32)}`;
  const ledgerPayload = {
    schema: 'rus.procedural_authoring_import_ledger.v1',
    import_id: importId,
    approval_status: 'pending_independent_import_approval',
    candidate_digest: candidate.candidate_digest,
    promotion_manifest_digest: promotionManifest.promotion_manifest_digest,
    approval_request_digest: approvalRequest.approval_request_digest,
    approval_attestation_digest: null,
    target_revision_id: TARGET_REVISION,
    target_catalog_digest: targetCatalogDigest,
    compatible_world_tuple: compatibleWorldTuple,
    record_registry_digest: registryDigest,
    record_operations_by_table: structuredClone(recordOperations),
    runtime_capabilities_authorized: [],
    activation_event_count: 0
  };
  const importLedger = { ...ledgerPayload,
    import_audit_digest: digestEnvelope(ledgerPayload) };
  const pack = { candidate, promotionManifest, approvalRequest, importLedger };
  validateProceduralAuthoringImportPack(pack);
  return pack;
}

export function validateProceduralAuthoringImportPack({ candidate,
  promotionManifest, approvalRequest, importLedger }) {
  const fail = (code) => { throw Object.assign(new Error(code), { code }); };
  for (const [artifact, digestField] of [[candidate, 'candidate_digest'],
    [promotionManifest, 'promotion_manifest_digest'],
    [approvalRequest, 'approval_request_digest'],
    [importLedger, 'import_audit_digest']]) {
    const { [digestField]: claimed, ...payload } = artifact ?? {};
    if (claimed !== digestEnvelope(payload)) fail('PROCEDURAL_IMPORT_DIGEST_MISMATCH');
  }
  if (candidate.subject_commit_sha !== SUBJECT_COMMIT
      || candidate.upstream.overlay_digest !== OVERLAY_DIGEST
      || candidate.upstream.functional_candidate_digest !== FUNCTIONAL.candidate
      || candidate.upstream.functional_request_digest !== FUNCTIONAL.request
      || candidate.upstream.functional_attestation_digest !== FUNCTIONAL.attestation
      || candidate.upstream.v5_candidate_digest !== V5.candidate
      || candidate.upstream.v5_approval_request_digest !== V5.approval_request
      || candidate.upstream.v5_approval_attestation_digest !== V5.approval_attestation
      || candidate.upstream.v5_target_revision_id !== V5.target_revision_id
      || candidate.upstream.v5_target_catalog_digest !== V5.target_catalog_digest
      || JSON.stringify(candidate.compatible_world_tuple) !== JSON.stringify({
        compatible_world_revision_id: WORLD.revision_id,
        compatible_world_catalog_digest: WORLD.catalog_digest,
        compatible_world_pin_manifest_digest: WORLD.pin_manifest_digest
      })) fail('PROCEDURAL_IMPORT_UPSTREAM_PIN_MISMATCH');
  const rows = candidate.candidate_rows_by_table;
  const allowed = new Set(['procedural_scene_authoring_candidates',
    'procedural_scene_functional_mappings',
    'procedural_scene_conditional_context', 'procedural_scene_remaining_gaps']);
  if (Object.keys(rows ?? {}).some((table) => !allowed.has(table)))
    fail('PROCEDURAL_IMPORT_UNKNOWN_TABLE');
  for (const operation of candidate.record_operations_by_table) {
    const tableRows = rows[operation.table_name];
    const ids = tableRows?.map(recordId) ?? [];
    if (!Array.isArray(tableRows) || new Set(ids).size !== ids.length
        || operation.operation_kind !== 'assert_immutable_authoring'
        || operation.record_count !== tableRows.length
        || operation.records_digest !== digestEnvelope(tableRows)
        || JSON.stringify(operation.record_ids) !== JSON.stringify(ids))
      fail('PROCEDURAL_IMPORT_LEDGER_MEMBERSHIP_INVALID');
  }
  if (candidate.record_operations_by_table.length !== allowed.size)
    fail('PROCEDURAL_IMPORT_LEDGER_MEMBERSHIP_INVALID');
  const families = rows.procedural_scene_authoring_candidates;
  if (families.length !== 3 || families.some((row) =>
    row.status !== 'candidate_approval_pending')
      || candidate.status !== 'authoring_approved_not_imported')
    fail('PROCEDURAL_IMPORT_RUNTIME_SELECTABLE_STATUS');
  const mappingRows = rows.procedural_scene_functional_mappings;
  const forbidden = ['runtime_instance', 'stock', 'container_instance',
    'process_instance', 'operation_instance'];
  if (forbidden.some((key) => hasKey(candidate, key)))
    fail('PROCEDURAL_IMPORT_RUNTIME_ROW_FORBIDDEN');
  if (mappingRows.length !== 7
      || !families.every((row) => Array.isArray(row.forbidden_implications)
        && (row.family !== 'natural_shore'
          || Array.isArray(row.materialization_limits))))
    fail('PROCEDURAL_IMPORT_ROW_PARITY_INVALID');
  const gaps = rows.procedural_scene_remaining_gaps;
  if (JSON.stringify(gaps.map(({ code }) => code)) !== JSON.stringify(GAP_CODES))
    fail('PROCEDURAL_IMPORT_REMAINING_GAPS_INVALID');
  const linked = [promotionManifest, approvalRequest, importLedger];
  if (linked.some((value) => value.target_revision_id !== TARGET_REVISION
      || value.target_catalog_digest !== candidate.target_catalog_digest)
      || promotionManifest.candidate_digest !== candidate.candidate_digest
      || approvalRequest.candidate_digest !== candidate.candidate_digest
      || approvalRequest.promotion_manifest_digest !==
        promotionManifest.promotion_manifest_digest
      || importLedger.candidate_digest !== candidate.candidate_digest
      || importLedger.approval_request_digest !==
        approvalRequest.approval_request_digest
      || importLedger.promotion_manifest_digest !==
        promotionManifest.promotion_manifest_digest
      || importLedger.approval_attestation_digest !== null)
    fail('PROCEDURAL_IMPORT_ARTIFACT_BINDING_INVALID');
  if (approvalRequest.decision_requested !==
        'approve_disposable_local_authoring_import'
      || approvalRequest.scope !== 'disposable_local_pr_candidate_database'
      || linked.some((value) => value.activation_event_count !== undefined
        && value.activation_event_count !== 0)
      || linked.some((value) => value.runtime_capabilities_authorized
        && value.runtime_capabilities_authorized.length !== 0)
      || ['operator_authorized', 'production_authorized',
        'import_activation_authorized', 'default_authorized',
        'deploy_authorized', 'rematerialization_authorized']
        .some((key) => approvalRequest[key] !== false))
    fail('PROCEDURAL_IMPORT_AUTHORITY_INVALID');
  return true;
}

function validateSources(value) {
  const fail = (code) => { throw Object.assign(new Error(code), { code }); };
  if (value.overlay.overlay_digest !== OVERLAY_DIGEST
      || value.functionalCandidate.candidate_digest !== FUNCTIONAL.candidate
      || value.functionalRequest.request_digest !== FUNCTIONAL.request
      || value.functionalAttestation.attestation_digest !== FUNCTIONAL.attestation
      || value.v5Manifest.candidate_digest !== V5.candidate
      || value.v5Approval.request_digest !== V5.approval_request
      || digestEnvelope(value.v5Approval) !== V5.approval_attestation
      || value.v5Promotion.approval_attestation_digest !== V5.approval_attestation
      || value.v5Promotion.target_revision_id !== V5.target_revision_id
      || value.v5Promotion.target_catalog_digest !== V5.target_catalog_digest
      || value.spatialManifest.world_revision_id !== WORLD.revision_id
      || value.spatialManifest.catalog_digest !== WORLD.catalog_digest
      || value.spatialManifestFileDigest != null
        && value.spatialManifestFileDigest !== WORLD.pin_manifest_digest)
    fail('PROCEDURAL_IMPORT_SOURCE_PIN_MISMATCH');
  for (const attestation of [...value.rowAttestations,
    value.functionalAttestation]) {
    const { attestation_digest: claimed, ...payload } = attestation;
    if (digestJson(payload) !== claimed || attestation.authoring_approved !== true
        || attestation.import_authorized !== false
        || attestation.activation_authorized !== false)
      fail('PROCEDURAL_IMPORT_ATTESTATION_INVALID');
  }
  if (value.rowAttestations.length !== 3
      || new Set(value.rowAttestations.map(({ candidate_ref: ref }) => ref)).size
        !== 3) fail('PROCEDURAL_IMPORT_ATTESTATION_SET_INVALID');
}

function recordId(row) {
  return row.candidate_id ? `${row.candidate_id}@${row.version}`
    : row.mapping_id ?? `${row.family_candidate_ref}:${row.layer}`;
}
function hasKey(value, key) {
  if (!value || typeof value !== 'object') return false;
  if (Object.hasOwn(value, key)) return true;
  return Object.values(value).some((child) => hasKey(child, key));
}
function digestJson(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
function digestBytes(value) {
  return createHash('sha256').update(value).digest('hex');
}

async function main(argv) {
  const root = resolve(argv.find((arg) => !arg.startsWith('--')) ?? '.');
  const pack = await generateProceduralAuthoringImportPack(root);
  const outputs = [
    ['candidate.json', pack.candidate],
    ['promotion-manifest.json', pack.promotionManifest],
    ['approval-request.json', pack.approvalRequest],
    ['import-ledger.json', pack.importLedger]
  ];
  if (argv.includes('--check')) {
    for (const [file, expected] of outputs) {
      const actual = await readFile(resolve(root, OUTPUT, file), 'utf8');
      if (actual !== `${JSON.stringify(expected, null, 2)}\n`)
        throw Object.assign(new Error(`PROCEDURAL_IMPORT_PACK_STALE:${file}`),
          { code: 'PROCEDURAL_IMPORT_PACK_STALE' });
    }
  } else {
    await mkdir(resolve(root, OUTPUT), { recursive: true });
    await Promise.all(outputs.map(([file, value]) => writeFile(
      resolve(root, OUTPUT, file), `${JSON.stringify(value, null, 2)}\n`)));
  }
  process.stdout.write(`${JSON.stringify({ pass: true,
    candidate_digest: pack.candidate.candidate_digest,
    approval_request_digest: pack.approvalRequest.approval_request_digest,
    promotion_manifest_digest:
      pack.promotionManifest.promotion_manifest_digest,
    import_audit_digest: pack.importLedger.import_audit_digest }, null, 2)}\n`);
}

if (process.argv[1]
    && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  await main(process.argv.slice(2));
