import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import pg from 'pg';
import { computeSpatialV3CanonicalDigest } from '@rus/contracts/spatial-v3/registry';
import { buildCombinedWritePlan } from '../../packages/turn/src/spatial-v3-write-plan.js';
import { createSpatialV3PostgresCombinedAtomicCommitter } from
  '../../apps/game-server/src/infrastructure/postgres/spatial-v3-combined-atomic-committer.js';
import { testContainerLabel } from '../helpers/test-containers.js';

const docker = (args) => spawnSync('docker', args, {
  encoding: 'utf8', timeout: 45_000
});

test('combat NPC body P16 insert/update rolls back atomically and replays idempotently', async (t) => {
  if (docker(['version']).status !== 0) return t.skip('Docker required');
  const suffix = randomUUID().replaceAll('-', '');
  const container = `combat-body-p16-${process.pid}`;
  let client;
  let pool;
  t.after(async () => {
    if (pool) await pool.end();
    if (client) await client.end();
    docker(['rm', '-fv', container]);
  });

  assert.equal(docker(['run', ...testContainerLabel(), '-d', '-p',
    '127.0.0.1::5432', '--name', container, '-e', 'POSTGRES_PASSWORD=p16',
    '-e', 'POSTGRES_USER=p16', '-e', 'POSTGRES_DB=p16',
    'postgres:16-alpine']).status, 0);
  let ready = false;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 300));
    if (docker(['exec', container, 'pg_isready', '-h', '127.0.0.1', '-U',
      'p16', '-d', 'p16']).status === 0) {
      ready = true;
      break;
    }
  }
  assert.equal(ready, true, 'isolated PostgreSQL must become ready');
  const port = Number(docker(['port', container, '5432']).stdout
    .match(/:(\d+)/u)?.[1]);
  client = new pg.Client({ host: '127.0.0.1', port, user: 'p16',
    password: 'p16', database: 'p16' });
  await client.connect();

  for (let version = 1; version <= 26; version += 1) {
    const file = `${String(version).padStart(3, '0')}_`;
    const { readdir } = await import('node:fs/promises');
    const match = (await readdir('schemas/party-db')).find((name) =>
      name.startsWith(file));
    assert.ok(match, `party schema migration ${file} must exist`);
    await client.query(await readFile(`schemas/party-db/${match}`, 'utf8'));
  }

  const partyId = `combat-body-party-${suffix}`;
  const npcId = `combat-body-npc-${suffix}`;
  const profileRef = { entity_ref: { entity_kind: 'body_state_profile',
    entity_id: `test-profile-${suffix}` }, authoring_version: 'fixture-v1' };
  await client.query(`INSERT INTO party_runtime.parties
    (party_id,schema_version,world_revision_id,world_catalog_digest,
     materializer_version,rng_version,command_catalog_digest,
     profile_bundle_digest,status)
    VALUES ($1,3,'fixture-world','fixture-catalog','fixture-materializer',
      'fixture-rng','fixture-commands','fixture-profiles','active')`, [partyId]);
  pool = new pg.Pool({ host: '127.0.0.1', port, user: 'p16',
    password: 'p16', database: 'p16', max: 2 });
  const committer = createSpatialV3PostgresCombinedAtomicCommitter({ pool,
    recheck: async () => ({ ok: true }) });

  const makePlan = async ({ ordinal, idempotencyKey, mode, stateVersion,
    health }) => {
    const changeSetId = `combat-body-change-${suffix}-${ordinal}`;
    const idempotencyId = `combat-body-idem-${suffix}-${ordinal}`;
    const packageId = `combat-body-visible-${suffix}-${ordinal}`;
    const visiblePayload = {
      schema: 'temporal_visible_package.v1',
      perceived_scene: 'Состояние сохранено.', perceived_changes: [],
      sensory_details: [], visible_npcs: [], visible_objects: [],
      known_context: [], uncertainties: [], hypotheses: [],
      player_safe_interruption: null, allowed_action_affordances: []
    };
    const dependencyPins = [{ dependency_role: 'source_authoring',
      entity_ref: { entity_kind: 'world_revision', entity_id: 'temporal-v4' },
      version_pin: { pin_kind: 'authoring_version',
        authoring_version: '4.3.0-target.1', state_version: null } }];
    const envelope = {
      package_id: packageId, party_id: partyId, turn_id: `turn-${ordinal}`,
      committed_state_version: String(ordinal), change_set_id: changeSetId,
      package_digest: computeSpatialV3CanonicalDigest(visiblePayload),
      visible_payload: visiblePayload, presentation_status: 'pending',
      projection_policy_ref: { entity_ref: { entity_kind: 'visibility_modifier',
        entity_id: 'projection-v1' }, authoring_version: '4.3.0-target.1' },
      dependency_pins: { pins: dependencyPins,
        canonical_digest: computeSpatialV3CanonicalDigest(dependencyPins)
          .replace('sha256:', '') },
      idempotency_record_id: idempotencyId
    };
    const body = { party_id: partyId, actor_kind: 'npc', actor_id: npcId,
      body_profile_ref: profileRef, health, energy: 70, satiety: 60,
      updated_change_set_id: changeSetId };
    const record = { id: changeSetId, party_id: partyId,
      operation_kind: 'combat_exchange', idempotency_record_id: idempotencyId,
      expected_state_version_set_digest: 'expected',
      expected_state_version_set: [], committed_state_version_set_digest: 'committed',
      write_plan_digest: `${changeSetId}-digest`, created_at_turn: 0,
      committed_at_turn: 0 };
    const write = { target_table: 'party_actor_body_states',
      id: `npc:${npcId}`, record: body };
    const built = await buildCombinedWritePlan({
      plan_id: `combat-body-plan-${suffix}-${ordinal}`,
      party_id: partyId, write_plan_kind: 'semantic_commit',
      operation_kind: 'combat_exchange',
      canonical_input_digest: computeSpatialV3CanonicalDigest({
        partyId, npcId, ordinal, health }),
      expected_state_versions: mode === 'update'
        ? [{ target_table: 'party_actor_body_states',
          id: `npc:${npcId}`, state_version: stateVersion }]
        : [],
      validation_report: { status: 'pass', digest:
        computeSpatialV3CanonicalDigest({ ordinal, health }) },
      idempotency: { id: idempotencyId, key: idempotencyKey },
      change_set: { id: changeSetId }, visible_package_envelope: envelope,
      approved_write_sets: [{ inserts: mode === 'insert' ? [write] : [],
        updates: mode === 'update' ? [write] : [], appends: [{
          target_table: 'party_v3_change_sets', id: changeSetId, record
        }] }],
      lock_context: { owner_keys: [`actor:${npcId}`], execution_keys: [],
        g4_keys: [], physical_keys: [
          `party_runtime.party_actor_body_states:npc:${npcId}`,
          `party_runtime.party_v3_change_sets:${changeSetId}`
        ] },
      commit_rechecks: ['physical', 'state', 'pin', 'endpoint', 'route',
        'capacity', 'time', 'change_set'].map((kind) => ({ kind,
        digest: computeSpatialV3CanonicalDigest({ kind, ordinal }) }))
    }, { verifyApproval: async () => ({ ok: true }) });
    assert.equal(built.ok, true, JSON.stringify(built));
    return built.plan;
  };

  const insertedPlan = await makePlan({ ordinal: 1,
    idempotencyKey: `combat-body-insert-${suffix}`, mode: 'insert', health: 80 });
  const inserted = await committer.commit({ plan: insertedPlan });
  assert.equal(inserted.ok, true);
  assert.equal((await committer.commit({ plan: insertedPlan })).replay, true);
  assert.deepEqual((await client.query(`SELECT health,energy,satiety,state_version
    FROM party_runtime.party_actor_body_states
    WHERE party_id=$1 AND actor_kind='npc' AND actor_id=$2`,
  [partyId, npcId])).rows[0], {
    health: '80', energy: '70', satiety: '60', state_version: '1'
  });

  const updatedPlan = await makePlan({ ordinal: 2,
    idempotencyKey: `combat-body-update-${suffix}`, mode: 'update',
    stateVersion: 1, health: 55 });
  assert.equal((await committer.commit({ plan: updatedPlan })).ok, true);
  assert.equal((await committer.commit({ plan: updatedPlan })).replay, true);
  assert.deepEqual((await client.query(`SELECT health,state_version
    FROM party_runtime.party_actor_body_states
    WHERE party_id=$1 AND actor_kind='npc' AND actor_id=$2`,
  [partyId, npcId])).rows[0], { health: '55', state_version: '2' });

  const failingPlan = await makePlan({ ordinal: 3,
    idempotencyKey: `combat-body-rollback-${suffix}`, mode: 'update',
    stateVersion: 2, health: -1 });
  const failed = await committer.commit({ plan: failingPlan });
  assert.equal(failed.ok, false);
  assert.deepEqual((await client.query(`SELECT health,state_version
    FROM party_runtime.party_actor_body_states
    WHERE party_id=$1 AND actor_kind='npc' AND actor_id=$2`,
  [partyId, npcId])).rows[0], { health: '55', state_version: '2' });
  assert.equal((await client.query(`SELECT count(*)::int AS count
    FROM party_runtime.party_v3_change_sets WHERE id=$1`,
  [`combat-body-change-${suffix}-3`])).rows[0].count, 0);
  assert.equal((await client.query(`SELECT count(*)::int AS count
    FROM party_runtime.party_command_idempotency
    WHERE party_id=$1 AND idempotency_key=$2`,
  [partyId, `combat-body-rollback-${suffix}`])).rows[0].count, 0);
});
