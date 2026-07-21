import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = process.cwd();
const read = (path) => readFile(resolve(root, path), 'utf8');
const [moduleSource, compositionSource, writePlanSource, rootSource, productionSource, testSource, packageSource, rootPackageSource, stageMapping] = await Promise.all([
  read('packages/turn/src/spatial-v3-orchestration.js'),
  read('packages/turn/src/spatial-v3-target-composition.js'),
  read('packages/turn/src/spatial-v3-write-plan.js'),
  read('apps/game-server/src/composition/spatial-v3-target-shadow.js'),
  read('apps/game-server/src/composition/production.js'),
  read('test/spatial-v3/p21-orchestration.test.js'),
  read('packages/turn/package.json'),
  read('package.json'),
  read('packages/new-game/src/spatial-v3-stage-mapping.js')
]);
const required = [
  'createSpatialV3CommandRegistry', 'createSpatialV3TurnOrchestrator',
  'createSpatialV3NewGameStarter', 'createSpatialV3ModeHandoffOrchestrator',
  'SPATIAL_V3_COMMAND_KINDS', 'route_plan_version_pin_missing',
  'schema_version: 3', 'execution_status !== \'superseded\''
];
const absent = required.filter((token) => !moduleSource.includes(token));
const compositionRequired = ['modeHandoff.handoff', 'buildModeHandoffProposal', 'resolveModeTransition', 'handoff: modeHandoff', 'invokeP19'];
const missingComposition = compositionRequired.filter((token) => !compositionSource.includes(token));
const unsafeModeAdapters = ['commandAdapters.board_carrier', 'commandAdapters.disembark_carrier', 'commandAdapters.load_carrier', 'commandAdapters.change_cohort'].filter((token) => compositionSource.includes(token));
const testRequired = [
  'P21 target root binds a P19 ownership transition',
  'createSpatialV3TargetShadowCompositionRoot',
  'createSpatialV3CombinedAtomicCommitter',
  'P21 root awaits real P19 traversal results',
  'synchronized_slice',
  'spatial_v3.combined_write_plan.v2',
  'target_shadow_only'
];
const missingTests = testRequired.filter((token) => !testSource.includes(token));
const failures = [
  ...absent,
  ...missingComposition.map((token) => `target composition ${token}`),
  !compositionSource.includes('adapt(command, await invokeTraversal(command.command_payload))') && 'awaited P19 timed traversal adapter',
  !writePlanSource.includes('spatial_v3.combined_write_plan.v2') && 'P16 combined-write contract',
  ...unsafeModeAdapters.map((token) => `unsafe mode adapter ${token}`),
  ...missingTests.map((token) => `integration proof ${token}`),
  !testSource.includes('stops before commit') && 'pipeline gate test',
  !packageSource.includes('./spatial-v3-orchestration') && 'public target entrypoint',
  !rootPackageSource.includes('spatial-v3:test-p21') && 'named P21 test command',
  !stageMapping.includes('target_shadow_only') && 'target/shadow stage mapping',
  !stageMapping.includes('active_stage_id: 13') && 'v2 stage 13 mapping',
  !stageMapping.includes('active_stage_id: 24') && 'v2 stage 24 boundary',
  !stageMapping.includes('active_stage_id: 25') && 'v2 stage 25 boundary',
  !rootSource.includes("activation: 'not_authorized'") && 'target root remains non-activated',
  productionSource.includes('spatial-v3-target-shadow') && 'target root registered in active production'
].filter(Boolean);
if (failures.length) {
  throw new Error(`P21 orchestration contract incomplete: ${failures.join(', ')}`);
}
console.log('P21 orchestration contract: OK');
