import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import pg from 'pg';
import { computeSpatialV3CanonicalDigest } from
  '@rus/contracts/spatial-v3/registry';
import { canonicalDigest } from '@rus/materialization';
import { createCombinedWritePlanBuilder, createCombatSession } from '@rus/turn';
import { createPostgresTestBackend } from '../../../test/fixtures/postgres-test-backend.js';
import { combatWrites } from '../src/infrastructure/postgres/lower-dvina-trace-combat-writes.js';
import { expectedVersions } from '../src/infrastructure/postgres/lower-dvina-trace-combat-commit.js';
import { withSceneNpcs } from '../src/infrastructure/postgres/scene-npcs-readback.js';
import { createSpatialV3PostgresCombinedAtomicCommitter } from
  '../src/infrastructure/postgres/spatial-v3-combined-atomic-committer.js';

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

test('no-site combat NPC body reload drives second P16 update without duplicate insert',
  { timeout: 180_000 }, async (t) => {
    const backend = await createPostgresTestBackend('issue_352');
    if (!backend) return t.skip('No supported PostgreSQL test backend');
    const pool = new pg.Pool({ connectionString: backend.partyUrl, max: 1 });
    t.after(async () => { await pool.end(); await backend.close(); });
    for (const file of PARTY_SCHEMA_FILES) {
      await pool.query(await readFile(new URL(
        `../../../schemas/party-db/${file}`, import.meta.url), 'utf8'));
    }

    await seedParty(pool);
    const committer = createSpatialV3PostgresCombinedAtomicCommitter({ pool,
      recheck: async () => ({ ok: true }) });
    const bodyProfileRef = { entity_ref: { entity_kind: 'body_state_profile',
      entity_id: 'approved:npc-body' }, authoring_version: 'v1' };
    const bodyStateProfile = { schema: 'rus.body_state.initialization_profile.v1' };
    const npcId = 'npc:no-position';
    const session = createCombatSession({ combat_id: 'combat:352',
      started_at: stamp(), scope_ref: { entity_kind: 'location', entity_id: 'site:352' },
      participant_refs: [
        { entity_kind: 'player_character', entity_id: 'player:352' },
        { entity_kind: 'npc', entity_id: npcId }
      ] });
    const initial = {
      party_id: 'party:352', actor_id: 'player:352',
      party_state: { state_version: 1, session_state_version: 1,
        clock_state_version: 1, body_state_version: 1, turn_number: 0 },
      body_state: { health: 100, energy: 100, satiety: 100 }, clock: stamp(),
      position: {}, combat_sessions: [session], knowledge: [], items: [],
      npcs: [{ instance_id: npcId, body_profile_ref: bodyProfileRef,
        body_state_profile: bodyStateProfile, body_state_persisted: false,
        machine_state: { status: 'active' },
        body_state: { health: 100, energy: 100, satiety: 100 } }]
    };
    const absentBody = await withSceneNpcs(pool, initial.party_id, initial, {
      loadBodyInitializationProfile: async () => bodyStateProfile
    });
    assert.equal(Object.hasOwn(absentBody.position, 'site_id'), false);
    assert.equal(absentBody.npcs.length, 1);
    assert.equal(absentBody.npcs[0].body_state_persisted, false);
    assert.equal((await pool.query(`SELECT count(*)::int AS count
      FROM party_runtime.entity_placements WHERE party_id=$1
        AND entity_kind='npc' AND entity_id=$2`, [initial.party_id, npcId]))
      .rows[0].count, 0);

    const first = makeExchange({ state: absentBody, npcId, bodyProfileRef,
      metrics: { health: 80, energy: 70, satiety: 60 },
      exchangeOrdinal: 1, sessionVersion: 2 });
    const firstWrites = combatWrites(first.input);
    const firstBodyInserts = firstWrites.inserts.filter(({ target_table }) =>
      target_table === 'party_actor_body_states');
    assert.equal(firstBodyInserts.length, 1);
    assert.equal(firstWrites.updates.some(({ target_table }) =>
      target_table === 'party_actor_body_states'), false);
    await commitBodyWrites({ pool, committer, state: absentBody,
      factual: first.factual, writes: firstWrites, expected: [] });

    const afterFirst = await withSceneNpcs(pool, initial.party_id, {
      ...absentBody,
      combat_sessions: [first.sessionAfter],
      party_state: { ...absentBody.party_state, state_version: 2,
        session_state_version: 2, clock_state_version: 2, turn_number: 1 }
    }, { loadBodyInitializationProfile: async () => bodyStateProfile });
    assert.equal(afterFirst.npcs.length, 1);
    assert.equal(afterFirst.npcs[0].body_state_persisted, true);
    assert.equal(afterFirst.npcs[0].body_state_version, 1);
    assert.deepEqual(afterFirst.npcs[0].body_state,
      { health: 80, energy: 70, satiety: 60 });
    assert.deepEqual(afterFirst.npcs[0].body_profile_ref, bodyProfileRef);

    const second = makeExchange({ state: afterFirst, npcId, bodyProfileRef,
      metrics: { health: 65, energy: 70, satiety: 55 },
      exchangeOrdinal: 2, sessionVersion: 3,
      priorSession: first.sessionAfter });
    const secondWrites = combatWrites(second.input);
    const secondBodyUpdates = secondWrites.updates.filter(({ target_table }) =>
      target_table === 'party_actor_body_states');
    assert.equal(secondWrites.inserts.some(({ target_table }) =>
      target_table === 'party_actor_body_states'), false,
    'assert before P16 commit: an existing body must not be re-inserted');
    assert.equal(secondBodyUpdates.length, 1);
    assert.deepEqual(secondBodyUpdates[0].record, {
      party_id: initial.party_id, actor_kind: 'npc', actor_id: npcId,
      body_profile_ref: bodyProfileRef, health: 65, energy: 70, satiety: 55,
      updated_change_set_id: second.changeSetId
    });
    const expected = expectedVersions({ partyId: initial.party_id,
      state: { ...afterFirst, combat_sessions: [first.sessionAfter] },
      factual: second.factual }).filter(({ target_table }) =>
      target_table === 'party_actor_body_states');
    assert.deepEqual(expected, [{ target_table: 'party_actor_body_states',
      id: `npc:${npcId}`, state_version: 1 }]);
    await commitBodyWrites({ pool, committer, state: afterFirst,
      factual: second.factual, writes: secondWrites, expected });

    const final = await withSceneNpcs(pool, initial.party_id, {
      ...afterFirst, combat_sessions: [second.sessionAfter]
    }, { loadBodyInitializationProfile: async () => bodyStateProfile });
    const persisted = (await pool.query(`SELECT health::text,energy::text,
      satiety::text,state_version::text FROM party_runtime.party_actor_body_states
      WHERE party_id=$1 AND actor_kind='npc' AND actor_id=$2`,
    [initial.party_id, npcId])).rows;
    assert.equal(persisted.length, 1);
    assert.deepEqual(persisted[0], { health: '65', energy: '70',
      satiety: '55', state_version: '2' });
    assert.equal(final.npcs.length, 1);
    assert.equal(final.npcs[0].body_state_version, 2);
    assert.equal(final.npcs[0].body_state_persisted, true);
    assert.deepEqual(final.npcs[0].body_state,
      { health: 65, energy: 70, satiety: 55 });
    assert.deepEqual(final.npcs[0].body_profile_ref, bodyProfileRef);

    const positioned = await withSceneNpcs(pool, initial.party_id, {
      ...initial,
      position: { site_id: 'site:positioned', position_id: 'position:control',
        g6_instance_id: 'g6:control' },
      combat_sessions: [{ ...session, participant_refs: [
        { entity_kind: 'player_character', entity_id: 'player:352' },
        { entity_kind: 'npc', entity_id: 'npc:positioned' }
      ] }], npcs: []
    });
    assert.equal(positioned.npcs.length, 1);
    assert.equal(positioned.npcs[0].position_id, 'position:control');
    assert.equal(positioned.npcs[0].g6_instance_id, 'g6:control');
    assert.equal(positioned.npcs[0].scene_readback_present, true);
    assert.equal(positioned.npcs[0].body_state_version, 1);
    assert.deepEqual(positioned.npcs[0].body_state,
      { health: 90, energy: 80, satiety: 70 });
  });

