import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import pg from 'pg';
import { createSeededRandomSource } from '@rus/checks-rng';
import { addElapsedTime } from '@rus/time-events-history';
import { canonicalDigest } from '@rus/materialization';
import { createTemporalAdvanceOwner } from '@rus/turn/temporal-advance';
import { createLowerDvinaTracePublicRuntime } from '../../apps/game-server/src/runtime/lower-dvina-trace-public-runtime.js';
import { createLowerDvinaTracePhase2Runtime } from '../../apps/game-server/src/runtime/lower-dvina-trace-phase-2.js';
import { createLowerDvinaTracePhase1BProductionAdapter } from '../../apps/game-server/src/infrastructure/postgres/lower-dvina-trace-phase-1b.js';
import { createLowerDvinaTracePhase2PostgresRepository } from '../../apps/game-server/src/infrastructure/postgres/lower-dvina-trace-phase-2.js';
import { createLowerDvinaTracePhase2DurableNarrator } from '../../apps/game-server/src/infrastructure/postgres/lower-dvina-trace-phase-2-presentation.js';
import { createSpatialV3PostgresCombinedAtomicCommitter } from '../../apps/game-server/src/infrastructure/postgres/spatial-v3-combined-atomic-committer.js';
import { firstPlayableCommitRecheck } from '../../apps/game-server/src/infrastructure/postgres/first-playable/recheck.js';
import { loadLowerDvinaTraceMaterializationBundle } from '../../apps/game-server/src/internal/lower-dvina-trace-phase-1a.js';
import { lowerDvinaTracePhase1ADomainPin } from '../fixtures/lower-dvina-trace-phase-1a-domain-pin.mjs';
import { runPartyRuntimeCatalogMigration } from '../../tools/runtime-catalog-activation/src/forward-migrations.js';
import { lowerDvinaTracePhase6TemporalEffectRegistrations } from
  '../../apps/game-server/src/runtime/lower-dvina-trace-phase-6-temporal-effect-owner.js';
import { lowerDvinaTraceConversationTemporalEffectRegistrations } from
  '../../apps/game-server/src/runtime/lower-dvina-trace-m2-conversation-temporal-effect-owner.js';
import { validatePhase6TemporalSourceResolution } from
  '../../apps/game-server/src/runtime/lower-dvina-trace-phase-6-temporal-source.js';
import { createM2ConversationModels } from
  '../../apps/game-server/test/lower-dvina-trace-m2-conversation-fixture.js';
import { createLowerDvinaTraceTurnStepTestModel } from
  '../../apps/game-server/test/lower-dvina-trace-turn-step-model-fixture.js';
import { installLowerDvinaTraceV5World, lowerDvinaTraceV5World as world } from
  '../fixtures/lower-dvina-trace-v5-world-fixture.js';

const docker = (args) => spawnSync('docker', args, { encoding: 'utf8', timeout: 45_000 });

test('Phase 6 PostgreSQL carry persists exact terminal, restart/resume, rechecks and rollback', async (t) => {
  if (docker(['version']).status !== 0) return t.skip('Docker is required for isolated Phase 6 PostgreSQL integration');
  const name = `lower-dvina-phase-6-${process.pid}`;
  let pool;
  t.after(async () => { if (pool) await pool.end(); docker(['rm', '-f', name]); });
  assert.equal(docker(['run', '-d', '--name', name, '-p', '127.0.0.1::5432', '-e', 'POSTGRES_PASSWORD=local_only', '-e', 'POSTGRES_USER=phase6', '-e', 'POSTGRES_DB=phase6', 'postgres:16-alpine']).status, 0);
  await waitForPostgres(name, 'phase6');
  const port = Number(docker(['port', name, '5432']).stdout.match(/:(\d+)\s*$/u)?.[1]);
  pool = new pg.Pool({ host: '127.0.0.1', port, user: 'phase6', password: 'local_only', database: 'phase6', max: 8 });
  await installSchemas(pool); await installLowerDvinaTraceV5World(pool);
  const pins = await runtimePins();

  const counters = { rng_factories: 0, rng_draws: 0, now: 0 };
  const runtime = buildRuntime({ pool, ...pins, counters });
  const party = await readyParty(runtime, 'terminal');
  const checkpoint = await snapshot(pool, party.party_id);
  assert.deepEqual(body(checkpoint), [79, 37, 58], 'Phase 5 checkpoint for Mikula');
  const released = await assertReleasedSupportResources(
    pool, party.party_id, checkpoint
  );
  const restartedAtCheckpoint = buildRuntime({ pool, ...pins, counters });
  await restartedAtCheckpoint.getPartyScreen(party.party_id);
  await restartedAtCheckpoint.submitTurn(party.party_id,
    turn('terminal-treatment', 'Оказать Онисиму первую помощь.'));
  const replayed = await assertReleasedSupportResources(
    pool, party.party_id, await snapshot(pool, party.party_id)
  );
  assert.equal(replayed.rope.item_id, released.rope.item_id,
    'release restart/replay preserves one normalized rope instance');
  assert.equal(replayed.vessel.item_id, released.vessel.item_id,
    'release restart/replay preserves the resolved vessel instance');
  const beforeCounters = { ...counters };
  const input = turn('phase-6-terminal',
    'Доставить Онисима в стан на собранных жердях.');
  const completed = await runtime.submitTurn(party.party_id, input);
  await assertTerminal(pool, party.party_id, checkpoint);
  assert.deepEqual(await phase6PlayerBodyEffectTimestamp(pool,
    party.party_id), plusMinutes(checkpoint.clock, 10));
  const terminal = await snapshot(pool, party.party_id);
  assert.equal(terminal.phase6_history[0].exact_elapsed.numerator, '20');
  assert.equal(terminal.phase6_history[0].internal_rebinding.elapsed_minutes,
    10);
  assert.equal(terminal.phase6_history[0].internal_rebinding.route_progress_ppm,
    500000);
  assert.equal(terminal.phase6_history[0].internal_rebinding.applied_in_this_attempt, true);
  assertCarrierAdmission(terminal, checkpoint, released);
  assert.equal(counters.rng_draws, beforeCounters.rng_draws,
    'Phase 6 consumes no RNG draw');
  const replayCounters = { ...counters };
  assert.deepEqual(await buildRuntime({ pool, ...pins, counters }).submitTurn(party.party_id, input), completed);
  assert.deepEqual(counters, replayCounters, 'terminal replay is idempotent');
  await assertTamperRejected(pool, buildRuntime({ pool, ...pins }), party.party_id);

  await assertInterruptedResume(pool, pins);
  await assertInterruptedAfterRebindResume(pool, pins);
  await assertSameTimeHazardCascade(pool, pins);

  const rollbackRuntime = buildRuntime({ pool, ...pins });
  const rollbackParty = await readyParty(rollbackRuntime, 'rollback');
  const rollbackBefore = await snapshot(pool, rollbackParty.party_id);
  await pool.query(`ALTER TABLE party_runtime.party_actor_body_states ADD CONSTRAINT phase6_terminal_rollback_probe CHECK (energy <> 35) NOT VALID`);
  try {
    await assert.rejects(() => rollbackRuntime.submitTurn(rollbackParty.party_id, turn('phase-6-rollback', 'Сделать носилки и отнести Онисима в стан.')), { code: 'TRACE_PHASE_6_COMMIT_FAILED' });
  } finally { await pool.query('ALTER TABLE party_runtime.party_actor_body_states DROP CONSTRAINT phase6_terminal_rollback_probe'); }
  assert.deepEqual(await snapshot(pool, rollbackParty.party_id), rollbackBefore, 'failed terminal write leaves no partial state');
  assert.equal(await phase6Attempts(pool, rollbackParty.party_id), 0);
  assert.equal(await phase6TerminalEffectCount(pool, rollbackParty.party_id), 0);
  assert.equal(await phase6RouteExecutionCount(pool, rollbackParty.party_id), 0);
});

