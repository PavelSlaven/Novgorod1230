import assert from 'node:assert/strict';
import test from 'node:test';

import { VIKHTUY_LOCALITY_G4, bootstrapV17PresenceE2e, createPresenceProductionRoot,
  installPresenceProductionE2eFetch, publicStartScenario } from './presence-rules-production-e2e-fixture.js';
import { createRouteWalker, peopleAt } from './route-people-helpers.js';

/**
 * The people mechanism against a real v17 database once the people data is in place. The people-data task delivers
 * (a) a G4-wide applicability entry on the regional contexts and (b) a floor of one fisher in the riverbank
 * composition; both are simulated here inside the isolated test database until that data is merged.
 * Then: a place whose composition has a floor gets its person (never at the arrival position), and coming back to
 * places, also across a restart of the runtime, neither adds nor changes people.
 */
const worldRevision = 'novgorod_spatial_v3_target_contract_approval_001';
async function simulatePeopleData(worldPool) {
  const g4 = (await worldPool.query(`SELECT version FROM world_base.spatial_v3_nodes
    WHERE id=$1 AND world_revision_id=$2 AND status='approved' ORDER BY version DESC LIMIT 1`,
  [VIKHTUY_LOCALITY_G4, worldRevision])).rows[0];
  const entry = JSON.stringify([{ g4_ref: { id: VIKHTUY_LOCALITY_G4, version: Number(g4.version), world_revision_id: worldRevision } }]);
  const digest = 'ab'.repeat(32);
  const rows = (await worldPool.query(`UPDATE world_base.spatial_v3_npc_regional_context_profiles
    SET payload=jsonb_set(payload,'{applicability}',(payload->'applicability') || $1::jsonb), canonical_digest=$2
    WHERE world_revision_id=$3 RETURNING id,version`, [entry, digest, worldRevision])).rows;
  assert.ok(rows.length > 0);
  for (const { id, version } of rows) {
    const updated = await worldPool.query(`UPDATE world_base.spatial_v3_authoring_versions SET canonical_digest=$1
      WHERE entity_kind='npc_regional_context_profile' AND entity_id=$2 AND version=$3 AND world_revision_id=$4`,
    [digest, id, version, worldRevision]);
    assert.equal(updated.rowCount, 1, `authoring version of ${id}@${version}`);
  }
  const floor = [{ group_id: 'pf_riverbank.fisher', group_kind: 'workers', min_count: 1, max_count: 1, count_weights: [1],
    weighted_subjects: [{ subject_kind: 'occupation', subject_ref: 'nov_occ_fisher', profile_ref: null, weight: 1 }] }];
  const composition = await worldPool.query(`UPDATE world_base.place_population_composition_rules
    SET population_groups=$1::jsonb WHERE place_family_id='pf_riverbank' AND world_revision_id=$2`,
  [JSON.stringify(floor), worldRevision]);
  assert.equal(composition.rowCount, 1);
}

test('a composition floor puts a person on the place; coming back neither adds nor changes people',
  { timeout: 1_800_000 }, async (t) => {
    const env = await bootstrapV17PresenceE2e(t);
    await simulatePeopleData(env.worldPool);
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
    assert.equal(bank.npcs.length, 1, 'riverbank floor: one fisher');
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
