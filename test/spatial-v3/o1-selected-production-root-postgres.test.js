import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { canonicalDigest } from '@rus/materialization';
import {
  bootstrapV17PresenceE2e,
  createPresenceProductionRoot,
  installPresenceProductionE2eFetch,
  publicStartScenario,
  submitObserveTurn,
} from './presence-rules-production-e2e-fixture.js';
import { TARGET_SMOKE_INPUT } from './target-http-browser-smoke.js';

const SCENARIO_ID = 'novgorod_vikhtuy_household_cluster_v1';
const INTERNAL_GAP_MARKERS = /PRESENCE_RULE_ITEM_TEMPLATE_DATA_GAP|template_closure_invalid|SPATIAL_V3_TARGET_O1_PROFILE_APPROVAL_REQUIRED/u;

async function loadSelectedSiteAggregate(partyPool, partyId) {
  return (await partyPool.query(
    `SELECT a.aggregate_payload, a.state_version, g5.canonical_g5_ref
       FROM party_runtime.party_ordinary_materialization_aggregates a
       JOIN party_runtime.party_g6_instances g6 ON g6.party_id=a.party_id
         AND a.scope_kind='g6' AND a.scope_id=g6.id
       JOIN party_runtime.party_g5_sites g5 ON g5.party_id=g6.party_id AND g5.id=g6.host_id
      WHERE a.party_id=$1
        AND COALESCE(g5.canonical_g5_ref->>'entity_id',g5.canonical_g5_ref->>'id')=$2
      LIMIT 1`,
    [partyId, 'cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_household_cluster'],
  )).rows[0];
}

function presenceRows(payload) {
  return (payload?.presence_resolutions ?? [])
    .filter((record) => Object.hasOwn(record, 'subject_kind'));
}

function presenceDigest(payload) {
  const rows = presenceRows(payload);
  return rows.length ? canonicalDigest(rows) : null;
}

function assertNoInternalO1Gap(value, message) {
  assert.doesNotMatch(JSON.stringify(value), INTERNAL_GAP_MARKERS, message);
}

test('selected O1 canonical start persists first-arrival once and keeps gap diagnostics out of delivery',
  { timeout: 1_800_000 }, async (t) => {
    const env = await bootstrapV17PresenceE2e(t);
    const modelRequests = [];
    const restoreFetch = installPresenceProductionE2eFetch({ requestLog: modelRequests });
    t.after(() => restoreFetch());
    const selector = JSON.parse(await readFile(
      'data/world-catalogs/novgorod/live-world-runtime-v17/ordinary-materialization-o1-applicability-selector-v1.json',
      'utf8'));
    const selectedRefs = new Set(selector.applicability.rule_refs.map(({ rule_id, rule_version }) =>
      `${rule_id}@${rule_version}`));

    let { runtime } = await createPresenceProductionRoot(env);
    try {
      const partyId = await publicStartScenario(runtime, SCENARIO_ID);
      const afterStart = await loadSelectedSiteAggregate(env.partyPool, partyId);
      assert.ok(afterStart?.aggregate_payload, 'selected canonical G5 must commit first-arrival aggregate');
      assert.equal(afterStart.canonical_g5_ref?.entity_id
        ?? afterStart.canonical_g5_ref?.id,
      'cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_household_cluster');
      const selectedRuleRefs = presenceRows(afterStart.aggregate_payload)
        .map((record) => record.rule_ref)
        .filter((ref) => selectedRefs.has(ref));
      assert.ok(selectedRuleRefs.length > 0, 'selected O1 rules must be processed at this tuple');
      const startDigest = presenceDigest(afterStart.aggregate_payload);
      assert.ok(startDigest);
      assertNoInternalO1Gap(afterStart.aggregate_payload, 'aggregate must not persist O1 gap codes');

      await submitObserveTurn(runtime, partyId, TARGET_SMOKE_INPUT);
      const afterLook = await loadSelectedSiteAggregate(env.partyPool, partyId);
      assert.equal(presenceDigest(afterLook.aggregate_payload), startDigest,
        'look must not reroll selected first-arrival presence');
      assertNoInternalO1Gap((await runtime.getPartyScreen(partyId)).screen,
        'player screen must not expose O1 gap diagnostics');
      assertNoInternalO1Gap(modelRequests, 'model-facing requests must not contain O1 gap diagnostics');

      await runtime.close();
      ({ runtime } = await createPresenceProductionRoot(env));
      assert.ok((await runtime.getPartyScreen(partyId)).screen.main_prose.trim().length > 0);
      const afterReload = await loadSelectedSiteAggregate(env.partyPool, partyId);
      assert.equal(presenceDigest(afterReload.aggregate_payload), startDigest,
        'production-root reload must reuse persisted first-arrival results');
      await submitObserveTurn(runtime, partyId, TARGET_SMOKE_INPUT);
      const afterSecondLook = await loadSelectedSiteAggregate(env.partyPool, partyId);
      assert.equal(presenceDigest(afterSecondLook.aggregate_payload), startDigest,
        'second look after reload must not reroll selected first-arrival presence');
      assertNoInternalO1Gap(modelRequests, 'model-facing requests must stay free of O1 gap diagnostics');
    } finally {
      await runtime.close();
    }
  });