async function runtimePins() {
  const bundle = await loadLowerDvinaTraceMaterializationBundle({ scenarioDefinitionRevision: 12 });
  const source = lowerDvinaTracePhase1ADomainPin(bundle);
  const runtimeCatalogPin = Object.freeze({ ...source, compatible_world_revision_id: world.revision, compatible_world_catalog_digest: world.digest, compatible_world_pin_manifest_digest: world.manifest });
  return { runtimeCatalogPin, release: Object.freeze({ release_id: 'phase-6-postgres-release', world_revision_id: world.revision, world_catalog_digest: world.digest, compatible_world_pin_manifest_digest: world.manifest }) };
}
function buildRuntime({ pool, release, runtimeCatalogPin, counters = null,
  temporalBoundaryResolver = pauseOnlyTemporalBoundaryResolver }) {
  const committer = createSpatialV3PostgresCombinedAtomicCommitter({ pool, recheck: firstPlayableCommitRecheck, now: () => new Date('2026-07-30T08:00:00.000Z') });
  const repository = createLowerDvinaTracePhase2PostgresRepository({
    partyPool: pool, committer,
    narrationService: { async run(request) { return narration(request.request_id); } }
  });
  const { playerConversationModel, npcSemanticModel } =
    createM2ConversationModels();
  const turnStepModel = createLowerDvinaTraceTurnStepTestModel();
  const traceTurnRuntime = createLowerDvinaTracePhase2Runtime({ repository,
    turnStepModel,
    playerConversationModel, npcSemanticModel,
    semanticResolver: async ({ raw_text, action_set }) => ({ option_id: option(raw_text, action_set) }),
    narrator: createLowerDvinaTracePhase2DurableNarrator({ partyPool: pool, narrationService: { async run(request) { return narration(request.request_id); } } }),
    randomSourceFactory: ({ request_id }) => { if (counters) counters.rng_factories += 1; const source = createSeededRandomSource(`phase-6:${request_id}`); return { next: () => { if (counters) counters.rng_draws += 1; return 0.99; }, snapshot: () => source.snapshot() }; },
    npcDecisionSelector: async (request) => { const selected = request.options.find(({ option_id }) => option_id === (request.options.some(({ option_id }) => option_id === 'surrender_without_confession') ? 'surrender_without_confession' : 'accept_first_aid')); assert.ok(selected); return { request_id: request.request_id, state_version: request.state_version, option_id: selected.option_id, command_token: selected.command_token }; }, decisionSecret: 'phase-6-postgres-secret', temporalAdvanceOwner: phase6TemporalOwner(temporalBoundaryResolver), now: () => { if (counters) counters.now += 1; return '2026-07-30T08:00:00.000Z'; } });
  return createLowerDvinaTracePublicRuntime({ partyPool: pool, committer, release, runtimeCatalogPin, traceStartAdapter: createLowerDvinaTracePhase1BProductionAdapter({ partyPool: pool, worldPool: pool, release, runtimeCatalogPin }), traceTurnRuntime });
}
function phase6TemporalOwner(resolve) {
  const source = (source_kind, ruleId, policyId) => ({
    source_kind,
    rule_ref: { entity_ref: { entity_kind: 'action_contract',
      entity_id: ruleId }, authoring_version: 'v1' },
    policy_ref: { entity_ref: { entity_kind: 'activity_contract',
      entity_id: policyId }, authoring_version: 'v1' },
    resolve: (candidate, context) =>
      validatePhase6TemporalSourceResolution({ candidate,
        projection: context.projection,
        resolution: resolve(candidate, context) })
  });
  return createTemporalAdvanceOwner({
    source_registrations: [
      source('source_record', 'phase_6_test_interruption_rule',
        'phase_6_test_interruption_policy')
    ],
    effect_registrations: [
      ...lowerDvinaTracePhase6TemporalEffectRegistrations(),
      ...lowerDvinaTraceConversationTemporalEffectRegistrations()
    ]
  });
}
function pauseOnlyTemporalBoundaryResolver(candidate, { projection }) {
  return { disposition: 'execute', proposals: [
    resolvedEventProposal(candidate, projection)
  ], state_projection: projection, follow_up_candidates: [] };
}
function resolvedEventProposal(candidate, projection) {
  const state = projection.phase6_state;
  const version = state.temporal_source_proof
    .event_versions[candidate.boundary_id];
  const changeSetId = `change:${state.party_id}:trace-phase6:${
    state.party_state.turn_number + 1}`;
  const writeSet = { appends: [], inserts: [], deletes: [], updates: [{
    target_table: 'party_temporal_events', id: candidate.boundary_id,
    record: { event_id: candidate.boundary_id, party_id: state.party_id,
      status: 'resolved', terminal_change_set_id: changeSetId,
      state_version: version + 1 }
  }] };
  return {
    proposal_id: `temporal-event:${candidate.boundary_id}`,
    write_target: `temporal-event:${candidate.boundary_id}`,
    write_set: writeSet,
    expected_state_versions: [{ target_table: 'party_temporal_events',
      id: candidate.boundary_id, state_version: version }],
    physical_keys: [
      `party_runtime.party_temporal_events:${candidate.boundary_id}`
    ],
    canonical_digest: canonicalDigest(writeSet)
  };
}
function option(raw, options) { const text = raw.toLowerCase(); const id = text.includes('осмотр') ? 'inspect_wreck_in_detail' : text.includes('показ') ? 'show_clue_and_seek_eremey_cooperation' : text.includes('сушиль') ? 'follow_known_route_to_drying_shed' : text.includes('доставить') || text.includes('носил') || text.includes('отнести') ? 'make_stretcher_and_carry_onisim_to_camp' : text.includes('стан') ? 'follow_path_to_fishing_camp' : text.includes('помощ') ? 'attempt_risky_first_aid_onisim' : 'offer_conditional_protection_and_seek_surrender'; assert.ok(options.some(({ option_id }) => option_id === id), `${id}: ${options.map(({ option_id }) => option_id)}`); return id; }
function turn(request_id, raw_text) { return { request_id, idempotency_key: request_id, raw_text }; }
async function readyParty(runtime, id) {
  let party;
  try {
    party = await runtime.startNewGame({
      scenario_id: 'lower_dvina_trace_v1', request_id: `phase-6-${id}`
    });
  } catch (error) {
    error.message = `${error.message} ${JSON.stringify(
      error.lifecycle?.concerns ?? error.details ?? {}
    )}`;
    throw error;
  }
  await runtime.acknowledgeOpening(party.party_id, { client_ack_id: `phase-6-${id}-ack` });
  for (const [suffix, text] of [['inspect', 'Осмотреть место крушения подробно.'], ['camp', 'Дойти до рыбацкого стана.'], ['clue', 'Показать Еремею синюю шерсть.'], ['route', 'Пройти известной тропой к старой сушильне.'], ['surrender', 'Предложить Ратше условную защиту и потребовать сдачи.'], ['treatment', 'Оказать Онисиму первую помощь.']]) await runtime.submitTurn(party.party_id, turn(`${id}-${suffix}`, text));
  return party;
}
async function assertTerminal(pool, partyId, before, expectedAttempts = 1) {
  const state = await snapshot(pool, partyId);
  assert.deepEqual(body(state), [79, 35, 57]);
  assert.equal(Number(state.clock.whole_minutes), Number(before.clock.whole_minutes) + 20);
  assert.equal(state.phase6_carry_execution.status, 'completed');
  const onisim = actor(state, 'onisim_boatman'); const ratsha = actor(state, 'ratsha_storehouse_helper');
  assert.equal(onisim.machine_state.spatial_zone_ref, 'fire_rest_area');
  assert.equal(ratsha.machine_state.observation_state, 'surrendered_under_group_observation');
  assert.deepEqual(state.knowledge.filter(({ fact_id }) => ['onisim_carried_to_camp_committed', 'ratsha_under_group_observation_committed'].includes(fact_id)).map(({ fact_id }) => fact_id).sort(), ['onisim_carried_to_camp_committed', 'ratsha_under_group_observation_committed']);
  for (const template of ['trace_ld_v1_item_fishing_net', 'trace_ld_v1_item_carry_poles']) {
    const persisted = await resource(pool, partyId, template);
    assert.equal(persisted.item_id,
      before.items.find(({ template_id }) => template_id === template).item_id,
    `${template} is the exact Phase 5 resource`);
    assert.equal(persisted.use_state, template.endsWith('net')
      ? 'temporary_leg_splint_support' : 'temporary_leg_splint_frame');
  }
  assert.equal(await phase6Attempts(pool, partyId), expectedAttempts);
  assert.equal(await phase6TerminalEffectCount(pool, partyId), 1);
}
async function assertInterruptedResume(pool, pins) {
  const counters = { rng_factories: 0, rng_draws: 0, now: 0 }; const runtime = buildRuntime({ pool, ...pins, counters }); const party = await readyParty(runtime, 'interrupted'); const before = await snapshot(pool, party.party_id);
  await insertBoundary(pool, before, 5);
  await runtime.submitTurn(party.party_id, turn('phase-6-paused', 'Сделать носилки и отнести Онисима в стан.'));
  const paused = await snapshot(pool, party.party_id);
  assert.equal(paused.phase6_carry_execution.status, 'paused'); assert.equal(paused.phase6_carry_execution.cumulative_elapsed_minutes, 5); assert.equal(await phase6Attempts(pool, party.party_id), 1);
  const restarted = buildRuntime({ pool, ...pins, counters }); await restarted.getPartyScreen(party.party_id);
  assert.equal(await boundaryStatus(pool, party.party_id), 'resolved');
  await restarted.submitTurn(party.party_id, turn('phase-6-resume', 'Сделать носилки и отнести Онисима в стан.'));
  await assertTerminal(pool, party.party_id, before, 2);
  assert.deepEqual(await phase6PlayerBodyEffectTimestamp(pool,
    party.party_id), plusMinutes(before.clock, 10));
  const completed = await snapshot(pool, party.party_id);
  assert.equal(completed.phase6_history.length, 2);
  assert.equal(completed.phase6_history[1].activity_execution_id,
    paused.phase6_history[0].activity_execution_id);
  assert.equal(completed.phase6_history[1].traversal_interval.route_plan_execution_id,
    paused.phase6_history[0].traversal_interval.route_plan_execution_id);
  assert.equal(completed.phase6_history[1].internal_rebinding.elapsed_minutes,
    10);
  assert.equal(completed.phase6_history[1].internal_rebinding
    .route_progress_ppm,
    500000);
  assert.equal(completed.phase6_history[1].internal_rebinding
    .applied_in_this_attempt, true);
}
async function assertInterruptedAfterRebindResume(pool, pins) {
  const counters = { rng_factories: 0, rng_draws: 0, now: 0 };
  const runtime = buildRuntime({ pool, ...pins, counters });
  const party = await readyParty(runtime, 'interrupted-after-rebind');
  const before = await snapshot(pool, party.party_id);
  await insertBoundary(pool, before, 12);
  await runtime.submitTurn(party.party_id, turn('phase-6-paused-after-rebind',
    'Сделать носилки и отнести Онисима в стан.'));
  const paused = await snapshot(pool, party.party_id);
  assert.equal(paused.phase6_carry_execution.status, 'paused');
  assert.equal(paused.phase6_carry_execution.cumulative_elapsed_minutes, 12);
  assert.equal(paused.phase6_carry_execution.progress_ppm, 600000);
  assert.equal(paused.phase6_carry_execution.internal_rebinding_applied, true);
  assert.deepEqual(body(paused), [79, 35, 57]);
  assert.equal(await phase6TerminalEffectCount(pool, party.party_id), 1);
  assert.deepEqual(await phase6PlayerBodyEffectTimestamp(pool,
    party.party_id), plusMinutes(before.clock, 10));
  assert.equal(paused.phase6_history[0].body_effects_by_subject.filter(
    ({ subject_ref: subject }) => subject === 'player_clerk').length, 1);

  const restarted = buildRuntime({ pool, ...pins, counters });
  await restarted.getPartyScreen(party.party_id);
  assert.equal(await boundaryStatus(pool, party.party_id), 'resolved');
  await restarted.submitTurn(party.party_id, turn(
    'phase-6-resume-after-rebind',
    'Сделать носилки и отнести Онисима в стан.'));
  await assertTerminal(pool, party.party_id, before, 2);
  const completed = await snapshot(pool, party.party_id);
  assert.equal(completed.phase6_history[1].internal_rebinding
    .applied_in_this_attempt, false);
  assert.equal(completed.phase6_history[1].body_effects_by_subject.some(
    ({ subject_ref: subject }) => subject === 'player_clerk'), false);
  assert.equal(await phase6TerminalEffectCount(pool, party.party_id), 1);
  assert.deepEqual(await phase6PlayerBodyEffectTimestamp(pool,
    party.party_id), plusMinutes(before.clock, 10));
}
async function assertSameTimeHazardCascade(pool, pins) {
  const observedCarrierGroups = [];
  let resolverCalls = 0;
  let partyId;
  const resolver = (candidate, { projection }) => {
    resolverCalls += 1;
    if (candidate.boundary_id.includes('phase6-interruption')
        && !candidate.boundary_id.endsWith(':reaction')) {
      const phase6State = structuredClone(projection.phase6_state);
      const replacement = actor(phase6State,
        selectedParticipatingFisher(phase6State));
      const camp = phase6State.prepared_scenes.find(
        ({ location_profile_ref: ref }) =>
          ref === 'trace_ld_v1_loc_fishing_camp'
      ) ?? phase6State.first_entry_preparation?.scene;
      replacement.anchor_id = camp.anchor.instance_id;
      const eventProposal = resolvedEventProposal(candidate, projection);
      const writeSet = {
        appends: [], inserts: [], deletes: [],
        updates: [{ target_table: 'party_npcs', id: replacement.instance_id,
          record: { party_id: phase6State.party_id,
            npc_id: replacement.instance_id,
            anchor_id: null } }]
      };
      return { disposition: 'execute', proposals: [eventProposal, {
        proposal_id: `hazard:${candidate.boundary_id}`,
        write_target: `npc-anchor:${replacement.instance_id}`,
        write_set: writeSet,
        expected_state_versions: [],
        physical_keys: [
          `party_runtime.party_npcs:${replacement.instance_id}`
        ],
        canonical_digest: canonicalDigest(writeSet)
      }], state_projection: { ...projection, phase6_state: phase6State },
      follow_up_candidates: [reactionCandidate(phase6State, candidate)] };
    }
    observedCarrierGroups.push([...(projection.active_carrier_ids ?? [])]);
    return { disposition: 'execute', proposals: [{
      proposal_id: `reaction:${candidate.boundary_id}`,
      write_target: `npc-reaction:${candidate.boundary_id}`
    }], state_projection: projection, follow_up_candidates: [] };
  };
  const runtime = buildRuntime({ pool, ...pins,
    temporalBoundaryResolver: resolver });
  const party = await readyParty(runtime, 'same-time-hazard');
  partyId = party.party_id;
  const before = await snapshot(pool, partyId);
  await insertBoundary(pool, before, 10);
  const input = turn('phase-6-same-time-hazard',
    'Сделать носилки и отнести Онисима в стан.');
  const result = await runtime.submitTurn(partyId, input);
  const paused = await snapshot(pool, partyId);
  assert.equal(paused.phase6_carry_execution.status, 'paused');
  assert.equal(paused.phase6_carry_execution.progress_ppm, 500000);
  assert.equal(paused.phase6_carry_execution.internal_rebinding_applied,
    false);
  assert.deepEqual(body(paused), [79, 35, 57]);
  const replacement = actor(paused, selectedParticipatingFisher(paused));
  assert.equal(replacement.anchor_id, null,
    'legacy NPC projection has no modern first-entry anchor');
  assert.equal(await boundaryStatus(pool, partyId), 'resolved');
  assert.ok(paused.phase6_history[0].attempt.processed_boundary_ids.includes(
    `event:${partyId}:phase6-interruption:reaction`
  ), 'source-owner reaction is committed in the Phase 6 attempt trace');
  assert.ok(observedCarrierGroups.some((ids) =>
    ids.includes(paused.actor_id)
    && !ids.includes(replacement.instance_id)));
  const callsBeforeReplay = resolverCalls;
  assert.deepEqual(await buildRuntime({ pool, ...pins,
    temporalBoundaryResolver: resolver }).submitTurn(partyId, input), result);
  assert.equal(resolverCalls, callsBeforeReplay,
    'outer persisted replay does not invoke temporal source owner again');
  assert.equal(await phase6Attempts(pool, partyId), 1);
  assert.equal(await phase6TerminalEffectCount(pool, partyId), 1);

  const rollbackRuntime = buildRuntime({ pool, ...pins,
    temporalBoundaryResolver: resolver });
  const rollbackParty = await readyParty(rollbackRuntime,
    'same-time-hazard-rollback');
  const rollbackBefore = await snapshot(pool, rollbackParty.party_id);
  await insertBoundary(pool, rollbackBefore, 10);
  await pool.query(`ALTER TABLE party_runtime.party_temporal_events
    ADD CONSTRAINT phase6_temporal_batch_rollback_probe
    CHECK (status <> 'resolved') NOT VALID`);
  try {
    await assert.rejects(() => rollbackRuntime.submitTurn(
      rollbackParty.party_id,
      turn('phase-6-same-time-hazard-rollback',
        'Сделать носилки и отнести Онисима в стан.')
    ), { code: 'TRACE_PHASE_6_COMMIT_FAILED' });
  } finally {
    await pool.query(`ALTER TABLE party_runtime.party_temporal_events
      DROP CONSTRAINT phase6_temporal_batch_rollback_probe`);
  }
  assert.deepEqual(await snapshot(pool, rollbackParty.party_id),
    rollbackBefore, 'failed same-time batch leaves the snapshot unchanged');
  assert.equal(await boundaryStatus(pool, rollbackParty.party_id), 'pending');
  assert.equal(await phase6Attempts(pool, rollbackParty.party_id), 0);
  assert.equal(await phase6TerminalEffectCount(
    pool, rollbackParty.party_id), 0);
}

