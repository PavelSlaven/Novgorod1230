import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalDigest } from '@rus/materialization';
import { validateActorBaseAppearance } from '@rus/actors';
import { buildConversationSession, buildConversationStatementEvent } from '@rus/npc-runtime';
import { projectConversationAudience } from '@rus/visibility-knowledge-memory';
import { sessionRecord, appendStatementWrites } from
  '../../apps/game-server/src/infrastructure/postgres/npc-semantic-conversation-write-rows.js';
import { createLowerDvinaTracePhase2PostgresRepository } from
  '../../apps/game-server/src/infrastructure/postgres/lower-dvina-trace-phase-2.js';
import { loadTargetBodyNeedsProfile } from
  '../../apps/game-server/src/internal/target-runtime-profiles.js';
import { deriveTrustedBodyNeedsBindingPin } from
  '../../apps/game-server/src/runtime/body-needs-temporal.js';
import { withLowerDvinaTraceCurrentScene } from
  '../../apps/game-server/src/runtime/lower-dvina-trace-turn-step-current-scene.js';
import { playerSafeHeardNpcIntroduction } from
  '../../apps/game-server/src/runtime/lower-dvina-trace-player-safe-npc-details.js';
import { bootstrapV17PresenceE2e, createPresenceProductionRoot,
  installPresenceProductionE2eFetch } from './presence-rules-production-e2e-fixture.js';

const LOOK = 'Осматриваюсь вокруг.';
const OLD_SPEECH = 'Я Влас.';
const OLD_BACKGROUND = 'На прежнем месте клубился дым.';
const ids = ['p2-retained-a', 'p2-retained-b', 'p2-named', 'p2-departed', 'p2-incoming'];
const retainedNames = new Map([[ids[0], 'Игнат'], [ids[1], 'Онисим']]);
const visibleNpc = (id, label, recognition = 'unrecognized') => ({
  entity_ref: { entity_kind: 'npc', entity_id: id }, display_label: label, recognition
});
const freshNpcs = [visibleNpc(ids[0], 'человек'), visibleNpc(ids[1], 'человек'),
  visibleNpc(ids[2], 'Влас', 'recognized'), visibleNpc(ids[4], 'незнакомый лодочник')];

async function currentSnapshot(pool, partyId) {
  const { rows } = await pool.query(
    `SELECT p.world_revision_id,s.state_version,s.state_payload,s.state_digest
       FROM party_runtime.party_state_snapshots s
       JOIN party_runtime.parties p ON p.party_id=s.party_id AND p.state_version=s.state_version
      WHERE s.party_id=$1`, [partyId]);
  assert.equal(rows.length, 1);
  return rows[0];
}

async function seedObservedPeople(pool, partyId, state, npcIds) {
  const run = (await pool.query(
    'SELECT run_id FROM party_runtime.party_materialization_runs WHERE party_id=$1 ORDER BY run_id LIMIT 1',
    [partyId])).rows[0];
  assert.ok(run, 'the production start supplies a materialization run');
  for (const npcId of npcIds) {
    const identity = { canonical_name: 'Нераскрытое имя', sex_category: 'male',
      age_category: 'middle_aged', appearance: {
        build: npcId === ids[0] ? 'stocky' : 'average', skin_tone: 'light',
        face_shape: 'angular', hair: {
          color: npcId === ids[1] ? 'gray' : 'dark_brown', length: 'short',
          style: 'straight', facial_hair: 'full_beard' }, eyes: { color: 'gray' }
      } };
    assert.equal(validateActorBaseAppearance(identity, { requireComplete: true }).ok, true);
    await pool.query(`INSERT INTO party_runtime.party_npcs
      (party_id,npc_id,run_id,profile_set_id,profile_level,identity_state)
      VALUES($1,$2,$3,'p2-perception-fixture','scene',$4::jsonb)`,
    [partyId, npcId, run.run_id, JSON.stringify(identity)]);
    const binding = await pool.query(`INSERT INTO party_runtime.party_actor_profile_bindings
      SELECT (jsonb_populate_record(NULL::party_runtime.party_actor_profile_bindings,
        to_jsonb(b) || jsonb_build_object('actor_kind','npc','actor_id',$2::text))).*
        FROM party_runtime.party_actor_profile_bindings b
       WHERE b.party_id=$1 AND b.actor_kind='player_character' AND b.actor_id=$3`,
    [partyId, npcId, state.actor_id]);
    assert.equal(binding.rowCount, 1);
    await pool.query(`INSERT INTO party_runtime.entity_placements
      (party_id,entity_kind,entity_id,placement_kind,position_node_id,
       occupies_capacity_units,state_version,updated_change_set_id)
      VALUES($1,'npc',$2,'scene_position',$3,1,$4,$5)`,
    [partyId, npcId, state.position.position_id, state.party_state.state_version,
      state.last_turn.visible_package.change_set_id]);
  }
}

