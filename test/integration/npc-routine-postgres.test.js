import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import pg from 'pg';
import { createTemporalAdvanceOwner } from '@rus/turn/temporal-advance';
import { createNpcRoutineState, npcRoutineActivity,
  selectNpcRoutineSchedule } from '@rus/npc-runtime';
import { nextCalendarSeasonBoundary } from '@rus/time-events-history/calendar';
import { subtractGameTimestamp } from '@rus/time-events-history';
import { buildCombinedWritePlan } from '@rus/turn/spatial-v3-write-plan';
import { integrateSpatialV3TemporalWriteFragments } from '@rus/turn/spatial-v3-temporal-write-integration';
import { computeSpatialV3CanonicalDigest as digest } from '@rus/contracts/spatial-v3/registry';
import { createSpatialV3PostgresCombinedAtomicCommitter } from '../../apps/game-server/src/infrastructure/postgres/spatial-v3-combined-atomic-committer.js';
import { createTracePhase2TemporalAdvance } from '../../apps/game-server/src/runtime/lower-dvina-trace-phase-2-temporal.js';
import { npcRoutineTemporalRegistration } from '../../apps/game-server/src/runtime/npc-routine-temporal.js';
import { lowerDvinaTracePhase6TemporalEffectRegistrations } from '../../apps/game-server/src/runtime/lower-dvina-trace-phase-6-temporal-effect-owner.js';
import { lowerDvinaTraceTemporalSourceRegistrations } from '../../apps/game-server/src/runtime/lower-dvina-trace-phase-6-temporal-source.js';
import { lowerDvinaTraceWorldSnapshot } from '../fixtures/lower-dvina-trace-world-snapshot.js';
import { MATERIALIZER_VERSION, RNG_VERSION } from '@rus/materialization';
import { createLowerDvinaTracePhase1ARepository } from '@rus/party-store/internal/lower-dvina-trace-phase-1a';
import { loadLowerDvinaTraceMaterializationBundle, materializeLowerDvinaTraceParty,
  createLowerDvinaTracePhase1APostcommitProjector } from '../../apps/game-server/src/internal/lower-dvina-trace-phase-1a.js';
import { createPostgresStage25Ports } from '../../apps/game-server/src/infrastructure/postgres/stage25.js';
import { readPartyDatabaseSchemaSnapshot } from '../../apps/game-server/src/infrastructure/postgres/lower-dvina-trace-phase-1b-snapshots.js';
import { loadTracePhase2TemporalSourceProof } from '../../apps/game-server/src/infrastructure/postgres/lower-dvina-trace-phase-2-temporal-state.js';
import { runPartyRuntimeCatalogMigration } from '../../tools/runtime-catalog-activation/src/forward-migrations.js';
import { lowerDvinaTracePhase1ADomainPin } from '../fixtures/lower-dvina-trace-phase-1a-domain-pin.mjs';
import { resolveFirstEntry } from '../../apps/game-server/src/infrastructure/postgres/lower-dvina-trace-phase-3-first-entry.js';
import { loadLowerDvinaTraceRevision33Publication } from '../../apps/game-server/src/internal/lower-dvina-trace-revision-32-publication.js';
import { testContainerLabel } from '../helpers/test-containers.js';

