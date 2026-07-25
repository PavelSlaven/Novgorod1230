import {
  createSpatialV3TargetShadowCompositionRoot
} from './spatial-v3-target-shadow.js';
import {
  createSpatialV3PostgresCombinedAtomicCommitter
} from '../infrastructure/postgres/spatial-v3-combined-atomic-committer.js';
import {
  runSpatialV3TargetMigrations
} from '../infrastructure/postgres/spatial-v3-target-migrations.js';
import {
  createSpatialV3WorldBaseReader
} from '../infrastructure/postgres/spatial-v3-world-base-reader.js';
import {
  createPostgresPools,
  probePostgresPool
} from '../infrastructure/postgres/pools.js';
import {
  loadSpatialV3RuntimeBindings,
  validateSpatialV3RuntimeBindings
} from '../runtime/load-spatial-v3-bindings.js';

export const SPATIAL_V3_PRODUCTION_RELEASE_ID =
  'spatial-v3-production-v1';

/**
 * Sole-owner production-v3 root. It has no production-v2 composition import,
 * never runs the v2-only migration loader and admits no fallback bindings.
 */
export async function createSpatialV3ProductionCompositionRoot({
  env = process.env,
  config = {},
  PoolClass,
  now,
  pools: suppliedPools = null,
  bindingsFactory = null,
  targetRootFactory = createSpatialV3TargetShadowCompositionRoot
} = {}) {
  const pools = suppliedPools ?? createPostgresPools({ env, PoolClass });
  try {
    const migration = config.runMigrations === false
      ? Object.freeze({
          applied: 0,
          schema: 'party_runtime',
          schema_version: 'party_runtime_v3_target'
        })
      : await runSpatialV3TargetMigrations(pools.partyPool);
    const worldBase = createSpatialV3WorldBaseReader({
      query: (sql, params) => pools.worldPool.query(sql, params)
    });
    const bindingContext = Object.freeze({
      env,
      config,
      ports: Object.freeze({
        partyPool: pools.partyPool,
        worldPool: pools.worldPool,
        worldBase
      }),
      release: Object.freeze({
        release_id: SPATIAL_V3_PRODUCTION_RELEASE_ID,
        contract_version: '4.4.0-target.1',
        party_schema_version: 'party_runtime_v3_target',
        migration_count: migration.applied
      })
    });
    const bindings = bindingsFactory
      ? validateSpatialV3RuntimeBindings(await bindingsFactory(bindingContext))
      : await loadSpatialV3RuntimeBindings(
          config.spatialV3BindingsModule
            ?? env.RUS_SPATIAL_V3_BINDINGS_MODULE,
          bindingContext
        );
    const committer = createSpatialV3PostgresCombinedAtomicCommitter({
      pool: pools.partyPool,
      recheck: bindings.commitRecheck,
      now
    });
    const target = targetRootFactory({
      ...bindings.targetCompositionPorts,
      committer
    });
    const startup = {
      world_database:
        await probePostgresPool(pools.worldPool, 'world_base'),
      party_database:
        await probePostgresPool(pools.partyPool, 'party_runtime')
    };
    return Object.freeze({
      ...target,
      status: 'production_sole_owner',
      acknowledgeOpening: bindings.acknowledgeOpening,
      getPartyScreen: bindings.getPartyScreen,
      health: () => Object.freeze({
        status: 'ok',
        composition: 'spatial_v3_production',
        activation: 'sole_owner',
        release_id: SPATIAL_V3_PRODUCTION_RELEASE_ID,
        authoritative_reads: 'spatial_v3_only',
        authoritative_writes: 'spatial_v3_only',
        runtime_fallback: 'forbidden',
        party_schema_version: 'party_runtime_v3_target',
        migration_count: migration.applied,
        dependencies: structuredClone(startup)
      }),
      close: () => pools.close()
    });
  } catch (error) {
    await pools.close().catch(() => {});
    throw error;
  }
}

export default createSpatialV3ProductionCompositionRoot;
