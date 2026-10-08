import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import registry from '../data/runtime-catalog/item-container-record-registry.v1.json'
  with { type: 'json' };
import {
  canonicalStringify, computeCanonicalRecordDigest,
  computeRecordRegistryDigest, projectCanonicalRecord
} from '../packages/runtime-catalog/src/canonical-records.js';
import {
  computeDependencyAssertionsSemanticDigest, computeTablePayloadDigest,
  computeTargetCatalogDigest
} from '../packages/runtime-catalog/src/ledger-digests.js';
import { RUNTIME_CATALOG_FIRST_PLAYABLE_CONTRACT_DIGEST } from
  '../packages/runtime-catalog/src/runtime-contract.js';
import { buildBaseWorldCompatibilityManifest, digestEnvelope } from
  '../tools/runtime-catalog-activation/src/artifact-contracts.js';
import { generateProceduralAuthoringImportPack } from
  './generate-procedural-authoring-import-pack.mjs';
import { buildPr17Stage3CPromotionPlan } from
  '../tools/world-catalog-workflow/src/internal/pr17-stage3c.js';

const OUTPUT =
  'data/world-catalogs/novgorod/procedural-scene-v2/final-candidate-pack-v1';
const SUBJECT_COMMIT = 'b32863f620940101cdf5938170d881ad32e5721a';
const TARGET_REVISION = 'procedural_scene_final_candidate_v1_001';
const CACHE_TABLE = 'procedural_scene_compiled_records';
const WORLD = Object.freeze({
  revision_id: 'novgorod_spatial_v3_production_v6_candidate_001',
  catalog_digest: '6e6cd611042ff86229c73409816893ea4e983c01722dd4699bac346acfb846ad',
  manifest_sha256: '776ab6989f5c8bb6c49858eb27b3bb9ac637a674e314f1c7e956a35cdbe569eb'
});
const PATHS = Object.freeze({
  stale: 'data/world-catalogs/novgorod/procedural-scene-v2/import-pack-v1/candidate.json',
  regional: 'data/world-catalogs/novgorod/regional-environment/candidates/novgorod-1230-1250-v1/candidate.json',
  regionalExisting: 'data/world-catalogs/novgorod/regional-environment/candidates/novgorod-1230-1250-v1/existing-promotions-approval-attestation.json',
  drying: 'data/world-catalogs/novgorod/regional-environment/candidates/novgorod-1230-1250-v1/drying-enablement-approval-attestation.json',
  onomastics: 'data/world-catalogs/novgorod/onomastics/candidates/novgorod-1230-1250-v1/candidate.json',
  onomasticsApproval: 'data/world-catalogs/novgorod/onomastics/candidates/novgorod-1230-1250-v1/independent-authoring-attestation.json',
  appearance: 'data/world-catalogs/novgorod/spatial-v3/candidates/spatial-v3-production-v6/actor-appearance-carry-forward-v1/candidate.json',
  equipment: 'data/world-catalogs/novgorod/procedural-scene-v2/npc-equipment-v1/candidate.json',
  equipmentApproval: 'data/world-catalogs/novgorod/procedural-scene-v2/npc-equipment-v1/approval-attestation.json',
  itemManifest: 'data/knowledge-source/imports/item-container-120-v5/candidate/manifest.json',
  itemApproval: 'docs/implementation/item-container-120-approval-audit/evidence/FINAL_APPROVAL_ATTESTATION.json',
  itemRequest: 'docs/implementation/item-container-120-approval-audit/evidence/FINAL_APPROVAL_REQUEST.json',
  itemG4: 'docs/implementation/item-container-120-approval-audit/evidence/G4_DEPENDENCY_APPROVAL_REQUEST.json',
  itemInventory: 'docs/implementation/item-container-120-approval-audit/evidence/OPERATOR_LEGACY_INVENTORY_SNAPSHOT.json',
  itemPromotion: 'docs/implementation/item-container-120-approval-audit/evidence/STAGE3C_PROMOTION_RESULT.json'
});
const INDEPENDENT_ATTESTATION = Object.freeze({
  schema: 'rus.procedural_final_candidate_approval_attestation.v1',
  attestation_id:
    'novgorod_procedural_final_candidate_disposable_import_approval_001',
  subject_commit_sha: 'ca1e9b68d2e07c2c0a15164a1af330d5d8807d6d',
  candidate_path: `${OUTPUT}/candidate.json`,
  pack_subject_commit_sha: SUBJECT_COMMIT,
  pack_id: 'novgorod_procedural_scene_final_candidate_001',
  pack_version: 1,
  candidate_digest:
    '12a160383a5aba4dfbda9aa5f6ef64273d712944322d9fb44f3a1eb1d45d5d67',
  verdict: 'APPROVE_FOR_DISPOSABLE_IMPORT_READBACK_ONLY',
  approval_scope: 'authoring_and_disposable_import_readback_eligibility_only',
  target_binding: {
    target_revision_id: TARGET_REVISION,
    target_catalog_digest:
      '4ece07fb44abff19490f998a8712144ff18c76daa3080489b51f1df3e705950c',
    catalog_scope: 'item_container_materialization_v2',
    record_registry_digest:
      'a389f6d049ba6cf2b7e50b4287a145b8976ac4202694775b23a943292747b0ca'
  },
  source_binding: {
    source_pack_digest:
      '4ddd8a0bd3770312808166599e8a57801939c7fc2b915c2fcc3c7db7030422af',
    source_closure_count: 53,
    source_summary: {
      procedural_profiles: 3, functional_mappings: 7,
      regional_environment: { landscape: 33, water: 21, land_use: 24,
        place: 37, drying: 2 },
      onomastics_names: 54, appearance_rows: 166,
      npc_equipment_profiles: 3, item_container_templates: 120
    }
  },
  record_binding: {
    record_operations_count: 40,
    records_digest:
      'ceb7fc4bd4f9a54eb1b5d6ecc1db597db47b6548e383bd8a5dd828ee697921f2',
    total_record_count: 3269, regional_existing_member_count: 115,
    regional_drying_row_count: 2, v5_assert_existing_table_count: 39,
    v5_assert_existing_record_count: 3248,
    compiled_insert_table: CACHE_TABLE, compiled_insert_count: 21,
    compiled_insert_records_digest:
      '1ae628a78346dcd166e18aa1d0759e78379aa3d4a2bf26326acfc6c3043effad',
    append_only_existing_table_only: true
  },
  compatibility_binding: {
    compatible_world_tuple: {
      compatible_world_revision_id: WORLD.revision_id,
      compatible_world_catalog_digest: WORLD.catalog_digest,
      compatible_world_pin_manifest_digest:
        '273824b6ea2cf3b34d1c6b4a57333909f663b54c0929a6bd8daac0989a3fed58'
    },
    compatibility_manifest_digest:
      '273824b6ea2cf3b34d1c6b4a57333909f663b54c0929a6bd8daac0989a3fed58',
    source_runtime_configuration_digest:
      '057717aa6aef71830be85c4578d021efbccacbff72686f3d1a9b67f3cfad3693',
    validation_contract_version: 'base_world_compatibility_v2'
  },
  v5_prerequisite: {
    mode: 'required_prior_import_and_same_database_readback',
    target_revision_id:
      'world_revision_novgorod_1230_item_container_approved_001',
    target_catalog_digest:
      'a24fe55497a8aca018fa28a43ab1f54e26e2f30a5c74931ed2570ab69bc07a87',
    candidate_digest:
      'e3bddda4b31cdbb91d430254db5e6f2d34a8d9d0a08e5f7e4c1e1d6cb9832a24',
    approval_request_digest:
      '046344b570789b008da8685d0dad3824512d529f9c161a122ecdc59e3cb73771',
    approval_attestation_digest:
      '67baf3e92a2aacde2566a60c13e5a3a2410e3544549f096684d473d8588f18f8',
    required_table_count: 39, required_record_count: 3248,
    current_runtime_presence_claimed: false,
    stage3c_isolated_database_evidence_only: true,
    final_import_must_fail_if_any_assert_existing_record_is_absent_or_drifted:
      true
  },
  authority: {
    authoring_approved: true, disposable_import_readback_eligible: true,
    import_authorized: false, activation_authorized: false,
    production_authorized: false,
    new_development_party_activation_authorized: false,
    existing_party_migration_authorized: false,
    old_save_rematerialization_authorized: false,
    database_mutated: false, runtime_capabilities_authorized: [],
    activation_request: null
  },
  future_activation_requirements: [
    'successful_same_database_v5_prerequisite_import_and_readback',
    'successful_disposable_final_candidate_import_and_readback',
    'separate_activation_approval_for_new_development_parties_only'
  ],
  auditor: 'independent_final_candidate_auditor',
  audit_date: '2026-09-21',
  attestation_digest:
    '0204d109cbe18d06aed0957be3c10d12a088e15368cc0e7eb865b1382538ef7c'
});