test('new game persists canonical offscene routines atomically and replays', async (t) => {
  let adminUrl = process.env.RUS_TEST_POSTGRES_ADMIN_URL;
  let ownedContainer = null;
  let admin = null, pool = null, database = null;
  const docker = (args) => spawnSync('docker', args, { encoding: 'utf8', timeout: 45_000 });
  t.after(async () => {
    if (pool) await pool.end();
    if (admin && database) await admin.query(`DROP DATABASE ${database}`);
    if (admin) await admin.end();
    if (ownedContainer) docker(['rm', '-fv', ownedContainer]);
  });
  if (!adminUrl) {
    const version = docker(['version']);
    if (version.error?.code === 'ENOENT') return t.skip('Docker executable is unavailable');
    assert.equal(version.status, 0,
      `Docker is installed but unavailable: ${version.stderr || version.error?.message}`);
    const name = `npc-routine-test-${process.pid}`;
    const started = docker(['run', ...testContainerLabel(), '-d', '--name', name,
      '-p', '127.0.0.1::5432', '-e', 'POSTGRES_PASSWORD=npc', '-e', 'POSTGRES_USER=npc',
      '-e', 'POSTGRES_DB=npc', 'postgres:16-alpine']);
    assert.equal(started.status, 0,
      `PostgreSQL test container did not start: ${started.stderr || started.error?.message}`);
    ownedContainer = name;
    let ready = false;
    for (let attempt = 0; attempt < 60; attempt += 1) {
      if (docker(['exec', name, 'pg_isready', '-h', '127.0.0.1', '-U', 'npc']).status === 0) {
        ready = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    assert.equal(ready, true, 'PostgreSQL container did not become ready');
    const exposedPort = docker(['port', name, '5432']);
    assert.equal(exposedPort.status, 0,
      `PostgreSQL test container port query failed: ${exposedPort.stderr || exposedPort.error?.message}`);
    const port = Number(exposedPort.stdout.match(/:(\d+)/)?.[1]);
    assert.ok(Number.isInteger(port) && port > 0, 'PostgreSQL test container did not expose a port');
    adminUrl = `postgresql://npc:npc@127.0.0.1:${port}/npc`;
  }
  admin = new pg.Pool({ connectionString: adminUrl });
  database = `npc_routine_test_${process.pid}_${Date.now()}`;
  await admin.query(`CREATE DATABASE ${database}`);
  const url = new URL(adminUrl); url.pathname = `/${database}`;
  pool = new pg.Pool({ connectionString: url.href });
  for (const file of (await readdir('schemas/party-db')).filter((name) => /^\d+.*\.sql$/u.test(name)).sort()) {
    if (file.startsWith('012_')) await runPartyRuntimeCatalogMigration(pool);
    await pool.query(await readFile(`schemas/party-db/${file}`, 'utf8'));
  }
  const bundle = await loadLowerDvinaTraceMaterializationBundle({ scenarioDefinitionRevision: 33 });
  const publication = await loadLowerDvinaTraceRevision33Publication();
  const schema = await readPartyDatabaseSchemaSnapshot(pool);
  const repository = createLowerDvinaTracePhase1ARepository({ query: pool.query.bind(pool) });
  const ports = createPostgresStage25Ports({ pool,
    postcommitProjector: createLowerDvinaTracePhase1APostcommitProjector({ repository }) });
  const request = { party_id: 'npc-routine-party', scenario_id: 'lower_dvina_trace_v1',
    scenario_definition_revision: publication.binding.scenario_definition_ref.revision,
    scenario_manifest_digest: publication.binding.phase_1a_manifest_ref.digest,
    world_revision_id: bundle.location_topology_set.spatial_source_ref.world_revision_id,
    world_catalog_digest: bundle.location_topology_set.spatial_source_ref.world_revision_catalog_digest,
    materializer_version: MATERIALIZER_VERSION, rng_algorithm_id: RNG_VERSION,
    seed_context: 'lower_dvina_trace_phase_1a_mikula_v1', idempotency_key: 'npc-routine-new-game',
    trigger: 'new_game', occurrence: 0, existing_party_state: { baseline_exists: false } };
  const input = { request, repository, stage25Ports: ports, partyDatabaseSchema: schema,
    domainCatalogPinLoader: async () => lowerDvinaTracePhase1ADomainPin(bundle),
    worldBaseReferenceSnapshot: { ...lowerDvinaTraceWorldSnapshot(), version: 1, schema: 'world_base_reference_snapshot',
      readonly_checksum: 'npc-routine-test-world', allowed_region_ids: [], allowed_graph_node_ids: [],
      allowed_graph_edge_ids: [], allowed_place_template_ids: [], allowed_npc_candidate_ids: [],
      allowed_item_profile_ids: [], allowed_container_profile_ids: [], allowed_property_rule_ids: [], allowed_source_ids: [] } };
  const committed = await materializeLowerDvinaTraceParty(input).catch((error) => {
    assert.fail(JSON.stringify(error.details?.committed?.concerns ?? error.message));
  });
  assert.equal(committed.status, 'committed');
  const initial = await repository.loadInternal(request.party_id);
  const schedules = (await pool.query('SELECT * FROM party_runtime.party_npc_spatial_schedules WHERE party_id=$1', [request.party_id])).rows;
  assert.equal(schedules.length, 6);
  assert.equal(schedules.filter((row) => row.status === 'active').length, 5);
  assert.ok(schedules.every((row) => row.current_position_node_id === null));
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM party_runtime.party_npc_schedules WHERE party_id=$1', [request.party_id])).rows[0].n, 0);
  const proof = await loadTracePhase2TemporalSourceProof(pool, request.party_id);
  assert.equal(proof.active_schedule_count, 5);
  assert.equal(proof.npc_schedule_runtime.length, 6);
  assert.equal((await materializeLowerDvinaTraceParty(input)).status, 'replayed');
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM party_runtime.party_npc_spatial_schedules WHERE party_id=$1', [request.party_id])).rows[0].n, 6);
  const temporalAdvanceOwner = createTemporalAdvanceOwner({
    source_registrations: lowerDvinaTraceTemporalSourceRegistrations([npcRoutineTemporalRegistration()]),
    effect_registrations: lowerDvinaTracePhase6TemporalEffectRegistrations() });
  const advance = createTracePhase2TemporalAdvance({ temporalAdvanceOwner,
    contracts: { activity: { nearest_temporal_boundary_rule: 'split_before_earliest_boundary' } } });
  const state = { party_id: request.party_id, party_state: { state_version: 0, turn_number: 0 },
    clock: committed.instance.timestamp, npcs: [],
    npc_schedule_runtime: structuredClone(proof.npc_schedule_runtime),
    temporal_boundary_candidates: proof.candidates, temporal_source_proof: proof };
  const before = await advance({ clock_before: state.clock, relevant_state: state,
    exact_elapsed: { exact_minutes: { numerator: '119', denominator: '1' } } });
  assert.equal(before.temporal_results[0].trace.processed_boundary_ids.length, 0);
  const crossed = await advance({ clock_before: state.clock, relevant_state: state,
    change_set_id: 'npc-routine-turn1',
    exact_elapsed: { exact_minutes: { numerator: '135', denominator: '1' } } });
  assert.equal(crossed.temporal_results[0].trace.processed_boundary_ids.length, 10);
  const staleCrossed = await advance({ clock_before: state.clock, relevant_state: state,
    change_set_id: 'npc-routine-turn1-stale',
    exact_elapsed: { exact_minutes: { numerator: '135', denominator: '1' } } });
  const stalePlan = await routineCommitPlan(state, staleCrossed, null, '-stale');
  const plan = await routineCommitPlan(state, crossed);
  const scheduledWrites = plan.updates
    .filter((write) => write.target_table === 'party_npc_spatial_schedules');
  const scheduleCas = plan.expected_state_versions.filter((entry) =>
    entry.target_table === 'party_npc_spatial_schedules');
  assert.equal(scheduledWrites.length, 5);
  assert.ok(scheduledWrites.every((write) => write.record.state_version === 2));
  assert.equal(scheduleCas.length, 5);
  assert.ok(scheduleCas.every((entry) => entry.state_version === 1));
  assert.equal(plan.appends
    .filter((write) => write.target_table === 'party_npc_runtime_transitions').length, 10);
  const committer = createSpatialV3PostgresCombinedAtomicCommitter({ pool, recheck: async () => ({ ok: true }) });
  const applied = await committer.commit({ plan, created_at_turn: 1 });
  assert.equal(applied.ok, true, JSON.stringify(applied.error));
  const reloaded = await loadTracePhase2TemporalSourceProof(pool, request.party_id);
  const running = reloaded.npc_schedule_runtime.filter((row) => row.status === 'active');
  assert.ok(running.every((row) => Number(row.state_version) === 2));
  assert.ok(running.every((row) => row.next_transition_at_whole_minutes
    === row.causal_state_ref.routine_state.next_transition_at.whole_minutes));
  assert.ok(running.every((row) => row.causal_state_ref.routine_state.phase_started_at.whole_minutes
    === '333195'), 'the 135-minute readback applies the transition at minute 333195');
  assert.ok(running.every((row) => row.npc_snapshot.machine_state.current_activity.activity_ref
    === npcRoutineActivity(row.causal_state_ref.routine_state).activity_ref));
  const replayCommitter = createSpatialV3PostgresCombinedAtomicCommitter({ pool,
    recheck: async () => ({ ok: true }) });
  assert.equal((await replayCommitter.commit({ plan, created_at_turn: 1 })).ok, true);
  const staleApplied = await committer.commit({ plan: stalePlan, created_at_turn: 1 });
  assert.equal(staleApplied.ok, false);
  assert.equal(staleApplied.error?.code, 'state_version_conflict');
  const firstTransitions = await pool.query(`SELECT npc_id,occurred_at_whole_minutes
    FROM party_runtime.party_npc_runtime_transitions
    WHERE party_id=$1 AND change_set_id='npc-routine-turn1'
    ORDER BY npc_id,occurred_at_whole_minutes`, [request.party_id]);
  assert.equal(firstTransitions.rows.length, 10);
  const firstCounts = new Map();
  for (const row of firstTransitions.rows) firstCounts.set(row.npc_id,
    (firstCounts.get(row.npc_id) ?? 0) + 1);
  assert.equal(firstCounts.size, 5);
  assert.ok([...firstCounts.values()].every((count) => count === 2));
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM party_runtime.party_npc_runtime_transitions WHERE party_id=$1', [request.party_id])).rows[0].n, 10);
  assert.deepEqual(await loadTracePhase2TemporalSourceProof(pool, request.party_id), reloaded);
  const deferred = running.find(row => row.causal_state_ref.deferred_placement?.kind === 'prepared_scene');
  assert.ok(deferred, 'one on-site routine retains its exact prepared-scene binding');
  await assert.rejects(pool.query(`UPDATE party_runtime.party_npc_spatial_schedules
    SET causal_state_ref=jsonb_set(causal_state_ref,'{deferred_placement,snapshot_id}',to_jsonb($2::text)),
      state_version=state_version+1 WHERE id=$1`, [deferred.id, 'missing-prepared-scope']),
  /npc schedule prepared scope is absent or belongs to another party/u);
  const otherPartyId = 'npc-routine-other-party';
  await materializeLowerDvinaTraceParty({ ...input, request: { ...request,
    party_id: otherPartyId, idempotency_key: 'npc-routine-other-new-game' } });
  const otherPrepared = (await loadTracePhase2TemporalSourceProof(pool, otherPartyId))
    .npc_schedule_runtime.find(row => row.causal_state_ref.deferred_placement.kind === 'prepared_scene');
  await assert.rejects(pool.query(`UPDATE party_runtime.party_npc_spatial_schedules
    SET causal_state_ref=jsonb_set(causal_state_ref,'{deferred_placement}', $2::jsonb),
      state_version=state_version+1 WHERE id=$1`,
  [deferred.id, JSON.stringify(otherPrepared.causal_state_ref.deferred_placement)]),
  /npc schedule prepared scope is absent or belongs to another party/u);
  const enteredState = { ...state, actor_id: initial.player.instance_id,
    first_entry_preparation: initial.first_entry_preparation,
    npc_schedule_runtime: reloaded.npc_schedule_runtime,
    party_state: { state_version: 1, turn_number: 1 }, clock: crossed.clock_after,
    position: initial.position };
  const prepared = enteredState.first_entry_preparation;
  const spatial = prepared.spatial_v3;
  const targetDeferred = reloaded.npc_schedule_runtime.find((row) =>
    row.causal_state_ref.deferred_placement?.snapshot_id === spatial.preparation_snapshot_id
      && row.causal_state_ref.deferred_placement?.member_ordinal
        === spatial.preparation_member_ordinal);
  assert.ok(targetDeferred, 'the routine member is selected by exact preparation ordinal');
  const extension = resolveFirstEntry({ partyId: request.party_id, state: enteredState,
    changeSetId: 'npc-routine-turn2', scenarioRevision: 33,
    phase3Contracts: { route: { route_id: prepared.binding.route_ref },
      sourceEndpoint: spatial.source.endpoint_ref, destinationEndpoint: spatial.target.endpoint_ref },
    factual: { mode_resolution: { command_id: 'lower_dvina_trace.follow_path_to_fishing_camp' },
      consequence: { phase3_kind: 'movement', movement: { route_ref: prepared.binding.route_ref,
        destination: { location_ref: prepared.binding.destination.location_profile_ref } } } } });
  const entryPlan = await routineCommitPlan(enteredState,
    { clock_after: crossed.clock_after, temporal_results: [] }, extension);
  const entered = await committer.commit({ plan: entryPlan, created_at_turn: 2 });
  assert.equal(entered.ok, true, JSON.stringify(entered.error));
  const arrived = (await loadTracePhase2TemporalSourceProof(pool, request.party_id))
    .npc_schedule_runtime.find(row => row.id === targetDeferred.id);
  assert.equal(arrived.current_position_node_id, spatial.target.position_id);
  assert.deepEqual(arrived.causal_state_ref, targetDeferred.causal_state_ref);
  assert.equal(arrived.next_transition_at_whole_minutes, targetDeferred.next_transition_at_whole_minutes);
  assert.deepEqual(arrived.npc_snapshot.machine_state, targetDeferred.npc_snapshot.machine_state);
  const afterEntryProof = await loadTracePhase2TemporalSourceProof(pool, request.party_id);
  const afterEntryState = { ...enteredState, clock: crossed.clock_after,
    party_state: { state_version: 2, turn_number: 2 },
    npc_schedule_runtime: afterEntryProof.npc_schedule_runtime,
    temporal_boundary_candidates: afterEntryProof.candidates, temporal_source_proof: afterEntryProof };
  const night = await advance({ clock_before: afterEntryState.clock, relevant_state: afterEntryState,
    change_set_id: 'npc-routine-turn3',
    exact_elapsed: { exact_minutes: { numerator: '705', denominator: '1' } } });
  assert.equal(night.temporal_results[0].trace.processed_boundary_ids.length, 5);
  const nightPlan = await routineCommitPlan(afterEntryState, night);
  assert.equal((await committer.commit({ plan: nightPlan, created_at_turn: 3 })).ok, true);
  const atNight = await loadTracePhase2TemporalSourceProof(pool, request.party_id);
  assert.ok(atNight.npc_schedule_runtime.filter(row => row.status === 'active')
    .every(row => row.npc_snapshot.machine_state.runtime_status
        === row.causal_state_ref.routine_state.runtime_status
      && row.next_transition_at_whole_minutes
        === row.causal_state_ref.routine_state.next_transition_at.whole_minutes));
  const atNightDeferred = atNight.npc_schedule_runtime.find(row => row.id === targetDeferred.id);
  assert.equal(atNightDeferred.current_position_node_id, null);
  assert.equal(atNightDeferred.causal_state_ref.routine_state.presence_state, 'location_gap');
  assert.equal(atNightDeferred.npc_placement, null,
    'the first-entry gap had no physical position fact to preserve');
  assert.equal((await committer.commit({ plan: nightPlan, created_at_turn: 3 })).ok, true);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM party_runtime.party_npc_runtime_transitions WHERE party_id=$1',
    [request.party_id])).rows[0].n, 15);

  // Re-seed one persisted routine with a test-only pinned D-1 bundle, then
  // exercise the exact season-boundary candidate and a fresh DB readback.
  const targetSchedule = atNight.npc_schedule_runtime.find((row) => row.id !== targetDeferred.id
    && row.status === 'active' && row.current_position_node_id == null
    && row.npc_placement == null);
  assert.ok(targetSchedule, 'an off-scene active schedule is available for the readback case');
  const clockBeforeSeason = night.clock_after;
  const calendarProfile = seasonalTestCalendar(clockBeforeSeason);
  const profiles = ['cold', 'warm'].map((season) => ({
    schedule_id: `schedule-${season}`, schedule_version: 1,
    world_revision_id: 'seasonal-test-world', scope_kind: 'place_family',
    scope_ref: 'pf-season-test', subject_kind: 'occupation', subject_ref: 'nov_occ_test',
    season, months: null, day_type: 'normal', status: 'approved',
    routine_profile: seasonalTestRoutine(`routine-${season}`)
  }));
  const scheduleContext = { home_scope_ref: 'pf-season-test', subject_kind: 'occupation',
    subject_ref: 'nov_occ_test', day_type: 'normal', approved_rule_rows: profiles,
    calendar_profile: calendarProfile };
  const initialRule = selectNpcRoutineSchedule({ schedule_context: scheduleContext,
    scheduled_at: clockBeforeSeason });
  assert.equal(initialRule.season, 'warm');
  const runtime = structuredClone(createNpcRoutineState({
    profile: initialRule.rule.routine_profile, started_at: clockBeforeSeason,
    calendar_profile: calendarProfile, schedule_context: initialRule.schedule_context,
    current_activity: targetSchedule.npc_snapshot.machine_state.current_activity
  }));
  runtime.presence_state = 'location_gap';
  runtime.schedule_gap_reason = 'npc_location_gap';
  const causalState = { ...targetSchedule.causal_state_ref, routine_state: runtime };
  delete causalState.deferred_placement;
  delete causalState.canonical_digest;
  causalState.canonical_digest = digest(causalState);
  const currentActivity = npcRoutineActivity(runtime);
  const machineState = { ...targetSchedule.npc_snapshot.machine_state,
    current_activity: currentActivity, current_activity_ref: currentActivity.activity_ref,
    schedule_state: runtime.profile.phases[runtime.phase_index].state_id,
    runtime_status: runtime.runtime_status };
  const profileRef = routineProfileRef(runtime.profile);
  const profilePins = routineProfilePins(profileRef);
  const positionSeedClient = await pool.connect();
  try {
    await positionSeedClient.query('BEGIN');
    await positionSeedClient.query(`UPDATE party_runtime.party_npc_spatial_schedules
      SET causal_state_ref=$2::jsonb,status=$3,schedule_profile_ref=$4::jsonb,
          dependency_pins=$5::jsonb,
          current_position_node_id=$10,
          next_transition_at_whole_minutes=$6,
          next_transition_at_subminute_numerator=$7,
          next_transition_at_subminute_denominator=$8,
          state_version=state_version+1,updated_change_set_id=$9 WHERE id=$1`,
    [targetSchedule.id, causalState, runtime.status, profileRef, profilePins,
      runtime.next_transition_at.whole_minutes, runtime.next_transition_at.subminute_numerator,
      runtime.next_transition_at.subminute_denominator, 'seasonal-test-seed', spatial.target.position_id]);
    await positionSeedClient.query(`INSERT INTO party_runtime.entity_placements (
        party_id,entity_kind,entity_id,placement_kind,position_node_id,host_entity_ref,
        occupies_capacity_units,visibility_modifier_ref,interaction_profile_ref,
        state_version,updated_change_set_id)
      VALUES ($1,'npc',$2,'scene_position',$3,NULL,1,NULL,NULL,1,$4)`,
    [request.party_id, targetSchedule.npc_id, spatial.target.position_id, 'seasonal-test-placement-seed']);
    await positionSeedClient.query('COMMIT');
  } catch (error) {
    await positionSeedClient.query('ROLLBACK');
    throw error;
  } finally {
    positionSeedClient.release();
  }
  await pool.query(`UPDATE party_runtime.party_npcs SET machine_state=$2::jsonb
      WHERE party_id=$1 AND npc_id=$3`,
    [request.party_id, machineState, targetSchedule.npc_id]);
  const seasonalProof = await loadTracePhase2TemporalSourceProof(pool, request.party_id);
  const seasonalRow = seasonalProof.npc_schedule_runtime.find((row) => row.id === targetSchedule.id);
  const seasonBoundary = nextCalendarSeasonBoundary(clockBeforeSeason, calendarProfile);
  assert.equal(seasonBoundary.season_id, 'cold');
  const seasonCandidate = seasonalProof.candidates.find((candidate) =>
    candidate.primary_subject_ref?.entity_id === seasonalRow.npc_id
      && candidate.resolution_class === 'npc_schedule');
  assert.deepEqual(seasonCandidate.scheduled_at, seasonBoundary.scheduled_at);
  const seasonalState = { ...afterEntryState, clock: clockBeforeSeason,
    party_state: { state_version: 3, turn_number: 3 },
    npc_schedule_runtime: seasonalProof.npc_schedule_runtime,
    temporal_boundary_candidates: seasonalProof.candidates,
    temporal_source_proof: seasonalProof };
  const seasonAdvance = await advance({ clock_before: clockBeforeSeason,
    relevant_state: seasonalState, change_set_id: 'npc-routine-season-turn4',
    exact_elapsed: { exact_minutes: subtractGameTimestamp(
      seasonBoundary.scheduled_at, clockBeforeSeason) } });
  assert.ok(seasonAdvance.temporal_results[0].trace.processed_boundary_ids
    .includes(seasonCandidate.boundary_id));
  const seasonPlan = await routineCommitPlan(seasonalState, seasonAdvance);
  assert.equal((await committer.commit({ plan: seasonPlan, created_at_turn: 4 })).ok, true);
  const seasonReadback = await loadTracePhase2TemporalSourceProof(pool, request.party_id);
  const persistedSeasonal = seasonReadback.npc_schedule_runtime.find((row) => row.id === targetSchedule.id);
  assert.equal(persistedSeasonal.causal_state_ref.routine_state.profile.profile_id, 'routine-cold');
  assert.equal(persistedSeasonal.causal_state_ref.routine_state.schedule_context
    .selected_rule_ref.schedule_id, 'schedule-cold');
  assert.equal(persistedSeasonal.schedule_profile_ref.authoring_version, '2');
  assert.equal(persistedSeasonal.dependency_pins.pins[0].version_pin.authoring_version, '2');
  assert.equal(persistedSeasonal.current_position_node_id, spatial.target.position_id);
  assert.equal(persistedSeasonal.causal_state_ref.routine_state.presence_state, 'location_gap');
  assert.equal(persistedSeasonal.npc_placement.position_node_id, spatial.target.position_id);
  const seasonalPlacement = await pool.query(`SELECT position_node_id FROM party_runtime.entity_placements
    WHERE party_id=$1 AND entity_kind='npc' AND entity_id=$2`,
  [request.party_id, targetSchedule.npc_id]);
  assert.equal(seasonalPlacement.rows[0].position_node_id, spatial.target.position_id);
  const otherPosition = await pool.query(`SELECT id FROM party_runtime.scene_position_nodes
    WHERE party_id=$1 AND id<>$2 ORDER BY id LIMIT 1`,
  [request.party_id, spatial.target.position_id]);
  assert.ok(otherPosition.rows[0]);
  await assert.rejects(pool.query(`UPDATE party_runtime.party_npc_spatial_schedules
    SET current_position_node_id=$2,state_version=state_version+1,updated_change_set_id=$3
    WHERE id=$1`, [targetSchedule.id, otherPosition.rows[0].id, 'invalid-gap-position']),
  /NPC location gap position must match existing entity placement/u);
  await assert.rejects(pool.query(`UPDATE party_runtime.party_npc_spatial_schedules
    SET current_position_node_id=$2,state_version=state_version+1,updated_change_set_id=$3
    WHERE id=$1`, [targetDeferred.id, spatial.source.position_id, 'invalid-placement-mismatch']),
  /NPC location gap position must match existing entity placement/u);
  assert.equal((await committer.commit({ plan: seasonPlan, created_at_turn: 4 })).replay, true);
  const afterReplay = await loadTracePhase2TemporalSourceProof(pool, request.party_id);
  assert.deepEqual(afterReplay, seasonReadback);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM party_runtime.party_npc_spatial_schedules WHERE party_id=$1',
    [request.party_id])).rows[0].n, 6);

  const movementExecution = { owner: '@rus/movement-routes', status: 'active',
    route_ref: 'route-season-readback', source_endpoint_ref: 'endpoint-source',
    destination_endpoint_ref: 'endpoint-destination',
    destination_location_ref: 'pf-winter-crossing',
    started_at: { whole_minutes: '42110', subminute_numerator: '0',
      subminute_denominator: '1' },
    ends_at: { whole_minutes: '42122', subminute_numerator: '0',
      subminute_denominator: '1' } };
  const movementCausalState = structuredClone(persistedSeasonal.causal_state_ref);
  movementCausalState.routine_state.movement_execution = movementExecution;
  delete movementCausalState.canonical_digest;
  movementCausalState.canonical_digest = digest(movementCausalState);
  await pool.query(`UPDATE party_runtime.party_npc_spatial_schedules
      SET causal_state_ref=$2::jsonb,state_version=state_version+1,
          updated_change_set_id=$3 WHERE id=$1`,
  [targetSchedule.id, movementCausalState, 'movement-execution-readback-seed']);
  await pool.query(`INSERT INTO party_runtime.party_npc_runtime_transitions (
      transition_id,party_id,npc_id,transition_kind,event_id,change_set_id,
      idempotency_record_id,occurred_at_whole_minutes,
      occurred_at_subminute_numerator,occurred_at_subminute_denominator,trace)
    VALUES ($1,$2,$3,'routine_transition',NULL,$4,$5,42122,0,1,$6::jsonb)`,
  [`last-route-${targetSchedule.npc_id}`, request.party_id, targetSchedule.npc_id,
    'last-route-change', `last-route-idempotency-${targetSchedule.npc_id}`,
    { movement: { status: 'completed', destination_position_node_id: spatial.target.position_id,
      destination_location_ref: 'pf-test-yard' } }]);
  const afterMovementReadback = await loadTracePhase2TemporalSourceProof(pool, request.party_id);
  const movementRow = afterMovementReadback.npc_schedule_runtime
    .find((row) => row.id === targetSchedule.id);
  assert.deepEqual(movementRow.causal_state_ref.routine_state.movement_execution,
    movementExecution, 'nested active route interval survives JSONB readback');
  assert.deepEqual(movementRow.last_completed_movement, {
    destination_position_node_id: spatial.target.position_id,
    destination_location_ref: 'pf-test-yard',
    completed_at: { whole_minutes: '42122', subminute_numerator: '0',
      subminute_denominator: '1' }
  }, 'latest completed route semantic location survives temporal source readback');
  assert.equal((await committer.commit({ plan: seasonPlan, created_at_turn: 4 })).replay, true);
  const afterMovementReplay = await loadTracePhase2TemporalSourceProof(pool, request.party_id);
  assert.deepEqual(afterMovementReplay, afterMovementReadback,
    'idempotent replay does not replace the persisted nested route interval');
  await assert.rejects(pool.query(`UPDATE party_runtime.party_npc_spatial_schedules
      SET schedule_profile_ref=$2::jsonb,state_version=state_version+1,
          updated_change_set_id=$3 WHERE id=$1`,
  [targetSchedule.id, JSON.stringify({ entity_ref: { entity_kind: 'activity_profile',
    entity_id: 'unselected-profile' }, authoring_version: '9' }),
    'invalid-profile-with-movement-execution']),
  /npc schedule profile may change only with a pinned seasonal rule selection/u);
});

