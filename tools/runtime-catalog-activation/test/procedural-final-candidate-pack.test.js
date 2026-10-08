import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { digestEnvelope } from '../src/artifact-contracts.js';
import { computeCanonicalRecordDigest } from
  '../../../packages/runtime-catalog/src/canonical-records.js';
import { computeTablePayloadDigest } from
  '../../../packages/runtime-catalog/src/ledger-digests.js';
import { buildProceduralFinalCandidateImportLedger } from
  '../src/procedural-v6-import.js';
import {
  generateProceduralFinalCandidatePack,
  validateNoDuplicateAuthority,
  validateProceduralFinalCandidatePack
} from '../../../scripts/generate-procedural-final-candidate-pack.mjs';

const root = new URL('../../../', import.meta.url).pathname.replace(/^\/(.:)/u,
  '$1');
const output = new URL(
  '../../../data/world-catalogs/novgorod/procedural-scene-v2/final-candidate-pack-v1/candidate.json',
  import.meta.url);
const paths = {
  stale: 'data/world-catalogs/novgorod/procedural-scene-v2/import-pack-v1/candidate.json',
  regional: 'data/world-catalogs/novgorod/regional-environment/candidates/novgorod-1230-1250-v1/candidate.json',
  onomastics: 'data/world-catalogs/novgorod/onomastics/candidates/novgorod-1230-1250-v1/candidate.json',
  equipment: 'data/world-catalogs/novgorod/procedural-scene-v2/npc-equipment-v1/candidate.json'
};

