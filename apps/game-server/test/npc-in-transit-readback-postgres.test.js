import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import pg from 'pg';
import { createPostgresTestBackend } from '../../../test/fixtures/postgres-test-backend.js';
import { loadPhase2JourneyLocation, normalizeJourneyLocation,
  withJourneyLocation } from
  '../src/infrastructure/postgres/lower-dvina-trace-phase-2-journey-location.js';
import { withSceneNpcs } from
  '../src/infrastructure/postgres/scene-npcs-readback.js';

const PARTY_SCHEMA_FILES = [
  '001_party_runtime.sql', '002_party_runtime_v3.sql',
  '003_party_runtime_v3_planning.sql', '004_party_runtime_v3_journeys.sql',
  '005_party_runtime_v3_domain.sql', '006_party_runtime_v3_migration.sql',
  '007_party_runtime_temporal_world.sql', '008_party_runtime_pr8_first_entry.sql',
  '009_party_runtime_pr8_reaction_knowledge.sql',
  '010_party_runtime_pr8_reaction_options.sql',
  '011_party_runtime_first_playable.sql',
  '034_party_runtime_actor_base_attributes.sql'
];

test('paused in-transit journey reloads with no active combat',
  { timeout: 180_000 }, async (t) => {
    const seeded = await fixture(t);
    if (seeded == null) return;
    const { pool, partyId } = seeded;
    const readback = trackedPool(pool);
    const state = await transitState(pool, partyId, []);

    const loaded = await withSceneNpcs(readback.pool, partyId, state, {
      validateRows: async () => assert.fail('scene validation must be skipped')
    });

    assert.equal(loaded.journey_location.location_kind, 'in_transit');
    assert.equal(loaded.npcs[0].instance_id, 'npc:transit');
    assert.deepEqual(readback.queries, []);
  });

test('paused in-transit journey reloads persisted combat participant body by ref',
  { timeout: 180_000 }, async (t) => {
    const seeded = await fixture(t);
    if (seeded == null) return;
    const { pool, partyId } = seeded;
    const readback = trackedPool(pool);
    const state = await transitState(pool, partyId, [{ status: 'open', participant_refs: [
      { entity_kind: 'npc', entity_id: 'npc:transit' }
    ] }]);

    const loaded = await withSceneNpcs(readback.pool, partyId, state, {
      validateRows: async () => assert.fail('scene validation must be skipped')
    });

    assert.equal(loaded.journey_location.location_kind, 'in_transit');
    assert.equal(loaded.npcs[0].body_state_persisted, true);
    assert.equal(loaded.npcs[0].body_state_version, 1);
    assert.deepEqual(loaded.npcs[0].body_state,
      { health: 61, energy: 52, satiety: 43 });
    assert.deepEqual(loaded.npcs[0].body_profile_ref, {
      entity_ref: { entity_kind: 'body_state_profile',
        entity_id: 'approved:npc-body' }, authoring_version: 'v1'
    });
    assert.equal(readback.queries.length, 1);
    assert.match(readback.queries[0], /party_actor_body_states/u);
    assert.doesNotMatch(readback.queries[0], /scene_position_nodes|party_npcs/u);
  });

