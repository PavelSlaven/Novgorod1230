import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import test from 'node:test';
import { createGameHttpServer, listen } from '../src/index.js';
import { projectPublicPayload } from '../src/public-boundary.js';
import { createLowerDvinaTracePhase2PostgresRepository } from
  '../src/infrastructure/postgres/lower-dvina-trace-phase-2.js';
import {
  bootstrapV17PresenceE2e,
  createPresenceProductionRoot,
  installPresenceProductionE2eFetch,
} from '../../../test/spatial-v3/presence-rules-production-e2e-fixture.js';
import { TARGET_SMOKE_INPUT } from '../../../test/spatial-v3/target-http-browser-smoke.js';

const g5 = (name) => `cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_${name}`;
const bindings = JSON.parse(readFileSync(new URL(
  '../../../data/world-catalogs/novgorod/spatial-v3/candidates/m2c-lines-v1/datasets/spatial_v3_canonical_g5_connection_bindings.json',
  import.meta.url), 'utf8'));
const line = bindings.find((row) => row.from_canonical_g5_id === g5('work_storage')
  && row.to_canonical_g5_id === g5('water_access'));
assert.ok(line, 'the approved local line reaches water_access');
const lineLabel = line.line_discriminator == null || line.line_discriminator === ''
  ? line.line_name : `${line.line_name} · ${line.line_discriminator}`;

function postTurn(address, partyId, rawText, key) {
  return new Promise((resolve, reject) => {
    const request = httpRequest({ host: '127.0.0.1', port: address.port,
      path: `/api/v1/parties/${encodeURIComponent(partyId)}/turns`, method: 'POST',
      headers: { 'content-type': 'application/json' } }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        try { resolve({ status: response.statusCode,
          body: JSON.parse(Buffer.concat(chunks).toString('utf8')) }); }
        catch (error) { reject(error); }
      });
    });
    request.on('error', reject);
    request.end(JSON.stringify({ raw_text: rawText, request_id: key, idempotency_key: key }));
  });
}

function npcPublicKey(screen, id) {
  return projectPublicPayload({ ...screen,
    subject_ref: { entity_kind: 'npc', entity_id: id } }).subject_ref.public_key;
}

function npcInContext(context, id) {
  const matches = (context?.visible_npc ?? []).filter(({ entity_ref: ref }) =>
    ref?.entity_kind === 'npc' && (ref.entity_id ?? ref.public_key) === id);
  assert.equal(matches.length, 1, 'the same destination NPC appears once in the current scene');
  assert.ok(matches[0].display_label?.trim(), 'the NPC has a player-visible label');
  return matches[0];
}

function peopleSignature(screen, label) {
  assert.equal(screen.panels?.people?.visible, true, 'the arrival People panel is visible');
  const matches = (screen.panels.people.data?.visible_npcs ?? [])
    .filter(({ display_label }) => display_label === label);
  assert.equal(matches.length, 1, 'the People panel displays the destination NPC once');
  return { display_label: matches[0].display_label, appearance: matches[0].appearance ?? null };
}

