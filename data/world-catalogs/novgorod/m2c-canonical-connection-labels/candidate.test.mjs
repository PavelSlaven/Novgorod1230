import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { deriveConnectionLabels } from './derive.mjs';
import { loadApprovedConnectionLabels } from './approved-labels.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../../../');
const read = (relative) => JSON.parse(readFileSync(new URL(relative, import.meta.url), 'utf8'));
const readRepo = (relative) => JSON.parse(readFileSync(path.join(repoRoot, relative), 'utf8'));
const candidate = read('./candidate.json');
const bindings = read('../spatial-v3/candidates/m2c-g4-expansion-v1/datasets/spatial_v3_canonical_g5_connection_bindings.json');
const lineNames = read('../m2c-line-names/candidate.json');
const localOrdinals = read('../m2c-local-edge-labels/candidate.json').labels
  .map((row) => row.editorial_choice_ordinal);
const targetSuffixes = ['work_storage', 'water_access', 'forest_path', 'meeting_area',
  'household_cluster', 'landing_candidate', 'river_approach'];
const targetPrefix = 'cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_';
const excludedSuffixes = ['vikhtuy_locality_7', 'vikhtuy_locality_cross'];
const targets = new Set();
for (const start of read('../live-world-runtime-v17/target-starts-manifest.v1.json').starts) {
  const startData = readRepo(start.start.path);
  targets.add(startData.initial_placement.canonical_g5_ref.id);
}
for (const suffix of targetSuffixes) targets.add(`${targetPrefix}${suffix}`);
const excludedPairs = new Set(lineNames.local_pairs.filter((row) => excludedSuffixes
  .some((suffix) => row.source_pair_id.endsWith(suffix))).map((row) => row.source_pair_id));
const pairById = new Map(lineNames.local_pairs.map((row) => [row.source_pair_id, row]));
const selected = new Map();
for (const binding of bindings) {
  if (binding.status !== 'approved'
      || (!targets.has(binding.from_canonical_g5_id) && !targets.has(binding.to_canonical_g5_id))
      || excludedPairs.has(binding.source_pair_id)) continue;
  selected.set(binding.id, { binding, pair: pairById.get(binding.source_pair_id) });
}
const labelsByBinding = new Map(candidate.labels.map((row) => [row.binding_ref.id, row]));

test('all approved binding ids remain present with the same catalog identity', () => {
  const ids = new Set(bindings.map((row) => row.id));
  assert.equal(ids.size, 454);
  assert.equal(candidate.status, 'candidate_approval_pending');
  assert.equal(candidate.approved, false);
  assert.equal(candidate.import_authorized, false);
  assert.equal(candidate.activation_authorized, false);
  assert.equal(candidate.labels.length, ids.size);
  assert.deepEqual(new Set(candidate.labels.map((row) => row.binding_ref.id)), ids);
});

test('covered G5 pairs use approved line names; unselected rows keep ordinal wording', () => {
  assert.equal(targets.size, 12);
  assert.equal(selected.size, 34);
  assert.equal(new Set([...selected.values()].map(({ binding }) => binding.source_pair_id)).size, 17);
  const firstOrdinal = Math.max(...localOrdinals) + 1;
  const bySource = new Map();
  for (const label of candidate.labels) {
    const binding = bindings.find((row) => row.id === label.binding_ref.id);
    assert.equal(label.source_canonical_g5_ref.id, binding.from_canonical_g5_id);
    const chosen = selected.get(binding.id);
    if (chosen) {
      const { pair } = chosen;
      assert.equal(label.display_label, `Уйти ${pair.name_ru}`);
      assert.equal(label.provenance.directness, 'approved_line_name_with_D49_action_word');
      assert.ok(label.provenance.source_refs.some((ref) => ref.includes(pair.source_pair_id)));
      assert.ok(label.provenance.source_refs.some((ref) => ref.includes('m2c-line-names/approval-attestation.json')));
      assert.doesNotMatch(label.display_label, /[0-9_]|cg5|pepv3|g4route|vikhtuy_locality/iu);
    } else {
      assert.equal(label.display_label, `Проход ${label.editorial_choice_ordinal}`);
      assert.equal(label.provenance.directness, 'editorial');
    }
    const key = `${binding.from_canonical_g5_id}|${binding.from_scene_endpoint_slot_key}`;
    bySource.set(key, [...(bySource.get(key) ?? []), label.editorial_choice_ordinal].sort((a, b) => a - b));
  }
  for (const ordinals of bySource.values()) {
    assert.deepEqual(ordinals, ordinals.map((_, index) => firstOrdinal + index),
      'all hidden editorial ordinals remain consecutive, including rows with class wording');
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

test('the candidate is the attested content and equals its deterministic derivation', () => {
  const bytes = readFileSync(new URL('./candidate.json', import.meta.url));
  const approval = read('./approval-attestation.json');
  assert.equal(approval.decision, 'APPROVE_WITH_LIMITS');
  assert.equal(approval.candidate_ref, `${candidate.candidate_id}@${candidate.version}`);
  assert.equal(approval.candidate_sha256, createHash('sha256').update(bytes).digest('hex'));
  assert.deepEqual(candidate.labels, deriveConnectionLabels());
});

test('the loader returns every label of the candidate, keyed by binding id', () => {
  const labels = loadApprovedConnectionLabels();
  assert.equal(labels.size, 454);
  assert.equal(labels.get(candidate.labels[0].binding_ref.id).display_label, candidate.labels[0].display_label);
});
