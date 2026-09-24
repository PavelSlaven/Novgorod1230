import { createSpatialV3ProductionComposition } from '@rus/turn/spatial-v3-target-composition';
import { createSpatialV3PostgresCombinedAtomicCommitter } from '../infrastructure/postgres/spatial-v3-combined-atomic-committer.js';
import { createOrdinaryMaterializationFirstEntryProvisioner, createTargetFiniteFirstEntryPorts } from '../infrastructure/postgres/ordinary-materialization-first-entry-provisioning.js';
import { loadLowerDvinaTraceScenePresentation } from
  '../internal/lower-dvina-trace-scene-presentation.js';
import { ordinaryBackgroundSeedForLocation } from
  '../runtime/lower-dvina-trace-scene-presentation.js';
import { createSpatialSemanticFirstEntryProvisioner } from '../infrastructure/postgres/spatial-semantic-first-entry-provisioning.js';
import { loadLowerDvinaTraceProductionMaterializationProfiles } from '../internal/lower-dvina-trace-production-materialization-profiles.js';
import { loadLowerDvinaTraceSpatialSemanticProfile } from '../internal/lower-dvina-trace-spatial-semantic-profile.js';
import { loadLowerDvinaTraceN1Profile } from
  '../internal/lower-dvina-trace-n1-profile.js';
import { loadProductionWorldKnowledge } from
  '../internal/world-knowledge-production.js';
import { loadLowerDvinaTraceMaterializationBundle } from
  '../internal/lower-dvina-trace-phase-1a-bundle.js';
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
  validateSpatialV3RuntimeBindings, SPATIAL_V3_TARGET_BINDINGS_MODULE
} from '../runtime/load-spatial-v3-bindings.js';
import { serverError } from '../errors.js';
import { deriveActivatedReleaseFromReadback } from './production-v2-activation-state.js'; export { deriveActivatedReleaseFromReadback };
import { loadSpatialV3TargetProductionRelease, loadTargetCatalogActivationApprovals } from './production-spatial-v3-release-v17.js';
import { loadTargetRuntimeProfiles } from '../internal/target-runtime-profiles.js';
import { createSpatialV3LocalSceneRuntime } from '../runtime/spatial-v3-local-scene-runtime.js';
import { createSpatialV3CurrentMovementCapability } from
  '../infrastructure/postgres/spatial-v3-current-movement-capability.js';
import { createSpatialV3CurrentVisibilityProvider } from
  '../infrastructure/postgres/spatial-v3-current-visibility-provider.js';
import { createSpatialV3ExpansionContextReader } from
  '../infrastructure/postgres/spatial-v3-expansion-context.js';
import { createSpatialV3ExpansionRuntime } from
  '../runtime/spatial-v3-expansion-runtime.js';
import { readCurrentNaturalSourceState } from
  '../infrastructure/postgres/g4-current-natural-source-state.js';
import { readCurrentTargetConditions, readCommittedEntityExterior, readPlayerKnowledge } from
  '../infrastructure/postgres/spatial-v3-current-visibility-inputs.js';
import { createTargetCurrentFactualContext } from
  '../infrastructure/postgres/target-current-factual-context.js';
