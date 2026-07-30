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
  createLowerDvinaTracePhase2PostgresRepository
} from '../../infrastructure/postgres/lower-dvina-trace-phase-2.js';
import {
  createLowerDvinaTracePhase2DurableNarrator
} from '../../infrastructure/postgres/lower-dvina-trace-phase-2-presentation.js';
import {
  createLowerDvinaTracePhase2Runtime
} from '../lower-dvina-trace-phase-2.js';
import {
  createLowerDvinaTraceNarrationService,
  createLowerDvinaTraceSemanticResolver
} from '../lower-dvina-trace-phase-2-llm.js';
import {
  createProductionLlmRoleRunner
} from '../../infrastructure/provider/deepseek.js';
import {
  createSeededRandomSource
} from '@rus/checks-rng';
import { canonicalDigest } from '@rus/materialization';
import { serverError } from '../../errors.js';

export { firstPlayableCommitRecheck };

const blocked = async () => Object.freeze({
  ok: false,
  status: 'hard_block',
  error: Object.freeze({
    code: 'technical_command_not_bound',
    message: 'Only commands sealed by the production-v2 public facade are accepted.'
  })
});

function createTargetCompositionPorts(getPublicRuntime) {
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

/**
 * Exact production-v2 binding. The technical composition remains the sole
 * internal owner; the public facade is the only adapter from HTTP requests to
 * sealed first-playable commands and persisted projections.
 */
export async function createSpatialV3RuntimeBindings({
  ports,
  release,
  env = process.env,
  config = {}
} = {}) {
  if (!ports?.worldPool?.query || !ports?.partyPool?.query) {
    throw new TypeError('worldPool and partyPool are required');
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
  let publicRuntime = null;
  const targetCompositionPorts =
    createTargetCompositionPorts(() => publicRuntime);
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
          config
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

function createTraceTurnRuntime({ partyPool, committer, env, config }) {
  const decisionSecret = String(
    config.traceTurnDecisionSecret
      ?? env.RUS_TURN_DECISION_SECRET
      ?? ''
  ).trim();
  if (!decisionSecret) {
    return Object.freeze({
      async submitTurn() {
        throw serverError(
          'TRACE_PHASE_2_DEPENDENCY_MISSING',
          'RUS_TURN_DECISION_SECRET is required for semantic intent.',
          { status: 503 }
        );
      }
    });
  }
  const roleRunner = createProductionLlmRoleRunner({
    env,
    telemetry: config.telemetry ?? null
  });
  const narrationService =
    createLowerDvinaTraceNarrationService({ roleRunner });
  return createLowerDvinaTracePhase2Runtime({
    repository: createLowerDvinaTracePhase2PostgresRepository({
      partyPool,
      committer
    }),
    semanticResolver:
      createLowerDvinaTraceSemanticResolver({ roleRunner }),
    narrator: createLowerDvinaTracePhase2DurableNarrator({
      partyPool,
      narrationService
    }),
    randomSourceFactory: (identity) => createSeededRandomSource(
      canonicalDigest({
        schema: 'rus.lower_dvina_trace_phase_2_rng_identity.v1',
        ...identity
      })
    ),
    decisionSecret
  });
}

export default createSpatialV3RuntimeBindings;