function makeExchange({ state, npcId, bodyProfileRef, metrics, exchangeOrdinal,
  sessionVersion, priorSession = state.combat_sessions[0] }) {
  const sessionAfter = { ...priorSession, state_version: String(sessionVersion),
    exchange_ordinal: exchangeOrdinal };
  const idemId = `idem:352:${exchangeOrdinal}`;
  const changeSetId = `change:352:${exchangeOrdinal}`;
  const factual = { player_input: { idempotency_key: idemId,
    request_id: `request:352:${exchangeOrdinal}` },
  mode_resolution: { turn_id: `turn:352:${exchangeOrdinal}`, decision_trace: {} },
  time_update: { clock_after: stamp() }, consequence: { combat: {
    session_after: sessionAfter, exchange_ordinal: exchangeOrdinal,
    check_results: [], outcome_events: [], position_transitions: [],
    body_transitions: [], decision_records: [], signal_records: [],
    working_state_after: { npcs: [{ instance_id: npcId,
      body_profile_ref: structuredClone(bodyProfileRef),
      machine_state: { status: 'active' } }], actor_states: {
      [`npc:${npcId}`]: { body_state: metrics }
    } }
  } } };
  return { sessionAfter, changeSetId, factual, input: {
    partyId: state.party_id, state,
    next: { ...state, party_state: { ...state.party_state,
      state_version: state.party_state.state_version + 1,
      turn_number: state.party_state.turn_number + 1 }, clock: stamp() },
    factual, turnNumber: state.party_state.turn_number + 1, changeSetId,
    idemId, visibleEnvelope: {}, pendingScreen: {}
  } };
}

