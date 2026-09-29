// Rebuilds and checks the whole group, then writes reports/counts.json with row counts by script.
// node _shared/scripts/run-all.mjs
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { GROUP_DIR, readCsv, writeJson } from './lib.mjs';

const steps = [
  'natural_materials_soils/scripts/build.mjs', 'natural_materials_soils/scripts/check.mjs',
  'weather_climate/scripts/build.mjs', 'weather_climate/scripts/check.mjs',
  'natural_presentation_texts/scripts/build.mjs', 'natural_presentation_texts/scripts/check.mjs',
];
const selfTest = process.argv.includes('--self-test');
let failed = false;
for (const s of selfTest ? ['failure probe'] : steps) {
  try { process.stdout.write(execFileSync(process.execPath, selfTest ? ['-e', 'process.exit(7)'] : [path.join(GROUP_DIR, s)], { encoding: 'utf8' })); }
  catch (e) { failed = true; process.stdout.write(e.stdout || ''); process.stderr.write(e.stderr || String(e)); }
}
const counts = {};
for (const d of ['natural_materials_soils', 'weather_climate', 'natural_presentation_texts']) {
  counts[d] = {};
  for (const f of fs.readdirSync(path.join(GROUP_DIR, d)).filter((f) => f.endsWith('.csv')).sort()) counts[d][f] = readCsv(path.join(GROUP_DIR, d, f)).length;
  for (const f of fs.readdirSync(path.join(GROUP_DIR, d)).filter((f) => f.endsWith('.json')).sort()) {
    const j = JSON.parse(fs.readFileSync(path.join(GROUP_DIR, d, f), 'utf8'));
    counts[d][f] = j.profiles ? `${j.profiles.length} profiles` : j.payload ? `${Object.keys(j.payload.weather_states || {}).length} states` : 'json';
  }
}
const report = { generated_by: '_shared/scripts/run-all.mjs', checks_passed: !failed, counts };
if (!selfTest) writeJson(path.join(GROUP_DIR, 'reports', 'counts.json'), report);
else if (report.checks_passed || !failed) throw new Error('failure probe did not fail');
console.log(JSON.stringify(counts, null, 1));
if (selfTest) console.log(JSON.stringify({ checks_passed: report.checks_passed }));
if (failed) process.exitCode = 1;
