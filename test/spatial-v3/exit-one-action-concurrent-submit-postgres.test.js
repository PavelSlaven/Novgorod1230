import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  bootstrapV17PresenceE2e,
  createPresenceProductionRoot,
  installPresenceProductionE2eFetch,
} from './presence-rules-production-e2e-fixture.js';

const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url)));
const bindings = read('../../data/world-catalogs/novgorod/spatial-v3/candidates/m2c-g4-expansion-v1/datasets/spatial_v3_canonical_g5_connection_bindings.json');
const labels = read('../../data/world-catalogs/novgorod/m2c-canonical-connection-labels/candidate.json').labels;
const sourceG5 = 'cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_work_storage';
const targetG5 = 'cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_water_access';
const passage = labels.find((row) => row.binding_ref.id === bindings.find((row) =>
  row.from_canonical_g5_id === sourceG5 && row.to_canonical_g5_id === targetG5).id).display_label;
const scenarioId = 'novgorod_vikhtuy_work_storage_v1';

async function startParty(runtime) {
  const suffix = randomUUID();
  const opening = await runtime.startNewGame({ scenario_id: scenarioId,
    request_id: `exit-one-action-concurrent-${suffix}` });
  assert.equal(opening.screen.schema, 'first_game_screen');
  await runtime.acknowledgeOpening(opening.party_id, {
    client_ack_id: `exit-one-action-concurrent-ack-${suffix}`,
  });
  return opening.party_id;
}

async function actorPosition(pool, partyId) {
  const result = await pool.query(`SELECT scene_position_id, state_version FROM party_runtime.party_journey_locations
    WHERE party_id=$1 AND owner_kind='actor' AND location_kind='scene'`, [partyId]);
  assert.equal(result.rows.length, 1);
  return result.rows[0].scene_position_id;
}

async function destinationCounts(pool, partyId) {
  return (await pool.query(`SELECT
      (SELECT count(*)::int FROM party_runtime.party_g5_sites
        WHERE party_id=$1 AND canonical_g5_ref->>'entity_id'=$2) AS sites,
      (SELECT count(*)::int FROM party_runtime.g5_site_connections c
        JOIN party_runtime.party_g5_sites s ON s.party_id=c.party_id AND s.id=c.to_site_id
        WHERE c.party_id=$1 AND s.canonical_g5_ref->>'entity_id'=$2) AS connections,
      (SELECT count(*)::int FROM party_runtime.party_site_connection_endpoint_bindings b
        JOIN party_runtime.g5_site_connections c ON c.party_id=b.party_id AND c.id=b.site_connection_id
        JOIN party_runtime.party_g5_sites s ON s.party_id=c.party_id AND s.id=c.to_site_id
        WHERE b.party_id=$1 AND s.canonical_g5_ref->>'entity_id'=$2) AS endpoint_bindings`,
  [partyId, targetG5])).rows[0];
}