test('scene and malformed or partial journey identities fail closed', async () => {
  const invalidStates = [
    { position: {}, npcs: [], combat_sessions: [] },
    { position: {}, journey_location: { location_kind: 'in_transit',
      scene_position_id: null, transit_anchor_id: null,
      travel_state_id: null, g6_instance_id: null },
    npcs: [], combat_sessions: [] },
    { position: { position_id: 'position:partial' },
      journey_location: { location_kind: 'in_transit',
        scene_position_id: 'position:partial', transit_anchor_id: null,
        travel_state_id: 'travel:paused', g6_instance_id: null },
      npcs: [], combat_sessions: [] },
    { position: { g6_instance_id: 'g6:stale' },
      journey_location: { location_kind: 'in_transit',
        scene_position_id: null, transit_anchor_id: null,
        travel_state_id: 'travel:paused', g6_instance_id: null },
      npcs: [], combat_sessions: [] },
    { position: {}, journey_location: { location_kind: 'transit_anchor',
      scene_position_id: null, transit_anchor_id: null,
      travel_state_id: null, g6_instance_id: null },
      npcs: [], combat_sessions: [] },
    { position: { site_id: 'site:stale' },
      journey_location: { location_kind: 'transit_anchor',
        scene_position_id: null, transit_anchor_id: 'anchor:arrival',
        travel_state_id: null, g6_instance_id: null },
      npcs: [], combat_sessions: [] },
    { position: {}, journey_location: { location_kind: 'transit_anchor',
      scene_position_id: null, transit_anchor_id: 'anchor:arrival',
      travel_state_id: 'travel:stale', g6_instance_id: null },
      npcs: [], combat_sessions: [] }
  ];
  for (const state of invalidStates) {
    await assert.rejects(withSceneNpcs({ query: async () => {
      assert.fail('invalid readback must fail before scene SQL');
    } }, 'party:transit-readback', state), {
      code: 'SCENE_NPC_READBACK_DATA_GAP'
    });
  }
});

test('journey projection clears stale scene G6 identity before in-transit readback',
  async () => {
    const journeyLocation = normalizeJourneyLocation({ id: 'journey:transit',
      location_kind: 'in_transit', scene_position_id: null,
      transit_anchor_id: null, travel_state_id: 'travel:paused',
      state_version: '1', g6_instance_id: null });
    const state = withJourneyLocation({ position: {
      position_id: 'position:stale', g6_id: 'g6:stale',
      g6_instance_id: 'g6:stale', site_id: 'site:stale'
    }, npcs: [], combat_sessions: [] }, journeyLocation);

    assert.equal(Object.hasOwn(state.position, 'g6_instance_id'), false);
    const readback = trackedPool({ query: async () => {
      assert.fail('clean in-transit projection must skip scene SQL');
    } });
    const loaded = await withSceneNpcs(readback.pool, 'party:transit-readback',
      state);
    assert.equal(loaded.journey_location.location_kind, 'in_transit');
    assert.deepEqual(readback.queries, []);
  });

test('transit anchor readback has no scene identity or scene NPC query', async () => {
  const journeyLocation = normalizeJourneyLocation({ id: 'journey:anchor',
    location_kind: 'transit_anchor', scene_position_id: null,
    transit_anchor_id: 'anchor:arrival', travel_state_id: null,
    state_version: '1', g6_instance_id: null });
  const state = withJourneyLocation({ position: {
    position_id: 'position:stale', g6_id: 'g6:stale',
    g6_instance_id: 'g6:stale', site_id: 'site:stale'
  }, npcs: [], combat_sessions: [] }, journeyLocation);
  assert.deepEqual(state.position, {});
  const readback = trackedPool({ query: async () => {
    assert.fail('transit anchor must skip scene SQL');
  } });
  const loaded = await withSceneNpcs(readback.pool, 'party:transit-readback',
    state);
  assert.equal(loaded.journey_location.transit_anchor_id, 'anchor:arrival');
  assert.deepEqual(readback.queries, []);
});

test('null journey projection removes stale scene G6 identity', async () => {
  const state = withJourneyLocation({ journey_location: { stale: true },
    position: { position_id: 'position:stale', g6_id: 'g6:stale',
      g6_instance_id: 'g6:stale', site_id: 'site:stale' } }, null);
  assert.equal(Object.hasOwn(state, 'journey_location'), false);
  assert.equal(Object.hasOwn(state.position, 'g6_instance_id'), false);
});

test('Phase 2 journey readback preserves authoritative in-transit identity',
  async () => {
    let queryText = '';
    const loaded = await loadPhase2JourneyLocation({ query: async (sql) => {
      queryText = sql;
      return { rows: [{ id: 'journey:transit',
        location_kind: 'in_transit', scene_position_id: null,
        transit_anchor_id: null, travel_state_id: 'travel:paused',
        state_version: '3', g6_instance_id: null }] };
    } }, 'party:transit-readback', 'player:transit');
    assert.match(queryText, /LEFT JOIN party_runtime\.scene_position_nodes/u);
    assert.deepEqual(loaded, { id: 'journey:transit',
      location_kind: 'in_transit', scene_position_id: null,
      transit_anchor_id: null, travel_state_id: 'travel:paused',
      g6_instance_id: null, state_version: 3 });
  });

