import { createLowerDvinaTracePhase2PostgresRepository } from
  '../../infrastructure/postgres/lower-dvina-trace-phase-2.js';
import { createLowerDvinaTracePhase2DurableNarrator } from
  '../../infrastructure/postgres/lower-dvina-trace-phase-2-presentation.js';
import { createLowerDvinaTraceNarrationService,
  createLowerDvinaTraceSemanticResolver,
  createLowerDvinaTraceTurnStepModel } from
  '../lower-dvina-trace-phase-2-llm.js';
import { createLowerDvinaTraceActionProducedWeaponClassifier } from
  '../lower-dvina-trace-combat-ordinary-weapon.js';
import { createLowerDvinaTraceA1ProductionResolverFactory } from
  './lower-dvina-trace-a1-production.js';
import { createLowerDvinaTraceF1ProductionResolverFactory } from
  './lower-dvina-trace-f1-production.js';
import { createLowerDvinaTraceS1ProductionResolverFactory } from
  './lower-dvina-trace-s1-production.js';
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
  '../../infrastructure/provider/deepseek.js';
import { createSeededRandomSource } from '@rus/checks-rng';
import { canonicalDigest } from '@rus/materialization';
import { createTemporalAdvanceOwner, npcTemporalEffectRegistrations } from
  '@rus/turn/temporal-advance';
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
import { lowerDvinaTraceLocalFireTemporalRegistration } from
  '../lower-dvina-trace-local-fire-temporal.js';
import { serverError } from '../../errors.js';
import { runLowerDvinaTraceNpcConversationExchange } from
  '../lower-dvina-trace-npc-initiated-conversation.js';
import { createLlmDiagnostics } from '../llm-diagnostics.js';
import { createLlmTurnBudget } from '../llm-turn-budget.js';

