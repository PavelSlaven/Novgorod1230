import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import pg from 'pg';
import { canonicalDigest } from '@rus/materialization';
import { createSeededRandomSource } from '@rus/checks-rng';
import { createTemporalAdvanceOwner } from '@rus/turn/temporal-advance';
import { createFirstPlayablePublicRuntime } from
  '../../apps/game-server/src/runtime/first-playable-public-runtime.js';
import { createLowerDvinaTracePhase2Runtime } from
  '../../apps/game-server/src/runtime/lower-dvina-trace-phase-2.js';
import { lowerDvinaTraceConversationTemporalEffectRegistrations } from
  '../../apps/game-server/src/runtime/lower-dvina-trace-m2-conversation-temporal-effect-owner.js';
import { createLowerDvinaTracePhase1BProductionAdapter } from
  '../../apps/game-server/src/infrastructure/postgres/lower-dvina-trace-phase-1b.js';
import { createLowerDvinaTracePhase2PostgresRepository } from
  '../../apps/game-server/src/infrastructure/postgres/lower-dvina-trace-phase-2.js';
import { createLowerDvinaTracePhase2DurableNarrator } from
  '../../apps/game-server/src/infrastructure/postgres/lower-dvina-trace-phase-2-presentation.js';
import { createSpatialV3PostgresCombinedAtomicCommitter } from
  '../../apps/game-server/src/infrastructure/postgres/spatial-v3-combined-atomic-committer.js';
import { firstPlayableCommitRecheck } from
  '../../apps/game-server/src/infrastructure/postgres/first-playable/recheck.js';
import { loadLowerDvinaTraceMaterializationBundle } from
  '../../apps/game-server/src/internal/lower-dvina-trace-phase-1a.js';
import { npcSpeechPlan, playerPlan } from
  '../../apps/game-server/test/lower-dvina-trace-m2-conversation-fixture.js';
import { lowerDvinaTracePhase1ADomainPin } from
  '../fixtures/lower-dvina-trace-phase-1a-domain-pin.mjs';
import { runPartyRuntimeCatalogMigration } from
  '../../tools/runtime-catalog-activation/src/forward-migrations.js';

const docker = (args) => spawnSync(
  'docker', args, { encoding: 'utf8', timeout: 45_000 }
);
const world = Object.freeze({
  revision: 'novgorod_spatial_v3_production_v3_candidate_001',
  digest: '1cf914ed9a19801f94b8b1463a717dbb0be7f1d51ea2351e6d1d5a51c492215e',
  manifest: '593ccb341084f7433ec4ae9d7d0b2ea8b1dea07833636ef385550ba5a295ecea'
});

