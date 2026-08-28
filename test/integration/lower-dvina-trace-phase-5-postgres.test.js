import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import pg from 'pg';
import { createSeededRandomSource } from '@rus/checks-rng';
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
import { createM2ConversationModels } from '../../apps/game-server/test/lower-dvina-trace-m2-conversation-fixture.js';
import { createLowerDvinaTraceTurnStepTestModel } from '../../apps/game-server/test/lower-dvina-trace-turn-step-model-fixture.js';
import { lowerDvinaTraceConversationTemporalEffectRegistrations } from
  '../../apps/game-server/src/runtime/lower-dvina-trace-m2-conversation-temporal-effect-owner.js';
import { installLowerDvinaTraceV5World, lowerDvinaTraceV5World as world } from
  '../fixtures/lower-dvina-trace-v5-world-fixture.js';

const docker = (args) => spawnSync('docker', args, { encoding: 'utf8', timeout: 45_000 });

test('Phase 5 PostgreSQL treatment persists stages, outcomes, replay, rollback and authoritative readback', async (t) => {
  if (docker(['version']).status !== 0) return t.skip('Docker is required for isolated Phase 5 PostgreSQL integration');
  const name = `lower-dvina-phase-5-${process.pid}`;
  let pool;
  t.after(async () => { if (pool) await pool.end(); docker(['rm', '-f', name]); });
  const started = docker(['run', '-d', '--name', name, '-p', '127.0.0.1::5432', '-e', 'POSTGRES_PASSWORD=local_only', '-e', 'POSTGRES_USER=phase5', '-e', 'POSTGRES_DB=phase5', 'postgres:16-alpine']);
  assert.equal(started.status, 0, started.stderr);
  await waitForPostgres(name);
  const port = Number(docker(['port', name, '5432']).stdout.match(/:(\d+)\s*$/u)?.[1]);
  pool = new pg.Pool({ host: '127.0.0.1', port, user: 'phase5', password: 'local_only', database: 'phase5', max: 8 });
  await installSchemas(pool); await installLowerDvinaTraceV5World(pool);
  const pins = await runtimePins();

  const counters = { rng: 0, now: 0 };
  const runtime = buildRuntime({ pool, ...pins, counters, randomValue: 0.99 });
  const party = await readyParty(runtime, 'success');
  await assertArrivalResources(pool, party.party_id);
  const input = turn('phase-5-treatment',
    'Оказать Онисиму первую помощь.');
  const before = await snapshot(pool, party.party_id);
  const completed = await runtime.submitTurn(party.party_id, input);
  await assertCompleted(pool, party.party_id, 'stabilized_unable_to_walk');
  await assertAppliedTreatmentResources(pool, party.party_id);
  assert.equal((await snapshot(pool, party.party_id)).clock.whole_minutes, String(Number(before.clock.whole_minutes) + 25));
  const replayCounters = { ...counters };
  const replay = await buildRuntime({ pool, ...pins, counters, randomValue: 0.01 }).submitTurn(party.party_id, input);
  assert.deepEqual(replay, completed);
  assert.deepEqual(counters, replayCounters, 'same key must not draw RNG or obtain time');
  assert.equal(await attempts(pool, party.party_id), 1);

  const applied = await bandage(pool, party.party_id);
  const successSnapshot = await snapshot(pool, party.party_id);
  assert.deepEqual({ owner: applied.owner_npc_id, holder: applied.holder_npc_id, controller: applied.controller_npc_id, position: applied.physical_position, accessibility: applied.accessibility, condition: applied.condition_state, use: applied.use_state }, {
    owner: successSnapshot.npcs.find((npc) => npc.participant_slot_ref === 'eremey_fisher').instance_id,
    holder: successSnapshot.npcs.find((npc) => npc.participant_slot_ref === 'onisim_boatman').instance_id,
    controller: successSnapshot.npcs.find((npc) => npc.participant_slot_ref === 'onisim_boatman').instance_id,
    position: 'worn', accessibility: 'applied_not_available_as_resource', condition: 'applied_bandage', use: 'bound_to_injured_leg'
  });
  await assertTamperRejected(pool, buildRuntime({ pool, ...pins }), party.party_id, applied);

  const failureRuntime = buildRuntime({
    pool, ...pins, randomValue: 0.99, treatmentRandomValue: 0
  });
  const failureParty = await readyParty(failureRuntime, 'failure');
  await completeTreatment(failureRuntime, failureParty.party_id, 'failure');
  await assertCompleted(pool, failureParty.party_id, 'injured_unable_to_walk');
  await assertAppliedTreatmentResources(pool, failureParty.party_id);

  for (const afterMinutes of [2, 7, 20]) {
    await assertInterruptedTreatmentPath({
      pool, pins, afterMinutes
    });
  }

  const rollbackRuntime = buildRuntime({ pool, ...pins, randomValue: 0.99 });
  const rollbackParty = await readyParty(rollbackRuntime, 'rollback');
  const rollbackBefore = await snapshot(pool, rollbackParty.party_id);
  await pool.query(`ALTER TABLE party_runtime.party_item_placements ADD CONSTRAINT phase5_final_rollback_probe CHECK (physical_position <> 'worn') NOT VALID`);
  try {
    await assert.rejects(() => rollbackRuntime.submitTurn(rollbackParty.party_id,
      turn('rollback-treatment', 'Оказать Онисиму первую помощь.')),
    { code: 'TRACE_PHASE_5_COMMIT_FAILED' });
  } finally { await pool.query('ALTER TABLE party_runtime.party_item_placements DROP CONSTRAINT phase5_final_rollback_probe'); }
  assert.deepEqual(await snapshot(pool, rollbackParty.party_id), rollbackBefore);
  assert.equal(await checks(pool, rollbackParty.party_id), 0);
  assert.equal((await bandage(pool, rollbackParty.party_id)).condition_state, 'clean_serviceable');
});

