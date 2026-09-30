import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  IDENTITY_ATTESTATION_SCHEMA,
  assertIdentityAttestation,
  assertIdentityInputs,
  buildIdentityImportSql,
  buildIdentityRequest,
  buildIdentityRows,
  computeIdentityRequestDigest,
  IDENTITY_REVIEW_PATH,
  readIdentityRequest,
  renderIdentityReviewRequest,
  runIdentityImportStage,
} from './v17-npc-identity-stage.mjs';

const root = new URL('..', import.meta.url).pathname;
const rowsOf = (tables, name) => tables.find(({ table }) => table === name).rows;

test('the committed request equals a rebuild from the reviewed sources', async () => {
  const request = await readIdentityRequest(root);
  assert.equal(request.request_digest, computeIdentityRequestDigest(request));
  assert.deepEqual(await buildIdentityRequest({ root }), request);
  assert.equal(await readFile(`${root}${IDENTITY_REVIEW_PATH}`, 'utf8'), renderIdentityReviewRequest(request));
  await assertIdentityInputs({ root, request });
});

test('approval is per (pool, people): only ordinary Novgorod entries become approved, foreign ordinary stay draft', async () => {
  const tables = await buildIdentityRows({ root });
  const entries = rowsOf(tables, 'region_name_pool_entries');
  assert.ok(entries.length > 300);
  for (const row of entries) {
    assert.equal(row.status, row.selection_class === 'ordinary' && row.people_ref === 'pp_novgorod_rus' ? 'approved' : 'draft', row.id);
    assert.ok(['female', 'male'].includes(row.sex_category));
  }
  const pools = rowsOf(tables, 'region_name_pools');
  assert.equal(pools.length, 7, 'one pool per people (D51)');
  assert.deepEqual(pools.filter((row) => row.status === 'approved').map((row) => row.id), ['novgorod_1230_1250_personal_names_v1']);
  assert.ok(entries.every((row) => pools.some((pool) => pool.id === row.name_pool_id)));
  assert.equal(new Set(entries.map((row) => row.name_pool_id)).size, 7, 'entries of all seven pools are imported');
  assert.ok(entries.filter((row) => row.name_pool_id !== 'novgorod_1230_1250_personal_names_v1').every((row) => row.status === 'draft'));
  assert.equal(entries.filter((row) => row.status === 'approved').length, 266);
  assert.equal(entries.filter((row) => row.status === 'draft').length, entries.length - 266);
  assert.ok(entries.some((row) => row.selection_class === 'ordinary' && row.people_ref === 'pp_fg002' && row.status === 'draft'));
  const novgorodFemale = entries.filter((row) => row.status === 'approved'
    && row.people_ref === 'pp_novgorod_rus' && row.sex_category === 'female');
  assert.ok(novgorodFemale.length >= 10 && novgorodFemale.every((row) => row.selection_class === 'ordinary'));
  assert.deepEqual(rowsOf(tables, 'npc_regional_context_name_bindings').map((row) => row.regional_context_id),
    ['m2c_npc_regional_novgorod_land_v1', 'm2c_npc_regional_novgorod_canonical_initial_v1', 'm2c_npc_regional_novgorod_land_d2_v1']);
  const scales = rowsOf(tables, 'npc_psychology_scale_entries');
  assert.equal(scales.filter((row) => row.scale_kind === 'trait').length, 6);
  assert.equal(scales.filter((row) => row.scale_kind === 'value').length, 7);
  const items = rowsOf(tables, 'occupation_character_items');
  for (const occupation of ['nov_occ_fisher', 'nov_occ_boatman', 'nov_occ_local_trader']) {
    assert.ok(items.filter((row) => row.occupation_id === occupation && row.item_kind === 'goal').length >= 1);
    assert.ok(items.filter((row) => row.occupation_id === occupation && row.item_kind === 'fear').length >= 1);
  }
});

test('every row of the three new tables carries the provenance of its source', async () => {
  const tables = await buildIdentityRows({ root });
  for (const row of rowsOf(tables, 'npc_regional_context_name_bindings')) {
    assert.equal(row.provenance_ref, `npc-identity-v17/v1/context-bindings.json#${row.regional_context_id}`);
  }
  for (const row of rowsOf(tables, 'npc_psychology_scale_entries')) {
    assert.equal(row.provenance_ref, `game-base:households-psychology-speech/npc_psychology/psychology_scales.json#${row.entry_id}`);
  }
  const items = rowsOf(tables, 'occupation_character_items');
  assert.ok(items.length > 0);
  for (const row of items) assert.match(row.provenance_ref, /\S/u);
  assert.ok(items.every((row) => row.provenance_ref.includes('/')), 'source_refs are file paths');
});

test('the SQL is one transaction with an in-transaction readback and equal commit/rollback bodies', async () => {
  const sql = buildIdentityImportSql(await buildIdentityRows({ root }));
  assert.match(sql.commit, /^BEGIN;\n/u);
  assert.match(sql.commit, /COMMIT;\n$/u);
  assert.match(sql.rollback, /ROLLBACK;\n$/u);
  assert.equal(sql.commit.slice(0, -'COMMIT;\n'.length), sql.rollback.slice(0, -'ROLLBACK;\n'.length));
  assert.equal((sql.commit.match(/V17_NPC_IDENTITY_READBACK_MISMATCH/gu) ?? []).length, 5);
});

