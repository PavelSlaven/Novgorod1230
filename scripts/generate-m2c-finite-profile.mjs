import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { buildTargetFiniteProfileMapping } from '../tools/runtime-catalog-activation/src/target-finite-profile.js';

const root = resolve('data/world-catalogs/novgorod');
const directory = resolve(root, 'live-world-runtime-v17');
const result = buildTargetFiniteProfileMapping({
  candidateBytes: await readFile(resolve(directory, 'm2c-finite-only-ordinary-base-candidate.json'), 'utf8'),
  approval: JSON.parse(await readFile(resolve(root, 'm2c-sol-data-approval.json'), 'utf8')) });
for (const [name, bytes] of [['m2c-finite-only-ordinary-base-approved.json', result.datasetBytes],
  ['m2c-finite-only-ordinary-base-manifest.json', result.manifestBytes]]) {
  await writeFile(resolve(directory, name), bytes);
  console.log(`${name} ${createHash('sha256').update(bytes).digest('hex')}`);
}
