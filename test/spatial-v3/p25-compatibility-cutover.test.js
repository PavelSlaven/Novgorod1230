import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import pg from 'pg';
import {
  bindSpatialV3RequestProfile,
  createSpatialV3RequestCompositionBoundary as createToolingRequestCompositionBoundary,
  createSpatialV3CompositionProfile,
  runSpatialV3ConstrainedCutover,
  runSpatialV3ImmutableShadowRun,
  runSpatialV3P24RollbackDrill,
  runSpatialV3CutoverRehearsal,
  runSpatialV3RollbackDrill,
  runSpatialV3StructuralShadow
} from '../../tools/spatial-v3/p25-activation-tooling.mjs';
import { createSpatialV3RequestProfileBoundary } from '@rus/turn/spatial-v3-request-profile';
import { validateRuntimeComposition } from '@rus/contracts/spatial-v3/compatibility';

const observation = (overrides = {}) => ({ endpoints: { departure: 'a', arrival: 'b' }, time: { numerator: 5, denominator: 1 }, visibility: { mode: 'known' }, errors: [], migration_classifications: ['canonical_projection'], ...overrides });
const bindings = (...entries) => entries;

test('P25 gives each request exactly one v2 production or no-write v3 shadow owner', () => {
  const v2 = createSpatialV3CompositionProfile({ party_id: 'p', request_id: 'r', profile: 'production_v2', request_profiles: bindings({ party_id: 'p', request_id: 'r', profile: 'production_v2' }), reader_schema_version: 2, writer_schema_version: 2 });
  assert.equal(v2.ok, true); assert.equal(v2.production_default, 'production_v2'); assert.equal(v2.activation_permitted, false);
  const shadow = createSpatialV3CompositionProfile({ party_id: 'p', request_id: 'r-shadow', profile: 'shadow_v3', request_profiles: bindings({ party_id: 'p', request_id: 'r-shadow', profile: 'shadow_v3' }), reader_schema_version: 3, writer_schema_version: 3 });
  assert.equal(shadow.ok, true); assert.equal(shadow.target_state_writes, false);
  assert.equal(createSpatialV3CompositionProfile({ party_id: 'p', request_id: 'mixed', profile: 'production_v2', request_profiles: bindings({ party_id: 'p', request_id: 'mixed', profile: 'production_v2' }), reader_schema_version: 2, writer_schema_version: 3 }).ok, false);
  assert.equal(createSpatialV3CompositionProfile({ party_id: 'p', request_id: 'dual', profile: 'shadow_v3', request_profiles: bindings({ party_id: 'p', request_id: 'dual', profile: 'shadow_v3' }), reader_schema_version: 3, writer_schema_version: 3, target_state_writes: true }).errors.at(-1).code, 'dual_writer_forbidden');
  assert.equal(createSpatialV3CompositionProfile({ party_id: 'p', request_id: 'unbound', profile: 'production_v2', reader_schema_version: 2, writer_schema_version: 2 }).errors[0].code, 'composition_profile_bindings_required');
  const conflict = bindSpatialV3RequestProfile({ party_id: 'p', request_id: 'same', profile: 'production_v2', request_profiles: bindings({ party_id: 'p', request_id: 'same', profile: 'production_v2' }, { party_id: 'p', request_id: 'same', profile: 'shadow_v3' }) });
  assert.equal(conflict.ok, false); assert.equal(conflict.errors[0].code, 'composition_profile_binding_conflict');
});

test('P25 wires P06 and immutable request profiles into the actual request composition boundary', async () => {
  const factory = createSpatialV3RequestProfileBoundary({
    request_profiles: [{ party_id: 'p', request_id: 'v2', profile: 'production_v2' }, { party_id: 'p', request_id: 'v3', profile: 'shadow_v3' }],
    p06Guard: validateRuntimeComposition,
    runProductionV2: async (input) => ({ owner: 'v2', payload: input.payload }),
    runShadowV3: async () => ({ target_state_writes: false, observation: 'shadow' })
  });
  assert.equal((await factory.run({ party_id: 'p', request_id: 'v2', profile: 'production_v2', payload: { id: 1 } })).result.owner, 'v2');
  assert.equal((await factory.run({ party_id: 'p', request_id: 'v3', profile: 'shadow_v3', payload: { id: 2 } })).activation_permitted, false);
  assert.equal((await factory.run({ party_id: 'p', request_id: 'v3', profile: 'production_v2' })).errors[0].code, 'composition_profile_binding_mismatch');
  const tooling = createToolingRequestCompositionBoundary({
    request_profiles: [{ party_id: 'p', request_id: 'r', profile: 'production_v2' }],
    production_v2: () => ({ owner: 'v2' }), shadow_v3: () => ({ target_state_writes: false })
  });
  assert.equal(tooling.compose({ party_id: 'p', request_id: 'r', profile: 'production_v2', reader_schema_version: 2, writer_schema_version: 2 }).ok, true);
});

