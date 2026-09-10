import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import pg from 'pg';
import { createTemporalAdvanceOwner } from '@rus/turn/temporal-advance';
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

test('new game persists canonical offscene routines atomically and replays', async (t) => {
  const adminUrl = process.env.RUS_TEST_POSTGRES_ADMIN_URL;
  if (!adminUrl) return t.skip('RUS_TEST_POSTGRES_ADMIN_URL is required for an isolated database');
  const admin = new pg.Pool({ connectionString: adminUrl });
  const database = `npc_routine_test_${process.pid}_${Date.now()}`;
  await admin.query(`CREATE DATABASE ${database}`);
  const url = new URL(adminUrl); url.pathname = `/${database}`;
  const pool = new pg.Pool({ connectionString: url.href });
  t.after(async () => { await pool.end(); await admin.query(`DROP DATABASE ${database}`); await admin.end(); });
  for (const file of (await readdir('schemas/party-db')).filter((name) => /^\d+.*\.sql$/u.test(name)).sort()) {
    if (file.startsWith('012_')) await runPartyRuntimeCatalogMigration(pool);
    await pool.query(await readFile(`schemas/party-db/${file}`, 'utf8'));
  }
  const bundle = await loadLowerDvinaTraceMaterializationBundle({ scenarioDefinitionRevision: 33 });
  const schema = await readPartyDatabaseSchemaSnapshot(pool);
  const repository = createLowerDvinaTracePhase1ARepository({ query: pool.query.bind(pool) });
  const ports = createPostgresStage25Ports({ pool,
    postcommitProjector: createLowerDvinaTracePhase1APostcommitProjector({ repository }) });
  const request = { party_id: 'npc-routine-party', scenario_id: 'lower_dvina_trace_v1',
    scenario_definition_revision: 33, scenario_manifest_digest: bundle.manifest_digest,
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
    clock: committed.instance.timestamp, npcs: [], npc_schedule_runtime: proof.npc_schedule_runtime,
    temporal_boundary_candidates: proof.candidates, temporal_source_proof: proof };
  const before = await advance({ clock_before: state.clock, relevant_state: state,
    exact_elapsed: { exact_minutes: { numerator: '119', denominator: '1' } } });
  assert.equal(before.temporal_results[0].trace.processed_boundary_ids.length, 0);
  const crossed = await advance({ clock_before: state.clock, relevant_state: state,
    change_set_id: 'npc-routine-turn1',
    exact_elapsed: { exact_minutes: { numerator: '135', denominator: '1' } } });
  assert.equal(crossed.temporal_results[0].trace.processed_boundary_ids.length, 10);
  const plan = await routineCommitPlan(state, crossed);
  const committer = createSpatialV3PostgresCombinedAtomicCommitter({ pool, recheck: async () => ({ ok: true }) });
  const applied = await committer.commit({ plan, created_at_turn: 1 });
  assert.equal(applied.ok, true, JSON.stringify(applied.error));
  const reloaded = await loadTracePhase2TemporalSourceProof(pool, request.party_id);
  const running = reloaded.npc_schedule_runtime.filter((row) => row.status === 'active');
  assert.ok(running.every((row) => Number(row.state_version) === 2));
  assert.ok(running.every((row) => row.causal_state_ref.routine_state.phase_index === 2));
  assert.ok(running.every((row) => row.next_transition_at_whole_minutes === '333900'));
  assert.ok(running.every((row) => row.npc_snapshot.machine_state.current_activity.summary
    === row.causal_state_ref.routine_state.work_activity.summary));
  assert.equal((await committer.commit({ plan, created_at_turn: 1 })).ok, true);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM party_runtime.party_npc_runtime_transitions WHERE party_id=$1', [request.party_id])).rows[0].n, 10);
  assert.deepEqual(await loadTracePhase2TemporalSourceProof(pool, request.party_id), reloaded);
  const deferred = running.find(row => row.causal_state_ref.deferred_placement.kind === 'prepared_scene');
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
    .npc_schedule_runtime.find(row => row.id === deferred.id);
  assert.equal(arrived.current_position_node_id, spatial.target.position_id);
  assert.deepEqual(arrived.causal_state_ref, deferred.causal_state_ref);
  assert.equal(arrived.next_transition_at_whole_minutes, deferred.next_transition_at_whole_minutes);
  assert.deepEqual(arrived.npc_snapshot.machine_state, deferred.npc_snapshot.machine_state);
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
    .every(row => row.npc_snapshot.machine_state.runtime_status === 'sleeping'
      && row.next_transition_at_whole_minutes === '334500'));
  assert.equal(atNight.npc_schedule_runtime.find(row => row.id === deferred.id).current_position_node_id,
    spatial.target.position_id);
  assert.equal((await committer.commit({ plan: nightPlan, created_at_turn: 3 })).ok, true);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM party_runtime.party_npc_runtime_transitions WHERE party_id=$1',
    [request.party_id])).rows[0].n, 15);
});

async function routineCommitPlan(state, advance, extension = null) {
  const number = state.party_state.turn_number + 1;
  const partyId = state.party_id, changeSetId = `npc-routine-turn${number}`, idemId = `npc-routine-commit${number}`;
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
  const base = { plan_id: `npc-routine-plan${number}`, party_id: partyId, write_plan_kind: 'semantic_commit',
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
