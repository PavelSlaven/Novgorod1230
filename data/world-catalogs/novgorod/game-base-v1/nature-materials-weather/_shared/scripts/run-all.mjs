// Rebuilds and checks the whole group, then writes reports/counts.json with row counts by script.
// node _shared/scripts/run-all.mjs   (set PR98_ROOT / MAIN_ROOT if checkouts live elsewhere)
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { GROUP_DIR, readCsv, writeJson } from './lib.mjs';

const steps = [
  '_shared/scripts/extract-g4-index.mjs',
  'natural_materials_soils/scripts/build.mjs', 'natural_materials_soils/scripts/check.mjs',
  'weather_climate/scripts/build.mjs', 'weather_climate/scripts/check.mjs',
  'natural_presentation_texts/scripts/build.mjs', 'natural_presentation_texts/scripts/check.mjs',
];
let failed = false;
for (const s of steps) {
  try { process.stdout.write(execFileSync(process.execPath, [path.join(GROUP_DIR, s)], { encoding: 'utf8' })); }
  catch (e) { failed = true; process.stdout.write(e.stdout || ''); process.stderr.write(e.stderr || String(e)); }
}
const counts = {};
for (const d of ['natural_materials_soils', 'weather_climate', 'natural_presentation_texts']) {
  counts[d] = {};
  for (const f of fs.readdirSync(path.join(GROUP_DIR, d)).filter((f) => f.endsWith('.csv'))) counts[d][f] = readCsv(path.join(GROUP_DIR, d, f)).length;
  for (const f of fs.readdirSync(path.join(GROUP_DIR, d)).filter((f) => f.endsWith('.json'))) {
    const j = JSON.parse(fs.readFileSync(path.join(GROUP_DIR, d, f), 'utf8'));
    counts[d][f] = j.profiles ? `${j.profiles.length} profiles` : j.payload ? `${Object.keys(j.payload.weather_states || {}).length} states` : 'json';
  }
}
writeJson(path.join(GROUP_DIR, 'reports', 'counts.json'), { generated_by: '_shared/scripts/run-all.mjs', checks_passed: !failed, counts });
console.log(JSON.stringify(counts, null, 1));
if (failed) process.exitCode = 1;