test('first free line arrival and the next turn read the same first-entry NPC and label',
  { timeout: 1_800_000 }, async (t) => {
    const env = await bootstrapV17PresenceE2e(t);
    const nextPlannerContexts = [];
    const restore = installPresenceProductionE2eFetch({
      movementPrefs: { exactMovement: true },
      turnStepPlanner({ request }) {
        if (request.root_player_action === TARGET_SMOKE_INPUT) {
          nextPlannerContexts.push(structuredClone(request.player_safe_state.current_visible_context));
        }
        return null;
      },
    });
    t.after(restore);
    let productionProjector;
    const { runtime, readCurrentVisibleContext } = await createPresenceProductionRoot({ ...env,
      extraConfig: { onCurrentSpatialContextProjector(projector) { productionProjector = projector; } },
    });
    t.after(() => runtime.close());
    const server = createGameHttpServer({ root: runtime });
    const address = await listen(server, { host: '127.0.0.1', port: 0 });
    t.after(() => new Promise((resolve) => server.close(resolve)));
    const opening = await runtime.startNewGame({ scenario_id: 'novgorod_vikhtuy_work_storage_v1',
      request_id: 'line-first-entry-arrival-start' });
    const partyId = opening.party_id;
    await runtime.acknowledgeOpening(partyId, { client_ack_id: 'line-first-entry-arrival-ack' });
    const before = await env.partyPool.query(
      'SELECT npc_id FROM party_runtime.party_npcs WHERE party_id=$1', [partyId]);
    const beforeNpcIds = new Set(before.rows.map(({ npc_id }) => npc_id));

    const arrivalResponse = await postTurn(address, partyId, lineLabel, 'line-first-entry-arrival-cross');
    assert.equal(arrivalResponse.status, 200, 'a free local line must arrive on the first turn');
    assert.equal(arrivalResponse.body.ok, true);
    const arrival = arrivalResponse.body.data;
    assert.equal(arrival.screen.screen_status, 'ready');
    const { rows: locations } = await env.partyPool.query(`SELECT location.scene_position_id,
        position.template_slot_key, g6.host_id AS site_id,
        COALESCE(site.canonical_g5_ref->>'entity_id',site.canonical_g5_ref->>'id') AS canonical_g5_id
      FROM party_runtime.party_journey_locations location
      JOIN party_runtime.scene_position_nodes position ON position.party_id=location.party_id
        AND position.id=location.scene_position_id
      JOIN party_runtime.party_g6_instances g6 ON g6.party_id=position.party_id AND g6.id=position.g6_instance_id
      JOIN party_runtime.party_g5_sites site ON site.party_id=g6.party_id AND site.id=g6.host_id
      WHERE location.party_id=$1 AND location.owner_kind='actor'`, [partyId]);
    assert.equal(locations.length, 1);
    assert.equal(locations[0].canonical_g5_id, g5('water_access'));
    assert.equal(locations[0].template_slot_key, 'arrival');

    const { rows: destinationNpcs } = await env.partyPool.query(`SELECT npc.npc_id,run.run_kind,
        (SELECT count(*)::int FROM party_runtime.party_items item
          JOIN party_runtime.party_item_placements equipment ON equipment.party_id=item.party_id
            AND equipment.item_id=item.item_id
          WHERE item.party_id=npc.party_id AND item.run_id=npc.run_id
            AND equipment.holder_npc_id=npc.npc_id) AS equipment_count
      FROM party_runtime.party_npcs npc
      JOIN party_runtime.party_materialization_runs run ON run.party_id=npc.party_id AND run.run_id=npc.run_id
      JOIN party_runtime.entity_placements placement ON placement.party_id=npc.party_id
        AND placement.entity_kind='npc' AND placement.entity_id=npc.npc_id
        AND placement.placement_kind='scene_position'
      JOIN party_runtime.scene_position_nodes position ON position.party_id=placement.party_id
        AND position.id=placement.position_node_id AND position.status='active'
      JOIN party_runtime.party_g6_instances g6 ON g6.party_id=position.party_id
        AND g6.id=position.g6_instance_id AND g6.status='active'
      WHERE npc.party_id=$1 AND g6.host_kind='g5_site' AND g6.host_id=$2`,
    [partyId, locations[0].site_id]);
    const newNpcs = destinationNpcs.filter(({ npc_id }) => !beforeNpcIds.has(npc_id));
    assert.ok(newNpcs.length > 0,
      `first entry creates a destination NPC after the start snapshot; `
      + `party=${partyId}; before=${JSON.stringify([...beforeNpcIds])}; `
      + `destination=${JSON.stringify(destinationNpcs)}`);
    // #330 keys belong to this saved screen; HTTP must still contain the NPC.
    const arrivalScreen = (await runtime.getPartyScreen(partyId)).screen;
    const visibleKeys = new Set((arrival.screen.visible_context?.visible_npc ?? [])
      .map(({ entity_ref: ref }) => ref?.public_key));
    const visibleNewNpcs = newNpcs.filter(({ npc_id }) =>
      visibleKeys.has(npcPublicKey(arrivalScreen, npc_id)));
    assert.ok(visibleNewNpcs.length > 0, 'the first arrival already shows the new destination NPC');
    const labels = new Map();
    for (const npc of visibleNewNpcs) {
      assert.equal(npc.run_kind, 'expansion', 'the NPC belongs to the first-entry materialization run');
      assert.ok(npc.equipment_count > 0, 'the same run persists the destination NPC equipment');
      const visible = npcInContext(arrival.screen.visible_context,
        npcPublicKey(arrivalScreen, npc.npc_id));
      labels.set(npc.npc_id, peopleSignature(arrival.screen, visible.display_label));
    }

    assert.equal(typeof productionProjector, 'function');
    const repository = createLowerDvinaTracePhase2PostgresRepository({ partyPool: env.partyPool,
      readCurrentVisibleContext, projectCurrentSpatialContext: productionProjector,
      committer: { async commit() { throw new Error('read-only test repository'); } } });
    const nextState = await repository.loadPhase2State(partyId);
    for (const [id, signature] of labels) {
      assert.ok(nextState.npcs.some(({ instance_id }) => instance_id === id),
        'the next-turn state loads the same first-entry NPC');
      assert.equal(npcInContext(nextState.current_visible_context, id).display_label,
        signature.display_label, 'arrival and the next-turn state use the same NPC label');
    }
    const nextResponse = await postTurn(address, partyId, TARGET_SMOKE_INPUT, 'line-first-entry-arrival-look');
    assert.equal(nextResponse.status, 200, 'the next observation uses the current destination state');
    assert.equal(nextResponse.body.ok, true);
    assert.equal(nextResponse.body.data.turn_number, arrival.turn_number + 1);
    assert.ok(nextPlannerContexts.length > 0, 'the next planner reads the current destination scene');
    const nextScreen = (await runtime.getPartyScreen(partyId)).screen;
    for (const [instanceId, signature] of labels) {
      const id = npcPublicKey(nextScreen, instanceId);
      assert.equal(npcInContext(nextResponse.body.data.screen.visible_context, id).display_label,
        signature.display_label, 'the next turn keeps the same NPC identity and label');
      assert.deepEqual(peopleSignature(nextResponse.body.data.screen, signature.display_label), signature,
        'arrival and the next-turn People panel keep the same NPC appearance signature');
      for (const context of nextPlannerContexts) {
        assert.equal((context.visible_npc ?? []).filter(({ display_label }) =>
          display_label === signature.display_label).length, 1,
        'the next planner sees the arrival NPC with the same player-visible signature');
      }
    }
  });
