import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const dir = new URL('../../../data/world-catalogs/novgorod/', import.meta.url);
const read = (path) => JSON.parse(readFileSync(new URL(path, dir), 'utf8'));
const policyPath = 'live-world-runtime-v17/movement-availability-policy.v1.json';
const policy = read(policyPath);

test('the policy lists exactly the condition sets the approved data names, no more and no fewer', () => {
  const named = new Set();
  for (const file of ['canonical_g5_connection_profiles', 'world_route_segments', 'world_routes']) {
    for (const dataset of ['spatial-v3/datasets', 'spatial-v3/candidates/m2c-g4-expansion-v1/datasets']) {
      for (const row of read(`${dataset}/spatial_v3_${file}.json`)) {
        const ref = row.availability_condition_set_ref
          ?? (row.availability_condition_set_id == null ? null
            : `${row.availability_condition_set_id}@${row.availability_condition_set_version}`);
        if (ref != null) named.add(ref);
      }
    }
  }
  assert.deepEqual(policy.condition_sets.map((row) => row.condition_set_ref).sort(), [...named].sort());
  assert.equal(policy.evaluation, 'open_without_evaluable_state');
  assert.deepEqual(policy.ignores, ['light', 'visibility']);
});

test('the reviewer attested exactly this policy file', () => {
  const approval = read('live-world-runtime-v17/movement-availability-policy.v1.approval-attestation.json');
  assert.equal(approval.decision, 'APPROVE_DATA_ONLY');
  assert.equal(approval.candidate_ref, `${policy.policy_id}@${policy.version}`);
  assert.equal(approval.candidate_sha256,
    createHash('sha256').update(readFileSync(new URL(policyPath, dir))).digest('hex'));
});
