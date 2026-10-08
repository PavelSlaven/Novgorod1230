import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';
import pg from 'pg';
import { createTemporalAdvanceOwner } from '@rus/turn/temporal-advance';
import { buildCombinedWritePlan } from '@rus/turn/spatial-v3-write-plan';
import { integrateSpatialV3TemporalWriteFragments } from '@rus/turn/spatial-v3-temporal-write-integration';
import { createNpcRoutineState, npcRoutineActivity, selectNpcRoutineSchedule } from
  '@rus/npc-runtime';
import { computeSpatialV3CanonicalDigest as digest } from '@rus/contracts/spatial-v3/registry';
import { createPostgresTestBackend } from '../fixtures/postgres-test-backend.js';
import { createSpatialV3PostgresCombinedAtomicCommitter } from
  '../../apps/game-server/src/infrastructure/postgres/spatial-v3-combined-atomic-committer.js';
import { loadTracePhase2TemporalSourceProof } from
  '../../apps/game-server/src/infrastructure/postgres/lower-dvina-trace-phase-2-temporal-state.js';
import { createTracePhase2TemporalAdvance } from
  '../../apps/game-server/src/runtime/lower-dvina-trace-phase-2-temporal.js';
import { lowerDvinaTracePhase6TemporalEffectRegistrations } from
  '../../apps/game-server/src/runtime/lower-dvina-trace-phase-6-temporal-effect-owner.js';
import { lowerDvinaTraceTemporalSourceRegistrations } from
  '../../apps/game-server/src/runtime/lower-dvina-trace-phase-6-temporal-source.js';
import { npcRoutineCandidate, npcRoutineTemporalRegistration } from
  '../../apps/game-server/src/runtime/npc-routine-temporal.js';
import { runPartyRuntimeCatalogMigration } from
  '../../tools/runtime-catalog-activation/src/forward-migrations.js';

const partyId = 'npc-routine-return-no-route-party';
const at = (whole_minutes) => ({ whole_minutes: String(whole_minutes),
  subminute_numerator: '0', subminute_denominator: '1' });
const ref = (entity_kind, entity_id) => ({ entity_kind, entity_id });

