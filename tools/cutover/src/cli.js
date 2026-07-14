#!/usr/bin/env node
import { resolve } from 'node:path';
import { loadCutoverPlan, runStagedCutover } from './index.js';
const args = parse(process.argv.slice(2));
if (args.command !== 'run') usage();
const root = resolve(args.root ?? '.');
const plan = await loadCutoverPlan(root, args.plan ?? 'data/cutover/plan.json');
const report = await runStagedCutover({ root, plan, outputDir: args.out ?? 'artifacts/cutover', runId: args['run-id'] ?? 'cutover' });
console.log(JSON.stringify({ schema: report.schema, decision: report.recommendation.decision, totals: report.totals }, null, 2));
if (report.recommendation.decision !== 'cutover_complete') process.exitCode = 1;
function parse(values) { const out = { command: values[0] ?? null }; for (let i = 1; i < values.length; i += 1) if (values[i].startsWith('--')) { out[values[i].slice(2)] = values[i + 1]; i += 1; } return out; }
function usage() { console.error('Usage: rus-cutover run [--root .] [--plan data/cutover/plan.json] [--out artifacts/cutover] [--run-id id]'); process.exit(2); }
