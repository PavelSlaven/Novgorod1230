import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import test from 'node:test';
import { createGameHttpServer, listen } from '../src/index.js';
import { projectOccupiedLineStartInput } from './line-occupied-start-materialization-input.js';
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
const UNSAFE_SERVICE_TEXT = /\b(?:N\d+|owner|stage|repair|attemptRefusal|movement_admission|SPATIAL_V3_[A-Z0-9_]+|LIVE_WORLD_[A-Z0-9_]+)\b/iu;
const UNSAFE_D72_KEY = /(?:^|_)(?:id|ref|refs|trace|version|counter|count)$/iu;

function findUnsafePlayerText(value, path = '$', findings = []) {
  if (typeof value === 'string') {
    if (UNSAFE_SERVICE_TEXT.test(value)) findings.push(path);
    return findings;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => findUnsafePlayerText(item, `${path}[${index}]`, findings));
    return findings;
  }
  if (value != null && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      if (UNSAFE_D72_KEY.test(key)) findings.push(`${path}.${key}`);
      findUnsafePlayerText(child, `${path}.${key}`, findings);
    }
  }
  return findings;
}

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

test('captured narrator request for an occupied hidden line step has no hidden ids or service markers',
  { timeout: 1_800_000 }, async (t) => {
    const env = await bootstrapV17PresenceE2e(t);
    const movementLog = [];
    const narrationLog = [];
    const requestLog = [];
    const restoreFetch = installPresenceProductionE2eFetch({
      movementPrefs: { exactMovement: true }, movementLog, narrationLog, requestLog,
    });
    t.after(() => restoreFetch());
    const { runtime } = await createPresenceProductionRoot(env, {
      testOnlyProjectStartMaterializationInput: projectOccupiedLineStartInput,
    });
    t.after(() => runtime.close());
    const server = createGameHttpServer({ root: runtime });
    const address = await listen(server, { host: '127.0.0.1', port: 0 });
    t.after(() => new Promise((resolve) => server.close(resolve)));

    const start = async (suffix) => {
      const opening = await runtime.startNewGame({ scenario_id: scenario,
        request_id: `line-occupied-${suffix}` });
      assert.equal(opening.screen.schema, 'first_game_screen');
      await runtime.acknowledgeOpening(opening.party_id,
        { client_ack_id: `line-occupied-ack-${suffix}` });
      return opening.party_id;
    };
    const blockedParty = await start('blocked');

    const beforeBlockedPosition = await actorLocation(env.partyPool, blockedParty);
    assert.equal(beforeBlockedPosition.g5, g5('work_storage'));
    assert.notEqual(beforeBlockedPosition.slot, 'departure');
    const path = await firstLocalApproachEdge(env.partyPool, blockedParty, beforeBlockedPosition);
    assert.ok(routeMovementLabels((await runtime.getPartyScreen(blockedParty)).screen)
      .includes(lineLabel), 'the named line remains one player-visible route choice');

    const blockedClockBefore = await clock(env.partyPool, blockedParty);
    const blockedSessionBefore = await session(env.partyPool, blockedParty);
    const blockedMovementLogStart = movementLog.length;
    const blockedNarrationLogStart = narrationLog.length;
    const blockedRequestLogStart = requestLog.length;
    const blockedResponse = await postTurn(address, blockedParty, {
      raw_text: lineLabel, request_id: `line-occupied-blocked-${blockedParty}`,
      idempotency_key: `line-occupied-blocked-${blockedParty}`,
    });
    assert.equal(blockedResponse.status, 200,
      `occupied refusal must commit successfully; error_code=${blockedResponse.body?.error?.code ?? 'none'}`);
    assert.deepEqual({ schema: blockedResponse.body.schema, ok: blockedResponse.body.ok },
      { schema: 'rus_api_success', ok: true }, 'occupied attempt returns success envelope');
    assert.equal(Object.hasOwn(blockedResponse.body, 'error'), false);
    const blocked = blockedResponse.body.data;
    assert.equal(blocked.status, 'resolved');
    assert.equal(blocked.commit.status, 'committed');
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
    assert.equal(blockedSessionAfter.last_turn_id, blocked.turn_id);

    const narratorRequests = requestLog.slice(blockedRequestLogStart).filter(({ system, user }) =>
      system.startsWith('Return only {"prose"') && user?.required_current_beat != null);
    assert.ok(narratorRequests.length > 0, 'the actual narrator provider request was captured');
    const narratorPayload = JSON.stringify(narratorRequests);
    const publicPayload = JSON.stringify(blockedResponse.body);
    const screenPayload = JSON.stringify((await runtime.getPartyScreen(blockedParty)).screen);
    for (const hiddenId of [...path.edge_ids, ...path.position_ids.slice(1)]) {
      assert.equal(narratorPayload.includes(hiddenId), false,
        'actual narrator input omits each hidden local edge and position id');
      assert.equal(publicPayload.includes(hiddenId), false,
        'public response omits each hidden local edge and position id');
      assert.equal(screenPayload.includes(hiddenId), false,
        'committed player screen omits each hidden local edge and position id');
    }
    assert.deepEqual(findUnsafePlayerText(narratorRequests), [],
      'actual narrator system/user fields omit D72 service markers and identifier metadata');
  });
