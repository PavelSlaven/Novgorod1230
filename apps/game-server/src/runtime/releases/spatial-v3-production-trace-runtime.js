import { createLowerDvinaTracePhase2PostgresRepository } from
  '../../infrastructure/postgres/lower-dvina-trace-phase-2.js';
import { createLowerDvinaTracePhase2DurableNarrator } from
  '../../infrastructure/postgres/lower-dvina-trace-phase-2-presentation.js';
import { createLowerDvinaTraceNarrationService,
  createLowerDvinaTraceSemanticResolver,
  createLowerDvinaTraceTurnStepModel } from
  '../lower-dvina-trace-phase-2-llm.js';
import { createLowerDvinaTraceActionProducedModel } from
  '../lower-dvina-trace-action-produced-llm.js';
import { createLowerDvinaTraceA1ProductionResolverFactory } from
  './lower-dvina-trace-a1-production.js';
import { createOrdinaryMaterializationModel } from
  '../ordinary-materialization-llm.js';
import { createLowerDvinaTraceO2aAmbientPort } from
  '../lower-dvina-trace-o2a-ambient-port.js';
import { createLowerDvinaTraceO2bProductionResolverFactory } from
  './lower-dvina-trace-o2b-production.js';
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
import { serverError } from '../../errors.js';

export function createTraceTurnRuntime({
  partyPool, committer, env, config, ordinaryMaterializationProfile,
  ordinaryContainerContentsProfile, ordinaryStageBApproval,
  actionProductionProfile,
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
  const roleRunner = createProductionLlmRoleRunner({
    env, telemetry: config.telemetry ?? null
  });
  const narrationService = createLowerDvinaTraceNarrationService({ roleRunner });
  const ordinaryMaterializationModel = createOrdinaryMaterializationModel({
    roleRunner, stageBApprovalReceipt: ordinaryStageBApproval
  });
  const ordinaryEnablements =
    createPostgresOrdinaryMaterializationEnablementRepository({pool:partyPool});
  const ordinaryContainerResolverFactory =
    createLowerDvinaTraceO2bProductionResolverFactory({ pool: partyPool,
      loadedProfile: ordinaryContainerContentsProfile,
      ordinaryMaterializationModel });
  const actionProductionResolverFactory = actionProductionProfile == null
    ? null : createLowerDvinaTraceA1ProductionResolverFactory({ pool: partyPool,
      loadedProfile: actionProductionProfile,
      actionProducedModel:
        createLowerDvinaTraceActionProducedModel({ roleRunner }) });
  return createPhase2RuntimeFactory({
    repository: createLowerDvinaTracePhase2PostgresRepository({
      partyPool, committer
    }),
    semanticResolver: createLowerDvinaTraceSemanticResolver({ roleRunner }),
    turnStepModel: createLowerDvinaTraceTurnStepModel({ roleRunner }),
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
    createTurnStepActionProducedResolver: actionProductionResolverFactory,
    actionProductionProfile,
    createTurnStepAmbientOrdinaryPortionAdmission: ({ committedState }) =>
      createLowerDvinaTraceO2aAmbientPort({
        profile: ordinaryMaterializationProfile, committedState
      }),
    requireTurnStepAmbientOrdinaryAdmission: false,
    ...createNpcRuntimePorts({ roleRunner }),
    narrator: createLowerDvinaTracePhase2DurableNarrator({
      partyPool, narrationService
    }),
    randomSourceFactory: (identity) => createSeededRandomSource(
      canonicalDigest({
        schema: 'rus.lower_dvina_trace_phase_2_rng_identity.v1', ...identity
      })
    ),
    temporalAdvanceOwner: createTemporalAdvanceOwner({
      source_registrations: lowerDvinaTraceTemporalSourceRegistrations(
        config.temporalBoundaryRegistrations ?? []),
      effect_registrations: [
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
