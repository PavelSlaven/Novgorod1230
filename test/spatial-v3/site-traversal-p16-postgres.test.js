import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import pg from 'pg';
import { canonicalDigest } from '@rus/materialization';
import { createTemporalAdvanceOwner } from '@rus/turn/temporal-advance';
import { computeSpatialV3CanonicalDigest as digest } from '@rus/contracts/spatial-v3/registry';
import { buildCombinedWritePlan } from '../../packages/turn/src/spatial-v3-write-plan.js';
import { testContainerLabel } from '../helpers/test-containers.js';
import { createSpatialV3PostgresCombinedAtomicCommitter } from
  '../../apps/game-server/src/infrastructure/postgres/spatial-v3-combined-atomic-committer.js';
import { SPATIAL_V3_TARGET_MIGRATIONS } from
  '../../apps/game-server/src/infrastructure/postgres/spatial-v3-target-migrations.js';
import { applySiteTraversalTransition, siteTraversalWrites } from
  '../../apps/game-server/src/infrastructure/postgres/spatial-v3-site-traversal-commit.js';
import { buildLowerDvinaTraceTurnStepRootWrites } from
  '../../apps/game-server/src/infrastructure/postgres/lower-dvina-trace-turn-step-state.js';
import { recheckSiteConnectionTraversal } from
  '../../apps/game-server/src/infrastructure/postgres/first-playable/recheck-site-connection-traversal.js';
import { readCurrentSceneSnapshot } from
  '../../apps/game-server/src/infrastructure/postgres/g4-natural-perception-reader.js';
import { createSpatialV3SiteTraversalRuntime } from
  '../../apps/game-server/src/runtime/spatial-v3-site-traversal-runtime.js';
import { createSpatialV3LocalSceneRuntime } from
  '../../apps/game-server/src/runtime/spatial-v3-local-scene-runtime.js';
import { createTracePhase2TemporalAdvance } from
  '../../apps/game-server/src/runtime/lower-dvina-trace-phase-2-temporal.js';
import { createTracePhase3TemporalAdvance } from
  '../../apps/game-server/src/runtime/lower-dvina-trace-phase-3-effects.js';

const docker = (args) => spawnSync('docker', args, { encoding: 'utf8', timeout: 45_000 });
const ref = (entity_id) => ({ entity_id, authoring_version: '1' });
const key = (row) => `party_runtime.${row.target_table}:${row.id}`;
const condition = ref('availability.local_state_conditional');
const visible = { version: 1, schema: 'visible_context_package',
  visible_scene: 'Новая поляна.', visible_changes: [], sensory_details: [],
  visible_npc: [], visible_objects: [], known_context: [], uncertainties: [],
  allowed_tensions: [], do_not_imply: [] };

const rational = (numerator, denominator = '1') => ({ numerator, denominator });
const turnFor = (key) => Number.parseInt(digest(key).slice(7, 13), 16) % 100_000 + 1;
const versioned = (entity_id) => ({ entity_id, authoring_version: '1' });
const active = (id, extra = {}) => ({ id, party_id: 'p', status: 'active', state_version: 1, ...extra });
const capabilityPins = [{ dependency_role: 'source_authoring',
  entity_ref: { entity_kind: 'world_revision', entity_id: 'world' },
  version_pin: { pin_kind: 'authoring_version', authoring_version: '1', state_version: null } }];
const capability = { cohort_membership_snapshot_pin: null, load_state_pin: null,
  root_carrier_attachment_pins: null, allowed_movement_methods: ['movement.walk'],
  available_transport_pins: null, equipment_state_pins: null, legal_access_fact_pins: null,
  allowed_pace_modes: [], dependency_pins: {
    pins: capabilityPins, canonical_digest: digest(capabilityPins).slice(7) } };
capability.canonical_digest = digest(capability);
const waveBinding = JSON.parse(readFileSync(new URL(
  '../../data/world-catalogs/novgorod/spatial-v3/candidates/m2c-lines-v1/datasets/spatial_v3_canonical_g5_connection_bindings.json',
  import.meta.url), 'utf8'))[0];
