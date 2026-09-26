import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import registry from '../data/runtime-catalog/item-container-record-registry.v1.json'
  with { type: 'json' };
import {
  canonicalStringify,
  computeCanonicalRecordDigest,
  computeRecordRegistryDigest,
  projectCanonicalRecord
} from
  '../packages/runtime-catalog/src/canonical-records.js';
import {
  computeDependencyAssertionsSemanticDigest,
  computeTablePayloadDigest,
  computeTargetCatalogDigest
} from '../packages/runtime-catalog/src/ledger-digests.js';
import { RUNTIME_CATALOG_FIRST_PLAYABLE_CONTRACT_DIGEST } from
  '../packages/runtime-catalog/src/runtime-contract.js';
import { buildBaseWorldCompatibilityManifest, digestEnvelope } from
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
  manifest_sha256: '776ab6989f5c8bb6c49858eb27b3bb9ac637a674e314f1c7e956a35cdbe569eb'
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

  const rowAttestationRefs = rowAttestations.map((attestation, index) => ({
    path: `${ROOT}/${ROW_ATTESTATIONS[index]}`,
    candidate_ref: attestation.candidate_ref,
    attestation_digest: attestation.attestation_digest
  })).sort((left, right) => left.candidate_ref.localeCompare(right.candidate_ref));
  const runtimeConfiguration = {
    schema: 'rus.first_playable_runtime_world_configuration.v1',
    release_id: 'spatial-v3-production-v12',
    world_revision_id: WORLD.revision_id,
    world_catalog_digest: WORLD.catalog_digest,
    world_manifest_sha256: WORLD.manifest_sha256,
    scenario_binding_id: 'lower_dvina_late_summer_open_water_v1',
    runtime_catalog_contract_digest:
      RUNTIME_CATALOG_FIRST_PLAYABLE_CONTRACT_DIGEST
  };
  const compatibilityManifest = buildBaseWorldCompatibilityManifest({
    compatibleWorldRevisionId: WORLD.revision_id,
    compatibleWorldCatalogDigest: WORLD.catalog_digest,
    sourceRuntimeConfigurationDigest: digestEnvelope(runtimeConfiguration),
    sourceArtifactPaths: [
      'data/world-catalogs/novgorod/spatial-v3/candidates/spatial-v3-production-v6/manifest.json',
      'apps/game-server/src/composition/production-spatial-v3.js',
      'apps/game-server/src/runtime/releases/spatial-v3-production-v12-bindings.js'
    ],
    sourceCommitSha: SUBJECT_COMMIT,
    validationContractVersion: 'base_world_compatibility_v2'
  });
  const registryDigest = computeRecordRegistryDigest(registry);
  const compatibleWorldTuple = {
    compatible_world_revision_id: WORLD.revision_id,
    compatible_world_catalog_digest: WORLD.catalog_digest,
    compatible_world_pin_manifest_digest:
      compatibilityManifest.compatible_world_pin_manifest_digest
  };
  const upstream = {
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
  };
  const sourcePackDigest = digestEnvelope({
    schema: 'rus.procedural_authoring_compiler_inputs.v1',
    upstream,
    compatible_world_pin_manifest_digest:
      compatibilityManifest.compatible_world_pin_manifest_digest
  });
  const compiledRows = compileRows({ overlay, functionalCandidate,
    functionalAttestation, upstream, sourcePackDigest });
  const registryEntry = registry.entries.find(({ table_name: table }) =>
    table === 'procedural_scene_compiled_records');
  if (!registryEntry) throw new Error('PROCEDURAL_COMPILED_REGISTRY_MISSING');
  const records = compiledRows.map((row, ordinal) => {
    const canonicalPayload = projectCanonicalRecord({ registryEntry, row });
    return { table_name: registryEntry.table_name, operation_kind: 'insert',
      record_key: canonicalStringify(canonicalPayload.record_key),
      canonical_payload: canonicalPayload,
      record_digest: computeCanonicalRecordDigest(canonicalPayload), ordinal };
  });
  const tableOperation = {
    table_name: registryEntry.table_name,
    dependency_order: registryEntry.dependency_order,
    insert_count: records.length,
    assert_existing_count: 0,
    record_count: records.length,
    records_digest: computeTablePayloadDigest(records),
    records
  };
  const candidateRowsByTable = {
    procedural_scene_compiled_records: compiledRows
  };
  const recordOperations = [tableOperation];
  const targetCatalogDigest = computeTargetCatalogDigest({
    schema: 'rus.domain_catalog_payload.v2',
    catalog_scope: 'item_container_materialization_v2',
    target_revision_id: TARGET_REVISION,
    compatible_world_tuple: compatibleWorldTuple,
    record_registry_digest: registryDigest,
    tables: [{
      table_name: tableOperation.table_name,
      dependency_order: tableOperation.dependency_order,
      insert_count: tableOperation.insert_count,
      assert_existing_count: 0,
      record_count: tableOperation.record_count,
      records_digest: tableOperation.records_digest
    }],
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
    compatibility_manifest: compatibilityManifest,
    upstream,
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
    tables: [{
      table_name: tableOperation.table_name,
      dependency_order: tableOperation.dependency_order,
      insert_count: tableOperation.insert_count,
      assert_existing_count: 0,
      record_count: tableOperation.record_count,
      records_digest: tableOperation.records_digest
    }],
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
    tables: promotionManifest.tables.map((table) => ({
      ...table, payload_digest: table.records_digest
    })),
    records: records.map((record) => ({ ...record, import_id: importId })),
    dependency_assertions: [],
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
      || candidate.compatibility_manifest.compatible_world_revision_id !==
        WORLD.revision_id
      || candidate.compatibility_manifest.compatible_world_catalog_digest !==
        WORLD.catalog_digest
      || candidate.compatibility_manifest.compatible_world_pin_manifest_digest
        !== candidate.compatible_world_tuple.compatible_world_pin_manifest_digest)
    fail('PROCEDURAL_IMPORT_UPSTREAM_PIN_MISMATCH');
  const rows = candidate.candidate_rows_by_table;
  if (JSON.stringify(Object.keys(rows ?? {})) !==
      JSON.stringify(['procedural_scene_compiled_records']))
    fail('PROCEDURAL_IMPORT_UNKNOWN_TABLE');
  const compiled = rows.procedural_scene_compiled_records;
  const ids = compiled.map(({ record_id: id, version }) => `${id}@${version}`);
  const kinds = compiled.reduce((counts, { record_kind: kind }) => ({
    ...counts, [kind]: (counts[kind] ?? 0) + 1
  }), {});
  if (compiled.length !== 11 || new Set(ids).size !== ids.length
      || kinds.profile !== 3 || kinds.mapping !== 7
      || kinds.approval_metadata !== 1
      || compiled.some((row) => row.status !==
          'approved_authoring_not_runtime_selectable'
        || row.payload_digest !== digestEnvelope(row.payload)))
    fail('PROCEDURAL_IMPORT_RUNTIME_SELECTABLE_STATUS');
  const operation = candidate.record_operations_by_table[0];
  if (candidate.record_operations_by_table.length !== 1
      || operation.table_name !== 'procedural_scene_compiled_records'
      || operation.insert_count !== 11 || operation.assert_existing_count !== 0
      || operation.record_count !== 11
      || operation.records_digest !== computeTablePayloadDigest(operation.records)
      || operation.records.some((record, ordinal) =>
        record.operation_kind !== 'insert' || record.ordinal !== ordinal))
    fail('PROCEDURAL_IMPORT_LEDGER_MEMBERSHIP_INVALID');
  if (candidate.status !== 'authoring_approved_not_imported')
    fail('PROCEDURAL_IMPORT_RUNTIME_SELECTABLE_STATUS');
  const forbidden = ['runtime_instance', 'stock', 'container_instance',
    'process_instance', 'operation_instance'];
  if (forbidden.some((key) => hasKey(candidate, key)))
    fail('PROCEDURAL_IMPORT_RUNTIME_ROW_FORBIDDEN');
  const metadata = compiled.find(({ record_kind: kind }) =>
    kind === 'approval_metadata')?.payload;
  if (!metadata || Object.keys(metadata.profile_limits).length !== 3
      || metadata.runtime_capabilities_authorized.length !== 0
      || metadata.activation_event_count !== 0)
    fail('PROCEDURAL_IMPORT_ROW_PARITY_INVALID');
  const gaps = metadata.remaining_gaps;
  if (JSON.stringify(gaps.map(({ code }) => code)) !== JSON.stringify(GAP_CODES))
    fail('PROCEDURAL_IMPORT_REMAINING_GAPS_INVALID');
  if (importLedger.tables.length !== 1 || importLedger.records.length !== 11
      || importLedger.tables[0].payload_digest !== operation.records_digest
      || importLedger.records.some((record, index) =>
        record.import_id !== importLedger.import_id
          || record.record_digest !== operation.records[index].record_digest))
    fail('PROCEDURAL_IMPORT_LEDGER_MEMBERSHIP_INVALID');
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
        && value.spatialManifestFileDigest !== WORLD.manifest_sha256)
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

