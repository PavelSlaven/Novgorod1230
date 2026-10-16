import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  generateProceduralAuthoringImportPack,
  validateProceduralAuthoringImportPack
} from '../../../scripts/generate-procedural-authoring-import-pack.mjs';
import { importProceduralAuthoringPack } from
  '../src/procedural-v6-import.js';
import { buildProceduralAuthoringImportLedger } from
  '../src/procedural-v6-import.js';
import { digestEnvelope } from '../src/artifact-contracts.js';

const root = new URL('../../../', import.meta.url).pathname.replace(/^\/(.:)/u,
  '$1');
const output = new URL(
  '../../../data/world-catalogs/novgorod/procedural-scene-v2/import-pack-v1/',
  import.meta.url);

test('combined authoring import pack is byte-stable and fully bounded',
  async () => {
    const first = await generateProceduralAuthoringImportPack(root);
    const second = await generateProceduralAuthoringImportPack(root);
    assert.equal(JSON.stringify(first), JSON.stringify(second));
    for (const [file, value] of [['candidate.json', first.candidate],
      ['promotion-manifest.json', first.promotionManifest],
      ['approval-request.json', first.approvalRequest],
      ['import-ledger.json', first.importLedger]]) {
      assert.equal(await readFile(new URL(file, output), 'utf8'),
        `${JSON.stringify(value, null, 2)}\n`);
    }
    assert.equal(validateProceduralAuthoringImportPack(first), true);
    assert.equal(first.candidate.subject_commit_sha,
      'b4e3bc488ae75d724cec541641121fbeaa4be5ad');
    assert.equal(first.candidate.upstream.overlay_digest,
      '52702c0010adc3e3235fd6a6417a10b28f7627d428e65f9dd48e74c3fb19cda3');
    assert.deepEqual(first.candidate.runtime_capabilities_authorized, []);
    assert.equal(first.candidate.activation_event_count, 0);
    assert.equal(first.approvalRequest.decision_requested,
      'approve_disposable_local_authoring_import');
    assert.equal(first.approvalRequest.scope,
      'disposable_local_pr_candidate_database');
    assert.equal(first.importLedger.approval_attestation_digest, null);
    assert.equal(metadata(first).remaining_gaps.length, 5);
    assert.equal(compiled(first).length, 11);
    assert.equal(first.candidate.record_operations_by_table[0].insert_count, 11);
  });

test('combined pack persists normalized profiles, mappings and exact limits', async () => {
  const pack = await generateProceduralAuthoringImportPack(root);
  const [overlay, mappings] = await Promise.all([
    json(new URL('../../../data/world-catalogs/novgorod/procedural-scene-v2/authoring-overlay.json',
      import.meta.url)),
    json(new URL('../../../data/world-catalogs/novgorod/procedural-scene-v2/functional-mapping-v1/candidate.json',
      import.meta.url))
  ]);
  const rows = compiled(pack);
  const profiles = rows.filter(({ record_kind: kind }) => kind === 'profile');
  const compiledMappings = rows.filter(({ record_kind: kind }) =>
    kind === 'mapping');
  assert.deepEqual(profiles.map(({ payload }) => payload.family).sort(),
    overlay.candidates.map(({ family }) => family).sort());
  assert.deepEqual(compiledMappings.map(({ payload }) => payload.mapping_id),
    mappings.mappings.map(({ mapping_id: id }) => id).sort());
  assert.ok(compiledMappings.every(({ payload }) => !payload.evidence
    && payload.evidence_digest));
  assert.doesNotMatch(JSON.stringify(rows),
    /source_locator|review_ref|source_claim_object|evidence_claims/u);
  assert.deepEqual(metadata(pack).remaining_gaps, mappings.remaining_gaps);
  assert.ok(profiles.every(({ payload }) =>
    payload.forbidden_implications.length > 0));
  assert.deepEqual(profiles.find(({ payload }) =>
    payload.family === 'natural_shore').payload.materialization_limits,
  ['no_local_willow', 'no_local_tree', 'no_local_stand', 'no_local_stock',
    'no_local_entity', 'no_outcome']);
});

test('world-base owns one append-only compiled-record cache', async () => {
  const [canonical, migration] = await Promise.all([
    readFile(new URL('../../../infra/world-base/schema/21.sql', import.meta.url),
      'utf8'),
    readFile(new URL('../migrations/world/001_runtime_catalog_activation.sql',
      import.meta.url), 'utf8')
  ]);
  assert.match(canonical,
    /CREATE TABLE IF NOT EXISTS world_base\.procedural_scene_compiled_records/u);
  assert.match(migration,
    /procedural_scene_compiled_records_append_only/u);
  assert.match(migration,
    /BEFORE UPDATE OR DELETE ON world_base\.procedural_scene_compiled_records/u);
  assert.match(migration,
    /world_base\.procedural_scene_compiled_records[\s\S]*TO runtime_catalog_importer/u);
});

