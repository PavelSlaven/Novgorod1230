import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { readServerConfig, assertModularStartupConfig } from './config.js';
import { createStaticAssetResolver } from './http/static-assets.js';
import { createGameHttpServer, listen } from './http/server.js';
import { loadConfiguredComposition } from './runtime/load-composition.js';
import { createProductionLlmRoleRunner } from './infrastructure/provider/deepseek.js';
import { createPortraitSpecNormalizer } from './portrait-lab/normalizer.js';

const config = assertModularStartupConfig(readServerConfig());
const root = await loadConfiguredComposition(config.compositionModule, { env: process.env, config });
const here = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(here, '../../game-web');
const contractsRoot = resolve(here, '../../../packages/contracts/src');
const server = createGameHttpServer({
  root,
  staticAssets: createStaticAssetResolver({ webRoot, contractsRoot }),
  portraitNormalizer: createPortraitSpecNormalizer({
    roleRunner: createProductionLlmRoleRunner({ env: process.env })
  }),
  maxBodyBytes: config.maxBodyBytes,
  developerMode: config.developerMode
});
const address = await listen(server, config);
console.log(`@rus/game-server modular HTTP listening on http://${config.host}:${address.port}`);
