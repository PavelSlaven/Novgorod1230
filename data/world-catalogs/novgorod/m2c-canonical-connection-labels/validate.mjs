import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCandidate, deriveConnectionLabels } from './derive.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../../../');
const read = (relative) => JSON.parse(readFileSync(new URL(relative, import.meta.url), 'utf8'));
const readRepo = (relative) => JSON.parse(readFileSync(path.join(repoRoot, relative), 'utf8'));
const candidate = read('./candidate.json');
const bindings = read('../spatial-v3/candidates/m2c-g4-expansion-v1/datasets/spatial_v3_canonical_g5_connection_bindings.json');
const names = read('../m2c-line-names/candidate.json');
const manifest = read('../live-world-runtime-v17/target-starts-manifest.v1.json');
const targets = new Set(manifest.starts.map((start) => readRepo(start.start.path)
  .initial_placement.canonical_g5_ref.id));
for (const suffix of ['work_storage', 'water_access', 'forest_path', 'meeting_area',
  'household_cluster', 'landing_candidate', 'river_approach']) {
  targets.add(`cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_${suffix}`);
}
const excluded = new Set(names.local_pairs.filter((row) =>
  row.source_pair_id.endsWith('vikhtuy_locality_7')
    || row.source_pair_id.endsWith('vikhtuy_locality_cross'))
  .map((row) => row.source_pair_id));
const byPair = new Map(names.local_pairs.map((row) => [row.source_pair_id, row]));
const selected = new Map();
for (const binding of bindings) {
  if (binding.status !== 'approved'
      || (!targets.has(binding.from_canonical_g5_id) && !targets.has(binding.to_canonical_g5_id))
      || excluded.has(binding.source_pair_id)) continue;
  selected.set(binding.id, { binding, pair: byPair.get(binding.source_pair_id) });
}

function audit(doc) {
  assert.equal(doc.status, 'candidate_approval_pending');
  assert.equal(doc.approved, false);
  assert.equal(doc.import_authorized, false);
  assert.equal(doc.activation_authorized, false);
  assert.equal(doc.labels.length, 454);
  assert.deepEqual(doc.labels, buildCandidate().labels, 'candidate differs from deterministic derivation');
  assert.equal(selected.size, 34);
  assert.equal(new Set([...selected.values()].map(({ binding }) => binding.source_pair_id)).size, 17);
  const ids = new Set(doc.labels.map((row) => row.binding_ref.id));
  assert.equal(ids.size, 454);
  const changed = doc.labels.filter((row) => row.display_label.startsWith('Уйти '));
  assert.equal(changed.length, 34);
  for (const [id, { binding, pair }] of selected) {
    const row = doc.labels.find((label) => label.binding_ref.id === id);
    assert.ok(row);
    assert.equal(row.display_label, `Уйти ${pair.name_ru}`);
    assert.equal(row.provenance.directness, 'approved_line_name_with_D49_action_word');
    assert.ok(row.provenance.source_refs.some((ref) => ref.includes(binding.source_pair_id)));
    assert.ok(row.provenance.source_refs.some((ref) => ref.includes('approval-attestation.json')));
    assert.doesNotMatch(row.display_label, /[0-9_]|cg5|pepv3|g4route|vikhtuy_locality/iu);
  }
  const unchanged = doc.labels.filter((row) => !row.display_label.startsWith('Уйти '));
  assert.equal(unchanged.length, 420);
  assert.ok(unchanged.every((row) => /^Проход \d+$/u.test(row.display_label)));
  return { pairs: 17, replacements: 34, unchanged: unchanged.length };
}

function selfTest() {
  const cases = [
    ['numeric label', (doc) => { doc.labels.find((x) => x.display_label.startsWith('Уйти ')).display_label += ' 7'; }],
    ['binding id leak', (doc) => { doc.labels.find((x) => x.display_label.startsWith('Уйти ')).display_label += ' cg5bindv3'; }],
    ['unapproved wording', (doc) => { doc.labels.find((x) => x.display_label.startsWith('Уйти ')).display_label = 'Уйти к селу'; }],
    ['missing provenance', (doc) => { doc.labels.find((x) => x.display_label.startsWith('Уйти ')).provenance.source_refs = []; }],
    ['changed excluded pair', (doc) => { doc.labels.find((x) => x.binding_ref.id.endsWith('vikhtuy_locality_7')).display_label = 'Уйти тропой среди кустов'; }],
    ['candidate gate', (doc) => { doc.activation_authorized = true; }]
  ];
  for (const [name, mutate] of cases) {
    const copy = structuredClone(candidate);
    mutate(copy);
    assert.throws(() => audit(copy), undefined, name);
  }
  return cases.length;
}

const result = audit(candidate);
if (process.argv.includes('--self-test')) console.log(`PASS: ${result.pairs} selected pairs/${result.replacements} replacements; ${selfTest()} negative checks rejected`);
else console.log(`PASS: ${result.pairs} selected pairs/${result.replacements} replacements/${result.unchanged} unchanged`);
