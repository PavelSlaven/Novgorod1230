import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  VIKHTUY_LOCALITY_G4,
  bootstrapV17PresenceE2e,
  createPresenceProductionRoot,
  installPresenceProductionE2eFetch,
  publicStartScenario,
  submitObserveTurn,
} from './presence-rules-production-e2e-fixture.js';
import { TARGET_SMOKE_INPUT } from './target-http-browser-smoke.js';

const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url)));
const bindings = read('../../data/world-catalogs/novgorod/spatial-v3/candidates/m2c-lines-v1/datasets/spatial_v3_canonical_g5_connection_bindings.json');
const g5 = (name) => `cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_${name}`;
/** The approved line name of the passage between two places of Vikhtuy (the player names it). */
const passage = (from, to) => {
  const binding = bindings.find((row) => row.from_canonical_g5_id === g5(from) && row.to_canonical_g5_id === g5(to));
  assert.ok(binding, `${from} -> ${to} must use an approved m2c-lines-v1 binding`);
  return binding.line_discriminator == null || binding.line_discriminator === ''
    ? binding.line_name : `${binding.line_name} · ${binding.line_discriminator}`;
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

async function journeyVersion(partyPool, partyId) {
  const row = (await partyPool.query(
    `SELECT state_version FROM party_runtime.party_journey_locations
      WHERE party_id=$1 AND owner_kind='actor'`, [partyId])).rows[0];
  return Number(row.state_version);
}

test('work_storage -> water_access -> forest_path -> meeting_area and back, across process restarts',
  { timeout: 1_800_000 }, async (t) => {
    const env = await bootstrapV17PresenceE2e(t);
    const narrationLog = [];
    const restoreFetch = installPresenceProductionE2eFetch({ movementPrefs: { exactMovement: true }, narrationLog });
    t.after(() => restoreFetch());
    let { runtime } = await createPresenceProductionRoot(env);
    t.after(() => runtime.close());
    const restart = async () => { await runtime.close(); ({ runtime } = await createPresenceProductionRoot(env)); };
    const partyId = await publicStartScenario(runtime, 'novgorod_vikhtuy_work_storage_v1');
    await submitObserveTurn(runtime, partyId, TARGET_SMOKE_INPUT);
    let step = 0;
    const turn = (raw_text, requestId = `walk-${partyId}-${step++}`) => runtime.submitTurn(partyId,
      { raw_text, request_id: requestId });
    const count = async (sql) => Number((await env.partyPool.query(sql, [partyId])).rows[0].count);

    /** A named line implicitly composes any local approach and crossing in one production turn. */
    async function walkTo(to) {
      const from = (await whereIs(env.partyPool, partyId)).name;
      const named = passage(from, to);
      const journeyBefore = await journeyVersion(env.partyPool, partyId);
      const requestId = `walk-${partyId}-${step++}`;
      narrationLog.length = 0;
      const result = await turn(named, requestId);
      const arrived = await whereIs(env.partyPool, partyId);
      assert.equal(arrived.name, to, `${from} -> ${to} via "${named}"`);
      assert.equal(arrived.slot, 'arrival', 'the traveller stands at the arrival endpoint of the new place');
      assert.equal(await journeyVersion(env.partyPool, partyId), journeyBefore + 1,
        'one production turn writes journey location once');
      assert.ok(narrationLog.at(-1)?.changes.length > 0, 'the arrival turn gives the narrator a committed change');
      const replay = await turn(named, requestId);
      assert.equal(replay.state_version, result.state_version, 'same-key line turn replays the committed result');
      assert.equal(replay.turn_number, result.turn_number);
      assert.equal(await journeyVersion(env.partyPool, partyId), journeyBefore + 1,
        'same-key replay does not write journey a second time');
    }

    const start = await whereIs(env.partyPool, partyId);
    assert.equal(start.name, 'work_storage');
    assert.equal(start.slot, 'arrival', 'the approved start begins away from the canonical connection departure endpoint');
    assert.equal(await count(`SELECT count(*) FROM party_runtime.g5_site_connections WHERE party_id=$1`), 0);

    await walkTo('water_access');
    await restart();
    await walkTo('forest_path');
    await walkTo('meeting_area');
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