export async function generateProceduralFinalCandidatePack(rootDir,
  overrides = {}) {
  const root = resolve(rootDir);
  const load = async (path) => overrides[path]
    ?? JSON.parse(await readFile(resolve(root, path), 'utf8'));
  const rawDigest = async (path) => overrides[path]
    ? digestEnvelope(overrides[path])
    : sha256(await readFile(resolve(root, path)));
  const [base, stale, regional, regionalExisting, drying, onomastics,
    onomasticsApproval, appearance, equipment, equipmentApproval,
    itemManifest, itemApproval, itemRequest, itemG4, itemInventory,
    itemPromotion] = await Promise.all([
    generateProceduralAuthoringImportPack(root, overrides),
    load(PATHS.stale), load(PATHS.regional), load(PATHS.regionalExisting),
    load(PATHS.drying), load(PATHS.onomastics),
    load(PATHS.onomasticsApproval), load(PATHS.appearance),
    load(PATHS.equipment), load(PATHS.equipmentApproval),
    load(PATHS.itemManifest), load(PATHS.itemApproval), load(PATHS.itemRequest),
    load(PATHS.itemG4), load(PATHS.itemInventory),
    load(PATHS.itemPromotion)
  ]);
  validateSources({ base, stale, regional, regionalExisting, drying,
    onomastics, onomasticsApproval, appearance, equipment,
    equipmentApproval, itemManifest, itemApproval, itemPromotion });
  const approvedV5 = await buildApprovedV5Rows({ root, load, itemManifest,
    itemApproval, itemRequest, itemG4, itemInventory });

  const sourceClosure = await Promise.all(Object.entries(PATHS)
    .filter(([key]) => key !== 'stale')
    .map(async ([owner, path]) => ({ owner, path,
      sha256: await rawDigest(path) })));
  sourceClosure.sort((left, right) => left.owner.localeCompare(right.owner));
  for (const dataset of itemManifest.datasets) {
    const path = `data/knowledge-source/imports/item-container-120-v5/candidate/${dataset.path}`;
    const digest = await rawDigest(path);
    const semanticDigest = digestEnvelope(await load(path));
    if (semanticDigest !== dataset.sha256)
      fail('FINAL_PACK_V5_DATASET_DIGEST_INVALID');
    sourceClosure.push({ owner: `itemDataset:${dataset.table}`, path,
      sha256: digest, semantic_digest: semanticDigest,
      record_count: dataset.record_count });
  }
  sourceClosure.sort((left, right) => left.owner.localeCompare(right.owner));
  validateClosureDigests({ sourceClosure, regional, regionalExisting, drying,
    onomasticsApproval, appearance, equipmentApproval });
  const compatibilityManifest = compatibility();
  const sourcePackDigest = digestEnvelope({
    schema: 'rus.procedural_final_candidate_source_closure.v1',
    source_closure: sourceClosure,
    procedural_base_candidate_digest: base.candidate.candidate_digest,
    compatible_world_pin_manifest_digest:
      compatibilityManifest.compatible_world_pin_manifest_digest
  });
  const rows = compileRows({ base, regional, regionalExisting, drying,
    onomastics, onomasticsApproval, appearance, equipment,
    equipmentApproval, itemManifest, itemApproval, itemPromotion,
    approvedV5, sourcePackDigest });
  const registryEntry = registry.entries.find(({ table_name: table }) =>
    table === CACHE_TABLE);
  if (!registryEntry) fail('FINAL_PACK_CACHE_REGISTRY_MISSING');
  const cacheRecords = rows.map((row, ordinal) => {
    const canonicalPayload = projectCanonicalRecord({ registryEntry, row });
    return { table_name: CACHE_TABLE, operation_kind: 'insert',
      record_key: canonicalStringify(canonicalPayload.record_key),
      canonical_payload: canonicalPayload,
      record_digest: computeCanonicalRecordDigest(canonicalPayload), ordinal };
  });
  const table = { table_name: CACHE_TABLE,
    dependency_order: registryEntry.dependency_order,
    insert_count: cacheRecords.length, assert_existing_count: 0,
    record_count: cacheRecords.length,
    records_digest: computeTablePayloadDigest(cacheRecords),
    records: cacheRecords };
  const recordOperations = [table, ...compileAssertExistingOperations(
    approvedV5)].sort((left, right) => left.dependency_order
      - right.dependency_order);
  const compatibleWorldTuple = {
    compatible_world_revision_id: WORLD.revision_id,
    compatible_world_catalog_digest: WORLD.catalog_digest,
    compatible_world_pin_manifest_digest:
      compatibilityManifest.compatible_world_pin_manifest_digest
  };
  const registryDigest = computeRecordRegistryDigest(registry);
  const targetCatalogDigest = computeTargetCatalogDigest({
    schema: 'rus.domain_catalog_payload.v2',
    catalog_scope: 'item_container_materialization_v2',
    target_revision_id: TARGET_REVISION,
    compatible_world_tuple: compatibleWorldTuple,
    record_registry_digest: registryDigest,
    tables: recordOperations.map(({ records: ignored, ...operation }) =>
      operation),
    dependency_assertions_semantic_digest:
      computeDependencyAssertionsSemanticDigest([])
  });
  const payload = {
    schema: 'rus.procedural_scene_final_candidate_pack.v1',
    pack_id: 'novgorod_procedural_scene_final_candidate_001',
    version: 1,
    status: 'sealed_candidate_not_imported',
    subject_commit_sha: SUBJECT_COMMIT,
    supersedes: {
      path: PATHS.stale,
      candidate_digest: stale.candidate_digest,
      accepted_as_source: false,
      import_authorized: false,
      activation_authorized: false
    },
    source_closure: sourceClosure,
    source_pack_digest: sourcePackDigest,
    source_summary: {
      procedural_profiles: 3,
      functional_mappings: 7,
      regional_environment: { ...regionalExisting.approved_counts, drying: 2 },
      onomastics_names: onomastics.names.length,
      appearance_rows: appearance.authoring_attestation.row_count,
      npc_equipment_profiles: equipmentApproval.profile_ids.length,
      item_container_templates: itemManifest.cohort.template_count
    },
    procedural_base: {
      generated_from_current_owner_inputs: true,
      candidate_digest: base.candidate.candidate_digest,
      upstream: structuredClone(base.candidate.upstream),
      compiled_row_count: 10
    },
    compatibility_manifest: compatibilityManifest,
    compatible_world_tuple: compatibleWorldTuple,
    target_revision_id: TARGET_REVISION,
    target_catalog_digest: targetCatalogDigest,
    record_registry_digest: registryDigest,
    candidate_rows_by_table: { [CACHE_TABLE]: rows },
    record_operations_by_table: recordOperations,
    append_only_import_plan: {
      catalog_scope: 'item_container_materialization_v2',
      tables: recordOperations.map(({ records: ignored, records_digest,
        ...operation }) => ({ ...operation, payload_digest: records_digest })),
      records_source: 'record_operations_by_table[].records',
      record_count: recordOperations.reduce((sum, operation) =>
        sum + operation.record_count, 0),
      records_digest: digestEnvelope(recordOperations.map((operation) => ({
        table_name: operation.table_name,
        records_digest: operation.records_digest
      }))),
      dependency_assertions: [],
      import_authorized: false
    },
    activation_policy: {
      activation_authorized: false,
      eligible_party_scope_after_separate_approval:
        'new_development_parties_only',
      existing_party_migration_authorized: false,
      old_save_rematerialization_authorized: false,
      activation_request: null
    },
    database_mutated: false,
    runtime_capabilities_authorized: [],
    independent_attestation: structuredClone(INDEPENDENT_ATTESTATION)
  };
  const pack = { ...payload, candidate_digest: digestEnvelope(payload) };
  validateProceduralFinalCandidatePack(pack);
  return pack;
}

