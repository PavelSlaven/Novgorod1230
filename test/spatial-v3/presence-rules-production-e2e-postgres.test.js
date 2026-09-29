import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalDigest, isO1PresenceRecord } from '@rus/materialization';

import { SPATIAL_V3_TARGET_PRODUCTION_RELEASE } from
  '../../apps/game-server/src/composition/production-spatial-v3-release-v17.js';
import {
  PF_RURAL_YARD,
  VIKHTUY_MEETING_G5,
  bootstrapV17PresenceE2e,
  createPresenceProductionRoot,
  assertStartVisibilityAllowsMovement,
  installPresenceProductionE2eFetch,
  publicStartScenario,
  submitObserveTurn,
  walkRouteUntil,
} from './presence-rules-production-e2e-fixture.js';
import { TARGET_SMOKE_INPUT } from './target-http-browser-smoke.js';

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

async function loadG6AggregateAtCanonicalG5(partyPool, partyId, canonicalG5Id) {
  return (await partyPool.query(
    `SELECT a.aggregate_payload, a.state_version
       FROM party_runtime.party_ordinary_materialization_aggregates a
       JOIN party_runtime.party_g6_instances g6
         ON g6.party_id=a.party_id AND g6.id=a.scope_id AND a.scope_kind='g6'
       JOIN party_runtime.party_g5_sites g5
         ON g5.party_id=g6.party_id AND g5.id=g6.host_id
      WHERE a.party_id=$1
        AND COALESCE(g5.canonical_g5_ref->>'entity_id', g5.canonical_g5_ref->>'id')=$2
      LIMIT 1`,
    [partyId, canonicalG5Id],
  )).rows[0];
}

async function loadG6AggregateAtGeneratedSite(partyPool, partyId) {
  return (await partyPool.query(
    `SELECT a.aggregate_payload, a.state_version
       FROM party_runtime.party_ordinary_materialization_aggregates a
       JOIN party_runtime.party_g6_instances g6
         ON g6.party_id=a.party_id AND g6.id=a.scope_id AND a.scope_kind='g6'
       JOIN party_runtime.party_g5_sites g5
         ON g5.party_id=g6.party_id AND g5.id=g6.host_id
      WHERE a.party_id=$1 AND g5.origin='generated'
      LIMIT 1`,
    [partyId],
  )).rows[0];
}

async function assertRuleRefsBelongToPlaceFamily(worldPool, worldRevisionId, ruleRefs, placeFamilyId) {
  for (const ref of ruleRefs) {
    const at = ref.lastIndexOf('@');
    assert.ok(at > 0, `rule_ref must be id@version: ${ref}`);
    const ruleId = ref.slice(0, at);
    const ruleVersion = Number(ref.slice(at + 1));
    const row = (await worldPool.query(
      `SELECT scope_ref FROM world_base.presence_rules
        WHERE world_revision_id=$1 AND rule_id=$2 AND rule_version=$3`,
      [worldRevisionId, ruleId, ruleVersion],
    )).rows[0];
    assert.equal(
      row?.scope_ref,
      placeFamilyId,
      `presence rule ${ref} must belong to ${placeFamilyId}`,
    );
  }
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

test('generated G5: cross-site movement and reload', { timeout: 1_800_000 },
  async (t) => {
    const env = await bootstrapV17PresenceE2e(t);
    const restoreFetch = installPresenceProductionE2eFetch();
    t.after(() => restoreFetch());
    const { runtime } = await createPresenceProductionRoot(env);
    try {
      const partyId = await publicStartScenario(runtime, 'novgorod_riverbank_approach_v1');
      await assertStartVisibilityAllowsMovement(env.partyPool, partyId);
      await walkRouteUntil({
        runtime,
        partyPool: env.partyPool,
        partyId,
        observeText: TARGET_SMOKE_INPUT,
        maxSteps: 32,
        sitePredicate: async ({ partyPool, partyId: id }) => {
          const site = (await partyPool.query(
            `SELECT origin FROM party_runtime.party_g5_sites WHERE party_id=$1 AND origin='generated' LIMIT 1`,
            [id],
          )).rows[0];
          return site?.origin === 'generated';
        },
      });
      const generatedRow = await loadG6AggregateAtGeneratedSite(env.partyPool, partyId);
      assert.ok(generatedRow?.aggregate_payload, 'generated site must commit ordinary aggregate');
      const generatedRuleRefs = presenceRuleRows(generatedRow.aggregate_payload)
        .map((row) => row.rule_ref)
        .filter((ref) => typeof ref === 'string');
      assert.ok(
        generatedRuleRefs.length > 0,
        'generated site first entry should commit presence rule resolutions',
      );
    } finally {
      await runtime.close();
    }
  });

// Starts 6/7 have no directional exit and canonical G5 connections inside a G4 are not read by the
// runtime, so meeting_area cannot be reached on foot: task rt-walk (D49). PF logic of the meeting_area
// rules is covered by presence-rules-vikhtuy-resolver-v17-postgres.test.js.
const MEETING_AREA_SKIP_REASON = 'no directional exit at starts 6/7; transitions between canonical places inside a G4 '
  + 'are not implemented - task rt-walk (D49)';

test('canonical vikhtuy meeting_area PF binding', { skip: MEETING_AREA_SKIP_REASON, timeout: 1_800_000 },
  async (t) => {
    const env = await bootstrapV17PresenceE2e(t);
    const restoreFetch = installPresenceProductionE2eFetch();
    t.after(() => restoreFetch());
    const { runtime } = await createPresenceProductionRoot(env);
    try {
      const partyId = await publicStartScenario(runtime, 'novgorod_vikhtuy_work_storage_v1');
      await assertStartVisibilityAllowsMovement(env.partyPool, partyId);
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
      const meetingRow = await loadG6AggregateAtCanonicalG5(env.partyPool, partyId, VIKHTUY_MEETING_G5);
      assert.ok(meetingRow?.aggregate_payload, 'meeting_area G6 aggregate must exist after arrival');
      const meetingRuleRefs = presenceRuleRows(meetingRow.aggregate_payload)
        .map((row) => row.rule_ref)
        .filter((ref) => typeof ref === 'string');
      assert.ok(
        meetingRuleRefs.length > 0,
        'meeting_area arrival should commit at least one presence rule resolution',
      );
      assert.ok(
        meetingRuleRefs.every((ref) => /^pr_[^@]+@[0-9]+$/u.test(ref)),
        'presence resolutions store rule_ref, not place_family_id',
      );
      const release = SPATIAL_V3_TARGET_PRODUCTION_RELEASE;
      await assertRuleRefsBelongToPlaceFamily(
        env.worldPool,
        release.world_revision_id,
        meetingRuleRefs,
        PF_RURAL_YARD,
      );
    } finally {
      await runtime.close();
    }
  });
