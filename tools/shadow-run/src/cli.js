#!/usr/bin/env node
import { resolve } from 'node:path';
import { loadShadowManifest, runShadowCorpus } from './index.js';

const args = parse(process.argv.slice(2));
if (args.command !== 'run') usage();
const root = resolve(args.root ?? '.');
const manifest = await loadShadowManifest(root, args.manifest ?? 'data/shadow-corpus/manifest.json');
const outDir = resolve(root, args.out ?? 'artifacts/shadow-run');
const report = await runShadowCorpus({
  root,
  manifest,
  outputJson: resolve(outDir, 'shadow-run-report.json'),
  outputMarkdown: resolve(outDir, 'shadow-run-report.md'),
  runId: args['run-id'] ?? null
});
console.log(JSON.stringify({ schema: report.schema, decision: report.recommendation.decision, totals: report.totals, output: outDir }, null, 2));
if (report.recommendation.decision !== 'go_to_staged_cutover') process.exitCode = 1;

function parse(values) {
  const result = { command: values[0] ?? null };
  for (let index = 1; index < values.length; index += 1) {
    const token = values[index];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    result[key] = values[index + 1];
    index += 1;
  }
  return result;
}
function usage() { console.error('Usage: rus-shadow-run run [--root .] [--manifest data/shadow-corpus/manifest.json] [--out artifacts/shadow-run] [--run-id id]'); process.exit(2); }