test('P25 shadow report is deterministic, structural, no-write, and rejects unregistered differences', () => {
  const equal = runSpatialV3StructuralShadow({ legacy: observation(), target: observation() });
  assert.equal(equal.ok, true); assert.equal(equal.writes.length, 0);
  assert.deepEqual(equal, runSpatialV3StructuralShadow({ legacy: observation(), target: observation() }));
  const difference = runSpatialV3StructuralShadow({ legacy: observation(), target: observation({ visibility: { mode: 'unknown' } }) });
  assert.equal(difference.ok, false); assert.equal(difference.report.differences[0].classification, 'unregistered');
  const registered = runSpatialV3StructuralShadow({ legacy: observation(), target: observation({ visibility: { mode: 'unknown' } }), expected_divergences: [{ id: 'visibility-policy-v3', path: '$.visibility.mode', reason: 'approved target visibility semantics', legacy: 'known', target: 'unknown' }] });
  assert.equal(registered.ok, true); assert.equal(registered.report.differences[0].classification, 'registered_intentional');
  const stale = runSpatialV3StructuralShadow({ legacy: observation(), target: observation(), expected_divergences: [{ id: 'stale', path: '$.visibility.mode', reason: 'no longer differs', legacy: 'known', target: 'unknown' }] });
  assert.equal(stale.ok, false); assert.equal(stale.errors[0].code, 'shadow_divergence_registry_unconsumed');
  const duplicate = runSpatialV3StructuralShadow({ legacy: observation(), target: observation({ visibility: { mode: 'unknown' } }), expected_divergences: [{ id: 'first', path: '$.visibility.mode', reason: 'approved', legacy: 'known', target: 'unknown' }, { id: 'second', path: '$.visibility.mode', reason: 'duplicate', legacy: 'known', target: 'unknown' }] });
  assert.equal(duplicate.ok, false); assert.equal(duplicate.errors[0].code, 'shadow_divergence_registry_duplicate');
  assert.equal(runSpatialV3StructuralShadow({ legacy: { ...observation(), write_plan: {} }, target: observation() }).errors[0].code, 'shadow_write_forbidden');
});

test('P25 immutable shadow runner supplies the same frozen v2 snapshot and cannot receive writers', async () => {
  let v2Input; let v3Input;
  const report = await runSpatialV3ImmutableShadowRun({
    party_id: 'p', request_id: 'shadow-1', snapshot: { fixture: 'fixed' },
    observe_v2: async (input) => { v2Input = input; return observation(); },
    observe_target_shadow: async (input) => { v3Input = input; return observation(); }
  });
  assert.equal(report.ok, true); assert.equal(report.report.runner_kind, 'immutable_v2_target_shadow');
  assert.equal(v2Input.snapshot, v3Input.snapshot); assert.equal(Object.isFrozen(v2Input.snapshot), true);
  assert.equal((await runSpatialV3ImmutableShadowRun({ party_id: 'p', request_id: 'bad', snapshot: { write_plan: {} }, observe_v2: async () => observation(), observe_target_shadow: async () => observation() })).errors[0].code, 'shadow_write_forbidden');
});