test('tampered pins are rejected', async () => {
  const request = await readIdentityRequest(root);
  const redigest = (value) => ({ ...value, request_digest: computeIdentityRequestDigest(value) });
  const bad = structuredClone(request);
  bad.approved_data.sources[0].sha256 = 'f'.repeat(64);
  await assert.rejects(assertIdentityInputs({ root, request: bad }), /V17_NPC_IDENTITY_REQUEST_DIGEST_MISMATCH/u);
  await assert.rejects(assertIdentityInputs({ root, request: redigest(bad) }), /V17_NPC_IDENTITY_PIN_MISMATCH:/u);
  const badSql = structuredClone(request);
  badSql.sql.commit_sha256 = '1'.repeat(64);
  await assert.rejects(assertIdentityInputs({ root, request: redigest(badSql) }), /V17_NPC_IDENTITY_SQL_MISMATCH:commit/u);
  const badRows = structuredClone(request);
  badRows.expected_readback.by_table.region_name_pool_entries += 1;
  await assert.rejects(assertIdentityInputs({ root, request: redigest(badRows) }), /V17_NPC_IDENTITY_PIN_MISMATCH:rows:region_name_pool_entries/u);
});

test('only an approving attestation of this exact request is accepted', async () => {
  const request = await readIdentityRequest(root);
  const good = { schema: IDENTITY_ATTESTATION_SCHEMA, verdict: 'APPROVE', request_digest: request.request_digest,
    attested_by: 'reviewer', independence_basis: 'independent read-only review of the request digest' };
  assert.equal(assertIdentityAttestation(request, good), good);
  for (const [patch, code] of [
    [{ schema: 'other' }, 'V17_NPC_IDENTITY_ATTESTATION_SCHEMA_MISMATCH'],
    [{ verdict: 'REJECT' }, 'V17_NPC_IDENTITY_ATTESTATION_VERDICT_REJECTED'],
    [{ request_digest: '2'.repeat(64) }, 'V17_NPC_IDENTITY_ATTESTATION_DIGEST_MISMATCH'],
    [{ attested_by: undefined }, 'V17_NPC_IDENTITY_ATTESTATION_INDEPENDENCE_REQUIRED'],
    [{ independence_basis: '' }, 'V17_NPC_IDENTITY_ATTESTATION_INDEPENDENCE_REQUIRED'],
  ]) assert.throws(() => assertIdentityAttestation(request, { ...good, ...patch }), new RegExp(code, 'u'));
  assert.throws(() => assertIdentityAttestation(request, null), /V17_NPC_IDENTITY_ATTESTATION_REQUIRED/u);
});

// A fake world that records the SQL it receives and answers table counts.
function fakeWorld(request, { extraRows = {} } = {}) {
  const log = [];
  let committed = false;
  return { log, async query(sql) {
    if (sql.startsWith('SELECT count(*) FROM world_base.')) {
      const table = sql.slice('SELECT count(*) FROM world_base.'.length);
      return { rows: [{ count: 7 + (committed ? request.expected_readback.by_table[table] + (extraRows[table] ?? 0) : 0) }] };
    }
    const kind = sql.endsWith('COMMIT;\n') ? 'COMMIT' : sql.endsWith('ROLLBACK;\n') ? 'ROLLBACK' : 'OTHER';
    log.push(kind);
    if (kind === 'COMMIT') committed = true;
    return { rows: [] };
  } };
}
const approving = (request) => async () => ({ schema: IDENTITY_ATTESTATION_SCHEMA, verdict: 'APPROVE',
  request_digest: request.request_digest, attested_by: 'reviewer', independence_basis: 'test' });

test('stage order: rollback probe, attestation, commit', async () => {
  const request = await readIdentityRequest(root);
  const world = fakeWorld(request);
  const result = await runIdentityImportStage({ world, root, requireAttestation: approving(request) });
  assert.deepEqual(world.log, ['ROLLBACK', 'COMMIT']);
  assert.equal(result.request_digest, request.request_digest);
});

test('stage: no attestation means no COMMIT', async () => {
  const request = await readIdentityRequest(root);
  const world = fakeWorld(request);
  await assert.rejects(runIdentityImportStage({ world, root, requireAttestation: async () => null }),
    /V17_NPC_IDENTITY_ATTESTATION_REQUIRED/u);
  assert.deepEqual(world.log, ['ROLLBACK']);
  const wrongDigest = fakeWorld(request);
  await assert.rejects(runIdentityImportStage({ world: wrongDigest, root,
    requireAttestation: async () => ({ ...(await approving(request)()), request_digest: '3'.repeat(64) }) }),
  /V17_NPC_IDENTITY_ATTESTATION_DIGEST_MISMATCH/u);
  assert.ok(!wrongDigest.log.includes('COMMIT'));
});

test('stage: a row count different from the pinned readback throws after the commit', async () => {
  const request = await readIdentityRequest(root);
  const world = fakeWorld(request, { extraRows: { occupation_character_items: 1 } });
  await assert.rejects(runIdentityImportStage({ world, root, requireAttestation: approving(request) }),
    /V17_NPC_IDENTITY_READBACK_MISMATCH:occupation_character_items:424!=423/u);
  assert.deepEqual(world.log, ['ROLLBACK', 'COMMIT']);
});

test('every Novgorod-land regional context of the M2c datasets is bound; guest and traveler origins are not', async () => {
  const bound = new Set(rowsOf(await buildIdentityRows({ root }), 'npc_regional_context_name_bindings')
    .map((row) => row.regional_context_id));
  const datasets = ['m2c-npc/datasets', 'm2c-npc/canonical-initial/datasets',
    'm2c-scene-movement-edges/open-capacity-v2-import'];
  const seen = new Map();
  for (const directory of datasets) {
    const rows = JSON.parse(await readFile(`${root}data/world-catalogs/novgorod/${directory}/spatial_v3_npc_regional_context_profiles.json`, 'utf8'));
    for (const row of rows) seen.set(row.id, row.payload.origin.kind);
  }
  assert.ok(seen.size >= 6);
  for (const [id, kind] of seen) assert.equal(bound.has(id), kind === 'regional_affiliation', `${id} (${kind})`);
});
