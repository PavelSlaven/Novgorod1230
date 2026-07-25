import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  HISTORICAL_FREEZE_PATH,
  verifyHistoricalP05Evidence
} from './check-p05.mjs';
import { invariant } from './p05-reviewed-baseline.mjs';

// Historical P05 evidence generator/verifier. It never rewrites current
// activation state; docs/migration/spatial-v3/production-activation-boundary.v1.json
// is the current authority.

const argument = (name, fallback) => {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  invariant(process.argv[index + 1], `${name} requires a value`);
  return process.argv[index + 1];
};

const root = path.resolve(argument('--root', '.'));
const outputRelative = argument('--output', HISTORICAL_FREEZE_PATH);
const { freezeBytes } = await verifyHistoricalP05Evidence({ root });
const output = path.resolve(root, outputRelative);

if (process.argv.includes('--check')) {
  invariant(await readFile(output, 'utf8') === freezeBytes, `${outputRelative} differs from the immutable historical P05 freeze`);
  console.log('Historical normative freeze matches its immutable trust anchor.');
} else if (outputRelative === HISTORICAL_FREEZE_PATH) {
  console.log('Historical normative freeze is immutable and already verified; no file was rewritten.');
} else {
  await writeFile(output, freezeBytes, 'utf8');
  console.log(`Copied immutable historical normative freeze to ${outputRelative}.`);
}