async function runtimePins() {
  const bundle = await loadLowerDvinaTraceMaterializationBundle({ scenarioDefinitionRevision: 11 });
  const source = lowerDvinaTracePhase1ADomainPin(bundle);
  const runtimeCatalogPin = Object.freeze({ ...source, compatible_world_revision_id: world.revision, compatible_world_catalog_digest: world.digest, compatible_world_pin_manifest_digest: world.manifest });
  return { runtimeCatalogPin, release: Object.freeze({ release_id: 'phase-5-postgres-release', world_revision_id: world.revision, world_catalog_digest: world.digest, compatible_world_pin_manifest_digest: world.manifest }) };
}

function buildRuntime({ pool, release, runtimeCatalogPin, randomValue = 0.99,
  treatmentRandomValue = randomValue, counters = null }) {
  const committer = createSpatialV3PostgresCombinedAtomicCommitter({ pool, recheck: firstPlayableCommitRecheck, now: () => new Date('2026-07-30T08:00:00.000Z') });
  const repository = createLowerDvinaTracePhase2PostgresRepository({ partyPool: pool, committer });
  const { playerConversationModel, npcSemanticModel } =
    createM2ConversationModels();
  const turnStepModel = createLowerDvinaTraceTurnStepTestModel();
  const traceTurnRuntime = createLowerDvinaTracePhase2Runtime({ repository,
    turnStepModel,
    playerConversationModel, npcSemanticModel,
    semanticResolver: async ({ raw_text, action_set }) => ({ option_id: semanticOption(raw_text, action_set) }),
    narrator: createLowerDvinaTracePhase2DurableNarrator({ partyPool: pool, narrationService: { async run(request) { return narration(request.request_id); } } }),
    randomSourceFactory: ({ request_id }) => {
      if (counters) counters.rng += 1;
      const value = request_id === 'failure-treatment'
        ? treatmentRandomValue : randomValue;
      return roll(request_id, value);
    },
    npcDecisionSelector: async (request) => { const option = request.options.find(({ option_id }) => option_id === (request.options.some(({ option_id }) => option_id === 'surrender_without_confession') ? 'surrender_without_confession' : 'accept_first_aid')); assert.ok(option); return { request_id: request.request_id, state_version: request.state_version, option_id: option.option_id, command_token: option.command_token }; }, decisionSecret: 'phase-5-postgres-secret',
    temporalAdvanceOwner: createTemporalAdvanceOwner({
      effect_registrations:
        lowerDvinaTraceConversationTemporalEffectRegistrations()
    }),
    now: () => { if (counters) counters.now += 1; return '2026-07-30T08:00:00.000Z'; } });
  return createLowerDvinaTracePublicRuntime({ partyPool: pool, committer, release, runtimeCatalogPin, traceStartAdapter: createLowerDvinaTracePhase1BProductionAdapter({ partyPool: pool, worldPool: pool, release, runtimeCatalogPin }), traceTurnRuntime });
}

