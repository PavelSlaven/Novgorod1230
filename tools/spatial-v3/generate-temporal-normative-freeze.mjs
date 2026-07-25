import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(process.cwd());
const freezePath = resolve(root, 'docs/work/temporal-world-v4/normative-freeze.json');
const boundaryPath = resolve(root, 'docs/migration/spatial-v3/production-activation-boundary.v1.json');
const expectedHistoricalDigest = '7d08d43eb31a5f228196c37e054d1176ec97645b3e7f105e0ed76a7cc7885b85';

if (!process.argv.includes('--check')) {
  throw new Error(
    'Temporal 4.3 normative freeze is immutable historical evidence. '
    + 'Create a candidate-bound PR8 validation artifact instead of regenerating it.'
  );
}

const freezeBytes = await readFile(freezePath);
const freeze = JSON.parse(freezeBytes);
const boundary = JSON.parse(await readFile(boundaryPath, 'utf8'));

if (sha256(freezeBytes) !== expectedHistoricalDigest) {
  throw new Error('Immutable Temporal 4.3 normative freeze digest changed.');
}
if (freeze.contract?.amendment !== 'temporal-world-v1'
  || freeze.contract?.spatial_target_version !== '4.3.0-target.1') {
  throw new Error('Historical Temporal freeze contract identity changed.');
}
if (boundary.historical_p28_evidence?.composition_changed !== false
  || boundary.historical_p28_evidence?.production_writes !== 0
  || boundary.activation_operation !== 'versioned production activation cutover') {
  throw new Error('Current activation boundary no longer preserves the historical Temporal freeze meaning.');
}

console.log(`Temporal 4.3 normative freeze is immutable and digest-valid: ${expectedHistoricalDigest}.`);

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}
