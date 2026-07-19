import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = process.cwd();
const read = (path) => readFile(resolve(root, path), 'utf8');
const [moduleSource, testSource, packageSource, stageMapping] = await Promise.all([
  read('packages/turn/src/spatial-v3-orchestration.js'),
  read('test/spatial-v3/p21-orchestration.test.js'),
  read('packages/turn/package.json'),
  read('packages/new-game/src/spatial-v3-stage-mapping.js')
]);
const required = [
  'createSpatialV3CommandRegistry', 'createSpatialV3TurnOrchestrator',
  'createSpatialV3NewGameStarter', 'createSpatialV3ModeHandoffOrchestrator',
  'SPATIAL_V3_COMMAND_KINDS', 'route_plan_version_pin_missing',
  'schema_version: 3', 'execution_status !== \'superseded\''
];
const absent = required.filter((token) => !moduleSource.includes(token));
if (absent.length || !testSource.includes('stops before commit') || !packageSource.includes('./spatial-v3-orchestration') || !stageMapping.includes('target_shadow_only') || !stageMapping.includes('active_stage_id: 13') || !stageMapping.includes('active_stage_id: 24') || !stageMapping.includes('active_stage_id: 25')) {
  throw new Error(`P21 orchestration contract incomplete: ${[...absent, !testSource.includes('stops before commit') && 'pipeline gate test', !packageSource.includes('./spatial-v3-orchestration') && 'public target entrypoint', !stageMapping.includes('target_shadow_only') && 'target/shadow stage mapping'].filter(Boolean).join(', ')}`);
}
console.log('P21 orchestration contract: OK');