function compileRows({ overlay, functionalCandidate, functionalAttestation,
  upstream, sourcePackDigest }) {
  const profiles = overlay.candidates.map((candidate) => {
    const payload = {
      family: candidate.family,
      spatial_closure_ref: structuredClone(candidate.spatial_closure_ref),
      allowed_semantics: [...candidate.allowed_semantics],
      requirements: structuredClone(candidate.requirements),
      forbidden_implications: [...candidate.forbidden_implications],
      materialization_limits: [...(candidate.materialization_limits ?? [])],
      data_gap_codes: [...candidate.data_gap_codes],
      source_candidate_status: candidate.status,
      authoring_approval: candidate.authoring_approval,
      source_candidate_digest: candidate.candidate_digest
    };
    return compiledRow({
      recordId: `profile:${candidate.candidate_id}`,
      version: candidate.version,
      recordKind: 'profile',
      familyCandidateRef: `${candidate.candidate_id}@${candidate.version}`,
      payload,
      sourcePackDigest
    });
  });
  const mappings = functionalCandidate.mappings.map((mapping) => {
    const { evidence, ...normalized } = mapping;
    const payload = {
      ...structuredClone(normalized),
      evidence_digest: digestEnvelope(evidence),
      source_candidate_status: functionalCandidate.status,
      authoring_approval_scope: functionalAttestation.approval_scope
    };
    return compiledRow({ recordId: `mapping:${mapping.mapping_id}`, version: 1,
      recordKind: 'mapping',
      familyCandidateRef: mapping.family_candidate_ref, payload,
      sourcePackDigest });
  });
  const metadataPayload = {
    overlay_status: overlay.status,
    functional_candidate_status: functionalCandidate.status,
    authoring_approval_scopes: [
      'route_free_family_rows', functionalAttestation.approval_scope
    ],
    profile_limits: Object.fromEntries(overlay.candidates.map((candidate) => [
      `${candidate.candidate_id}@${candidate.version}`,
      {
        forbidden_implications: [...candidate.forbidden_implications],
        materialization_limits: [...(candidate.materialization_limits ?? [])],
        data_gap_codes: [...candidate.data_gap_codes]
      }
    ])),
    remaining_gaps: structuredClone(functionalCandidate.remaining_gaps),
    functional_limits: structuredClone(functionalAttestation.limits),
    upstream: structuredClone(upstream),
    runtime_capabilities_authorized: [],
    activation_event_count: 0
  };
  return [...profiles, ...mappings, compiledRow({
    recordId: 'approval:procedural-authoring-combined', version: 1,
    recordKind: 'approval_metadata', familyCandidateRef: null,
    payload: metadataPayload, sourcePackDigest
  })].sort((left, right) => left.record_id.localeCompare(right.record_id));
}

function compiledRow({ recordId, version, recordKind, familyCandidateRef,
  payload, sourcePackDigest }) {
  return {
    record_id: recordId,
    version,
    record_kind: recordKind,
    family_candidate_ref: familyCandidateRef,
    payload,
    payload_digest: digestEnvelope(payload),
    source_pack_digest: sourcePackDigest,
    status: 'approved_authoring_not_runtime_selectable'
  };
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
