import assert from 'node:assert/strict';
import test from 'node:test';
import pg from 'pg';
import { validCapabilityContext } from '../../../packages/movement-routes/src/spatial-v3-validation.js';
import { createPostgresTestBackend } from '../../../test/fixtures/postgres-test-backend.js';
import { SPATIAL_V3_TARGET_MIGRATIONS } from
  '../src/infrastructure/postgres/spatial-v3-target-migrations.js';
import { createSpatialV3CurrentMovementCapability, readCurrentActorBodyCapability } from
  '../src/infrastructure/postgres/spatial-v3-current-movement-capability.js';

test('current body and combat state grant pinned action movement', async () => {
  const row = { health: '100', energy: '80', state_version: '3' };
  const conditions = [];
  const sessions = [];
  const pool = { query: async (sql, values) => {
    if (sql.includes('FROM party_runtime.party_combat_sessions')) {
      assert.deepEqual(values, ['party']);
      return { rowCount: sessions.length, rows: sessions };
    }
    assert.deepEqual(values, ['party', 'actor']);
    if (sql.includes('FROM party_runtime.party_actor_active_conditions\n')) {
      return { rowCount: conditions.length, rows: conditions };
    }
    return { rowCount: 1, rows: [{ ...row }] };
  } };
  const owner = createSpatialV3CurrentMovementCapability({ pool });
  const input = { partyId: 'party', actorId: 'actor' };
  const first = await owner.assessMovementCapability(input);
  assert.equal(validCapabilityContext(first.capability_context), true);
  assert.deepEqual(first.capability_context.allowed_movement_methods, ['movement.foot@1']);
  assert.equal(first.capability_context.dependency_pins.pins[0].version_pin.state_version, 3);
  row.state_version = '4';
  const changed = await owner.assessMovementCapability(input);
  assert.notEqual(changed.capability_context.canonical_digest,
    first.capability_context.canonical_digest);
  conditions.push({ condition_id: 'injured', status: 'active', state_version: '1' });
  await assert.rejects(owner.assessMovementCapability(input),
    (error) => error.details.reason === 'movement_capability_policy_required');
  sessions.push({ combat_id: 'combat', state_version: '1',
    participant_refs: [{ entity_kind: 'player_character', entity_id: 'actor' }],
    participant_states: [{ actor_ref: { entity_kind: 'player_character', entity_id: 'actor' },
      combat_status: 'incapacitated' }] });
  const absent = await readCurrentActorBodyCapability({ transaction: pool,
    ...input, purpose: 'perception' });
  assert.equal(absent.visual_capability, 'none');
  assert.equal(absent.hearing_capability, 'none');
  assert.deepEqual(absent.allowed_movement_methods, []);
  assert.equal(absent.dependency_pins.length, 3);
  await assert.rejects(owner.assessMovementCapability(input),
    (error) => error.details.reason === 'movement_actor_unavailable');
  sessions[0].participant_states[0].combat_status = 'restrained';
  const restrained = await readCurrentActorBodyCapability({ transaction: pool,
    ...input, purpose: 'movement' });
  assert.deepEqual(restrained.allowed_movement_methods, []);
  await assert.rejects(readCurrentActorBodyCapability({ transaction: pool,
    ...input, purpose: 'perception' }),
  (error) => error.details.reason === 'actor_perception_capability_owner_required');
  await assert.rejects(owner.assessMovementCapability(input),
    (error) => error.details.reason === 'movement_actor_unavailable');
  conditions[0].status = 'resolved';
  const resolved = await readCurrentActorBodyCapability({ transaction: pool,
    ...input, purpose: 'perception' });
  assert.equal(resolved.visual_capability, 'clear');
  assert.deepEqual(resolved.allowed_movement_methods, []);
  sessions[0].participant_states[0].combat_status = 'active';
  const combatReady = await owner.assessMovementCapability(input);
  assert.notEqual(combatReady.capability_context.canonical_digest,
    changed.capability_context.canonical_digest);
  conditions[0].state_version = '2';
  const conditionChanged = await owner.assessMovementCapability(input);
  assert.notEqual(conditionChanged.capability_context.canonical_digest,
    combatReady.capability_context.canonical_digest);
  for (const status of ['disengaging', 'surrendered', 'left']) {
    sessions[0].participant_states[0].combat_status = status;
    const current = await readCurrentActorBodyCapability({ transaction: pool,
      ...input, purpose: 'perception' });
    assert.deepEqual(current.allowed_movement_methods, ['movement.foot@1']);
  }
  for (const status of [undefined, null, 'unknown']) {
    if (status === undefined) delete sessions[0].participant_states[0].combat_status;
    else sessions[0].participant_states[0].combat_status = status;
    for (const purpose of ['movement', 'perception']) {
      await assert.rejects(readCurrentActorBodyCapability({ transaction: pool,
        ...input, purpose }), (error) =>
        error.code === 'SPATIAL_V3_SITE_TRAVERSAL_DATA_GAP'
          && error.details.reason === (purpose === 'movement'
            ? 'movement_capability_policy_required'
            : 'actor_perception_capability_owner_required'));
    }
  }
});