export function validateProceduralFinalCandidatePack(pack) {
  const { candidate_digest: claimed, ...payload } = pack ?? {};
  if (claimed !== digestEnvelope(payload)) fail('FINAL_PACK_DIGEST_MISMATCH');
  const { independent_attestation: attestation, ...auditedPayload } = payload;
  const { attestation_digest: attestationDigest, ...attestationPayload } =
    attestation ?? {};
  if (digestEnvelope(attestationPayload) !== attestationDigest
      || attestationDigest !==
        '0204d109cbe18d06aed0957be3c10d12a088e15368cc0e7eb865b1382538ef7c'
      || digestEnvelope(auditedPayload) !== attestation.candidate_digest
      || attestation.target_binding.target_catalog_digest !==
        pack.target_catalog_digest
      || attestation.source_binding.source_pack_digest !==
        pack.source_pack_digest
      || attestation.record_binding.records_digest !==
        pack.append_only_import_plan.records_digest
      || attestation.compatibility_binding.compatible_world_tuple
        .compatible_world_pin_manifest_digest !==
        pack.compatible_world_tuple.compatible_world_pin_manifest_digest)
    fail('FINAL_PACK_INDEPENDENT_ATTESTATION_INVALID');
  if (pack.status !== 'sealed_candidate_not_imported'
      || pack.subject_commit_sha !== SUBJECT_COMMIT
      || pack.supersedes.accepted_as_source !== false
      || pack.supersedes.import_authorized !== false
      || pack.supersedes.activation_authorized !== false)
    fail('FINAL_PACK_STALE_OR_STATUS_INVALID');
  const rows = pack.candidate_rows_by_table?.[CACHE_TABLE];
  const cacheOperation = pack.record_operations_by_table?.find(
    ({ table_name: table }) => table === CACHE_TABLE);
  const records = cacheOperation?.records;
  if (!Array.isArray(rows) || rows.length !== 21
      || !Array.isArray(records) || records.length !== rows.length
      || pack.record_operations_by_table.length !== 40
      || cacheOperation.insert_count !== rows.length
      || cacheOperation.assert_existing_count !== 0
      || cacheOperation.records_digest !==
        computeTablePayloadDigest(records))
    fail('FINAL_PACK_MEMBERSHIP_INVALID');
  const asserted = pack.record_operations_by_table.filter(
    ({ table_name: table }) => table !== CACHE_TABLE);
  if (asserted.length !== 39 || asserted.some((operation) =>
    operation.insert_count !== 0
      || operation.assert_existing_count !== operation.record_count
      || operation.records.some((record) =>
        record.operation_kind !== 'assert_existing')
      || operation.records_digest !== computeTablePayloadDigest(
        operation.records))) fail('FINAL_PACK_ITEM_CLOSURE_INVALID');
  if (/"(?:status|review_status)":"(?:pending|rejected|draft)/u.test(
    JSON.stringify(asserted))) fail('FINAL_PACK_UNAPPROVED_ROW');
  const reconstructedTarget = computeTargetCatalogDigest({
    schema: 'rus.domain_catalog_payload.v2',
    catalog_scope: pack.append_only_import_plan.catalog_scope,
    target_revision_id: pack.target_revision_id,
    compatible_world_tuple: pack.compatible_world_tuple,
    record_registry_digest: pack.record_registry_digest,
    tables: pack.record_operations_by_table.map(
      ({ records: ignored, ...operation }) => operation),
    dependency_assertions_semantic_digest:
      computeDependencyAssertionsSemanticDigest([])
  });
  if (reconstructedTarget !== pack.target_catalog_digest)
    fail('FINAL_PACK_TARGET_DIGEST_INVALID');
  const ids = rows.map(({ record_id: id, version }) => `${id}@${version}`);
  if (new Set(ids).size !== ids.length
      || rows.some((row) => row.status !==
        'approved_authoring_not_runtime_selectable'
          || row.payload_digest !== digestEnvelope(row.payload)))
    fail('FINAL_PACK_ROW_INVALID');
  const serializedRows = JSON.stringify(rows);
  if (/"(?:status|source_status|source_row_status)":"(?:pending|rejected|draft)/u
      .test(serializedRows)) fail('FINAL_PACK_UNAPPROVED_ROW');
  const metadata = rows.find(({ record_id: id }) => id ===
    'approval:final-candidate')?.payload;
  if (!metadata
      || JSON.stringify(metadata.regional_counts) !== JSON.stringify({
        landscape: 33, water: 21, land_use: 24, place: 37, drying: 2
      })
      || metadata.onomastics_name_count !== 54
      || metadata.appearance_row_count !== 166
      || metadata.npc_equipment_profile_count !== 3)
    fail('FINAL_PACK_SOURCE_CLOSURE_INVALID');
  if (metadata.item_container.asserted_table_count !== 39
      || metadata.item_container.asserted_record_count !== asserted.reduce(
        (sum, operation) => sum + operation.record_count, 0))
    fail('FINAL_PACK_ITEM_CLOSURE_INVALID');
  validateNoDuplicateAuthority(metadata.authority_claims);
  if (pack.procedural_base.generated_from_current_owner_inputs !== true
      || pack.procedural_base.compiled_row_count !== 10
      || pack.source_summary.procedural_profiles !== 3
      || pack.source_summary.functional_mappings !== 7
      || pack.source_summary.item_container_templates !== 120)
    fail('FINAL_PACK_SOURCE_CLOSURE_INVALID');
  if (pack.append_only_import_plan.import_authorized !== false
      || pack.activation_policy.activation_authorized !== false
      || pack.activation_policy.existing_party_migration_authorized !== false
      || pack.activation_policy.old_save_rematerialization_authorized !== false
      || pack.activation_policy.activation_request !== null
      || pack.database_mutated !== false
      || pack.runtime_capabilities_authorized.length !== 0)
    fail('FINAL_PACK_AUTHORITY_INVALID');
  return true;
}

