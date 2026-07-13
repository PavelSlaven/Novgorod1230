import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { resolve } from 'node:path';
import { createFreshWorld } from './world/new-game.js';
import { createWorldState } from './world/state.js';
import { loadWorldState, saveWorldState } from './world/persistence.js';
import { renderOpeningScene } from './world/engine.js';
import { loadLocalEnv } from './env.js';
import { buildUiState } from './ui-state.js';
import { buildPartyTurnBootstrapPayloadFromUiState } from './ui/party-screen-adapter.js';
import { runPartyTurnPipeline } from './world/turn-runtime/index.js';

const savePath = process.env.SAVE_PATH
  ? resolve(process.cwd(), process.env.SAVE_PATH)
  : resolve(process.cwd(), 'data', 'save.json');

async function main() {
  await loadLocalEnv();
  const path = savePath;
  const seed = createWorldState({ startText: process.env.START_TEXT });
  let world = await loadWorldState(path, seed);
  let partyScreenPayload = world?.partyScreenPayload ?? null;
  let partyRuntimeState = world?.partyRuntimeState ?? null;

  if (!world) {
    const created = await createFreshWorld({
      startText: process.env.START_TEXT,
      playerName: process.env.PLAYER_NAME ?? '',
      enableNewGamePipeline: true,
      savePath: path,
      env: process.env
    });
    world = created.world ?? createWorldState({ startText: process.env.START_TEXT });
    world.pipeline_runtime = created.pipeline_runtime ?? 'new_lifecycle';
    world.legacy_provider_runtime_used = false;
    if (created.partyScreenPayload) {
      world.partyScreenPayload = structuredClone(created.partyScreenPayload);
    }
    partyScreenPayload = created.partyScreenPayload ?? world?.partyScreenPayload ?? null;
    partyRuntimeState = world?.partyRuntimeState ?? null;
  }

  if (!world.lastNarratorProse) {
    world.lastNarratorProse = renderOpeningScene(world);
  }
  if (!partyScreenPayload) {
    const uiState = buildUiState(world, { includeDebug: false });
    partyScreenPayload = buildPartyTurnBootstrapPayloadFromUiState(uiState, {
      partyId: world.worldKey ?? 'legacy_party_runtime'
    });
    world.partyScreenPayload = structuredClone(partyScreenPayload);
  }

  console.log(partyScreenPayload?.openingText ?? world.lastNarratorProse);

  const rl = readline.createInterface({ input, output });
  try {
    for await (const line of rl) {
      const text = line.trim();
      if (!text) continue;
      if (['quit', 'exit', 'выход'].includes(text.toLowerCase())) break;

      const result = await runPartyTurnPipeline({
        world,
        partyScreenPayload,
        partyRuntimeState,
        bootstrapPayload: partyScreenPayload,
        rawText: text,
        env: process.env
      });
      partyScreenPayload = result.partyScreenPayload;
      partyRuntimeState = result.partyRuntimeState;
      await saveWorldState(path, world);
      console.log(`\n${result.text}`);
    }
  } finally {
    rl.close();
    await saveWorldState(path, world);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
