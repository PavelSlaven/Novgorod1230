import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  generateProceduralAuthoringImportPack,
  validateProceduralAuthoringImportPack
} from '../../../scripts/generate-procedural-authoring-import-pack.mjs';
import { importProceduralAuthoringPack } from
  '../src/procedural-v6-import.js';

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
    assert.equal(first.candidate.candidate_rows_by_table
      .procedural_scene_remaining_gaps.length, 5);
  });

test('combined pack preserves exact upstream row and mapping bytes', async () => {
  const pack = await generateProceduralAuthoringImportPack(root);
  const [overlay, mappings] = await Promise.all([
    json(new URL('../../../data/world-catalogs/novgorod/procedural-scene-v2/authoring-overlay.json',
      import.meta.url)),
    json(new URL('../../../data/world-catalogs/novgorod/procedural-scene-v2/functional-mapping-v1/candidate.json',
      import.meta.url))
  ]);
  const rows = pack.candidate.candidate_rows_by_table;
  assert.deepEqual(rows.procedural_scene_authoring_candidates,
    overlay.candidates);
  assert.deepEqual(rows.procedural_scene_functional_mappings,
    mappings.mappings);
  assert.deepEqual(rows.procedural_scene_conditional_context,
    mappings.conditional_context);
  assert.deepEqual(rows.procedural_scene_remaining_gaps,
    mappings.remaining_gaps);
  assert.ok(rows.procedural_scene_authoring_candidates.every((row) =>
    row.forbidden_implications.length > 0));
  assert.deepEqual(rows.procedural_scene_authoring_candidates.find(
    ({ family }) => family === 'natural_shore').materialization_limits,
  ['no_local_willow', 'no_local_tree', 'no_local_stand', 'no_local_stock',
    'no_local_entity', 'no_outcome']);
});

for (const scenario of [
  ['dropped gap', (pack) => pack.candidate.candidate_rows_by_table
    .procedural_scene_remaining_gaps.pop()],
  ['altered materialization limit', (pack) => pack.candidate
    .candidate_rows_by_table.procedural_scene_authoring_candidates[0]
    .materialization_limits.pop()],
  ['altered row status', (pack) => { pack.candidate
    .candidate_rows_by_table.procedural_scene_authoring_candidates[0].status =
      'approved'; }],
  ['compatible tuple drift', (pack) => { pack.candidate
    .compatible_world_tuple.compatible_world_revision_id = 'drift'; }],
  ['activation event', (pack) => { pack.candidate.activation_event_count = 1; }],
  ['runtime row', (pack) => { pack.candidate.runtime_instance = { id: 'bad' }; }],
  ['duplicate id', (pack) => pack.candidate.candidate_rows_by_table
    .procedural_scene_functional_mappings.push(structuredClone(pack.candidate
      .candidate_rows_by_table.procedural_scene_functional_mappings[0]))],
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
  pack.candidate.candidate_rows_by_table.procedural_scene_remaining_gaps.pop();
  await assert.rejects(() => importProceduralAuthoringPack({
    pool: { query() { assert.fail('database must not be touched'); } },
    baseline: {}, pack, approvalAttestation: {},
    runtimeContractDigest: 'a'.repeat(64)
  }), { code: 'PROCEDURAL_AUTHORING_IMPORT_DIGEST_MISMATCH' });
});

async function json(url) {
  return JSON.parse(await readFile(url, 'utf8'));
}