test('Phase 9 and deterministic Phase 10 persist, restart and replay atomically',
  async (t) => {
    if (docker(['version']).status !== 0) {
      t.skip('Docker is required for isolated Phase 9 PostgreSQL integration');
      return;
    }
    const name = `lower-dvina-phase-9-${process.pid}`;
    let pool;
    t.after(async () => {
      if (pool) await pool.end();
      docker(['rm', '-f', name]);
    });
    const started = docker([
      'run', '-d', '--name', name, '-p', '127.0.0.1::5432',
      '-e', 'POSTGRES_PASSWORD=local_only', '-e', 'POSTGRES_USER=phase9',
      '-e', 'POSTGRES_DB=phase9', 'postgres:16-alpine'
    ]);
    assert.equal(started.status, 0, started.stderr);
    await waitForPostgres(name);
    await new Promise((resolve) => setTimeout(resolve, 700));
    const port = Number(docker(['port', name, '5432']).stdout
      .match(/:(\d+)\s*$/u)?.[1]);
    pool = new pg.Pool({ host: '127.0.0.1', port, user: 'phase9',
      password: 'local_only', database: 'phase9', max: 8 });
    await installSchemas(pool);
    await installWorldLineage(pool);
    const bundle = await loadLowerDvinaTraceMaterializationBundle({
      scenarioDefinitionRevision: 18
    });
    assert.equal(bundle.definition_revision, 18);
    const sourcePin = lowerDvinaTracePhase1ADomainPin(bundle);
    const runtimeCatalogPin = Object.freeze({ ...sourcePin,
      compatible_world_revision_id: world.revision,
      compatible_world_catalog_digest: world.digest,
      compatible_world_pin_manifest_digest: world.manifest });
    const release = Object.freeze({ release_id: 'phase-9-postgres-release',
      world_revision_id: world.revision, world_catalog_digest: world.digest,
      compatible_world_pin_manifest_digest: world.manifest });
    const ids = {};
    const factory = () => buildRuntime({ pool, release, runtimeCatalogPin,
      ids });
    const first = factory();
    const party = await first.startNewGame({
      scenario_id: 'lower_dvina_trace_v1',
      request_id: 'phase-9-postgres-party'
    });
    await first.acknowledgeOpening(party.party_id, {
      client_ack_id: 'phase-9-postgres-ack'
    });
    await first.submitTurn(party.party_id, turn(
      'phase-9-postgres-initial-inspection',
      'Осмотреть лодку, верёвку и следы. Понять, что здесь случилось.'
    ));
    await seedPostCombatPhase9State(pool, party.party_id, ids);

    const checkpoints = [
      ['bag', 'bag_recovery', 'Забрать дорожную сумку у Жданко.'],
      ['open', 'bag_opened', 'Открыть возвращённую дорожную сумку.'],
      ['packet', 'packet_recovered',
        'Извлечь свёрток и осмотреть печать, не вскрывая документ.'],
      ['return', 'return_to_camp',
        'Вернуться всей группой к Онисиму в рыбацкий стан.'],
      ['testimony', 'onisim_testimony',
        'Попросить Онисима рассказать, что он знает о Жданко и свёртке.'],
      ['evidence', 'evidence_resolved',
        'Сопоставить печать, показание Онисима и уже известные факты.'],
      ['disposition', 'temporary_disposition',
        'Временно удержать Ратшу и Жданко до передачи властям, '
        + 'сохранить свёрток для Саввы и соблюсти обещание Ратше.']
    ];
    for (const [suffix, expectedKind, rawText] of checkpoints) {
      const before = await latestSnapshot(pool, party.party_id);
      const input = turn(`phase-9-postgres-${suffix}`, rawText);
      const result = await factory().submitTurn(party.party_id, input);
      assert.deepEqual(await factory().submitTurn(party.party_id, input),
        result);
      const snapshot = await latestSnapshot(pool, party.party_id);
      assert.equal(snapshot.phase9.checkpoints.at(-1).kind,
        expectedKind);
      if (expectedKind === 'temporary_disposition') {
        assert.equal(snapshot.completion.status, 'committed');
        assert.equal(snapshot.completion.source_commit_version,
          Number(before.party_state.state_version) + 1);
        assert.equal(Number(snapshot.party_state.state_version),
          Number(before.party_state.state_version) + 2);
        assert.equal(Number(snapshot.party_state.turn_number),
          Number(before.party_state.turn_number) + 1);
        assert.equal(Number(snapshot.clock.whole_minutes),
          Number(before.clock.whole_minutes) + 5);
      } else assert.equal(snapshot.completion == null, true);
    }

    const snapshot = await latestSnapshot(pool, party.party_id);
    assert.equal(snapshot.phase9.status,
      'temporary_disposition_committed');
    assert.equal(snapshot.completion.status, 'committed');
    assert.equal(snapshot.completion.outcome.schema,
      'rus.trace_composite_completion_outcome.v1');
    assert.equal(snapshot.completion.outcome.primary_completion_state,
      'trace_ld_v1_completion_partial');
    assert.equal(snapshot.completion.outcome.ordered_dimension_outcomes.some(
      ({ value_id: value }) => value === 'unresolved'), true);
    assert.equal(snapshot.completion.change_set_id,
      snapshot.last_turn.visible_package.change_set_id);
    assert.equal(snapshot.phase9.temporary_disposition.legal_effect,
      'temporary_disposition_only');
    assert.deepEqual(snapshot.phase9.custody_state.party_slots,
      ['ratsha_storehouse_helper', 'zhdanko_storehouse_controller']);
    assert.equal(snapshot.phase9.property_handover_plan.option_id,
      'preserve_recovered_property_for_savva_handover');
    assert.equal(snapshot.phase9.promise_memory.option_id,
      'record_no_active_promise');
    assert.equal(snapshot.promise_instances[0].temporary_disposition_memory
      .option_id, 'record_no_active_promise');
    assert.equal(snapshot.promise_instances[0].current_state, 'not_offered');
    for (const slot of snapshot.phase9.custody_state.party_slots) {
      assert.equal(snapshot.npcs.find(({ participant_slot_ref: ref }) =>
        ref === slot).machine_state.temporary_custody, true);
    }
    assert.equal(snapshot.phase9.seal_observation.document_contents_access,
      'forbidden');
    const packet = snapshot.items.find(
      ({ template_id: id }) => id === 'trace_ld_v1_item_sealed_packet');
    assert.equal(packet.placement.holder_character_id, snapshot.actor_id);
    assert.equal(packet.state.seal_state, 'intact');
    const normalized = (await pool.query(
      `SELECT i.state,p.holder_character_id,p.container_id
         FROM party_runtime.party_items i
         JOIN party_runtime.party_item_placements p
           ON p.party_id=i.party_id AND p.item_id=i.item_id
        WHERE i.party_id=$1 AND i.template_id=$2`,
      [party.party_id, 'trace_ld_v1_item_sealed_packet']
    )).rows[0];
    assert.equal(normalized.holder_character_id, snapshot.actor_id);
    assert.equal(normalized.container_id, null);
    assert.equal(normalized.state.seal_state, 'intact');
    assert.equal(normalized.state.property_state.temporary_handover_plan
      .option_id, 'preserve_recovered_property_for_savva_handover');
    const custodyRows = (await pool.query(
      `SELECT machine_state
         FROM party_runtime.party_npcs
        WHERE party_id=$1 AND npc_id = ANY($2::text[])`,
      [party.party_id, [ids.ratsha, ids.zhdanko]])).rows;
    assert.equal(custodyRows.length, 2);
    assert.equal(custodyRows.every(({ machine_state: machine }) =>
      machine.temporary_custody === true), true);
    const obligation = (await pool.query(
      `SELECT current_state,current_state_fact,state_version::int
         FROM party_runtime.party_obligations
        WHERE party_id=$1`, [party.party_id])).rows[0];
    assert.deepEqual(obligation, {
      current_state: snapshot.promise_instances[0].current_state,
      current_state_fact: snapshot.promise_instances[0].current_state_fact,
      state_version: Number(snapshot.promise_instances[0].state_version) });
    const promiseTransitions = (await pool.query(
      `SELECT transition_ordinal,from_state,to_state,transition_kind,
              causal_basis
         FROM party_runtime.party_obligation_transitions
        WHERE party_id=$1 ORDER BY transition_ordinal`,
      [party.party_id])).rows;
    assert.deepEqual(promiseTransitions.slice(-1).map((entry) => ({
      ...entry, transition_ordinal: Number(entry.transition_ordinal) })), [{
      transition_ordinal: Number(snapshot.promise_instances[0].state_version)
        - 2, from_state: 'not_offered', to_state: 'not_offered',
      transition_kind: 'temporary_disposition_promise_memory_recorded',
      causal_basis: { committed_fact_ids: [
        'temporary_promise_not_active'] } }]);
    assert.equal((await pool.query(
      `SELECT count(*)::int AS count
         FROM party_runtime.party_v3_change_sets
        WHERE party_id=$1 AND operation_kind LIKE 'trace_phase_9_%'`,
      [party.party_id])).rows[0].count, checkpoints.length);
    assert.equal((await pool.query(
      `SELECT count(*)::int AS count
         FROM party_runtime.party_v3_change_sets
        WHERE party_id=$1 AND operation_kind='trace_phase_10_completion'`,
      [party.party_id])).rows[0].count, 1);
    const completionProjection = (await pool.query(
      `SELECT visible.visible_payload,visible.presentation_status,
              narration.status AS narration_status
         FROM party_runtime.party_visible_packages visible
         JOIN party_runtime.party_narration_jobs narration
           ON narration.party_id=visible.party_id
          AND narration.package_id=visible.package_id
        WHERE visible.party_id=$1 AND visible.change_set_id=$2`,
      [party.party_id, snapshot.completion.change_set_id])).rows[0];
    assert.equal(completionProjection.presentation_status, 'pending');
    assert.equal(completionProjection.narration_status, 'delivered');
    const serializedProjection = JSON.stringify(
      completionProjection.visible_payload);
    assert.match(serializedProjection,
      /мир и его жители продолжают существовать/u);
    for (const forbidden of ['hidden_truth', 'culprit', 'motive',
      'document_contents', 'relevant_hidden_state']) {
      assert.equal(serializedProjection.includes(forbidden), false, forbidden);
    }
    await factory().getPartyScreen(party.party_id);
  });