for (const scenario of [
  ['dropped gap', (pack) => metadata(pack).remaining_gaps.pop()],
  ['altered materialization limit', (pack) => metadata(pack)
    .profile_limits['novgorod_natural_shore_v3@1']
    .materialization_limits.pop()],
  ['altered row status', (pack) => { compiled(pack)[0].status = 'approved'; }],
  ['compatible tuple drift', (pack) => { pack.candidate
    .compatible_world_tuple.compatible_world_revision_id = 'drift'; }],
  ['activation event', (pack) => { pack.candidate.activation_event_count = 1; }],
  ['runtime row', (pack) => { pack.candidate.runtime_instance = { id: 'bad' }; }],
  ['duplicate id', (pack) => compiled(pack).push(
    structuredClone(compiled(pack)[0]))],
  ['unknown id table', (pack) => { pack.candidate.candidate_rows_by_table
    .unknown_rows = [{ id: 'bad' }]; }]
]) test(`combined pack rejects ${scenario[0]}`, async () => {
  const pack = structuredClone(await generateProceduralAuthoringImportPack(root));
  scenario[1](pack);
  assert.throws(() => validateProceduralAuthoringImportPack(pack));
});

test('safe wrapper refuses missing independent import approval before DB use',
  async () => {
    const pack = await generateProceduralAuthoringImportPack(root);
    await assert.rejects(() => importProceduralAuthoringPack({
      pool: { query() { assert.fail('database must not be touched'); } },
      baseline: {}, pack,
      approvalAttestation: null,
      runtimeContractDigest: 'a'.repeat(64)
    }), { code: 'ATTESTATION_MISMATCH' });
  });

test('safe wrapper rejects altered pack before DB use', async () => {
  const pack = structuredClone(await generateProceduralAuthoringImportPack(root));
  metadata(pack).remaining_gaps.pop();
  await assert.rejects(() => importProceduralAuthoringPack({
    pool: { query() { assert.fail('database must not be touched'); } },
    baseline: {}, pack, approvalAttestation: {},
    runtimeContractDigest: 'a'.repeat(64)
  }), { code: 'PROCEDURAL_AUTHORING_IMPORT_DIGEST_MISMATCH' });
});

test('post-attestation generic ledger is deterministic and keeps membership',
  async () => {
    const pack = await generateProceduralAuthoringImportPack(root);
    const attestation = seal({
      schema: 'rus.procedural_authoring_import_approval_attestation.v1',
      approval_request_digest: pack.approvalRequest.approval_request_digest,
      decision: 'approve_disposable_local_authoring_import',
      scope: 'disposable_local_pr_candidate_database',
      candidate_digest: pack.candidate.candidate_digest,
      promotion_manifest_digest:
        pack.promotionManifest.promotion_manifest_digest,
      target_revision_id: pack.candidate.target_revision_id,
      target_catalog_digest: pack.candidate.target_catalog_digest,
      activation_authorized: false,
      attested_by: 'independent fixture'
    });
    const baseline = {
      request: {
        parent_revision_id: 'baseline',
        parent_catalog_digest: '1'.repeat(64),
        parent_snapshot_manifest_digest: '2'.repeat(64),
        compatible_world_pin_manifest_digest:
          pack.candidate.compatible_world_tuple
            .compatible_world_pin_manifest_digest
      },
      compatibilityManifest: pack.candidate.compatibility_manifest
    };
    const first = buildProceduralAuthoringImportLedger({ baseline, pack,
      approvalAttestation: attestation });
    const second = buildProceduralAuthoringImportLedger({ baseline, pack,
      approvalAttestation: attestation });
    assert.deepEqual(first, second);
    assert.equal(first.tables[0].record_count, 11);
    assert.equal(first.records.length, 11);
    assert.equal(first.root.approval_attestation_digest,
      attestation.attestation_digest);
  });

async function json(url) {
  return JSON.parse(await readFile(url, 'utf8'));
}
function compiled(pack) {
  return pack.candidate.candidate_rows_by_table
    .procedural_scene_compiled_records;
}
function metadata(pack) {
  return compiled(pack).find(({ record_kind: kind }) =>
    kind === 'approval_metadata').payload;
}
function seal(payload) {
  return { ...payload, attestation_digest: digestEnvelope(payload) };
}
