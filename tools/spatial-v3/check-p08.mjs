import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(import.meta.dirname, '../..');
const argumentValue = (name) => {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1];
};
const validationOnly = process.argv.includes('--validation-only');
const registryArgument = argumentValue('--registry');
if (registryArgument && !validationOnly) {
  throw new Error('P08 registry override is allowed only for validation fixtures');
}
const registryPath = registryArgument
  ? resolve(registryArgument)
  : resolve(root, 'docs/migration/spatial-v3/p08-public-interface-registry.json');
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
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
const registry = JSON.parse(await readFile(registryPath, 'utf8').catch(() => '{}'));
if (registry.schema_version !== 'rus.spatial_v3_public_interface_registry.v1'
  || registry.status !== 'target'
  || registry.activation !== 'versioned production activation cutover only'
  || registry.failure_mode !== 'typed_fail_closed_without_fallback'
  || registry.contract_version !== '4.5.0-target.1'
  || registry.temporal_contract !== 'temporal-world-v1.1'
  || !Array.isArray(registry.owner_contract_refs)
  || !Array.isArray(registry.interfaces)) {
  errors.push('P08 public interface registry metadata is invalid');
}
const expectedTimeContractRef = {
  owner: '@rus/time-events-history',
  registry_id: 'rus.time_events_history.declarative_content_contracts.v2',
  revision: 2,
  path: 'packages/time-events-history/src/declarative-content-contracts.v2.json',
  digest: '6e72f137be19f77afa34aa853d9f12c0c8f3d7ce28e11c41c83ecc8ee6369a10'
};
const expectedTurnContractRef = {
  owner: '@rus/turn',
  registry_id: 'rus.turn.declarative_content_contracts.v2',
  revision: 2,
  path: 'packages/turn/src/declarative-content-contracts.v2.json',
  digest: 'ad56d2f6980765e6b8e292a0dd536c2ffa4878db8af87ee972974ed495e13123'
};
if (registry.owner_contract_refs?.length !== 2
  || JSON.stringify(registry.owner_contract_refs[0]) !== JSON.stringify(expectedTimeContractRef)
  || JSON.stringify(registry.owner_contract_refs[1]) !== JSON.stringify(expectedTurnContractRef)) {
  errors.push('P08 owner contract ref set is incomplete or changed');
}
const timeV1Path = resolve(root, 'packages/time-events-history/src/declarative-content-contracts.v1.json');
const timeV2Path = resolve(root, expectedTimeContractRef.path);
const timeV1Source = await readFile(timeV1Path, 'utf8').catch(() => '');
const timeV2Source = await readFile(timeV2Path, 'utf8').catch(() => '');
const timeV1Registry = timeV1Source ? JSON.parse(timeV1Source) : {};
const timeV2Registry = timeV2Source ? JSON.parse(timeV2Source) : {};
const expectedCalendarEntrypoints = [
  '@rus/time-events-history/calendar:projectCalendar',
  '@rus/time-events-history/calendar:resolveGameTimestampFromCalendarDate'
];
const timeV2Contracts = new Map(
  Array.isArray(timeV2Registry.contracts)
    ? timeV2Registry.contracts.map((contract) => [contract.schema_id, contract])
    : []
);
const calendarContract = timeV2Contracts.get('rus.time_events_history.calendar_projection.v1');
if (sha256(timeV1Source) !== 'cdc4571c07e2c592cbfb469a7028c31791d82deadbc9b37a97f44ee58597a471'
  || sha256(timeV2Source) !== expectedTimeContractRef.digest
  || timeV2Registry.schema !== 'rus.declarative_content_contract_registry.v1'
  || timeV2Registry.registry_id !== expectedTimeContractRef.registry_id
  || timeV2Registry.revision !== expectedTimeContractRef.revision
  || timeV2Registry.owner !== expectedTimeContractRef.owner
  || timeV2Registry.status !== 'approved'
  || timeV2Registry.package_version !== '0.13.0'
  || timeV2Registry.supersedes_registry_ref?.registry_id !== 'rus.time_events_history.declarative_content_contracts.v1'
  || timeV2Registry.supersedes_registry_ref?.revision !== 1
  || timeV2Registry.supersedes_registry_ref?.path !== 'packages/time-events-history/src/declarative-content-contracts.v1.json'
  || timeV2Registry.supersedes_registry_ref?.digest !== 'cdc4571c07e2c592cbfb469a7028c31791d82deadbc9b37a97f44ee58597a471'
  || timeV2Registry.contracts?.length !== 2
  || timeV2Contracts.size !== 2
  || JSON.stringify(timeV2Contracts.get('rus.time_events_history.game_timestamp_and_elapsed.v1'))
    !== JSON.stringify(timeV1Registry.contracts?.[0])
  || calendarContract?.schema_version !== 1
  || JSON.stringify(calendarContract?.public_entrypoints) !== JSON.stringify(expectedCalendarEntrypoints)
  || !calendarContract?.required_invariants?.includes('bidirectional_round_trip')
  || !calendarContract?.required_invariants?.includes('no_rng')
  || calendarContract?.forbidden_capabilities?.includes('date_selection') !== true
  || timeV2Registry.scenario_specific_ids_or_counts !== 'forbidden') {
  errors.push('time-events-history owner contract v2 is missing, incompatible, or not exact-superseding v1');
}
const timeModuleDocumentation = await readFile(resolve(root, 'packages/time-events-history/MODULE.md'), 'utf8').catch(() => '');
if (!timeModuleDocumentation.includes('resolveGameTimestampFromCalendarDate(exactCalendarDate, approvedProfile)')) {
  errors.push('time-events-history MODULE.md does not register the inverse calendar entrypoint');
}
const turnV1Path = resolve(root, 'packages/turn/src/declarative-content-contracts.v1.json');
const turnV2Path = resolve(root, expectedTurnContractRef.path);
const turnV1Source = await readFile(turnV1Path, 'utf8').catch(() => '');
const turnV2Source = await readFile(turnV2Path, 'utf8').catch(() => '');
const turnV1Registry = turnV1Source ? JSON.parse(turnV1Source) : {};
const turnV2Registry = turnV2Source ? JSON.parse(turnV2Source) : {};
const turnV2Contracts = new Map(
  Array.isArray(turnV2Registry.contracts)
    ? turnV2Registry.contracts.map((contract) => [contract.schema_id, contract])
    : []
);
const semanticIntentContract = turnV2Contracts.get('rus.turn.semantic_intent_boundary.v1');
const expectedSemanticEntrypoints = [
  '@rus/turn:createTurnAvailableActionSet',
  '@rus/turn:resolveTurnSemanticIntent'
];
if (sha256(turnV1Source) !== 'aa4dd295998f5fde3d64cf1718e532671f524c994f6742d0c5bddb176d2e7ed7'
  || sha256(turnV2Source) !== expectedTurnContractRef.digest
  || turnV2Registry.schema !== 'rus.declarative_content_contract_registry.v1'
  || turnV2Registry.registry_id !== expectedTurnContractRef.registry_id
  || turnV2Registry.revision !== expectedTurnContractRef.revision
  || turnV2Registry.owner !== expectedTurnContractRef.owner
  || turnV2Registry.status !== 'approved'
  || turnV2Registry.package_version !== '0.15.0'
  || turnV2Registry.supersedes_registry_ref?.registry_id !== 'rus.turn.declarative_content_contracts.v1'
  || turnV2Registry.supersedes_registry_ref?.revision !== 1
  || turnV2Registry.supersedes_registry_ref?.path !== 'packages/turn/src/declarative-content-contracts.v1.json'
  || turnV2Registry.supersedes_registry_ref?.digest !== 'aa4dd295998f5fde3d64cf1718e532671f524c994f6742d0c5bddb176d2e7ed7'
  || turnV2Registry.contracts?.length !== 2
  || turnV2Contracts.size !== 2
  || JSON.stringify(turnV2Contracts.get('rus.trace_activity_check_consequence_profiles.v1'))
    !== JSON.stringify(turnV1Registry.contracts?.[0])
  || semanticIntentContract?.schema_version !== 1
  || JSON.stringify(semanticIntentContract?.public_entrypoints) !== JSON.stringify(expectedSemanticEntrypoints)
  || !semanticIntentContract?.required_invariants?.includes('complete_registered_action_set_without_raw_text')
  || !semanticIntentContract?.required_invariants?.includes('bounded_decision_membership_and_version_validation')
  || !semanticIntentContract?.required_invariants?.includes('factual_commit_before_narration')
  || semanticIntentContract?.forbidden_capabilities?.includes('regex_as_free_intent_owner') !== true
  || semanticIntentContract?.forbidden_capabilities?.includes('narration_in_factual_write_plan') !== true
  || turnV2Registry.scenario_specific_ids_or_counts !== 'forbidden') {
  errors.push('turn owner contract v2 is missing, incompatible, or not exact-superseding v1');
}
const turnModuleDocumentation = await readFile(resolve(root, 'packages/turn/MODULE.md'), 'utf8').catch(() => '');
for (const entrypoint of ['createTurnAvailableActionSet', 'resolveTurnSemanticIntent']) {
  if (!turnModuleDocumentation.includes(entrypoint)) {
    errors.push(`turn MODULE.md does not register ${entrypoint}`);
  }
}
const expectedInterfaces = [
  ['@rus/space-map', '@rus/space-map/spatial-v3', 'createSpatialContextLoader', 'load'],
  ['@rus/space-map', '@rus/space-map/spatial-v3', 'createSpatialTopologyRepository', 'read'],
  ['@rus/movement-routes', '@rus/movement-routes/spatial-v3', 'createTraversalResolver', 'resolve'],
  ['@rus/movement-routes', '@rus/movement-routes/spatial-v3', 'createTraversalCommitValidator', 'validate'],
  ['@rus/materialization', '@rus/materialization/spatial-v3', 'createTopologyProposalValidator', 'validate'],
  ['@rus/turn', '@rus/turn/spatial-v3', 'createCombinedWritePlanBuilder', 'build'],
  ['@rus/turn', '@rus/turn', 'createTurnAvailableActionSet', 'call'],
  ['@rus/turn', '@rus/turn', 'resolveTurnSemanticIntent', 'call'],
  ['@rus/party-store', '@rus/party-store/spatial-v3', 'createSpatialV3Repository', 'read'],
  ['@rus/party-store', '@rus/party-store/spatial-v3', 'createCombinedWritePlanCommitter', 'commit'],
  ['@rus/time-events-history', '@rus/time-events-history', 'normalizeGameTimestamp', 'call'],
  ['@rus/time-events-history', '@rus/time-events-history/calendar', 'projectCalendar', 'call'],
  ['@rus/time-events-history', '@rus/time-events-history/calendar', 'resolveGameTimestampFromCalendarDate', 'call'],
  ['@rus/time-events-history', '@rus/time-events-history/temporal-boundaries', 'resolveSameTimeCascade', 'call'],
  ['@rus/time-events-history', '@rus/time-events-history/historical-phases', 'provideHistoricalPhaseBoundaries', 'call'],
  ['@rus/turn', '@rus/turn/temporal-advance', 'createTemporalAdvanceEngine', 'advance'],
  ['@rus/turn', '@rus/turn/temporal-advance', 'advanceTemporalBoundaryBatch', 'advance'],
  ['@rus/turn', '@rus/turn/temporal-advance', 'createTemporalSourceResolver', 'resolve'],
  ['@rus/turn', '@rus/turn/temporal-advance', 'createTemporalAdvanceOwner', 'advance'],
  ['@rus/turn', '@rus/turn/temporal-carriers', 'createTemporalCarrierProposalEngine', 'propose'],
  ['@rus/turn', '@rus/turn/temporal-proposal-merger', 'mergeTemporalProposals', 'call'],
  ['@rus/body-state', '@rus/body-state', 'calculateBodyTimeEffectProposal', 'call'],
  ['@rus/body-state', '@rus/body-state', 'predictNearestBodyThreshold', 'call'],
  ['@rus/visibility-knowledge-memory', '@rus/visibility-knowledge-memory', 'buildSafeNarratorPackage', 'call'],
  ['@rus/visibility-knowledge-memory', '@rus/visibility-knowledge-memory', 'mergeFormalKnowledgeMemory', 'call'],
  ['@rus/party-store', '@rus/party-store/spatial-v3-domain-integration', 'createSpatialV3DomainPlacementIntegrator', 'validatePlacements'],
  ['@rus/movement-routes', '@rus/movement-routes/spatial-v3-planner', 'createMovementPlanner', 'resolve'],
  ['@rus/movement-routes', '@rus/movement-routes/spatial-v3-planner', 'createRoutePlanActivationValidator', 'validate'],
  ['@rus/contracts', '@rus/contracts/spatial-v3/registry', 'validateSpatialV3Contract', 'call'],
  ['@rus/contracts', '@rus/contracts/spatial-v3/registry', 'SPATIAL_V3_NPC_REACTION_HANDLER_BINDINGS', 'read'],
  ['@rus/contracts', '@rus/contracts/spatial-v3/registry', 'createSpatialV3TypedError', 'call'],
  ['@rus/npc-runtime', '@rus/npc-runtime', 'proposeNpcScheduleTransition', 'call'],
  ['@rus/npc-runtime', '@rus/npc-runtime', 'proposeNpcPerception', 'call'],
  ['@rus/npc-runtime', '@rus/npc-runtime', 'proposeNpcReactionOptions', 'call'],
  ['@rus/npc-runtime', '@rus/npc-runtime', 'decideBoundedNpcAction', 'call'],
  ['@rus/npc-runtime', '@rus/npc-runtime', 'orderNpcDecisionRequests', 'call'],
  ['@rus/turn', '@rus/turn/spatial-v3-reaction-handlers', 'resolveSpatialV3NpcReaction', 'call'],
  ['@rus/turn', '@rus/turn/spatial-v3-perception-reaction-write-set', 'buildSpatialV3PerceptionReactionWriteSet', 'call'],
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