function buildRuntime({ pool, release, runtimeCatalogPin, ids }) {
  const committer = createSpatialV3PostgresCombinedAtomicCommitter({ pool,
    recheck: firstPlayableCommitRecheck,
    now: () => new Date('2026-08-12T08:00:00.000Z') });
  const repository = createLowerDvinaTracePhase2PostgresRepository({
    partyPool: pool, committer });
  const traceTurnRuntime = createLowerDvinaTracePhase2Runtime({ repository,
    turnStepModel: (request) => phase9Plan(request, ids),
    playerConversationModel: (request) => playerPlan(request, {}),
    npcSemanticModel: (request) => npcSpeechPlan(request, {
      utteranceText: 'Голос Жданко я узнал до столкновения, затем слышал '
        + 'удар по лодке и рывок за сумку. После крушения Ратша спас меня, '
        + 'связал и перенёс к сушильне.',
      dominantAct: 'inform', claims: [testimonyClaim()],
      supportingOperations: [] }),
    npcCombatModel: () => { throw new Error('combat must not restart'); },
    semanticResolver: async ({ action_set: actionSet }) => ({
      option_id: actionSet[0].option_id }),
    narrator: createLowerDvinaTracePhase2DurableNarrator({ partyPool: pool,
      narrationService: { async run(request) {
        return approvedNarration(request.request_id);
      } } }),
    randomSourceFactory: ({ request_id: requestId }) =>
      createSeededRandomSource(`phase9:${requestId}`),
    decisionSecret: 'phase-9-postgres-secret',
    temporalAdvanceOwner: createTemporalAdvanceOwner({
      effect_registrations:
        lowerDvinaTraceConversationTemporalEffectRegistrations() }),
    now: () => '2026-08-12T08:00:00.000Z' });
  return createFirstPlayablePublicRuntime({ partyPool: pool, committer,
    release, runtimeCatalogPin,
    traceStartAdapter: createLowerDvinaTracePhase1BProductionAdapter({
      partyPool: pool, worldPool: pool, release, runtimeCatalogPin }),
    traceTurnRuntime });
}

