import assert from 'node:assert/strict';
import test from 'node:test';

import { bootstrapV17PresenceE2e, createPresenceProductionRoot,
  installPresenceProductionE2eFetch, publicStartScenario } from './presence-rules-production-e2e-fixture.js';
import { createRouteWalker, peopleAt } from './route-people-helpers.js';

/**
 * The people mechanism against a real v17 database with the approved people data (people-d49): a place whose composition
 * has a floor gets its person (never at the arrival position), and coming back to places, also across a restart of the
 * runtime, neither adds nor changes people. Starts at household_cluster (authored, holds nobody from the composition).
 */
test('a composition floor puts a person on the place; coming back neither adds nor changes people',
  { timeout: 1_800_000 }, async (t) => {
    const env = await bootstrapV17PresenceE2e(t);
    const restoreFetch = installPresenceProductionE2eFetch({ movementPrefs: { exactMovement: true } });
    t.after(() => restoreFetch());
    let root = await createPresenceProductionRoot(env);
    t.after(() => root.runtime.close());
    const partyId = await publicStartScenario(root.runtime, 'novgorod_vikhtuy_household_cluster_v1');
    const walker = createRouteWalker({ env, runtimeRef: () => root, partyId });
    assert.equal((await walker.where()).name, 'household_cluster', 'the start may hold nobody from the composition');
    const restart = async () => { await root.runtime.close(); root = await createPresenceProductionRoot(env); };
    const snapshot = async (siteId) => (await peopleAt(env, partyId, siteId)).npcs.map((npc) => npc.npc_id);

    const storage = await walker.walkTo('work_storage');
    const first = await peopleAt(env, partyId, storage.site_id);
    t.diagnostic(`work_storage people=${first.npcs.length} ${first.npcs.map((npc) => npc.occupation)} gaps=${JSON.stringify(first.trace.gaps)}`);
    assert.deepEqual(first.trace.gaps, [], 'work_storage: composition, profile, regional and actor data are accepted');
    assert.equal(first.npcs.length, 1, 'pf_outbuildings composition: one servant');
    assert.equal(first.npcs[0].occupation, 'nov_occ_household_servant');
    assert.ok(['focus', 'departure'].includes(first.npcs[0].slot));

    const water = await walker.walkTo('water_access');
    const bank = await peopleAt(env, partyId, water.site_id);
    t.diagnostic(`water_access people=${bank.npcs.length} ${bank.npcs.map((npc) => npc.occupation)} gaps=${JSON.stringify(bank.trace.gaps)}`);
    assert.deepEqual(bank.trace.gaps, []);
    assert.equal(bank.npcs.length, 1, 'riverbank floor (D49, approved data): one fisher');
    assert.equal(bank.npcs[0].occupation, 'nov_occ_fisher');

    await walker.walkTo('work_storage');
    await restart();
    await walker.walkTo('household_cluster');
    await walker.walkTo('work_storage');
    await walker.walkTo('water_access');
    assert.deepEqual(await snapshot(storage.site_id), first.npcs.map((npc) => npc.npc_id));
    assert.deepEqual(await snapshot(water.site_id), bank.npcs.map((npc) => npc.npc_id));
    const total = Number((await env.partyPool.query(
      `SELECT count(*) AS n FROM party_runtime.party_npcs WHERE party_id=$1 AND run_id LIKE 'trace:%'`, [partyId])).rows[0].n);
    assert.equal(total, first.npcs.length + bank.npcs.length, 'revisits create no second person');
  });