test('persisted NPC arrival in another PF needs route before home presence returns', async (t) => {
  const backend = await createPostgresTestBackend('npc_routine_return');
  if (!backend) return t.skip('No supported PostgreSQL test backend');
  const pool = new pg.Pool({ connectionString: backend.partyUrl, max: 1 });
  t.after(async () => { await pool.end(); await backend.close(); });

  const schemaFiles = (await readdir('schemas/party-db'))
    .filter((name) => /^\d+.*\.sql$/u.test(name)).sort();
  for (const file of schemaFiles) {
    if (file.startsWith('012_')) await runPartyRuntimeCatalogMigration(pool);
    await pool.query(await readFile(`schemas/party-db/${file}`, 'utf8'));
  }
  await seedWorld(pool);

  const temporalAdvanceOwner = createTemporalAdvanceOwner({
    source_registrations: lowerDvinaTraceTemporalSourceRegistrations([
      npcRoutineTemporalRegistration()
    ]),
    effect_registrations: lowerDvinaTracePhase6TemporalEffectRegistrations()
  });
  const advance = createTracePhase2TemporalAdvance({ temporalAdvanceOwner,
    contracts: { activity: { nearest_temporal_boundary_rule: 'split_before_earliest_boundary' } } });
  const committer = createSpatialV3PostgresCombinedAtomicCommitter({ pool,
    recheck: async () => ({ ok: true }) });

  let proof = await loadTracePhase2TemporalSourceProof(pool, partyId);
  let state = temporalState(proof, 0, at(0));
  const departure = await advanceAndCommit({ advance, committer, state,
    elapsedMinutes: 60, turnNumber: 1 });
  proof = await loadTracePhase2TemporalSourceProof(pool, partyId);
  state = temporalState(proof, 1, departure.clock_after);

  assert.deepEqual(proof.npc_schedule_runtime.map((row) =>
    row.causal_state_ref.routine_state.movement_execution?.status), ['active', 'active'],
  'both approved schedules start the home-to-yard handoff at its boundary');

  const arrival = await advanceAndCommit({ advance, committer, state,
    elapsedMinutes: 12, turnNumber: 2 });
  const yardProof = await loadTracePhase2TemporalSourceProof(pool, partyId);
  const noRoute = findNpc(yardProof, 'npc-no-return-route');
  const controlled = findNpc(yardProof, 'npc-authorized-return');
  const arrivalTransitions = proposalTransitions(arrival.result);
  const noRouteArrival = arrivalTransitions.find(({ npc_id }) => npc_id === noRoute.npc_id);
  assert.equal(noRouteArrival.proposal.movement_transition.status, 'completed');
  assert.equal(noRouteArrival.after.last_completed_movement.destination_position_node_id,
    'position-yard');
  assert.equal(noRouteArrival.proposal.movement_transition.route_ref, 'home-yard');
  assert.equal(noRouteArrival.after.current_position_node_id, 'position-yard');
  assert.equal(noRouteArrival.after.causal_state_ref.routine_state.presence_state, 'on_site');
  assert.deepEqual(noRoute.last_completed_movement, {
    destination_position_node_id: 'position-yard',
    destination_location_ref: 'pf_yard',
    completed_at: at(72)
  }, 'fresh database readback carries the actual yard arrival as current movement evidence');
  assert.equal(noRoute.npc_placement.position_node_id, 'position-yard');
  assert.equal(noRoute.causal_state_ref.routine_state.presence_state, 'on_site');
  assert.equal((await pool.query(`SELECT position_node_id FROM party_runtime.entity_placements
    WHERE party_id=$1 AND entity_kind='npc' AND entity_id=$2`,
  [partyId, noRoute.npc_id])).rows[0].position_node_id, 'position-yard');

  assert.deepEqual(arrival.plan.updates.filter((write) =>
    write.target_table === 'entity_placements' && write.id === `npc:${noRoute.npc_id}`)
    .map((write) => write.record.position_node_id), ['position-yard'],
  'arrival writes only the completed home-to-yard destination, never a speculative home return');

  const yardState = temporalState(yardProof, 2, arrival.clock_after);
  const returnBoundary = await advanceAndCommit({ advance, committer, state: yardState,
    elapsedMinutes: 60, turnNumber: 3 });
  const returnProof = await loadTracePhase2TemporalSourceProof(pool, partyId);
  const noRouteReturn = proposalTransitions(returnBoundary.result)
    .find(({ npc_id }) => npc_id === noRoute.npc_id);
  const authorizedReturn = proposalTransitions(returnBoundary.result)
    .find(({ npc_id }) => npc_id === controlled.npc_id);
  assert.equal(noRouteReturn.proposal.movement_transition, null);
  assert.equal(noRouteReturn.after.causal_state_ref.routine_state.presence_state, 'location_gap');
  assert.equal(noRouteReturn.after.current_position_node_id, 'position-yard');
  assert.equal(noRouteReturn.after.npc_placement.position_node_id, 'position-yard');
  assert.equal(noRouteReturn.after.causal_state_ref.routine_state.schedule_gap_reason,
    'npc_location_gap');
  assert.deepEqual(returnBoundary.plan.updates.filter((write) =>
    write.target_table === 'entity_placements' && write.id === `npc:${noRoute.npc_id}`), [],
  'home intent without route produces no physical placement write');
  const returnedNoRoute = findNpc(returnProof, noRoute.npc_id);
  assert.equal(returnedNoRoute.causal_state_ref.routine_state.presence_state, 'location_gap');
  assert.equal(returnedNoRoute.current_position_node_id, 'position-yard');
  assert.equal(returnedNoRoute.npc_placement.position_node_id, 'position-yard');
  assert.deepEqual(returnedNoRoute.last_completed_movement, noRoute.last_completed_movement);
  assert.equal(authorizedReturn.proposal.movement_transition.status, 'started');
  assert.equal(authorizedReturn.proposal.movement_transition.route_ref, 'yard-home');
  assert.equal(authorizedReturn.after.current_position_node_id, 'position-yard');
  assert.equal(authorizedReturn.after.causal_state_ref.routine_state.presence_state, 'on_site');

  const returnState = temporalState(returnProof, 3, returnBoundary.clock_after);
  const returned = await advanceAndCommit({ advance, committer, state: returnState,
    elapsedMinutes: 12, turnNumber: 4 });
  const homeProof = await loadTracePhase2TemporalSourceProof(pool, partyId);
  const homeNoRoute = findNpc(homeProof, noRoute.npc_id);
  const homeControl = findNpc(homeProof, controlled.npc_id);
  assert.equal(homeNoRoute.causal_state_ref.routine_state.presence_state, 'location_gap');
  assert.equal(homeNoRoute.npc_placement.position_node_id, 'position-yard');
  const controlTransition = proposalTransitions(returned.result)
    .find(({ npc_id }) => npc_id === controlled.npc_id);
  assert.equal(controlTransition.proposal.movement_transition.status, 'completed');
  assert.equal(controlTransition.proposal.movement_transition.route_ref, 'yard-home');
  assert.equal(controlTransition.after.current_position_node_id, 'position-home');
  assert.equal(controlTransition.after.causal_state_ref.routine_state.presence_state, 'on_site');
  assert.equal(homeControl.last_completed_movement.destination_location_ref, 'pf_home');
  assert.equal(homeControl.npc_placement.position_node_id, 'position-home');
  assert.equal((await pool.query(`SELECT position_node_id FROM party_runtime.entity_placements
    WHERE party_id=$1 AND entity_kind='npc' AND entity_id=$2`,
  [partyId, controlled.npc_id])).rows[0].position_node_id, 'position-home');
});