function phase9Plan(request, ids) {
  const actor = request.actor.actor_id;
  const text = request.remaining_intent;
  let operation;
  if (text.includes('Забрать дорожную')) operation = {
    op: 'request_item_use', actor_ref: actor, use_kind: 'operate',
    item_ref: ids.bag, target_refs: [] };
  else if (text.includes('Открыть возвращённую')) operation = {
    op: 'request_container_access', actor_ref: actor, access_kind: 'open',
    container_ref: ids.bag };
  else if (text.includes('Извлечь свёрток')) operation = {
    op: 'request_item_use', actor_ref: actor, use_kind: 'operate',
    item_ref: ids.packet, target_refs: [] };
  else if (text.includes('Вернуться всей')) operation = {
    op: 'request_movement', actor_ref: actor, movement_kind: 'route',
    target_ref: 'trace_ld_v1_loc_fishing_camp' };
  else if (text.includes('Попросить Онисима')) operation = {
    op: 'emit_interaction', actor_ref: actor, interaction_kind: 'request',
    target_actor_refs: [ids.onisim], content: text, instrument_refs: [] };
  else if (text.includes('Сопоставить')) operation = activity(actor,
    ['trace_ld_v1_clue_evidence_graph_set']);
  else operation = activity(actor, dispositionSelection(request));
  return { schema: 'turn_step_plan_v1', request_id: request.request_id,
    committed_state_version: request.committed_state_version,
    working_revision: request.working_revision, step_index: request.step_index,
    interpretation: { player_goal: request.root_player_action,
      grounded_attempt: text, adaptation: 'literal' },
    resolution: 'domain_request', goal_result: 'pending',
    activity: { owner: 'domain', duration_class: null, effort: null },
    operations: [operation], check: null, continuation: null,
    clarification: null, reason_code: 'phase9_step', reason: 'approved owner' };
}