const waveLineKindProfile = JSON.parse(readFileSync(new URL(
  '../../data/world-catalogs/novgorod/spatial-v3/candidates/m2c-lines-v1/datasets/spatial_v3_line_kind_profiles.json',
  import.meta.url), 'utf8')).find((row) => row.id === waveBinding.line_kind_profile_id);
assert.ok(waveLineKindProfile, 'P16 fixture uses a real m2c-lines-v1 line-kind profile');
assert.equal(waveBinding.line_direction_id, undefined,
  'the selected real m2c-lines-v1 wave row has no direction');
const waveLineKindProfileRef = versioned(waveBinding.line_kind_profile_id);
const connection = active('connection', { from_site_id: 'source', to_site_id: 'target',
  passage_type_id: 'passage.local', cost_kind: 'time', action_units: null, base_minutes: 20,
  capacity: null, portal_entity_id: null, line_kind_id: waveLineKindProfile.line_kind_id,
  line_kind_profile_ref: waveLineKindProfileRef, line_name: waveBinding.line_name,
  line_discriminator: waveBinding.line_discriminator ?? null,
  line_direction_id: waveBinding.line_direction_id ?? null,
  baseline_movement_method_id: 'movement.walk',
  movement_method_cost_profile_ref: versioned('method-cost'),
  transition_environment_profile_ref: versioned('env'),
  movement_orientation_profile_ref: versioned('orientation'),
  dynamic_recheck_policy_ref: versioned('recheck'),
  source_canonical_connection_ref: versioned('canonical-connection'),
  availability_condition_set_ref: condition });
const profile = { id: 'profile', version: 1, status: 'approved', profile_scope: 'site_connection',
  passage_type_id: 'passage.local', cost_kind: 'time', action_units: null, base_minutes: 20,
  line_kind_id: waveLineKindProfile.line_kind_id,
  line_kind_profile_id: waveBinding.line_kind_profile_id,
  line_kind_profile_version: waveBinding.line_kind_profile_version,
  movement_method_cost_profile_id: 'method-cost', movement_method_cost_profile_version: 1,
  dynamic_recheck_policy_id: 'recheck', dynamic_recheck_policy_version: 1,
  transition_environment_profile_id: 'env', transition_environment_profile_version: 1,
  movement_orientation_profile_id: 'orientation', movement_orientation_profile_version: 1,
  availability_condition_set_ref: 'availability.local_state_conditional@1',
  capacity_semantics_ref: 'capacity.no_static_limit@1', canonical_digest: 'profile-digest' };
const sites = [active('source', { parent_g4_id: 'g4' }), active('target', { parent_g4_id: 'g4' })];
const baselines = [active('source-base', { host_kind: 'g5_site', host_id: 'source' }),
  active('target-base', { host_kind: 'g5_site', host_id: 'target' })];
const g6 = [active('source-g6', { scene_baseline_id: 'source-base', host_kind: 'g5_site', host_id: 'source' }),
  active('target-g6', { scene_baseline_id: 'target-base', host_kind: 'g5_site', host_id: 'target' })];
const positions = [active('source-pos', { g6_instance_id: 'source-g6', capacity: 4 }),
  active('approach-pos', { g6_instance_id: 'source-g6', capacity: 4 }),
  active('target-pos', { g6_instance_id: 'target-g6', capacity: 4 })];
const endpoints = [active('from', { site_connection_id: 'connection', endpoint_role: 'from',
  g5_site_id: 'source', position_id: 'approach-pos' }),
active('to', { site_connection_id: 'connection', endpoint_role: 'to',
  g5_site_id: 'target', position_id: 'target-pos' })];
