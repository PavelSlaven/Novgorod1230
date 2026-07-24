import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

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
const registry = JSON.parse(await readFile(resolve(root, 'docs/migration/spatial-v3/p08-public-interface-registry.json'), 'utf8').catch(() => '{}'));
if (registry.schema_version !== 'rus.spatial_v3_public_interface_registry.v1'
  || registry.status !== 'target'
  || registry.activation !== 'P28 only'
  || registry.failure_mode !== 'typed_fail_closed_without_fallback'
  || registry.contract_version !== '4.3.0-target.1'
  || registry.temporal_contract !== 'temporal-world-v1'
  || !Array.isArray(registry.interfaces)) {
  errors.push('P08 public interface registry metadata is invalid');
}
const expectedInterfaces = [
  ['@rus/space-map', '@rus/space-map/spatial-v3', 'createSpatialContextLoader', 'load'],
  ['@rus/space-map', '@rus/space-map/spatial-v3', 'createSpatialTopologyRepository', 'read'],
  ['@rus/movement-routes', '@rus/movement-routes/spatial-v3', 'createTraversalResolver', 'resolve'],
  ['@rus/movement-routes', '@rus/movement-routes/spatial-v3', 'createTraversalCommitValidator', 'validate'],
  ['@rus/materialization', '@rus/materialization/spatial-v3', 'createTopologyProposalValidator', 'validate'],
  ['@rus/turn', '@rus/turn/spatial-v3', 'createCombinedWritePlanBuilder', 'build'],
  ['@rus/party-store', '@rus/party-store/spatial-v3', 'createSpatialV3Repository', 'read'],
  ['@rus/party-store', '@rus/party-store/spatial-v3', 'createCombinedWritePlanCommitter', 'commit'],
  ['@rus/time-events-history', '@rus/time-events-history', 'normalizeGameTimestamp', 'call'],
  ['@rus/time-events-history', '@rus/time-events-history/calendar', 'projectCalendar', 'call'],
  ['@rus/time-events-history', '@rus/time-events-history/temporal-boundaries', 'resolveSameTimeCascade', 'call'],
  ['@rus/time-events-history', '@rus/time-events-history/historical-phases', 'provideHistoricalPhaseBoundaries', 'call'],
  ['@rus/turn', '@rus/turn/temporal-advance', 'createTemporalAdvanceEngine', 'advance'],
  ['@rus/turn', '@rus/turn/temporal-carriers', 'createTemporalCarrierProposalEngine', 'propose'],
  ['@rus/turn', '@rus/turn/temporal-proposal-merger', 'mergeTemporalProposals', 'call'],
  ['@rus/body-state', '@rus/body-state', 'calculateBodyTimeEffectProposal', 'call'],
  ['@rus/body-state', '@rus/body-state', 'predictNearestBodyThreshold', 'call'],
  ['@rus/visibility-knowledge-memory', '@rus/visibility-knowledge-memory', 'buildSafeNarratorPackage', 'call'],
  ['@rus/party-store', '@rus/party-store/spatial-v3-domain-integration', 'createSpatialV3DomainPlacementIntegrator', 'validatePlacements'],
  ['@rus/movement-routes', '@rus/movement-routes/spatial-v3-planner', 'createMovementPlanner', 'resolve'],
  ['@rus/movement-routes', '@rus/movement-routes/spatial-v3-planner', 'createRoutePlanActivationValidator', 'validate'],
  ['@rus/contracts', '@rus/contracts/spatial-v3/registry', 'validateSpatialV3Contract', 'call'],
  ['@rus/contracts', '@rus/contracts/spatial-v3/registry', 'createSpatialV3TypedError', 'call'],
  ['@rus/npc-runtime', '@rus/npc-runtime', 'proposeNpcScheduleTransition', 'call'],
  ['@rus/npc-runtime', '@rus/npc-runtime', 'proposeNpcPerception', 'call'],
  ['@rus/npc-runtime', '@rus/npc-runtime', 'decideBoundedNpcAction', 'call'],
  ['@rus/npc-runtime', '@rus/npc-runtime', 'orderNpcDecisionRequests', 'call'],
  ['@rus/environment-state', '@rus/environment-state', 'findNearestEnvironmentBoundaries', 'call'],
  ['@rus/environment-state', '@rus/environment-state', 'deriveEnvironment', 'call'],
  ['@rus/environment-state', '@rus/environment-state', 'proposeEnvironmentBoundaryEffect', 'call'],
  ['@rus/world-processes', '@rus/world-processes', 'createWorldProcessEngine', 'catchUp']
];
const interfaceKey = ({ owner, entry, factory, method }) => [owner, entry, factory, method].join('\u0000');
const registryKeys = new Set((registry.interfaces ?? []).map(interfaceKey));
if (registryKeys.size !== (registry.interfaces ?? []).length) errors.push('P08 public interface registry contains duplicate entries');
const expectedKeys = new Set(expectedInterfaces.map((expected) => expected.join('\u0000')));
for (const expected of expectedInterfaces) {
  if (!registryKeys.has(expected.join('\u0000'))) errors.push(`P08 public interface registry is missing ${expected[1]}:${expected[2]}.${expected[3]}`);
}
for (const key of registryKeys) {
  if (!expectedKeys.has(key)) errors.push(`P08 public interface registry contains unexpected entry ${key.replaceAll('\u0000', ':')}`);
}
for (const item of registry.interfaces ?? []) {
  if (![item.owner, item.entry, item.factory, item.method].every((value) => typeof value === 'string' && value.length > 0)
    || !item.owner.startsWith('@rus/')
    || (item.entry !== item.owner && !item.entry.startsWith(`${item.owner}/`))) {
    errors.push('P08 public interface registry contains an invalid interface entry');
    continue;
  }
  const packageDir = resolve(root, 'packages', item.owner.slice('@rus/'.length));
  const manifest = JSON.parse(await readFile(resolve(packageDir, 'package.json'), 'utf8').catch(() => '{}'));
  const exportsMap = typeof manifest.exports === 'string' ? { '.': manifest.exports } : manifest.exports ?? {};
  const exportKey = item.entry === item.owner ? '.' : `.${item.entry.slice(item.owner.length)}`;
  const sourcePath = exportsMap[exportKey];
  const modulePath = typeof sourcePath === 'string' ? resolve(packageDir, sourcePath) : null;
  const publicModule = modulePath
    ? await import(pathToFileURL(modulePath).href).catch(() => null)
    : null;
  if (!publicModule || !Object.hasOwn(publicModule, item.factory)) {
    errors.push(`${item.entry}: package export does not expose ${item.factory}`);
  }
}
if (errors.length) throw new Error(errors.join('\n'));
console.log('P08 ownership and public API skeleton checks: OK');