test('P25 cutover rehearsal aborts before any target handler on failed gate and cannot activate production', async () => {
  let writes = 0; let aborts = 0;
  const shadow = runSpatialV3StructuralShadow({ legacy: observation(), target: observation() }).report;
  const failed = await runSpatialV3CutoverRehearsal({ mode: 'target_rehearsal', shadow_report: shadow, migration: { ok: true, target_only: true, rollback_validated: true }, startup_probes: [{ id: 'schema', run: async () => ({ ok: false }) }], switch_target_schema: async () => { writes += 1; return { ok: true }; }, abort: async () => { aborts += 1; } });
  assert.equal(failed.ok, false); assert.equal(failed.error.code, 'cutover_startup_probe_failed'); assert.equal(writes, 0); assert.equal(aborts, 1);
  const passed = await runSpatialV3CutoverRehearsal({ mode: 'target_rehearsal', shadow_report: shadow, migration: { ok: true, target_only: true, rollback_validated: true }, startup_probes: [{ id: 'schema', run: async () => ({ ok: true }) }], smoke_tests: [{ id: 'smoke', run: async () => ({ ok: true }) }], switch_target_schema: async ({ target_only }) => ({ ok: target_only, production: false }), write_target: async ({ target_only }) => ({ ok: target_only, production: false }) });
  assert.equal(passed.ok, true); assert.equal(passed.production_writes, 0); assert.equal(passed.next_profile, 'production_v2');
  assert.equal((await runSpatialV3CutoverRehearsal({ mode: 'production', shadow_report: shadow })).error.code, 'cutover_mode_forbidden');
});

test('P25 constrained cutover reads P24 append-only DB evidence and rejects forged booleans before writers', async () => {
  const events = [];
  const pool = (schema, row) => ({
    async connect() { return { query: async (sql, params = []) => { events.push({ schema, sql, params }); if (sql.startsWith('SELECT')) return { rows: row ? [row] : [] }; return { rows: [] }; }, release() {} }; }
  });
  const shadow = runSpatialV3StructuralShadow({ legacy: observation(), target: observation() }).report;
  const absent = await runSpatialV3ConstrainedCutover({ mode: 'target_rehearsal', shadow_report: shadow, world_pool: pool('world', null), party_pool: pool('party', null), party_id: 'p', world_artifact_id: 'w', party_artifact_id: 'q' });
  assert.equal(absent.error.code, 'cutover_p24_evidence_gate_failed');
  assert.equal(events.some((event) => event.sql.includes('INSERT')), false);
  const good = { artifact_id: 'x', acceptance_ok: true, canonical_digest: 'a'.repeat(64) };
  const passed = await runSpatialV3ConstrainedCutover({ mode: 'target_rehearsal', shadow_report: shadow, world_pool: pool('world', good), party_pool: pool('party', good), party_id: 'p', world_artifact_id: 'w', party_artifact_id: 'q', apply_target_migration: async ({ target_only, p24_evidence }) => ({ ok: target_only && p24_evidence.world.acceptance_ok, production: false }) });
  assert.equal(passed.ok, true); assert.equal(passed.activation_permitted, false);
});

test('P25 P24 party/world rollback drill requires real evidence rows and rolls both transactions back', async () => {
  const state = { world: { canonical_digest: 'w'.repeat(64) }, party: { canonical_digest: 'p'.repeat(64) } };
  const pool = (kind) => ({
    async connect() { return { query: async (sql) => { if (sql.startsWith('SELECT')) return { rows: [state[kind]] }; return { rows: [] }; }, release() {} }; },
    async query(sql) { if (sql.startsWith('SELECT')) return { rows: [state[kind]] }; return { rows: [] }; }
  });
  const drill = await runSpatialV3P24RollbackDrill({ world_pool: pool('world'), party_pool: pool('party'), party_id: 'p', world_artifact_id: 'w', party_artifact_id: 'q', mutate: async () => ({ ok: true }) });
  assert.equal(drill.ok, true); assert.equal(drill.mode, 'p24_party_world_snapshot_restore');
});