async function seedWorld(pool) {
  await pool.query(`INSERT INTO party_runtime.parties
    (party_id,schema_version,world_revision_id,world_catalog_digest,materializer_version,
     rng_version,command_catalog_digest,profile_bundle_digest,state_version,status)
    VALUES ($1,2,'routine-test-world','catalog','test','test','commands','profiles',0,'active')`, [partyId]);
  await pool.query(`INSERT INTO party_runtime.party_clocks
    (party_id,whole_minutes,subminute_numerator,subminute_denominator,
     clock_owner_kind,clock_owner_id,state_version,updated_change_set_id)
    VALUES ($1,0,0,1,'party',NULL,1,'seed')`, [partyId]);
  await pool.query(`INSERT INTO party_runtime.party_materialization_runs
    (party_id,run_id,g4_id,run_kind,occurrence,seed_digest,input_digest,catalog_digest,
     materializer_version,rng_version,result_digest,idempotency_key,status)
    VALUES ($1,'run','g4','baseline',0,'seed','input','catalog','test','test','result','seed','committed')`, [partyId]);
  await pool.query(`INSERT INTO party_runtime.party_g5_sites
    (id,party_id,origin,parent_g4_id,canonical_g5_ref,status,state_version,
     created_change_set_id,updated_change_set_id)
    VALUES ('site',$1,'canonical','g4','{"entity_id":"g5"}','active',1,'seed','seed')`, [partyId]);
  await pool.query(`INSERT INTO party_runtime.party_scene_baselines
    (id,party_id,host_kind,host_id,source_kind,scene_template_ref,materialization_trace_id,
     materializer_version,catalog_digest,status,state_version,created_change_set_id,updated_change_set_id)
    VALUES ('baseline',$1,'g5_site','site','canonical_template',
      '{"entity_id":"template","authoring_version":"1"}','trace','test','catalog',
      'active',1,'seed','seed')`, [partyId]);
  await pool.query(`INSERT INTO party_runtime.party_g6_instances
    (id,party_id,scene_baseline_id,source_scene_template_ref,scene_slot_key,host_kind,host_id,
     physical_class_id,primary_scene_role_id,vertical_context_id,overhead_cover_id,
     intra_g6_visibility_mode,default_visibility_distance_band,acoustic_uniformity,status,
     state_version,created_change_set_id,updated_change_set_id)
    VALUES ('g6',$1,'baseline','{"entity_id":"template","authoring_version":"1"}',
      'g6','g5_site','site','room','main','ground','covered','default_clear','near',
      'uniform','active',1,'seed','seed')`, [partyId]);
  await pool.query(`INSERT INTO party_runtime.scene_position_nodes
    (id,party_id,g6_instance_id,position_type_id,template_slot_key,template_instance_ordinal,
     capacity,access_class_id,status,state_version,created_change_set_id,updated_change_set_id)
    VALUES ('position-home',$1,'g6','ground','home',0,4,'open','active',1,'seed','seed'),
      ('position-yard',$1,'g6','ground','yard',0,4,'open','active',1,'seed','seed')`, [partyId]);
  await pool.query(`INSERT INTO party_runtime.party_npcs
    (party_id,npc_id,run_id,profile_set_id,profile_level,anchor_id,machine_state,semantic_state)
    VALUES ($1,'npc-no-return-route','run','profiles','background',NULL,'{}',
      '{"location_profile_ref":"pf_home","source_binding":{"world_revision_id":"routine-test-world"}}'),
      ($1,'npc-authorized-return','run','profiles','background',NULL,'{}',
      '{"location_profile_ref":"pf_home","source_binding":{"world_revision_id":"routine-test-world"}}')`, [partyId]);
  for (const [endpointId, positionId] of [['home-endpoint', 'position-home'],
    ['yard-endpoint', 'position-yard']]) {
    await pool.query(`INSERT INTO party_runtime.party_world_route_endpoint_position_bindings
      (id,party_id,source_endpoint_binding_ref,scene_baseline_id,g5_site_id,position_id,status,
       state_version,activated_change_set_id)
      VALUES ($1,$2,$3::jsonb,'baseline','site',$4,'active',1,'seed')`,
    [`binding:${endpointId}`, partyId,
      JSON.stringify({ entity_id: endpointId, authoring_version: '1' }), positionId]);
  }
  for (const npcId of ['npc-no-return-route', 'npc-authorized-return']) {
    const hasReturnRoute = npcId === 'npc-authorized-return';
    const profile = routineProfile(npcId, hasReturnRoute);
    const calendar = testCalendar();
    const schedule = selectNpcRoutineSchedule({ schedule_context: {
      home_scope_ref: 'pf_home', subject_kind: 'occupation',
      subject_ref: 'nov_occ_worker', day_type: 'normal',
      approved_rule_rows: [scheduleRow('cold', profile), scheduleRow('warm', profile)],
      calendar_profile: calendar
    }, scheduled_at: at(0) });
    const selectedProfile = schedule.rule.routine_profile;
    const runtime = structuredClone(createNpcRoutineState({
      profile: selectedProfile, started_at: at(0),
      calendar_profile: calendar, current_activity: { activity_ref: 'work' },
      schedule_context: schedule.schedule_context }));
    runtime.presence_state = 'on_site';
    const activity = npcRoutineActivity(runtime);
    await pool.query(`UPDATE party_runtime.party_npcs SET machine_state=$3::jsonb
      WHERE party_id=$1 AND npc_id=$2`, [partyId, npcId, JSON.stringify({ status: 'idle',
      current_activity: activity, current_activity_ref: activity.activity_ref })]);
    const causal = { routine_state: runtime };
    const scheduleRef = { entity_ref: ref('activity_profile', selectedProfile.profile_id),
      authoring_version: String(selectedProfile.revision) };
    const pins = { pins: [{ dependency_role: 'profile', entity_ref: scheduleRef.entity_ref,
      version_pin: { pin_kind: 'authoring_version',
        authoring_version: scheduleRef.authoring_version } }] };
    pins.canonical_digest = digest(pins);
    await pool.query(`INSERT INTO party_runtime.party_npc_spatial_schedules
      (id,party_id,npc_id,current_position_node_id,schedule_profile_ref,dependency_pins,
       causal_state_ref,status,state_version,next_transition_at_whole_minutes,
       next_transition_at_subminute_numerator,next_transition_at_subminute_denominator,
       current_activity_execution_id,attention_state_ref,body_state_ref,knowledge_state_ref,
       relationship_state_ref,updated_change_set_id)
      VALUES ($1,$2,$3,'position-home',$4::jsonb,$5::jsonb,$6::jsonb,'active',1,
        $7,0,1,NULL,$8::jsonb,$9::jsonb,$10::jsonb,$11::jsonb,'seed')`,
    [`schedule:${npcId}`, partyId, npcId, JSON.stringify(scheduleRef), JSON.stringify(pins),
      JSON.stringify(causal), runtime.next_transition_at.whole_minutes,
      JSON.stringify(ref('condition_set', 'attention')),
      JSON.stringify(ref('body_state', 'body')),
      JSON.stringify(ref('knowledge_fact', 'knowledge')),
      JSON.stringify(ref('condition_set', 'relations'))]);
    await pool.query(`INSERT INTO party_runtime.entity_placements
      (party_id,entity_kind,entity_id,placement_kind,position_node_id,occupies_capacity_units,
       state_version,updated_change_set_id)
      VALUES ($1,'npc',$2,'scene_position','position-home',1,1,'seed')`, [partyId, npcId]);
    await pool.query(`INSERT INTO party_runtime.party_npc_runtime_transitions
      (transition_id,party_id,npc_id,transition_kind,event_id,change_set_id,idempotency_record_id,
       occurred_at_whole_minutes,occurred_at_subminute_numerator,
       occurred_at_subminute_denominator,trace)
      VALUES ($1,$2,$3,'routine_transition',NULL,'seed',$4,0,0,1,$5::jsonb)`,
    [`seed-arrival:${npcId}`, partyId, npcId, `seed-arrival:${npcId}`,
      JSON.stringify({ movement: { status: 'completed', destination_position_node_id: 'position-home',
        destination_location_ref: 'pf_home' } })]);
  }
}

