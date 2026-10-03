import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  VIKHTUY_LOCALITY_G4,
  bootstrapV17PresenceE2e,
  createPresenceProductionRoot,
  installPresenceProductionE2eFetch,
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
    let lastRequestId = null;
    const narrationLog = [];
    const pushNarration = narrationLog.push.bind(narrationLog);
    narrationLog.push = (entry) => {
      const length = pushNarration(entry);
      if (partyId != null) pendingScreenRead = env.partyPool.query(
        'SELECT screen FROM party_runtime.party_server_sessions WHERE party_id=$1',
        [partyId]).then(({ rows }) => rows[0]?.screen ?? null);
      return length;
    };
    const sceneProjectionDiagnostics = [];
    const restoreFetch = installPresenceProductionE2eFetch({ movementPrefs: { exactMovement: true }, narrationLog });
    t.after(() => restoreFetch());
    let { runtime } = await createPresenceProductionRoot({ ...env,
      extraConfig: { onNpcSceneProjection: (event) => sceneProjectionDiagnostics.push(event) }
    });
    t.after(() => runtime.close());
    const restart = async () => { await runtime.close(); ({ runtime } = await createPresenceProductionRoot(env)); };
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
      lastRequestId = `walk-${partyId}-${step++}`;
      return runtime.submitTurn(partyId, { raw_text, request_id: lastRequestId });
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
      return result;
    }

    const start = await whereIs(env.partyPool, partyId);
    assert.equal(start.name, 'work_storage');
    assert.equal(await count(`SELECT count(*) FROM party_runtime.g5_site_connections WHERE party_id=$1`), 0);

    await walkTo('water_access');
    await walkTo('forest_path');
    const arrival = await walkTo('meeting_area');
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
    const destinationPlacements = (await env.partyPool.query(
      `SELECT DISTINCT placement.entity_id
         FROM party_runtime.party_journey_locations loc
         JOIN party_runtime.scene_position_nodes current_pos
           ON current_pos.party_id=loc.party_id AND current_pos.id=loc.scene_position_id
         JOIN party_runtime.party_g6_instances current_g6
           ON current_g6.party_id=current_pos.party_id AND current_g6.id=current_pos.g6_instance_id
         JOIN party_runtime.party_g6_instances target_g6
           ON target_g6.party_id=current_g6.party_id AND target_g6.host_kind='g5_site'
          AND target_g6.host_id=current_g6.host_id AND target_g6.status='active'
         JOIN party_runtime.scene_position_nodes target_pos
           ON target_pos.party_id=target_g6.party_id AND target_pos.g6_instance_id=target_g6.id
          AND target_pos.status='active'
         JOIN party_runtime.entity_placements placement
           ON placement.party_id=target_pos.party_id AND placement.position_node_id=target_pos.id
          AND placement.entity_kind='npc' AND placement.placement_kind='scene_position'
        WHERE loc.party_id=$1 AND loc.owner_kind='actor'`, [partyId])).rows
      .map(({ entity_id }) => entity_id);
    assert.ok(destinationPlacements.length > 0,
      'meeting_area first arrival has a committed NPC placement to evaluate');
    const arrivalProjection = sceneProjectionDiagnostics.find(({ request_id }) =>
      request_id === lastRequestId)?.after;
    const admittedIds = new Set(arrivalProjection?.current_visible_npc_ids ?? []);
    const admittedPlacedIds = destinationPlacements.filter((id) => admittedIds.has(id)).sort();
    assert.deepEqual(packageNpcIds, admittedPlacedIds,
      'destination package includes every admitted current NPC observation');
    assert.ok(packageNpcIds.every((id) => destinationPlacements.includes(id)
      && admittedIds.has(id)),
    'People package includes only SQL-placed NPCs admitted by Spatial');
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