export function validateNoDuplicateAuthority(claims) {
  if (!Array.isArray(claims)
      || new Set(claims.map(({ authority }) => authority)).size !== claims.length)
    fail('FINAL_PACK_DUPLICATE_AUTHORITY');
  return true;
}

function compileRows(input) {
  const rows = input.base.candidate.candidate_rows_by_table[CACHE_TABLE]
    .filter(({ record_kind: kind }) => kind !== 'approval_metadata')
    .map((row) => {
      const payload = structuredClone(row.payload);
      delete payload.source_candidate_status;
      if (row.record_kind === 'profile')
        payload.authoring_approval = 'approved_row_scoped';
      return compiled(row.record_id, row.record_kind,
        row.family_candidate_ref, payload, input.sourcePackDigest);
    });
  for (const domain of ['landscape', 'water', 'land_use', 'place']) {
    rows.push(compiled(`profile:regional-${domain}`, 'profile', null, {
      owner: 'regional_environment', domain,
      approval_scope: input.regionalExisting.approval_scope,
      approved_members: input.regional.promotions[domain].map((entry) => ({
        universal: structuredClone(entry.universal),
        regional: structuredClone(entry.regional),
        source_row_digests: structuredClone(entry.source_row_digests),
        context_guard: entry.context_guard,
        required_context_refs: [...entry.required_context_refs]
      }))
    }, input.sourcePackDigest));
  }
  rows.push(compiled('profile:regional-drying-workspace', 'profile',
    'novgorod_drying_storage_workspace_v3@1', {
      owner: 'regional_environment',
      approval_scope: input.drying.approval_scope,
      universal_row: { id: input.drying.universal_row.id,
        digest: input.drying.universal_row.digest, status: 'approved' },
      regional_row: { id: input.drying.regional_row.id,
        digest: input.drying.regional_row.digest, status: 'approved',
        is_allowed: true, generation_weight: 0 },
      applicability_guard: structuredClone(input.drying.applicability_guard),
      process_state_contract: structuredClone(input.drying.process_state_contract),
      forbidden_implications: [...input.drying.forbidden_implications]
    }, input.sourcePackDigest));
  rows.push(compiled('profile:onomastics-1230-1250', 'profile', null, {
    owner: 'onomastics', period: structuredClone(input.onomastics.period),
    approval_verdict: input.onomasticsApproval.verdict,
    names: structuredClone(input.onomastics.names),
    pools: structuredClone(input.onomastics.pools),
    selection_policy: structuredClone(input.onomastics.selection_policy)
  }, input.sourcePackDigest));
  rows.push(compiled('profile:actor-appearance-v6', 'profile', null, {
    owner: 'actor_appearance',
    supported_contexts: structuredClone(input.appearance.supported_contexts),
    row_count_by_table:
      structuredClone(input.appearance.candidate_row_count_by_table),
    rows_by_table: structuredClone(input.appearance.candidate_rows),
    authoring_attestation_digest:
      digestEnvelope(input.appearance.authoring_attestation)
  }, input.sourcePackDigest));
  for (const profile of [...input.equipment.social_clothing_profiles,
    ...input.equipment.occupation_equipment_profiles]) {
    rows.push(compiled(`profile:npc-equipment:${profile.profile_id}`,
      'profile', null, withoutDraftSourceStatus(profile),
      input.sourcePackDigest));
  }
  rows.push(compiled('approval:final-candidate', 'approval_metadata', null, {
    regional_counts: { ...input.regionalExisting.approved_counts, drying: 2 },
    onomastics_name_count: input.onomastics.names.length,
    appearance_row_count: input.appearance.authoring_attestation.row_count,
    npc_equipment_profile_count: input.equipmentApproval.profile_ids.length,
    item_container: {
      candidate_digest: input.itemManifest.candidate_digest,
      approval_request_digest: input.itemApproval.request_digest,
      approval_attestation_digest: input.itemPromotion.approval_attestation_digest,
      target_revision_id: input.itemPromotion.target_revision_id,
      target_catalog_digest: input.itemPromotion.target_catalog_digest,
      asserted_table_count: Object.keys(input.approvedV5).length,
      asserted_record_count: Object.values(input.approvedV5).reduce(
        (sum, tableRows) => sum + tableRows.length, 0)
    },
    authority_claims: [
      { authority: 'procedural_scene_rows', record_prefix: 'profile:novgorod_' },
      { authority: 'functional_mapping', record_prefix: 'mapping:' },
      { authority: 'regional_environment', record_prefix: 'profile:regional-' },
      { authority: 'onomastics', record_prefix: 'profile:onomastics-' },
      { authority: 'actor_appearance', record_prefix: 'profile:actor-appearance-' },
      { authority: 'npc_equipment', record_prefix: 'profile:npc-equipment:' },
      { authority: 'item_container_v5', role: 'exact_dependency_only' }
    ],
    activation_policy: {
      authorized: false,
      future_scope: 'new_development_parties_only',
      existing_party_migration: false,
      old_save_rematerialization: false
    }
  }, input.sourcePackDigest));
  return rows.sort((left, right) => left.record_id.localeCompare(right.record_id));
}

