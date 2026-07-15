import { resolve } from 'node:path';
import { createFileSystemKnowledgeSourceStorage, createKnowledgeSourceReader } from '@rus/knowledge-source';
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
    const knowledgeSource = createKnowledgeSourceReader({
      storage: createFileSystemKnowledgeSourceStorage({
        sourceRoot: resolve(config.knowledgeSourceRoot ?? env.RUS_KNOWLEDGE_SOURCE_ROOT ?? 'data/knowledge-source'),
        generatedRoot: resolve(config.generatedKnowledgeRoot ?? env.RUS_GENERATED_KNOWLEDGE_ROOT ?? 'generated/knowledge-source')
      })
    });
    const corpusStatus = await knowledgeSource.verifyCorpus();
    if (!corpusStatus.ok) throw new Error(`Knowledge source verification failed: ${corpusStatus.errors.map((item) => item.message).join('; ')}`);
    const generatedStatus = await knowledgeSource.getGeneratedIndexStatus();
    if (generatedStatus.graph.status !== 'current' || generatedStatus.rag.status !== 'current') {
      throw new Error(`Knowledge source generated artifacts are not current: graph=${generatedStatus.graph.status}, rag=${generatedStatus.rag.status}`);
    }
    const basePorts = Object.freeze({ knowledgeSource, worldBase, llmRoleRunner, worldPool: pools.worldPool, partyPool: pools.partyPool });
    const bindings = await loadRuntimeBindings(config.runtimeBindingsModule ?? env.RUS_RUNTIME_BINDINGS_MODULE, { env, config, ports: basePorts });
    const stage25 = createPostgresStage25Ports({ pool: pools.partyPool, postcommitProjector: bindings.stage25PostcommitProjector });
    const ports = Object.freeze({ ...basePorts, stage25, travel: bindings.travelPorts });
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