function semanticOption(raw, options) { const text = raw.toLowerCase(); const id = text.includes('осмотр') ? 'inspect_wreck_in_detail' : text.includes('показ') ? 'show_clue_and_seek_eremey_cooperation' : text.includes('сушиль') ? 'follow_known_route_to_drying_shed' : text.includes('стан') ? 'follow_path_to_fishing_camp' : text.includes('помощ') || text.includes('лечени') ? 'attempt_risky_first_aid_onisim' : 'offer_conditional_protection_and_seek_surrender'; assert.ok(options.some(({ option_id }) => option_id === id), `${id}: ${options.map(({ option_id }) => option_id)}`); return id; }
function roll(requestId, value) { const source = createSeededRandomSource(`phase-5:${requestId}`); return { next: () => value, snapshot: () => source.snapshot() }; }
function turn(request_id, raw_text) { return { request_id, idempotency_key: request_id, raw_text }; }
async function readyParty(runtime, id) {
  const party = await runtime.startNewGame({
    scenario_id: 'lower_dvina_trace_v1', request_id: `phase-5-${id}`
  });
  await runtime.acknowledgeOpening(party.party_id, {
    client_ack_id: `phase-5-${id}-ack`
  });
  for (const [suffix, text] of [
    ['inspect', 'Осмотреть место крушения подробно.'],
    ['camp', 'Дойти до рыбацкого стана.'],
    ['clue', 'Показать Еремею синюю шерсть.'],
    ['route', 'Пройти известной тропой к старой сушильне.'],
    ['surrender', 'Предложить Ратше условную защиту и потребовать сдачи.']
  ]) {
    try {
      await runtime.submitTurn(party.party_id, turn(`${id}-${suffix}`, text));
    } catch (error) {
      error.details = { ...(error.details ?? {}), phase5_setup_step: suffix };
      throw error;
    }
  }
  return party;
}
async function completeTreatment(runtime, partyId, prefix) {
  await runtime.submitTurn(partyId,
    turn(`${prefix}-treatment`, 'Оказать Онисиму первую помощь.'));
}
async function assertInterruptedTreatmentPath({ pool, pins, afterMinutes }) {
  const counters = { rng: 0, now: 0 };
  const prefix = `interrupted-${afterMinutes}`;
  const runtime = buildRuntime({
    pool, ...pins, counters, randomValue: 0.99
  });
  const party = await readyParty(runtime, prefix);
  const before = await snapshot(pool, party.party_id);
  const carrierId = participatingFisher(before).instance_id;
  await insertTreatmentBoundary(pool, before, afterMinutes);
  const input = turn(`${prefix}-treatment-start`,
    'Оказать Онисиму первую помощь.');
  await runtime.submitTurn(party.party_id, input);
  await assertProgress(pool, party.party_id, afterMinutes, 'paused', 0);
  assert.equal(await attempts(pool, party.party_id), 1);
  await assertStageResourceState(pool, party.party_id, {
    prepared: afterMinutes >= 5,
    carrierId
  });
  const paused = await snapshot(pool, party.party_id);
  assert.equal(participatingFisher(paused).instance_id, carrierId);

  const restarted = buildRuntime({
    pool, ...pins, counters, randomValue: 0.99
  });
  await restarted.getPartyScreen(party.party_id);
  await resolveTreatmentBoundary(pool, party.party_id);
  const resume = turn(`${prefix}-treatment-resume`,
    'Продолжить лечение Онисима.');
  const completed = await restarted.submitTurn(party.party_id, resume);
  await assertCompleted(pool, party.party_id,
    'stabilized_unable_to_walk', 2);
  assert.equal(await checks(pool, party.party_id), 1);
  assert.equal((await snapshot(pool, party.party_id)).clock.whole_minutes,
    String(Number(before.clock.whole_minutes) + 25));
  await assertAppliedTreatmentResources(pool, party.party_id);
  const beforeReplay = { ...counters };
  assert.deepEqual(await restarted.submitTurn(party.party_id, resume), completed);
  assert.deepEqual(counters, beforeReplay);
  assert.equal(await resourceCount(pool, party.party_id), 3);
}

