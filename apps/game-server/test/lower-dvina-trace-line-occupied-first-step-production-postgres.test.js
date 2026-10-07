import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import test from 'node:test';
import { validateActorBaseAppearance } from '@rus/actors';
import { projectOccupiedLineStartInput } from './line-occupied-start-materialization-input.js';
import { createGameHttpServer, listen } from '../src/index.js';
import {
  bootstrapV17PresenceE2e,
  createPresenceProductionRoot,
  installPresenceProductionE2eFetch,
  routeMovementLabels,
} from '../../../test/spatial-v3/presence-rules-production-e2e-fixture.js';

const scenario = 'novgorod_vikhtuy_work_storage_v1';
const g5 = (name) => `cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_${name}`;
const bindings = JSON.parse(readFileSync(new URL(
  '../../../data/world-catalogs/novgorod/spatial-v3/candidates/m2c-lines-v1/datasets/spatial_v3_canonical_g5_connection_bindings.json',
  import.meta.url), 'utf8'));
const line = bindings.find((row) => row.from_canonical_g5_id === g5('work_storage')
  && row.to_canonical_g5_id === g5('water_access'));
assert.ok(line, 'approved work_storage -> water_access line exists');
const lineLabel = line.line_discriminator == null || line.line_discriminator === ''
  ? line.line_name : `${line.line_name} · ${line.line_discriminator}`;

async function actorLocation(pool, partyId) {
  const { rows } = await pool.query(`SELECT loc.scene_position_id AS position_id,
      loc.state_version, pos.template_slot_key AS slot,
      COALESCE(site.canonical_g5_ref->>'entity_id',site.canonical_g5_ref->>'id') AS g5,
      g6.scene_baseline_id
    FROM party_runtime.party_journey_locations loc
    JOIN party_runtime.scene_position_nodes pos ON pos.party_id=loc.party_id AND pos.id=loc.scene_position_id
    JOIN party_runtime.party_g6_instances g6 ON g6.party_id=pos.party_id AND g6.id=pos.g6_instance_id
    JOIN party_runtime.party_scene_baselines base ON base.party_id=g6.party_id AND base.id=g6.scene_baseline_id
    JOIN party_runtime.party_g5_sites site ON site.party_id=base.party_id AND site.id=base.host_id
    WHERE loc.party_id=$1 AND loc.owner_kind='actor'`, [partyId]);
  assert.equal(rows.length, 1);
  return rows[0];
}

async function firstLocalApproachEdge(pool, partyId, source) {
  const { rows } = await pool.query(`WITH RECURSIVE walk(position_id,edge_ids,position_ids) AS (
      SELECT $2::text,ARRAY[]::text[],ARRAY[$2::text]
      UNION ALL
      SELECT e.to_position_id,w.edge_ids||e.id,w.position_ids||e.to_position_id
      FROM walk w JOIN party_runtime.scene_movement_edges e ON e.party_id=$1
        AND e.scene_baseline_id=$3 AND e.from_position_id=w.position_id
        AND e.status='active' AND e.cost_kind='action'
      WHERE cardinality(w.edge_ids)<12 AND NOT e.to_position_id=ANY(w.position_ids)
    ) SELECT w.edge_ids[1] AS edge_id,w.position_ids[2] AS destination_position_id,
        w.edge_ids,w.position_ids,cardinality(w.edge_ids) AS path_length
      FROM walk w JOIN party_runtime.scene_position_nodes p
        ON p.party_id=$1 AND p.id=w.position_id
      WHERE p.template_slot_key='departure' AND cardinality(w.edge_ids)>0
      ORDER BY cardinality(w.edge_ids),w.edge_ids LIMIT 1`,
  [partyId, source.position_id, source.scene_baseline_id]);
  assert.equal(rows.length, 1, 'approved source scene has a local path to departure');
  return rows[0];
}

async function verifyOccupiedFirstLocalStep(pool, partyId, path) {
  const { rows } = await pool.query(`SELECT p.capacity,n.identity_state,
      placement.occupies_capacity_units
    FROM party_runtime.scene_position_nodes p
    JOIN party_runtime.entity_placements placement
      ON placement.party_id=p.party_id AND placement.position_node_id=p.id
      AND placement.entity_kind='npc'
    JOIN party_runtime.party_npcs n
      ON n.party_id=placement.party_id AND n.npc_id=placement.entity_id
    WHERE p.party_id=$1 AND p.id=$2`, [partyId, path.destination_position_id]);
  assert.equal(rows.length, 1, 'production start materializes one occupying NPC');
  assert.equal(Number(rows[0].capacity), 1);
  assert.equal(Number(rows[0].occupies_capacity_units), 1);
  assert.equal(validateActorBaseAppearance(rows[0].identity_state, { requireComplete: true }).ok,
    true, 'the NPC materializer supplies complete production exterior data');
}

