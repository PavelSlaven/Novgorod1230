import { npcRoutineTemporalRegistration } from '../npc-routine-temporal.js';
import { createLowerDvinaTracePhase2PostgresRepository } from
  '../../infrastructure/postgres/lower-dvina-trace-phase-2.js';
import { createLowerDvinaTracePhase2DurableNarrator } from
  '../../infrastructure/postgres/lower-dvina-trace-phase-2-presentation.js';
import { createLowerDvinaTraceNarrationService,
  createLowerDvinaTraceSemanticResolver,
  createLowerDvinaTraceTurnStepModel } from
  '../lower-dvina-trace-phase-2-llm.js';
import { createLowerDvinaTraceTurnStepSemanticGroundingValidator } from
  '../lower-dvina-trace-turn-step-grounding-audit.js';
import { createLowerDvinaTraceActionProducedWeaponClassifier } from
  '../lower-dvina-trace-combat-ordinary-weapon.js';
import { createLowerDvinaTraceA1ProductionResolverFactory } from
  './lower-dvina-trace-a1-production.js';
import { createLowerDvinaTraceF1ProductionResolverFactory } from
  './lower-dvina-trace-f1-production.js';
import { createLowerDvinaTraceS1ProductionResolverFactory } from
  './lower-dvina-trace-s1-production.js';
import { createLowerDvinaTraceN1ProductionResolverFactory } from
  './lower-dvina-trace-n1-production.js';
import { createLowerDvinaTraceWorldProcessStepModel } from
  '../lower-dvina-trace-world-process-llm.js';
import { createOrdinaryMaterializationModel } from
  '../ordinary-materialization-llm.js';
import { createLowerDvinaTraceO2aAmbientPort } from
  '../lower-dvina-trace-o2a-ambient-port.js';
import { createLowerDvinaTraceO2bProductionResolverFactory } from
  './lower-dvina-trace-o2b-production.js';
import { createLowerDvinaTraceNpcActorStepOwnerCapabilitiesFactory } from
  '../lower-dvina-trace-npc-actor-step-owner-capabilities.js';
import { createLowerDvinaTraceNpcActorStepModeOwnerCapabilities } from
  '../lower-dvina-trace-npc-actor-step-mode-handoffs.js';
import { createLowerDvinaTraceOrdinaryDiscoveryResolver } from
  '../lower-dvina-trace-ordinary-discovery.js';
import { createPostgresOrdinaryMaterializationEnablementRepository } from
  '../../infrastructure/postgres/ordinary-materialization-enablement.js';
import { createProductionLlmRoleRunner } from
  '../../infrastructure/provider/openai-compatible.js';
import { createSeededRandomSource } from '@rus/checks-rng';
import { canonicalDigest } from '@rus/materialization';
import { createTemporalAdvanceOwner, npcTemporalEffectRegistrations } from
  '@rus/turn/temporal-advance';
import { calculatePackingSlots } from '@rus/items-property';
import { hasActiveTurnDeadline, withTurnDeadlineTransaction } from
  '../../infrastructure/postgres/query-with-turn-deadline.js';
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
import { lowerDvinaTraceLocalFireTemporalRegistration } from
  '../lower-dvina-trace-local-fire-temporal.js';
import { serverError } from '../../errors.js';
import { runLowerDvinaTraceNpcConversationExchange } from
  '../lower-dvina-trace-npc-initiated-conversation.js';
import { createLlmDiagnostics } from '../llm-diagnostics.js';
import { createLlmTurnBudget } from '../llm-turn-budget.js';
import { createProductionWorldKnowledgeGrounder } from
  '../world-knowledge-grounding.js';
import { createAuthoredOpeningNarrationService } from
  '../authored-opening-narration.js';
import { createTargetCurrentFactualContext } from
  '../../infrastructure/postgres/target-current-factual-context.js';
import { createNeedsCheckMaterializationGuard } from
  '../needs-check-materialization-guard.js';
import { createNeedsCheckRegionResolver } from
  '../../infrastructure/postgres/needs-check-region-resolver.js';
import { createPostgresWorldBaseReader } from
  '../../infrastructure/postgres/world-base.js';
import { createRuntimeCatalogCoordinator } from '../runtime-catalog.js';
import { readAndProjectSpatialV3CurrentVisibleContext } from
  '../spatial-v3-current-visible-context.js';