function routineProfile(npcId, hasReturnRoute) {
  const phases = [
    { state_id: 'work-home', duration_minutes: 60, activity_ref: 'work',
      summary: 'Работает.', activity_status: 'active', runtime_status: 'available',
      can_continue_automatically: true, decision_required: false,
      presence_state: 'on_site', location_ref: 'pf_home' },
    { state_id: 'arrive-yard', duration_minutes: 12, activity_ref: 'walk-yard',
      summary: 'Идёт во двор.', activity_status: 'active', runtime_status: 'unavailable',
      can_continue_automatically: true, decision_required: false,
      presence_state: 'on_site', location_ref: 'pf_yard',
      movement_handoff: { route_ref: 'home-yard', source_endpoint_ref: 'home-endpoint',
        destination_endpoint_ref: 'yard-endpoint', destination_location_ref: 'pf_yard',
        duration_minutes: 12 } },
    { state_id: 'yard', duration_minutes: 60, activity_ref: 'wait-yard',
      summary: 'Ждёт во дворе.', activity_status: 'active', runtime_status: 'available',
      can_continue_automatically: true, decision_required: false,
      presence_state: 'on_site', location_ref: 'pf_yard' },
    { state_id: 'return-home', duration_minutes: 12, activity_ref: 'return',
      summary: 'Возвращается домой.', activity_status: 'active',
      runtime_status: hasReturnRoute ? 'unavailable' : 'available',
      can_continue_automatically: true, decision_required: false,
      presence_state: 'on_site', location_ref: 'pf_home' }
  ];
  if (hasReturnRoute) phases[3].movement_handoff = {
    route_ref: 'yard-home', source_endpoint_ref: 'yard-endpoint',
    destination_endpoint_ref: 'home-endpoint', destination_location_ref: 'pf_home',
    duration_minutes: 12
  };
  return { schema: 'npc_routine_profile_v1', profile_id: `routine:${npcId}`,
    revision: 1, status: 'approved', phases };
}