async function clock(pool, partyId) {
  const { rows } = await pool.query(`SELECT whole_minutes::text,subminute_numerator::text,
      subminute_denominator::text,state_version::text
    FROM party_runtime.party_clocks WHERE party_id=$1`, [partyId]);
  assert.equal(rows.length, 1);
  return rows[0];
}

async function session(pool, partyId) {
  const { rows } = await pool.query(`SELECT turn_number,last_turn_id
    FROM party_runtime.party_server_sessions WHERE party_id=$1`, [partyId]);
  assert.equal(rows.length, 1);
  return rows[0];
}

async function assertCommittedTurn(pool, partyId, idempotencyKey) {
  const { rows } = await pool.query(`SELECT status
    FROM party_runtime.party_command_idempotency
    WHERE party_id=$1 AND operation_kind=$2 AND idempotency_key=$3`,
  [partyId, 'trace_turn_step', idempotencyKey]);
  assert.equal(rows.length, 1, 'the submitted turn has exactly one idempotency row');
  assert.equal(rows[0].status, 'committed', 'the submitted turn is durably committed');
}

function postTurn(address, partyId, body) {
  return new Promise((resolve, reject) => {
    const req = httpRequest({ host: '127.0.0.1', port: address.port,
      path: `/api/v1/parties/${encodeURIComponent(partyId)}/turns`, method: 'POST',
      headers: { 'content-type': 'application/json' } }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(Buffer.concat(chunks).toString('utf8')) }); }
        catch (error) { reject(error); }
      });
    });
    req.on('error', reject);
    req.end(JSON.stringify(body));
  });
}