test('final candidate pack is deterministic, exact and non-activating',
  async () => {
    const first = await generateProceduralFinalCandidatePack(root);
    const second = await generateProceduralFinalCandidatePack(root);
    assert.deepEqual(first, second);
    assert.equal(await readFile(output, 'utf8'),
      `${JSON.stringify(first, null, 2)}\n`);
    assert.equal(validateProceduralFinalCandidatePack(first), true);
    const rows = first.candidate_rows_by_table
      .procedural_scene_compiled_records;
    assert.equal(rows.length, 21);
    assert.equal(first.record_operations_by_table.length, 40);
    assert.equal(first.record_operations_by_table.find(({ table_name: table }) =>
      table === 'procedural_scene_compiled_records').insert_count, 21);
    assert.equal(first.record_operations_by_table.filter(({ table_name: table }) =>
      table !== 'procedural_scene_compiled_records').every((operation) =>
      operation.insert_count === 0
        && operation.assert_existing_count === operation.record_count), true);
    assert.equal(first.append_only_import_plan.import_authorized, false);
    assert.equal(first.activation_policy.activation_authorized, false);
    assert.equal(first.activation_policy
      .eligible_party_scope_after_separate_approval,
    'new_development_parties_only');
    assert.equal(first.activation_policy.existing_party_migration_authorized,
      false);
    assert.equal(first.activation_policy.old_save_rematerialization_authorized,
      false);
    assert.equal(first.independent_attestation.attestation_digest,
      '0204d109cbe18d06aed0957be3c10d12a088e15368cc0e7eb865b1382538ef7c');
    assert.equal(first.independent_attestation.candidate_digest,
      '12a160383a5aba4dfbda9aa5f6ef64273d712944322d9fb44f3a1eb1d45d5d67');
    assert.doesNotMatch(JSON.stringify(rows),
      /"(?:status|source_status|source_row_status)":"(?:pending|rejected|draft)/u);
  });

test('regional compiler preserves full approved owner semantics', async () => {
  const [pack, source] = await Promise.all([
    generateProceduralFinalCandidatePack(root), json(paths.regional)
  ]);
  const rows = pack.candidate_rows_by_table.procedural_scene_compiled_records;
  for (const [domain, id] of [
    ['landscape', 'lt_low_alluvial_riverbank'],
    ['water', 'wb_small_river'],
    ['land_use', 'lu_inland_capture_fishing'],
    ['place', 'pt_fishing_station']
  ]) {
    const compiled = rows.find(({ record_id: recordId }) =>
      recordId === `profile:regional-${domain}`).payload.approved_members
      .find(({ universal }) => universal.id === id);
    const expected = source.promotions[domain].find(({ universal }) =>
      universal.id === id);
    assert.deepEqual(compiled.universal, expected.universal);
    assert.deepEqual(compiled.regional, expected.regional);
    assert.deepEqual(compiled.source_row_digests,
      expected.source_row_digests);
  }
  const bank = rows.find(({ record_id: recordId }) =>
    recordId === 'profile:regional-landscape').payload.approved_members
    .find(({ universal }) => universal.id === 'lt_low_alluvial_riverbank')
    .universal;
  for (const field of ['base_environment', 'dominant_vegetation',
    'moisture_level', 'relief_type', 'soil_ground_type'])
    assert.equal(bank[field], source.promotions.landscape.find(
      ({ universal }) => universal.id === 'lt_low_alluvial_riverbank')
      .universal[field]);
});

test('independent attestation payload is exact and tamper-evident', async () => {
  const pack = structuredClone(await generateProceduralFinalCandidatePack(root));
  pack.independent_attestation.record_binding.total_record_count += 1;
  const { candidate_digest: ignored, ...payload } = pack;
  pack.candidate_digest = digestEnvelope(payload);
  assert.throws(() => validateProceduralFinalCandidatePack(pack),
    { code: 'FINAL_PACK_INDEPENDENT_ATTESTATION_INVALID' });
});

test('approved disposable ledger binds all 3269 records without activation',
  async () => {
    const pack = await generateProceduralFinalCandidatePack(root);
    const ledger = buildProceduralFinalCandidateImportLedger({ pack,
      baseline: {
        request: { parent_revision_id: 'disposable-baseline',
          parent_catalog_digest: '1'.repeat(64),
          parent_snapshot_manifest_digest: '2'.repeat(64) },
        compatibilityManifest: pack.compatibility_manifest
      } });
    assert.equal(ledger.records.length, 3269);
    assert.equal(ledger.tables.length, 40);
    assert.equal(ledger.root.approval_attestation_digest,
      '0204d109cbe18d06aed0957be3c10d12a088e15368cc0e7eb865b1382538ef7c');
    assert.equal(ledger.dependency_assertions.length, 0);
  });

test('ledger build rejects cache tamper even after record and table reseal',
  async () => {
    const pack = structuredClone(await generateProceduralFinalCandidatePack(root));
    const row = pack.candidate_rows_by_table.procedural_scene_compiled_records
      .find(({ record_kind: kind }) => kind === 'profile');
    row.payload.family = 'tampered-family';
    row.payload_digest = digestEnvelope(row.payload);
    const operation = pack.record_operations_by_table.find(
      ({ table_name: table }) => table ===
        'procedural_scene_compiled_records');
    const record = operation.records.find(({ canonical_payload: canonical }) =>
      canonical.canonical_fields.record_id === row.record_id);
    record.canonical_payload.canonical_fields.payload = structuredClone(row.payload);
    record.canonical_payload.canonical_fields.payload_digest = row.payload_digest;
    record.record_digest = computeCanonicalRecordDigest(record.canonical_payload);
    operation.records_digest = computeTablePayloadDigest(operation.records);
    pack.append_only_import_plan.tables.find(({ table_name: table }) =>
      table === operation.table_name).payload_digest = operation.records_digest;
    pack.append_only_import_plan.records_digest = digestEnvelope(
      pack.record_operations_by_table.map((item) => ({
        table_name: item.table_name, records_digest: item.records_digest
      })));
    const { candidate_digest: ignored, ...payload } = pack;
    pack.candidate_digest = digestEnvelope(payload);
    assert.throws(() => buildProceduralFinalCandidateImportLedger({ pack,
      baseline: { request: { parent_revision_id: 'baseline',
        parent_catalog_digest: '1'.repeat(64),
        parent_snapshot_manifest_digest: '2'.repeat(64) },
      compatibilityManifest: pack.compatibility_manifest } }),
    { code: 'PROCEDURAL_FINAL_PACK_AUDITED_SUBJECT_MISMATCH' });
  });

test('tracked disposable readback is sanitized and development-scoped', async () => {
  const result = await json(
    'data/world-catalogs/novgorod/procedural-scene-v2/final-candidate-pack-v1/disposable-import-result.json');
  assert.equal(result.status, 'PASS');
  assert.equal(result.v5_prerequisite.asserted_table_count, 39);
  assert.equal(result.v5_prerequisite.asserted_record_count, 3248);
  assert.equal(result.final_import.ledger_record_count, 3269);
  assert.equal(result.final_import.compiled_record_count, 21);
  assert.equal(result.final_import.activation_event_count, 0);
  assert.equal(result.final_import.rollback_probe, 'pass');
  assert.deepEqual(result.cleanup, { database_stopped: true,
    temporary_cluster_removed: true });
  assert.equal(result.credentials_persisted, false);
  assert.equal(result.production_mutated, false);
  assert.equal(result.development_runtime_activation_performed, true);
  assert.equal(result.production_runtime_activation_performed, false);
  assert.equal(result.development_activation.activation_scope,
    'new_development_parties_only');
  assert.equal(result.development_activation.old_party_revision_id,
    'runtime_catalog_lower_dvina_spatial_v3_v12_001');
  assert.equal(result.development_activation.new_party_revision_id,
    'procedural_scene_final_candidate_v1_001');
  assert.equal(result.development_activation.existing_party_rows_updated, 0);
  assert.equal(result.development_activation.verified_compiled_profile_count, 13);
  assert.equal(result.development_activation.verified_compiled_mapping_count, 7);
  assert.doesNotMatch(JSON.stringify(result),
    /postgresql:\/\/|local_only|password|connection_string/u);
});

test('all V5 owner references resolve through exact assert-existing closure',
  async () => {
    const pack = await generateProceduralFinalCandidatePack(root);
    const operations = new Map(pack.record_operations_by_table.map((operation) =>
      [operation.table_name, operation]));
    const metadata = pack.candidate_rows_by_table
      .procedural_scene_compiled_records.find(({ record_id: id }) =>
        id === 'approval:final-candidate').payload;
    assert.equal(operations.size, 40);
    assert.equal(metadata.item_container.asserted_table_count, 39);
    assert.equal(metadata.item_container.asserted_record_count,
      [...operations].filter(([table]) => table !==
        'procedural_scene_compiled_records').reduce((sum, [, operation]) =>
        sum + operation.record_count, 0));
    for (const table of ['item_templates', 'container_templates',
      'item_profile_sets', 'item_profile_entries',
      'item_template_quantity_profiles', 'item_template_inventory_profiles',
      'container_template_inventory_profiles',
      'container_content_category_relations',
      'g4_item_materialization_rules', 'g4_container_materialization_rules']) {
      assert.ok(operations.get(table)?.record_count > 0, table);
      assert.ok(operations.get(table).records.every(({ operation_kind: kind }) =>
        kind === 'assert_existing'), table);
    }
  });

test('stale v1 cannot be promoted through final candidate generator',
  async () => {
    const stale = await json(paths.stale);
    stale.activation_authorized = true;
    await assert.rejects(() => generateProceduralFinalCandidatePack(root, {
      [paths.stale]: stale
    }), { code: 'FINAL_PACK_STALE_V1_ACTIVATABLE' });
  });

test('source closure rejects missing approved regional member', async () => {
  const regional = await json(paths.regional);
  regional.promotions.landscape.pop();
  await assert.rejects(() => generateProceduralFinalCandidatePack(root, {
    [paths.regional]: regional
  }), { code: 'FINAL_PACK_REGIONAL_APPROVAL_INVALID' });
});

test('pending or rejected compiled owner rows are forbidden', async () => {
  const onomastics = await json(paths.onomastics);
  onomastics.names[0].status = 'pending';
  await assert.rejects(() => generateProceduralFinalCandidatePack(root, {
    [paths.onomastics]: onomastics
  }), (error) => ['FINAL_PACK_SOURCE_DIGEST_CLOSURE_INVALID',
    'FINAL_PACK_UNAPPROVED_ROW'].includes(error.code));
});

test('duplicate cache row identities are forbidden', async () => {
  const equipment = await json(paths.equipment);
  equipment.occupation_equipment_profiles[1] = structuredClone(
    equipment.occupation_equipment_profiles[0]);
  await assert.rejects(() => generateProceduralFinalCandidatePack(root, {
    [paths.equipment]: equipment
  }), (error) => ['FINAL_PACK_INDEPENDENT_ATTESTATION_INVALID',
    'FINAL_PACK_ROW_INVALID'].includes(error.code));
});

test('duplicate authority ownership is forbidden', () => {
  assert.throws(() => validateNoDuplicateAuthority([
    { authority: 'onomastics' }, { authority: 'onomastics' }
  ]), { code: 'FINAL_PACK_DUPLICATE_AUTHORITY' });
});

test('activation cannot be enabled by changing candidate flag', async () => {
  const pack = structuredClone(await generateProceduralFinalCandidatePack(root));
  pack.activation_policy.activation_authorized = true;
  const { candidate_digest: ignored, ...payload } = pack;
  pack.candidate_digest = digestEnvelope(payload);
  assert.throws(() => validateProceduralFinalCandidatePack(pack),
    (error) => ['FINAL_PACK_INDEPENDENT_ATTESTATION_INVALID',
      'FINAL_PACK_AUTHORITY_INVALID'].includes(error.code));
});

async function json(path) {
  return JSON.parse(await readFile(new URL(`../../../${path}`, import.meta.url),
    'utf8'));
}