function compiled(recordId, recordKind, familyCandidateRef, payload,
  sourcePackDigest) {
  return { record_id: recordId, version: 1, record_kind: recordKind,
    family_candidate_ref: familyCandidateRef, payload,
    payload_digest: digestEnvelope(payload), source_pack_digest: sourcePackDigest,
    status: 'approved_authoring_not_runtime_selectable' };
}

function compileAssertExistingOperations(rowsByTable) {
  return registry.entries.filter((entry) =>
    entry.operation_domain === 'catalog_membership'
      && entry.table_name !== CACHE_TABLE).map((entry) => {
    const rows = rowsByTable[entry.table_name];
    if (!Array.isArray(rows)) fail('FINAL_PACK_V5_TABLE_MISSING');
    const records = rows.map((row) => {
      const projectedRow = Object.fromEntries(entry.canonical_columns.map(
        (column) => {
          let value = Object.hasOwn(row, column) ? row[column]
            : column === 'requires_regional_permission' ? false : null;
          if (entry.column_normalizers[column] === 'numeric_decimal'
              && typeof value === 'number') value = String(value);
          return [column, value];
        }));
      const canonicalPayload = projectCanonicalRecord({ registryEntry: entry,
        row: projectedRow });
      return { table_name: entry.table_name,
        operation_kind: 'assert_existing',
        record_key: canonicalStringify(canonicalPayload.record_key),
        canonical_payload: canonicalPayload,
        record_digest: computeCanonicalRecordDigest(canonicalPayload) };
    }).sort((left, right) => left.record_key.localeCompare(right.record_key))
      .map((record, ordinal) => ({ ...record, ordinal }));
    return { table_name: entry.table_name,
      dependency_order: entry.dependency_order, insert_count: 0,
      assert_existing_count: records.length, record_count: records.length,
      records_digest: computeTablePayloadDigest(records), records };
  });
}