function seasonalTestCalendar(clock) {
  const epoch = { ...clock,
    whole_minutes: (BigInt(clock.whole_minutes) - 1439n).toString() };
  return { profile_id: 'npc-season-pg-test', version: '1', status: 'approved',
    provenance: { source_id: 'npc-season-pg-test', source_version: '1' },
    epoch: { game_timestamp: epoch, year: '1230', month: '1', day: '1' },
    calendar_system: 'npc-season-pg-test', month_rules: { month_lengths: ['1', '1'] },
    leap_rules: { cycle_years: '1', leap_year_indexes: [], leap_month: '1', leap_days: '0' },
    day_start_rule: { local_minute: '0' }, local_offset_rule: { offset_minutes: '0' },
    daypart_rule: { ranges: [{ id: 'day', start_minute: '0', end_minute: '1440' }] },
    season_rule: { ranges: [{ id: 'cold', start_day: '1', end_day: '1' },
      { id: 'warm', start_day: '2', end_day: '2' }], months_by_id: { cold: ['1'], warm: ['2'] } },
    daylight_rule: { ranges: [{ id: 'light', start_day: '1', end_day: '2' }] } };
}
function seasonalTestRoutine(profile_id) {
  return { schema: 'npc_routine_profile_v1', profile_id, revision: 2, status: 'approved',
    phases: ['work', 'rest'].map((state_id) => ({ state_id, duration_minutes: 5000,
      activity_ref: state_id, summary: state_id, activity_status: 'active',
      runtime_status: 'available', can_continue_automatically: true,
      decision_required: false, presence_state: 'on_site', location_ref: 'pf-season-test' })) };
}
function routineProfileRef(profile) {
  return { entity_ref: { entity_kind: 'activity_profile', entity_id: profile.profile_id },
    authoring_version: String(profile.revision) };
}
function routineProfilePins(profileRef) {
  const value = { pins: [{ dependency_role: 'profile', entity_ref: profileRef.entity_ref,
    version_pin: { pin_kind: 'authoring_version', authoring_version: profileRef.authoring_version } }] };
  return { ...value, canonical_digest: digest(value) };
}