function reactionCandidate(state, parent) {
  return {
    boundary_id: `${parent.boundary_id}:reaction`,
    boundary_kind: 'exact_timer',
    scheduled_at: structuredClone(parent.scheduled_at),
    source_ref: { entity_kind: 'party_route_plan_execution_event',
      entity_id: `${parent.boundary_id}:reaction` },
    primary_subject_ref: { entity_kind: 'npc',
      entity_id: actor(state, 'ratsha_storehouse_helper').instance_id },
    subject_refs: [], scope_ref: { entity_kind: 'party',
      entity_id: state.party_id },
    rule_ref: structuredClone(parent.rule_ref),
    policy_ref: structuredClone(parent.policy_ref),
    preconditions_digest: 'c'.repeat(64),
    resolution_class: 'reaction_decision', interrupt_effect: 'background',
    visibility_policy_ref: { entity_ref: {
      entity_kind: 'visibility_modifier', entity_id: 'visible'
    }, authoring_version: 'v1' },
    idempotency_key: `${parent.idempotency_key}:reaction`,
    causal_parent_refs: [{ entity_kind: 'temporal_boundary_candidate',
      entity_id: parent.boundary_id }]
  };
}
function body(state) { return [state.body_state.health, state.body_state.energy, state.body_state.satiety]; }
function selectedParticipatingFisher(state) {
  return state.sealed_selections.find(
    ({ selection_kind: kind }) => kind === 'audience'
  ).records[0].selected_id;
}
function actor(state, slot) { const values = state.npcs.filter(({ participant_slot_ref }) => participant_slot_ref === slot); assert.equal(values.length, 1, slot); return values[0]; }
async function snapshot(pool, partyId) { return (await pool.query('SELECT state_payload FROM party_runtime.party_state_snapshots WHERE party_id=$1 ORDER BY state_version DESC LIMIT 1', [partyId])).rows[0].state_payload; }
async function phase6Attempts(pool, partyId) { return (await pool.query(`SELECT count(*)::int AS count FROM party_runtime.party_timed_activity_attempts WHERE activity_execution_id=$1`, [`activity:${partyId}:trace-phase6:carry`])).rows[0].count; }
async function phase6PlayerBodyEffectTimestamp(pool, partyId) {
  const result = await pool.query(
    `SELECT occurred_at_whole_minutes::text AS whole_minutes,
            occurred_at_subminute_numerator::text AS subminute_numerator,
            occurred_at_subminute_denominator::text AS subminute_denominator
       FROM party_runtime.party_body_temporal_history
      WHERE party_id=$1 AND subject_kind='player_character'
        AND effect_ref->>'activity_execution_id'=$2`,
    [partyId, `activity:${partyId}:trace-phase6:carry`]
  );
  assert.equal(result.rowCount, 1);
  return result.rows[0];
}
function plusMinutes(timestamp, minutes) {
  return addElapsedTime(timestamp, { exact_minutes: {
    numerator: String(minutes), denominator: '1'
  } });
}
async function resource(pool, partyId, template) { return (await pool.query(`SELECT i.item_id,i.state->>'use_state' AS use_state FROM party_runtime.party_items i WHERE i.party_id=$1 AND i.template_id=$2`, [partyId, template])).rows[0]; }
async function normalizedResource(pool, partyId, template) {
  const result = await pool.query(
    `SELECT i.item_id,i.template_id,i.profile_id,i.condition_state,
            i.state->'inventory_profile_snapshot' AS inventory_profile,
            i.state->>'accessibility' AS accessibility,
            i.state->>'use_state' AS use_state,
            i.state ? 'owner_ref' AS has_owner_ref,
            i.state->>'owner_ref' AS owner_ref,
            i.state->>'controller_npc_id' AS state_controller_npc_id,
            (i.state->>'water_portions_remaining')::int
              AS water_portions_remaining,
            p.holder_npc_id,p.physical_position,
            o.ownership_id,o.owner_npc_id,
            o.controller_npc_id AS ownership_controller_npc_id
       FROM party_runtime.party_items i
       JOIN party_runtime.party_item_placements p
         ON p.party_id=i.party_id AND p.item_id=i.item_id
       LEFT JOIN party_runtime.party_ownership o
         ON o.party_id=i.party_id AND o.item_id=i.item_id
      WHERE i.party_id=$1 AND i.template_id=$2`, [partyId, template]);
  assert.equal(result.rowCount, 1, `one normalized ${template}`);
  return result.rows[0];
}
async function assertReleasedSupportResources(pool, partyId, state) {
  const eremey = actor(state, 'eremey_fisher');
  const rope = await normalizedResource(pool, partyId,
    'trace_ld_v1_item_ratsha_binding_rope');
  const vessel = await normalizedResource(pool, partyId,
    'trace_ld_v1_item_eremey_drinking_water_vessel');
  assert.ok(rope.inventory_profile,
    `rope inventory profile snapshot: ${JSON.stringify(rope)}`);
  assert.ok(vessel.inventory_profile,
    `vessel inventory profile snapshot: ${JSON.stringify(vessel)}`);
  assert.deepEqual({
    mass: rope.inventory_profile.mass_grams,
    form: rope.inventory_profile.carry_form,
    hands: rope.inventory_profile.external_hand_cost,
    ownership: rope.ownership_id,
    has_owner_ref: rope.has_owner_ref,
    owner_ref: rope.owner_ref,
    holder: rope.holder_npc_id,
    controller: rope.state_controller_npc_id,
    position: rope.physical_position,
    condition: rope.condition_state,
    use: rope.use_state
  }, {
    mass: 1200, form: 'long', hands: 1, ownership: null,
    has_owner_ref: true,
    owner_ref: null,
    holder: eremey.instance_id, controller: eremey.instance_id,
    position: 'external_load', condition: 'serviceable',
    use: 'coiled_ready_for_reuse'
  });
  assert.deepEqual({
    mass: vessel.inventory_profile.mass_grams,
    form: vessel.inventory_profile.carry_form,
    hands: vessel.inventory_profile.external_hand_cost,
    holder: vessel.holder_npc_id,
    controller: vessel.ownership_controller_npc_id,
    portions: vessel.water_portions_remaining,
    use: vessel.use_state
  }, {
    mass: 100, form: 'compact', hands: 0,
    holder: eremey.instance_id, controller: eremey.instance_id,
    portions: 0, use: 'empty_after_onisim_drink'
  });
  assert.equal(state.items.filter(({ template_id }) =>
    template_id === 'trace_ld_v1_item_ratsha_binding_rope').length, 1);
  return { rope, vessel };
}
function assertCarrierAdmission(terminal, checkpoint, released) {
  const history = terminal.phase6_history[0];
  const rebind = history.internal_rebinding;
  const eremey = actor(checkpoint, 'eremey_fisher');
  const ratsha = actor(checkpoint, 'ratsha_storehouse_helper');
  const participating = checkpoint.npcs.find(({ instance_id }) =>
    instance_id === checkpoint.promise_instances[0].witness_slot_bindings
      .trace_ld_v1_audience_slot_participating_fisher);
  assert.ok(participating, 'resolved participating fisher');
  assert.deepEqual(rebind.initial_carrier_ids, [
    checkpoint.actor_id, eremey.instance_id, ratsha.instance_id
  ]);
  assert.equal(rebind.replacement_carrier_id, participating.instance_id);
  const byActor = new Map(history.carrier_inventory_snapshots.map(
    (entry) => [entry.actor_id, entry]
  ));
  const eremeyGarments = checkpoint.items.filter((item) =>
    item.placement?.holder_npc_id === eremey.instance_id
      && item.placement?.physical_position === 'equipped');
  assert.equal(eremeyGarments.length, 2);
  assert.deepEqual([...byActor.keys()].sort(), [checkpoint.actor_id,
    eremey.instance_id, ratsha.instance_id,
    participating.instance_id].sort());
  assert.deepEqual({
    item_ids: byActor.get(eremey.instance_id).item_ids,
    mass: byActor.get(eremey.instance_id).total_mass_grams,
    strength: byActor.get(eremey.instance_id).strength,
    load: byActor.get(eremey.instance_id).load_category,
    at_limit: byActor.get(eremey.instance_id).at_load_limit,
    load_evaluation: byActor.get(eremey.instance_id).load_evaluation,
    hands_used_before: byActor.get(eremey.instance_id)
      .hands_used_before_activity,
    hands_free_before: byActor.get(eremey.instance_id)
      .hands_free_before_activity,
    required_free_hands: byActor.get(eremey.instance_id)
      .required_free_external_hands,
    activity_grip_hands: byActor.get(eremey.instance_id)
      .activity_grip_hands,
    hands_used_with_activity: byActor.get(eremey.instance_id)
      .hands_used_with_activity
  }, {
    item_ids: [released.rope.item_id, released.vessel.item_id,
      ...eremeyGarments.map(({ item_id: id }) => id)].sort(),
    mass: 2950,
    strength: null,
    load: null,
    at_limit: null,
    load_evaluation: 'not_evaluated_without_approved_strength',
    hands_used_before: 1,
    hands_free_before: 1,
    required_free_hands: 1,
    activity_grip_hands: 1,
    hands_used_with_activity: 2
  });
  const checkpoints = terminal.last_turn.consequence.carry.intent
    .inventory_admission_checkpoints;
  assert.deepEqual(checkpoints.map((entry) => ({
    checkpoint: entry.checkpoint,
    elapsed: entry.cumulative_elapsed_minutes,
    required: entry.required_free_external_hands,
    carriers: entry.active_carrier_ids
  })), [{
    checkpoint: 'activity_start', elapsed: 0, required: 1,
    carriers: [checkpoint.actor_id, eremey.instance_id, ratsha.instance_id]
  }, {
    checkpoint: 'exact_internal_rebind', elapsed: 10, required: 1,
    carriers: [eremey.instance_id, ratsha.instance_id,
      participating.instance_id]
  }]);
}
async function phase6TerminalEffectCount(pool, partyId) {
  return (await pool.query(
    `SELECT count(*)::int AS count
       FROM party_runtime.party_body_temporal_history
      WHERE party_id=$1 AND history_id LIKE $2`, [partyId,
      `body-history:activity:${partyId}:trace-phase6:carry:%`])).rows[0].count;
}
async function phase6RouteExecutionCount(pool, partyId) {
  return (await pool.query(
    `SELECT count(*)::int AS count
       FROM party_runtime.party_route_plan_executions
      WHERE party_id=$1 AND id=$2`, [partyId,
      `route-execution:${partyId}:trace-phase6:carry`])).rows[0].count;
}
async function assertTamperRejected(pool, runtime, partyId) {
  const executionId = `activity:${partyId}:trace-phase6:carry`;
  const row = (await pool.query('SELECT cumulative_elapsed_numerator FROM party_runtime.party_timed_activity_executions WHERE id=$1', [executionId])).rows[0];
  await pool.query('ALTER TABLE party_runtime.party_timed_activity_executions DISABLE TRIGGER ALL');
  try { await pool.query('UPDATE party_runtime.party_timed_activity_executions SET cumulative_elapsed_numerator=19 WHERE id=$1', [executionId]); await assert.rejects(() => runtime.getPartyScreen(partyId), { code: 'TRACE_PHASE_2_SESSION_READ_INVALID' }); }
  finally { await pool.query('UPDATE party_runtime.party_timed_activity_executions SET cumulative_elapsed_numerator=$2 WHERE id=$1', [executionId, row.cumulative_elapsed_numerator]); await pool.query('ALTER TABLE party_runtime.party_timed_activity_executions ENABLE TRIGGER ALL'); }
  const bodyTimestamp = await phase6PlayerBodyEffectTimestamp(pool, partyId);
  await pool.query(
    'ALTER TABLE party_runtime.party_body_temporal_history DISABLE TRIGGER ALL'
  );
  try {
    await pool.query(
      `UPDATE party_runtime.party_body_temporal_history
          SET occurred_at_whole_minutes=occurred_at_whole_minutes+1
        WHERE party_id=$1 AND effect_ref->>'activity_execution_id'=$2`,
      [partyId, executionId]
    );
    await assert.rejects(() => runtime.getPartyScreen(partyId),
      { code: 'TRACE_PHASE_2_SESSION_READ_INVALID' });
  } finally {
    await pool.query(
      `UPDATE party_runtime.party_body_temporal_history
          SET occurred_at_whole_minutes=$3,
              occurred_at_subminute_numerator=$4,
              occurred_at_subminute_denominator=$5
        WHERE party_id=$1 AND effect_ref->>'activity_execution_id'=$2`,
      [partyId, executionId, bodyTimestamp.whole_minutes,
        bodyTimestamp.subminute_numerator,
        bodyTimestamp.subminute_denominator]
    );
    await pool.query(
      'ALTER TABLE party_runtime.party_body_temporal_history ENABLE TRIGGER ALL'
    );
  }
  const rope = await normalizedResource(pool, partyId,
    'trace_ld_v1_item_ratsha_binding_rope');
  await pool.query(
    `UPDATE party_runtime.party_items
        SET state=jsonb_set(state,'{use_state}',
          '"tampered_after_release"'::jsonb,true)
      WHERE party_id=$1 AND item_id=$2`, [partyId, rope.item_id]);
  try {
    await assert.rejects(() => runtime.getPartyScreen(partyId),
      { code: 'TRACE_PHASE_2_SESSION_READ_INVALID' });
  } finally {
    await pool.query(
      `UPDATE party_runtime.party_items
          SET state=jsonb_set(state,'{use_state}',to_jsonb($3::text),true)
        WHERE party_id=$1 AND item_id=$2`,
    [partyId, rope.item_id, rope.use_state]);
  }
}
async function insertBoundary(pool, state, afterMinutes) {
  const eventId = `event:${state.party_id}:phase6-interruption`;
  await pool.query(`INSERT INTO party_runtime.party_temporal_events(event_id,party_id,event_kind,status,scheduled_at_whole_minutes,scheduled_at_subminute_numerator,scheduled_at_subminute_denominator,rule_ref,policy_ref,preconditions_digest,idempotency_key,change_set_id) VALUES($1,$2,'phase_6_test_interruption','pending',$3,$4,$5,$6::jsonb,$7::jsonb,$8,$9,$10)`, [eventId, state.party_id, String(Number(state.clock.whole_minutes) + afterMinutes), state.clock.subminute_numerator, state.clock.subminute_denominator, JSON.stringify({ entity_ref: { entity_kind: 'action_contract', entity_id: 'phase_6_test_interruption_rule' }, authoring_version: 'v1', resolution_class: 'execution_outcome' }), JSON.stringify({ entity_ref: { entity_kind: 'activity_contract', entity_id: 'phase_6_test_interruption_policy' }, authoring_version: 'v1' }), 'b'.repeat(64), eventId, `${eventId}:created`]);
  await pool.query(
    `INSERT INTO party_runtime.party_temporal_event_subjects(
       event_id,subject_kind,subject_id,subject_role)
     VALUES($1,'player_character',$2,'carrier')`,
    [eventId, state.actor_id]
  );
}
async function boundaryStatus(pool, partyId) {
  return (await pool.query(
    `SELECT status FROM party_runtime.party_temporal_events
      WHERE event_id=$1 AND party_id=$2`,
    [`event:${partyId}:phase6-interruption`, partyId]
  )).rows[0]?.status;
}
function narration(request_id) { return { version: 1, schema: 'narration_flow_result', request_id, surface: 'turn', status: 'approved', pass: true, approved_output: { version: 1, schema: 'narration_output', output_id: `narration:${request_id}`, prose: 'Факты сохранены.', action_options: [], used_references: [], self_check: { no_new_world_facts: true } }, final_audit: { version: 1, schema: 'narration_audit', pass: true, concerns: [], evidence: ['visible_context'] }, repair_request: null, generation_history: [], audit_history: [], repair_history: [], diagnostics: {} }; }
async function installSchemas(pool) { const files = (await readdir('schemas/party-db')).filter((file) => /^\d+.*\.sql$/u.test(file)).sort(); const catalogMigrationIndex = files.findIndex((file) => file.startsWith('012_')); assert.equal(catalogMigrationIndex, 11); for (const file of files.slice(0, catalogMigrationIndex)) await pool.query(await readFile(`schemas/party-db/${file}`, 'utf8')); assert.equal((await runPartyRuntimeCatalogMigration(pool)).status, 'applied'); for (const file of files.slice(catalogMigrationIndex)) await pool.query(await readFile(`schemas/party-db/${file}`, 'utf8')); }
async function waitForPostgres(name, user) { for (let i = 0; i < 30; i += 1) { if (docker(['exec', name, 'pg_isready']).status === 0 && docker(['exec', name, 'psql', '-U', user, '-d', user, '-c', 'SELECT 1']).status === 0) { await new Promise((resolve) => setTimeout(resolve, 750)); return; } await new Promise((resolve) => setTimeout(resolve, 500)); } throw new Error('PostgreSQL did not become ready'); }
