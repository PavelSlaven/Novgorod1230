import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPlayerSafeVisiblePackageEnvelope } from '@rus/visibility-knowledge-memory';
import { computeSpatialV3CanonicalDigest, validateSpatialV3Contract } from '@rus/contracts/spatial-v3/registry';
import { readCurrentParty, buildVisiblePackageEnvelopeInput } from '../src/infrastructure/postgres/spatial-v3-generated-expansion-adapter.js';
import { SPATIAL_V3_CURRENT_VISIBLE_PROJECTION_POLICY_REF as projectionPolicyRef } from '../src/runtime/spatial-v3-current-visible-context.js';
import {
  bootstrapV17PresenceE2e, createPresenceProductionRoot,
  installPresenceProductionE2eFetch, publicStartScenario,
} from '../../../test/spatial-v3/presence-rules-production-e2e-fixture.js';

async function baseline(client, partyId) {
  const { rows } = await client.query(`SELECT p.state_version::text AS state_version,
    s.last_turn_id, s.turn_number,
    md5(to_jsonb(p)::text) AS party_digest, md5(to_jsonb(s)::text) AS session_digest,
    EXISTS (SELECT 1 FROM party_runtime.party_state_snapshots snap
      WHERE snap.party_id=p.party_id AND snap.state_version=p.state_version) AS matching_snapshot,
    (SELECT count(*)::int FROM party_runtime.party_state_snapshots snap
      WHERE snap.party_id=p.party_id AND snap.state_version=0) AS initial_snapshots,
    (SELECT md5(jsonb_agg(to_jsonb(snap) ORDER BY snap.state_version)::text)
      FROM party_runtime.party_state_snapshots snap WHERE snap.party_id=p.party_id) AS snapshot_digest
    FROM party_runtime.parties p JOIN party_runtime.party_server_sessions s USING(party_id)
    WHERE p.party_id=$1`, [partyId]);
  assert.equal(rows.length, 1);
  return rows[0];
}

// A-04: this exercises shared adapter helpers on a genuine committed v0.
// Corrupt snapshot fixtures exist only inside a rolled-back test transaction.
// No menu, pending-position staging, or full expansion is modelled here.
test('P16 adapter helpers accept the committed initial snapshot and build valid P22',
  { timeout: 1_800_000 }, async (t) => {
    const restoreFetch = installPresenceProductionE2eFetch();
    t.after(restoreFetch);
    const env = await bootstrapV17PresenceE2e(t);
    const { runtime } = await createPresenceProductionRoot(env);
    t.after(() => runtime.close());
    const partyId = await publicStartScenario(runtime, 'novgorod_vikhtuy_work_storage_v1');
    const client = await env.partyPool.connect();
    try {
      const before = await baseline(client, partyId);
      assert.equal(before.state_version, '0');
      assert.equal(before.matching_snapshot, true);
      assert.equal(before.initial_snapshots, 1);

      await t.test('missing snapshot remains rejected', async () => {
        await client.query('BEGIN');
        try {
          const removed = await client.query(`DELETE FROM party_runtime.party_state_snapshots
            WHERE party_id=$1 AND state_version=0`, [partyId]);
          assert.equal(removed.rowCount, 1);
          assert.equal((await baseline(client, partyId)).matching_snapshot, false);
          assert.equal(await readCurrentParty(client, partyId), null);
        } finally {
          await client.query('ROLLBACK');
        }
      });

      await t.test('snapshot at another version remains rejected', async () => {
        await client.query('BEGIN');
        try {
          const moved = await client.query(`WITH initial AS (
            DELETE FROM party_runtime.party_state_snapshots
            WHERE party_id=$1 AND state_version=0 RETURNING state_payload,state_digest
          ) INSERT INTO party_runtime.party_state_snapshots
            (party_id,state_version,state_payload,state_digest)
            SELECT $1,1,state_payload,state_digest FROM initial`, [partyId]);
          assert.equal(moved.rowCount, 1);
          const altered = await baseline(client, partyId);
          assert.equal(altered.state_version, '0');
          assert.equal(altered.initial_snapshots, 0);
          assert.equal(altered.matching_snapshot, false);
          assert.equal(await readCurrentParty(client, partyId), null);
        } finally {
          await client.query('ROLLBACK');
        }
      });

      await t.test('matching initial snapshot is accepted by readCurrentParty', async () => {
        const current = await readCurrentParty(client, partyId);
        assert.ok(current, 'committed_party_state_required: matching snapshot 0 must be accepted');
        assert.equal(String(current.state_version), '0');
        assert.ok(current.last_turn_id === before.last_turn_id, 'baseline turn identity is preserved');
      });

      await t.test('shared envelope input retains v0 and passes the real P22 builder', () => {
        // This independent seam uses the actual matching DB baseline, so its
        // RED can be observed even while the numeric reader still rejects v0.
        const dependency_pins = { pins: [], canonical_digest: computeSpatialV3CanonicalDigest([]).slice(7) };
        const input = buildVisiblePackageEnvelopeInput({ party_id: partyId,
          change_set_id: 'initial-state-adapter-change', current: before,
          dependency_pins, projection_policy_ref: projectionPolicyRef });
        assert.equal(input.committed_state_version, '0');
        assert.ok(input.party_id === partyId, 'envelope refers to the real party');
        assert.equal(input.turn_id, 'initial-state-adapter-change');
        assert.equal(input.change_set_id, input.turn_id);
        assert.equal(input.package_id, 'visible:initial-state-adapter-change');
        assert.equal(input.idempotency_record_id, 'idem:initial-state-adapter-change');
        assert.deepEqual(input.dependency_pins, dependency_pins);
        assert.deepEqual(input.projection_policy_ref, projectionPolicyRef);
        const visible_payload = {
          schema: 'temporal_visible_package.v1', perceived_scene: 'Телега стоит у ворот.',
          perceived_changes: [], sensory_details: [], visible_npcs: [], visible_objects: [],
          known_context: [], uncertainties: [], hypotheses: [],
          player_safe_interruption: null, allowed_action_affordances: [],
        };
        const built = buildPlayerSafeVisiblePackageEnvelope({ ...input, visible_payload });
        assert.equal(built.ok, true, `P22 builder: ${built.error_code}`);
        assert.equal(built.envelope.committed_state_version, '0');
        assert.equal(built.envelope.presentation_status, 'pending');
        assert.equal(built.envelope.package_digest, computeSpatialV3CanonicalDigest(visible_payload));
        for (const key of Object.keys(input)) {
          assert.ok(JSON.stringify(built.envelope[key]) === JSON.stringify(input[key]),
            `P22 preserves ${key}`);
        }
        assert.equal(validateSpatialV3Contract('visible_package_persistence_envelope', built.envelope).length, 0);
      });

      const after = await baseline(client, partyId);
      for (const key of Object.keys(before)) {
        assert.ok(before[key] === after[key], `preparation and rolled-back fixtures preserve ${key}`);
      }
    } finally {
      client.release();
    }
  });
