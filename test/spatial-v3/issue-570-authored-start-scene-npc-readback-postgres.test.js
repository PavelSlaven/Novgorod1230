import assert from 'node:assert/strict';
import test from 'node:test';
import { writeFile } from 'node:fs/promises';
import { canonicalDigest } from '@rus/materialization';
import { validateActorBaseAppearance } from '@rus/actors';
import { createLowerDvinaTracePhase2PostgresRepository } from
  '../../apps/game-server/src/infrastructure/postgres/lower-dvina-trace-phase-2.js';
import { withSceneNpcs } from
  '../../apps/game-server/src/infrastructure/postgres/scene-npcs-readback.js';
import { bootstrapV17PresenceE2e, createPresenceProductionRoot,
  installPresenceProductionE2eFetch } from './presence-rules-production-e2e-fixture.js';

const SCENARIO = 'novgorod_riverbank_approach_v1';
const LOOK = 'Осматриваюсь вокруг.';
const FIXTURE_NPC = 'issue-570-sql-only-npc';

async function currentSnapshot(pool, partyId) {
  const { rows } = await pool.query(`SELECT s.state_version,s.state_payload,s.state_digest
    FROM party_runtime.party_state_snapshots s
    JOIN party_runtime.parties p ON p.party_id=s.party_id AND p.state_version=s.state_version
    WHERE s.party_id=$1`, [partyId]);
  assert.equal(rows.length, 1, 'production supplies exactly one current snapshot');
  assert.equal(rows[0].state_digest, canonicalDigest(rows[0].state_payload));
  return rows[0];
}

async function siteAtPosition(pool, partyId, positionId) {
  assert.equal(typeof positionId, 'string', 'the committed player position exists');
  const { rows } = await pool.query(`SELECT pos.id AS position_id,pos.g6_instance_id,g6.host_id AS site_id
    FROM party_runtime.scene_position_nodes pos
    JOIN party_runtime.party_g6_instances g6
      ON g6.party_id=pos.party_id AND g6.id=pos.g6_instance_id
    WHERE pos.party_id=$1 AND pos.id=$2 AND g6.host_kind='g5_site'
      AND pos.status='active' AND g6.status='active'`, [partyId, positionId]);
  assert.equal(rows.length, 1, 'committed position resolves to exactly one active G5 host');
  return rows[0];
}

async function sceneNpcRows(pool, partyId, siteId) {
  const { rows } = await pool.query(`SELECT n.npc_id,n.run_id,n.profile_set_id,
      placement.position_node_id AS position_id,pos.g6_instance_id
    FROM party_runtime.party_npcs n
    JOIN party_runtime.party_actor_profile_bindings apb
      ON apb.party_id=n.party_id AND apb.actor_kind='npc' AND apb.actor_id=n.npc_id
    JOIN party_runtime.entity_placements placement
      ON placement.party_id=n.party_id AND placement.entity_kind='npc'
      AND placement.entity_id=n.npc_id AND placement.placement_kind='scene_position'
    JOIN party_runtime.scene_position_nodes pos
      ON pos.party_id=placement.party_id AND pos.id=placement.position_node_id
    JOIN party_runtime.party_g6_instances g6
      ON g6.party_id=pos.party_id AND g6.id=pos.g6_instance_id
    WHERE n.party_id=$1 AND g6.host_id=$2 AND g6.host_kind='g5_site'
      AND pos.status='active' AND g6.status='active'
    ORDER BY n.npc_id`, [partyId, siteId]);
  return rows;
}

