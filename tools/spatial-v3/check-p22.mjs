import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = process.cwd();
const [projection, test, manifest, webContract] = await Promise.all([
  readFile(resolve(root, 'packages/presentation/src/spatial-v3-projection.js'), 'utf8'),
  readFile(resolve(root, 'test/spatial-v3/p22-projection.test.js'), 'utf8'),
  readFile(resolve(root, 'packages/presentation/package.json'), 'utf8'),
  readFile(resolve(root, 'apps/game-web/src/api/contracts.js'), 'utf8')
]);
const required = ['createSpatialV3VisibilityResolver', 'createSpatialV3AcousticResolver', 'projectSpatialV3NavigationBelief', 'deriveSpatialV3Interaction', 'createSpatialV3PlayerProjection', 'createSpatialV3ProjectionPanels', 'target_ambient_noise'];
const absent = required.filter((item) => !projection.includes(item));
if (absent.length || !manifest.includes('./spatial-v3-projection') || !test.includes('least loss') || !test.includes('hidden topology') || !webContract.includes('PUBLIC_PAYLOAD_HIDDEN_LEAK')) {
  throw new Error(`P22 projection contract incomplete: ${[...absent, !manifest.includes('./spatial-v3-projection') && 'target entrypoint', !test.includes('least loss') && 'acoustic test', !test.includes('hidden topology') && 'leak test', !webContract.includes('PUBLIC_PAYLOAD_HIDDEN_LEAK') && 'browser boundary'].filter(Boolean).join(', ')}`);
}
console.log('P22 projection contract: OK');
