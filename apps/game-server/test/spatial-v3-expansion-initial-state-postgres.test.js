import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import {
  bootstrapV17PresenceE2e, createPresenceProductionRoot,
  installPresenceProductionE2eFetch, publicStartScenario,
} from '../../../test/spatial-v3/presence-rules-production-e2e-fixture.js';

// D102 per A-04: schema acceptance on a real committed initial party. These
// direct INSERT probes check DDL only; they are not topology/turn commits and
// do not claim snapshot semantics for the positive-version fixture.
const INSERT_PACKAGE = `INSERT INTO party_runtime.party_visible_packages
  (package_id,party_id,turn_id,committed_state_version,change_set_id,
   package_digest,visible_payload,presentation_status,projection_policy_ref,
   dependency_pins,idempotency_record_id)
  VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,'pending',$8::jsonb,$9::jsonb,$10)`;

async function insertPackage(pool, partyId, label, version) {
  try {
    await pool.query(INSERT_PACKAGE, [label, partyId, `turn-${label}`, version,
      `change-${label}`, 'a'.repeat(64), '{}', '{}', '{}', `idem-${label}`]);
  } catch (cause) {
    // PostgreSQL DETAIL prints failing-row IDs; retain only safe constraint tags.
    throw Object.assign(new Error(`visible-package INSERT: ${cause.code ?? 'unknown'} ${cause.constraint ?? 'unknown'}`),
      { code: cause.code, constraint: cause.constraint });
  }
}

async function baseline(pool, partyId) {
  const { rows } = await pool.query(`SELECT p.state_version::text AS state_version,
    md5(to_jsonb(p)::text) AS party_digest, md5(to_jsonb(s)::text) AS session_digest,
    s.turn_number,
    EXISTS (SELECT 1 FROM party_runtime.party_state_snapshots snap
      WHERE snap.party_id=p.party_id AND snap.state_version=p.state_version) AS matching_snapshot,
    (SELECT count(*)::int FROM party_runtime.party_state_snapshots snap
      WHERE snap.party_id=p.party_id AND snap.state_version=0) AS initial_snapshots,
    (SELECT md5(jsonb_agg(to_jsonb(loc) ORDER BY loc.owner_id)::text)
      FROM party_runtime.party_journey_locations loc WHERE loc.party_id=p.party_id) AS location_digest
    FROM party_runtime.parties p JOIN party_runtime.party_server_sessions s USING(party_id)
    WHERE p.party_id=$1`, [partyId]);
  assert.equal(rows.length, 1);
  return rows[0];
}

async function positiveDigest(pool, partyId) {
  const { rows } = await pool.query(`SELECT committed_state_version::text AS version,
    md5(to_jsonb(vp)::text) AS digest FROM party_runtime.party_visible_packages vp
    WHERE party_id=$1 AND package_id='initial-state-positive'`, [partyId]);
  assert.equal(rows.length, 1, 'existing positive package is retained');
  assert.equal(rows[0].version, '1');
  return rows[0].digest;
}

const isVersionCheck = (error) => error.code === '23514'
  && error.constraint === 'party_visible_packages_committed_state_version_check';

test('P22 initial-state DDL accepts zero, rejects negative, and preserves positive packages',
  { timeout: 1_800_000 }, async (t) => {
    const restoreFetch = installPresenceProductionE2eFetch();
    t.after(restoreFetch);
    const env = await bootstrapV17PresenceE2e(t);
    const { runtime } = await createPresenceProductionRoot(env);
    t.after(() => runtime.close());
    const partyId = await publicStartScenario(runtime, 'novgorod_vikhtuy_work_storage_v1');
    const before = await baseline(env.partyPool, partyId);
    assert.equal(before.state_version, '0');
    assert.equal(before.matching_snapshot, true);
    assert.equal(before.initial_snapshots, 1);

    await insertPackage(env.partyPool, partyId, 'initial-state-positive', '1');
    const positiveBefore = await positiveDigest(env.partyPool, partyId);
    await assert.rejects(insertPackage(env.partyPool, partyId, 'initial-state-negative', '-1'),
      isVersionCheck, 'negative baseline must fail the version CHECK');

    // RED on f3b431a5 must be SQLSTATE 23514 for this exact version CHECK.
    await insertPackage(env.partyPool, partyId, 'initial-state-zero', '0');
    const { rows } = await env.partyPool.query(`SELECT vp.committed_state_version::text AS version,
      EXISTS (SELECT 1 FROM party_runtime.party_state_snapshots snap
        WHERE snap.party_id=vp.party_id AND snap.state_version=vp.committed_state_version) AS matching_snapshot
      FROM party_runtime.party_visible_packages vp
      WHERE vp.party_id=$1 AND vp.package_id='initial-state-zero'`, [partyId]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].version, '0');
    assert.equal(rows[0].matching_snapshot, true);

    // The fresh production chain must already admit zero. Reapplying the new
    // migration also verifies that existing positive package bytes survive.
    const migration = await readFile(new URL(
      '../../../schemas/party-db/040_party_runtime_visible_package_initial_state.sql', import.meta.url), 'utf8');
    await env.partyPool.query(migration);
    await env.partyPool.query(migration);
    assert.ok(await positiveDigest(env.partyPool, partyId) === positiveBefore,
      'migration reapplication preserves the existing positive package');
    await assert.rejects(insertPackage(env.partyPool, partyId, 'initial-state-negative-after', '-1'),
      isVersionCheck, 'negative baseline remains rejected after migration reapplication');
    const after = await baseline(env.partyPool, partyId);
    for (const key of Object.keys(before)) {
      assert.ok(before[key] === after[key], `DDL probes preserve ${key}`);
    }
  });