const lineBinding = { site_connection_id: 'connection', authoring_version: 3,
  canonical_digest: 'line-digest', line_name: waveBinding.line_name,
  line_discriminator: waveBinding.line_discriminator ?? null,
  line_direction_id: waveBinding.line_direction_id ?? null,
  line_kind_profile_ref: `${waveBinding.line_kind_profile_id}@${waveBinding.line_kind_profile_version}`, base_minutes: 20,
  movement_method_id: 'movement.walk', method_factor: rational('3', '2'),
  movement_method_options: [{ movement_method_id: 'movement.walk', factor: rational('3', '2') }],
  dynamic_recheck_policy: { id: 'recheck', version: 1,
    policy_kind: 'fixed_time_interval', interval_minutes: 15 }, environment_factor: rational('3') };
const stateFor = (turnNumber) => ({ party_id: 'p', actor_id: 'actor',
  party_state: { state_version: 1, turn_number: turnNumber - 1, clock_state_version: 1 },
  clock: { whole_minutes: '120', subminute_numerator: '0', subminute_denominator: '1' },
  position: { position_id: 'source-pos', g4_id: 'g4' },
  journey_location: { id: 'journey', party_id: 'p', owner_kind: 'actor', owner_id: 'actor',
    location_kind: 'scene', scene_position_id: 'source-pos', state_version: 1 } });
const contextFor = () => ({ partyId: 'p', actorId: 'actor', world_revision_id: 'world',
  world_catalog_digest: 'catalog', location: stateFor().journey_location,
  position: positions[0], site: sites[0], baseline: baselines[0],
  approach_departure_position: positions[1],
  closure: { connection_profiles: [profile] }, snapshot: { sites, scene_baselines: baselines,
    g6_instances: g6, scene_positions: positions, endpoint_bindings: endpoints,
    line_bindings: [lineBinding] } });

async function traversal(change, invalidResult = false, conditionRef = condition, pool) {
  const localConnection = { ...connection, availability_condition_set_ref: conditionRef };
  const localProfile = { ...profile, availability_condition_set_ref: conditionRef == null
    ? null : profile.availability_condition_set_ref };
  const turnNumber = turnFor(change);
  const localContext = { ...contextFor(), closure: { connection_profiles: [localProfile] } };
  const current = { scene_position_id: 'source-pos', location_kind: 'scene', journey_version: 1,
    from_site_id: 'source', to_site_id: 'target', connection_status: 'active', connection_version: 1,
    cost_kind: 'time', action_units: null, base_minutes: 20,
    line_kind_id: waveLineKindProfile.line_kind_id,
    line_kind_profile_ref: localConnection.line_kind_profile_ref,
    line_name: waveBinding.line_name,
    line_discriminator: waveBinding.line_discriminator ?? null,
    line_direction_id: waveBinding.line_direction_id ?? null,
    baseline_movement_method_id: 'movement.walk',
    movement_method_cost_profile_ref: localConnection.movement_method_cost_profile_ref,
    transition_environment_profile_ref: localConnection.transition_environment_profile_ref,
    movement_orientation_profile_ref: localConnection.movement_orientation_profile_ref,
    dynamic_recheck_policy_ref: localConnection.dynamic_recheck_policy_ref,
    connection_capacity: null, portal_entity_id: null, availability_condition_set_ref: conditionRef,
    from_position: 'source-pos', from_site: 'source', from_binding_status: 'active', from_binding_version: 1,
    to_position: 'target-pos', to_site: 'target', to_binding_status: 'active', to_binding_version: 1,
    source_position_status: 'active', source_position_version: 1,
    destination_position_status: 'active', destination_position_version: 1, destination_capacity: 4,
    source_g6_status: 'active', source_g6_version: 1, destination_g6_status: 'active',
    destination_g6_version: 1, destination_g6_id: 'target-g6', source_baseline_status: 'active',
    source_baseline_version: 1, destination_baseline_status: 'active', destination_baseline_version: 1,
    destination_baseline_id: 'target-base', source_site_status: 'active', source_site_version: 1,
    destination_site_status: 'active', destination_site_version: 1, destination_g4_id: 'g4' };
  const prepare = createSpatialV3SiteTraversalRuntime({ pool,
  projectEnvironmentAtClock: () => ({ effects: { movement_factor: rational('3') } }),
  assessAvailability: async ({ connection, profile, connectionId, conditionSetRef }) => {
    const selectedConnection = connection?.id ?? connectionId;
    const selectedCondition = profile?.availability_condition_set_ref ?? conditionSetRef;
    return { ok: true, status: 'open', connection_id: selectedConnection,
      condition_set_ref: selectedCondition == null ? null
        : typeof selectedCondition === 'string' ? selectedCondition
          : `${selectedCondition.entity_id}@${selectedCondition.authoring_version}` };
  },
  assessMovementCapability: async () => ({ ok: true, actor_id: 'actor', capability_context: capability }),
  projectDestination: async () => ({ ok: true, position_id: 'target-pos',
    site_id: 'target', visible_context: visible }) });
  const localSceneRuntime = createSpatialV3LocalSceneRuntime({ pool });
  const localEdgePathProofs = await localSceneRuntime.prepareLocalLineApproach({
    partyId: 'p', actorId: 'actor', state: stateFor(turnNumber),
    orderedLocalEdgePath: [{ edge_id: 'approach-edge', from_position_id: 'source-pos',
      to_position_id: 'approach-pos' }] });
  const consequence = await prepare({ partyId: 'p', actorId: 'actor', requestId: change,
    state: stateFor(turnNumber), playerInput: { idempotency_key: change }, inputDigest: change,
    context: localContext, connection: localConnection, local_edge_path_proofs: localEdgePathProofs });
  return consequence;
}

