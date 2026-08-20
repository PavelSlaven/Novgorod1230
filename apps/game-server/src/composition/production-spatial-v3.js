import { createSpatialV3ProductionComposition } from '@rus/turn/spatial-v3-target-composition';
import { createSpatialV3PostgresCombinedAtomicCommitter } from '../infrastructure/postgres/spatial-v3-combined-atomic-committer.js';
import { createOrdinaryMaterializationFirstEntryProvisioner } from '../infrastructure/postgres/ordinary-materialization-first-entry-provisioning.js';
import { loadLowerDvinaTraceOrdinaryMaterializationProfile } from '../internal/lower-dvina-trace-ordinary-materialization-profile.js';
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
export const SPATIAL_V3_PRODUCTION_RELEASE_ID = 'spatial-v3-production-v9';
export const SPATIAL_V3_PRODUCTION_RELEASE = Object.freeze({
  release_id: SPATIAL_V3_PRODUCTION_RELEASE_ID,
  composition_id: 'builtin:production-spatial-v3',
  contract_version: '4.7.0-character-appearance.1',
  temporal_contract_id: 'temporal-world-v1.1',
  party_schema_version: 'party_runtime_v3_first_playable',
  world_revision_id:
    'novgorod_spatial_v3_production_v4_candidate_001',
  world_catalog_digest:
    'acbcbba0ceae0b894e879aff097ed077a9b96e0d6d466c98d0d768ac6d3daf79',
  world_catalog_manifest_sha256:
    '64511daaf22c234c1c8568c2674f162a23b3b4924e52135a45b05f698f8380cb',
  dependency_pin_mode: 'exact_only',
  runtime_catalog_pin_schema: 'rus.runtime_catalog_pin.v2',
  runtime_catalog_scope: 'item_container_materialization_v2',
  runtime_catalog_resolution:
    'active_for_new_party_persisted_for_existing_party',
  runtime_catalog_contract_digest:
    '60c3a601bcb561c39017fed915cb9b9cdaa779115f4f0f2c0175db3eda64a0c7',
  party_runtime_catalog_migration_id:
    'party_runtime_catalog_pins_v2',
  party_runtime_catalog_migration_digest:
    '9f574d2782cdbaeeba190d8237fe38c26bddd65775f060749079d3d0163ef32d',
  party_runtime_catalog_target_fingerprint:
    '47cb21b39db8be7336d10533ed319fe314f5bda65d850f1297c8321de6c9d165',
  target_migration_count: SPATIAL_V3_TARGET_MIGRATIONS.length,
  target_migration_chain_digest:
    SPATIAL_V3_TARGET_MIGRATION_CHAIN_DIGEST,
  authoritative_reads: 'spatial_v3_only',
  authoritative_writes: 'spatial_v3_only',
  rollback_source_release_id: 'spatial-v3-production-v8',
  rollback_runtime_selectable: false,
  parent_release_exact_pins: Object.freeze({
    world_revision_id:
      'novgorod_spatial_v3_production_v3_candidate_001',
    world_catalog_digest:
      '1cf914ed9a19801f94b8b1463a717dbb0be7f1d51ea2351e6d1d5a51c492215e',
    world_catalog_manifest_sha256:
      '593ccb341084f7433ec4ae9d7d0b2ea8b1dea07833636ef385550ba5a295ecea'
  }),
  boundary_crossing_capability: 'ready_for_runtime_acceptance',
  npc_conversation_capability: 'ready_for_runtime_acceptance',
  npc_autonomous_capability: 'ready_for_runtime_acceptance', npc_combat_capability: 'ready_for_runtime_acceptance',
  release_status: 'validated_candidate_not_active',
  production_activation: false,
  runtime_selectable_in_canonical_production: false,
  scenario_binding_id: 'lower_dvina_late_summer_open_water_v1'
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
          resolveSpatialV3ProductionBindingsModule(config, env),
          bindingContext
        );
    const ordinaryProfile = await loadLowerDvinaTraceOrdinaryMaterializationProfile({ rootDir: config.rootDir ?? process.cwd() });
    const committer = createSpatialV3PostgresCombinedAtomicCommitter({ pool: pools.partyPool, recheck: bindings.commitRecheck, ordinaryFirstEntryProvisioner: createOrdinaryMaterializationFirstEntryProvisioner({ profile: ordinaryProfile }), now });
    const target = targetRootFactory({
      ...bindings.targetCompositionPorts,
      committer
    });
    const activatedRelease = deriveActivatedReleaseFromReadback(
      release,
      bindings.runtimeCatalogPin
    );
    const publicRuntime = await bindings.createPublicRuntimeFacade({
      technicalCore: target,
      committer,
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
      'getPartyScreen'
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