async function buildApprovedV5Rows({ root, load, itemManifest, itemApproval,
  itemRequest, itemG4, itemInventory }) {
  const base =
    'data/knowledge-source/imports/item-container-120-v5/candidate';
  const rows = Object.fromEntries(await Promise.all(itemManifest.datasets.map(
    async (dataset) => [dataset.table,
      await load(`${base}/${dataset.path}`)])));
  const [readiness, compilation, coverage] = await Promise.all([
    load(`${base}/reports/EDITORIAL_READINESS_REPORT.json`),
    load(`${base}/reports/COMPILATION_REPORT.json`),
    load(`${base}/reports/G4_COVERAGE_REPORT.json`)
  ]);
  const mappings = itemG4.profile_mappings;
  const targetRevision = {
    id: 'world_revision_novgorod_1230_item_container_approved_001',
    title: 'Novgorod 1230 approved item/container catalogue',
    effective_from: '1230-01-01', effective_to: '1250-12-31'
  };
  const templateIds = [...rows.item_templates, ...rows.container_templates]
    .map(({ id }) => id);
  const plan = buildPr17Stage3CPromotionPlan({
    approval_request: itemRequest,
    approval_attestation: itemApproval,
    candidate_manifest: itemManifest,
    editorial_readiness_report: readiness,
    g4_coverage_report: coverage,
    compilation_report: compilation,
    template_ids: templateIds,
    legacy_inventory_snapshot: itemInventory,
    parent_revision: { id: 'novgorod_1230_research_revision_001',
      title: 'PR17 isolated approved parent revision', status: 'approved',
      catalog_digest: '0'.repeat(64) },
    target_revision: targetRevision,
    source_records_by_table: rows,
    approved_record_ids_by_table: Object.fromEntries(itemManifest.datasets
      .filter(({ table }) => table !== 'world_revisions')
      .map(({ table }) => [table, rows[table].map(({ id }) => id)])),
    external_records_by_table: { graph_nodes: mappings.map((mapping) => ({
      id: mapping.graph_node_id, node_type: mapping.node_type,
      scale_level: 'G4', region_id: 'region_novgorod_land',
      place_template_id: mapping.place_template_id,
      building_template_id: mapping.building_template_id ?? null,
      status: mapping.current_status
    })) },
    external_approved_ids: {
      regions: new Set(['region_novgorod_land']),
      region_social_roles: new Set(['nov_role_guard'])
    },
    mappings
  });
  if (plan.status !== 'ready') fail('FINAL_PACK_V5_PROMOTION_INVALID');
  return plan.records_by_table;
}

