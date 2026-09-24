import {
  loadActiveRuntimeCatalogPin
} from '../../infrastructure/postgres/spatial-v3-production-readiness.js';
import {
  createLowerDvinaTracePublicRuntime
} from '../lower-dvina-trace-public-runtime.js';
import { TRACE_REVISION32_PHASE_1A_MANIFEST_DIGEST } from
  '../../internal/lower-dvina-trace-revision-32-publication.js';
import {
  firstPlayableCommitRecheck as baseCommitRecheck
} from '../../infrastructure/postgres/first-playable/recheck.js';
import { recheckSpatialV3PostgresFirstEntry } from
  '../../infrastructure/postgres/spatial-v3-first-entry-recheck.js';
import {
  createLowerDvinaTracePhase1BProductionAdapter
} from '../../infrastructure/postgres/lower-dvina-trace-phase-1b.js';
import {
  createLowerDvinaTracePhase2Runtime
} from '../lower-dvina-trace-phase-2.js';
import { createTraceTurnRuntime } from
  './spatial-v3-production-trace-runtime.js';
import { loadLowerDvinaTraceOrdinaryStageBApproval } from
  '../../internal/lower-dvina-trace-ordinary-stage-b-approval.js';
import { loadLiveWorldAuthoredStartCatalog } from
  '../../internal/live-world-authored-starts.js';
import { createSpatialSemanticFirstEntryProvisioner } from
  '../../infrastructure/postgres/spatial-semantic-first-entry-provisioning.js';
import { loadActiveActorBaseAttributesBinding } from
  '../../infrastructure/postgres/actor-base-attributes-profile-loader.js';
import { createTargetAuthoredStartCatalog } from '../../internal/target-authored-start-catalog.js';

export async function firstPlayableCommitRecheck(input) {
  if (input?.plan?.operation_kind === 'first_entry'
      && input?.check?.kind === 'physical') {
    return recheckSpatialV3PostgresFirstEntry(input);
  }
  return baseCommitRecheck(input);
}

function createTargetCompositionPorts(
  getPublicRuntime,
  technicalCommandBoundary
) {
  const blocked = async () => Object.freeze({
    ok: false,
    status: 'hard_block',
    error: Object.freeze({
      code: 'technical_command_not_bound',
      message: `Only commands sealed by the ${technicalCommandBoundary} public facade are accepted.`
    })
  });
  const releaseVerticalSliceExecutor = Object.freeze(
    Object.fromEntries([
      'listScenarios',
      'startNewGame',
      'acknowledgeOpening',
      'submitTurn',
      'getPartyScreen',
      'recoverPendingPresentation'
    ].map((method) => [
      method,
      async (...args) => {
        const runtime = getPublicRuntime();
        if (runtime == null) {
          throw new TypeError(
            'release vertical-slice executor is not initialized'
          );
        }
        return runtime[method](...args);
      }
    ]))
  );
  return Object.freeze({
    planner: Object.freeze({ resolve: blocked }),
    activationValidator: Object.freeze({ validate: blocked }),
    executionEngine: Object.freeze({}),
    targetPreparation: Object.freeze({ prepare: blocked }),
    frontierResolver: Object.freeze({ resolve: blocked }),
    loadSnapshots: blocked,
    validateProposal: blocked,
    advanceTemporal: blocked,
    deriveVisiblePackage: blocked,
    loadCommittedVisiblePackage: blocked,
    claimPresentationAttempt: blocked,
    narrate: blocked,
    persistNarrationOutput: blocked,
    finalizePresentationAttempt: blocked,
    projectScreen: blocked,
    verifyApproval: blocked,
    loadStartSnapshot: blocked,
    prepareStart: blocked,
    buildStartWritePlanInput: blocked,
    modeHandoff: Object.freeze({ handoff: blocked }),
    buildModeHandoffProposal: blocked,
    releaseVerticalSliceExecutor
  });
}

