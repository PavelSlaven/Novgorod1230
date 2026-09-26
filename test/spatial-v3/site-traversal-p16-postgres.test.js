import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import pg from 'pg';
import { canonicalDigest } from '@rus/materialization';
import { computeSpatialV3CanonicalDigest as digest } from '@rus/contracts/spatial-v3/registry';
import { buildCombinedWritePlan } from '../../packages/turn/src/spatial-v3-write-plan.js';
import { testContainerLabel } from '../helpers/test-containers.js';
import { createSpatialV3PostgresCombinedAtomicCommitter } from
  '../../apps/game-server/src/infrastructure/postgres/spatial-v3-combined-atomic-committer.js';
import { SPATIAL_V3_TARGET_MIGRATIONS } from
  '../../apps/game-server/src/infrastructure/postgres/spatial-v3-target-migrations.js';
import { siteTraversalWrites } from
  '../../apps/game-server/src/infrastructure/postgres/spatial-v3-site-traversal-commit.js';
import { recheckSiteConnectionTraversal } from
  '../../apps/game-server/src/infrastructure/postgres/first-playable/recheck-site-connection-traversal.js';
import { readCurrentSceneSnapshot } from
  '../../apps/game-server/src/infrastructure/postgres/g4-natural-perception-reader.js';

const docker = (args) => spawnSync('docker', args, { encoding: 'utf8', timeout: 45_000 });
const ref = (entity_id) => ({ entity_id, authoring_version: '1' });
const write = (target_table, id, record) => ({ target_table, id, record });
const key = (row) => `party_runtime.${row.target_table}:${row.id}`;
const source = { endpoint_ref: { endpoint_kind: 'site_connection_endpoint', endpoint_id: 'from',
  target_ref: { spatial_kind: 'party_site', spatial_id: 'source' } }, resolved_position_id: 'source-pos' };
const arrival = { endpoint_ref: { endpoint_kind: 'site_connection_endpoint', endpoint_id: 'to',
  target_ref: { spatial_kind: 'party_site', spatial_id: 'target' } }, resolved_position_id: 'target-pos' };
const condition = ref('availability.local_state_conditional');
const visible = { version: 1, schema: 'visible_context_package',
  visible_scene: 'Новая поляна.', visible_changes: [], sensory_details: [],
  visible_npc: [], visible_objects: [], known_context: [], uncertainties: [],
  allowed_tensions: [], do_not_imply: [] };

function traversal(change, invalidResult = false, conditionRef = condition) {
  const actionId = `action:${change}`;
  const executionId = `route-execution:${change}`;
  const step = { step_kind: 'immediate_action', departure_endpoint_snapshot: source,
    arrival_endpoint_snapshot: arrival, static_contract_snapshot: {
      snapshot_kind: 'immediate_action', action_snapshot: { relation_ref: {
        entity_kind: 'site_connection', entity_id: 'connection' } } } };
  const plan = { id: `route:${change}`, party_id: 'p',
    journey_owner_ref: { entity_kind: 'actor', entity_id: 'actor' },
    journey_scope: 'world_travel', request_kind: 'ordinary',
    planning_request_id: change, path_query_digest: digest(change), option_id: change,
    knowledge_scope: 'factual', source_endpoint_snapshot: source,
    target_request: { target_kind: 'factual_spatial' },
    resolved_factual_target_ref: arrival.endpoint_ref.target_ref,
    target_resolution_dependency_pins: { pins: [] }, intended_direction_id: null,
    world_revision_id: 'world', catalog_digest: 'catalog',
    planning_algorithm_version: 'site-test', planning_state_version: 1,
    planning_context_dependency_pins: { pins: [] },
    canonical_serialization_digest: digest(step),
    created_change_set_id: change, created_at_turn: 1, steps: [step] };
  const result = { id: actionId, execution_id: executionId,
    result_change_set_id: change, idempotency_record_id: `idem:${change}`,
    occurred_at_turn: 1, result_kind: 'completed', step_ordinal: 0,
    execution_context_snapshot: { context_kind: 'site_connection_traversal' } };
  const transition = { owner: '@rus/turn/spatial-v3-site-connection-traversal',
    actor_id: 'actor', connection_id: 'connection',
    from_position_ref: 'source-pos', to_position_ref: 'target-pos',
    source_site_id: 'source', destination_site_id: 'target', destination_g4_id: 'g4',
    destination_g6_instance_id: 'target-g6',
    destination_scene_baseline_id: 'target-base',
    expected_journey_state_version: 1, connection_state_version: 1,
    source_endpoint_state_version: 1, destination_endpoint_state_version: 1,
    source_position_state_version: 1, destination_position_state_version: 1,
    source_g6_state_version: 1, destination_g6_state_version: 1,
    source_baseline_state_version: 1, destination_baseline_state_version: 1,
    source_site_state_version: 1, destination_site_state_version: 1,
    destination_capacity: 2, availability_condition_set_ref: conditionRef,
    capability_context_digest: 'capability-digest',
    destination_visible_digest: canonicalDigest(visible), action_units: 1 };
  const prepared = siteTraversalWrites({ partyId: 'p',
    envelope: { consequence: { position_transition: transition,
      spatial_v3_traversal: { plan, result, expected_state_versions: {
        entries: [{ entity_ref: { entity_kind: 'party_journey_location',
          entity_id: 'journey' }, state_version: 1 }] } } } },
    changeSetId: change, idemId: `idem:${change}`, turnNumber: 1 });
  if (invalidResult) prepared.writes.appends[0].record.result_kind = 'invalid';
  const journey = write('party_journey_locations', 'journey', { id: 'journey',
    party_id: 'p', owner_kind: 'actor', owner_id: 'actor', location_kind: 'scene',
    scene_position_id: 'target-pos', transit_anchor_id: null, travel_state_id: null,
    updated_change_set_id: change });
  const changes = write('party_v3_change_sets', change, { id: change, party_id: 'p',
    operation_kind: 'trace_turn_step', idempotency_record_id: `idem:${change}` });
  return { inserts: prepared.writes.inserts, updates: [journey],
    appends: [changes, ...prepared.writes.appends], deletes: [],
    rechecks: prepared.rechecks };
}