async function routineCommitPlan(state, advance, extension = null, suffix = '') {
  const number = state.party_state.turn_number + 1;
  const partyId = state.party_id, changeSetId = `npc-routine-turn${number}${suffix}`,
    idemId = `npc-routine-commit${number}${suffix}`;
  const visible = { schema: 'temporal_visible_package.v1', perceived_scene: 'Берег.',
    perceived_changes: [], sensory_details: [], visible_npcs: [], visible_objects: [], known_context: [],
    uncertainties: [], hypotheses: [], player_safe_interruption: null, allowed_action_affordances: [] };
  const pins = [{ dependency_role: 'source_authoring', entity_ref: { entity_kind: 'world_revision', entity_id: 'routine-test' },
    version_pin: { pin_kind: 'authoring_version', authoring_version: '1', state_version: null } }];
  const clock = advance.clock_after;
  const updates = [{ target_table: 'parties', id: partyId, record: { party_id: partyId, status: 'active' } },
    { target_table: 'party_clocks', id: partyId, record: { party_id: partyId,
      whole_minutes: clock.whole_minutes, subminute_numerator: clock.subminute_numerator,
      subminute_denominator: clock.subminute_denominator, updated_change_set_id: changeSetId } }];
  const base = { plan_id: `npc-routine-plan${number}${suffix}`, party_id: partyId, write_plan_kind: 'semantic_commit',
    operation_kind: 'trace_turn_step', canonical_input_digest: digest({ id: 'routine-turn1' }),
    expected_state_versions: [{ target_table: 'parties', id: partyId, state_version: number - 1 },
      { target_table: 'party_clocks', id: partyId, state_version: number }],
    validation_report: { status: 'pass', digest: digest({ valid: true }) }, change_set: { id: changeSetId },
    idempotency: { id: idemId, key: idemId, request_id: null, semantic_command_snapshot: null,
      semantic_command_digest: null, semantic_dependency_pins: null },
    visible_package_envelope: { package_id: `npc-routine-visible${number}`, party_id: partyId, turn_id: changeSetId,
      committed_state_version: String(number), change_set_id: changeSetId, package_digest: digest(visible), visible_payload: visible,
      presentation_status: 'pending', projection_policy_ref: { entity_ref: { entity_kind: 'visibility_modifier', entity_id: 'routine-test' }, authoring_version: '1' },
      dependency_pins: { pins, canonical_digest: digest(pins).replace('sha256:', '') }, idempotency_record_id: idemId },
    approved_write_sets: [{ inserts: [], deletes: [], updates, appends: [{ target_table: 'party_v3_change_sets', id: changeSetId,
      record: { id: changeSetId, party_id: partyId, operation_kind: 'trace_turn_step', idempotency_record_id: idemId } }] }],
    lock_context: { owner_keys: [], execution_keys: [], g4_keys: [], physical_keys: [
      `party_runtime.parties:${partyId}`, `party_runtime.party_clocks:${partyId}`, `party_runtime.party_v3_change_sets:${changeSetId}`] },
    commit_rechecks: ['physical', 'state', 'pin', 'endpoint', 'route', 'capacity', 'time', 'change_set']
      .map((kind) => ({ kind, digest: digest({ kind }) })) };
  if (extension) {
    base.approved_write_sets.push(...extension.approved_write_sets);
    base.expected_state_versions.push(...extension.expected_state_versions);
    for (const key of Object.keys(base.lock_context)) base.lock_context[key].push(...(extension.lock_context[key] ?? []));
  }
  const integrated = integrateSpatialV3TemporalWriteFragments({ base_write_plan_input: base,
    temporal_result: advance.temporal_results[0] ?? {} });
  assert.equal(integrated.ok, true, JSON.stringify(integrated.error));
  const built = await buildCombinedWritePlan(integrated.input, { verifyApproval: async () => ({ ok: true }) });
  assert.equal(built.ok, true, JSON.stringify(built.error));
  return built.plan;
}
