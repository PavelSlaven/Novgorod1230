#!/usr/bin/env node
import { runFinalization } from './runner.js';

const args = process.argv.slice(2);
const command = args.shift();
if (command !== 'run') {
  console.error('Usage: node tools/finalization/src/cli.js run --root . --out <dir> --run-id <id>');
  process.exit(2);
}
const options = parseArgs(args);
const report = await runFinalization(options.root ?? '.', { outDir: options.out, runId: options['run-id'] });
console.log(JSON.stringify(report.recommendation, null, 2));
if (report.recommendation.decision === 'no_go') process.exitCode = 1;

function parseArgs(values) {
  const result = {};
  for (let index = 0; index < values.length; index += 2) {
    const key = values[index];
    if (!key?.startsWith('--')) throw new TypeError(`invalid argument: ${key}`);
    result[key.slice(2)] = values[index + 1];
  }
  return result;
}
