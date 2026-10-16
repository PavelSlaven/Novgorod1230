import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { approvedExitLineLabelsFromAttestation, loadApprovedExitLineLabels } from './approved-labels.mjs';

const candidateBytes = readFileSync(new URL('./candidate.json', import.meta.url));
const candidate = JSON.parse(candidateBytes);
const attestation = JSON.parse(readFileSync(new URL('./approval-attestation.json', import.meta.url)));
const digest = createHash('sha256').update(candidateBytes).digest('hex');

test('reader exposes only exact rows approved by the limited Opus attestation', () => {
  const labels = approvedExitLineLabelsFromAttestation(candidateBytes, attestation);
  assert.equal(attestation.decision, 'APPROVE_WITH_LIMITS');
  assert.equal(attestation.candidate_sha256, digest);
  assert.equal(labels.size, 70);
  for (const row of attestation.approved_rows) {
    const candidateRow = candidate.labels.find((item) =>
      item.directional_exit_ref.id === row.directional_exit_id
      && item.route_pair_id === row.route_pair_id
      && item.display_label === row.display_label);
    assert.ok(candidateRow);
    assert.deepEqual(labels.get(`${row.directional_exit_id}@${candidateRow.directional_exit_ref.version}`), candidateRow);
  }
  for (const row of attestation.withheld_rows.rows) {
    assert.equal(labels.has(`${row.directional_exit_id}@${candidate.labels.find((item) =>
      item.directional_exit_ref.id === row.directional_exit_id).directional_exit_ref.version}`), false);
  }
  assert.equal(loadApprovedExitLineLabels()?.size, 70);
});

test('reader fails closed on changed candidate, rejection, or broken row partition', () => {
  assert.equal(approvedExitLineLabelsFromAttestation(candidateBytes,
    { ...attestation, candidate_sha256: '0'.repeat(64) }), null);
  assert.equal(approvedExitLineLabelsFromAttestation(candidateBytes,
    { ...attestation, decision: 'REJECT' }), null);
  assert.equal(approvedExitLineLabelsFromAttestation(candidateBytes,
    { ...attestation, approved_rows: [...attestation.approved_rows,
      attestation.approved_rows[0]] }), null);
});