function validateSources(value) {
  if (value.stale.import_authorized !== false
      || value.stale.activation_authorized !== false)
    fail('FINAL_PACK_STALE_V1_ACTIVATABLE');
  if (value.regionalExisting.authoring_approved !== true
      || JSON.stringify(value.regionalExisting.approved_counts) !==
        JSON.stringify({ landscape: 33, water: 21, land_use: 24, place: 37 })
      || Object.entries(value.regionalExisting.approved_counts).some(
        ([domain, count]) => value.regional.promotions[domain]?.length !== count))
    fail('FINAL_PACK_REGIONAL_APPROVAL_INVALID');
  if (value.drying.authoring_approved !== true
      || value.drying.regional_enablement_approved !== true
      || value.drying.import_authorized !== false
      || value.drying.activation_authorized !== false)
    fail('FINAL_PACK_DRYING_APPROVAL_INVALID');
  if (value.onomasticsApproval.verdict !== 'APPROVE_AUTHORING_ONLY'
      || value.onomasticsApproval.compiled_name_count !== 54
      || value.onomastics.names.length !== 54
      || value.onomasticsApproval.import_enabled !== false
      || value.onomasticsApproval.activation_enabled !== false)
    fail('FINAL_PACK_ONOMASTICS_APPROVAL_INVALID');
  if (value.appearance.authoring_approved !== true
      || value.appearance.approval_status !== 'authoring_approved'
      || value.appearance.authoring_attestation.row_count !== 166
      || value.appearance.import_activation !== false)
    fail('FINAL_PACK_APPEARANCE_APPROVAL_INVALID');
  if (value.equipmentApproval.authoring_approved !== true
      || value.equipmentApproval.candidate_digest !==
        value.equipment.candidate_digest
      || value.equipmentApproval.profile_ids.length !== 3
      || value.equipmentApproval.authority.import_authorized !== false
      || value.equipmentApproval.authority.activation_authorized !== false)
    fail('FINAL_PACK_EQUIPMENT_APPROVAL_INVALID');
  if (value.itemApproval.decision !== 'approve_all_120'
      || value.itemApproval.candidate_digest !== value.itemManifest.candidate_digest
      || value.itemPromotion.activation_performed !== false)
    fail('FINAL_PACK_ITEM_APPROVAL_INVALID');
}

