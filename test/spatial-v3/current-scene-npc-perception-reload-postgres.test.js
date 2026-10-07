import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalDigest } from '@rus/materialization';
import { validateActorBaseAppearance } from '@rus/actors';
import { computeSpatialV3CanonicalDigest } from '@rus/contracts/spatial-v3/registry';
import { createLowerDvinaTracePhase2PostgresRepository } from
  '../../apps/game-server/src/infrastructure/postgres/lower-dvina-trace-phase-2.js';
import { withLowerDvinaTraceCurrentScene } from
  '../../apps/game-server/src/runtime/lower-dvina-trace-turn-step-current-scene.js';
import { bootstrapV17PresenceE2e, createPresenceProductionRoot,
  installPresenceProductionE2eFetch } from './presence-rules-production-e2e-fixture.js';

const LOOK = 'Осматриваюсь вокруг.';
const OLD_SPEECH = 'Я Влас.';
const OLD_BACKGROUND = 'На прежнем месте клубился дым.';
const ids = ['p2-retained-a', 'p2-retained-b', 'p2-named', 'p2-departed', 'p2-incoming'];
const visibleNpc = (id, label, recognition = 'unrecognized') => ({
  entity_ref: { entity_kind: 'npc', entity_id: id }, display_label: label, recognition
});
const priorNpcs = [visibleNpc(ids[0], 'коренастый рыбак'),
  visibleNpc(ids[1], 'седой мужчина'), visibleNpc(ids[2], 'мужчина с веслом'),
  visibleNpc(ids[3], 'человек в плаще')];
const freshNpcs = [visibleNpc(ids[0], 'человек'), visibleNpc(ids[1], 'человек'),
  visibleNpc(ids[2], 'Влас', 'recognized'), visibleNpc(ids[4], 'незнакомый лодочник')];
const expectedNpcs = [['p2-retained-a', 'коренастый рыбак', 'unrecognized'],
  ['p2-retained-b', 'седой мужчина', 'unrecognized'],
  ['p2-named', 'Влас', 'recognized'],
  ['p2-incoming', 'незнакомый лодочник', 'unrecognized']];

async function currentSnapshot(pool, partyId) {
  const { rows } = await pool.query(
    `SELECT s.state_version,s.state_payload,s.state_digest
       FROM party_runtime.party_state_snapshots s
       JOIN party_runtime.parties p ON p.party_id=s.party_id AND p.state_version=s.state_version
      WHERE s.party_id=$1`, [partyId]);
  assert.equal(rows.length, 1);
  return rows[0];
}

async function seedObservedPeople(pool, partyId, state) {
  const run = (await pool.query(
    'SELECT run_id FROM party_runtime.party_materialization_runs WHERE party_id=$1 ORDER BY run_id LIMIT 1',
    [partyId])).rows[0];
  assert.ok(run, 'the production start supplies a materialization run');
  for (const npcId of ids) {
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

async function seedPriorPerception(pool, partyId, snapshot) {
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
  const previous = state.last_turn.visible_package;
  const { rows } = await pool.query(
    'SELECT * FROM party_runtime.party_visible_packages WHERE package_id=$1',
    [previous.package_id]);
  assert.equal(rows.length, 1);
  const fixture = structuredClone(rows[0]);
  fixture.package_id += ':p2-perception-fixture';
  fixture.change_set_id += ':p2-perception-fixture';
  fixture.idempotency_record_id += ':p2-perception-fixture';
  fixture.visible_payload = { ...fixture.visible_payload,
    perceived_scene: OLD_SPEECH, perceived_changes: [OLD_SPEECH],
    sensory_details: [OLD_BACKGROUND], known_context: [OLD_BACKGROUND],
    visible_npcs: structuredClone(priorNpcs) };
  fixture.package_digest = computeSpatialV3CanonicalDigest(fixture.visible_payload);
  // Append a controlled history fixture; never rewrite an existing visible package.
  await pool.query(`INSERT INTO party_runtime.party_visible_packages
    SELECT (jsonb_populate_record(NULL::party_runtime.party_visible_packages,$1::jsonb)).*`,
  [JSON.stringify(fixture)]);
  state.last_turn.visible_package = { ...previous, package_id: fixture.package_id,
    package_digest: fixture.package_digest, change_set_id: fixture.change_set_id };
  // Only this isolated test's snapshot cache points at the appended fixture.
  await pool.query(`UPDATE party_runtime.party_state_snapshots
    SET state_payload=$3::jsonb,state_digest=$4 WHERE party_id=$1 AND state_version=$2`,
  [partyId, snapshot.state_version, JSON.stringify(state), canonicalDigest(state)]);
  return state;
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
    await root.runtime.submitTurn(partyId, { raw_text: LOOK, request_id: 'p2-perception-look' });
    const snapshot = await currentSnapshot(env.partyPool, partyId);
    assert.ok(Number(snapshot.state_version) > 0, 'the test enters the committed-state reload branch');
    await seedObservedPeople(env.partyPool, partyId, snapshot.state_payload);
    const persisted = await seedPriorPerception(env.partyPool, partyId, snapshot);
    assert.equal(typeof productionSpatialProjector, 'function');
    const observations = [];
    let freshReads = 0;

    for (let reload = 0; reload < 2; reload += 1) {
      const repository = createLowerDvinaTracePhase2PostgresRepository({
        partyPool: env.partyPool,
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
