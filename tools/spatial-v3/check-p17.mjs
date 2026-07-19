import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const failures = [];
const read = (path) => readFile(resolve(root, path), 'utf8');
const [entrypoint, packageJson, adapter, topology] = await Promise.all([
  read('packages/space-map/src/index.js'),
  read('packages/space-map/package.json'),
  read('packages/space-map/src/spatial-v2-compat.js'),
  read('packages/space-map/src/spatial-v3.js')
]);
if (entrypoint.includes('POSITION_KEYS') || entrypoint.includes('spatial-v2-compat')) failures.push('default @rus/space-map export must not expose the v2 position path');
if (!packageJson.includes('"./spatial-v2-compat"')) failures.push('explicit v2 compatibility export is missing');
if (!adapter.includes("['migration', 'shadow_fixture']")) failures.push('v2 adapter must be bounded to migration/shadow fixtures');
for (const required of ['buildContainmentIndex', 'buildG1GridIndex', 'buildSpatialTopologyIndex', 'validateSpatialClassification', 'interpolateOrientationProfile', 'createFactualSpatialContextSnapshot']) {
  if (!topology.includes(`export function ${required}`)) failures.push(`P17 pure spatial API is missing ${required}`);
}
if (failures.length) throw new Error(`P17 check failed:\n- ${failures.join('\n- ')}`);
console.log('P17 space-map target boundary: OK');
