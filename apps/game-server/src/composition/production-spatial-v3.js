import {
  createSpatialV3ProductionComposition
} from '@rus/turn/spatial-v3-target-composition';
import {
  createSpatialV3PostgresCombinedAtomicCommitter
} from '../infrastructure/postgres/spatial-v3-combined-atomic-committer.js';
import {
  SPATIAL_V3_TARGET_MIGRATIONS,
  SPATIAL_V3_TARGET_MIGRATION_CHAIN_DIGEST,
  runSpatialV3TargetMigrations
} from '../infrastructure/postgres/spatial-v3-target-migrations.js';
import {
  createSpatialV3WorldBaseReader
} from '../infrastructure/postgres/spatial-v3-world-base-reader.js';
import {
  assertPartyReleaseReadiness,
  assertWorldReleaseReadiness,
  withRuntimeCatalogActivationLock
} from '../infrastructure/postgres/spatial-v3-production-readiness.js';
import {
  createPostgresPools,
  probePostgresPool
} from '../infrastructure/postgres/pools.js';
import {
  loadSpatialV3RuntimeBindings,
  validateSpatialV3RuntimeBindings
} from '../runtime/load-spatial-v3-bindings.js';
import { serverError } from '../errors.js';

export const SPATIAL_V3_PRODUCTION_RELEASE_ID =
  'spatial-v3-production-v1';
export const SPATIAL_V3_PRODUCTION_RELEASE = Object.freeze({
  release_id: SPATIAL_V3_PRODUCTION_RELEASE_ID,
  composition_id: 'builtin:production-spatial-v3',
  contract_version: '4.4.0-target.1',
  temporal_contract_id: 'temporal-world-v1.1',
  party_schema_version: 'party_runtime_v3_target',
  world_revision_id:
    'novgorod_spatial_v3_target_contract_approval_001',
  world_catalog_digest:
    '0ed3a9388930b0245fecdf6ec8adfa08d74d5fe88d5458bd452bee20de16fb1e',
  world_catalog_manifest_sha256:
    '4056b93acc2a3c7ed4c76c18182d74b7ef5b9f5fc9c31f206670f11a6283192e',
  dependency_pin_mode: 'exact_only',
  runtime_catalog_pin_schema: 'rus.runtime_catalog_pin.v2',
  runtime_catalog_scope: 'item_container_materialization_v2',
  runtime_catalog_resolution:
    'active_for_new_party_persisted_for_existing_party',
  party_runtime_catalog_migration_id:
    'party_runtime_catalog_pins_v1',
  party_runtime_catalog_migration_digest:
    'f251623759b60799ea75b17b7234833a092b97a5443b8b831643c0544ef25a31',
  party_runtime_catalog_target_fingerprint:
    '329a84c3c5ccd76e4a84b67454bcbd6e6c176fafbd285e77d44824dddcd8d2dd',
  target_migration_count: 10,
  target_migration_chain_digest:
    'a71b95540c6422ccee5b3d598cb6b0cefe108de3bf41216dea96a99068a5a370',
  authoritative_reads: 'spatial_v3_only',
  authoritative_writes: 'spatial_v3_only',
  rollback_source_release_id: 'production-v2',
  rollback_runtime_selectable: false
});

