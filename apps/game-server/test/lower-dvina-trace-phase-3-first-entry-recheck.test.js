import assert from 'node:assert/strict';
import test from 'node:test';

import { firstPlayableCommitRecheck } from
  '../src/infrastructure/postgres/first-playable/recheck.js';

const digest = 'a'.repeat(64);
const check = {
  kind: 'physical',
  materialization_scope_key: 'party_runtime.party_scene_baselines:baseline',
  baseline_disposition: 'create', g4_id: 'g4',
  preparation_snapshot_id: 'snapshot', preparation_member_ordinal: 0,
  preparation_snapshot_digest: digest, preparation_member_digest: digest,
  route_plan_id: 'route', route_plan_digest: digest,
  route_plan_execution_id: 'execution', preparation_claim_id: 'claim',
  scene_baseline_id: 'baseline', g5_site_id: 'g5',
  g6_instance_id: 'g6', position_id: 'position'
};

test('first-entry recheck accepts its sealed member through both route owners', async () => {
  for (const operationKind of ['first_entry', 'trace_phase_4_turn']) {
  let calls = 0;
  const result = await firstPlayableCommitRecheck({
    party_id: 'party', check, plan: { operation_kind: operationKind },
    transaction: { async query(sql) {
      calls += 1;
      if (sql.includes('preparation_snapshots')) return { rows: [{
        preparation_snapshot_digest: digest, preparation_member_digest: digest,
        route_plan_digest: digest,
        prepared_scene_materialization: {
          g4_id: 'g4', g5_site_id: 'g5', scene_baseline_id: 'baseline',
          g6_instance_id: 'g6', position_id: 'position'
        }
      }] };
      return { rows: [{ g5_exists: false, baseline_exists: false,
        g6_exists: false, position_exists: false }] };
    } }
  });

  assert.equal(calls, 2);
  assert.deepEqual(result, { ok: true, first_entry_binding: {
    baseline_disposition: 'create', g4_id: 'g4',
    preparation_snapshot_id: 'snapshot', preparation_member_ordinal: 0,
    preparation_snapshot_digest: digest, preparation_member_digest: digest,
    route_plan_id: 'route', route_plan_digest: digest,
    route_plan_execution_id: 'execution', preparation_claim_id: 'claim',
    scene_baseline_id: 'baseline', g5_site_id: 'g5',
    g6_instance_id: 'g6', position_id: 'position'
  } });
  }
});