async function commitBodyWrites({ pool, committer, state, factual, writes,
  expected }) {
  const partyId = state.party_id;
  const bodyWrites = {
    inserts: writes.inserts.filter(({ target_table }) =>
      target_table === 'party_actor_body_states'),
    updates: writes.updates.filter(({ target_table }) =>
      target_table === 'party_actor_body_states'),
    appends: writes.appends.filter(({ target_table }) =>
      target_table === 'party_v3_change_sets'),
    deletes: []
  };
  const visiblePayload = { schema: 'temporal_visible_package.v1',
    perceived_scene: 'Бой.', perceived_changes: [], sensory_details: [],
    visible_npcs: [], visible_objects: [], known_context: [], uncertainties: [],
    hypotheses: [], player_safe_interruption: 'Требуется решение в бою.',
    allowed_action_affordances: [] };
  const pins = [{ dependency_role: 'source_authoring', entity_ref: {
    entity_kind: 'world_revision', entity_id: 'combat_exchange_proposal_v1' },
  version_pin: { pin_kind: 'authoring_version', authoring_version: '1',
    state_version: null } }];
  const changeSet = bodyWrites.appends[0].record;
  const envelope = { package_id: `visible:${changeSet.id}`,
    party_id: partyId, turn_id: factual.mode_resolution.turn_id,
    committed_state_version: String(state.party_state.state_version + 1),
    change_set_id: changeSet.id,
    package_digest: computeSpatialV3CanonicalDigest(visiblePayload),
    visible_payload: visiblePayload, presentation_status: 'pending',
    projection_policy_ref: { entity_ref: {
      entity_kind: 'visibility_modifier', entity_id: 'combat:test'
    }, authoring_version: '1' },
    dependency_pins: { pins, canonical_digest: canonicalDigest(pins) },
    idempotency_record_id: changeSet.idempotency_record_id };
  const physicalKeys = Object.values(bodyWrites).flat().map((write) =>
    `party_runtime.${write.target_table}:${write.id}`);
  const checks = ['physical', 'state', 'pin', 'endpoint', 'route', 'capacity',
    'time', 'change_set'].map((kind) => {
    const value = { kind, ...(kind === 'state' ? { party_id: partyId,
      expected_party_state_version: state.party_state.state_version } : {}) };
    return { ...value, digest: computeSpatialV3CanonicalDigest(value) };
  });
  const built = await createCombinedWritePlanBuilder({
    verifyApproval: async () => ({ ok: true })
  }).build({
    plan_id: `plan:${changeSet.id}`, party_id: partyId,
    write_plan_kind: 'semantic_commit', operation_kind: 'combat_exchange',
    canonical_input_digest: sha(`input:${changeSet.id}`),
    expected_state_versions: expected,
    validation_report: { status: 'pass', digest: sha(`validation:${changeSet.id}`) },
    idempotency: { id: changeSet.idempotency_record_id,
      key: factual.player_input.idempotency_key,
      semantic_command_snapshot: { decision_trace: {
        decision_protocol: 'turn_step_plan_v1', step_traces: [{ step: 1 }]
      } }, semantic_command_digest: sha(`command:${changeSet.id}`),
      semantic_dependency_pins: {}, request_id: factual.player_input.request_id },
    change_set: { id: changeSet.id }, visible_package_envelope: envelope,
    approved_write_sets: [bodyWrites],
    lock_context: { owner_keys: [`actor:${factual.consequence.combat.session_after.participant_refs?.[0]?.entity_id ?? 'npc'}`],
      execution_keys: [], g4_keys: [], physical_keys: physicalKeys },
    commit_rechecks: checks
  });
  assert.equal(built.ok, true, JSON.stringify(built.error));
  const committed = await committer.commit({ plan: built.plan,
    created_at_turn: state.party_state.turn_number + 1 });
  assert.equal(committed.ok, true, JSON.stringify(committed.error));
}

