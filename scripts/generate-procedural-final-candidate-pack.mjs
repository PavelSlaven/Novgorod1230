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
  itemPromotion: 'docs/implementation/item-container-120-approval-audit/evidence/STAGE3C_PROMOTION_RESULT.json'
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
    itemManifest, itemApproval, itemPromotion] = await Promise.all([
    generateProceduralAuthoringImportPack(root, overrides),
    load(PATHS.stale), load(PATHS.regional), load(PATHS.regionalExisting),
    load(PATHS.drying), load(PATHS.onomastics),
    load(PATHS.onomasticsApproval), load(PATHS.appearance),
    load(PATHS.equipment), load(PATHS.equipmentApproval),
    load(PATHS.itemManifest), load(PATHS.itemApproval),
    load(PATHS.itemPromotion)
  ]);
  validateSources({ base, stale, regional, regionalExisting, drying,
    onomastics, onomasticsApproval, appearance, equipment,
    equipmentApproval, itemManifest, itemApproval, itemPromotion });

  const sourceClosure = await Promise.all(Object.entries(PATHS)
    .filter(([key]) => key !== 'stale')
    .map(async ([owner, path]) => ({ owner, path,
      sha256: await rawDigest(path) })));
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
    sourcePackDigest });
  const registryEntry = registry.entries.find(({ table_name: table }) =>
    table === CACHE_TABLE);
  if (!registryEntry) fail('FINAL_PACK_CACHE_REGISTRY_MISSING');
  const records = rows.map((row, ordinal) => {
    const canonicalPayload = projectCanonicalRecord({ registryEntry, row });
    return { table_name: CACHE_TABLE, operation_kind: 'insert',
      record_key: canonicalStringify(canonicalPayload.record_key),
      canonical_payload: canonicalPayload,
      record_digest: computeCanonicalRecordDigest(canonicalPayload), ordinal };
  });
  const table = { table_name: CACHE_TABLE,
    dependency_order: registryEntry.dependency_order,
    insert_count: records.length, assert_existing_count: 0,
    record_count: records.length,
    records_digest: computeTablePayloadDigest(records), records };
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
    tables: [{ table_name: table.table_name,
      dependency_order: table.dependency_order,
      insert_count: table.insert_count, assert_existing_count: 0,
      record_count: table.record_count, records_digest: table.records_digest }],
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
    record_operations_by_table: [table],
    append_only_import_plan: {
      catalog_scope: 'item_container_materialization_v2',
      tables: [{ table_name: table.table_name,
        dependency_order: table.dependency_order,
        insert_count: table.insert_count, assert_existing_count: 0,
        record_count: table.record_count,
        payload_digest: table.records_digest }],
      records_source: 'record_operations_by_table[0].records',
      record_count: records.length,
      records_digest: table.records_digest,
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
    runtime_capabilities_authorized: []
  };
  const pack = { ...payload, candidate_digest: digestEnvelope(payload) };
  validateProceduralFinalCandidatePack(pack);
  return pack;
}

export function validateProceduralFinalCandidatePack(pack) {
  const { candidate_digest: claimed, ...payload } = pack ?? {};
  if (claimed !== digestEnvelope(payload)) fail('FINAL_PACK_DIGEST_MISMATCH');
  if (pack.status !== 'sealed_candidate_not_imported'
      || pack.subject_commit_sha !== SUBJECT_COMMIT
      || pack.supersedes.accepted_as_source !== false
      || pack.supersedes.import_authorized !== false
      || pack.supersedes.activation_authorized !== false)
    fail('FINAL_PACK_STALE_OR_STATUS_INVALID');
  const rows = pack.candidate_rows_by_table?.[CACHE_TABLE];
  const records = pack.record_operations_by_table?.[0]?.records;
  if (!Array.isArray(rows) || rows.length !== 21
      || !Array.isArray(records) || records.length !== rows.length
      || pack.record_operations_by_table.length !== 1
      || pack.record_operations_by_table[0].table_name !== CACHE_TABLE
      || pack.record_operations_by_table[0].insert_count !== rows.length
      || pack.record_operations_by_table[0].assert_existing_count !== 0
      || pack.record_operations_by_table[0].records_digest !==
        computeTablePayloadDigest(records))
    fail('FINAL_PACK_MEMBERSHIP_INVALID');
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
        universal_id: entry.universal.id,
        regional_id: entry.regional.id,
        universal_digest: entry.source_row_digests.universal,
        regional_digest: entry.source_row_digests.regional,
        context_guard: entry.context_guard,
        universal_status: entry.universal.status,
        regional_status: entry.regional.status
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
      target_catalog_digest: input.itemPromotion.target_catalog_digest
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
