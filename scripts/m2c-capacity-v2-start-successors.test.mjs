import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import { buildCapacityV2StartSuccessors } from './generate-m2c-capacity-v2-start-successors.mjs';

const root = resolve(import.meta.dirname, '..');
const base = 'data/world-catalogs/novgorod/live-world-runtime-v17';
const read = (path) => readFile(resolve(root, path));
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

test('approved capacity successors deterministically activate all seven starts', async () => {
  const generated = await buildCapacityV2StartSuccessors();
  assert.equal(generated.size, 24);
  for (const [path, bytes] of generated) assert.deepEqual(await read(path), bytes, path);
  const manifest = JSON.parse(await read(`${base}/target-starts-manifest.v1.json`));
  const request = JSON.parse(await read(manifest.capacity_v2_repin_review.path));
  assert.equal(manifest.status, 'approved');
  assert.equal(manifest.activation_authorized, true);
  assert.equal(request.status, 'pending_independent_data_approval');
  assert.equal(request.starts.length, 7);
  const approvalBytes = await read(manifest.capacity_v2_repin_approval.path);
  const approval = JSON.parse(approvalBytes);
  assert.equal(sha256(approvalBytes), manifest.capacity_v2_repin_approval.sha256);
  assert.equal(approval.candidate_sha256, sha256(await read(manifest.capacity_v2_repin_review.path)));
  for (const entry of manifest.starts) {
    assert.deepEqual(entry.approval, manifest.capacity_v2_repin_approval);
    const approved = approval.approved_successors.find(({ scenario_id }) => scenario_id === entry.scenario_id);
    assert.ok(approved);
    for (const kind of ['start', 'transfer', 'basis']) assert.deepEqual(entry[kind], approved[kind]);
    const start = JSON.parse(await read(entry.start.path));
    const transfer = JSON.parse(await read(entry.transfer.path));
    const basis = JSON.parse(await read(entry.basis.path));
    assert.equal(start.initial_placement.scene_template_ref.version, 2);
    assert.equal(start.initial_placement.scene_materialization_profile_ref.version, 2);
    if (start.initial_perception_rule) {
      assert.equal(start.initial_perception_rule.scene_template_ref.version, 2);
      assert.match(start.initial_perception_rule.scene_template_ref.canonical_digest, /^[a-f0-9]{64}$/u);
    }
    assert.equal(sha256(await read(entry.start.path)), entry.start.sha256);
    assert.equal(transfer.target_start.sha256, entry.start.sha256);
    assert.equal(basis.target_start.sha256, entry.start.sha256);
    assert.equal(basis.target_start.player_transfer_sha256, entry.transfer.sha256);
  }
});
