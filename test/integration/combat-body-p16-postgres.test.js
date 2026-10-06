import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { initializeBodyState, projectCombatBodyStateDescriptions } from
  '@rus/body-state';
import { activateCombatSessionForPlayerIntent, combatIntentFromOperation,
  createCombatSession, initializeCombatSession, prepareCombatExchange } from
  '@rus/turn';
import { computeSpatialV3CanonicalDigest } from '@rus/contracts/spatial-v3/registry';
import { buildCombinedWritePlan } from '../../packages/turn/src/spatial-v3-write-plan.js';
import { createSpatialV3PostgresCombinedAtomicCommitter } from
  '../../apps/game-server/src/infrastructure/postgres/spatial-v3-combined-atomic-committer.js';
import { withSceneNpcs } from
  '../../apps/game-server/src/infrastructure/postgres/scene-npcs-readback.js';
import { projectTraceCombatWorkingState } from
  '../../apps/game-server/src/runtime/lower-dvina-trace-combat-working-state.js';
import { createCombatMinD65ProbeData, loadCombatMinDataPackage,
  loadCombatMinScopedBodyProfile } from
  '../../apps/game-server/src/runtime/combat-min-data.js';
import { projectTraceCombatSubjectiveState } from
  '../../apps/game-server/src/runtime/lower-dvina-trace-combat-subjective.js';
import { testContainerLabel } from '../helpers/test-containers.js';
import { combatWrites } from
  '../../apps/game-server/src/infrastructure/postgres/lower-dvina-trace-combat-writes.js';
import { expectedVersions } from
  '../../apps/game-server/src/infrastructure/postgres/lower-dvina-trace-combat-commit.js';
import { loadApprovedMaterializedNpcBodyInitializationProfile } from
  '../../apps/game-server/src/runtime/combat-min-data.js';
import { appendPhase4CombatInitialization } from
  '../../apps/game-server/src/infrastructure/postgres/lower-dvina-trace-phase-4-combat-writes.js';

const docker = (args) => spawnSync('docker', args, {
  encoding: 'utf8', timeout: 45_000
});
const at = { whole_minutes: '1', subminute_numerator: '0',
  subminute_denominator: '1' };
const ref = (entity_kind, entity_id) => ({ entity_kind, entity_id });
const bodyMetrics = ({ health, energy, satiety }) => ({
  health, energy, satiety
});

function combatSession(npcId) {
  const npc = ref('npc', npcId);
  const player = ref('player_character', 'player-1');
  return { schema: 'combat_session_v1', combat_id: 'combat-p16',
    state_version: '1', status: 'active', started_at: at,
    scope_ref: ref('location', 'combat-site'),
    participant_refs: [npc, player], participant_states: [
      { actor_ref: npc, combat_status: 'active', current_intent: null,
        next_action_boundary_ref: null },
      { actor_ref: player, combat_status: 'active', current_intent: {
        schema: 'combat_intent_v1', intent_id: 'intent-player-1',
        combat_id: 'combat-p16', actor_ref: player, intent_kind: 'engage',
        target_refs: [npc], protected_refs: [], scope_ref: null,
        destination_ref: null, force_limit: 'ordinary',
        risk_posture: 'ordinary', persistence: 'until_decision_boundary',
        created_from_boundary_ref: ref('npc_decision_boundary',
          'boundary-player-1'), state_version: '1', status: 'active' },
      next_action_boundary_ref: null }
    ], exchange_ordinal: 0, last_exchange_ref: null,
    player_response_required: false, last_change_set_ref: null };
}

async function runOwnerExchange({ session, npcId, bodyState, idempotencyKey }) {
  return prepareCombatExchange({ session,
    working_state: { actor_states: {
      [`npc:${npcId}`]: { body_state: structuredClone(bodyState) },
      'player_character:player-1': { body_state: {
        health: 100, energy: 100, satiety: 100 } }
    } }, occurred_at: at, idempotency_key: idempotencyKey,
    random_source: { next: () => 0.5 }, body_threshold_profile: null,
    ports: {
      resolveCombatTiming: () => ({ occurred_at: at,
        exact_duration: { exact_minutes: { numerator: '1', denominator: '1' } } }),
      resolveExecutionProfile: () => ({ preconditions_digest: 'fixture-approved',
        check_request: { target_defense: 1, attribute_value: 20,
          skill_bonus: 0, weapon_danger: 4, target_protection: 0,
          target_vulnerability: 0 } }),
      orderTechnicalSteps: ({ proposals }) => proposals,
      applyItemTransitions: ({ working_state }) => ({ working_state }),
      applyPositionTransitions: ({ working_state }) => ({ working_state }),
      resolvePerceptionAndDecisionContexts: async ({ session: current,
        working_state }) => ({ session_after: current, working_state,
        signal_records: [] })
    }
  });
}