function validateClosureDigests({ sourceClosure, regional, regionalExisting,
  drying, onomasticsApproval, appearance, equipmentApproval }) {
  const digests = new Map(sourceClosure.map(({ owner, sha256: digest }) =>
    [owner, digest]));
  if (regionalExisting.candidate_digest !== regional.candidate_digest
      || drying.candidate_digest !== regional.candidate_digest
      || regionalExisting.approval_request_digest !==
        drying.approval_request_digest
      || regionalExisting.manifest_digest !== drying.manifest_digest
      || onomasticsApproval.candidate_sha256 !== digests.get('onomastics')
      || equipmentApproval.slot_authority.source_sha256 !==
        digests.get('appearance')
      || equipmentApproval.slot_authority.authoring_attestation_digest !==
        digestEnvelope(appearance.authoring_attestation))
    fail('FINAL_PACK_SOURCE_DIGEST_CLOSURE_INVALID');
}

function compatibility() {
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
  return buildBaseWorldCompatibilityManifest({
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
}

function withoutDraftSourceStatus(value) {
  if (Array.isArray(value)) return value.map(withoutDraftSourceStatus);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => key !== 'source_row_status'
      && key !== 'pending_entries')
    .map(([key, child]) => [key, withoutDraftSourceStatus(child)]));
}
function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}
function fail(code) { throw Object.assign(new Error(code), { code }); }

async function main(argv) {
  const root = resolve(argv.find((arg) => !arg.startsWith('--')) ?? '.');
  const pack = await generateProceduralFinalCandidatePack(root);
  const target = resolve(root, OUTPUT, 'candidate.json');
  const rendered = `${JSON.stringify(pack, null, 2)}\n`;
  if (argv.includes('--check')) {
    if (await readFile(target, 'utf8').catch(() => null) !== rendered)
      fail('FINAL_PACK_GENERATED_STALE');
  } else {
    await mkdir(resolve(root, OUTPUT), { recursive: true });
    await writeFile(target, rendered);
  }
  process.stdout.write(`${JSON.stringify({ pass: true,
    row_count: pack.candidate_rows_by_table[CACHE_TABLE].length,
    candidate_digest: pack.candidate_digest,
    target_catalog_digest: pack.target_catalog_digest }, null, 2)}\n`);
}

if (process.argv[1]
    && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  await main(process.argv.slice(2));