import { createTargetAuthoredStartCatalog } from '../internal/target-authored-start-catalog.js';
import {
  SPATIAL_V3_PRODUCTION_RELEASE_ID,
  SPATIAL_V3_PRODUCTION_RELEASE,
  createSpatialV3ProductionRelease
} from './production-spatial-v3-release-v16.js';
export {
  SPATIAL_V3_PRODUCTION_RELEASE_ID,
  SPATIAL_V3_PRODUCTION_RELEASE,
  createSpatialV3ProductionRelease
} from './production-spatial-v3-release-v16.js';
export async function createSpatialV3ProductionCompositionRoot({
  env = process.env,
  config = {},
  PoolClass,
  now,
  pools: suppliedPools = null,
  bindingsFactory = null,
  worldKnowledgeEncoderFactory = undefined,
  targetRootFactory = createSpatialV3ProductionComposition
} = {}) {
  const pools = suppliedPools ?? createPostgresPools({ env, PoolClass });
  try {
    const selectedModule = resolveSpatialV3ProductionBindingsModule(config, env);
    const targetContext = selectedModule === SPATIAL_V3_TARGET_BINDINGS_MODULE
      ? await loadSpatialV3TargetProductionRelease({ worldPool: pools.worldPool,
          ...await loadTargetCatalogActivationApprovals({ config, env }), rootDir: config.rootDir ?? process.cwd() }) : null;
    const release = targetContext?.release ?? createSpatialV3ProductionRelease(
      config.runtimeCatalogPinManifestDigest
        ?? env.RUS_SPATIAL_V3_RUNTIME_CATALOG_PIN_MANIFEST_DIGEST
    );
    if (targetContext != null && (config.runtimeCatalogPinManifestDigest
        ?? env.RUS_SPATIAL_V3_RUNTIME_CATALOG_PIN_MANIFEST_DIGEST)
      !== release.compatible_world_pin_manifest_digest) {
      throw serverError('SPATIAL_V3_TARGET_RUNTIME_PIN_REQUIRED',
        'Configured compatibility digest must match the issued target activation request.');
    }
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
    const targetProfiles = targetContext == null ? null : await loadTargetRuntimeProfiles({
      rootDir: config.rootDir ?? process.cwd(), worldRevisionId: release.world_revision_id,
      verifiedCatalog: targetContext.runtime.materialization_inputs.domain_catalog });
    const [profiles, spatialSemanticProfile, scenePresentation,
      npcSemanticRemainderProfile, loadedWorldKnowledge,
      scenarioBundle] = await Promise.all([
      targetProfiles?.materialization_profiles ?? loadLowerDvinaTraceProductionMaterializationProfiles({ rootDir: config.rootDir ?? process.cwd() }),
      targetContext == null ? loadLowerDvinaTraceSpatialSemanticProfile({ rootDir: config.rootDir ?? process.cwd() }) : null,
      targetContext == null ? loadLowerDvinaTraceScenePresentation({
        rootDir: config.rootDir ?? process.cwd(),
        scenarioDefinitionRevision: release.scenario_profile_exact_pins.scenario_definition_revision
      }) : null,
      targetContext == null ? loadLowerDvinaTraceN1Profile({
        rootDir: config.rootDir ?? process.cwd()
      }) : null,
      loadProductionWorldKnowledge({ rootDir: config.rootDir ?? process.cwd(),
        python: env.RUS_WORLD_KNOWLEDGE_PYTHON ?? 'python',
        requireEncoderReady: true,
        ...(worldKnowledgeEncoderFactory == null ? {}
          : { encoderFactory: worldKnowledgeEncoderFactory }) }),
      targetContext == null ? loadLowerDvinaTraceMaterializationBundle({
        rootDir: config.rootDir ?? process.cwd(),
        scenarioDefinitionRevision: release.scenario_profile_exact_pins.scenario_definition_revision
      }) : { calendar_profile: targetContext.runtime.materialization_inputs.calendar_profile }
    ]);
    const worldKnowledge = Object.freeze({ ...loadedWorldKnowledge,
      calendar_profile: scenarioBundle.calendar_profile });
    const targetFiniteFirstEntry = targetProfiles == null ? null
      : createTargetFiniteFirstEntryPorts(targetProfiles.finite_first_entry);
    const authoredRuntimeBindingResolver = targetContext == null ? null
      : createTargetAuthoredStartCatalog({ runtime: targetContext.runtime, release }).resolveRuntimeBinding;
    let committer;
    const factualContext = targetContext == null ? null : createTargetCurrentFactualContext({
      partyPool: pools.partyPool,
      committer: { commit: (...args) => committer.commit(...args) },
      runtime: targetContext.runtime,
      authoredRuntimeBindingResolver
    });
    const currentVisibility = targetContext == null ? null
      : createSpatialV3CurrentVisibilityProvider({
        pool: pools.partyPool,
        verifiedCatalog: targetContext.runtime.materialization_inputs.domain_catalog,
        pin: targetContext.runtime.itemPin,
        worldBaseReader: targetContext.runtime.worldBaseReader,
        readCurrentEnvironment: factualContext.readCurrentEnvironment,
        readCurrentSourceState: (args) => readCurrentNaturalSourceState({
          ...args, readCurrentEnvironment: factualContext.readCurrentEnvironment }),
        readTargetConditions: readCurrentTargetConditions,
        readEntityExterior: readCommittedEntityExterior,
        readPlayerKnowledge
      });
    const spatialExpansionRuntime = targetContext == null ? null
      : createSpatialV3ExpansionRuntime({
        readContext: createSpatialV3ExpansionContextReader({
          partyPool: pools.partyPool, worldBaseReader: targetContext.runtime.worldBaseReader,
          release }),
        readExitDisclosure: currentVisibility.readExitDisclosure
      });
    const bindingContext = Object.freeze({ env, config,
      ordinaryMaterializationProfile:profiles.ordinaryMaterializationProfile,
      ordinaryContainerContentsProfile:profiles.ordinaryContainerContentsProfile,
      actionProductionProfile:profiles.actionProductionProfile, localFireProfile:profiles.localFireProfile,
      spatialSemanticProfile,
      npcSemanticRemainderProfile,
      worldKnowledge,
      ...(targetContext == null ? {} : { targetStartRuntime: targetContext.runtime, targetRuntimeProfiles: targetProfiles,
        spatialExpansionRuntime,
        spatialLocalSceneRuntime: createSpatialV3LocalSceneRuntime({ pool: pools.partyPool,
          readVisibleLocalEdgeRefs: currentVisibility.readVisibleLocalEdgeRefs }),
        readCurrentSources: currentVisibility.readCurrentSources, targetFiniteFirstEntry }),
      ports: Object.freeze({ partyPool: pools.partyPool, worldPool: pools.worldPool, worldBase }),
      release
    });
    const bindings = bindingsFactory
      ? validateSpatialV3RuntimeBindings(
          await bindingsFactory(bindingContext),
          release
        )
      : await loadSpatialV3RuntimeBindings(
          selectedModule,
          bindingContext
        );
    const ordinaryFirstEntryProvisioner = targetContext == null ? createOrdinaryMaterializationFirstEntryProvisioner({
      profile: profiles.ordinaryMaterializationProfile,
      ordinaryContainerContentsProfile: profiles.ordinaryContainerContentsProfile
    }) : null;
    const initialOrdinaryProvisioner =
      targetContext == null ? createOrdinaryMaterializationFirstEntryProvisioner({
        profile: profiles.ordinaryMaterializationProfile,
        includeContextBoundCapabilities: false,
        initialSceneSeed: ordinaryBackgroundSeedForLocation({ scenePresentation,
          locationRef: profiles.ordinaryMaterializationProfile
            .o2a_ambient.scope_binding.position_ref })
      }) : null;
    const spatialSemanticFirstEntryProvisioner = targetContext == null
      ? createSpatialSemanticFirstEntryProvisioner({ loadedProfile: spatialSemanticProfile }) : null;
    const siteTraversalCapability = targetContext == null ? null
      : createSpatialV3CurrentMovementCapability({ pool: pools.partyPool });
    committer = createSpatialV3PostgresCombinedAtomicCommitter({
      pool: pools.partyPool, recheck: siteTraversalCapability == null
        ? bindings.commitRecheck
        : (input) => bindings.commitRecheck({ ...input, ...siteTraversalCapability }),
      readNaturalSourceProperty: targetFiniteFirstEntry?.readNaturalSourceProperty ?? null,
      ordinaryFirstEntryProvisioner: targetContext == null
        ? { async provision(input) { await ordinaryFirstEntryProvisioner.provision(input); return spatialSemanticFirstEntryProvisioner.provision(input); } }
        : null, now });
    const target = targetRootFactory({ ...bindings.targetCompositionPorts, committer,
      ...(currentVisibility == null ? {} : { readCurrentSources: currentVisibility.readCurrentSources }) });
    const activatedRelease = deriveActivatedReleaseFromReadback(
      release,
      targetContext?.readback.item_pin ?? bindings.runtimeCatalogPin,
      targetContext?.readback ?? null
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
        release_id: release.release_id,
        release_status: activatedRelease.release_status,
        production_activation: activatedRelease.production_activation,
        runtime_selectable_in_canonical_production:
          activatedRelease.runtime_selectable_in_canonical_production,
        authoritative_reads: 'spatial_v3_only',
        authoritative_writes: 'spatial_v3_only',
        runtime_fallback: 'forbidden',
        npc_conversation_capability: release.npc_conversation_capability,
        npc_autonomous_capability: release.npc_autonomous_capability,
        npc_combat_capability: release.npc_combat_capability,
        temporal_contract_id:
          release.temporal_contract_id,
        world_revision_id:
          release.world_revision_id,
        world_knowledge_pack_ref:
          release.world_knowledge_pack_ref,
        world_knowledge_pack_revision:
          release.world_knowledge_pack_revision,
        world_catalog_digest:
          release.world_catalog_digest,
        world_catalog_manifest_sha256:
          release.world_catalog_manifest_sha256,
        dependency_pin_mode:
          release.dependency_pin_mode,
        runtime_catalog_pin_schema:
          release.runtime_catalog_pin_schema,
        runtime_catalog_scope:
          release.runtime_catalog_scope,
        runtime_catalog_resolution:
          release.runtime_catalog_resolution,
        compatible_world_pin_manifest_digest:
          release.compatible_world_pin_manifest_digest,
        runtime_catalog_pin:
          structuredClone(bindings.runtimeCatalogPin),
        ...(targetProfiles == null ? {} : { target_capability_gaps: structuredClone(targetProfiles.capability_gaps) }),
        party_schema_version: release.party_schema_version,
        migration_count: migration.applied,
        migration_chain_digest: migration.chain_digest,
        world_readiness: cutoverReadiness.world,
        migration_readiness: Object.freeze(partyReadiness),
        dependencies: structuredClone(startup)
      }),
      close: () => Promise.all([pools.close(), worldKnowledge.encoder.close()])
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
