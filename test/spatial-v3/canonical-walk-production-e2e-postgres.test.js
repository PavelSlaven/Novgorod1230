import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createLowerDvinaTracePhase2PostgresRepository } from
  '../../apps/game-server/src/infrastructure/postgres/lower-dvina-trace-phase-2.js';
import { SCENE_NPC_SOURCE } from
  '../../apps/game-server/src/infrastructure/postgres/scene-npcs-readback.js';
import { npcSharesPlayerScene } from
  '../../apps/game-server/src/runtime/lower-dvina-trace-scene-presence.js';

import {
  VIKHTUY_LOCALITY_G4,
  bootstrapV17PresenceE2e,
  createPresenceProductionRoot,
  installPresenceProductionE2eFetch,
  routeMovementLabels,
} from './presence-rules-production-e2e-fixture.js';

const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url)));
const bindings = read('../../data/world-catalogs/novgorod/spatial-v3/candidates/m2c-g4-expansion-v1/datasets/spatial_v3_canonical_g5_connection_bindings.json');
const labels = read('../../data/world-catalogs/novgorod/m2c-canonical-connection-labels/candidate.json').labels;
const g5 = (name) => `cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_${name}`;
/** The approved neutral label of the passage between two places of Vikhtuy (the player names it). */
const passage = (from, to) => {
  const binding = bindings.find((row) => row.from_canonical_g5_id === g5(from) && row.to_canonical_g5_id === g5(to));
  return labels.find((row) => row.binding_ref.id === binding.id).display_label;
};

async function whereIs(partyPool, partyId) {
  const row = (await partyPool.query(
    `SELECT COALESCE(site.canonical_g5_ref->>'entity_id', site.canonical_g5_ref->>'id') AS g5,
            pos.template_slot_key AS slot
       FROM party_runtime.party_journey_locations loc
       JOIN party_runtime.scene_position_nodes pos ON pos.party_id=loc.party_id AND pos.id=loc.scene_position_id
       JOIN party_runtime.party_g6_instances g6 ON g6.party_id=pos.party_id AND g6.id=pos.g6_instance_id
       JOIN party_runtime.party_scene_baselines base ON base.party_id=g6.party_id AND base.id=g6.scene_baseline_id
       JOIN party_runtime.party_g5_sites site ON site.party_id=base.party_id AND site.id=base.host_id
      WHERE loc.party_id=$1 AND loc.owner_kind='actor'`, [partyId])).rows[0];
  return { ...row, name: row.g5.replace(g5(''), '') };
}