function scheduleRow(season, routine_profile) {
  return { schedule_id: `schedule-${season}`, schedule_version: 1,
    world_revision_id: 'routine-test-world', scope_kind: 'place_family',
    scope_ref: 'pf_home', subject_kind: 'occupation', subject_ref: 'nov_occ_worker',
    season, months: null, day_type: 'normal', status: 'approved', routine_profile };
}

function testCalendar() {
  return { profile_id: 'npc-calendar', version: '1', status: 'approved',
    provenance: { source_id: 'test', source_version: '1' },
    epoch: { game_timestamp: at(0), year: '1', month: '1', day: '1' },
    calendar_system: 'test', month_rules: { month_lengths: ['30', '30'] },
    leap_rules: { cycle_years: '4', leap_year_indexes: ['3'], leap_month: '2', leap_days: '1' },
    day_start_rule: { local_minute: '360' }, local_offset_rule: { offset_minutes: '0' },
    daypart_rule: { ranges: [{ id: 'night', start_minute: '0', end_minute: '360' },
      { id: 'day', start_minute: '360', end_minute: '1080' },
      { id: 'evening', start_minute: '1080', end_minute: '1440' }] },
    season_rule: { ranges: [{ id: 'cold', start_day: '1', end_day: '30' },
      { id: 'warm', start_day: '31', end_day: '61' }] },
    daylight_rule: { ranges: [{ id: 'dark', start_day: '1', end_day: '30' },
      { id: 'light', start_day: '31', end_day: '61' }] } };
}

function temporalState(proof, turnNumber, clock) {
  return { party_id: partyId, party_state: { state_version: turnNumber,
    turn_number: turnNumber }, clock, npcs: [],
  npc_schedule_runtime: structuredClone(proof.npc_schedule_runtime),
  temporal_boundary_candidates: structuredClone(proof.candidates),
  temporal_source_proof: proof };
}

