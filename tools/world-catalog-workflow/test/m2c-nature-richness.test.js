import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../../..');
const data = 'data/world-catalogs/novgorod/m2c-natural/';

test('nature richness covers every exact G4 without promoting candidate presence', () => {
  execFileSync(process.execPath, [resolve(root, 'scripts/generate-m2c-nature-richness-coverage.mjs'), '--check'], { cwd: root });
  const candidate = JSON.parse(readFileSync(resolve(root, data, 'nature-richness-candidate-v1.json'), 'utf8'));
  const report = JSON.parse(readFileSync(resolve(root, data, 'nature-richness-coverage-report-v1.json'), 'utf8'));
  assert.equal(report.exact_g4_total, 32);
  assert.equal(report.exact_g4_mapped, 32);
  assert.deepEqual(report.missing_g4_ids, []);
  assert.deepEqual(report.extra_g4_ids, []);
  assert.deepEqual(report.errors, []);
  assert.equal(report.exact_profiles.length, 32);
  assert.equal(report.layer_gaps.filter((gap) => gap.kind === 'fauna').length, 32);
  const shoal = 'g4v3__gn_nov_g3_xp017_yp026_r2_shifting_shoal_field';
  assert.deepEqual(report.substrate_gaps, [{
    g4_id: shoal,
    kind: 'fungi',
    taxon: 'decomposer fungal guild (unidentified)',
    reason: 'organic substrate absent from exact G4 ambient materials'
  }]);
  assert.equal(report.exact_profiles.flatMap((profile) => profile.alternatives.filter((row) => row.kind === 'fungi')).length, 31);
  assert.ok(!report.exact_profiles.find((profile) => profile.g4_id === shoal).alternatives.some((row) => row.kind === 'fungi'));
  assert.ok(report.exact_profiles.find((profile) => profile.g4_id.endsWith('_driftwood_bar')).alternatives.some((row) => row.kind === 'fungi'));
  assert.equal(candidate.approved, false);
  assert.equal(candidate.import_authorized, false);
  assert.equal(candidate.activation_authorized, false);
  assert.ok(candidate.profiles.every((profile) => profile.selection_candidates.some((row) => row.kind === 'fungi' && row.candidate_use === 'substrate_process_only')));
});