async function sealedPlan(change, invalidResult = false, conditionRef = condition, pool) {
  const consequence = await traversal(change, invalidResult, conditionRef, pool);
  const turnNumber = consequence.spatial_v3_traversal.plan.created_at_turn;
  const changeSetId = consequence.spatial_v3_traversal.plan.created_change_set_id;
  const idemId = consequence.spatial_v3_traversal.result.idempotency_record_id;
  const prepared = siteTraversalWrites({ partyId: 'p', envelope: { consequence },
    changeSetId, idemId, turnNumber });
  if (invalidResult) {
    prepared.writes.appends.find((row) => row.target_table === 'party_traversal_interval_results')
      .record.result_kind = 'invalid';
  }
  const state = { ...stateFor(turnNumber), body_state: { active_conditions: [] } };
  const temporalState = { ...state, party_id: 'p',
    temporal_boundary_candidates: [],
    temporal_source_proof: { version: 2,
      schema: 'lower_dvina_trace_temporal_source_proof',
      owner: '@rus/time-events-history/temporal-boundaries',
      same_time_cascade_owner: '@rus/time-events-history/temporal-boundaries:resolveSameTimeCascade',
      admission_policy: 'pass_exact_candidates_to_temporal_activity_owner',
      pending_event_count: 0, active_schedule_count: 0, candidate_count: 0, candidates: [] } };
  const phase2Advance = createTracePhase2TemporalAdvance({
    contracts: { activity: { nearest_temporal_boundary_rule: 'split_before_earliest_boundary' } },
    temporalAdvanceOwner: createTemporalAdvanceOwner({})
  });
  const temporalUpdate = await createTracePhase3TemporalAdvance({ phase2Advance })({
    clock_before: state.clock,
    exact_elapsed: { exact_minutes: consequence.spatial_v3_traversal.clock_update.actual_elapsed },
    relevant_state: temporalState,
    consequence
  });
  assert.deepEqual(temporalUpdate.clock_after,
    consequence.spatial_v3_traversal.clock_update.world_time_after);
  const snapshot = structuredClone(state);
  applySiteTraversalTransition({ snapshot, state, consequence });
  const rootWrites = buildLowerDvinaTraceTurnStepRootWrites({
    partyId: 'p', state, snapshot,
    envelope: { root_turn_id: changeSetId,
      player_input: { request_id: change, idempotency_key: change },
      body_update: { applied: false, proposal: null },
      time_update: temporalUpdate,
      consequence },
    nextVersion: 2, turnNumber, changeSetId, idemId,
    pendingScreen: {}, clockChanged: true
  });
  const rootJourney = rootWrites.updates.filter((row) =>
    row.target_table === 'party_journey_locations');
  const rootClock = rootWrites.updates.filter((row) => row.target_table === 'party_clocks');
  assert.equal(rootJourney.length, 1);
  assert.equal(rootClock.length, 1);
  assert.equal(prepared.writes.updates.length, 0,
    'site traversal writer must leave journey ownership to the turn-step root');
  const writes = { inserts: prepared.writes.inserts, updates: [...rootJourney, ...rootClock],
    appends: [...rootWrites.appends.filter((row) => row.target_table === 'party_v3_change_sets'),
      ...prepared.writes.appends], deletes: [], rechecks: prepared.rechecks };
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
    expected_state_versions: [{ target_table: 'party_journey_locations', id: 'journey', state_version: 1 },
      { target_table: 'party_clocks', id: 'p', state_version: 1 }],
    validation_report: { status: 'pass', digest: digest(change) },
    idempotency: { id: idemId, key: change }, change_set: { id: changeSetId },
    visible_package_envelope: { package_id: `visible:${change}`, party_id: 'p', turn_id: change,
      committed_state_version: '1', change_set_id: changeSetId, package_digest: digest(payload),
      visible_payload: payload, presentation_status: 'pending',
      projection_policy_ref: { entity_ref: { entity_kind: 'visibility_modifier',
        entity_id: 'projection' }, authoring_version: '1' },
      dependency_pins: { pins, canonical_digest: digest(pins).slice(7) },
      idempotency_record_id: idemId },
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
    if (docker(['exec', name, 'pg_isready', '-h', '127.0.0.1', '-U', 'site']).status === 0) break;
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
    VALUES ($1,'p',$2,'ground','entry',0,4,'open','active',1,'seed','seed')`,
    [`${site}-pos`, `${site}-g6`]);
  }
  await pool.query(`INSERT INTO party_runtime.scene_position_nodes
    (id,party_id,g6_instance_id,position_type_id,template_slot_key,template_instance_ordinal,
      capacity,access_class_id,status,state_version,created_change_set_id,updated_change_set_id)
    VALUES ('approach-pos','p','source-g6','ground','approach',0,4,'open','active',1,'seed','seed');
    INSERT INTO party_runtime.scene_movement_edges
    (id,party_id,scene_baseline_id,source_scene_template_ref,source_edge_slot_key,
      from_position_id,to_position_id,passage_type_id,transition_environment_profile_ref,
      movement_orientation_profile_ref,cost_kind,action_units,reverse_edge_id,status,state_version,
      created_change_set_id,updated_change_set_id)
    VALUES ('approach-edge','p','source-base','{}','approach-edge','source-pos','approach-pos',
      'internal_passage','{}','{}','action',1,'approach-edge-reverse','active',1,'seed','seed'),
      ('approach-edge-reverse','p','source-base','{}','approach-edge-reverse','approach-pos','source-pos',
      'internal_passage','{}','{}','action',1,'approach-edge','active',1,'seed','seed');`);
  await pool.query(`INSERT INTO party_runtime.party_clocks
    (party_id,whole_minutes,subminute_numerator,subminute_denominator,clock_owner_kind,state_version,updated_change_set_id)
    VALUES ('p',120,0,1,'party',1,'seed')`);
  await pool.query(`INSERT INTO party_runtime.g5_site_connections
    (id,party_id,from_site_id,to_site_id,passage_type_id,transition_environment_profile_ref,
      movement_orientation_profile_ref,cost_kind,action_units,baseline_movement_method_id,
      movement_method_cost_profile_ref,base_minutes,dynamic_recheck_policy_ref,
      line_kind_id,line_kind_profile_ref,line_name,line_direction_id,
      source_canonical_connection_ref,availability_condition_set_ref,
      status,state_version,created_change_set_id,updated_change_set_id)
    VALUES ('connection','p','source','target','passage.local',$1,$2,'time',NULL,
      'movement.walk',$3,20,$4,$8,$5,$9,$10,$6,$7,
      'active',1,'seed','seed')`,
  [ref('env'), ref('orientation'), ref('method-cost'), ref('recheck'),
    waveLineKindProfileRef,
    { entity_id: 'canonical-connection', authoring_version: '1' }, conditionRef,
    waveLineKindProfile.line_kind_id, waveBinding.line_name,
    waveBinding.line_direction_id ?? null]);
  for (const role of ['from', 'to']) {
    const site = role === 'from' ? 'source' : 'target';
    await pool.query(`INSERT INTO party_runtime.party_site_connection_endpoint_bindings
      (id,party_id,site_connection_id,endpoint_role,g5_site_id,position_id,source_slot_key,
        status,state_version,activated_change_set_id)
      VALUES ($1,'p','connection',$2,$3,$4,'entry','active',1,'seed')`,
    [role, role, site, role === 'from' ? 'approach-pos' : `${site}-pos`]);
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
  let availabilityStatus = 'open';
  let capabilityDigest = capability.canonical_digest;
  let projectedVisible = visible;
  const availability = async ({ transaction, connectionId, conditionSetRef }) => {
    assert.ok(transaction?.query);
    return { ok: availabilityOpen, status: availabilityStatus, connection_id: connectionId,
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
  const denied = await committer.commit({ plan: await sealedPlan('denied', false, conditionRef, pool), created_at_turn: turnFor('denied') });
  assert.equal(denied.ok, false);
  assert.equal((await pool.query(`SELECT count(*)::int AS n FROM party_runtime.party_route_plans`)).rows[0].n, 0);
  availabilityOpen = true;
  availabilityStatus = 'closed'; // ok:true but not open: the recheck must refuse (F7)
  assert.equal((await committer.commit({ plan: await sealedPlan('closed-line', false, conditionRef, pool),
    created_at_turn: turnFor('closed-line') })).ok, false);
  availabilityStatus = 'open';
  capabilityDigest = 'changed';
  assert.equal((await committer.commit({ plan: await sealedPlan('changed-capability', false, conditionRef, pool),
    created_at_turn: turnFor('changed-capability') })).ok, false);
  capabilityDigest = capability.canonical_digest;
  projectedVisible = { ...visible, visible_scene: 'Сцена изменилась.' };
  assert.equal((await committer.commit({ plan: await sealedPlan('changed-visibility', false, conditionRef, pool),
    created_at_turn: turnFor('changed-visibility') })).ok, false);
  projectedVisible = visible;
  const invalid = await committer.commit({ plan: await sealedPlan('invalid', true, conditionRef, pool), created_at_turn: turnFor('invalid') });
  assert.equal(invalid.ok, false);
  assert.equal((await pool.query(`SELECT count(*)::int AS n FROM party_runtime.party_route_plans`)).rows[0].n, 0);
  const [planA, planB] = await Promise.all([
    sealedPlan('travel-a', false, conditionRef, pool),
    sealedPlan('travel-b', false, conditionRef, pool)]);
  const [first, second] = await Promise.all([
    committer.commit({ plan: planA, created_at_turn: turnFor('travel-a') }),
    committer.commit({ plan: planB, created_at_turn: turnFor('travel-b') })]);
  assert.equal([first.ok, second.ok].filter(Boolean).length, 1, JSON.stringify([first, second]));
  const winner = first.ok ? 'travel-a' : 'travel-b';
  assert.equal((await committer.commit({ plan: winner === 'travel-a' ? planA : planB,
    created_at_turn: turnFor(winner) })).replay, true);
  assert.equal((await pool.query(`SELECT scene_position_id,state_version FROM party_runtime.party_journey_locations
    WHERE id='journey'`)).rows[0].scene_position_id, 'target-pos');
  const execution = (await pool.query(`SELECT status,state_version FROM party_runtime.party_route_plan_executions`)).rows;
  assert.deepEqual(execution.map(({ status, state_version }) => [status, Number(state_version)]), [['completed', 8]]);
  const intervalRows = await pool.query(`SELECT travel_state_id,interval_ordinal,result_kind,
    actual_time_numerator,actual_time_denominator,actual_progress_after_ppm
    FROM party_runtime.party_traversal_interval_results ORDER BY interval_ordinal`);
  assert.equal(intervalRows.rowCount, 6);
  assert.ok(intervalRows.rows.every(({ travel_state_id }) => travel_state_id === 'site-travel:' + digest({
    partyId: 'p', inputDigest: winner, connection_id: 'connection',
    local_edge_path: ['approach-edge'] }).slice(7)));
  assert.deepEqual(intervalRows.rows.map(({ result_kind }) => result_kind),
    ['progressed', 'progressed', 'progressed', 'progressed', 'progressed', 'segment_completed']);
  assert.ok(intervalRows.rows.every(({ travel_state_id }) => typeof travel_state_id === 'string'
    && travel_state_id.length > 0));
  assert.ok(intervalRows.rows.every(({ actual_time_numerator, actual_time_denominator }) =>
    Number(actual_time_numerator) / Number(actual_time_denominator) === 15));
  assert.equal(intervalRows.rows.at(-1).actual_progress_after_ppm, 1000000);
  assert.deepEqual((await pool.query(`SELECT t.status,t.closed_result,t.segment_progress_ppm,t.mirrored,
    count(i.id)::int AS interval_count FROM party_runtime.traveller_travel_states t
    LEFT JOIN party_runtime.party_traversal_interval_results i ON i.travel_state_id=t.id
    GROUP BY t.id`)).rows[0], { status: 'closed', closed_result: 'completed',
      segment_progress_ppm: 1000000, mirrored: false, interval_count: 6 });
  const terminalEvent = (await pool.query(`SELECT event_kind,causal_result_ref
    FROM party_runtime.party_route_plan_execution_events ORDER BY event_ordinal DESC LIMIT 1`)).rows[0];
  assert.deepEqual(terminalEvent, { event_kind: 'completed', causal_result_ref: {
    entity_kind: 'party_traversal_interval_result', entity_id: (await pool.query(
      `SELECT id FROM party_runtime.party_traversal_interval_results
       ORDER BY interval_ordinal DESC LIMIT 1`)).rows[0].id } });
  assert.deepEqual((await pool.query(`SELECT whole_minutes,subminute_numerator,state_version
    FROM party_runtime.party_clocks WHERE party_id='p'`)).rows[0],
  { whole_minutes: '210', subminute_numerator: '0', state_version: '2' });
  const countsBeforeReplay = (await pool.query(`SELECT
    (SELECT count(*) FROM party_runtime.party_traversal_interval_results)::int AS intervals,
    (SELECT count(*) FROM party_runtime.party_route_plan_execution_events)::int AS events,
    (SELECT state_version FROM party_runtime.party_clocks WHERE party_id='p')::int AS clock_version`)).rows[0];
  assert.equal((await committer.commit({ plan: winner === 'travel-a' ? planA : planB,
    created_at_turn: 1 })).replay, true);
  assert.deepEqual((await pool.query(`SELECT
    (SELECT count(*) FROM party_runtime.party_traversal_interval_results)::int AS intervals,
    (SELECT count(*) FROM party_runtime.party_route_plan_execution_events)::int AS events,
    (SELECT state_version FROM party_runtime.party_clocks WHERE party_id='p')::int AS clock_version`)).rows[0], countsBeforeReplay);
});
