import { createGameCompositionRoot } from './root.js';
import { createNewGameWorkflowAdapter, createTurnWorkflowAdapter } from '../adapters/workflows.js';
import { createPostgresPools, probePostgresPool } from '../infrastructure/postgres/pools.js';
import { runPartyRuntimeMigrations } from '../infrastructure/postgres/migrations.js';
import { createPostgresSessionStore, createPostgresDeliveryStore } from '../infrastructure/postgres/session-store.js';
import { createPostgresWorldBaseReader } from '../infrastructure/postgres/world-base.js';
import { createPostgresStage25Ports } from '../infrastructure/postgres/stage25.js';
import { createProductionLlmRoleRunner, probeLlmProvider } from '../infrastructure/provider/deepseek.js';
import { loadRuntimeBindings } from '../runtime/load-bindings.js';

export async function createProductionCompositionRoot({ env = process.env, config = {}, PoolClass, now } = {}) {
  const pools = createPostgresPools({ env, PoolClass });
  try {
    if (config.runMigrations !== false) await runPartyRuntimeMigrations(pools.partyPool);
    const worldBase = createPostgresWorldBaseReader({ pool: pools.worldPool });
    const llmRoleRunner = createProductionLlmRoleRunner({ env, telemetry: config.telemetry ?? null });
    const basePorts = Object.freeze({ worldBase, llmRoleRunner, worldPool: pools.worldPool, partyPool: pools.partyPool });
    const bindings = await loadRuntimeBindings(config.runtimeBindingsModule ?? env.RUS_RUNTIME_BINDINGS_MODULE, { env, config, ports: basePorts });
    const stage25 = createPostgresStage25Ports({ pool: pools.partyPool, postcommitProjector: bindings.stage25PostcommitProjector });
    const ports = Object.freeze({ ...basePorts, stage25 });
    const newGameWorkflow = createNewGameWorkflowAdapter({
      ...(bindings.newGameRunner ? { runner: bindings.newGameRunner } : {}),
      optionsFactory: (input) => bindings.newGameOptionsFactory(input, ports),
      onResult: async (pipeline) => {
        const committed = pipeline?.checkpoint?.outputs?.['25'] ?? pipeline?.checkpoint?.outputs?.[25] ?? null;
        if (committed?.pass === true) await stage25.recordCommittedResult(committed);
      }
    });
    const turnWorkflow = createTurnWorkflowAdapter({
      ...(bindings.turnRunner ? { runner: bindings.turnRunner } : {}),
      servicesFactory: (input) => bindings.turnServicesFactory(input, ports),
      optionsFactory: bindings.turnOptionsFactory ? (input) => bindings.turnOptionsFactory(input, ports) : null
    });
    const root = createGameCompositionRoot({
      newGameWorkflow,
      turnWorkflow,
      sessionStore: createPostgresSessionStore({ pool: pools.partyPool }),
      deliveryStore: createPostgresDeliveryStore({ pool: pools.partyPool }),
      now
    });
    const startup = {
      world_database: await probePostgresPool(pools.worldPool, 'world_base'),
      party_database: await probePostgresPool(pools.partyPool, 'party_runtime')
    };
    if (config.probeProvider === true) startup.provider = await probeLlmProvider(llmRoleRunner);
    return Object.freeze({
      ...root,
      health: () => Object.freeze({ ...root.health(), composition: 'production', dependencies: structuredClone(startup) }),
      close: () => pools.close()
    });
  } catch (error) {
    await pools.close().catch(() => {});
    throw error;
  }
}

export default createProductionCompositionRoot;
