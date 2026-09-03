import { createSpatialV3ProductionComposition } from '@rus/turn/spatial-v3-target-composition';
import { createSpatialV3PostgresCombinedAtomicCommitter } from '../infrastructure/postgres/spatial-v3-combined-atomic-committer.js';
import { createOrdinaryMaterializationFirstEntryProvisioner } from '../infrastructure/postgres/ordinary-materialization-first-entry-provisioning.js';
import { loadLowerDvinaTraceScenePresentation } from
  '../internal/lower-dvina-trace-scene-presentation.js';
import { ordinaryBackgroundSeedForLocation } from
  '../runtime/lower-dvina-trace-scene-presentation.js';
import { createSpatialSemanticFirstEntryProvisioner } from '../infrastructure/postgres/spatial-semantic-first-entry-provisioning.js';
import { loadLowerDvinaTraceProductionMaterializationProfiles } from '../internal/lower-dvina-trace-production-materialization-profiles.js';
import { loadLowerDvinaTraceSpatialSemanticProfile } from '../internal/lower-dvina-trace-spatial-semantic-profile.js';
import { loadLowerDvinaTraceN1Profile } from
  '../internal/lower-dvina-trace-n1-profile.js';
import {
  SPATIAL_V3_TARGET_MIGRATIONS,
  SPATIAL_V3_TARGET_MIGRATION_CHAIN_DIGEST,
  runSpatialV3TargetMigrations
} from '../infrastructure/postgres/spatial-v3-target-migrations.js';
import { createSpatialV3WorldBaseReader } from '../infrastructure/postgres/spatial-v3-world-base-reader.js';
import {
  assertPartyReleaseReadiness,
  assertWorldReleaseReadiness,
  withRuntimeCatalogActivationLock
} from '../infrastructure/postgres/spatial-v3-production-readiness.js';
import { createPostgresPools, probePostgresPool } from '../infrastructure/postgres/pools.js';
import {
  loadSpatialV3RuntimeBindings, resolveSpatialV3ProductionBindingsModule,
  validateSpatialV3RuntimeBindings
} from '../runtime/load-spatial-v3-bindings.js';
import { serverError } from '../errors.js';
import { deriveActivatedReleaseFromReadback } from './production-v2-activation-state.js'; export { deriveActivatedReleaseFromReadback };
import {
  SPATIAL_V3_PRODUCTION_RELEASE_ID,
  SPATIAL_V3_PRODUCTION_RELEASE,
  createSpatialV3ProductionRelease
} from './production-spatial-v3-release.js';
export {
  SPATIAL_V3_PRODUCTION_RELEASE_ID,
  SPATIAL_V3_PRODUCTION_RELEASE,
  createSpatialV3ProductionRelease
} from './production-spatial-v3-release.js';
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
    const startup = { world_database: await probePostgresPool(pools.worldPool, 'world_base'), party_database: await probePostgresPool(pools.partyPool, 'party_runtime') };
    const worldBase = createSpatialV3WorldBaseReader({query:(sql, params) => pools.worldPool.query(sql, params)});
    const [profiles, spatialSemanticProfile, scenePresentation,
      npcSemanticRemainderProfile] = await Promise.all([
      loadLowerDvinaTraceProductionMaterializationProfiles({ rootDir: config.rootDir ?? process.cwd() }),
      loadLowerDvinaTraceSpatialSemanticProfile({ rootDir: config.rootDir ?? process.cwd() }),
      loadLowerDvinaTraceScenePresentation({
        rootDir: config.rootDir ?? process.cwd(),
        scenarioDefinitionRevision: 32
      }),
      loadLowerDvinaTraceN1Profile({
        rootDir: config.rootDir ?? process.cwd()
      })
    ]);
    const bindingContext = Object.freeze({ env, config,
      ordinaryMaterializationProfile:profiles.ordinaryMaterializationProfile,
      ordinaryContainerContentsProfile:profiles.ordinaryContainerContentsProfile,
      actionProductionProfile:profiles.actionProductionProfile, localFireProfile:profiles.localFireProfile,
      spatialSemanticProfile,
      npcSemanticRemainderProfile,
      ports: Object.freeze({ partyPool: pools.partyPool, worldPool: pools.worldPool, worldBase }),
      release
    });
    const bindings = bindingsFactory
      ? validateSpatialV3RuntimeBindings(
          await bindingsFactory(bindingContext),
          release
        )
      : await loadSpatialV3RuntimeBindings(
          resolveSpatialV3ProductionBindingsModule(config, env),
          bindingContext
        );
    const ordinaryFirstEntryProvisioner = createOrdinaryMaterializationFirstEntryProvisioner({
      profile: profiles.ordinaryMaterializationProfile,
      ordinaryContainerContentsProfile: profiles.ordinaryContainerContentsProfile
    });
    const initialOrdinaryProvisioner =
      createOrdinaryMaterializationFirstEntryProvisioner({
        profile: profiles.ordinaryMaterializationProfile,
        includeContextBoundCapabilities: false,
        initialSceneSeed: ordinaryBackgroundSeedForLocation({ scenePresentation,
          locationRef: profiles.ordinaryMaterializationProfile
            .o2a_ambient.scope_binding.position_ref })
      });
    const spatialSemanticFirstEntryProvisioner = createSpatialSemanticFirstEntryProvisioner({ loadedProfile: spatialSemanticProfile });
    const committer = createSpatialV3PostgresCombinedAtomicCommitter({
      pool: pools.partyPool, recheck: bindings.commitRecheck,
      ordinaryFirstEntryProvisioner: { async provision(input) { await ordinaryFirstEntryProvisioner.provision(input); return spatialSemanticFirstEntryProvisioner.provision(input); } }, now });
    const target = targetRootFactory({ ...bindings.targetCompositionPorts, committer });
    const activatedRelease = deriveActivatedReleaseFromReadback(
      release,
      bindings.runtimeCatalogPin
    );
    const publicRuntime = await bindings.createPublicRuntimeFacade({
      technicalCore: target,
      committer,
      initialOrdinaryProvisioner,
      partyPool: pools.partyPool,
      worldPool: pools.worldPool,
      release: activatedRelease,
      runtimeCatalogPin: bindings.runtimeCatalogPin
    });
    for (const method of [
      'listScenarios',
      'startNewGame',
      'acknowledgeOpening',
      'submitTurn',
      'getPartyScreen',
      'recoverPendingPresentation'
    ]) {
      if (typeof publicRuntime?.[method] !== 'function') {
        throw serverError(
          'RUNTIME_PUBLIC_FACADE_INVALID',
          `Release-pinned public runtime facade is missing ${method}().`
        );
      }
    }
    const migration = await withRuntimeCatalogActivationLock(
      pools.worldPool,
      (worldClient) => runSpatialV3TargetMigrations(
        pools.partyPool,
        {
          exactAppliedMigration: {
            migration_id:
              release.party_runtime_catalog_migration_id,
            migration_digest:
              release.party_runtime_catalog_migration_digest,
            target_schema_fingerprint:
              release.party_runtime_catalog_target_fingerprint
          },
          beforeCommit: async (partyClient) => {
            const partyReadiness = await assertPartyReleaseReadiness(
              partyClient,
              release
            );
            const worldReadiness = await assertWorldReleaseReadiness(
              worldClient,
              bindings.runtimeCatalogPin,
              activatedRelease,
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
      ...publicRuntime,
      status: 'production_sole_owner',
      health: () => Object.freeze({
        status: 'ok',
        composition: 'spatial_v3_production',
        activation: 'sole_owner',
        release_id: SPATIAL_V3_PRODUCTION_RELEASE_ID,
        release_status: activatedRelease.release_status,
        production_activation: activatedRelease.production_activation,
        runtime_selectable_in_canonical_production:
          activatedRelease.runtime_selectable_in_canonical_production,
        authoritative_reads: 'spatial_v3_only',
        authoritative_writes: 'spatial_v3_only',
        runtime_fallback: 'forbidden',
        npc_conversation_capability: SPATIAL_V3_PRODUCTION_RELEASE.npc_conversation_capability,
        npc_autonomous_capability: SPATIAL_V3_PRODUCTION_RELEASE.npc_autonomous_capability,
        npc_combat_capability: SPATIAL_V3_PRODUCTION_RELEASE.npc_combat_capability,
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
        party_schema_version: release.party_schema_version,
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
