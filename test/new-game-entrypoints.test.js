import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createWorldState } from '../src/world/state.js';
import {
  createFreshWorld,
  extractNewGamePipelinePartyScreenPayload,
  isNewGamePipelineOptInEnabled
} from '../src/world/new-game.js';
import { generateActorProfiles, generatePlayerSeed } from '../src/world/provider.js';

test('createFreshWorld keeps 26-step pipeline opt-in', () => {
  assert.equal(isNewGamePipelineOptInEnabled({}, {}), false);
  assert.equal(isNewGamePipelineOptInEnabled({}, { NEW_GAME_PIPELINE_ENABLED: 'true' }), true);
  assert.equal(isNewGamePipelineOptInEnabled({ enableNewGamePipeline: true }, {}), true);
});

test('createFreshWorld exposes first_game_screen when opt-in pipeline succeeds', async () => {
  const calls = [];
  const result = await createFreshWorld({
    startText: 'двор у переправы',
    playerName: 'Marek',
    env: { NEW_GAME_PIPELINE_ENABLED: 'true' },
    async newGamePipelineRunner(options) {
      calls.push(options);
      return {
        schema: 'new_game_pipeline_result',
        first_game_screen: firstGameScreen()
      };
    }
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].enableNewGamePipeline, true);
  assert.equal(result.pipeline_runtime, 'new_lifecycle');
  assert.equal(result.legacy_provider_runtime_used, false);
  assert.equal(result.world, null);
  assert.equal(result.openingText, 'Темно и холодно.');
  assert.equal(result.firstGameScreen.schema, 'first_game_screen');
  assert.equal(result.first_game_screen, result.firstGameScreen);
  assert.equal(result.partyScreenPayload.delivery_state.awaiting_client_ack, true);
});

test('direct legacy provider calls fail when new lifecycle runtime is enabled', async () => {
  const world = createWorldState({ startText: 'двор у переправы' });
  world.pipeline_runtime = 'new_lifecycle';

  await assert.rejects(
    generatePlayerSeed(world, { NEW_GAME_PIPELINE_ENABLED: 'true', DEEPSEEK_API_KEY: 'test-key' }),
    /legacy_path_forbidden_for_new_pipeline/u
  );
  await assert.rejects(
    generateActorProfiles(world, { NEW_GAME_PIPELINE_ENABLED: 'true', DEEPSEEK_API_KEY: 'test-key' }),
    /legacy_path_forbidden_for_new_pipeline/u
  );
});

test('pipeline screen extractor rejects partial pipeline results', () => {
  assert.equal(extractNewGamePipelinePartyScreenPayload({ status: 'blocked_after_stage_8' }), null);
  assert.equal(extractNewGamePipelinePartyScreenPayload({ first_game_screen: { schema: 'first_game_screen', screen_status: 'blocked' } }), null);
});

test('browser generation progress defines canonical 26 stages', async () => {
  const appPath = fileURLToPath(new URL('../src/ui/app.js', import.meta.url));
  const source = await readFile(appPath, 'utf8');
  const stageIds = [...source.matchAll(/id: 'ng_stage_(\d{2})'/gu)].map((match) => match[1]);

  assert.deepEqual(stageIds.slice(0, 26), Array.from({ length: 26 }, (_, index) => String(index + 1).padStart(2, '0')));
  assert.match(source, /\.\.\.GENERATION_STAGES\.map\(\(stage\) => \[stage\.id, stage\.id\]\)/u);
});

test('user-facing entrypoints force new lifecycle runtime', async () => {
  const uiServerPath = fileURLToPath(new URL('../src/ui-server.js', import.meta.url));
  const indexPath = fileURLToPath(new URL('../src/index.js', import.meta.url));
  const [uiServerSource, indexSource] = await Promise.all([
    readFile(uiServerPath, 'utf8'),
    readFile(indexPath, 'utf8')
  ]);

  assert.match(uiServerSource, /enableNewGamePipeline:\s*true/u);
  assert.match(indexSource, /enableNewGamePipeline:\s*true/u);
});

function firstGameScreen() {
  return {
    version: 1,
    schema: 'first_game_screen',
    request_id: 'req_001',
    screen_status: 'ready',
    party_id: 'party_001',
    main_prose: 'Темно и холодно.',
    delivery_state: {
      message_id: 'opening_message_001',
      opening_scene_presented: false,
      awaiting_client_ack: true
    }
  };
}
