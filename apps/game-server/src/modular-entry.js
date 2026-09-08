import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { readServerConfig, assertModularStartupConfig } from './config.js';
import { createStaticAssetResolver } from './http/static-assets.js';
import { createGameHttpServer, listen } from './http/server.js';
import { loadConfiguredComposition } from './runtime/load-composition.js';
import { createProductionLlmRoleRunner } from './infrastructure/provider/deepseek.js';
import { createPortraitSpecNormalizer } from './portrait-lab/normalizer.js';
import { createLlmSettingsOwner } from './runtime/llm-settings.js';
import { createLlmDiagnostics } from './runtime/llm-diagnostics.js';
import { createLlmTurnBudget } from './runtime/llm-turn-budget.js';
import { createOrdinaryMaterializationStageBQualifier } from './runtime/ordinary-materialization-stage-b-qualification.js';
import { loadLowerDvinaTraceOrdinaryMaterializationProfile } from './internal/lower-dvina-trace-ordinary-materialization-profile.js';
import { createPartyLog, createPartyLoggingRoot } from './infrastructure/filesystem/party-log.js';
import { createLlmSettingsFileStore } from
  './infrastructure/filesystem/llm-settings-file.js';

const here = dirname(fileURLToPath(import.meta.url));
const config = assertModularStartupConfig(readServerConfig());
const ordinaryProfile = await loadLowerDvinaTraceOrdinaryMaterializationProfile();
const qualificationRunner = createProductionLlmRoleRunner({ env: process.env });
const llmSettingsStore = createLlmSettingsFileStore({
  ...(config.llmSettingsPath ? { filePath: config.llmSettingsPath } : {})
});
const llmSettings = createLlmSettingsOwner({
  initialRecord: await llmSettingsStore.load(),
  persistSettings: (record) => llmSettingsStore.save(record),
  runtimeStatus: parseLocalRuntimeStatus(process.env.RUS_LOCAL_LLM_RUNTIME_STATUS),
  probeCustom: (candidate) => qualificationRunner.probe(candidate),
  qualifyCustom: createOrdinaryMaterializationStageBQualifier({
    roleRunner: qualificationRunner,
    evalContract: ordinaryProfile.stage_b_classification_eval
  })
});
const llmTurnBudget = createLlmTurnBudget();
const llmDiagnostics = createLlmDiagnostics({ turnBudget: llmTurnBudget,
  developerMode: config.developerMode });
const runtimeConfig = { ...config, llmSettings, llmDiagnostics, llmTurnBudget };
const productionRoot = await loadConfiguredComposition(config.compositionModule, { env: process.env, config: runtimeConfig });
const publicRoot = Object.freeze({
  ...productionRoot,
  getLlmSettings: () => llmSettings.read(),
  applyLlmSettings: (input) => llmSettings.apply(input),
  probeLlmSettings: (candidate) => llmSettings.probe(candidate),
  getLlmTurnReport: (input) => llmDiagnostics.report(input)
});
const root = createPartyLoggingRoot({
  root: publicRoot,
  partyLog: createPartyLog({
    directory: config.logDirectory || resolve(here, '../../../logs')
  }),
  llmDiagnostics,
  metadata: Object.freeze({
    server: productionRoot.health(),
    process: { node: process.version, platform: process.platform, pid: process.pid }
  })
});
const webRoot = resolve(here, '../../game-web');
const contractsRoot = resolve(here, '../../../packages/contracts/src');
const server = createGameHttpServer({
  root,
  staticAssets: createStaticAssetResolver({ webRoot, contractsRoot }),
  portraitNormalizer: createPortraitSpecNormalizer({
    roleRunner: createProductionLlmRoleRunner({ env: process.env, settings: llmSettings })
  }),
  maxBodyBytes: config.maxBodyBytes,
  developerMode: runtimeConfig.developerMode
});
const address = await listen(server, config);
console.log(`@rus/game-server modular HTTP listening on http://${config.host}:${address.port}`);

let closing = false;
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => {
  if (closing) return; closing = true;
  await new Promise((resolve) => server.close(resolve));
  await root.close();
  process.exit(0);
});

function parseLocalRuntimeStatus(raw) {
  if (!String(raw ?? '').trim()) return null;
  try {
    const value = JSON.parse(raw);
    return value && typeof value === 'object' && !Array.isArray(value)
      ? Object.freeze(value) : null;
  } catch { return null; }
}