async function seedPostCombatPhase9State(pool, partyId, ids) {
  const state = await createLowerDvinaTracePhase2PostgresRepository({
    partyPool: pool,
    committer: createSpatialV3PostgresCombinedAtomicCommitter({ pool,
      recheck: firstPlayableCommitRecheck,
      now: () => new Date('2026-08-12T08:00:00.000Z') })
  }).loadPhase2State(partyId);
  const bySlot = Object.fromEntries(state.npcs.map((npc) => [
    npc.participant_slot_ref, npc.instance_id]));
  Object.assign(ids, { player: state.actor_id,
    zhdanko: bySlot.zhdanko_storehouse_controller,
    ratsha: bySlot.ratsha_storehouse_helper,
    onisim: bySlot.onisim_boatman,
    eremey: bySlot.eremey_fisher,
    fisher: bySlot.background_fisher_1,
    bag: state.containers.find(({ template_id: id }) =>
      id === 'trace_ld_v1_container_road_bag').container_id,
    packet: state.items.find(({ template_id: id }) =>
      id === 'trace_ld_v1_item_sealed_packet').item_id });
  const storehouse = state.prepared_scenes.find(
    ({ location_profile_ref: id }) =>
      id === 'trace_ld_v1_loc_zhdanko_storehouse');
  const camp = state.prepared_scenes.find(({ location_profile_ref: id }) =>
    id === 'trace_ld_v1_loc_fishing_camp');
  state.position = { ...state.position,
    g5_node_id: storehouse.node.instance_id,
    g5_anchor_id: storehouse.anchor.instance_id,
    location_ref: storehouse.location_profile_ref, zone_ref: 'storehouse_yard' };
  for (const npc of state.npcs) {
    const atCamp = npc.instance_id === ids.onisim;
    const scene = atCamp ? camp : storehouse;
    npc.anchor_id = scene.anchor.instance_id;
    npc.location_profile_ref = scene.location_profile_ref;
    npc.zone_ref = atCamp ? 'fire_side' : 'storehouse_yard';
    npc.machine_state = { ...npc.machine_state,
      location_ref: npc.location_profile_ref,
      spatial_zone_ref: npc.zone_ref };
  }
  state.player_response_boundary = null;
  state.combat_sessions = [];
  state.route_knowledge = [...new Set([...(state.route_knowledge ?? []),
    'trace_ld_v1_route_storehouse_to_camp_guarded'])];
  state.route_participant_commitments = [
    { npc_ref: npcRef(ids.eremey), role: 'guide' },
    { npc_ref: npcRef(ids.ratsha), role: 'witness' },
    { npc_ref: npcRef(ids.fisher), role: 'escort' }];
  const zhdanko = state.npcs.find(({ instance_id: id }) => id === ids.zhdanko);
  zhdanko.machine_state = { ...zhdanko.machine_state,
    surrender_state: 'surrendered_without_further_attack' };
  delete state.phase9;
  state.knowledge = [...(state.knowledge ?? []), {
    fact_id: 'ratsha_surrender_without_further_harm_committed',
    knowledge_state: 'known_from_committed_conversation_event',
    evidence_refs: ['phase9-postgres-fixture'] }];
  await pool.query('BEGIN');
  try {
    await pool.query(
      `UPDATE party_runtime.party_state_snapshots
          SET state_payload=$2::jsonb,state_digest=$3
        WHERE party_id=$1 AND state_version=$4`,
      [partyId, JSON.stringify(state), canonicalDigest(state),
        state.party_state.state_version]);
    await pool.query(
      `UPDATE party_runtime.party_positions
          SET g4_id=$2,g5_node_id=$3,g5_anchor_id=$4 WHERE party_id=$1`,
      [partyId, state.position.g4_id, state.position.g5_node_id,
        state.position.g5_anchor_id]);
    for (const npc of state.npcs) await pool.query(
      `UPDATE party_runtime.party_npcs SET anchor_id=$3,
          machine_state=$4::jsonb
        WHERE party_id=$1 AND npc_id=$2`,
      [partyId, npc.instance_id, npc.anchor_id,
        JSON.stringify(npc.machine_state)]);
    await pool.query(
      `INSERT INTO party_runtime.party_character_knowledge(
         party_id,character_id,fact_id,knowledge_state,evidence)
       VALUES($1,$2,$3,$4,$5::jsonb) ON CONFLICT DO NOTHING`,
      [partyId, state.actor_id,
        'ratsha_surrender_without_further_harm_committed',
        'known_from_committed_conversation_event',
        JSON.stringify(['phase9-postgres-fixture'])]);
    await pool.query('COMMIT');
  } catch (error) {
    await pool.query('ROLLBACK');
    throw error;
  }
}

