import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { loadApprovedConnectionLabels } from './approved-labels.mjs';

const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url)));
const candidate = read('./candidate.json');
const bindings = read('../spatial-v3/candidates/m2c-g4-expansion-v1/datasets/spatial_v3_canonical_g5_connection_bindings.json');
const localOrdinals = read('../m2c-local-edge-labels/candidate.json').labels
  .map((row) => row.editorial_choice_ordinal);

test('one neutral label per binding id, numbered after the local edge ordinals of its source place', () => {
  const ids = new Set(bindings.map((row) => row.id));
  assert.equal(ids.size, 454);
  assert.equal(candidate.status, 'candidate_approval_pending');
  assert.equal(candidate.approved, false);
  assert.equal(candidate.labels.length, ids.size);
  assert.deepEqual(new Set(candidate.labels.map((row) => row.binding_ref.id)), ids);
  const firstOrdinal = Math.max(...localOrdinals) + 1;
  const bySource = new Map();
  for (const label of candidate.labels) {
    const binding = bindings.find((row) => row.id === label.binding_ref.id);
    assert.equal(label.display_label, `Проход ${label.editorial_choice_ordinal}`);
    assert.equal(label.source_canonical_g5_ref.id, binding.from_canonical_g5_id);
    assert.equal(label.provenance.directness, 'editorial');
    const key = `${binding.from_canonical_g5_id}|${binding.from_scene_endpoint_slot_key}`;
    bySource.set(key, [...(bySource.get(key) ?? []), label.editorial_choice_ordinal].sort());
  }
  for (const ordinals of bySource.values()) {
    assert.deepEqual(ordinals, ordinals.map((_, index) => firstOrdinal + index),
      'ordinals at one source position are consecutive from the first free number');
  }
});

test('versions of one binding share source, target and departure slot', () => {
  const seen = new Map();
  for (const row of bindings) {
    const shape = [row.from_canonical_g5_id, row.to_canonical_g5_id, row.from_scene_endpoint_slot_key,
      row.to_scene_endpoint_slot_key].join('|');
    assert.equal(seen.get(row.id) ?? shape, shape, row.id);
    seen.set(row.id, shape);
  }
});

test('the loader refuses a candidate without its attestation', () => {
  assert.throws(() => loadApprovedConnectionLabels({
    approvalPath: './does-not-exist.json' }), /ENOENT/u);
  assert.throws(() => loadApprovedConnectionLabels({
    approvalPath: '../m2c-local-edge-labels/approval-attestation.json' }),
  /CANONICAL_CONNECTION_LABEL_APPROVAL_REQUIRED/u);
});

test('the loader returns every label of the attested candidate, keyed by binding id', () => {
  const labels = loadApprovedConnectionLabels();
  assert.equal(labels.size, 454);
  assert.equal(labels.get(candidate.labels[0].binding_ref.id).display_label, candidate.labels[0].display_label);
});
