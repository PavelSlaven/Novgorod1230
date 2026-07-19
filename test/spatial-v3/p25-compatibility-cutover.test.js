import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import pg from 'pg';
import {
  bindSpatialV3RequestProfile,
  createSpatialV3CompositionProfile,
  runSpatialV3CutoverRehearsal,
  runSpatialV3RollbackDrill,
  runSpatialV3StructuralShadow
} from '../../tools/spatial-v3/p25-activation-tooling.mjs';

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

test('P25 cutover rehearsal aborts before any target handler on failed gate and cannot activate production', async () => {
  let writes = 0; let aborts = 0;
  const shadow = runSpatialV3StructuralShadow({ legacy: observation(), target: observation() }).report;
  const failed = await runSpatialV3CutoverRehearsal({ mode: 'target_rehearsal', shadow_report: shadow, migration: { ok: true, target_only: true, rollback_validated: true }, startup_probes: [{ id: 'schema', run: async () => ({ ok: false }) }], switch_target_schema: async () => { writes += 1; return { ok: true }; }, abort: async () => { aborts += 1; } });
  assert.equal(failed.ok, false); assert.equal(failed.error.code, 'cutover_startup_probe_failed'); assert.equal(writes, 0); assert.equal(aborts, 1);
  const passed = await runSpatialV3CutoverRehearsal({ mode: 'target_rehearsal', shadow_report: shadow, migration: { ok: true, target_only: true, rollback_validated: true }, startup_probes: [{ id: 'schema', run: async () => ({ ok: true }) }], smoke_tests: [{ id: 'smoke', run: async () => ({ ok: true }) }], switch_target_schema: async ({ target_only }) => ({ ok: target_only, production: false }), write_target: async ({ target_only }) => ({ ok: target_only, production: false }) });
  assert.equal(passed.ok, true); assert.equal(passed.production_writes, 0); assert.equal(passed.next_profile, 'production_v2');
  assert.equal((await runSpatialV3CutoverRehearsal({ mode: 'production', shadow_report: shadow })).error.code, 'cutover_mode_forbidden');
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
});
