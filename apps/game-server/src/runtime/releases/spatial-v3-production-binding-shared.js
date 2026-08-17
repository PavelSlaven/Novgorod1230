import {
  loadActiveRuntimeCatalogPin
} from '../../infrastructure/postgres/spatial-v3-production-readiness.js';
import {
  createFirstPlayablePublicRuntime
} from '../first-playable-public-runtime.js';
import {
  firstPlayableCommitRecheck
} from '../../infrastructure/postgres/first-playable/recheck.js';
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

export { firstPlayableCommitRecheck };

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
      'getPartyScreen'
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
    actionProductionProfile = null
  } = {},
  {
    createNpcRuntimePorts,
    createPhase2RuntimeFactory = createLowerDvinaTracePhase2Runtime,
    technicalCommandBoundary = 'production-v2'
  } = {}
) {
  if (!ports?.worldPool?.query || !ports?.partyPool?.query) {
    throw new TypeError('worldPool and partyPool are required');
  }
  if (typeof createNpcRuntimePorts !== 'function') {
    throw new TypeError('NPC runtime port factory is required');
  }
  const runtimeCatalogPin = await loadActiveRuntimeCatalogPin(
    ports.worldPool,
    release.runtime_catalog_scope
  );
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
    createPublicRuntimeFacade: async ({ technicalCore, committer }) => {
      if (typeof technicalCore?.executeReleaseOperation !== 'function') {
        throw new TypeError('technical spatial-v3 core is required');
      }
      publicRuntime ??= createFirstPlayablePublicRuntime({
        partyPool: ports.partyPool,
        committer,
        release,
        runtimeCatalogPin,
        ...(typeof config.idFactory === 'function'
          ? { idFactory: config.idFactory }
          : {}),
        traceStartAdapter:
          createLowerDvinaTracePhase1BProductionAdapter({
            partyPool: ports.partyPool,
            worldPool: ports.worldPool,
            release,
            runtimeCatalogPin
          }),
        traceTurnRuntime: createTraceTurnRuntime({
          partyPool: ports.partyPool,
          committer,
          env,
          config,
          ordinaryMaterializationProfile,
          ordinaryContainerContentsProfile,
          ordinaryStageBApproval,
          actionProductionProfile,
          createPhase2RuntimeFactory,
          createNpcRuntimePorts
        })
      });
      return Object.freeze(Object.fromEntries([
        'listScenarios',
        'startNewGame',
        'acknowledgeOpening',
        'submitTurn',
        'getPartyScreen'
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