test('occupied hidden first line step commits a narrated refusal; free line crosses in one turn',
  { timeout: 1_800_000 }, async (t) => {
    const env = await bootstrapV17PresenceE2e(t);
    const movementLog = [];
    const narrationLog = [];
    const requestLog = [];
    const restoreFetch = installPresenceProductionE2eFetch({
      movementPrefs: { exactMovement: true }, movementLog, narrationLog, requestLog,
    });
    t.after(() => restoreFetch());
    const start = async (subtest, suffix, options = {}) => {
      const { runtime } = await createPresenceProductionRoot(env, options);
      subtest.after(() => runtime.close());
      const server = createGameHttpServer({ root: runtime });
      const address = await listen(server, { host: '127.0.0.1', port: 0 });
      subtest.after(() => new Promise((resolve) => server.close(resolve)));
      const opening = await runtime.startNewGame({ scenario_id: scenario,
        request_id: `line-occupied-${suffix}` });
      assert.equal(opening.screen.schema, 'first_game_screen');
      await runtime.acknowledgeOpening(opening.party_id,
        { client_ack_id: `line-occupied-ack-${suffix}` });
      return { runtime, address, partyId: opening.party_id };
    };
    await t.test('occupied first step', async (t) => {
      const { runtime, address, partyId: blockedParty } = await start(t, 'blocked', {
        testOnlyProjectStartMaterializationInput: projectOccupiedLineStartInput,
      });
    const beforeBlockedPosition = await actorLocation(env.partyPool, blockedParty);
    assert.equal(beforeBlockedPosition.g5, g5('work_storage'));
    assert.notEqual(beforeBlockedPosition.slot, 'departure');
    const path = await firstLocalApproachEdge(env.partyPool, blockedParty, beforeBlockedPosition);
    await verifyOccupiedFirstLocalStep(env.partyPool, blockedParty, path);
    assert.ok(routeMovementLabels((await runtime.getPartyScreen(blockedParty)).screen)
      .includes(lineLabel), 'the named line remains one player-visible route choice');

    const blockedClockBefore = await clock(env.partyPool, blockedParty);
    const blockedSessionBefore = await session(env.partyPool, blockedParty);
    const blockedMovementLogStart = movementLog.length;
    const blockedNarrationLogStart = narrationLog.length;
    const blockedRequestLogStart = requestLog.length;
    const blockedRequest = {
      raw_text: lineLabel, request_id: `line-occupied-blocked-${blockedParty}`,
      idempotency_key: `line-occupied-blocked-${blockedParty}`,
    };
    const blockedResponse = await postTurn(address, blockedParty, blockedRequest);
    assert.equal(blockedResponse.status, 200);
    assert.deepEqual({ schema: blockedResponse.body.schema, ok: blockedResponse.body.ok },
      { schema: 'rus_api_success', ok: true }, 'occupied attempt returns success envelope');
    assert.equal(Object.hasOwn(blockedResponse.body, 'error'), false);
    const blocked = blockedResponse.body.data;
    assert.equal(blocked.screen.screen_status, 'ready');
    await assertCommittedTurn(env.partyPool, blockedParty, blockedRequest.idempotency_key);
    assert.equal(blocked.turn_number, Number(blockedSessionBefore.turn_number) + 1,
      'the refusal still commits one turn');
    assert.ok(blocked.screen.main_prose.trim().length > 0,
      'the player receives prose for the refused route attempt');
    assert.ok(narrationLog.length > blockedNarrationLogStart,
      'the refused attempt passes through the narrator');
    assert.deepEqual(movementLog.slice(blockedMovementLogStart).map(({ movement_kind }) => movement_kind),
      ['route'], 'the blocked path is attempted through one named route operation');
    assert.deepEqual(await actorLocation(env.partyPool, blockedParty), beforeBlockedPosition,
      'blocked hidden first edge leaves actor position and journey version unchanged');
    assert.deepEqual(await clock(env.partyPool, blockedParty), blockedClockBefore,
      'blocked hidden first edge leaves world time unchanged');
    const blockedSessionAfter = await session(env.partyPool, blockedParty);
    assert.equal(Number(blockedSessionAfter.turn_number), Number(blockedSessionBefore.turn_number) + 1);
    assert.equal(blockedSessionAfter.last_turn_id, blocked.screen.turn_id);

    const narratorRequests = requestLog.slice(blockedRequestLogStart).filter(({ system, user }) =>
      system.startsWith('Return only {"prose"') && user?.required_current_beat != null);
    assert.ok(narratorRequests.length > 0, 'the actual narrator provider request was captured');
    const narratorPayload = JSON.stringify(narratorRequests);
    const publicPayload = JSON.stringify(blockedResponse.body);
    const screenPayload = JSON.stringify((await runtime.getPartyScreen(blockedParty)).screen);
    for (const hiddenId of [...path.edge_ids, ...path.position_ids]) {
      assert.equal(narratorPayload.includes(hiddenId), false,
        'actual narrator input omits each hidden local edge and position id');
      assert.equal(publicPayload.includes(hiddenId), false,
        'public response omits each hidden local edge and position id');
      assert.equal(screenPayload.includes(hiddenId), false,
        'committed player screen omits each hidden local edge and position id');
    }
    // A-30c-10: general narrator metadata cleanliness is tracked separately in #460.
    t.diagnostic(JSON.stringify({ narrator_request_count: narratorRequests.length,
      hidden_route_id_checks_passed: true }));
    });
    await t.test('free line', async (t) => {
      const { address, partyId: freeParty } = await start(t, 'free');
      const freePositionBefore = await actorLocation(env.partyPool, freeParty);
      assert.equal(freePositionBefore.g5, g5('work_storage'));
    const freeClockBefore = await clock(env.partyPool, freeParty);
    const freeSessionBefore = await session(env.partyPool, freeParty);
    const freeMovementLogStart = movementLog.length;
    const freeRequest = {
      raw_text: lineLabel, request_id: `line-occupied-free-${freeParty}`,
      idempotency_key: `line-occupied-free-${freeParty}`,
    };
    const freeResponse = await postTurn(address, freeParty, freeRequest);
    assert.equal(freeResponse.status, 200);
    assert.deepEqual({ schema: freeResponse.body.schema, ok: freeResponse.body.ok },
      { schema: 'rus_api_success', ok: true }, 'free line returns success envelope');
    assert.equal(Object.hasOwn(freeResponse.body, 'error'), false);
    const free = freeResponse.body.data;
    assert.equal(free.screen.screen_status, 'ready');
    await assertCommittedTurn(env.partyPool, freeParty, freeRequest.idempotency_key);
    assert.equal(free.turn_number, Number(freeSessionBefore.turn_number) + 1,
      'free line crossing completes in one submitted turn');
    assert.ok(free.screen.main_prose.trim().length > 0, 'free line crossing returns player prose');
    const freeSessionAfter = await session(env.partyPool, freeParty);
    assert.equal(Number(freeSessionAfter.turn_number), Number(freeSessionBefore.turn_number) + 1);
    assert.equal(freeSessionAfter.last_turn_id, free.screen.turn_id);
    assert.deepEqual(movementLog.slice(freeMovementLogStart).map(({ movement_kind }) => movement_kind),
      ['route'], 'free path is one named route operation');
    const freePositionAfter = await actorLocation(env.partyPool, freeParty);
    assert.equal(freePositionAfter.g5, g5('water_access'));
    assert.equal(freePositionAfter.slot, 'arrival');
    assert.notDeepEqual(await clock(env.partyPool, freeParty), freeClockBefore,
      'free canonical line advances world time');
    });
  });
