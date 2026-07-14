import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { readServerConfig, assertModularStartupConfig } from './config.js';
import { createStaticAssetResolver } from './http/static-assets.js';
import { createGameHttpServer, listen } from './http/server.js';
import { loadConfiguredComposition } from './runtime/load-composition.js';

const config = assertModularStartupConfig(readServerConfig());
const root = await loadConfiguredComposition(config.compositionModule, { env: process.env, config });
const here = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(here, '../../game-web');
const server = createGameHttpServer({
  root,
  staticAssets: createStaticAssetResolver({ webRoot }),
  maxBodyBytes: config.maxBodyBytes,
  developerMode: config.developerMode
});
const address = await listen(server, config);
console.log(`@rus/game-server modular HTTP listening on http://${config.host}:${address.port}`);
