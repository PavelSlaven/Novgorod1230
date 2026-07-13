import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { resolve } from 'node:path';
import { createFreshWorld } from './world/new-game.js';
import { createWorldState } from './world/state.js';
import { loadWorldState, saveWorldState } from './world/persistence.js';
import { handlePlayerInput, renderOpeningScene } from './world/engine.js';
import { loadLocalEnv } from './env.js';

const savePath = process.env.SAVE_PATH
  ? resolve(process.cwd(), process.env.SAVE_PATH)
  : resolve(process.cwd(), 'data', 'save.json');

async function main() {
  await loadLocalEnv();
  const path = savePath;
  const seed = createWorldState({ startText: process.env.START_TEXT });
  let world = await loadWorldState(path, seed);

  if (!world) {
    const created = await createFreshWorld({
      startText: process.env.START_TEXT,
      playerName: process.env.PLAYER_NAME ?? '',
      savePath: path,
      env: process.env
    });
    world = created.world;
  }

  if (!world.lastNarratorProse) {
    world.lastNarratorProse = renderOpeningScene(world);
  }

  console.log(world.lastNarratorProse);

  const rl = readline.createInterface({ input, output });
  try {
    for await (const line of rl) {
      const text = line.trim();
      if (!text) continue;
      if (['quit', 'exit', 'выход'].includes(text.toLowerCase())) break;

      const result = await handlePlayerInput(world, text);
      world = result.world;
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