export function createTraceTurnRuntime({
  partyPool, committer, env, config, ordinaryMaterializationProfile,
  ordinaryContainerContentsProfile, ordinaryStageBApproval,
  actionProductionProfile, localFireProfile,
  spatialSemanticProfile,
  createPhase2RuntimeFactory, createNpcRuntimePorts
}) {
  const decisionSecret = String(
    config.traceTurnDecisionSecret ?? env.RUS_TURN_DECISION_SECRET ?? ''
  ).trim();
  if (!decisionSecret) return Object.freeze({
    async submitTurn() {
      throw serverError('TRACE_PHASE_2_DEPENDENCY_MISSING',
        'RUS_TURN_DECISION_SECRET is required for semantic intent.',
        { status: 503 });
    }
  });
  const turnBudget = config.llmTurnBudget ?? config.llmDiagnostics?.turnBudget
    ?? createLlmTurnBudget();
  const llmDiagnostics = config.llmDiagnostics
    ?? createLlmDiagnostics({ telemetry: config.telemetry ?? null, turnBudget });
  const roleRunner = createProductionLlmRoleRunner({
    env, telemetry: llmDiagnostics.telemetry, settings: config.llmSettings ?? null, turnBudget
  });
  const narrationService = createLowerDvinaTraceNarrationService({ roleRunner });
  const ordinaryMaterializationModel = createOrdinaryMaterializationModel({
    roleRunner, stageBApprovalReceipt: ordinaryStageBApproval,
    qualifiedO1Identity: config.llmSettings?.ordinaryMaterializationIdentity
  });
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
    ? createLowerDvinaTraceS1ProductionResolverFactory({ pool: partyPool, roleRunner })
    : null;
  const createNpcOwnerCapabilities = createLowerDvinaTraceNpcActorStepOwnerCapabilitiesFactory({
    createOrdinaryDiscoveryResolver: ({ partyId, inputDigest }) =>
      createLowerDvinaTraceOrdinaryDiscoveryResolver({ partyId, inputDigest,
        loadEnablement: (input) => ordinaryEnablements.load(input),
        ordinaryMaterializationModel }),
    createActionProductionOwner: actionProductionResolverFactory,
    createOrdinaryContainerContentsResolver: ordinaryContainerResolverFactory,
    loadOrdinaryEnablement: (input) => ordinaryEnablements.load(input),
    createSpatialSemanticResolver: spatialSemanticResolverFactory,
    createModeOwnerCapabilities: createLowerDvinaTraceNpcActorStepModeOwnerCapabilities
  });
  const temporalAdvanceOwner = createTemporalAdvanceOwner({
    source_registrations: lowerDvinaTraceTemporalSourceRegistrations([
      ...(config.temporalBoundaryRegistrations ?? []),
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
  const npcRuntimePorts = createNpcRuntimePorts({ roleRunner });
  const runtime = createPhase2RuntimeFactory({
    repository: createLowerDvinaTracePhase2PostgresRepository({
      partyPool, committer, narrationService
    }),
    semanticResolver: createLowerDvinaTraceSemanticResolver({ roleRunner }),
    turnStepModel: createLowerDvinaTraceTurnStepModel({ roleRunner }),
    actionProducedWeaponClassifier:
      createLowerDvinaTraceActionProducedWeaponClassifier({ roleRunner }),
    createTurnStepOrdinaryDiscoveryResolver: ({ partyId, inputDigest }) =>
      createLowerDvinaTraceOrdinaryDiscoveryResolver({ partyId, inputDigest,
        loadEnablement: (input) => ordinaryEnablements.load(input),
        ordinaryMaterializationModel
      }),
    createTurnStepOrdinaryContainerContentsResolver:
      ordinaryContainerResolverFactory,
    ordinaryDiscoveryEnablementMarker: async ({ partyId, scopeRef }) => {
      const enabled = await ordinaryEnablements.load({ partyId, scopeRef });
      if (enabled == null) return null;
      const capabilities =
        enabled.execution_context?.context_bound_capabilities ?? [];
      return Object.freeze({ discovery_available:true,
        sources:Object.freeze(capabilities.map((entry)=>Object.freeze({
          source_ref:entry.candidate_context.target_ref,
          public_name:entry.public_name,
          disclosure_state:entry.disclosure_state }))) });
    },
    createTurnStepActionProductionOwner: actionProductionResolverFactory,
    actionProductionProfile,
    createTurnStepWorldProcessResolver: localFireResolverFactory,
    localFireProfile,
    createTurnStepSpatialSemanticResolver: spatialSemanticResolverFactory,
    spatialSemanticProfile: activeSpatialSemanticProfile,
    createTurnStepAmbientOrdinaryPortionAdmission: ({ committedState }) =>
      createLowerDvinaTraceO2aAmbientPort({
        profile: ordinaryMaterializationProfile, committedState
      }),
    requireTurnStepAmbientOrdinaryAdmission: false,
    createNpcOwnerCapabilities,
    ...npcRuntimePorts,
    runNpcConversationExchange: (input) => runLowerDvinaTraceNpcConversationExchange({
      ...input, npcSemanticModel: npcRuntimePorts.npcSemanticModel,
      temporalAdvanceOwner,
      revalidateStateVersion: input.revalidateStateVersion
    }),
    narrator: createLowerDvinaTracePhase2DurableNarrator({
      partyPool, narrationService
    }),
    randomSourceFactory: createTraceRandomSourceFactory({ env }),
    temporalAdvanceOwner,
    turnStepPackingCalculator: calculatePackingSlots,
    decisionSecret,
    llmTurnBudget: turnBudget,
    llmDiagnostics
  });
  return Object.freeze({ ...runtime, llmDiagnostics });
}

export function createTraceRandomSourceFactory({ env = {} } = {}) {
  const scenarioSeed = env.RUS_DEVELOPER_MODE === 'true'
    ? String(env.RUS_PUBLIC_PLAYTEST_SCENARIO_SEED ?? '').trim() : '';
  return (identity) => createSeededRandomSource(canonicalDigest(scenarioSeed
    ? {
        schema: 'rus.lower_dvina_trace_public_playtest_rng_identity.v1',
        scenario_seed: scenarioSeed,
        request_id: identity.request_id,
        ...(identity.decision_boundary_id == null ? {} : {
          decision_boundary_id: identity.decision_boundary_id
        }),
        ...(identity.check_profile_ref == null ? {} : {
          check_profile_ref: identity.check_profile_ref
        })
      }
    : {
        schema: 'rus.lower_dvina_trace_phase_2_rng_identity.v1', ...identity
      }));
}