async function fixture(t) {
  const backend = await createPostgresTestBackend('issue_352');
  assert.ok(backend, 'PostgreSQL test backend is required for transit readback acceptance');
  const pool = new pg.Pool({ connectionString: backend.partyUrl, max: 1 });
  t.after(async () => { await pool.end(); await backend.close(); });
  for (const file of PARTY_SCHEMA_FILES) {
    await pool.query(await readFile(new URL(
      `../../../schemas/party-db/${file}`, import.meta.url), 'utf8'));
  }
  const partyId = 'party:transit-readback';
  await pool.query(`INSERT INTO party_runtime.parties
    (party_id,schema_version,world_revision_id,world_catalog_digest,
      materializer_version,rng_version,command_catalog_digest,profile_bundle_digest)
    VALUES ($1,3,'world:test','catalog:test','test','test','commands','profiles')`,
  [partyId]);
  await pool.query(`INSERT INTO party_runtime.party_v3_change_sets
    (id,party_id,operation_kind,expected_state_version_set_digest,
      expected_state_version_set,committed_state_version_set_digest,
      write_plan_digest,created_at_turn,committed_at_turn)
    VALUES ('change:seed',$1,'fixture','seed','[]','seed','seed',0,0)`,
  [partyId]);
  await pool.query(`INSERT INTO party_runtime.party_materialization_runs
    (party_id,run_id,g4_id,run_kind,seed_digest,input_digest,catalog_digest,
      materializer_version,rng_version,result_digest,idempotency_key,status)
    VALUES ($1,'run:seed','g4:test','baseline','seed','input','catalog',
      'test','test','result','seed','committed')`, [partyId]);
  await pool.query(`INSERT INTO party_runtime.party_npcs
    (party_id,npc_id,run_id,profile_set_id,profile_level,identity_state,
      machine_state,semantic_state)
    VALUES ($1,'npc:transit','run:seed','profile:test','background','{}','{}',
      '{"body_state_profile":{"schema":"rus.body_state.initialization_profile.v1"}}')`,
  [partyId]);
  await pool.query(`INSERT INTO party_runtime.party_actor_profile_bindings
    (party_id,actor_kind,actor_id,role_ref,occupation_ref,skill_profile_snapshot,
      name_profile_snapshot,language_profile_snapshot,knowledge_profile_snapshot,
      profile_candidate_set_digest,created_change_set_id,updated_change_set_id)
    VALUES ($1,'npc','npc:transit','{"id":"role:test","source":"test"}',
      '{"id":"occupation:test","source":"test"}','{}','{}','{}','{}',
      'profile-digest','change:seed','change:seed')`, [partyId]);
  await pool.query(`INSERT INTO party_runtime.party_actor_body_states
    (party_id,actor_kind,actor_id,body_profile_ref,health,energy,satiety,
      state_version,updated_change_set_id)
    VALUES ($1,'npc','npc:transit',
      '{"entity_ref":{"entity_kind":"body_state_profile","entity_id":"approved:npc-body"},"authoring_version":"v1"}',
      61,52,43,1,'change:seed')`, [partyId]);
  await seedTransitJourney(pool, partyId);
  return { pool, partyId };
}

function npcState() {
  return { instance_id: 'npc:transit',
    body_profile_ref: { entity_ref: { entity_kind: 'body_state_profile',
      entity_id: 'approved:npc-body' }, authoring_version: 'v1' },
    body_state_persisted: false,
    body_state: { health: 100, energy: 100, satiety: 100 } };
}

async function transitState(pool, partyId, combatSessions) {
  const journeyLocation = await loadPhase2JourneyLocation(pool, partyId,
    'player:transit');
  return withJourneyLocation({ party_id: partyId, actor_id: 'player:transit',
    position: { position_id: 'stale:position', g6_id: 'stale:g6',
      site_id: 'stale:site' }, npcs: [npcState()],
    combat_sessions: combatSessions }, journeyLocation);
}