async function assertArrivalResources(pool, partyId) {
  const state = await snapshot(pool, partyId);
  const carrier = participatingFisher(state);
  assert.equal(carrier.anchor_id, state.position.g5_anchor_id);
  const eremey = actorBySlot(state, 'eremey_fisher');
  const backgroundOne = actorBySlot(state, 'background_fisher_1');
  const net = await resource(pool, partyId,
    'trace_ld_v1_item_fishing_net');
  const poles = await resource(pool, partyId,
    'trace_ld_v1_item_carry_poles');
  const water = await resource(pool, partyId,
    'trace_ld_v1_item_eremey_drinking_water_vessel');
  for (const item of [net, poles]) {
    assert.equal(item.holder_npc_id, carrier.instance_id);
    assert.equal(item.controller_npc_id, carrier.instance_id);
    assert.equal(item.holder_anchor_id, state.position.g5_anchor_id);
    assert.equal(item.physical_position, 'external_load');
    assert.equal(item.accessibility, 'quick');
    assert.equal(item.use_state, 'carried_for_group_use');
  }
  assert.equal(net.owner_npc_id, eremey.instance_id);
  assert.equal(poles.owner_npc_id, backgroundOne.instance_id);
  assert.deepEqual({ profile: net.profile_id, ...net.inventory_profile_snapshot }, {
    profile: 'trace_ld_v1_inventory_profile_fishing_net_group_load',
    inventory_profile_id:
      'trace_ld_v1_inventory_profile_fishing_net_group_load',
    item_template_ref: 'trace_ld_v1_item_fishing_net',
    mass_grams: 2500, carry_form: 'long', external_hand_cost: 1,
    status: 'approved'
  });
  assert.deepEqual({ profile: poles.profile_id,
    ...poles.inventory_profile_snapshot }, {
    profile: 'trace_ld_v1_inventory_profile_carry_poles_group_load',
    inventory_profile_id:
      'trace_ld_v1_inventory_profile_carry_poles_group_load',
    item_template_ref: 'trace_ld_v1_item_carry_poles',
    mass_grams: 2500, carry_form: 'long', external_hand_cost: 1,
    status: 'approved'
  });
  assert.equal(water.owner_npc_id, eremey.instance_id);
  assert.equal(water.holder_npc_id, eremey.instance_id);
  assert.equal(water.controller_npc_id, eremey.instance_id);
  assert.equal(water.holder_anchor_id, state.position.g5_anchor_id);
  assert.equal(water.use_state, 'one_patient_drink_available');
  assert.equal(water.water_portions_remaining, 1);
  assert.equal(await resourceCount(pool, partyId), 3);
}