export function createTraceTurnRuntime({
  partyPool, worldPool, committer, env, config, ordinaryMaterializationProfile,
  ordinaryContainerContentsProfile, ordinaryStageBApproval,
  actionProductionProfile, localFireProfile,
  spatialSemanticProfile,
  npcSemanticRemainderProfile,
  authoredTurnProfile,
  postActionPerceptionProfile = null,
  authoredSpatialSemanticProfile = null,
  authoredNpcSemanticRemainderProfile = null,
  authoredRuntimeBindingResolver,
  targetStartRuntime = null,
  spatialExpansionRuntime = null,
  spatialLocalSceneRuntime = null,
  readLocalEdgeDisclosure = null,
  readCurrentExitDisclosure = null,
  readCurrentConnectionDisclosure = null,
  readCurrentVisibleContext = null,
  readCurrentSources = null,
  loadInitialNaturalScenePerceptionInput = null,
  worldKnowledge,
  createPhase2RuntimeFactory, createNpcRuntimePorts,
  // Test seam: production default is createLowerDvinaTraceNarrationService.
  createNarrationService = createLowerDvinaTraceNarrationService
}) {
  const decisionSecret = String(
    config.traceTurnDecisionSecret ?? env.RUS_TURN_DECISION_SECRET ?? ''
  ).trim();
  if (!decisionSecret) {
    const unavailable = async () => { throw serverError('TRACE_PHASE_2_DEPENDENCY_MISSING',
      'RUS_TURN_DECISION_SECRET is required for semantic intent.', { status: 503 }); };
    return Object.freeze({ submitTurn: unavailable, recoverPendingPresentation: unavailable });
  }
  const turnBudget = config.llmTurnBudget ?? config.llmDiagnostics?.turnBudget
    ?? createLlmTurnBudget();
  const llmDiagnostics = config.llmDiagnostics
    ?? createLlmDiagnostics({ telemetry: config.telemetry ?? null, turnBudget,
      developerMode: config.developerMode });
  const roleRunner = createProductionLlmRoleRunner({
    env, telemetry: llmDiagnostics.telemetry, settings: config.llmSettings ?? null, turnBudget
  });
  const worldKnowledgeGrounder = worldKnowledge == null ? null
    : createProductionWorldKnowledgeGrounder({
        worldKnowledge, roleRunner, telemetry: llmDiagnostics.telemetry,
        year: 1230, placeRefs: ['region_novgorod_land']
      });
  const narrationService = createNarrationService({
    roleRunner, worldKnowledgeGrounder, telemetry: llmDiagnostics.telemetry
  });
  const authoredOpeningNarration = createAuthoredOpeningNarrationService({
    roleRunner, llmDiagnostics
  });
  const ordinaryMaterializationModel = ordinaryStageBApproval == null
    ? Object.assign(async () => { throw ordinaryStageBUnavailable(); }, {
      verifyStageBCutover: async () => { throw ordinaryStageBUnavailable(); }
    }) : createOrdinaryMaterializationModel({
    roleRunner, stageBApprovalReceipt: ordinaryStageBApproval,
    qualifiedO1Identity: config.llmSettings?.ordinaryMaterializationIdentity,
    worldKnowledgeGrounder
  });
  const materializationInputs = targetStartRuntime?.materialization_inputs;
  const runtimeCatalogWorldBaseReader = worldPool == null ? null
    : createPostgresWorldBaseReader({ pool: worldPool });
  const partyCatalogCoordinator = targetStartRuntime == null ? null
    : createRuntimeCatalogCoordinator({ worldBaseReader: runtimeCatalogWorldBaseReader,
        partyPool, itemPin: targetStartRuntime.itemPin });
  const needsCheckGuard = targetStartRuntime == null ? null
    : createNeedsCheckMaterializationGuard({
        resolveRegion: createNeedsCheckRegionResolver({
          worldBaseReader: runtimeCatalogWorldBaseReader }),
        calendarProfile: materializationInputs?.calendar_profile
      });
  const ordinaryDiscoveryScopeBinding =
    ordinaryMaterializationProfile?.o2a_ambient?.scope_binding ?? null;
  const ordinaryEnablements =
    createPostgresOrdinaryMaterializationEnablementRepository({pool:partyPool});
  const ordinaryContainerResolverFactory =
    createLowerDvinaTraceO2bProductionResolverFactory({ pool: partyPool,
      loadedProfile: ordinaryContainerContentsProfile,
      ordinaryMaterializationModel });
  const actionProductionResolverFactory = actionProductionProfile == null
    ? null : createLowerDvinaTraceA1ProductionResolverFactory({ pool: partyPool,
      loadedProfile: actionProductionProfile });
  const localFireResolverFactory = localFireProfile == null ? null
    : createLowerDvinaTraceF1ProductionResolverFactory({ pool: partyPool,
      loadedProfile: localFireProfile,
      worldProcessStepModel:createLowerDvinaTraceWorldProcessStepModel({roleRunner}) });
  const activeSpatialSemanticProfile = spatialSemanticProfile?.schema
      === 'rus.lower_dvina_trace_s1_loaded_profile.v1'
    && spatialSemanticProfile.profile?.schema
      === 'rus.lower_dvina_trace_spatial_semantic_profile.v1'
    && spatialSemanticProfile.profile.status === 'approved'
    && spatialSemanticProfile.profile.revision === 3
    && spatialSemanticProfile.profile.scenario_definition_revision === 24
    ? spatialSemanticProfile : null;
  const spatialSemanticResolverFactory = activeSpatialSemanticProfile != null
    ? createLowerDvinaTraceS1ProductionResolverFactory({ pool: partyPool,
        roleRunner, worldKnowledgeGrounder })
    : null;
  const authoredSpatialSemanticResolverFactory =
    authoredSpatialSemanticProfile?.schema
      === 'rus.live_world_runtime.s1_loaded_profile.v1'
      && authoredSpatialSemanticProfile.profile?.status === 'approved'
      ? createLowerDvinaTraceS1ProductionResolverFactory({ pool: partyPool,
          roleRunner, worldKnowledgeGrounder }) : null;
  const backgroundNpcResolverFactory =
    npcSemanticRemainderProfile?.schema
      === 'rus.lower_dvina_trace_n1_loaded_profile.v1'
      && npcSemanticRemainderProfile.profile?.status === 'approved'
      ? createLowerDvinaTraceN1ProductionResolverFactory({
          loadedProfile: npcSemanticRemainderProfile, roleRunner,
          worldKnowledgeGrounder
        }) : null;
  const authoredBackgroundNpcResolverFactory =
    authoredNpcSemanticRemainderProfile?.schema
      === 'rus.live_world_runtime.n1_loaded_profile.v1'
      && authoredNpcSemanticRemainderProfile.profile?.status === 'approved'
      ? createLowerDvinaTraceN1ProductionResolverFactory({
          loadedProfile: authoredNpcSemanticRemainderProfile, roleRunner,
          worldKnowledgeGrounder
        }) : null;
  const createNpcOwnerCapabilities = createLowerDvinaTraceNpcActorStepOwnerCapabilitiesFactory({
    createOrdinaryDiscoveryResolver: ({ partyId, inputDigest,
      assertNeedsCheckAllowed }) =>
      createLowerDvinaTraceOrdinaryDiscoveryResolver({ partyId, inputDigest,
      loadEnablement: (input) => ordinaryEnablements.load(input),
        ordinaryMaterializationModel,
        assertNeedsCheckAllowed }),
    createActionProductionOwner: actionProductionResolverFactory,
    createOrdinaryContainerContentsResolver: ordinaryContainerResolverFactory,
    loadOrdinaryEnablement: (input) => ordinaryEnablements.load(input),
    createSpatialSemanticResolver: spatialSemanticResolverFactory,
    createModeOwnerCapabilities: createLowerDvinaTraceNpcActorStepModeOwnerCapabilities
  });
  const temporalAdvanceOwner = createTemporalAdvanceOwner({
    source_registrations: lowerDvinaTraceTemporalSourceRegistrations([
      ...(config.temporalBoundaryRegistrations ?? []),
      npcRoutineTemporalRegistration(),
      ...(localFireProfile?.profile?.status==='approved'
        ?[lowerDvinaTraceLocalFireTemporalRegistration(
          localFireProfile.profile)]:[])
    ]),
    effect_registrations: [
      ...lowerDvinaTracePhase6TemporalEffectRegistrations(),
      ...npcTemporalEffectRegistrations(),
      ...lowerDvinaTracePhase7TemporalEffectRegistrations(),
      ...lowerDvinaTraceConversationTemporalEffectRegistrations(),
      ...lowerDvinaTraceCombatTemporalEffectRegistrations()
    ]
  });
  const npcRuntimePorts = createNpcRuntimePorts({ roleRunner,
    worldKnowledgeGrounder });
  const projectCurrentSpatialContext = createCurrentSpatialContextProjector({
    partyPool, readCurrentSources,
    onProjected: config.onCurrentSpatialContextProjection ?? null
  });
  if (typeof config.onCurrentSpatialContextProjector === 'function') {
    config.onCurrentSpatialContextProjector(projectCurrentSpatialContext);
  }
  const runtime = createPhase2RuntimeFactory({
    repository: createLowerDvinaTracePhase2PostgresRepository({
      partyPool, committer, authoredRuntimeBindingResolver, loadInitialNaturalScenePerceptionInput,
      projectCurrentSpatialContext,
      readLocalEdgeDisclosure, readCurrentExitDisclosure, readCurrentConnectionDisclosure,
      readCurrentVisibleContext,
      projectEnvironmentAtClock: targetStartRuntime == null ? null
        : createTargetCurrentFactualContext({ partyPool, committer,
          runtime: targetStartRuntime, authoredRuntimeBindingResolver }).projectEnvironmentAtClock
    }),
    semanticResolver: createLowerDvinaTraceSemanticResolver({ roleRunner }),
    turnStepModel: createLowerDvinaTraceTurnStepModel({ roleRunner,
      worldKnowledgeGrounder }),
    turnStepSemanticGroundingValidator:
      createLowerDvinaTraceTurnStepSemanticGroundingValidator({ roleRunner }),
    actionProducedWeaponClassifier:
      createLowerDvinaTraceActionProducedWeaponClassifier({ roleRunner }),
    loadTurnRuntimeCatalogContext: partyCatalogCoordinator == null ? null
      : ({ partyId }) => partyCatalogCoordinator.loadPartyContext({ partyId }),
    createTurnStepOrdinaryDiscoveryResolver: ({ partyId, inputDigest,
      assertNeedsCheckAllowed, recordNeedsCheckFilter }) =>
      createLowerDvinaTraceOrdinaryDiscoveryResolver({ partyId, inputDigest,
        loadEnablement: (input) => ordinaryEnablements.load(input),
        ordinaryMaterializationModel,
        assertNeedsCheckAllowed,
        recordNeedsCheckFilter,
        requestSubject: 'player',
        scopeBinding: ordinaryDiscoveryScopeBinding
      }),
    createTurnStepOrdinaryContainerContentsResolver:
      ordinaryContainerResolverFactory,
    ordinaryDiscoveryEnablementMarker: async ({ partyId, scopeRef }) => {
      const enabled = await ordinaryEnablements.load({ partyId, scopeRef });
      if (enabled == null) return null;
      const capabilities =
        enabled.execution_context?.context_bound_capabilities ?? [];
      return Object.freeze({ discovery_available:true,
        scene_seed_available:enabled.ordinary_aggregate?.seeded === false,
        scene_details:Object.freeze((enabled.ordinary_aggregate
          ?.background_groups ?? []).map(({descriptor})=>descriptor)
          .filter((value)=>typeof value==='string'&&value.trim()===value)),
        sources:Object.freeze(capabilities.map((entry)=>Object.freeze({
          source_ref:entry.candidate_context.target_ref,
          public_name:entry.public_name,
          disclosure_state:entry.disclosure_state }))) });
    },
    ordinaryDiscoveryScopeBinding,
    turnStepNeedsCheckGuard: needsCheckGuard,
    createTurnStepActionProductionOwner: actionProductionResolverFactory,
    actionProductionProfile,
    createTurnStepWorldProcessResolver: localFireResolverFactory,
    localFireProfile,
    createTurnStepSpatialSemanticResolver: spatialSemanticResolverFactory,
    spatialSemanticProfile: activeSpatialSemanticProfile,
    createTurnStepAuthoredSpatialSemanticResolver:
      authoredSpatialSemanticResolverFactory,
    authoredSpatialSemanticProfile,
    createTurnStepBackgroundNpcResolver: backgroundNpcResolverFactory,
    npcSemanticRemainderProfile,
    createTurnStepAuthoredBackgroundNpcResolver:
      authoredBackgroundNpcResolverFactory,
    authoredNpcSemanticRemainderProfile,
    createTurnStepAmbientOrdinaryPortionAdmission: ({ committedState }) =>
      createLowerDvinaTraceO2aAmbientPort({
        profile: ordinaryMaterializationProfile, committedState
      }),
    requireTurnStepAmbientOrdinaryAdmission: false,
    turnStepAmbientPortionProfileRef:
      ordinaryMaterializationProfile?.o2a_ambient?.portion_profile?.profile_ref ?? null,
    createNpcOwnerCapabilities,
    ...npcRuntimePorts,
    runNpcConversationExchange: (input) => runLowerDvinaTraceNpcConversationExchange({
      ...input, npcSemanticModel: npcRuntimePorts.npcSemanticModel,
      temporalAdvanceOwner,
      revalidateStateVersion: input.revalidateStateVersion
    }),
    narrator: createLowerDvinaTracePhase2DurableNarrator({
      partyPool, narrationService,
      recordDiagnosticFailure: (error) => llmDiagnostics.recordFailure(error)
    }),
    randomSourceFactory: createTraceRandomSourceFactory({ env }),
    temporalAdvanceOwner,
    turnStepPackingCalculator: calculatePackingSlots,
    decisionSecret,
    llmTurnBudget: turnBudget,
    llmDiagnostics,
    onNpcSceneProjection: config.onNpcSceneProjection ?? null,
    authoredTurnProfile,
    postActionPerceptionProfile,
    spatialExpansionRuntime,
    spatialLocalSceneRuntime
  });
  return Object.freeze({ ...runtime, llmDiagnostics,
    authoredOpeningNarration });
}

