import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const base = 'data/world-catalogs/novgorod/m2c-natural/';
const natural = JSON.parse(readFileSync(resolve(root, base, 'candidate.json'), 'utf8'));
const richness = JSON.parse(readFileSync(resolve(root, base, 'nature-richness-candidate-v1.json'), 'utf8'));
const source = new Map(natural.natural_profiles.map((p) => [p.g4_ref.id, p]));
const mapped = new Map();
const errors = [];
const sources = Object.fromEntries(Object.entries(richness.source_register).map(([key, ref]) => [key, ref.split('#')[0]]));

for (const [key, path] of Object.entries(sources)) {
  if (!existsSync(resolve(root, path))) errors.push(`missing source: ${key}`);
}
if (richness.g4_version !== 1 || richness.weight_policy.version !== 1) errors.push('unexpected version');
if (JSON.stringify(richness.weight_policy.weights) !== JSON.stringify({ dominant: 8, common: 4, occasional: 2, rare: 1 })) errors.push('weight policy changed');

for (const profile of richness.profiles) {
  for (const id of profile.g4_ids) {
    if (mapped.has(id)) errors.push(`duplicate G4: ${id}`);
    mapped.set(id, profile);
    const baseline = source.get(id);
    if (!baseline) errors.push(`unknown G4: ${id}`);
    else if (baseline.template_refs.landscape_template_id !== profile.landscape_template_id) errors.push(`landscape mismatch: ${id}`);
  }
  for (const row of profile.selection_candidates) {
    if (!['flora', 'fauna', 'fungi', 'material'].includes(row.kind)) errors.push(`invalid kind: ${row.kind}`);
    if (!['inferred', 'analogical'].includes(row.directness) || row.confidence !== 'low') errors.push(`unsupported evidence grade: ${row.taxon}`);
    if (!richness.weight_policy.weights[row.category]) errors.push(`unknown frequency category: ${row.taxon}`);
    if (!row.season || !row.limit || !row.source_keys?.length) errors.push(`missing qualification: ${row.taxon}`);
    for (const key of row.source_keys || []) if (!sources[key]) errors.push(`unregistered source: ${key}`);
    if (row.kind === 'fungi' && row.candidate_use !== 'substrate_process_only') errors.push(`fungi use not bounded: ${row.taxon}`);
  }
}

const report = {
  schema: 'm2c_nature_richness_coverage_report_v1',
  candidate_status: richness.status,
  weight_policy_version: richness.weight_policy.version,
  exact_g4_total: source.size,
  exact_g4_mapped: [...mapped.keys()].filter((id) => source.has(id)).length,
  missing_g4_ids: [...source.keys()].filter((id) => !mapped.has(id)),
  extra_g4_ids: [...mapped.keys()].filter((id) => !source.has(id)),
  variants: richness.profiles.map((p) => ({ landscape_template_id: p.landscape_template_id, g4_count: p.g4_ids.length, candidate_count: p.selection_candidates.length })),
  exact_profiles: [],
  layer_gaps: [],
  substrate_gaps: [],
  errors
};
for (const [id, profile] of mapped) {
  const baseline = source.get(id);
  if (!baseline) continue;
  const alternatives = [];
  for (const row of profile.selection_candidates) {
    const layer = baseline.natural_profile.layer_applicability[row.layer];
    if (row.kind === 'fungi' && !layer?.value?.ambient_materials?.some((material) => richness.fungal_organic_substrates.includes(material))) {
      report.substrate_gaps.push({ g4_id: id, kind: row.kind, taxon: row.taxon, reason: 'organic substrate absent from exact G4 ambient materials' });
      continue;
    }
    alternatives.push({
      kind: row.kind,
      taxon: row.taxon,
      layer: row.layer,
      baseline_layer: layer?.value?.class ?? layer?.value?.substrate ?? null,
      applicability: layer?.applicability ?? 'missing',
      category: row.category,
      editorial_weight: richness.weight_policy.weights[row.category],
      candidate_use: row.candidate_use ?? 'conditional_selection'
    });
    if (layer?.applicability !== 'present') report.layer_gaps.push({ g4_id: id, kind: row.kind, taxon: row.taxon, layer: row.layer, applicability: layer?.applicability ?? 'missing' });
  }
  report.exact_profiles.push({ g4_id: id, landscape_template_id: profile.landscape_template_id, alternatives });
}
report.exact_profiles.sort((a, b) => a.g4_id.localeCompare(b.g4_id));
report.layer_gaps.sort((a, b) => a.g4_id.localeCompare(b.g4_id) || a.kind.localeCompare(b.kind));
report.substrate_gaps.sort((a, b) => a.g4_id.localeCompare(b.g4_id));
if (report.missing_g4_ids.length || report.extra_g4_ids.length) errors.push('exact G4 coverage incomplete');
if (errors.length) {
  console.error(JSON.stringify(report, null, 2));
  process.exitCode = 1;
} else {
  const output = JSON.stringify(report, null, 2) + '\n';
  const target = resolve(root, base, 'nature-richness-coverage-report-v1.json');
  if (process.argv.includes('--check')) {
    if (!existsSync(target) || readFileSync(target, 'utf8') !== output) {
      console.error('nature richness coverage report out of date');
      process.exitCode = 1;
    }
  } else writeFileSync(target, output);
  console.log(`Nature richness: ${report.exact_g4_mapped}/${report.exact_g4_total} exact G4; ${report.layer_gaps.length} layer gaps`);
}