function trackedPool(pool) {
  const queries = [];
  return { queries, pool: { query(sql, params) {
    queries.push(sql);
    return pool.query(sql, params);
  } } };
}

async function seedTransitJourney(pool, partyId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`INSERT INTO party_runtime.party_route_plans
      (id,party_id,journey_owner_ref,journey_scope,request_kind,
       planning_request_id,path_query_digest,option_id,knowledge_scope,
       source_endpoint_snapshot,intended_direction_id,world_revision_id,
       catalog_digest,planning_algorithm_version,planning_state_version,
       planning_context_dependency_pins,canonical_serialization_digest,status,
       created_change_set_id,lifecycle_change_set_id,created_at_turn)
      VALUES ('plan:transit',$1,
       '{"entity_kind":"actor","entity_id":"player:transit"}',
       'world_travel','ordinary','request:transit','path-digest',
       'option:transit','factual','{"endpoint":"departure"}','north',
       'world:test','catalog:test','test',1,'[]','canonical','ready',
       'change:seed','change:seed',0)`, [partyId]);
    await client.query(`INSERT INTO party_runtime.party_route_plan_steps
      (route_plan_id,ordinal,step_kind,departure_endpoint_snapshot,
       arrival_endpoint_snapshot,static_contract_snapshot)
      VALUES ('plan:transit',0,'timed_traversal',
       '{"endpoint":"departure"}','{"endpoint":"arrival"}',
       '{"snapshot_kind":"timed_traversal"}')`);
    await client.query(`INSERT INTO party_runtime.party_route_plan_executions
      (id,party_id,route_plan_id,journey_owner_ref,journey_scope,status,
       current_step_ordinal,current_endpoint_ref,state_version,
       updated_change_set_id)
      VALUES ('execution:transit',$1,'plan:transit',
       '{"entity_kind":"actor","entity_id":"player:transit"}',
       'world_travel','planned',0,'{"endpoint":"departure"}',1,
       'change:seed')`, [partyId]);
    await client.query(`INSERT INTO party_runtime.party_route_plan_execution_events
      (execution_id,event_ordinal,event_kind,from_status,to_status,step_ordinal,
       location_snapshot,causal_result_ref,change_set_id,idempotency_record_id,
       occurred_at_turn)
      VALUES ('execution:transit',0,'planned',NULL,'planned',0,'{}',NULL,
       'change:seed','idempotency:seed',0)`);
    await client.query(`UPDATE party_runtime.party_route_plan_executions
       SET status='active',current_endpoint_ref=NULL,
           active_travel_state_id='travel:paused',started_at_turn=0,
           state_version=2,updated_change_set_id='change:travel'
       WHERE id='execution:transit'`);
    await client.query(`INSERT INTO party_runtime.party_route_plan_execution_events
      (execution_id,event_ordinal,event_kind,from_status,to_status,step_ordinal,
       location_snapshot,causal_result_ref,change_set_id,idempotency_record_id,
       occurred_at_turn)
      VALUES ('execution:transit',1,'activated','planned','active',0,'{}',NULL,
       'change:travel','idempotency:travel',0)`);
    await client.query(`INSERT INTO party_runtime.traveller_travel_states
      (id,party_id,route_plan_execution_id,plan_step_ordinal,
       movement_carrier_ref,segment_progress_ppm,
       cumulative_actual_time_numerator,cumulative_actual_time_denominator,
       navigation_state,last_confirmed_endpoint_ref,status,updated_change_set_id)
      VALUES ('travel:paused',$1,'execution:transit',0,
       '{"entity_kind":"actor","entity_id":"player:transit"}',250000,
       0,1,'on_course','{"endpoint":"departure"}',
       'paused_in_transit','change:travel')`, [partyId]);
    await client.query(`INSERT INTO party_runtime.party_journey_locations
      (id,party_id,owner_kind,owner_id,location_kind,scene_position_id,
       transit_anchor_id,travel_state_id,state_version,updated_change_set_id)
      VALUES ('journey:transit',$1,'actor','player:transit','in_transit',
       NULL,NULL,'travel:paused',1,'change:travel')`, [partyId]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