export function createCurrentSpatialContextProjector({ partyPool,
  readCurrentSources, onProjected = null } = {}) {
  if (typeof readCurrentSources !== 'function') return null;
  return async ({ partyId, actorId, state, turnBudget = null }) => {
    const positionId = state?.position?.position_id
      ?? state?.journey_location?.scene_position_id;
    if (typeof positionId !== 'string' || positionId.length === 0) {
      throw serverError('SPATIAL_V3_VISIBLE_CONTEXT_DATA_GAP',
        'Current position is required for scene perception.', { status: 409,
          details: { reason: 'current_position_required' } });
    }
    const project = (transaction) => readAndProjectSpatialV3CurrentVisibleContext({
      transaction, partyId, actorId, positionId, observedPositionId: positionId,
      readCurrentSources, state, directionalExits: []
    });
    let visible;
    if (hasActiveTurnDeadline(turnBudget)) {
      visible = await withTurnDeadlineTransaction(partyPool, turnBudget,
        project, { beginMode: 'repeatable_read_read_only' });
    } else {
      const transaction = await partyPool.connect();
      try {
        await transaction.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
        visible = await project(transaction);
        await transaction.query('COMMIT');
      } catch (error) {
        await transaction.query('ROLLBACK');
        throw error;
      } finally {
        transaction.release();
      }
    }
    onProjected?.({ partyId, actorId, positionId,
      visible: structuredClone(visible) });
    return visible;
  };
}

function ordinaryStageBUnavailable() {
  return serverError('TRACE_ORDINARY_STAGE_B_EVAL_INPUT_INVALID',
    'A separate exact Stage B qualification is required for ordinary generation.', { status: 503 });
}

export function createTraceRandomSourceFactory({ env = {} } = {}) {
  const scenarioSeed = env.RUS_DEVELOPER_MODE === 'true'
    ? String(env.RUS_PUBLIC_PLAYTEST_SCENARIO_SEED ?? '').trim() : '';
  return (identity) => createSeededRandomSource(canonicalDigest(scenarioSeed
    ? {
        schema: 'rus.lower_dvina_trace_public_playtest_rng_identity.v1',
        scenario_seed: scenarioSeed,
        request_id: identity.request_id,
        ...(identity.check_profile_ref == null ? {} : {
          check_profile_ref: identity.check_profile_ref
        })
      }
    : {
        schema: 'rus.lower_dvina_trace_phase_2_rng_identity.v1', ...identity
      }));
}