test('P25 local PostgreSQL snapshot/restore drill refuses silent v3-to-v2 reinterpretation', async (t) => {
  const docker = (args) => spawnSync('docker', args, { encoding: 'utf8', timeout: 45_000 });
  if (docker(['version']).status !== 0) t.skip('Docker required');
  const port = 57600 + (process.pid % 300); const name = `p25-${process.pid}`;
  t.after(() => docker(['rm', '-f', name]));
  assert.equal(docker(['run', '-d', '--name', name, '-p', `${port}:5432`, '-e', 'POSTGRES_PASSWORD=p25', '-e', 'POSTGRES_USER=p25', '-e', 'POSTGRES_DB=p25', 'postgres:16-alpine']).status, 0);
  const pool = new pg.Pool({ host: '127.0.0.1', port, user: 'p25', password: 'p25', database: 'p25' }); t.after(() => pool.end());
  for (let i = 0; i < 50; i += 1) { try { await pool.query('SELECT 1'); break; } catch { await new Promise((resolve) => setTimeout(resolve, 200)); if (i === 49) throw new Error('postgres unavailable'); } }
  await pool.query('CREATE TABLE target_state (id text PRIMARY KEY, value text NOT NULL)'); await pool.query("INSERT INTO target_state VALUES ('before','v2')");
  const snapshot = async () => (await pool.query('SELECT id,value FROM target_state ORDER BY id')).rows;
  const missing = await runSpatialV3RollbackDrill({ first_v3_only_mutation: true, snapshot });
  assert.equal(missing.ok, false); assert.equal(missing.error.code, 'rollback_restore_required');
  const drill = await runSpatialV3RollbackDrill({ first_v3_only_mutation: true, snapshot, mutate: async () => { await pool.query("INSERT INTO target_state VALUES ('v3-only','candidate')"); return { ok: true }; }, restore_snapshot: async (rows) => { await pool.query('DELETE FROM target_state'); for (const row of rows) await pool.query('INSERT INTO target_state(id,value) VALUES($1,$2)', [row.id, row.value]); return { ok: true }; } });
  assert.equal(drill.ok, true); assert.equal(drill.mode, 'snapshot_restore');
  assert.deepEqual((await pool.query('SELECT id,value FROM target_state ORDER BY id')).rows, [{ id: 'before', value: 'v2' }]);

  // P25-S04 exercises the actual P24 append-only party/world evidence
  // relations, not an in-memory callback or a generic state table.
  for (let i = 1; i <= 17; i += 1) await pool.query(await readFile(`infra/world-base/schema/${String(i).padStart(2, '0')}.sql`, 'utf8'));
  for (const file of ['001_party_runtime.sql', '002_party_runtime_v3.sql', '003_party_runtime_v3_planning.sql', '004_party_runtime_v3_journeys.sql', '005_party_runtime_v3_domain.sql', '006_party_runtime_v3_migration.sql']) await pool.query(await readFile(`schemas/party-db/${file}`, 'utf8'));
  const hex = (letter) => letter.repeat(64);
  await pool.query("INSERT INTO party_runtime.parties(party_id,schema_version,world_revision_id,world_catalog_digest,materializer_version,rng_version,command_catalog_digest,profile_bundle_digest) VALUES('p25-party',3,'w','d','m','r','c','b')");
  await pool.query("INSERT INTO world_base.spatial_v3_migration_coverage_artifacts(artifact_id,party_id,world_revision_id,source_scope,source_digest,source_record_count,inventory_digest,inventory_target_digest,target_digest,acceptance_ok,error_codes,source_snapshot,canonical_digest) VALUES('p25-world',NULL,'w','world',$1,1,$2,$3,$4,true,'[]','[]'::jsonb,$5)", [hex('a'), hex('b'), hex('c'), hex('d'), hex('e')]);
  await pool.query("INSERT INTO party_runtime.spatial_v3_migration_coverage_artifacts(artifact_id,party_id,world_revision_id,source_scope,source_digest,source_record_count,inventory_digest,inventory_target_digest,target_digest,acceptance_ok,error_codes,source_snapshot,canonical_digest) VALUES('p25-party','p25-party','w','party',$1,1,$2,$3,$4,true,'[]','[]'::jsonb,$5)", [hex('f'), hex('0'), hex('1'), hex('2'), hex('3')]);
  const p24 = await runSpatialV3P24RollbackDrill({ world_pool: pool, party_pool: pool, party_id: 'p25-party', world_artifact_id: 'p25-world', party_artifact_id: 'p25-party', mutate: async ({ world_client, party_client }) => {
    await world_client.query("INSERT INTO world_base.source_records(id,status) VALUES('p25-rollback-world','approved')");
    await party_client.query("INSERT INTO party_runtime.party_positions(party_id,g4_id) VALUES('p25-party','p25-rollback-party')");
    return { ok: true };
  } });
  assert.equal(p24.ok, true);
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM world_base.source_records WHERE id='p25-rollback-world'")).rows[0].n, 0);
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM party_runtime.party_positions WHERE party_id='p25-party'")).rows[0].n, 0);
});