async function runCommonOwnerRequest({ request, sceneState,
  bodyInitializationProfile, initializedSession = null }) {
  const player = ref('player_character', sceneState.actor_id);
  const npc = ref('npc', request.target_npc_id);
  const ownerInitializedSession = initializedSession
    ?? await createCommonOwnerSession(request, sceneState.actor_id);
  const operation = request.operation;
  const intent = combatIntentFromOperation(operation, {
    combat_id: ownerInitializedSession.combat_id,
    intent_id: `intent:${request.request_id}`,
    created_from_boundary_ref: { entity_kind: 'player_combat_response_boundary',
      entity_id: `boundary:${request.request_id}` },
    state_version: ownerInitializedSession.state_version });
  const active = activateCombatSessionForPlayerIntent(ownerInitializedSession,
    intent);
  const participantState = { ...sceneState,
    npcs: sceneState.npcs.map((actor) => actor.instance_id === npc.entity_id
      ? { ...actor, body_state_initialization_profile:
        bodyInitializationProfile } : actor) };
  const workingState = projectTraceCombatWorkingState(participantState, active);
  assert.equal(workingState.actor_states[`npc:${npc.entity_id}`]
    .body_state.health, bodyInitializationProfile.initial_state.health);
  const exchange = await prepareCombatExchange({ session: active,
    working_state: workingState,
    occurred_at: at, idempotency_key: request.idempotency_key,
    random_source: { next: () => 0.5 }, body_threshold_profile: null,
    ports: {
      resolveCombatTiming: () => ({ occurred_at: at,
        exact_duration: { exact_minutes: { numerator: '1', denominator: '1' } } }),
      resolveExecutionProfile: () => ({ preconditions_digest: 'test-only-approved',
        check_request: { target_defense: 1, attribute_value: 20,
          skill_bonus: 0, weapon_danger: 4, target_protection: 0,
          target_vulnerability: 0 } }),
      orderTechnicalSteps: ({ proposals }) => proposals,
      applyItemTransitions: ({ working_state }) => ({ working_state }),
      applyPositionTransitions: ({ working_state }) => ({ working_state }),
      resolvePerceptionAndDecisionContexts: async ({ session: current,
        working_state: currentWorkingState }) => ({ session_after: current,
        working_state: currentWorkingState, signal_records: [] })
    } });
  return { session: active, exchange };
}

async function createCommonOwnerSession(request, actorId) {
  const session = createCombatSession({ combat_id: request.combat_id,
    started_at: at, scope_ref: ref('location', 'combat-site'),
    participant_refs: [ref('player_character', actorId),
      ref('npc', request.target_npc_id)] });
  return (await initializeCombatSession({ session,
    decision_contexts: [] })).session;
}

function productionBodyWrite({ partyId, npcId, ordinal, changeSetId,
  idempotencyKey, requestId = `request-${ordinal}`, priorSession, priorNpc,
  prepared }) {
  const runtimeNpc = { ...priorNpc,
    machine_state: priorNpc.machine_state ?? {} };
  const factual = { player_input: { idempotency_key: idempotencyKey,
    request_id: requestId },
  mode_resolution: { turn_id: `turn-${ordinal}`, decision_trace: {} },
  time_update: { clock_after: at },
  consequence: { combat_kind: 'exchange', combat: prepared } };
  const state = { party_id: partyId, actor_id: 'player-1',
    party_state: { state_version: ordinal, session_state_version: ordinal,
      clock_state_version: ordinal, body_state_version: 1 },
    body_state: { health: 100, energy: 100, satiety: 100 }, clock: at,
    knowledge: [], items: [], combat_sessions: [priorSession],
    npcs: [runtimeNpc], opening_identity: { opening_screen_digest: 'fixture' } };
  const next = { ...state, party_state: { ...state.party_state,
    state_version: ordinal + 1 }, npcs: [runtimeNpc] };
  const writes = combatWrites({ partyId, state, next, factual,
    turnNumber: ordinal + 1, changeSetId, idemId: `idem-${ordinal}`,
    visibleEnvelope: {}, pendingScreen: {} });
  const inserted = writes.inserts.filter(({ target_table }) =>
    target_table === 'party_actor_body_states');
  const updated = writes.updates.filter(({ target_table }) =>
    target_table === 'party_actor_body_states');
  assert.equal(inserted.length + updated.length, 1,
    'production combat writer must emit one NPC body write');
  const bodyWrite = inserted[0] ?? updated[0];
  const expectedBodyVersions = expectedVersions({ partyId, state, factual })
    .filter(({ target_table }) =>
      target_table === 'party_actor_body_states');
  const expectedSessionVersions = expectedVersions({ partyId, state, factual })
    .filter(({ target_table }) =>
      target_table === 'party_combat_sessions');
  const sessionWrite = writes.updates.find(({ target_table }) =>
    target_table === 'party_combat_sessions');
  return { mode: inserted.length === 1 ? 'insert' : 'update', bodyWrite,
    expectedBodyVersions, expectedSessionVersions, sessionWrite };
}