async function insertSqlOnlyNpc(pool, partyId, state) {
  // Same isolated SQL fixture pattern as current-scene-npc-perception-reload;
  // the authored snapshot and its position remain untouched.
  const { rows: runs } = await pool.query(`SELECT run_id
    FROM party_runtime.party_materialization_runs WHERE party_id=$1 ORDER BY run_id LIMIT 1`, [partyId]);
  assert.equal(runs.length, 1, 'the production start supplies a materialization run');
  const identity = { canonical_name: 'Нераскрытое имя', sex_category: 'male',
    age_category: 'middle_aged', appearance: {
      build: 'average', skin_tone: 'light', face_shape: 'angular',
      hair: { color: 'dark_brown', length: 'short', style: 'straight', facial_hair: 'full_beard' },
      eyes: { color: 'gray' }
    } };
  assert.equal(validateActorBaseAppearance(identity, { requireComplete: true }).ok, true);
  const npc = await pool.query(`INSERT INTO party_runtime.party_npcs
    (party_id,npc_id,run_id,profile_set_id,profile_level,identity_state)
    VALUES($1,$2,$3,'issue-570-fixture','scene',$4::jsonb)`,
  [partyId, FIXTURE_NPC, runs[0].run_id, JSON.stringify(identity)]);
  assert.equal(npc.rowCount, 1);
  const binding = await pool.query(`INSERT INTO party_runtime.party_actor_profile_bindings
    SELECT (jsonb_populate_record(NULL::party_runtime.party_actor_profile_bindings,
      to_jsonb(b) || jsonb_build_object('actor_kind','npc','actor_id',$2::text))).*
    FROM party_runtime.party_actor_profile_bindings b
    WHERE b.party_id=$1 AND b.actor_kind='player_character' AND b.actor_id=$3`,
  [partyId, FIXTURE_NPC, state.actor_id]);
  assert.equal(binding.rowCount, 1, 'the SQL NPC has the binding required by readback');
  const placement = await pool.query(`INSERT INTO party_runtime.entity_placements
    (party_id,entity_kind,entity_id,placement_kind,position_node_id,
      occupies_capacity_units,state_version,updated_change_set_id)
    VALUES($1,'npc',$2,'scene_position',$3,1,$4,$5)`,
  [partyId, FIXTURE_NPC, state.position.position_id, state.party_state.state_version,
    state.last_turn.visible_package.change_set_id]);
  assert.equal(placement.rowCount, 1, 'the SQL NPC has a placement at the committed player position');
}