test('only null availability conditions pass without a condition evaluator', async () => {
  const owner = createSpatialV3CurrentMovementCapability({ pool: { query() {} } });
  assert.deepEqual(await owner.assessAvailability({ connection: {
    id: 'connection', availability_condition_set_ref: null } }),
  { ok: true, connection_id: 'connection', condition_set_ref: null });
  await assert.rejects(owner.assessAvailability({ connection: {
    id: 'connection', availability_condition_set_ref: { entity_id: 'closed',
      authoring_version: '1' } } }), (error) =>
    error.code === 'SPATIAL_V3_SITE_TRAVERSAL_DATA_GAP'
      && error.details.reason === 'availability_condition_set_owner_missing');
});

test('PostgreSQL body and active conditions control current capability', async (t) => {
  const backend = await createPostgresTestBackend('site_capability');
  if (!backend) return t.skip('PostgreSQL required');
  const pool = new pg.Pool({ connectionString: backend.partyUrl });
  t.after(async () => { await pool.end(); await backend.close(); });
  for (const sql of SPATIAL_V3_TARGET_MIGRATIONS.slice(0, 19)) await pool.query(sql);
  await pool.query(`INSERT INTO party_runtime.parties(party_id,schema_version,
    world_revision_id,world_catalog_digest,materializer_version,rng_version,
    command_catalog_digest,profile_bundle_digest)
    VALUES ('party',2,'world','catalog','1','1','commands','profiles')`);
  await pool.query(`INSERT INTO party_runtime.party_player_characters(party_id,character_id,profile)
    VALUES ('party','actor','{}')`);
  await pool.query(`INSERT INTO party_runtime.party_v3_change_sets(id,party_id,operation_kind,
    expected_state_version_set_digest,expected_state_version_set,
    committed_state_version_set_digest,write_plan_digest,created_at_turn,committed_at_turn)
    VALUES ('change','party','new_game','expected','[]','committed','plan',0,0)`);
  await pool.query(`INSERT INTO party_runtime.party_actor_body_states(party_id,actor_kind,
    actor_id,body_profile_ref,health,energy,satiety,state_version,updated_change_set_id)
    VALUES ('party','player_character','actor','{}',100,80,70,1,'change')`);
  const owner = createSpatialV3CurrentMovementCapability({ pool });
  const input = { partyId: 'party', actorId: 'actor' };
  const ready = await owner.assessMovementCapability(input);
  assert.equal(validCapabilityContext(ready.capability_context), true);
  await pool.query(`INSERT INTO party_runtime.party_actor_active_conditions(party_id,
    actor_kind,actor_id,condition_id,condition_profile_ref,status,state_version,
    created_change_set_id) VALUES ('party','player_character','actor','injured','{}',
    'active',1,'change')`);
  await assert.rejects(owner.assessMovementCapability(input),
    (error) => error.details.reason === 'movement_capability_policy_required');
  await pool.query(`INSERT INTO party_runtime.party_combat_sessions(combat_id,party_id,
    state_version,status,started_at,scope_ref,participant_refs,participant_states,
    exchange_ordinal,player_response_required,last_change_set_id,canonical_digest,
    session_schema) VALUES ('combat','party',1,'active','{}','{}',
    '[{"entity_kind":"player_character","entity_id":"actor"},
      {"entity_kind":"npc","entity_id":"other"}]',
    '[{"actor_ref":{"entity_kind":"player_character","entity_id":"actor"},
       "combat_status":"incapacitated","current_intent":null,"next_action_boundary_ref":null},
      {"actor_ref":{"entity_kind":"npc","entity_id":"other"},
       "combat_status":"active","current_intent":null,"next_action_boundary_ref":null}]',
    0,false,'change','digest','combat_session_v1')`);
  const incapacitated = await readCurrentActorBodyCapability({ transaction: pool,
    ...input, purpose: 'perception' });
  assert.equal(incapacitated.visual_capability, 'none');
  assert.equal(incapacitated.hearing_capability, 'none');
  assert.deepEqual(incapacitated.allowed_movement_methods, []);
  assert.equal(incapacitated.dependency_pins.length, 3);
  await assert.rejects(owner.assessMovementCapability(input),
    (error) => error.details.reason === 'movement_actor_unavailable');
  await pool.query(`UPDATE party_runtime.party_combat_sessions
    SET participant_states=jsonb_set(participant_states, '{0,combat_status}', '"restrained"'),
      state_version=state_version+1
    WHERE combat_id='combat'`);
  await assert.rejects(owner.assessMovementCapability(input),
    (error) => error.details.reason === 'movement_actor_unavailable');
  await assert.rejects(readCurrentActorBodyCapability({ transaction: pool,
    ...input, purpose: 'perception' }),
  (error) => error.details.reason === 'actor_perception_capability_owner_required');
  await pool.query(`UPDATE party_runtime.party_actor_active_conditions
    SET status='resolved',terminal_change_set_id='change',state_version=2
    WHERE party_id='party' AND actor_id='actor'`);
  const restrained = await readCurrentActorBodyCapability({ transaction: pool,
    ...input, purpose: 'perception' });
  assert.equal(restrained.visual_capability, 'clear');
  assert.deepEqual(restrained.allowed_movement_methods, []);
});
