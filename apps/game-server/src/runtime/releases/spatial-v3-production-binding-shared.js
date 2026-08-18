import { loadActiveRuntimeCatalogPin } from
  '../../infrastructure/postgres/spatial-v3-production-readiness.js';
import { createFirstPlayablePublicRuntime } from '../first-playable-public-runtime.js';
import { firstPlayableCommitRecheck } from
  '../../infrastructure/postgres/first-playable/recheck.js';
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
  createLowerDvinaTraceSemanticResolver,
  createLowerDvinaTraceTurnStepModel
} from '../lower-dvina-trace-phase-2-llm.js';
import { createOrdinaryMaterializationModel } from '../ordinary-materialization-llm.js';
import { createLowerDvinaTraceO2aAmbientPort } from '../lower-dvina-trace-o2a-ambient-port.js';
import { loadLowerDvinaTraceOrdinaryStageBApproval } from
  '../../internal/lower-dvina-trace-ordinary-stage-b-approval.js';
import { createLowerDvinaTraceOrdinaryDiscoveryResolver } from
  '../lower-dvina-trace-ordinary-discovery.js';
import { createPostgresOrdinaryMaterializationEnablementRepository } from
  '../../infrastructure/postgres/ordinary-materialization-enablement.js';
import {
  createProductionLlmRoleRunner
} from '../../infrastructure/provider/deepseek.js';
import {
  createSeededRandomSource
} from '@rus/checks-rng';
import { canonicalDigest } from '@rus/materialization';
import {
  createTemporalAdvanceOwner,
  npcTemporalEffectRegistrations
} from '@rus/turn/temporal-advance';
import { calculatePackingSlots } from '@rus/items-property';
import { lowerDvinaTracePhase6TemporalEffectRegistrations } from
  '../lower-dvina-trace-phase-6-temporal-effect-owner.js';
import { lowerDvinaTracePhase7TemporalEffectRegistrations } from
  '../lower-dvina-trace-phase-7-temporal-effect-owner.js';
import { lowerDvinaTraceConversationTemporalEffectRegistrations } from
  '../lower-dvina-trace-m2-conversation-temporal-effect-owner.js';
import { lowerDvinaTraceCombatTemporalEffectRegistrations } from
  '../lower-dvina-trace-combat-temporal-effect-owner.js';
import { lowerDvinaTraceTemporalSourceRegistrations } from
  '../lower-dvina-trace-phase-6-temporal-source.js';
import { serverError } from '../../errors.js';

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
    ordinaryMaterializationProfile = null
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
          createNpcRuntimePorts,
          ordinaryStageBApproval,
          ordinaryMaterializationProfile,
          createPhase2RuntimeFactory
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

function createTraceTurnRuntime({
  partyPool,
  committer,
  env,
  config,
  createNpcRuntimePorts,
  ordinaryStageBApproval,
  ordinaryMaterializationProfile,
  createPhase2RuntimeFactory
}) {
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
  const ordinaryMaterializationModel = createOrdinaryMaterializationModel({
    roleRunner, stageBApprovalReceipt: ordinaryStageBApproval
  });
  const narrationService =
    createLowerDvinaTraceNarrationService({ roleRunner });
  const ordinaryEnablements = createPostgresOrdinaryMaterializationEnablementRepository({
    pool: partyPool
  });
  return createPhase2RuntimeFactory({
    repository: createLowerDvinaTracePhase2PostgresRepository({
      partyPool,
      committer
    }),
    semanticResolver:
      createLowerDvinaTraceSemanticResolver({ roleRunner }),
    turnStepModel:
      createLowerDvinaTraceTurnStepModel({ roleRunner }),
    createTurnStepOrdinaryDiscoveryResolver: ({ partyId, inputDigest }) =>
      createLowerDvinaTraceOrdinaryDiscoveryResolver({ partyId, inputDigest,
        loadEnablement: (input) => ordinaryEnablements.load(input),
        ordinaryMaterializationModel
      }),
    ordinaryDiscoveryEnablementMarker: async ({ partyId, scopeRef }) => {
      const enabled = await ordinaryEnablements.load({ partyId, scopeRef });
      if (enabled == null) return null;
      const capabilities = enabled.execution_context?.context_bound_capabilities ?? [];
      return Object.freeze({ discovery_available: true, sources: Object.freeze(
        capabilities.map((entry) => Object.freeze({
          source_ref: entry.candidate_context.target_ref,
          public_name: entry.public_name }))) });
    },
    createTurnStepAmbientOrdinaryPortionAdmission: ({ committedState }) =>
      createLowerDvinaTraceO2aAmbientPort({
        profile: ordinaryMaterializationProfile,
        committedState
      }),
    requireTurnStepAmbientOrdinaryAdmission: false,
    ...createNpcRuntimePorts({ roleRunner }),
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
    temporalAdvanceOwner: createTemporalAdvanceOwner({
      source_registrations: lowerDvinaTraceTemporalSourceRegistrations(
        config.temporalBoundaryRegistrations ?? []
      ),
      effect_registrations:
        [
          ...lowerDvinaTracePhase6TemporalEffectRegistrations(),
          ...npcTemporalEffectRegistrations(),
          ...lowerDvinaTracePhase7TemporalEffectRegistrations(),
          ...lowerDvinaTraceConversationTemporalEffectRegistrations(),
          ...lowerDvinaTraceCombatTemporalEffectRegistrations()
        ]
    }),
    turnStepPackingCalculator: calculatePackingSlots,
    decisionSecret
  });
}
