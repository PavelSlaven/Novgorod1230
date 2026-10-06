import assert from 'node:assert/strict';
import test from 'node:test';

import {
  bootstrapV17PresenceE2e,
  createPresenceProductionRoot,
  installPresenceProductionE2eFetch,
  publicStartScenario,
  submitObserveTurn,
} from './presence-rules-production-e2e-fixture.js';
import { createRouteWalker, peopleAt } from './route-people-helpers.js';
import { TARGET_SMOKE_INPUT } from './target-http-browser-smoke.js';

/**
 * D49: every place of the Vikhtuy slice route after the start has at least one person, made from approved data
 * (people-d49 approval: game-base D-2 thresholds, wave, profiles). The route table is exact: who stands where
 * (occupation and sex from the profile) and that no place has a gap. D53: the ferry landing has the ferryman only
 * (no crossing guard in the sources). Tighten, never loosen.
 */
const FISHER = { nov_occ_fisher: 'male' };
const HOUSEHOLDER = { nov_occ_haymaker: 'male' };
const HOMESTEAD = { nov_occ_haymaker: 'male', nov_occ_cook_baker: 'female' };
const ROUTE = [
  // place, place family, expected people (occupation -> sex), expected gaps
  ['water_access', 'pf_riverbank', FISHER, []],
  ['forest_path', 'pf_village_lane', HOUSEHOLDER, []],
  ['meeting_area', 'pf_rural_yard', HOUSEHOLDER, []],
  ['river_approach', 'pf_riverbank', FISHER, []],
  ['landing_candidate', 'pf_ferry_landing', { nov_occ_ferryman: 'male' }, []],
  ['occupation_terrace', 'pf_peasant_homestead', HOMESTEAD, []],
  ['household_cluster', 'pf_peasant_homestead', HOMESTEAD, []],
];

test('route of Vikhtuy: the start may be empty, every other place has at least one person from approved data',
  { timeout: 1_800_000 }, async (t) => {
    const env = await bootstrapV17PresenceE2e(t);
    const movementPrefs = { exactMovement: true };
    const restoreFetch = installPresenceProductionE2eFetch({ movementPrefs });
    t.after(() => restoreFetch());
    let root = await createPresenceProductionRoot(env);
    t.after(() => root.runtime.close());
    const partyId = await publicStartScenario(root.runtime, 'novgorod_vikhtuy_work_storage_v1');
    await submitObserveTurn(root.runtime, partyId, TARGET_SMOKE_INPUT);
    const walker = createRouteWalker({ env, runtimeRef: () => root, partyId, movementPrefs });
    const start = await walker.where();
    assert.equal(start.name, 'work_storage');
    const startPeople = await peopleAt(env, partyId, start.site_id);
    t.diagnostic(`start work_storage: people=${startPeople.npcs.length}`);
    assert.equal(startPeople.npcs.filter((npc) => npc.run_id.startsWith('trace:')).length, 0,
      'the start place is authored: the first-arrival people mechanism creates nobody there');

    for (const [place, family, expected, expectedGaps] of ROUTE) {
      const at = await walker.walkTo(place);
      assert.equal(at.slot, 'arrival');
      const { npcs, trace } = await peopleAt(env, partyId, at.site_id);
      assert.ok(trace, `${place}: the first-arrival trace carries the people part (${family})`);
      t.diagnostic(`${place} (${family}): people=${npcs.length} roles=${npcs.map((npc) => npc.occupation).join(',')} gaps=${JSON.stringify(trace.gaps)}`);
      const gaps = trace.gaps.map(({ code, subject_ref }) => ({ code, subject_ref }));
      assert.deepEqual(gaps, expectedGaps, `${place}: the only gap is the one the approved data explains`);
      assert.ok(npcs.length >= 1, `${place}: D49 at least one person`);
      assert.deepEqual(Object.fromEntries(npcs.map((npc) => [npc.occupation, npc.sex]).sort()), expected,
        `${place}: people by occupation and sex`);
      const wanted = trace.groups.reduce((sum, group) => sum + group.count, 0) + trace.rules.reduce((sum, rule) => sum + rule.count, 0);
      assert.equal(npcs.length, wanted - gaps.length, `${place}: created people = wanted people - gaps`);
      assert.ok(npcs.every((npc) => npc.run_id.startsWith('trace:')), `${place}: created by the arrival run`);
      // the rule outcomes of the trace are the ones the presence engine stored in the aggregate (§3A.1)
      const stored = (await env.partyPool.query(
        `SELECT r->>'rule_ref' AS rule_ref, (r->>'count')::int AS count
           FROM party_runtime.party_ordinary_materialization_aggregates a
           JOIN party_runtime.party_g6_instances g6 ON g6.party_id=a.party_id AND g6.id=a.scope_id AND a.scope_kind='g6',
                jsonb_array_elements(a.aggregate_payload->'presence_resolutions') r
          WHERE a.party_id=$1 AND g6.host_id=$2 AND r->>'subject_kind' IN ('occupation','social_role')
          ORDER BY 1`, [partyId, at.site_id])).rows;
      const byRef = (a, b) => a.rule_ref.localeCompare(b.rule_ref);
      assert.deepEqual(stored.sort(byRef), trace.rules.map(({ rule_ref, count }) => ({ rule_ref, count })).sort(byRef),
        `${place}: rule outcomes are stored in the presence aggregate`);
      assert.ok(npcs.every((npc) => ['focus', 'departure'].includes(npc.slot)), `${place}: nobody at the arrival position`);
    }
  });