function activity(actor, targetRefs) { return { op: 'request_activity',
  actor_ref: actor, activity_kind: 'other', target_refs: targetRefs,
  description: 'Выполнить утверждённый шаг расследования.' }; }
function dispositionSelection(request) {
  const value = request.player_safe_state.temporary_disposition_options;
  return [value.custody_option_refs[0], value.property_option_refs[0],
    value.promise_option_refs[0]];
}
function testimonyClaim() { return {
  claim_id: 'trace_ld_v1_assertion_onisim_testimony',
  content_summary: 'Онисим сообщает, что перед столкновением слышал голос '
    + 'Жданко, помнит удар шеста и рывок за сумку, а после крушения Ратша '
    + 'вытащил его из воды, связал и отнёс к сушильне.',
  form: 'assertion', speaker_posture: 'believed_true',
  source_knowledge_refs: [{ entity_kind: 'knowledge_scope',
    entity_id: 'trace_ld_v1_knowledge_scope_hired_boatman_v1' }],
  mentioned_entity_refs: [] }; }
function npcRef(id) { return { entity_kind: 'npc', entity_id: id }; }
function turn(id, rawText) { return { request_id: id, idempotency_key: id,
  raw_text: rawText }; }
function approvedNarration(requestId) {
  return { version: 1, schema: 'narration_flow_result', request_id: requestId,
    surface: 'turn', status: 'approved', pass: true,
    approved_output: { version: 1, schema: 'narration_output',
      output_id: `narration:${requestId}`, prose: 'Факты сохранены.',
      action_options: [], used_references: [],
      self_check: { no_new_world_facts: true } },
    final_audit: { version: 1, schema: 'narration_audit', pass: true,
      concerns: [], evidence: [] }, repair_request: null,
    generation_history: [], audit_history: [], repair_history: [],
    diagnostics: {} };
}
async function latestSnapshot(pool, partyId) {
  return (await pool.query(
    `SELECT state_payload FROM party_runtime.party_state_snapshots
      WHERE party_id=$1 ORDER BY state_version DESC LIMIT 1`,
    [partyId])).rows[0].state_payload;
}
async function installSchemas(pool) {
  const files = (await readdir('schemas/party-db'))
    .filter((value) => /^\d+.*\.sql$/u.test(value)).sort();
  const catalogIndex = files.findIndex((file) => file.startsWith('012_'));
  assert.equal(catalogIndex, 11);
  for (const file of files.slice(0, catalogIndex)) {
    await pool.query(await readFile(`schemas/party-db/${file}`, 'utf8'));
  }
  assert.equal((await runPartyRuntimeCatalogMigration(pool)).status, 'applied');
  for (const file of files.slice(catalogIndex)) {
    await pool.query(await readFile(`schemas/party-db/${file}`, 'utf8'));
  }
}
async function installWorldLineage(pool) {
  await pool.query('CREATE SCHEMA IF NOT EXISTS world_base');
  await pool.query(`CREATE TABLE world_base.spatial_v3_world_revisions (
    id text PRIMARY KEY, parent_revision_id text REFERENCES
      world_base.spatial_v3_world_revisions(id),
    catalog_digest text NOT NULL,status text NOT NULL)`);
  await pool.query(`INSERT INTO world_base.spatial_v3_world_revisions
    (id,parent_revision_id,catalog_digest,status) VALUES
    ('novgorod_spatial_v3_target_contract_approval_001',NULL,
     '0ed3a9388930b0245fecdf6ec8adfa08d74d5fe88d5458bd452bee20de16fb1e','approved'),
    ('novgorod_spatial_v3_production_v2_candidate_001',
     'novgorod_spatial_v3_target_contract_approval_001',
     'fd75d9cb1ad0e949ff3b0bb5ef044e510f340a967f43867e9c4d41c16ba9f255','approved'),
    ('novgorod_spatial_v3_production_v3_candidate_001',
     'novgorod_spatial_v3_production_v2_candidate_001',
     '1cf914ed9a19801f94b8b1463a717dbb0be7f1d51ea2351e6d1d5a51c492215e','approved')`);
}
async function waitForPostgres(name) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (docker(['exec', name, 'pg_isready']).status === 0) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error('PostgreSQL did not become ready');
}
