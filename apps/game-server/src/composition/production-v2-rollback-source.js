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
import { createRuntimeCatalogCoordinator } from '../runtime/runtime-catalog.js';

/**
 * Explicit production-v2 rollback-source harness.
 *
 * This module is not registered by the production composition loader and is
 * retained only for migration/rollback verification.
 */
export async function createProductionV2RollbackSourceRoot({ env = process.env, config = {}, PoolClass, now } = {}) {
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
    const runtimeCatalog = createRuntimeCatalogCoordinator({
      worldBaseReader: worldBase,
      partyPool: pools.partyPool,
      supportedRuntimeContractDigests: config.supportedRuntimeContractDigests
    });
    const compositionPorts = Object.freeze({ ...basePorts, runtimeCatalog });
    const bindings = await loadRuntimeBindings(config.runtimeBindingsModule ?? env.RUS_RUNTIME_BINDINGS_MODULE, { env, config, ports: compositionPorts });
    const stage25 = createPostgresStage25Ports({ pool: pools.partyPool, postcommitProjector: bindings.stage25PostcommitProjector });
    const ports = Object.freeze({ ...compositionPorts, stage25 });
    const newGameWorkflow = createNewGameWorkflowAdapter({
      ...(bindings.newGameRunner ? { runner: bindings.newGameRunner } : {}),
      optionsFactory: async (input) => {
        const options = await bindings.newGameOptionsFactory(input, ports);
        if (config.requireRuntimeCatalog === false) return options;
        const runtimeCatalogContext = await prepareNewGameRuntimeCatalog({
          runtimeCatalog,
          options
        });
        return {
          ...options,
          requireRuntimeCatalog: true,
          runtimeCatalogContext
        };
      },
      onResult: async (pipeline) => {
        const committed = pipeline?.checkpoint?.outputs?.['25'] ?? pipeline?.checkpoint?.outputs?.[25] ?? null;
        if (committed?.pass === true) await stage25.recordCommittedResult(committed);
      }
    });
    const turnWorkflow = createTurnWorkflowAdapter({
      ...(bindings.turnRunner ? { runner: bindings.turnRunner } : {}),
      servicesFactory: async (input) => {
        const services = await bindings.turnServicesFactory(input, ports);
        if (config.requireRuntimeCatalog === false) return services;
        const runtimeCatalogContext = await runtimeCatalog.loadPartyContext({
          partyId: input.party_id,
          regionId: input.region_id ?? null,
          effectiveDate: input.effective_date ?? null
        });
        return Object.freeze({ ...services, runtimeCatalogContext });
      },
      optionsFactory: bindings.turnOptionsFactory ? (input) => bindings.turnOptionsFactory(input, ports) : null
    });
    const root = createGameCompositionRoot({
      newGameWorkflow,
      turnWorkflow,
      sessionStore: createPostgresSessionStore({
        pool: pools.partyPool,
        verifyPartyCatalogPin: config.requireRuntimeCatalog === false
          ? null
          : (partyId) => runtimeCatalog.loadPartyContext({ partyId })
      }),
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

export default createProductionV2RollbackSourceRoot;

async function prepareNewGameRuntimeCatalog({ runtimeCatalog, options }) {
  const checkpointContext = options?.checkpoint?.runtime_catalog_context;
  if (checkpointContext) {
    return runtimeCatalog.restoreNewPartyContext({
      pin: checkpointContext.pin,
      worldPin: checkpointContext.world_pin,
      regionId: checkpointContext.selection?.region_id ?? null,
      effectiveDate: checkpointContext.selection?.effective_date ?? null
    });
  }
  const request = options?.runtimeCatalogRequest ?? options?.runtime_catalog_request;
  if (!request) {
    throw Object.assign(
      new Error('Production new-game options require runtimeCatalogRequest.'),
      { code: 'RUNTIME_CATALOG_REQUEST_MISSING' }
    );
  }
  return runtimeCatalog.prepareNewPartyContext({
    worldPin: request.worldPin ?? request.world_pin,
    regionId: request.regionId ?? request.region_id,
    effectiveDate: request.effectiveDate ?? request.effective_date
  });
}