test('authored-start scene NPC reload (ожидаемо красный, issue #570)',
  { timeout: 1_780_000 }, async (t) => {
    const env = await bootstrapV17PresenceE2e(t);
    const restoreFetch = installPresenceProductionE2eFetch({ observeText: LOOK });
    let root;
    t.after(async () => {
      try { await root?.runtime.close(); } finally { restoreFetch(); }
    });
    let spatialProjector;
    root = await createPresenceProductionRoot({ ...env, extraConfig: {
      onCurrentSpatialContextProjector(projector) { spatialProjector = projector; }
    } });
    const opening = await root.runtime.startNewGame({ scenario_id: SCENARIO,
      request_id: 'issue-570-start' });
    const partyId = opening.party_id;
    const initial = await currentSnapshot(env.partyPool, partyId);
    assert.equal(Number(initial.state_version), 0);
    const initialSite = await siteAtPosition(env.partyPool, partyId,
      initial.state_payload.initial_spatial_v3_runtime.position);
    const initialNativeRows = await sceneNpcRows(env.partyPool, partyId, initialSite.site_id);
    await root.runtime.acknowledgeOpening(partyId, { client_ack_id: 'issue-570-ack' });
    await root.runtime.submitTurn(partyId, { raw_text: LOOK, request_id: 'issue-570-look' });
    const committed = await currentSnapshot(env.partyPool, partyId);
    assert.ok(Number(committed.state_version) > 0, 'a real public turn commits the reload branch');
    const state = committed.state_payload;
    const site = await siteAtPosition(env.partyPool, partyId, state.position.position_id);
    assert.deepEqual(site, initialSite, 'observation leaves the player at the authored start');
    assert.equal(typeof spatialProjector, 'function');
    const repository = createLowerDvinaTracePhase2PostgresRepository({
      partyPool: env.partyPool,
      projectCurrentSpatialContext: spatialProjector,
      readCurrentVisibleContext: root.readCurrentVisibleContext,
      committer: { async commit() { throw new Error('read-only regression'); } }
    });
    const nativeRows = await sceneNpcRows(env.partyPool, partyId, site.site_id);
    const nativeLoaded = await repository.loadPhase2State(partyId);
    const snapshotNpcIds = state.npcs.map(({ instance_id }) => instance_id);
    const nativeLoadedIds = nativeLoaded.npcs.map(({ instance_id }) => instance_id);
    const nativeMissing = nativeRows.filter(({ npc_id }) => !nativeLoadedIds.includes(npc_id));
    const nativeSqlOnly = nativeRows.filter(({ npc_id }) => !snapshotNpcIds.includes(npc_id));
    // Prefer the real production omission. A SQL insertion tests only the
    // readback mechanism when this start has no native SQL-only NPC.
    const targetId = nativeSqlOnly[0]?.npc_id ?? FIXTURE_NPC;
    if (targetId === FIXTURE_NPC) await insertSqlOnlyNpc(env.partyPool, partyId, state);
    const targetRow = (await sceneNpcRows(env.partyPool, partyId, site.site_id))
      .find(({ npc_id }) => npc_id === targetId);
    assert.ok(targetRow, 'target passes all actual SQL readback joins');
    assert.equal(snapshotNpcIds.includes(targetId), false, 'target is SQL-only, not a cached snapshot NPC');

    let loaded;
    let controlNpc;
    await t.test('green control: the same SQL NPC loads with its committed G5 host', async () => {
      const control = await withSceneNpcs(env.partyPool, partyId, {
        ...structuredClone(state), position: { ...state.position, site_id: site.site_id }
      });
      controlNpc = control.npcs.find(({ instance_id }) => instance_id === targetId);
      assert.ok(controlNpc, 'site-aware readback loads the exact same SQL NPC');
      assert.equal(controlNpc.position_id, targetRow.position_id);
      assert.equal(controlNpc.g6_instance_id, targetRow.g6_instance_id);
      assert.equal(control.scene_position_g6[site.position_id], site.g6_instance_id);
      loaded = await repository.loadPhase2State(partyId);
      const after = await currentSnapshot(env.partyPool, partyId);
      assert.deepEqual(after, committed, 'fixture insertion and both readers do not rewrite the snapshot');
    });
    assert.ok(loaded && controlNpc, 'the green SQL control and production reload completed');
    const evidence = { issue: 570, scenario: SCENARIO,
      initial_state_version: Number(initial.state_version),
      initial_position: initial.state_payload.immediate.spatial.position,
      initial_runtime_position: initialSite,
      initial_native_sql_npcs: initialNativeRows,
      committed_state_version: Number(committed.state_version),
      committed_position: state.position,
      committed_native_sql_npcs: nativeRows,
      snapshot_npc_ids: snapshotNpcIds, native_loaded_npc_ids: nativeLoadedIds,
      native_missing_npc_ids: nativeMissing.map(({ npc_id }) => npc_id),
      native_sql_only_npc_ids: nativeSqlOnly.map(({ npc_id }) => npc_id),
      target_npc_id: targetId, target_origin: targetId === FIXTURE_NPC ? 'isolated_sql_fixture' : 'production',
      green_control_loaded: true, snapshot_unchanged: true,
      final_loaded_npc_ids: loaded.npcs.map(({ instance_id }) => instance_id) };
    console.log(`ISSUE_570_EVIDENCE ${JSON.stringify(evidence)}`);
    if (process.env.ARMY_570_CAPTURE_PATH) {
      await writeFile(process.env.ARMY_570_CAPTURE_PATH, `${JSON.stringify(evidence, null, 2)}\n`);
    }
    await t.test('SQL-only NPC survives authored-start reload (ожидаемо красный, issue #570)', () => {
      assert.equal(loaded.npcs.some(({ instance_id }) => instance_id === targetId), true,
        'issue #570: loadPhase2State must load the current-site SQL NPC using the committed position');
    });
  });