test('combat NPC body P16 insert/update rolls back atomically and replays idempotently', async (t) => {
  if (docker(['version']).status !== 0) return t.skip('Docker required');
  const suffix = randomUUID().replaceAll('-', '');
  const container = `combat-body-p16-${process.pid}`;
  let client;
  let pool;
  t.after(async () => {
    if (pool) await pool.end();
    if (client) await client.end();
    docker(['rm', '-fv', container]);
  });

  assert.equal(docker(['run', ...testContainerLabel(), '-d', '-p',
    '127.0.0.1::5432', '--name', container, '-e', 'POSTGRES_PASSWORD=p16',
    '-e', 'POSTGRES_USER=p16', '-e', 'POSTGRES_DB=p16',
    'postgres:16-alpine']).status, 0);
  let ready = false;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 300));
    if (docker(['exec', container, 'pg_isready', '-h', '127.0.0.1', '-U',
      'p16', '-d', 'p16']).status === 0) {
      ready = true;
      break;
    }
  }
  assert.equal(ready, true, 'isolated PostgreSQL must become ready');
  const port = Number(docker(['port', container, '5432']).stdout
    .match(/:(\d+)/u)?.[1]);
  client = new pg.Client({ host: '127.0.0.1', port, user: 'p16',
    password: 'p16', database: 'p16' });
  await client.connect();

  for (let version = 1; version <= 26; version += 1) {
    const file = `${String(version).padStart(3, '0')}_`;
    const { readdir } = await import('node:fs/promises');
    const match = (await readdir('schemas/party-db')).find((name) =>
      name.startsWith(file));
    assert.ok(match, `party schema migration ${file} must exist`);
    await client.query(await readFile(`schemas/party-db/${match}`, 'utf8'));
  }
  await client.query(await readFile(
    'schemas/party-db/034_party_runtime_actor_base_attributes.sql', 'utf8'));

  const partyId = `combat-body-party-${suffix}`;
  const npcId = `combat-body-npc-${suffix}`;
  const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url));
  const packageData = await loadCombatMinDataPackage(repositoryRoot);
  const probe = createCombatMinD65ProbeData(packageData);
  const approvedBodyBands = await loadCombatMinScopedBodyProfile(repositoryRoot);
  const testOnlyBodyBandContext = {
    ...approvedBodyBands,
    qualitativeProfile: {
      ...structuredClone(approvedBodyBands.qualitativeProfile),
      test_fixture_only: true,
      metrics: Object.fromEntries(Object.entries(
        approvedBodyBands.qualitativeProfile.metrics).map(([metric, data]) => [
        metric, { ...data, bands: data.bands.map((band) => ({ ...band,
          npc_description: `Тестовая фраза: ${band.npc_description}` })) }
      ]))
    }
  };
  const initializedBody = initializeBodyState({ body_state_profile: {
    schema: probe.bodyInitializationProfileFixture.schema,
    status: probe.bodyInitializationProfileFixture.status,
    profile_ref: probe.bodyInitializationProfileFixture.profile_ref,
    initial_state: probe.bodyInitializationProfileFixture.initial_state
  } });
  assert.equal(initializedBody.ok, true);
  const profileRef = initializedBody.profile_ref;
  const firstExchange = await runOwnerExchange({ session: combatSession(npcId),
    npcId, bodyState: initializedBody.body_state,
    idempotencyKey: `combat-body-exchange-1-${suffix}` });
  assert.equal(firstExchange.status, 'prepared');
  assert.equal(firstExchange.prepared.check_results.length, 1);
  assert.equal(firstExchange.prepared.harm_packages.length, 1);
  assert.equal(firstExchange.prepared.body_transitions.some(({ actor_ref: actor }) =>
    actor.entity_kind === 'npc' && actor.entity_id === npcId), true);
  const afterFirstExchange = firstExchange.prepared.working_state_after
    .actor_states[`npc:${npcId}`].body_state;
  assert.ok(afterFirstExchange.health < initializedBody.body_state.health);
  const firstOwnerWrite = productionBodyWrite({ partyId, npcId, ordinal: 1,
    changeSetId: `combat-body-change-${suffix}-1`,
    idempotencyKey: `combat-body-exchange-1-${suffix}`,
    priorSession: combatSession(npcId), priorNpc: { instance_id: npcId,
      body_profile_ref: profileRef, body_state_persisted: false,
      machine_state: {} }, prepared: firstExchange.prepared });
  assert.equal(firstOwnerWrite.mode, 'insert');
  assert.deepEqual(firstOwnerWrite.expectedBodyVersions, []);
  await client.query(`INSERT INTO party_runtime.parties
    (party_id,schema_version,world_revision_id,world_catalog_digest,
     materializer_version,rng_version,command_catalog_digest,
     profile_bundle_digest,status)
    VALUES ($1,3,'fixture-world','fixture-catalog','fixture-materializer',
      'fixture-rng','fixture-commands','fixture-profiles','active')`, [partyId]);
  pool = new pg.Pool({ host: '127.0.0.1', port, user: 'p16',
    password: 'p16', database: 'p16', max: 2 });
  const committer = createSpatialV3PostgresCombinedAtomicCommitter({ pool,
    recheck: async () => ({ ok: true }) });

  const makePlan = async ({ ordinal, idempotencyKey, ownerWrite,
    targetNpcId = npcId, planLabelOverride = null,
    operationKind = 'combat_exchange' }) => {
    const planLabel = planLabelOverride
      ?? (targetNpcId === npcId ? suffix : `${suffix}-${targetNpcId}`);
    const changeSetId = `combat-body-change-${planLabel}-${ordinal}`;
    const idempotencyId = `combat-body-idem-${planLabel}-${ordinal}`;
    const packageId = `combat-body-visible-${planLabel}-${ordinal}`;
    const visiblePayload = {
      schema: 'temporal_visible_package.v1',
      perceived_scene: 'Состояние сохранено.', perceived_changes: [],
      sensory_details: [], visible_npcs: [], visible_objects: [],
      known_context: [], uncertainties: [], hypotheses: [],
      player_safe_interruption: null, allowed_action_affordances: []
    };
    const dependencyPins = [{ dependency_role: 'source_authoring',
      entity_ref: { entity_kind: 'world_revision', entity_id: 'temporal-v4' },
      version_pin: { pin_kind: 'authoring_version',
        authoring_version: '4.3.0-target.1', state_version: null } }];
    const envelope = {
      package_id: packageId, party_id: partyId,
      turn_id: `turn-${planLabel}-${ordinal}`,
      committed_state_version: String(ordinal), change_set_id: changeSetId,
      package_digest: computeSpatialV3CanonicalDigest(visiblePayload),
      visible_payload: visiblePayload, presentation_status: 'pending',
      projection_policy_ref: { entity_ref: { entity_kind: 'visibility_modifier',
        entity_id: 'projection-v1' }, authoring_version: '4.3.0-target.1' },
      dependency_pins: { pins: dependencyPins,
        canonical_digest: computeSpatialV3CanonicalDigest(dependencyPins)
          .replace('sha256:', '') },
      idempotency_record_id: idempotencyId
    };
    const record = { id: changeSetId, party_id: partyId,
      operation_kind: operationKind, idempotency_record_id: idempotencyId,
      expected_state_version_set_digest: 'expected',
      expected_state_version_set: [], committed_state_version_set_digest: 'committed',
      write_plan_digest: `${changeSetId}-digest`, created_at_turn: 0,
      committed_at_turn: 0 };
    const built = await buildCombinedWritePlan({
      plan_id: `combat-body-plan-${planLabel}-${ordinal}`,
      party_id: partyId, write_plan_kind: 'semantic_commit',
      operation_kind: operationKind,
      canonical_input_digest: computeSpatialV3CanonicalDigest({
        partyId, npcId: targetNpcId, ordinal, idempotencyKey }),
      expected_state_versions: ownerWrite.expectedStateVersions
        ?? ownerWrite.expectedBodyVersions,
      validation_report: { status: 'pass', digest:
        computeSpatialV3CanonicalDigest({ ordinal,
          write: ownerWrite.bodyWrite ?? ownerWrite.sessionInsert }) },
      idempotency: { id: idempotencyId, key: idempotencyKey },
      change_set: { id: changeSetId }, visible_package_envelope: envelope,
      approved_write_sets: [ownerWrite.approvedWriteSet ?? {
        inserts: ownerWrite.mode === 'insert' ? [ownerWrite.bodyWrite] : [],
        updates: ownerWrite.mode === 'update' ? [ownerWrite.bodyWrite] : [],
        appends: []
      }, {
        inserts: [], updates: [], appends: [{
          target_table: 'party_v3_change_sets', id: changeSetId, record
        }]
      }],
      lock_context: { owner_keys: ownerWrite.ownerKeys
        ?? [`actor:${targetNpcId}`], execution_keys: [],
        g4_keys: [], physical_keys: [
          ...(ownerWrite.bodyWrite == null ? [] : [
            `party_runtime.party_actor_body_states:npc:${targetNpcId}`]),
          ...((ownerWrite.sessionWrite ?? ownerWrite.sessionInsert) == null
            ? [] : [`party_runtime.party_combat_sessions:${
              (ownerWrite.sessionWrite ?? ownerWrite.sessionInsert).id}`]),
          `party_runtime.party_v3_change_sets:${changeSetId}`
        ] },
      commit_rechecks: ['physical', 'state', 'pin', 'endpoint', 'route',
        'capacity', 'time', 'change_set'].map((kind) => ({ kind,
        digest: computeSpatialV3CanonicalDigest({ kind, ordinal }) }))
    }, { verifyApproval: async () => ({ ok: true }) });
    assert.equal(built.ok, true, JSON.stringify(built));
    return built.plan;
  };

  const insertedPlan = await makePlan({ ordinal: 1,
    idempotencyKey: `combat-body-exchange-1-${suffix}`,
    ownerWrite: firstOwnerWrite });
  const inserted = await committer.commit({ plan: insertedPlan });
  assert.equal(inserted.ok, true, JSON.stringify(inserted));
  assert.equal((await committer.commit({ plan: insertedPlan })).replay, true);
  assert.deepEqual((await client.query(`SELECT health,energy,satiety,state_version
    FROM party_runtime.party_actor_body_states
    WHERE party_id=$1 AND actor_kind='npc' AND actor_id=$2`,
  [partyId, npcId])).rows[0], {
    health: String(afterFirstExchange.health),
    energy: String(afterFirstExchange.energy),
    satiety: String(afterFirstExchange.satiety), state_version: '1'
  });
  const participantRef = { entity_kind: 'npc', entity_id: npcId };
  const reloadSnapshot = () => ({ combat_sessions: [{ status: 'paused_for_player',
    participant_refs: [participantRef] }], npcs: [{ instance_id: npcId,
    body_state_profile: { schema: 'fixture-profile' },
    body_state_persisted: false }] });
  const afterInsert = await withSceneNpcs(pool, partyId, reloadSnapshot());
  assert.deepEqual(afterInsert.npcs[0].body_state,
    bodyMetrics(afterFirstExchange));
  assert.equal(afterInsert.npcs[0].body_state_version, 1);
  assert.equal(afterInsert.npcs[0].body_state_persisted, true);
  assert.deepEqual(afterInsert.npcs[0].body_profile_ref, profileRef);
  const afterRestart = await withSceneNpcs(pool, partyId,
    structuredClone(reloadSnapshot()));
  assert.deepEqual(afterRestart.npcs[0].body_state,
    afterInsert.npcs[0].body_state);
  assert.equal(afterRestart.npcs[0].body_state_version, 1);
  const firstHandoff = projectCombatBodyStateDescriptions({
    body_state: afterRestart.npcs[0].body_state,
    qualitative_profile: probe.qualitativeProfile,
    data_approval: probe.dataApproval, mode: probe.mode
  });
  assert.equal(firstHandoff.ok, true);
  assert.equal(firstHandoff.body_state_descriptions[0].npc_description,
    'Здоровье высокое.');
  const firstSubjective = projectTraceCombatSubjectiveState(participantRef, {
    npcs: [{ instance_id: npcId, subjective_body_state: {
      condition_summary: 'устаревшая проза' } }],
    actor_states: { [`npc:${npcId}`]: { body_state: afterRestart.npcs[0].body_state } }
  }, { combatDataProbe: probe });
  assert.deepEqual(firstSubjective.body.body_state_descriptions,
    firstHandoff.body_state_descriptions);
  assert.doesNotMatch(JSON.stringify(firstSubjective), /100|80|70|устаревшая/u);
  await client.query(`INSERT INTO party_runtime.party_materialization_runs
    (party_id,run_id,g4_id,run_kind,seed_digest,input_digest,catalog_digest,
     materializer_version,rng_version,result_digest,idempotency_key,status)
    VALUES ($1,'run:1','g4:1','baseline','seed','input','catalog','test','test',
      'result','run-key','committed')`, [partyId]);
  await client.query(`INSERT INTO party_runtime.party_npcs
    (party_id,npc_id,run_id,profile_set_id,profile_level,machine_state)
    VALUES ($1,$2,'run:1','npc-profile','scene',$3::jsonb)`,
  [partyId, npcId, JSON.stringify({ runtime_status: 'available' })]);
  await client.query(`INSERT INTO party_runtime.party_actor_profile_bindings
    (party_id,actor_kind,actor_id,role_ref,occupation_ref,
     skill_profile_snapshot,name_profile_snapshot,language_profile_snapshot,
     knowledge_profile_snapshot,profile_candidate_set_digest,
     created_change_set_id,updated_change_set_id)
    VALUES ($1,'npc',$2,'{}','{}','{}','{}','{}','{}','fixture-digest',$3,$3)`,
  [partyId, npcId, `combat-body-change-${suffix}-1`]);

  const ownerNpcId = `combat-body-owner-npc-${suffix}`;
  const sceneSiteId = `combat-body-owner-site-${suffix}`;
  const sceneBaselineId = `combat-body-owner-baseline-${suffix}`;
  const g6Id = `combat-body-owner-g6-${suffix}`;
  const scenePositionId = `combat-body-owner-position-${suffix}`;
  const sceneChangeSetId = `combat-body-change-${suffix}-1`;
  await client.query(`INSERT INTO party_runtime.party_g5_sites
    (id,party_id,origin,parent_g4_id,canonical_g5_ref,status,state_version,
     created_change_set_id,updated_change_set_id)
    VALUES ($1,$2,'canonical','fixture-g4',$3::jsonb,'active',1,$4,$4)`,
  [sceneSiteId, partyId,
    JSON.stringify({ entity_kind: 'g5_site', entity_id: sceneSiteId }),
    sceneChangeSetId]);
  await client.query(`INSERT INTO party_runtime.party_scene_baselines
    (id,party_id,host_kind,host_id,source_kind,scene_template_ref,
     materialization_trace_id,materializer_version,catalog_digest,status,
     state_version,created_change_set_id,updated_change_set_id)
    VALUES ($1,$2,'g5_site',$3,'canonical_template','{}','fixture-trace',
      'fixture','fixture','active',1,$4,$4)`,
  [sceneBaselineId, partyId, sceneSiteId, sceneChangeSetId]);
  await client.query(`INSERT INTO party_runtime.party_g6_instances
    (id,party_id,scene_baseline_id,source_scene_template_ref,scene_slot_key,
     host_kind,host_id,physical_class_id,primary_scene_role_id,
     vertical_context_id,overhead_cover_id,intra_g6_visibility_mode,
     default_visibility_distance_band,acoustic_uniformity,status,state_version,
     created_change_set_id,updated_change_set_id)
    VALUES ($1,$2,$3,'{}','fixture-slot','g5_site',$4,'open','role','surface',
      'none','default_clear','near','uniform','active',1,$5,$5)`,
  [g6Id, partyId, sceneBaselineId, sceneSiteId, sceneChangeSetId]);
  await client.query(`INSERT INTO party_runtime.scene_position_nodes
    (id,party_id,g6_instance_id,position_type_id,template_slot_key,
     template_instance_ordinal,capacity,access_class_id,status,state_version,
     created_change_set_id,updated_change_set_id)
    VALUES ($1,$2,$3,'standing','fixture-slot',0,4,'public','active',1,$4,$4)`,
  [scenePositionId, partyId, g6Id, sceneChangeSetId]);
  await client.query(`INSERT INTO party_runtime.party_npcs
    (party_id,npc_id,run_id,profile_set_id,profile_level,machine_state)
    VALUES ($1,$2,'run:1','npc-profile','scene',$3::jsonb)`,
  [partyId, ownerNpcId, JSON.stringify({ runtime_status: 'available' })]);
  await client.query(`INSERT INTO party_runtime.party_actor_profile_bindings
    (party_id,actor_kind,actor_id,role_ref,occupation_ref,
     skill_profile_snapshot,name_profile_snapshot,language_profile_snapshot,
     knowledge_profile_snapshot,profile_candidate_set_digest,
     created_change_set_id,updated_change_set_id)
    VALUES ($1,'npc',$2,'{}','{}','{}','{}','{}','{}','fixture-digest',$3,$3)`,
  [partyId, ownerNpcId, sceneChangeSetId]);
  await client.query(`INSERT INTO party_runtime.entity_placements
    (party_id,entity_kind,entity_id,placement_kind,position_node_id,
     occupies_capacity_units,state_version,updated_change_set_id)
    VALUES ($1,'npc',$2,'scene_position',$3,1,1,$4)`,
  [partyId, ownerNpcId, scenePositionId, sceneChangeSetId]);

  const ownerSceneSeed = { party_id: partyId, actor_id: 'player-1',
    body_state: { health: 100, energy: 100, satiety: 100 },
    position: { site_id: sceneSiteId }, combat_sessions: [], npcs: [] };
  const ownerSceneBefore = await withSceneNpcs(pool, partyId,
    structuredClone(ownerSceneSeed));
  const ownerNpcBefore = ownerSceneBefore.npcs.find(({ instance_id: id }) =>
    id === ownerNpcId);
  assert.ok(ownerNpcBefore?.scene_readback_present);
  assert.equal(ownerNpcBefore.body_state, null);
  assert.equal(ownerNpcBefore.body_state_persisted, false);
  assert.deepEqual(ownerSceneBefore.combat_sessions, []);
  assert.equal((await client.query(`SELECT count(*)::int AS count
    FROM party_runtime.party_combat_sessions
    WHERE party_id=$1 AND combat_id=$2`,
  [partyId, `combat-owner-${suffix}`])).rows[0].count, 0);
  assert.equal((await client.query(`SELECT count(*)::int AS count
    FROM party_runtime.party_actor_body_states
    WHERE party_id=$1 AND actor_kind='npc' AND actor_id=$2`,
  [partyId, ownerNpcId])).rows[0].count, 0);
  const ownerBodyInitializationProfile =
    await loadApprovedMaterializedNpcBodyInitializationProfile();
  const ownerRequest = Object.freeze({ request_id: `combat-owner-request-${suffix}`,
    combat_id: `combat-owner-${suffix}`, target_npc_id: ownerNpcId,
    idempotency_key: `combat-owner-idem-${suffix}`,
    operation: Object.freeze({ op: 'request_combat',
      actor_ref: ref('player_character', 'player-1'), intent_kind: 'engage',
      target_refs: Object.freeze([ref('npc', ownerNpcId)]),
      protected_refs: Object.freeze([]),
      scope_ref: null, destination_ref: null,
      force_limit: 'ordinary', risk_posture: 'ordinary' }) });
  const executeOwnerRequest = async () => {
    const initializedSession = await createCommonOwnerSession(ownerRequest,
      ownerSceneBefore.actor_id);
    const initLabel = `${suffix}-${ownerNpcId}-init`;
    const initChangeSetId = `combat-body-change-${initLabel}-1`;
    const initWrites = { inserts: [], updates: [], appends: [] };
    appendPhase4CombatInitialization({ ...initWrites, partyId,
      changeSetId: initChangeSetId,
      rootTurnId: ownerRequest.request_id, workingRevision: 2,
      initialization: { session: initializedSession, decision_records: [] } });
    const sessionInsert = initWrites.inserts.find(({ target_table }) =>
      target_table === 'party_combat_sessions');
    assert.ok(sessionInsert);
    const initCommit = await committer.commit({ plan: await makePlan({
      ordinal: 1, idempotencyKey: `${ownerRequest.idempotency_key}:session-init`,
      targetNpcId: ownerNpcId, planLabelOverride: initLabel,
      operationKind: 'combat_session_initialization',
      ownerWrite: { sessionInsert, ownerKeys: [
        `actor:${ownerSceneBefore.actor_id}`, `actor:${ownerNpcId}` ],
        expectedStateVersions: [],
        approvedWriteSet: { inserts: initWrites.inserts,
          updates: initWrites.updates, appends: initWrites.appends } }
    }) });
    assert.equal(initCommit.ok, true, JSON.stringify(initCommit));
    const { session: ownerSession, exchange } = await runCommonOwnerRequest({
      request: ownerRequest, sceneState: ownerSceneBefore,
      bodyInitializationProfile: ownerBodyInitializationProfile,
      initializedSession });
    assert.equal(exchange.status, 'prepared');
    assert.equal(exchange.prepared.body_transitions.some(({ actor_ref: actor }) =>
      actor.entity_kind === 'npc' && actor.entity_id === ownerNpcId), true);
    const ownerWrite = productionBodyWrite({ partyId, npcId: ownerNpcId,
      ordinal: 1,
      changeSetId: `combat-body-change-${suffix}-${ownerNpcId}-1`,
      idempotencyKey: ownerRequest.idempotency_key,
      requestId: ownerRequest.request_id,
      priorSession: ownerSession, priorNpc: ownerNpcBefore,
      prepared: exchange.prepared });
    assert.equal(ownerWrite.mode, 'insert');
    assert.deepEqual(ownerWrite.expectedBodyVersions, []);
    assert.ok(ownerWrite.sessionWrite);
    assert.deepEqual(ownerWrite.expectedSessionVersions, [{
      target_table: 'party_combat_sessions', id: ownerRequest.combat_id,
      state_version: 1
    }]);
    const exchangeCommit = await committer.commit({ plan: await makePlan({ ordinal: 1,
      idempotencyKey: ownerRequest.idempotency_key,
      targetNpcId: ownerNpcId,
      operationKind: 'combat_exchange',
      ownerWrite: { ...ownerWrite,
        ownerKeys: [`actor:${ownerSceneBefore.actor_id}`,
          `actor:${ownerNpcId}`],
        expectedStateVersions: ownerWrite.expectedSessionVersions,
        approvedWriteSet: { inserts: [ownerWrite.bodyWrite],
          updates: [ownerWrite.sessionWrite], appends: [] } } }) });
    return { initCommit, exchangeCommit, exchange };
  };
  const ownerCommit = await executeOwnerRequest();
  assert.equal(ownerCommit.initCommit.ok, true,
    JSON.stringify(ownerCommit.initCommit));
  assert.equal(ownerCommit.exchangeCommit.ok, true,
    JSON.stringify(ownerCommit.exchangeCommit));
  assert.equal(ownerCommit.exchange.prepared.session_after.state_version, '2');
  const ownerSceneAfter = await withSceneNpcs(pool, partyId,
    structuredClone(ownerSceneSeed));
  const ownerNpcAfter = ownerSceneAfter.npcs.find(({ instance_id: id }) =>
    id === ownerNpcId);
  assert.ok(ownerNpcAfter.body_state.health < 100);
  assert.equal(ownerNpcAfter.body_state_persisted, true);
  assert.equal(ownerNpcAfter.body_state_version, 1);
  const replayedOwnerCommit = await executeOwnerRequest();
  assert.equal(replayedOwnerCommit.initCommit.ok, true,
    JSON.stringify(replayedOwnerCommit.initCommit));
  assert.equal(replayedOwnerCommit.initCommit.replay, true);
  assert.equal(replayedOwnerCommit.exchangeCommit.ok, true,
    JSON.stringify(replayedOwnerCommit.exchangeCommit));
  assert.equal(replayedOwnerCommit.exchangeCommit.replay, true);
  assert.deepEqual((await client.query(`SELECT health,energy,satiety,state_version
    FROM party_runtime.party_actor_body_states
    WHERE party_id=$1 AND actor_kind='npc' AND actor_id=$2`,
  [partyId, ownerNpcId])).rows[0], {
    health: String(ownerNpcAfter.body_state.health),
    energy: String(ownerNpcAfter.body_state.energy),
    satiety: String(ownerNpcAfter.body_state.satiety), state_version: '1'
  });
  assert.equal((await client.query(`SELECT count(*)::int AS count
    FROM party_runtime.party_actor_body_states
    WHERE party_id=$1 AND actor_kind='npc' AND actor_id=$2`,
  [partyId, ownerNpcId])).rows[0].count, 1);
  assert.equal((await client.query(`SELECT count(*)::int AS count
    FROM party_runtime.party_v3_change_sets WHERE id=$1`,
  [`combat-body-change-${suffix}-${ownerNpcId}-1`])).rows[0].count, 1);
  assert.equal((await client.query(`SELECT count(*)::int AS count
    FROM party_runtime.party_v3_change_sets WHERE id=$1`,
  [`combat-body-change-${suffix}-${ownerNpcId}-init-1`])).rows[0].count, 1);
  assert.equal((await client.query(`SELECT count(*)::int AS count
    FROM party_runtime.party_command_idempotency
    WHERE party_id=$1 AND idempotency_key=$2`,
  [partyId, ownerRequest.idempotency_key])).rows[0].count, 1);
  assert.deepEqual((await client.query(`SELECT state_version,status
    FROM party_runtime.party_combat_sessions WHERE party_id=$1 AND combat_id=$2`,
  [partyId, ownerRequest.combat_id])).rows[0], {
    state_version: '2', status: ownerCommit.exchange.prepared.session_after.status
  });
  assert.equal((await client.query(`SELECT count(*)::int AS count
    FROM party_runtime.party_combat_sessions
    WHERE party_id=$1 AND combat_id=$2`,
  [partyId, ownerRequest.combat_id])).rows[0].count, 1);
  assert.equal((await client.query(`SELECT count(*)::int AS count
    FROM party_runtime.party_command_idempotency
    WHERE party_id=$1 AND idempotency_key=ANY($2::text[])`,
  [partyId, [ownerRequest.idempotency_key,
    `${ownerRequest.idempotency_key}:session-init`]])).rows[0].count, 2);

  const activeSession = { status: 'paused_for_player',
    participant_refs: [participantRef], participant_states: [{
      actor_ref: participantRef, combat_status: 'active', current_intent: null,
      next_action_boundary_ref: null
    }] };
  const offScene = await withSceneNpcs(pool, partyId, {
    actor_id: 'player', body_state: { health: 90 },
    position: { site_id: `site:other-${suffix}` },
    combat_sessions: [activeSession], npcs: []
  });
  assert.equal(offScene.npcs.length, 1);
  assert.equal(offScene.npcs[0].instance_id, npcId);
  assert.equal(offScene.npcs[0].body_state.health,
    afterFirstExchange.health);
  assert.equal(projectTraceCombatWorkingState(offScene, activeSession)
    .actor_states[`npc:${npcId}`].body_state.health,
    afterFirstExchange.health);
  const firstScopedWorkingState = projectTraceCombatWorkingState(offScene,
    activeSession);
  firstScopedWorkingState.npcs[0] = { ...firstScopedWorkingState.npcs[0],
    body_state: { health: 1 }, body_state_persisted: false };
  const firstScopedSubjective = projectTraceCombatSubjectiveState(
    participantRef, firstScopedWorkingState,
    { combatBodyBandContext: testOnlyBodyBandContext });
  assert.equal(testOnlyBodyBandContext.qualitativeProfile.test_fixture_only,
    true);
  assert.ok(firstScopedSubjective.body.body_state_descriptions.length > 0);
  assert.ok(firstScopedSubjective.body.body_state_descriptions.every(
    ({ npc_description }) => npc_description.startsWith('Тестовая фраза: ')));
  assert.equal(firstScopedSubjective.body.body_state_gaps.length, 0);
  assert.doesNotMatch(JSON.stringify(firstScopedSubjective.body), /100|80|70/u);

  const secondExchange = await runOwnerExchange({
    session: { ...firstExchange.prepared.session_after, status: 'active',
      player_response_required: false }, npcId,
    bodyState: afterRestart.npcs[0].body_state,
    idempotencyKey: `combat-body-exchange-2-${suffix}` });
  assert.equal(secondExchange.status, 'prepared');
  assert.equal(secondExchange.prepared.check_results.length, 1);
  assert.equal(secondExchange.prepared.harm_packages.length, 1);
  const afterSecondExchange = secondExchange.prepared.working_state_after
    .actor_states[`npc:${npcId}`].body_state;
  assert.ok(afterSecondExchange.health < afterRestart.npcs[0].body_state.health);
  const secondOwnerWrite = productionBodyWrite({ partyId, npcId, ordinal: 2,
    changeSetId: `combat-body-change-${suffix}-2`,
    idempotencyKey: `combat-body-exchange-2-${suffix}`,
    priorSession: firstExchange.prepared.session_after,
    priorNpc: afterRestart.npcs[0], prepared: secondExchange.prepared });
  assert.equal(secondOwnerWrite.mode, 'update');
  assert.deepEqual(secondOwnerWrite.expectedBodyVersions, [{
    target_table: 'party_actor_body_states', id: `npc:${npcId}`,
    state_version: 1
  }]);
  const updatedPlan = await makePlan({ ordinal: 2,
    idempotencyKey: `combat-body-exchange-2-${suffix}`,
    ownerWrite: secondOwnerWrite });
  assert.equal((await committer.commit({ plan: updatedPlan })).ok, true);
  assert.equal((await committer.commit({ plan: updatedPlan })).replay, true);
  assert.deepEqual((await client.query(`SELECT health,state_version
    FROM party_runtime.party_actor_body_states
    WHERE party_id=$1 AND actor_kind='npc' AND actor_id=$2`,
  [partyId, npcId])).rows[0], {
    health: String(afterSecondExchange.health), state_version: '2' });
  const afterUpdate = await withSceneNpcs(pool, partyId, reloadSnapshot());
  assert.deepEqual(afterUpdate.npcs[0].body_state,
    bodyMetrics(afterSecondExchange));
  assert.equal(afterUpdate.npcs[0].body_state_version, 2);
  const secondHandoff = projectCombatBodyStateDescriptions({
    body_state: afterUpdate.npcs[0].body_state,
    qualitative_profile: probe.qualitativeProfile,
    data_approval: probe.dataApproval, mode: probe.mode
  });
  assert.equal(secondHandoff.ok, true);
  assert.deepEqual(secondHandoff.body_state_descriptions,
    projectCombatBodyStateDescriptions({
      body_state: afterSecondExchange, qualitative_profile: probe.qualitativeProfile,
      data_approval: probe.dataApproval, mode: probe.mode
    }).body_state_descriptions);
  const secondSubjective = projectTraceCombatSubjectiveState(participantRef, {
    npcs: [{ instance_id: npcId, subjective_body_state: {
      condition_summary: 'устаревшая проза' } }],
    actor_states: { [`npc:${npcId}`]: { body_state: afterUpdate.npcs[0].body_state } }
  }, { combatDataProbe: probe });
  assert.deepEqual(secondSubjective.body.body_state_descriptions,
    secondHandoff.body_state_descriptions);
  assert.doesNotMatch(JSON.stringify(secondSubjective), /\b\d+\b|устаревшая/u);
  const secondScopedWorkingState = projectTraceCombatWorkingState({
    ...reloadSnapshot(), actor_id: 'player', body_state: { health: 90 },
    npcs: afterUpdate.npcs
  }, activeSession);
  secondScopedWorkingState.npcs[0] = { ...secondScopedWorkingState.npcs[0],
    body_state: { health: 1 }, body_state_persisted: false };
  const secondScopedSubjective = projectTraceCombatSubjectiveState(
    participantRef, secondScopedWorkingState,
    { combatBodyBandContext: testOnlyBodyBandContext });
  assert.ok(secondScopedSubjective.body.body_state_descriptions.length > 0);
  assert.equal(secondScopedSubjective.body.body_state_gaps.length, 0);
  assert.ok(secondScopedSubjective.body.body_state_descriptions.every(
    ({ npc_description }) => npc_description.startsWith('Тестовая фраза: ')));

  const failingPlan = await makePlan({ ordinal: 3,
    idempotencyKey: `combat-body-rollback-${suffix}`,
    ownerWrite: { ...secondOwnerWrite,
      expectedBodyVersions: [{ target_table: 'party_actor_body_states',
        id: `npc:${npcId}`, state_version: 2 }],
      bodyWrite: { ...secondOwnerWrite.bodyWrite,
        record: { ...secondOwnerWrite.bodyWrite.record,
          health: -1, updated_change_set_id:
            `combat-body-change-${suffix}-3` } } } });
  const failed = await committer.commit({ plan: failingPlan });
  assert.equal(failed.ok, false);
  assert.deepEqual((await client.query(`SELECT health,state_version
    FROM party_runtime.party_actor_body_states
    WHERE party_id=$1 AND actor_kind='npc' AND actor_id=$2`,
  [partyId, npcId])).rows[0], {
    health: String(afterSecondExchange.health), state_version: '2' });
  assert.equal((await client.query(`SELECT count(*)::int AS count
    FROM party_runtime.party_v3_change_sets WHERE id=$1`,
  [`combat-body-change-${suffix}-3`])).rows[0].count, 0);
  assert.equal((await client.query(`SELECT count(*)::int AS count
    FROM party_runtime.party_command_idempotency
    WHERE party_id=$1 AND idempotency_key=$2`,
  [partyId, `combat-body-rollback-${suffix}`])).rows[0].count, 0);
});