async function seedParty(pool) {
  await pool.query(`INSERT INTO party_runtime.parties
    (party_id,schema_version,world_revision_id,world_catalog_digest,
      materializer_version,rng_version,command_catalog_digest,profile_bundle_digest)
    VALUES ('party:352',3,'world:test','catalog:test','test','test','commands','profiles')`);
  await pool.query(`INSERT INTO party_runtime.party_v3_change_sets
    (id,party_id,operation_kind,expected_state_version_set_digest,
      expected_state_version_set,committed_state_version_set_digest,
      write_plan_digest,created_at_turn,committed_at_turn)
    VALUES ('change:seed','party:352','fixture','seed','[]','seed','seed',0,0)`);
  await pool.query(`INSERT INTO party_runtime.party_materialization_runs
    (party_id,run_id,g4_id,run_kind,seed_digest,input_digest,catalog_digest,
      materializer_version,rng_version,result_digest,idempotency_key,status)
    VALUES ('party:352','run:352','g4:test','baseline','seed','input','catalog',
      'test','test','result','seed','committed')`);
  for (const npcId of ['npc:no-position', 'npc:positioned']) {
    await pool.query(`INSERT INTO party_runtime.party_npcs
      (party_id,npc_id,run_id,profile_set_id,profile_level,identity_state,
       machine_state,semantic_state)
      VALUES ('party:352',$1,'run:352','profile:test','background','{}','{}',
        '{"body_state_profile":{"schema":"rus.body_state.initialization_profile.v1"}}')`,
    [npcId]);
  }
  await pool.query(`INSERT INTO party_runtime.party_actor_profile_bindings
    (party_id,actor_kind,actor_id,role_ref,occupation_ref,skill_profile_snapshot,
      name_profile_snapshot,language_profile_snapshot,knowledge_profile_snapshot,
      profile_candidate_set_digest,created_change_set_id,updated_change_set_id)
    VALUES ('party:352','npc','npc:positioned','{"id":"role:test","source":"test"}',
      '{"id":"occupation:test","source":"test"}','{}','{}','{}','{}','profile-digest',
      'change:seed','change:seed')`);
  await pool.query(`INSERT INTO party_runtime.party_g5_sites
    (id,party_id,origin,parent_g4_id,canonical_g5_ref,status,state_version,
      created_change_set_id,updated_change_set_id)
    VALUES ('site:positioned','party:352','canonical','g4:test',
      '{"entity_id":"site:positioned"}','active',1,'change:seed','change:seed')`);
  await pool.query(`INSERT INTO party_runtime.party_scene_baselines
    (id,party_id,host_kind,host_id,source_kind,scene_template_ref,
      materialization_trace_id,materializer_version,catalog_digest,status,
      state_version,created_change_set_id,updated_change_set_id)
    VALUES ('baseline:positioned','party:352','g5_site','site:positioned',
      'canonical_template','{"entity_id":"scene:test","authoring_version":"1"}',
      'trace:test','test','catalog:test','active',1,'change:seed','change:seed')`);
  await pool.query(`INSERT INTO party_runtime.party_g6_instances
    (id,party_id,scene_baseline_id,source_scene_template_ref,scene_slot_key,
      host_kind,host_id,physical_class_id,primary_scene_role_id,vertical_context_id,
      overhead_cover_id,intra_g6_visibility_mode,default_visibility_distance_band,
      acoustic_uniformity,status,state_version,created_change_set_id,updated_change_set_id)
    VALUES ('g6:control','party:352','baseline:positioned',
      '{"entity_id":"scene:test","authoring_version":"1"}','inside',
      'g5_site','site:positioned','room','main','ground','covered','default_clear',
      'near','uniform','active',1,'change:seed','change:seed')`);
  await pool.query(`INSERT INTO party_runtime.scene_position_nodes
    (id,party_id,g6_instance_id,position_type_id,template_slot_key,
      template_instance_ordinal,capacity,access_class_id,status,state_version,
      created_change_set_id,updated_change_set_id)
    VALUES ('position:control','party:352','g6:control','ground','npc',0,2,
      'open','active',1,'change:seed','change:seed')`);
  await pool.query(`INSERT INTO party_runtime.entity_placements
    (party_id,entity_kind,entity_id,placement_kind,position_node_id,
      occupies_capacity_units,state_version,updated_change_set_id)
    VALUES ('party:352','npc','npc:positioned','scene_position','position:control',
      1,1,'change:seed')`);
  await pool.query(`INSERT INTO party_runtime.party_actor_body_states
    (party_id,actor_kind,actor_id,body_profile_ref,health,energy,satiety,
      state_version,updated_change_set_id)
    VALUES ('party:352','npc','npc:positioned',
      '{"entity_ref":{"entity_kind":"body_state_profile","entity_id":"approved:npc-body"},"authoring_version":"v1"}',
      90,80,70,1,'change:seed')`);
}

function stamp() {
  return { whole_minutes: '1', subminute_numerator: '0',
    subminute_denominator: '1' };
}

function sha(value) {
  return `sha256:${canonicalDigest(value).replace('sha256:', '')}`;
}
