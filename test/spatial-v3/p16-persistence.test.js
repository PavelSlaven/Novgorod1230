import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createSpatialV3WorldBaseReader } from '../../apps/game-server/src/infrastructure/postgres/spatial-v3-world-base-reader.js';
import { createSpatialV3PartyRepository } from '../../packages/party-store/src/spatial-v3-repository.js';
import { buildCombinedWritePlan } from '../../packages/turn/src/spatial-v3-write-plan.js';
import { createSpatialV3CombinedAtomicCommitter } from '../../apps/game-server/src/infrastructure/postgres/spatial-v3-combined-atomic-committer.js';
import { computeSpatialV3CanonicalDigest } from '@rus/contracts/spatial-v3/registry';
const digest = 'a'.repeat(64);
const approval = async () => ({ ok: true });
function input(overrides = {}) {
  const visible_payload = {
    schema: 'temporal_visible_package.v1',
    perceived_scene: 'Изменение зафиксировано.',
    perceived_changes: ['Состояние сохранено.'],
    sensory_details: [],
    visible_npcs: [],
    visible_objects: [],
    known_context: [],
    uncertainties: [],
    hypotheses: [],
    player_safe_interruption: null,
    allowed_action_affordances: []
  };
  const pins = [{ dependency_role: 'source_authoring', entity_ref: { entity_kind: 'world_revision', entity_id: 'temporal-v4' }, version_pin: { pin_kind: 'authoring_version', authoring_version: '4.3.0-target.1', state_version: null } }];
  return {
    plan_id: 'plan', party_id: 'p', write_plan_kind: 'semantic_commit', operation_kind: 'move', canonical_input_digest: `sha256:${digest}`, expected_state_versions: [], validation_report: { status: 'pass', digest: `sha256:${digest}` }, idempotency: { id: 'idem', key: 'key' }, change_set: { id: 'cs' },
    visible_package_envelope: { package_id: 'visible-cs', party_id: 'p', turn_id: 'turn-1', committed_state_version: '2', change_set_id: 'cs', package_digest: computeSpatialV3CanonicalDigest(visible_payload), visible_payload, presentation_status: 'pending', projection_policy_ref: { entity_ref: { entity_kind: 'visibility_modifier', entity_id: 'projection-v1' }, authoring_version: '4.3.0-target.1' }, dependency_pins: { pins, canonical_digest: computeSpatialV3CanonicalDigest(pins).replace('sha256:', '') }, idempotency_record_id: 'idem' },
    lock_context: { owner_keys: [], execution_keys: [], g4_keys: [], physical_keys: ['party_runtime.party_v3_change_sets:cs', 'party_runtime.party_route_plan_executions:e'] }, commit_rechecks: ['physical', 'state', 'pin', 'endpoint', 'route', 'capacity', 'time', 'change_set'].map((kind) => ({ kind, digest: `sha256:${digest}` })), approved_write_sets: [{ appends: [{ target_table: 'party_v3_change_sets', id: 'cs', record: { id: 'cs', party_id: 'p', operation_kind: 'move', idempotency_record_id: 'idem' } }], inserts: [], updates: [] }],
    ...overrides
  };
}

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
  const good = await buildCombinedWritePlan(input(), { verifyApproval: approval });
  assert.equal(good.ok, true);
  assert.equal(good.plan.write_set_digest.startsWith('sha256:'), true);
  const visibleWrite = good.plan.appends.find(({ target_table }) => target_table === 'party_visible_packages');
  const narrationJob = good.plan.inserts.find(({ target_table }) => target_table === 'party_narration_jobs');
  assert.deepEqual(visibleWrite?.record.visible_payload, good.plan.visible_package_envelope.visible_payload);
  assert.equal(visibleWrite?.record.package_id, good.plan.visible_package_envelope.package_id);
  assert.equal(narrationJob?.record.package_id, good.plan.visible_package_envelope.package_id);
  assert.equal(narrationJob?.record.status, 'pending');
  assert.equal(narrationJob?.record.idempotency_key, `presentation:${good.plan.visible_package_envelope.package_id}:${good.plan.visible_package_envelope.package_digest}`);
  assert.ok(good.plan.physical_keys.includes(`party_runtime.party_visible_packages:${visibleWrite?.id}`));
  assert.ok(good.plan.physical_keys.includes(`party_runtime.party_narration_jobs:${narrationJob?.id}`));
  const bad = await buildCombinedWritePlan(input({ approved_write_sets: [{ inserts: [{ target_table: 'world_routes', id: 'x', record: { id: 'x', party_id: 'p' } }], updates: [], appends: [{ target_table: 'party_v3_change_sets', id: 'cs', record: { id: 'cs', party_id: 'p', operation_kind: 'move', idempotency_record_id: 'idem' } }] }] }), { verifyApproval: approval }); assert.equal(bad.error.code, 'generated_schema_mismatch');
  const forgedPresentationWrite = await buildCombinedWritePlan(input({
    approved_write_sets: [{
      inserts: [{
        target_table: 'party_narration_jobs',
        id: 'forged-job',
        record: { job_id: 'forged-job', party_id: 'p', package_id: 'foreign', status: 'pending', idempotency_key: 'forged' }
      }],
      updates: [],
      appends: [{
        target_table: 'party_v3_change_sets',
        id: 'cs',
        record: { id: 'cs', party_id: 'p', operation_kind: 'move', idempotency_record_id: 'idem' }
      }]
    }]
  }), { verifyApproval: approval });
  assert.equal(forgedPresentationWrite.error.code, 'visible_package_persistence_gap');
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

test('P16 sole-writer architecture forbids direct target-v3 party mutations outside CombinedAtomicCommitter', async () => {
  const source = await readFile(new URL('../../apps/game-server/src/infrastructure/postgres/spatial-v3-p23-domain-repository.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /\b(?:INSERT|UPDATE|DELETE)\s+INTO?\s+party_runtime\.|\bUPDATE\s+party_runtime\./iu);
  assert.doesNotMatch(source, /\b(?:BEGIN|COMMIT|ROLLBACK)\b|pool\.connect\(/u);
  const committer = await readFile(new URL('../../apps/game-server/src/infrastructure/postgres/spatial-v3-combined-atomic-committer.js', import.meta.url), 'utf8');
  assert.match(committer, /createSpatialV3PostgresCombinedAtomicCommitter/u);
});