async function assertStageResourceState(pool, partyId, { prepared,
  carrierId }) {
  const state = await snapshot(pool, partyId);
  const net = await resource(pool, partyId,
    'trace_ld_v1_item_fishing_net');
  const poles = await resource(pool, partyId,
    'trace_ld_v1_item_carry_poles');
  const water = await resource(pool, partyId,
    'trace_ld_v1_item_eremey_drinking_water_vessel');
  for (const item of [net, poles]) {
    assert.equal(item.holder_npc_id, carrierId);
    assert.equal(item.controller_npc_id, carrierId);
    assert.equal(item.use_state, prepared
      ? 'reserved_for_onisim_treatment' : 'carried_for_group_use');
  }
  assert.equal(water.use_state, prepared
    ? 'empty_after_onisim_drink' : 'one_patient_drink_available');
  assert.equal(water.water_portions_remaining, prepared ? 0 : 1);
  const rope = actorBySlot(state, 'onisim_boatman')
    .machine_state.binding_item;
  assert.equal(rope.use_state, prepared
    ? 'coiled_ready_for_reuse' : 'binding_onisim');
  if (prepared) {
    const eremey = actorBySlot(state, 'eremey_fisher');
    assert.equal(rope.holder_npc_id, eremey.instance_id);
    assert.equal(rope.controller_npc_id, eremey.instance_id);
  }
}