async function sealedPlan(change, invalidResult = false, conditionRef = condition) {
  const writes = traversal(change, invalidResult, conditionRef);
  const payload = { schema: 'temporal_visible_package.v1', perceived_scene: 'Цель.',
    perceived_changes: [], sensory_details: [], visible_npcs: [], visible_objects: [],
    known_context: [], uncertainties: [], hypotheses: [], player_safe_interruption: null,
    allowed_action_affordances: [] };
  const pins = [{ dependency_role: 'source_authoring',
    entity_ref: { entity_kind: 'world_revision', entity_id: 'world' },
    version_pin: { pin_kind: 'authoring_version', authoring_version: '1', state_version: null } }];
  const result = await buildCombinedWritePlan({ plan_id: `p16:${change}`, party_id: 'p',
    write_plan_kind: 'semantic_commit', operation_kind: 'trace_turn_step',
    canonical_input_digest: digest(change),
    expected_state_versions: [{ target_table: 'party_journey_locations', id: 'journey', state_version: 1 }],
    validation_report: { status: 'pass', digest: digest(change) },
    idempotency: { id: `idem:${change}`, key: change }, change_set: { id: change },
    visible_package_envelope: { package_id: `visible:${change}`, party_id: 'p', turn_id: change,
      committed_state_version: '1', change_set_id: change, package_digest: digest(payload),
      visible_payload: payload, presentation_status: 'pending',
      projection_policy_ref: { entity_ref: { entity_kind: 'visibility_modifier',
        entity_id: 'projection' }, authoring_version: '1' },
      dependency_pins: { pins, canonical_digest: digest(pins).slice(7) },
      idempotency_record_id: `idem:${change}` },
    approved_write_sets: [writes], lock_context: {
      owner_keys: ['actor:actor'], execution_keys: [], g4_keys: [],
      physical_keys: [...writes.inserts, ...writes.updates, ...writes.appends].map(key) },
    commit_rechecks: [...['physical', 'state', 'pin', 'endpoint', 'route', 'capacity', 'time',
      'change_set'].map((kind) => ({ kind, digest: digest(kind) })), ...writes.rechecks]
  }, { verifyApproval: async () => ({ ok: true }) });
  assert.equal(result.ok, true, JSON.stringify(result));
  return result.plan;
}

