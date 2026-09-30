import assert from 'node:assert/strict';
import test from 'node:test';

import {
  bootstrapV17PresenceE2e,
  createPresenceProductionRoot,
  installPresenceProductionE2eFetch,
  publicStartScenario,
} from './presence-rules-production-e2e-fixture.js';
import { createRouteWalker, peopleAt } from './route-people-helpers.js';

/**
 * D49: people on the places of the slice route. Expectations follow the approved data of today
 * (tighten, never loosen, when the people data lands: profiles for householder, mistress, ferryman and
 * crossing guard, floors for riverbank / rural yard / village lane, G4-wide regional applicability).
 * A place without people must say why in the first-arrival trace (`people.gaps`), and never fail the arrival.
 */
const PROFILE_GAP = 'people_profile_missing';
const REGIONAL_GAP = ['people_compile_failed', 'NPC_COMPOSITION_REGIONAL_CONTEXT_GAP'];
const ROUTE = [
  // place, place family, gaps allowed today (a person from a 25% rule may be absent, so no gap then)
  ['water_access', 'pf_riverbank', [REGIONAL_GAP]],
  ['forest_path', 'pf_village_lane', [PROFILE_GAP]],
  ['meeting_area', 'pf_rural_yard', [PROFILE_GAP]],
  ['river_approach', 'pf_riverbank', [REGIONAL_GAP]],
  ['landing_candidate', 'pf_ferry_landing', [PROFILE_GAP, PROFILE_GAP]],
  ['occupation_terrace', 'pf_peasant_homestead', [PROFILE_GAP, PROFILE_GAP]],
  ['household_cluster', 'pf_peasant_homestead', [PROFILE_GAP, PROFILE_GAP]],
];

test('route of Vikhtuy: the start may be empty, every other place reports its people or the reason for none',
  { timeout: 1_800_000 }, async (t) => {
    const env = await bootstrapV17PresenceE2e(t);
    const restoreFetch = installPresenceProductionE2eFetch({ movementPrefs: { exactMovement: true } });
    t.after(() => restoreFetch());
    let root = await createPresenceProductionRoot(env);
    t.after(() => root.runtime.close());
    const partyId = await publicStartScenario(root.runtime, 'novgorod_vikhtuy_work_storage_v1');
    const walker = createRouteWalker({ env, runtimeRef: () => root, partyId });
    const start = await walker.where();
    assert.equal(start.name, 'work_storage');
    const startPeople = await peopleAt(env, partyId, start.site_id);
    t.diagnostic(`start work_storage: people=${startPeople.npcs.length}`);
    assert.equal(startPeople.npcs.filter((npc) => npc.run_id.startsWith('trace:')).length, 0,
      'the start place is authored: the first-arrival people mechanism creates nobody there');

    for (const [place, family, allowedGaps] of ROUTE) {
      const at = await walker.walkTo(place);
      assert.equal(at.slot, 'arrival');
      const { npcs, trace } = await peopleAt(env, partyId, at.site_id);
      assert.ok(trace, `${place}: the first-arrival trace carries the people part (${family})`);
      t.diagnostic(`${place} (${family}): people=${npcs.length} roles=${npcs.map((npc) => npc.occupation).join(',')} gaps=${JSON.stringify(trace.gaps)}`);
      const gaps = trace.gaps.map((gap) => [gap.code, gap.reason].filter(Boolean));
      // Every gap is one the approved data explains today; a place without people has at least one reason or rolled absent.
      for (const gap of gaps) {
        assert.ok(allowedGaps.some((allowed) => JSON.stringify([allowed].flat()) === JSON.stringify(gap)),
          `${place}: unexpected gap ${JSON.stringify(gap)}`);
      }
      const wanted = trace.groups.reduce((sum, group) => sum + group.count, 0) + trace.rules.reduce((sum, rule) => sum + rule.count, 0);
      const compileFailed = trace.gaps.some((gap) => gap.code === 'people_compile_failed');
      assert.equal(npcs.length, compileFailed ? 0 : wanted - gaps.length,
        `${place}: created people = wanted people - gaps (a compile failure covers everybody)`);
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
      if (family === 'pf_ferry_landing' || family === 'pf_peasant_homestead') {
        assert.equal(gaps.length, 2, `${place}: the composition asks for two people whose profiles are not approved yet`);
      }
    }
  });
