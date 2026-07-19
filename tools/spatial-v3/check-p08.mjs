import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const ports = [
  ['@rus/space-map', 'packages/space-map/src/spatial-v3-ports.js', ['createSpatialContextLoader', 'createSpatialTopologyRepository']],
  ['@rus/movement-routes', 'packages/movement-routes/src/spatial-v3-ports.js', ['createTraversalResolver', 'createTraversalCommitValidator']],
  ['@rus/materialization', 'packages/materialization/src/spatial-v3-ports.js', ['createTopologyProposalValidator']],
  ['@rus/party-store', 'packages/party-store/src/spatial-v3-ports.js', ['createSpatialV3Repository', 'createCombinedWritePlanCommitter']],
  ['@rus/turn', 'packages/turn/src/spatial-v3-ports.js', ['createCombinedWritePlanBuilder']]
];
const errors = [];
for (const [packageName, file, symbols] of ports) {
  const source = await readFile(resolve(root, file), 'utf8').catch(() => '');
  if (!source.includes("@rus/contracts/spatial-v3/ports")) errors.push(`${file}: must use the shared typed-failure primitive`);
  if (source.includes('createPartyStore') || source.includes('materializeWorldInstances') || source.includes('runTurnWorkflow')) errors.push(`${file}: target port imports an active-v2 behavior`);
  for (const symbol of symbols) if (!source.includes(`export function ${symbol}`)) errors.push(`${file}: missing ${symbol}`);
  const manifest = JSON.parse(await readFile(resolve(root, `packages/${packageName.slice(5)}/package.json`), 'utf8'));
  if (manifest.exports?.['./spatial-v3'] !== './src/spatial-v3-ports.js') errors.push(`${packageName}: spatial-v3 public export is missing`);
  if (manifest.dependencies?.['@rus/contracts'] !== '0.9.0') errors.push(`${packageName}: P08 typed ports require the declared @rus/contracts dependency`);
}
const ownership = await readFile(resolve(root, 'docs/domain/OWNERSHIP_MAP.md'), 'utf8');
for (const owner of ['@rus/space-map', '@rus/movement-routes', '@rus/materialization', '@rus/time-events-history', '@rus/party-store', '@rus/turn', '@rus/contracts']) if (!ownership.includes(owner)) errors.push(`ownership map: missing ${owner}`);
const registry = await readFile(resolve(root, 'docs/migration/spatial-v3/p08-public-interface-registry.json'), 'utf8').catch(() => '');
if (!registry.includes('rus.spatial_v3_public_interface_registry.v1')) errors.push('P08 public interface registry is missing');
if (errors.length) throw new Error(errors.join('\n'));
console.log('P08 ownership and public API skeleton checks: OK');