for (const conditionRef of [condition, null]) test(
  `site traversal P16 commits and replays with ${conditionRef ? 'conditional' : 'unconditional'} availability`, async (t) => {
  if (docker(['version']).status !== 0) return t.skip('Docker required');
  const name = `m2c-site-traversal-${conditionRef ? 'condition' : 'no-condition'}-${process.pid}`;
  let pool;
  t.after(async () => { await pool?.end(); docker(['rm', '-fv', name]); });
  assert.equal(docker(['run', ...testContainerLabel(), '-d', '-p', '127.0.0.1::5432', '--name', name,
    '-e', 'POSTGRES_PASSWORD=site', '-e', 'POSTGRES_USER=site', '-e', 'POSTGRES_DB=site',
    'postgres:16-alpine']).status, 0);
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (docker(['exec', name, 'pg_isready', '-U', 'site']).status === 0) break;
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  await new Promise((resolve) => setTimeout(resolve, 600));
  const port = Number(docker(['port', name, '5432']).stdout.match(/:(\d+)/)[1]);
  pool = new pg.Pool({ host: '127.0.0.1', port, user: 'site', password: 'site', database: 'site' });
  for (const sql of SPATIAL_V3_TARGET_MIGRATIONS) await pool.query(sql);
  await pool.query(`INSERT INTO party_runtime.parties
    (party_id,schema_version,world_revision_id,world_catalog_digest,materializer_version,rng_version,command_catalog_digest,profile_bundle_digest)
    VALUES ('p',3,'world','catalog','materializer','rng','commands','profiles');
    INSERT INTO party_runtime.party_g5_sites
    (id,party_id,origin,parent_g4_id,canonical_g5_ref,status,state_version,created_change_set_id,updated_change_set_id)
    VALUES ('source','p','canonical','g4','{"entity_id":"source"}','active',1,'seed','seed'),
      ('target','p','canonical','g4','{"entity_id":"target"}','active',1,'seed','seed');`);
  for (const site of ['source', 'target']) {
    await pool.query(`INSERT INTO party_runtime.party_scene_baselines
      (id,party_id,host_kind,host_id,source_kind,scene_template_ref,materialization_trace_id,
        materializer_version,catalog_digest,status,state_version,created_change_set_id,updated_change_set_id)
      VALUES ($1,'p','g5_site',$2,'canonical_template',$3,'trace','1','catalog','active',1,'seed','seed')`,
    [`${site}-base`, site, ref('scene')]);
    await pool.query(`INSERT INTO party_runtime.party_g6_instances
      (id,party_id,scene_baseline_id,source_scene_template_ref,scene_slot_key,host_kind,host_id,
        physical_class_id,primary_scene_role_id,vertical_context_id,overhead_cover_id,
        intra_g6_visibility_mode,default_visibility_distance_band,acoustic_uniformity,
        status,state_version,created_change_set_id,updated_change_set_id)
      VALUES ($1,'p',$2,$3,'main','g5_site',$4,'open','outside','ground','sky',
        'default_clear','near','uniform','active',1,'seed','seed')`,
    [`${site}-g6`, `${site}-base`, ref('scene'), site]);
    await pool.query(`INSERT INTO party_runtime.scene_position_nodes
      (id,party_id,g6_instance_id,position_type_id,template_slot_key,template_instance_ordinal,
        capacity,access_class_id,status,state_version,created_change_set_id,updated_change_set_id)
      VALUES ($1,'p',$2,'ground','entry',0,2,'open','active',1,'seed','seed')`,
    [`${site}-pos`, `${site}-g6`]);
  }
  await pool.query(`INSERT INTO party_runtime.g5_site_connections
    (id,party_id,from_site_id,to_site_id,passage_type_id,transition_environment_profile_ref,
      movement_orientation_profile_ref,cost_kind,action_units,availability_condition_set_ref,
      status,state_version,created_change_set_id,updated_change_set_id)
    VALUES ('connection','p','source','target','path',$1,$2,'action',1,$3,'active',1,'seed','seed')`,
  [ref('environment'), ref('orientation'), conditionRef]);
  for (const role of ['from', 'to']) {
    const site = role === 'from' ? 'source' : 'target';
    await pool.query(`INSERT INTO party_runtime.party_site_connection_endpoint_bindings
      (id,party_id,site_connection_id,endpoint_role,g5_site_id,position_id,source_slot_key,
        status,state_version,activated_change_set_id)
      VALUES ($1,'p','connection',$2,$3,$4,'entry','active',1,'seed')`,
    [role, role, site, `${site}-pos`]);
  }
  await pool.query(`INSERT INTO party_runtime.party_journey_locations
    (id,party_id,owner_kind,owner_id,location_kind,scene_position_id,state_version,updated_change_set_id)
    VALUES ('journey','p','actor','actor','scene','source-pos',1,'seed')`);
  const destinationScene = await readCurrentSceneSnapshot({ transaction: pool,
    partyId: 'p', actorId: 'actor', observedPositionId: 'target-pos',
    pin: { compatible_world_revision_id: 'world', compatible_world_catalog_digest: 'catalog' } });
  assert.equal(destinationScene.location.scene_position_id, 'target-pos');
  assert.equal(destinationScene.site.id, 'target');
  assert.equal((await pool.query(`SELECT scene_position_id FROM party_runtime.party_journey_locations
    WHERE id='journey'`)).rows[0].scene_position_id, 'source-pos');
  let availabilityOpen = false;
  let capabilityDigest = 'capability-digest';
  let projectedVisible = visible;
  const availability = async ({ transaction, connectionId, conditionSetRef }) => {
    assert.ok(transaction?.query);
    return { ok: availabilityOpen, connection_id: connectionId,
      condition_set_ref: conditionSetRef == null ? null
        : `${conditionSetRef.entity_id}@${conditionSetRef.authoring_version}` };
  };
  const committer = createSpatialV3PostgresCombinedAtomicCommitter({ pool,
    recheck: async ({ transaction, party_id, check }) => check.kind === 'site_connection_traversal'
      ? recheckSiteConnectionTraversal({ transaction, partyId: party_id, check,
        assessAvailability: availability,
        assessMovementCapability: async () => ({ ok: true, actor_id: 'actor',
          capability_context: { canonical_digest: capabilityDigest } }),
        projectDestination: async () => ({ ok: true, position_id: 'target-pos',
          site_id: 'target', visible_context: projectedVisible }) }) : { ok: true } });
  const denied = await committer.commit({ plan: await sealedPlan('denied', false, conditionRef), created_at_turn: 1 });
  assert.equal(denied.ok, false);
  assert.equal((await pool.query(`SELECT count(*)::int AS n FROM party_runtime.party_route_plans`)).rows[0].n, 0);
  availabilityOpen = true;
  capabilityDigest = 'changed';
  assert.equal((await committer.commit({ plan: await sealedPlan('changed-capability', false, conditionRef),
    created_at_turn: 1 })).ok, false);
  capabilityDigest = 'capability-digest';
  projectedVisible = { ...visible, visible_scene: 'Сцена изменилась.' };
  assert.equal((await committer.commit({ plan: await sealedPlan('changed-visibility', false, conditionRef),
    created_at_turn: 1 })).ok, false);
  projectedVisible = visible;
  const invalid = await committer.commit({ plan: await sealedPlan('invalid', true, conditionRef), created_at_turn: 1 });
  assert.equal(invalid.ok, false);
  assert.equal((await pool.query(`SELECT count(*)::int AS n FROM party_runtime.party_route_plans`)).rows[0].n, 0);
  const [first, second] = await Promise.all([
    committer.commit({ plan: await sealedPlan('travel-a', false, conditionRef), created_at_turn: 1 }),
    committer.commit({ plan: await sealedPlan('travel-b', false, conditionRef), created_at_turn: 1 })]);
  assert.equal([first.ok, second.ok].filter(Boolean).length, 1, JSON.stringify([first, second]));
  const winner = first.ok ? 'travel-a' : 'travel-b';
  assert.equal((await committer.commit({ plan: await sealedPlan(winner, false, conditionRef), created_at_turn: 1 })).replay, true);
  assert.equal((await pool.query(`SELECT scene_position_id,state_version FROM party_runtime.party_journey_locations
    WHERE id='journey'`)).rows[0].scene_position_id, 'target-pos');
  const execution = (await pool.query(`SELECT status,state_version FROM party_runtime.party_route_plan_executions`)).rows;
  assert.deepEqual(execution.map(({ status, state_version }) => [status, Number(state_version)]), [['completed', 3]]);
  assert.equal((await pool.query(`SELECT count(*)::int AS n FROM party_runtime.party_action_step_runs`)).rows[0].n, 1);
});
