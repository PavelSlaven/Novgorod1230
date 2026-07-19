import test from 'node:test';
import assert from 'node:assert/strict';
import { createSpatialV3WorldBaseReader } from '../../apps/game-server/src/infrastructure/postgres/spatial-v3-world-base-reader.js';
import { createSpatialV3PartyRepository } from '../../packages/party-store/src/spatial-v3-repository.js';
import { buildCombinedWritePlan } from '../../packages/turn/src/spatial-v3-write-plan.js';
import { createSpatialV3CombinedAtomicCommitter } from '../../apps/game-server/src/infrastructure/postgres/spatial-v3-combined-atomic-committer.js';
const digest = 'a'.repeat(64);
const approval = async () => ({ ok: true });
function input(overrides = {}) { return { plan_id: 'plan', party_id: 'p', write_plan_kind: 'semantic_commit', operation_kind: 'move', canonical_input_digest: `sha256:${digest}`, expected_state_versions: [], validation_report: { status: 'pass', digest: `sha256:${digest}` }, idempotency: { id: 'idem', key: 'key' }, change_set: { id: 'cs' }, lock_context: { owner_keys: [], execution_keys: [], g4_keys: [], physical_keys: ['party_runtime.party_v3_change_sets:cs', 'party_runtime.party_route_plan_executions:e'] }, commit_rechecks: ['physical', 'state', 'pin', 'endpoint', 'route', 'capacity', 'time', 'change_set'].map((kind) => ({ kind, digest: `sha256:${digest}` })), approved_write_sets: [{ appends: [{ target_table: 'party_v3_change_sets', id: 'cs', record: { id: 'cs', party_id: 'p', operation_kind: 'move', idempotency_record_id: 'idem' } }], inserts: [], updates: [] }], ...overrides }; }

test('P16 reader requires exact id/version/revision/digest and uses typed projected reads', async () => {
  const calls = []; const reader = createSpatialV3WorldBaseReader({ query: async (sql, params) => { calls.push({ sql, params }); return { rows: [{ id: 'route', version: 3, world_revision_id: 'r', canonical_digest: digest }] }; } });
  assert.equal((await reader.readRoute({ id: 'route', version: 3, world_revision_id: 'r', canonical_digest: digest })).ok, true); assert.doesNotMatch(calls[0].sql, /SELECT \*/); assert.match(calls[0].sql, /canonical_digest=\$4/);
  assert.equal((await reader.readOrientationProfile({ id: 'o', version: 1, world_revision_id: 'r', canonical_digest: digest })).ok, true);
  assert.equal((await reader.readRoute({ id: 'route', version: 3, world_revision_id: 'r' })).error.code, 'authoring_dependency_pin_missing');
});

test('P16 repository models composite history identity without generic id ordering', async () => {
  const calls = []; const repository = createSpatialV3PartyRepository({ transaction: { query: async (sql) => { calls.push(sql); return { rows: [{ execution_id: 'e', event_ordinal: 1, party_id: 'p' }] }; } } });
  assert.equal((await repository.loadHistory({ party_id: 'p', execution_id: 'e', event_ordinal: 1 })).ok, true); assert.match(calls[0], /ORDER BY execution_id,event_ordinal/); assert.doesNotMatch(calls[0], /SELECT \*/);
});

test('P16 builder verifies approval, preserves three disjoint sets and rejects a foreign table', async () => {
  const good = await buildCombinedWritePlan(input(), { verifyApproval: approval }); assert.equal(good.ok, true); assert.equal(good.plan.write_set_digest.startsWith('sha256:'), true);
  const bad = await buildCombinedWritePlan(input({ approved_write_sets: [{ inserts: [{ target_table: 'world_routes', id: 'x', record: { id: 'x', party_id: 'p' } }], updates: [], appends: [{ target_table: 'party_v3_change_sets', id: 'cs', record: { id: 'cs', party_id: 'p', operation_kind: 'move', idempotency_record_id: 'idem' } }] }] }), { verifyApproval: approval }); assert.equal(bad.error.code, 'generated_schema_mismatch');
});

test('P16 committer locks ordered phases, rejects stale update before writes and never trusts foreign table', async () => {
  const built = await buildCombinedWritePlan(input({ expected_state_versions: [{ target_table: 'party_route_plan_executions', id: 'e', state_version: 2 }], approved_write_sets: [{ inserts: [], appends: [{ target_table: 'party_v3_change_sets', id: 'cs', record: { id: 'cs', party_id: 'p', operation_kind: 'move', idempotency_record_id: 'idem' } }], updates: [{ target_table: 'party_route_plan_executions', id: 'e', record: { id: 'e', party_id: 'p', status: 'active' } }] }] }), { verifyApproval: approval });
  const calls = []; const committer = createSpatialV3CombinedAtomicCommitter({ recheck: async () => ({ ok: true }), withTransaction: async (work) => work({ query: async (sql) => { calls.push(sql); if (sql.includes('party_command_idempotency') && sql.startsWith('SELECT')) return { rows: [] }; if (sql.startsWith('UPDATE party_runtime.') && sql.includes('party_route_plan_executions')) return { rowCount: 0, rows: [] }; return { rowCount: 1, rows: [] }; } }) });
  const result = await committer.commit({ plan: built.plan }); assert.equal(result.error.code, 'state_version_conflict'); assert.match(calls[0], /pg_advisory_xact_lock/);
});

test('P16 idempotency replay compares input and expected-version digests', async () => {
  const built = await buildCombinedWritePlan(input(), { verifyApproval: approval }); const committer = createSpatialV3CombinedAtomicCommitter({ recheck: async () => ({ ok: true }), withTransaction: async (work) => work({ query: async (sql) => sql.startsWith('SELECT') && sql.includes('idempotency') ? { rows: [{ canonical_input_digest: 'b'.repeat(64), expected_state_version_set_digest: digest, status: 'committed', result_change_set_id: 'old' }] } : { rows: [], rowCount: 1 } }) });
  assert.equal((await committer.commit({ plan: built.plan })).error.code, 'idempotency_conflict');
});
