import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { derivePlaceLabels } from './derive.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (file) => JSON.parse(readFileSync(path.join(here, file), 'utf8'));
const candidate = read('candidate.json');

test('candidate exactly matches deterministic derivation from seven current starts', () => {
  assert.deepEqual(candidate, derivePlaceLabels());
  assert.equal(candidate.status, 'candidate_approval_pending');
  assert.equal(candidate.approved, false);
  assert.equal(candidate.import_authorized, false);
  assert.equal(candidate.activation_authorized, false);
  assert.equal(candidate.labels.length, 327);
  assert.equal(candidate.coverage.start_count, 7);
  assert.equal(candidate.coverage.label_count, 327);
  assert.equal(candidate.coverage.g5_count, 7);
  assert.equal(candidate.coverage.natural_label_count, 320);
  assert.equal(candidate.coverage.natural_scene_template_v1_count, 160);
  assert.equal(candidate.coverage.natural_scene_template_v2_count, 160);
  assert.equal(Object.keys(candidate.source_pins).length, 9);
  for (const digest of Object.values(candidate.source_pins)) assert.match(digest, /^[a-f0-9]{64}$/u);
});

test('candidate carries exact D107 labels on versioned current G5 references', () => {
  const approval = read('approval-attestation.json');
  const candidateBytes = readFileSync(path.join(here, 'candidate.json'));
  assert.equal(approval.candidate_sha256,
    createHash('sha256').update(candidateBytes).digest('hex'));
  assert.equal(approval.decision_ref, 'D107');
  const approvedG5Rows = approval.approved_rows.filter((row) => row.canonical_g5_id);
  assert.equal(approvedG5Rows.length, 7);
  const g5Rows = candidate.labels.filter((row) => row.scenario_id);
  assert.equal(g5Rows.length, 7);
  assert.deepEqual(g5Rows.map(({ canonical_g5_ref, display_label }) =>
    [canonical_g5_ref.id, canonical_g5_ref.version, display_label]),
  approvedG5Rows.map(({ canonical_g5_id, canonical_g5_version, display_label }) =>
    [canonical_g5_id, canonical_g5_version, display_label]));
  assert.deepEqual(g5Rows.map((row) => row.scenario_id), [
    'novgorod_pine_ridge_approach_v1', 'novgorod_riverbank_approach_v1',
    'novgorod_reed_backwater_entrance_v1', 'novgorod_vikhtuy_resource_edge_approach_v1',
    'novgorod_zaostrovye_settlement_approach_v1', 'novgorod_vikhtuy_work_storage_v1',
    'novgorod_vikhtuy_household_cluster_v1'
  ]);
  const natural = candidate.labels.filter((row) => row.natural_place_ref);
  assert.equal(natural.length, 320);
  assert.deepEqual(candidate.natural_label_decision_references, ['D112', 'D118', 'A03']);
  assert.deepEqual(candidate.decision_references, ['D107', 'D112', 'D118', 'A03']);
  const naturalKeys = natural.map((row) => {
    const { natural_profile_ref: profile, scene_template_ref: template } = row.natural_place_ref;
    assert.equal(typeof profile.id, 'string');
    assert.ok(Number.isSafeInteger(profile.version));
    assert.equal(typeof template.id, 'string');
    assert.ok(Number.isSafeInteger(template.version));
    return `${profile.id}@${profile.version}|${template.id}@${template.version}`;
  });
  assert.equal(new Set(naturalKeys).size, 320);
  assert.deepEqual(natural.map((row) => row.approval_basis),
    Array(320).fill('approved_natural_label_source'));
});