test('production submitTurn serializes the same unopened boundary and rolls staged expansion back on stale traversal',
  { timeout: 1_800_000 }, async (t) => {
    const env = await bootstrapV17PresenceE2e(t);
    const restoreFixtureFetch = installPresenceProductionE2eFetch({ movementPrefs: { exactMovement: true } });
    t.after(() => restoreFixtureFetch());
    const firstRoot = (await createPresenceProductionRoot(env)).runtime;
    const secondRoot = (await createPresenceProductionRoot(env)).runtime;
    t.after(async () => { await Promise.all([firstRoot.close(), secondRoot.close()]); });

    const concurrentParty = await startParty(firstRoot);
    const concurrentBefore = await actorPosition(env.partyPool, concurrentParty);
    assert.deepEqual(await destinationCounts(env.partyPool, concurrentParty),
      { sites: 0, connections: 0, endpoint_bindings: 0 });

    // Hold both real planner requests until each independent runtime has selected the same
    // disclosed route. This makes both submits start from the same committed source snapshot.
    const fixtureFetch = globalThis.fetch;
    let arrivals = 0;
    let releaseBoth;
    const bothArrived = new Promise((resolve) => { releaseBoth = resolve; });
    globalThis.fetch = async (url, init) => {
      const call = JSON.parse(init.body);
      const system = call.messages[0].content.replace(/^Return a valid json object\.\s*/u, '');
      if (system.startsWith('Return only one JSON object containing the semantic choice for one turn step.')) {
        const user = JSON.parse(call.messages.find((message) => message.role === 'user').content);
        const request = user.request ?? user;
        if (request.root_player_action === passage) {
          arrivals += 1;
          if (arrivals === 2) releaseBoth();
          if (arrivals <= 2) {
            let timeout;
            try {
              await Promise.race([bothArrived, new Promise((_, reject) => {
                timeout = setTimeout(() => reject(new Error('both submitTurn calls did not reach planner')), 60_000);
              })]);
            } finally { clearTimeout(timeout); }
          }
        }
      }
      return fixtureFetch(url, init);
    };
    const concurrent = Promise.allSettled([
      firstRoot.submitTurn(concurrentParty, { raw_text: passage, request_id: `race-a-${randomUUID()}` }),
      secondRoot.submitTurn(concurrentParty, { raw_text: passage, request_id: `race-b-${randomUUID()}` }),
    ]);
    let settled;
    let pairTimeout;
    try {
      settled = await Promise.race([concurrent, new Promise((_, reject) => {
        pairTimeout = setTimeout(() => reject(new Error('concurrent submitTurn pair exceeded 60 seconds')), 60_000);
      })]);
    } finally { clearTimeout(pairTimeout); globalThis.fetch = fixtureFetch; }
    assert.equal(arrivals, 2, 'both submissions reached the same boundary before either could commit');
    assert.equal(settled.length, 2);
    assert.equal(settled.filter((entry) => entry.status === 'fulfilled').length, 1,
      'exactly one submitTurn succeeds');
    assert.equal(settled.filter((entry) => entry.status === 'rejected').length, 1,
      'the stale concurrent submit is a typed refusal');
    const refusal = settled.find((entry) => entry.status === 'rejected').reason;
    assert.match(refusal.code ?? '', /^LIVE_WORLD_/u);
    const counts = await destinationCounts(env.partyPool, concurrentParty);
    assert.deepEqual(counts, { sites: 1, connections: 1, endpoint_bindings: 2 },
      'the concurrent submissions create exactly one destination and one connection');
    const concurrentAfter = await actorPosition(env.partyPool, concurrentParty);
    assert.notEqual(concurrentAfter.scene_position_id, concurrentBefore.scene_position_id,
      'the winning submitTurn moved the actor across the boundary');
    assert.equal(Number(concurrentAfter.state_version), Number(concurrentBefore.state_version) + 1,
      'only the winning submitTurn advanced party location state');

    // A test-only trigger changes the actor source position after the expansion rows are staged,
    // inside the same transaction. Traversal must see the stale source and roll the whole attempt back.
    const staleParty = await startParty(firstRoot);
    const staleBefore = await actorPosition(env.partyPool, staleParty);
    assert.deepEqual(await destinationCounts(env.partyPool, staleParty),
      { sites: 0, connections: 0, endpoint_bindings: 0 });
    await env.partyPool.query(`CREATE FUNCTION party_runtime.exit_one_action_stale_source() RETURNS trigger
      LANGUAGE plpgsql AS $$
      DECLARE departure_position text;
      BEGIN
        SELECT departure.id INTO departure_position
          FROM party_runtime.party_journey_locations loc
          JOIN party_runtime.scene_position_nodes current_position
            ON current_position.party_id=loc.party_id AND current_position.id=loc.scene_position_id
          JOIN party_runtime.scene_position_nodes departure
            ON departure.party_id=current_position.party_id
           AND departure.g6_instance_id=current_position.g6_instance_id
           AND departure.template_slot_key='departure'
         WHERE loc.party_id=NEW.party_id AND loc.owner_kind='actor'
           AND loc.location_kind='scene' AND departure.id<>loc.scene_position_id
         LIMIT 1;
        IF departure_position IS NOT NULL THEN
          UPDATE party_runtime.party_journey_locations SET scene_position_id=departure_position
           WHERE party_id=NEW.party_id AND owner_kind='actor' AND location_kind='scene';
        END IF;
        RETURN NEW;
      END $$`);
    await env.partyPool.query(`CREATE TRIGGER exit_one_action_stale_source_after_stage
      AFTER INSERT ON party_runtime.party_g5_sites FOR EACH ROW
      WHEN (NEW.party_id = '${staleParty}')
      EXECUTE FUNCTION party_runtime.exit_one_action_stale_source()`);
    await assert.rejects(firstRoot.submitTurn(staleParty, {
      raw_text: passage, request_id: `stale-after-stage-${randomUUID()}`,
    }), (error) => error.code === 'LIVE_WORLD_TRAVERSAL_DENIED');
    assert.deepEqual(await destinationCounts(env.partyPool, staleParty),
      { sites: 0, connections: 0, endpoint_bindings: 0 },
      'stale traversal rolls all staged destination topology back');
    assert.deepEqual(await actorPosition(env.partyPool, staleParty), staleBefore,
      'the test trigger update is rolled back with the rejected turn');
  });