test('work_storage -> water_access -> forest_path -> meeting_area and back, across process restarts',
  { timeout: 1_800_000 }, async (t) => {
    const env = await bootstrapV17PresenceE2e(t);
    let partyId = null;
    let pendingScreenRead = null;
    const narrationLog = [];
    const pushNarration = narrationLog.push.bind(narrationLog);
    narrationLog.push = (entry) => {
      const length = pushNarration(entry);
      if (partyId != null) pendingScreenRead = env.partyPool.query(
        'SELECT screen FROM party_runtime.party_server_sessions WHERE party_id=$1',
        [partyId]).then(({ rows }) => rows[0]?.screen ?? null);
      return length;
    };
    const restoreFetch = installPresenceProductionE2eFetch({ movementPrefs: { exactMovement: true }, narrationLog });
    t.after(() => restoreFetch());
    let { runtime, readCurrentVisibleContext } = await createPresenceProductionRoot(env);
    t.after(() => runtime.close());
    const restart = async () => { await runtime.close();
      ({ runtime, readCurrentVisibleContext } = await createPresenceProductionRoot(env)); };
    const opening = await runtime.startNewGame({
      scenario_id: 'novgorod_vikhtuy_work_storage_v1',
      request_id: 'slice-20261003T105907Z-cc80771c-start',
    });
    assert.equal(opening.screen.schema, 'first_game_screen');
    partyId = opening.party_id;
    await runtime.acknowledgeOpening(partyId, {
      client_ack_id: 'slice-20261003T105907Z-cc80771c-ack',
    });
    let step = 0;
    const turn = (raw_text) => {
      const request_id = `walk-${partyId}-${step++}`;
      return runtime.submitTurn(partyId, { raw_text,
        request_id });
    };
    const count = async (sql) => Number((await env.partyPool.query(sql, [partyId])).rows[0].count);

    /** Walk to the departure position of the current place, then take the named passage. */
    async function walkTo(to) {
      const from = (await whereIs(env.partyPool, partyId)).name;
      const named = passage(from, to);
      let result = null;
      for (let attempt = 0; attempt < 4; attempt += 1) {
        const at = await whereIs(env.partyPool, partyId);
        if (at.name !== from) break;
        narrationLog.length = 0;
        result = await turn(at.slot === 'departure' ? named : `${named} — подход`);
      }
      const arrived = await whereIs(env.partyPool, partyId);
      assert.equal(arrived.name, to, `${from} -> ${to} via "${named}"`);
      assert.equal(arrived.slot, 'arrival', 'the traveller stands at the arrival endpoint of the new place');
      assert.ok(result?.screen?.turn_id, 'the arrival turn returns its committed screen');
      const exitLabels = (result.screen.visible_context?.visible_objects ?? [])
        .filter((item) => item.entity_ref?.entity_kind === 'g4_directional_exit')
        .map((item) => item.display_label);
      const menuLabels = routeMovementLabels(result.screen);
      assert.ok(exitLabels.every((label) => menuLabels.includes(label)),
        `${from} -> ${to}: committed submitTurn screen keeps every visible G4 exit label in the route panel`);
      return result;
    }

    const start = await whereIs(env.partyPool, partyId);
    assert.equal(start.name, 'work_storage');
    assert.equal(await count(`SELECT count(*) FROM party_runtime.g5_site_connections WHERE party_id=$1`), 0);

    await walkTo('water_access');
    await restart();
    await walkTo('forest_path');
    const arrival = await walkTo('meeting_area');
    assert.ok(narrationLog.at(-1)?.changes.length > 0,
      'arrival turn narrates a committed visible change');
    const pendingScreen = await pendingScreenRead;
    assert.equal(pendingScreen?.turn_id, arrival?.screen?.turn_id,
      'the pending destination screen is saved during narration');
    const readVisibleNpcs = async (screen) => {
      const packageId = screen?.current_projection_anchor?.package_id;
      const row = packageId == null ? null : (await env.partyPool.query(
        `SELECT visible_payload FROM party_runtime.party_visible_packages
          WHERE party_id=$1 AND package_id=$2`, [partyId, packageId])).rows[0];
      assert.ok(row?.visible_payload, 'the screen package is persisted');
      const packageNpcIds = row.visible_payload.visible_npcs
        .map(({ entity_ref: ref }) => ref?.entity_id).filter(Boolean).sort();
      const screenNpcIds = (screen.visible_context?.visible_npc ?? [])
        .map(({ entity_ref: ref }) => ref?.entity_id).filter(Boolean).sort();
      assert.deepEqual(packageNpcIds, screenNpcIds,
        'persisted package and screen use the same destination NPC context');
      return { packageNpcIds, screenNpcIds };
    };
    const { packageNpcIds } = await readVisibleNpcs(pendingScreen);
    const panelLabels = (screen) => screen?.panels?.people?.data?.visible_npcs
      ?.map(({ display_label }) => display_label).sort() ?? [];
    const labelsById = new Map((pendingScreen.visible_context?.visible_npc ?? [])
      .map(({ entity_ref: ref, display_label }) => [ref?.entity_id, display_label]));
    const expectedLabels = [...new Set(packageNpcIds.map((id) => labelsById.get(id)))].sort();
    assert.deepEqual(panelLabels(pendingScreen), expectedLabels,
      'pending People panel matches admitted destination observations');
    assert.deepEqual((await readVisibleNpcs(arrival.screen)).screenNpcIds, packageNpcIds);
    const firstReadback = (await runtime.getPartyScreen(partyId)).screen;
    const secondReadback = (await runtime.getPartyScreen(partyId)).screen;
    assert.deepEqual(secondReadback.current_projection_anchor,
      firstReadback.current_projection_anchor, 'repeated screen reads keep package anchor');
    assert.deepEqual((await readVisibleNpcs(secondReadback)).packageNpcIds, packageNpcIds,
      'repeated screen read keeps the same NPC IDs in package and visible context');
    assert.deepEqual(panelLabels(secondReadback), expectedLabels,
      'repeated screen read keeps People panel aligned to the package');
    await restart();
    const restartReadback = (await runtime.getPartyScreen(partyId)).screen;
    assert.deepEqual(restartReadback.current_projection_anchor,
      firstReadback.current_projection_anchor, 'restart reads the same visible package');
    assert.deepEqual((await readVisibleNpcs(restartReadback)).packageNpcIds, packageNpcIds,
      'restart read keeps the same NPC IDs in package and visible context');
    assert.deepEqual((restartReadback.visible_context?.visible_npc ?? [])
      .map(({ entity_ref: ref }) => ref?.entity_id).filter(Boolean).sort(), packageNpcIds,
    'restart read keeps the persisted admitted NPC IDs in visible context');
    assert.deepEqual(panelLabels(restartReadback), expectedLabels,
      'restart read keeps People panel aligned to the package');
    const meeting = (await env.partyPool.query(
      `SELECT a.aggregate_payload FROM party_runtime.party_ordinary_materialization_aggregates a
         JOIN party_runtime.party_g6_instances g6 ON g6.party_id=a.party_id AND g6.id=a.scope_id AND a.scope_kind='g6'
         JOIN party_runtime.party_g5_sites site ON site.party_id=g6.party_id AND site.id=g6.host_id
        WHERE a.party_id=$1 AND COALESCE(site.canonical_g5_ref->>'entity_id', site.canonical_g5_ref->>'id')=$2`,
      [partyId, g5('meeting_area')])).rows[0];
    assert.ok(meeting?.aggregate_payload, 'presence is resolved once, by the existing first-arrival owner, at the new place');
    await restart();
    assert.equal(await count(`SELECT count(*) FROM party_runtime.g5_site_connections WHERE party_id=$1`), 3);

    // First arrival commits the authored household; return once so the readback
    // and destination projection both observe that persisted SQL-loaded NPC.
    await walkTo('forest_path');
    const returnedArrival = await walkTo('meeting_area');
    assert.ok(narrationLog.at(-1)?.changes.length > 0,
      'return arrival still narrates its committed visible change');
    const admittedPendingScreen = await pendingScreenRead;
    assert.equal(admittedPendingScreen?.turn_id, returnedArrival?.screen?.turn_id);
    const repository = createLowerDvinaTracePhase2PostgresRepository({
      partyPool: env.partyPool,
      readCurrentVisibleContext,
      committer: { async commit() { throw new Error('read-only'); } }
    });
    const state = await repository.loadPhase2State(partyId);
    const productionVisibleNpcIds = (state.current_visible_context?.visible_npc ?? [])
      .map(({ entity_ref: ref }) => ref?.entity_id).filter(Boolean).sort();
    assert.deepEqual(productionVisibleNpcIds, packageNpcIds,
      'independent production visibility reader matches the persisted destination package');
    const sceneNpcIds = state.npcs.filter((npc) => npc.runtime_source === SCENE_NPC_SOURCE
      && npcSharesPlayerScene(state, npc))
      .map(({ instance_id: id }) => id).sort();
    assert.ok(sceneNpcIds.length > 0,
      'production phase-2 readback loads a placed destination NPC in the player scene');
    await restart();
    const admittedRestartReadback = (await runtime.getPartyScreen(partyId)).screen;
    assert.equal(admittedRestartReadback?.turn_id, returnedArrival?.screen?.turn_id,
      'restart reads the committed arrival screen');
    const restartState = await repository.loadPhase2State(partyId);
    const restartProductionVisibleNpcIds =
      (restartState.current_visible_context?.visible_npc ?? [])
        .map(({ entity_ref: ref }) => ref?.entity_id).filter(Boolean).sort();
    assert.deepEqual(restartProductionVisibleNpcIds, packageNpcIds,
      'production visibility readback still matches the destination package after restart');
    const restartPlacedIds = restartState.npcs.filter((npc) =>
      npc.runtime_source === SCENE_NPC_SOURCE
        && npcSharesPlayerScene(restartState, npc))
      .map(({ instance_id: id }) => id).sort();
    assert.ok(restartPlacedIds.length > 0,
      'production phase-2 readback still loads the placed destination NPC after restart');
    assert.deepEqual(restartPlacedIds, sceneNpcIds,
      'restart production readback returns the same SQL-loaded destination NPCs');

    await walkTo('forest_path');
    await walkTo('water_access');
    await restart();
    await walkTo('work_storage');
    assert.equal(await count(`SELECT count(*) FROM party_runtime.party_g5_sites WHERE party_id=$1`), 4,
      'the way back reuses the places it left');
    assert.equal(await count(`SELECT count(*) FROM party_runtime.g5_site_connections WHERE party_id=$1`), 6);
    const untouched = await env.partyPool.query(
      `SELECT count(*)::int AS n FROM party_runtime.party_g5_sites WHERE party_id=$1 AND parent_g4_id<>$2`,
      [partyId, VIKHTUY_LOCALITY_G4]);
    assert.equal(untouched.rows[0].n, 0);
  });