export function createSpatialV3ProductionRelease(
  compatibleWorldPinManifestDigest
) {
  const digest = String(compatibleWorldPinManifestDigest ?? '')
    .trim()
    .toLowerCase();
  if (!/^[a-f0-9]{64}$/u.test(digest)) {
    throw serverError(
      'RUNTIME_CATALOG_PIN_MANIFEST_DIGEST_REQUIRED',
      'Spatial-v3 production requires one exact compatible-world pin manifest digest.'
    );
  }
  return Object.freeze({
    ...SPATIAL_V3_PRODUCTION_RELEASE,
    compatible_world_pin_manifest_digest: digest
  });
}

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
  targetRootFactory = createSpatialV3ProductionComposition
} = {}) {
  const pools = suppliedPools ?? createPostgresPools({ env, PoolClass });
  try {
    const release = createSpatialV3ProductionRelease(
      config.runtimeCatalogPinManifestDigest
        ?? env.RUS_SPATIAL_V3_RUNTIME_CATALOG_PIN_MANIFEST_DIGEST
    );
    if (SPATIAL_V3_TARGET_MIGRATIONS.length
        !== release.target_migration_count
      || SPATIAL_V3_TARGET_MIGRATION_CHAIN_DIGEST
        !== release.target_migration_chain_digest) {
      throw serverError(
        'SPATIAL_V3_MIGRATION_CHAIN_MISMATCH',
        'The complete exact spatial-v3 migration chain is required.'
      );
    }
    const startup = {
      world_database:
        await probePostgresPool(pools.worldPool, 'world_base'),
      party_database:
        await probePostgresPool(pools.partyPool, 'party_runtime')
    };
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
      release
    });
    const bindings = bindingsFactory
      ? validateSpatialV3RuntimeBindings(
          await bindingsFactory(bindingContext),
          release
        )
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
    const migration = await withRuntimeCatalogActivationLock(
      pools.worldPool,
      (worldClient) => runSpatialV3TargetMigrations(
        pools.partyPool,
        {
          beforeCommit: async (partyClient) => {
            const partyReadiness = await assertPartyReleaseReadiness(
              partyClient,
              release
            );
            const worldReadiness = await assertWorldReleaseReadiness(
              worldClient,
              bindings.runtimeCatalogPin,
              release,
              partyReadiness.historical_pins
            );
            return Object.freeze({
              party: partyReadiness,
              world: worldReadiness
            });
          }
        }
      )
    );
    const cutoverReadiness = migration.readiness;
    const partyReadiness = Object.freeze({
      party_count: cutoverReadiness.party.party_count,
      incompatible_party_count:
        cutoverReadiness.party.incompatible_party_count,
      historical_pin_count:
        cutoverReadiness.party.historical_pin_count,
      status: cutoverReadiness.party.status
    });
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
        rollback_source_release_id:
          SPATIAL_V3_PRODUCTION_RELEASE.rollback_source_release_id,
        rollback_runtime_selectable: false,
        temporal_contract_id:
          SPATIAL_V3_PRODUCTION_RELEASE.temporal_contract_id,
        world_revision_id:
          SPATIAL_V3_PRODUCTION_RELEASE.world_revision_id,
        world_catalog_digest:
          SPATIAL_V3_PRODUCTION_RELEASE.world_catalog_digest,
        world_catalog_manifest_sha256:
          SPATIAL_V3_PRODUCTION_RELEASE.world_catalog_manifest_sha256,
        dependency_pin_mode:
          SPATIAL_V3_PRODUCTION_RELEASE.dependency_pin_mode,
        runtime_catalog_pin_schema:
          SPATIAL_V3_PRODUCTION_RELEASE.runtime_catalog_pin_schema,
        runtime_catalog_scope:
          SPATIAL_V3_PRODUCTION_RELEASE.runtime_catalog_scope,
        runtime_catalog_resolution:
          SPATIAL_V3_PRODUCTION_RELEASE.runtime_catalog_resolution,
        compatible_world_pin_manifest_digest:
          release.compatible_world_pin_manifest_digest,
        runtime_catalog_pin:
          structuredClone(bindings.runtimeCatalogPin),
        party_schema_version: 'party_runtime_v3_target',
        migration_count: migration.applied,
        migration_chain_digest: migration.chain_digest,
        world_readiness: cutoverReadiness.world,
        migration_readiness: Object.freeze(partyReadiness),
        dependencies: structuredClone(startup)
      }),
      close: () => pools.close()
    });
  } catch (error) {
    await pools.close().catch(() => {});
    throw error;
  }
}

export async function assertSpatialV3WorldReleaseReadiness(
  worldPool,
  runtimeCatalogPin,
  historicalPins = []
) {
  return assertWorldReleaseReadiness(
    worldPool,
    runtimeCatalogPin,
    createSpatialV3ProductionRelease(
      runtimeCatalogPin.compatible_world_pin_manifest_digest
    ),
    historicalPins
  );
}

export async function assertSpatialV3ProductionReadiness(
  partyPool,
  runtimeCatalogPin
) {
  return assertPartyReleaseReadiness(
    partyPool,
    createSpatialV3ProductionRelease(
      runtimeCatalogPin.compatible_world_pin_manifest_digest
    )
  );
}

export default createSpatialV3ProductionCompositionRoot;
