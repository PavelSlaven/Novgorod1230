import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalDigest, isO1PresenceRecord } from '@rus/materialization';

import {
  VIKHTUY_MEETING_G5,
  bootstrapV17PresenceE2e,
  createPresenceProductionRoot,
  installPresenceProductionE2eFetch,
  publicStartScenario,
  submitObserveTurn,
  walkRouteUntil,
} from './presence-rules-production-e2e-fixture.js';
import { TARGET_SMOKE_INPUT } from './target-http-browser-smoke.js';

const B1_SKIP_REASON = 'CR #160 / m2c/b1-passages: departure from arrival/focus positions '
  + 'requires approach operation; merge origin/m2c/b1-passages before enabling cross-site e2e.';

async function loadStartG6Aggregate(partyPool, partyId) {
  return (await partyPool.query(
    `SELECT a.aggregate_payload, a.state_version
       FROM party_runtime.party_ordinary_materialization_aggregates a
       JOIN party_runtime.party_g6_instances g6 ON g6.party_id=a.party_id
         AND a.scope_kind='g6' AND a.scope_id=g6.id
       JOIN party_runtime.party_player_characters pc ON pc.party_id=a.party_id
       JOIN party_runtime.party_journey_locations loc
         ON loc.party_id=pc.party_id AND loc.owner_kind='actor'
        AND loc.owner_id=pc.character_id
       JOIN party_runtime.scene_position_nodes pos
         ON pos.party_id=loc.party_id AND pos.id=loc.scene_position_id
        AND pos.g6_instance_id=g6.id
      WHERE a.party_id=$1
      LIMIT 1`,
    [partyId],
  )).rows[0];
}

function presenceRuleRows(aggregatePayload) {
  return (aggregatePayload?.presence_resolutions ?? [])
    .filter((record) => Object.hasOwn(record, 'subject_kind'));
}

function presenceDigest(aggregatePayload) {
  const rows = presenceRuleRows(aggregatePayload);
  return rows.length ? canonicalDigest(rows) : null;
}

test('start site: presence at new game, reload and re-look without reroll',
  { timeout: 1_800_000 }, async (t) => {
    const env = await bootstrapV17PresenceE2e(t);
    const restoreFetch = installPresenceProductionE2eFetch();
    t.after(() => restoreFetch());

    const { runtime } = await createPresenceProductionRoot(env);
    try {
      const partyId = await publicStartScenario(runtime, 'novgorod_vikhtuy_work_storage_v1');
      const rowAfterStart = await loadStartG6Aggregate(env.partyPool, partyId);
      assert.ok(rowAfterStart, 'start should commit ordinary materialization aggregate');
      const digestAtStart = presenceDigest(rowAfterStart.aggregate_payload);
      assert.ok(digestAtStart, 'party start should commit presence rules on the start G5 site');
      assert.equal(
        presenceRuleRows(rowAfterStart.aggregate_payload)
          .filter(isO1PresenceRecord).length,
        0,
        'presence-rule rows are not O1 presence records',
      );

      await submitObserveTurn(runtime, partyId, TARGET_SMOKE_INPUT);
      const rowAfterLook = await loadStartG6Aggregate(env.partyPool, partyId);
      assert.equal(presenceDigest(rowAfterLook.aggregate_payload), digestAtStart,
        'observation turn must not reroll presence rules');

      const reloaded = await createPresenceProductionRoot(env);
      try {
        const screen = await reloaded.runtime.getPartyScreen(partyId);
        assert.ok(screen.screen.main_prose.trim().length > 0);
        const rowReloaded = await loadStartG6Aggregate(env.partyPool, partyId);
        assert.equal(presenceDigest(rowReloaded.aggregate_payload), digestAtStart);
      } finally {
        await reloaded.runtime.close();
      }

      await submitObserveTurn(runtime, partyId, TARGET_SMOKE_INPUT);
      const rowAfterSecondLook = await loadStartG6Aggregate(env.partyPool, partyId);
      assert.equal(presenceDigest(rowAfterSecondLook.aggregate_payload), digestAtStart,
        'second look on the same start site must not repeat presence seed');
    } finally {
      await runtime.close();
    }
  });

test('generated G5: cross-site movement and reload', { skip: B1_SKIP_REASON, timeout: 1_800_000 },
  async (t) => {
    const env = await bootstrapV17PresenceE2e(t);
    const restoreFetch = installPresenceProductionE2eFetch();
    t.after(() => restoreFetch());
    const { runtime } = await createPresenceProductionRoot(env);
    try {
      const partyId = await publicStartScenario(runtime, 'novgorod_riverbank_approach_v1');
      await walkRouteUntil({
        runtime,
        partyPool: env.partyPool,
        partyId,
        observeText: TARGET_SMOKE_INPUT,
        maxSteps: 32,
        sitePredicate: async ({ partyPool, partyId: id }) => {
          const site = (await partyPool.query(
            `SELECT origin FROM party_runtime.party_g5_sites WHERE party_id=$1 LIMIT 1`,
            [id],
          )).rows[0];
          return site?.origin === 'generated';
        },
      });
    } finally {
      await runtime.close();
    }
  });

test('canonical vikhtuy meeting_area PF binding', { skip: B1_SKIP_REASON, timeout: 1_800_000 },
  async (t) => {
    const env = await bootstrapV17PresenceE2e(t);
    const restoreFetch = installPresenceProductionE2eFetch();
    t.after(() => restoreFetch());
    const { runtime } = await createPresenceProductionRoot(env);
    try {
      const partyId = await publicStartScenario(runtime, 'novgorod_vikhtuy_work_storage_v1');
      await walkRouteUntil({
        runtime,
        partyPool: env.partyPool,
        partyId,
        observeText: TARGET_SMOKE_INPUT,
        maxSteps: 28,
        sitePredicate: async ({ partyPool, partyId: id }) => {
          const site = (await partyPool.query(
            `SELECT canonical_g5_ref FROM party_runtime.party_g5_sites WHERE party_id=$1 LIMIT 1`,
            [id],
          )).rows[0];
          const ref = site?.canonical_g5_ref?.id ?? site?.canonical_g5_ref;
          return ref === VIKHTUY_MEETING_G5;
        },
      });
      const aggregate = (await loadStartG6Aggregate(env.partyPool, partyId))?.aggregate_payload;
      const ruralYardRuleIds = new Set(
        presenceRuleRows(aggregate)
          .map((row) => row.rule_ref)
          .filter((ref) => typeof ref === 'string'),
      );
      assert.ok(
        ruralYardRuleIds.size > 0,
        'meeting_area arrival should commit at least one presence rule resolution',
      );
      assert.ok(
        [...ruralYardRuleIds].every((ref) => /^pr_[^@]+@[0-9]+$/u.test(ref)),
        'presence resolutions store rule_ref, not place_family_id',
      );
    } finally {
      await runtime.close();
    }
  });