export async function createSpatialV3ProductionBindings(
  {
    ports,
    release,
    env = process.env,
    config = {},
    ordinaryMaterializationProfile = null,
    ordinaryContainerContentsProfile = null,
    actionProductionProfile = null,
    localFireProfile = null,
    spatialSemanticProfile = null,
    npcSemanticRemainderProfile = null,
    worldKnowledge = null,
    targetStartRuntime = null,
    targetRuntimeProfiles = null,
    spatialExpansionRuntime = null,
    spatialLocalSceneRuntime = null
  } = {},
  {
    createNpcRuntimePorts,
    publicationLoader,
    createPhase2RuntimeFactory = createLowerDvinaTracePhase2Runtime,
    actorBaseAttributesBindingLoader =
      loadActiveActorBaseAttributesBinding,
    technicalCommandBoundary = 'production-v2'
  } = {}
) {
  if (!ports?.worldPool?.query || !ports?.partyPool?.query) {
    throw new TypeError('worldPool and partyPool are required');
  }
  if (typeof createNpcRuntimePorts !== 'function') {
    throw new TypeError('NPC runtime port factory is required');
  }
  const activeRuntimeCatalogPin = await loadActiveRuntimeCatalogPin(
    ports.worldPool,
    release.runtime_catalog_scope
  );
  const runtimeCatalogPin = targetStartRuntime?.itemPin ?? activeRuntimeCatalogPin;
  if (targetStartRuntime != null && Object.entries(runtimeCatalogPin)
    .some(([field, value]) => activeRuntimeCatalogPin[field] !== value)) {
    throw new TypeError('target catalog changed after exact release activation readback');
  }
  if (runtimeCatalogPin.runtime_contract_digest
      !== release.runtime_catalog_contract_digest) {
    throw new TypeError(
      'active runtime catalog uses another exact runtime contract'
    );
  }
  const ordinaryStageBApproval =
    await loadLowerDvinaTraceOrdinaryStageBApproval({
      rootDir: config.rootDir ?? process.cwd()
    });
  let publicRuntime = null;
  const targetCompositionPorts =
    createTargetCompositionPorts(
      () => publicRuntime,
      technicalCommandBoundary
    );
  return Object.freeze({
    targetCompositionPorts,
    commitRecheck: firstPlayableCommitRecheck,
    createPublicRuntimeFacade: async ({ technicalCore, committer,
      initialOrdinaryProvisioner, release: activatedRelease = release }) => {
      if (typeof technicalCore?.executeReleaseOperation !== 'function') {
        throw new TypeError('technical spatial-v3 core is required');
      }
      const [historicalCatalog, actorBaseAttributesBinding] =
        await Promise.all([
          loadLiveWorldAuthoredStartCatalog({
            rootDir: config.rootDir ?? process.cwd(),
            phase1AManifestDigest: targetStartRuntime == null
              ? release.scenario_profile_exact_pins?.phase_1a_manifest_digest ?? TRACE_REVISION32_PHASE_1A_MANIFEST_DIGEST
              : undefined,
            scenarioDefinitionRevision: targetStartRuntime == null
              ? release.scenario_profile_exact_pins?.scenario_definition_revision ?? 32 : undefined
          }),
          targetStartRuntime?.actorBinding ?? actorBaseAttributesBindingLoader(ports.worldPool)
        ]);
      const authoredStartCatalog = targetStartRuntime == null ? historicalCatalog
        : createTargetAuthoredStartCatalog({ runtime: targetStartRuntime, release: activatedRelease,
            historicalCatalog, turnProfile: targetRuntimeProfiles?.turn_profile,
            ordinaryProfiles: targetRuntimeProfiles?.ordinary_profiles });
      const authoredSpatialProvisioner = targetStartRuntime != null ? null :
        createSpatialSemanticFirstEntryProvisioner({
          loadedProfile: authoredStartCatalog.ordinary_profiles.s1
        });
      const authoredInitialProvisioner = initialOrdinaryProvisioner == null
        || authoredSpatialProvisioner == null ? null : { async provision(input) {
          const ordinary = await initialOrdinaryProvisioner.provision(input);
          const spatial = await authoredSpatialProvisioner.provision(input);
          return Object.freeze({ ordinary, spatial });
        } };
      const traceStartAdapter = createLowerDvinaTracePhase1BProductionAdapter({
        partyPool: ports.partyPool, worldPool: ports.worldPool, release, runtimeCatalogPin, worldKnowledge,
        authoredStartResolver: authoredStartCatalog.resolveProfile,
        approvedActorCatalog: authoredStartCatalog.actor_catalog, actorBaseAttributesBinding,
        ...(targetStartRuntime == null ? {} : { targetStartRuntime }),
        ...(authoredInitialProvisioner == null ? {} : { initialOrdinaryProvisioner: authoredInitialProvisioner })
      });
      publicRuntime ??= createLowerDvinaTracePublicRuntime({
        partyPool: ports.partyPool,
        committer,
        release: activatedRelease,
        runtimeCatalogPin,
        activePhase1AManifestDigest: release.scenario_profile_exact_pins?.phase_1a_manifest_digest
          ?? TRACE_REVISION32_PHASE_1A_MANIFEST_DIGEST,
        activeScenarioDefinitionRevision: release.scenario_profile_exact_pins?.scenario_definition_revision ?? 32,
        publicationLoader,
        authoredStartCatalog,
        ...(typeof config.idFactory === 'function'
          ? { idFactory: config.idFactory }
          : {}),
        traceStartAdapter,
        traceTurnRuntime: createTraceTurnRuntime({
          partyPool: ports.partyPool,
          committer,
          env,
          config,
          ordinaryMaterializationProfile,
          ordinaryContainerContentsProfile,
          ordinaryStageBApproval,
          actionProductionProfile,
          localFireProfile,
          spatialSemanticProfile,
          npcSemanticRemainderProfile,
          authoredTurnProfile: authoredStartCatalog.turn_profile,
          authoredSpatialSemanticProfile:
            authoredStartCatalog.ordinary_profiles?.s1 ?? null,
          authoredNpcSemanticRemainderProfile:
            authoredStartCatalog.ordinary_profiles?.n1 ?? null,
          authoredRuntimeBindingResolver:
            authoredStartCatalog.resolveRuntimeBinding,
          worldKnowledge,
          spatialExpansionRuntime,
          spatialLocalSceneRuntime,
          loadInitialNaturalScenePerceptionInput: traceStartAdapter.loadNaturalScenePerceptionInput ?? null,
          createPhase2RuntimeFactory,
          createNpcRuntimePorts
        })
      });
      return Object.freeze(Object.fromEntries([
        'listScenarios',
        'startNewGame',
        'acknowledgeOpening',
        'submitTurn',
        'getPartyScreen',
        'recoverPendingPresentation'
      ].map((method) => [
        method,
        (...args) =>
          technicalCore.executeReleaseOperation(method, ...args)
      ])));
    },
    releaseBinding: Object.freeze({ ...release }),
    runtimeCatalogPin
  });
}