async function assertAppliedTreatmentResources(pool, partyId) {
  const state = await snapshot(pool, partyId);
  const onisim = actorBySlot(state, 'onisim_boatman');
  const eremey = actorBySlot(state, 'eremey_fisher');
  const backgroundOne = actorBySlot(state, 'background_fisher_1');
  const net = await resource(pool, partyId,
    'trace_ld_v1_item_fishing_net');
  const poles = await resource(pool, partyId,
    'trace_ld_v1_item_carry_poles');
  const water = await resource(pool, partyId,
    'trace_ld_v1_item_eremey_drinking_water_vessel');
  assert.deepEqual({
    owner: net.owner_npc_id, holder: net.holder_npc_id,
    controller: net.controller_npc_id, position: net.physical_position,
    use: net.use_state
  }, {
    owner: eremey.instance_id, holder: onisim.instance_id,
    controller: onisim.instance_id, position: 'external',
    use: 'temporary_leg_splint_support'
  });
  assert.deepEqual({
    owner: poles.owner_npc_id, holder: poles.holder_npc_id,
    controller: poles.controller_npc_id, position: poles.physical_position,
    use: poles.use_state
  }, {
    owner: backgroundOne.instance_id, holder: onisim.instance_id,
    controller: onisim.instance_id, position: 'external',
    use: 'temporary_leg_splint_frame'
  });
  assert.equal(water.owner_npc_id, eremey.instance_id);
  assert.equal(water.use_state, 'empty_after_onisim_drink');
  assert.equal(water.water_portions_remaining, 0);
  assert.equal(onisim.machine_state.binding_item.use_state,
    'coiled_ready_for_reuse');
  assert.equal(await resourceCount(pool, partyId), 3);
}
async function snapshot(pool, partyId) { return (await pool.query('SELECT state_payload FROM party_runtime.party_state_snapshots WHERE party_id=$1 ORDER BY state_version DESC LIMIT 1', [partyId])).rows[0].state_payload; }
async function attempts(pool, partyId) { return (await pool.query(`SELECT count(*)::int AS count FROM party_runtime.party_timed_activity_attempts WHERE activity_execution_id=$1`, [`activity:${partyId}:trace-phase5:treatment`])).rows[0].count; }
async function checks(pool, partyId) { return (await pool.query(`SELECT count(*)::int AS count FROM party_runtime.party_check_resolutions WHERE party_id=$1 AND check_resolution_id=$2`, [partyId, `check:${partyId}:trace-phase5:treatment`])).rows[0].count; }
async function bandage(pool, partyId) { return (await pool.query(`SELECT i.item_id,i.condition_state,o.owner_npc_id,o.controller_npc_id,p.holder_npc_id,p.physical_position,COALESCE(i.state->'property_state'->>'accessibility',i.state->>'accessibility') AS accessibility,COALESCE(i.state->'property_state'->>'use_state',i.state->>'use_state') AS use_state FROM party_runtime.party_items i JOIN party_runtime.party_item_placements p ON p.party_id=i.party_id AND p.item_id=i.item_id JOIN party_runtime.party_ownership o ON o.party_id=i.party_id AND o.item_id=i.item_id WHERE i.party_id=$1 AND i.template_id='trace_ld_v1_item_bandage_cloth'`, [partyId])).rows[0]; }
async function resource(pool, partyId, templateId) {
  const result = await pool.query(
    `SELECT i.item_id,i.profile_id,i.condition_state,
            i.state->'inventory_profile_snapshot'
              AS inventory_profile_snapshot,
            i.state->>'accessibility' AS accessibility,
            i.state->>'use_state' AS use_state,
            (i.state->>'water_portions_remaining')::int
              AS water_portions_remaining,
            o.owner_npc_id,o.controller_npc_id,p.holder_npc_id,
            p.physical_position,n.anchor_id AS holder_anchor_id
       FROM party_runtime.party_items i
       JOIN party_runtime.party_item_placements p
         ON p.party_id=i.party_id AND p.item_id=i.item_id
       JOIN party_runtime.party_ownership o
         ON o.party_id=i.party_id AND o.item_id=i.item_id
       LEFT JOIN party_runtime.party_npcs n
         ON n.party_id=i.party_id AND n.npc_id=p.holder_npc_id
      WHERE i.party_id=$1 AND i.template_id=$2`, [partyId, templateId]);
  assert.equal(result.rowCount, 1, templateId);
  return result.rows[0];
}
async function resourceCount(pool, partyId) {
  return (await pool.query(
    `SELECT count(*)::int AS count FROM party_runtime.party_items
      WHERE party_id=$1 AND template_id=ANY($2::text[])`, [partyId, [
      'trace_ld_v1_item_fishing_net',
      'trace_ld_v1_item_carry_poles',
      'trace_ld_v1_item_eremey_drinking_water_vessel'
    ]])).rows[0].count;
}
function actorBySlot(state, slot) {
  const matches = state.npcs.filter(
    ({ participant_slot_ref: ref }) => ref === slot
  );
  assert.equal(matches.length, 1, slot);
  return matches[0];
}
function participatingFisher(state) {
  const id = state.promise_instances[0].witness_slot_bindings
    .trace_ld_v1_audience_slot_participating_fisher;
  const matches = state.npcs.filter((npc) => npc.instance_id === id
    && /^background_fisher_[12]$/u.test(npc.participant_slot_ref));
  assert.equal(matches.length, 1);
  return matches[0];
}
async function assertProgress(pool, partyId, elapsed, status, expectedChecks) { const state = await snapshot(pool, partyId); assert.equal(Number(state.phase5_treatment.activity_execution.progress.current.numerator), elapsed); assert.equal(state.phase5_treatment.activity_execution.status, status); assert.equal(await checks(pool, partyId), expectedChecks); }
async function assertCompleted(pool, partyId, condition, expectedAttempts = 1) { const state = await snapshot(pool, partyId); assert.equal(Number(state.phase5_treatment.activity_execution.progress.current.numerator), 25); assert.equal(state.phase5_treatment.activity_execution.status, 'completed'); assert.equal(await checks(pool, partyId), 1); assert.equal(state.npcs.find(({ participant_slot_ref }) => participant_slot_ref === 'onisim_boatman').machine_state.body_condition.state, condition); assert.equal(await attempts(pool, partyId), expectedAttempts); }
async function assertTamperRejected(pool, runtime, partyId, item) {
  await pool.query(`UPDATE party_runtime.party_item_placements SET physical_position='hands' WHERE party_id=$1 AND item_id=$2`, [partyId, item.item_id]);
  await assert.rejects(() => runtime.getPartyScreen(partyId), { code: 'TRACE_PHASE_2_SESSION_READ_INVALID' });
  await pool.query(`UPDATE party_runtime.party_item_placements SET physical_position='worn' WHERE party_id=$1 AND item_id=$2`, [partyId, item.item_id]);
  const onisim = (await pool.query(`SELECT npc_id,machine_state FROM party_runtime.party_npcs WHERE party_id=$1 AND semantic_state->>'participant_slot_ref'='onisim_boatman'`, [partyId])).rows[0];
  await pool.query('ALTER TABLE party_runtime.party_npcs DISABLE TRIGGER ALL');
  try {
    await pool.query(`UPDATE party_runtime.party_npcs SET machine_state=jsonb_set(machine_state,'{body_condition,state}','"injured_unable_to_walk"'::jsonb,true) WHERE party_id=$1 AND npc_id=$2`, [partyId, onisim.npc_id]);
    await assert.rejects(() => runtime.getPartyScreen(partyId), { code: 'TRACE_PHASE_2_SESSION_READ_INVALID' });
  } finally {
    await pool.query('UPDATE party_runtime.party_npcs SET machine_state=$3::jsonb WHERE party_id=$1 AND npc_id=$2', [partyId, onisim.npc_id, JSON.stringify(onisim.machine_state)]);
    await pool.query('ALTER TABLE party_runtime.party_npcs ENABLE TRIGGER ALL');
  }
  const execution = (await pool.query('SELECT id,cumulative_elapsed_numerator FROM party_runtime.party_timed_activity_executions WHERE id=$1', [`activity:${partyId}:trace-phase5:treatment`])).rows[0];
  await pool.query('ALTER TABLE party_runtime.party_timed_activity_executions DISABLE TRIGGER ALL');
  try {
    await pool.query('UPDATE party_runtime.party_timed_activity_executions SET cumulative_elapsed_numerator=24 WHERE id=$1', [execution.id]);
    await assert.rejects(() => runtime.getPartyScreen(partyId), { code: 'TRACE_PHASE_2_SESSION_READ_INVALID' });
  } finally {
    await pool.query('UPDATE party_runtime.party_timed_activity_executions SET cumulative_elapsed_numerator=$2 WHERE id=$1', [execution.id, execution.cumulative_elapsed_numerator]);
    await pool.query('ALTER TABLE party_runtime.party_timed_activity_executions ENABLE TRIGGER ALL');
  }
  const net = await pool.query(
    `SELECT o.ownership_id,o.owner_npc_id
       FROM party_runtime.party_ownership o
       JOIN party_runtime.party_items i
         ON i.party_id=o.party_id AND i.item_id=o.item_id
      WHERE i.party_id=$1 AND i.template_id='trace_ld_v1_item_fishing_net'`,
    [partyId]
  );
  const onisimId = (await pool.query(
    `SELECT npc_id FROM party_runtime.party_npcs
      WHERE party_id=$1
        AND semantic_state->>'participant_slot_ref'='onisim_boatman'`,
    [partyId]
  )).rows[0].npc_id;
  await pool.query(
    `UPDATE party_runtime.party_ownership SET owner_npc_id=$3
      WHERE party_id=$1 AND ownership_id=$2`,
    [partyId, net.rows[0].ownership_id, onisimId]
  );
  await assert.rejects(() => runtime.getPartyScreen(partyId),
    { code: 'TRACE_PHASE_2_SESSION_READ_INVALID' });
  await pool.query(
    `UPDATE party_runtime.party_ownership SET owner_npc_id=$3
      WHERE party_id=$1 AND ownership_id=$2`,
    [partyId, net.rows[0].ownership_id, net.rows[0].owner_npc_id]
  );
}
async function insertTreatmentBoundary(pool, state, afterMinutes) {
  const eventId = `event:${state.party_id}:phase5-interruption`;
  const onisim = state.npcs.find(
    ({ participant_slot_ref: ref }) => ref === 'onisim_boatman'
  );
  await pool.query(
    `INSERT INTO party_runtime.party_temporal_events(
       event_id,party_id,event_kind,status,
       scheduled_at_whole_minutes,scheduled_at_subminute_numerator,
       scheduled_at_subminute_denominator,rule_ref,policy_ref,
       preconditions_digest,idempotency_key,change_set_id
     ) VALUES($1,$2,'phase_5_test_interruption','pending',$3,$4,$5,
       $6::jsonb,$7::jsonb,$8,$9,$10)`, [
      eventId, state.party_id,
      String(Number(state.clock.whole_minutes) + afterMinutes),
      state.clock.subminute_numerator,
      state.clock.subminute_denominator,
      JSON.stringify({
        entity_ref: {
          entity_kind: 'event_rule',
          entity_id: 'phase_5_test_interruption_rule'
        },
        authoring_version: 'v1',
        resolution_class: 'execution_outcome'
      }),
      JSON.stringify({
        entity_ref: {
          entity_kind: 'event_policy',
          entity_id: 'phase_5_test_interruption_policy'
        },
        authoring_version: 'v1'
      }),
      'b'.repeat(64), eventId, `${eventId}:created`
    ]
  );
  await pool.query(
    `INSERT INTO party_runtime.party_temporal_event_subjects(
       event_id,subject_kind,subject_id,subject_role)
     VALUES($1,'npc',$2,'treatment_subject')`,
    [eventId, onisim.instance_id]
  );
}
async function resolveTreatmentBoundary(pool, partyId) {
  await pool.query(
    `UPDATE party_runtime.party_temporal_events
        SET status='resolved',state_version=2,
            terminal_change_set_id=$2
      WHERE event_id=$1 AND party_id=$3`,
    [`event:${partyId}:phase5-interruption`,
      `event:${partyId}:phase5-interruption:resolved`, partyId]
  );
}
function narration(request_id) { return { version: 1, schema: 'narration_flow_result', request_id, surface: 'turn', status: 'approved', pass: true, approved_output: { version: 1, schema: 'narration_output', output_id: `narration:${request_id}`, prose: 'Факты сохранены.', action_options: [], used_references: [], self_check: { no_new_world_facts: true } }, final_audit: { version: 1, schema: 'narration_audit', pass: true, concerns: [], evidence: [] }, repair_request: null, generation_history: [], audit_history: [], repair_history: [], diagnostics: {} }; }
async function installSchemas(pool) { const files = (await readdir('schemas/party-db')).filter((file) => /^\d+.*\.sql$/u.test(file)).sort(); const catalogMigrationIndex = files.findIndex((file) => file.startsWith('012_')); assert.equal(catalogMigrationIndex, 11); for (const file of files.slice(0, catalogMigrationIndex)) await pool.query(await readFile(`schemas/party-db/${file}`, 'utf8')); assert.equal((await runPartyRuntimeCatalogMigration(pool)).status, 'applied'); for (const file of files.slice(catalogMigrationIndex)) await pool.query(await readFile(`schemas/party-db/${file}`, 'utf8')); }
async function waitForPostgres(name) {
  for (let i = 0; i < 30; i += 1) {
    const ready = docker(['exec', name, 'pg_isready']).status === 0;
    const acceptsQueries = ready && docker([
      'exec', name, 'psql', '-U', 'phase5', '-d', 'phase5', '-c', 'SELECT 1'
    ]).status === 0;
    if (acceptsQueries) {
      await new Promise((resolve) => setTimeout(resolve, 750));
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error('PostgreSQL did not become ready');
}