async function advanceAndCommit({ advance, committer, state, elapsedMinutes, turnNumber }) {
  const result = await advance({ clock_before: state.clock, relevant_state: state,
    change_set_id: `return-no-route-turn-${turnNumber}`,
    exact_elapsed: { exact_minutes: { numerator: String(elapsedMinutes), denominator: '1' } } });
  const plan = await commitPlan(state, result, turnNumber);
  const committed = await committer.commit({ plan, created_at_turn: turnNumber });
  assert.equal(committed.ok, true, JSON.stringify(committed.error));
  return { result, plan, clock_after: result.clock_after };
}

function proposalTransitions(result) {
  return result.temporal_results.flatMap((temporal) =>
    temporal.combined_change_set.proposals ?? [])
    .map((proposal) => proposal.npc_routine_transition).filter(Boolean);
}

function findNpc(proof, npcId) {
  const row = proof.npc_schedule_runtime.find((candidate) => candidate.npc_id === npcId);
  assert.ok(row, `missing readback for ${npcId}`);
  return row;
}

async function commitPlan(state, advance, turnNumber) {
  const partyClock = advance.clock_after;
  const changeSetId = `return-no-route-turn-${turnNumber}`;
  const idemId = `return-no-route-commit-${turnNumber}`;
  const visible = { schema: 'temporal_visible_package.v1', perceived_scene: 'Двор.',
    perceived_changes: [], sensory_details: [], visible_npcs: [], visible_objects: [],
    known_context: [], uncertainties: [], hypotheses: [], player_safe_interruption: null,
    allowed_action_affordances: [] };
  const pins = [{ dependency_role: 'source_authoring',
    entity_ref: ref('world_revision', 'routine-test-world'),
    version_pin: { pin_kind: 'authoring_version', authoring_version: '1', state_version: null } }];
  const base = { plan_id: `return-no-route-plan-${turnNumber}`, party_id: partyId,
    write_plan_kind: 'semantic_commit', operation_kind: 'trace_turn_step',
    canonical_input_digest: digest({ id: `return-no-route-turn-${turnNumber}` }),
    expected_state_versions: [{ target_table: 'parties', id: partyId,
      state_version: turnNumber - 1 }, { target_table: 'party_clocks', id: partyId,
      state_version: turnNumber }],
    validation_report: { status: 'pass', digest: digest({ valid: true }) },
    change_set: { id: changeSetId }, idempotency: { id: idemId, key: idemId,
      request_id: null, semantic_command_snapshot: null, semantic_command_digest: null,
      semantic_dependency_pins: null },
    visible_package_envelope: { package_id: `return-no-route-visible-${turnNumber}`,
      party_id: partyId, turn_id: changeSetId, committed_state_version: String(turnNumber),
      change_set_id: changeSetId, package_digest: digest(visible), visible_payload: visible,
      presentation_status: 'pending', projection_policy_ref: {
        entity_ref: ref('visibility_modifier', 'routine-test'), authoring_version: '1' },
      dependency_pins: { pins, canonical_digest: digest(pins).replace('sha256:', '') },
      idempotency_record_id: idemId },
    approved_write_sets: [{ inserts: [], deletes: [], updates: [
      { target_table: 'parties', id: partyId, record: { party_id: partyId, status: 'active' } },
      { target_table: 'party_clocks', id: partyId, record: { party_id: partyId,
        whole_minutes: partyClock.whole_minutes,
        subminute_numerator: partyClock.subminute_numerator,
        subminute_denominator: partyClock.subminute_denominator,
        updated_change_set_id: changeSetId } }
    ], appends: [{ target_table: 'party_v3_change_sets', id: changeSetId,
      record: { id: changeSetId, party_id: partyId, operation_kind: 'trace_turn_step',
        idempotency_record_id: idemId } }] }],
    lock_context: { owner_keys: [], execution_keys: [], g4_keys: [], physical_keys: [
      `party_runtime.parties:${partyId}`, `party_runtime.party_clocks:${partyId}`,
      `party_runtime.party_v3_change_sets:${changeSetId}`] },
    commit_rechecks: ['physical', 'state', 'pin', 'endpoint', 'route', 'capacity', 'time', 'change_set']
      .map((kind) => ({ kind, digest: digest({ kind }) })) };
  const integrated = integrateSpatialV3TemporalWriteFragments({ base_write_plan_input: base,
    temporal_result: advance.temporal_results[0] ?? {} });
  assert.equal(integrated.ok, true, JSON.stringify(integrated.error));
  const built = await buildCombinedWritePlan(integrated.input,
    { verifyApproval: async () => ({ ok: true }) });
  assert.equal(built.ok, true, JSON.stringify(built.error));
  return built.plan;
}