async function seedCurrentSiteId(pool, partyId, snapshot) {
  const state = structuredClone(snapshot.state_payload);
  const site = await pool.query(`SELECT g6.host_id
    FROM party_runtime.scene_position_nodes pos
    JOIN party_runtime.party_g6_instances g6
      ON g6.party_id=pos.party_id AND g6.id=pos.g6_instance_id
    WHERE pos.party_id=$1 AND pos.id=$2 AND g6.host_kind='g5_site'
      AND pos.status='active' AND g6.status='active'`,
  [partyId, state.position.position_id]);
  assert.equal(site.rows.length, 1, 'the fixture occupies an actual active G5 site');
  // Authored starts omit site_id; the scene-NPC reader requires this current host.
  state.position.site_id = site.rows[0].host_id;
  // Keep only the scene-NPC reader's required location in the authored snapshot.
  await pool.query(`UPDATE party_runtime.party_state_snapshots
    SET state_payload=$3::jsonb,state_digest=$4 WHERE party_id=$1 AND state_version=$2`,
  [partyId, snapshot.state_version, JSON.stringify(state), canonicalDigest(state)]);
  return state;
}

async function seedHeardIntroductions(pool, partyId, state) {
  const player = { entity_kind: 'player_character', entity_id: state.actor_id };
  const changeSetId = state.last_turn.visible_package.change_set_id;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const [npcId, name] of retainedNames) {
      const speaker = { entity_kind: 'npc', entity_id: npcId };
      const conversationId = `${partyId}:${npcId}:introduction`;
      const statementId = `${conversationId}:statement`;
      const session = buildConversationSession({
        schema: 'conversation_session_v1', conversation_id: conversationId,
        state_version: 1, status: 'ended', started_at: state.clock,
        location_ref: { entity_kind: 'location', entity_id: state.position.site_id },
        initiator_ref: speaker, active_participant_refs: [speaker, player],
        last_contribution_ref: { entity_kind: 'conversation_statement', entity_id: statementId },
        topic_refs: [], status_reason: 'introduction_completed'
      });
      const statement = buildConversationStatementEvent({
        schema: 'conversation_statement_event_v1', statement_id: statementId,
        conversation_id: conversationId, exchange_id: `${conversationId}:exchange`,
        speaker_ref: speaker, intended_addressee_refs: [player], utterance_text: `Я ${name}.`,
        dominant_act: 'inform', interaction_tags: [], topic_refs: [], claims: [],
        message_completeness: 'complete', spoken_at: state.clock,
        duration: { exact_minutes: { numerator: '0', denominator: '1' } },
        social_delivery_result: null,
        source_plan_ref: { entity_kind: 'semantic_plan', entity_id: `${statementId}:plan` }
      });
      const audience = projectConversationAudience({ statement, listener_results: [{
        listener_ref: player,
        perception_result_ref: { entity_kind: 'perception_result', entity_id: `${statementId}:heard` },
        perception_result: 'recognized', perceived_at: state.clock,
        same_time_batch_ref: { entity_kind: 'temporal_batch', entity_id: `${statementId}:batch` },
        comprehension: 'full', speaker_recognized: true
      }] });
      const appends = [];
      appendStatementWrites(appends, [statement], [audience], partyId, changeSetId);
      await client.query(`INSERT INTO party_runtime.party_conversation_sessions
        SELECT (jsonb_populate_record(NULL::party_runtime.party_conversation_sessions,$1::jsonb)).*`,
      [JSON.stringify(sessionRecord(session, partyId, changeSetId))]);
      // readPlayerKnowledge reads heard introductions from the SQL audience, not private identity.
      await client.query(`INSERT INTO party_runtime.party_conversation_statements
        SELECT (jsonb_populate_record(NULL::party_runtime.party_conversation_statements,$1::jsonb)).*`,
      [JSON.stringify(appends[0].record)]);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

test('repository reload preserves same-person perceptions against fresh generic NPC labels',
  { timeout: 1_780_000 }, async (t) => {
    const env = await bootstrapV17PresenceE2e(t);
    const restoreFetch = installPresenceProductionE2eFetch({ observeText: LOOK });
    t.after(restoreFetch);
    let productionSpatialProjector = null;
    const root = await createPresenceProductionRoot({ ...env, extraConfig: {
      onCurrentSpatialContextProjector(projector) { productionSpatialProjector = projector; }
    } });
    t.after(() => root.runtime.close());
    const opening = await root.runtime.startNewGame({
      scenario_id: 'novgorod_riverbank_approach_v1', request_id: 'p2-perception-start'
    });
    const partyId = opening.party_id;
    await root.runtime.acknowledgeOpening(partyId, { client_ack_id: 'p2-perception-ack' });
    await root.runtime.submitTurn(partyId, { raw_text: LOOK, request_id: 'p2-perception-look-before-seed' });
    const beforeSeed = await currentSnapshot(env.partyPool, partyId);
    assert.ok(Number(beforeSeed.state_version) > 0, 'the test enters the committed-state reload branch');
    const seedState = await seedCurrentSiteId(env.partyPool, partyId, beforeSeed);
    await seedObservedPeople(env.partyPool, partyId, seedState, ids.slice(0, 4));
    await seedHeardIntroductions(env.partyPool, partyId, seedState);
    await root.runtime.submitTurn(partyId, { raw_text: LOOK, request_id: 'p2-perception-look-after-seed' });
    const snapshot = await currentSnapshot(env.partyPool, partyId);
    await seedObservedPeople(env.partyPool, partyId, snapshot.state_payload, [ids[4]]);
    assert.equal(typeof productionSpatialProjector, 'function');
    const trustedBodyNeedsProfile = await loadTargetBodyNeedsProfile({
      rootDir: env.rootDir, worldRevisionId: snapshot.world_revision_id
    });
    const trustedBodyNeedsBindingPin = deriveTrustedBodyNeedsBindingPin(trustedBodyNeedsProfile);
    const initialRepository = createLowerDvinaTracePhase2PostgresRepository({
      partyPool: env.partyPool,
      trustedBodyNeedsProfile,
      trustedBodyNeedsBindingPin,
      projectCurrentSpatialContext: productionSpatialProjector,
      readCurrentVisibleContext: root.readCurrentVisibleContext,
      committer: { async commit() { throw new Error('read-only regression'); } }
    });
    const initialSaved = await initialRepository.loadPhase2VisibleContext({
      commit: snapshot.state_payload.last_turn.visible_package
    });
    const priorNpcs = structuredClone(initialSaved.visible_npc);
    const freshById = new Map(freshNpcs.map((npc) => [npc.entity_ref.entity_id, npc]));
    for (const [npcId, name] of retainedNames) {
      const prior = priorNpcs.find((npc) => npc.entity_ref.entity_id === npcId);
      assert.deepEqual([prior?.display_label, prior?.recognition], [name, 'recognized'],
        `the real turn must save the heard name of ${npcId}`);
      assert.deepEqual(freshById.get(npcId), visibleNpc(npcId, 'человек'));
      assert.notDeepEqual(prior, freshById.get(npcId),
        `each retained NPC must have a distinct earlier perception: ${npcId}`);
    }
    const expectedNpcs = [['p2-retained-a', 'Игнат', 'recognized'],
      ['p2-retained-b', 'Онисим', 'recognized'],
      ['p2-named', 'Влас', 'recognized'],
      ['p2-incoming', 'незнакомый лодочник', 'unrecognized']];
    const persisted = snapshot.state_payload;
    const observations = [];
    let freshReads = 0;

    for (let reload = 0; reload < 2; reload += 1) {
      const repository = createLowerDvinaTracePhase2PostgresRepository({
        partyPool: env.partyPool,
        trustedBodyNeedsProfile,
        trustedBodyNeedsBindingPin,
        async projectCurrentSpatialContext(input) {
          const spatial = await productionSpatialProjector(input);
          // Control only this regression's entity observations at the Spatial boundary.
          freshReads += 1;
          return { ...spatial, visible_npc: structuredClone(freshNpcs) };
        },
        readCurrentVisibleContext: root.readCurrentVisibleContext,
        committer: { async commit() { throw new Error('read-only regression'); } }
      });
      const loaded = await repository.loadPhase2State(partyId);
      for (const npcId of retainedNames.keys()) {
        assert.equal(playerSafeHeardNpcIntroduction({
          committedNpcs: loaded.npcs, conversationStatements: loaded.conversation_statements,
          receivedMessages: loaded.received_messages, playerId: loaded.actor_id, npcId
        }), null, 'reload must retain the saved perception, not reconstruct a name from snapshot speech');
      }
      assert.equal(loaded.current_spatial_context_is_fresh, true);
      assert.equal(loaded.current_spatial_context_filters_entities, true);
      assert.equal(ids.every((id) => loaded.npcs.some((npc) => npc.instance_id === id)), true,
        'the observed people are actual SQL-loaded scene NPCs');
      const saved = await repository.loadPhase2VisibleContext({
        commit: loaded.last_turn.visible_package });
      assert.deepEqual(saved.visible_npc, priorNpcs, 'the earlier perceptions remain persisted');
      // Do not manually inject saved into loaded: that would hide the repository handoff bug.
      const current = withLowerDvinaTraceCurrentScene({ committedState: loaded }).current_visible_context;
      assert.equal(current.visible_scene, loaded.current_spatial_context.visible_scene);
      assert.deepEqual(current.visible_npc.map(({ entity_ref }) => entity_ref.entity_id),
        freshNpcs.map(({ entity_ref }) => entity_ref.entity_id),
        'the newcomer is fresh, and the departed NPC is absent despite its earlier perception');
      for (const stale of [OLD_SPEECH, OLD_BACKGROUND, 'человек в плаще', 'Нераскрытое имя']) {
        assert.equal(JSON.stringify(current).includes(stale), false,
          'NPC label memory must not restore old speech, scenery or private identity');
      }
      observations.push(current.visible_npc.map(({ entity_ref, display_label, recognition }) =>
        [entity_ref.entity_id, display_label, recognition]));
    }
    assert.equal(freshReads, 2, 'both independently created repositories read fresh Spatial');
    const after = await currentSnapshot(env.partyPool, partyId);
    assert.equal(after.state_digest, canonicalDigest(persisted), 'read/projection does not rewrite committed state');
    assert.deepEqual(observations, [expectedNpcs, expectedNpcs],
      'two reloads must retain the same earlier labels while a freshly known name wins');
  });
