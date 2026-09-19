import { buildTracePhase2Registry, resolveTracePhase2InheritedContracts } from './lower-dvina-trace-phase-2-runtime-context.js'; import { serverError } from '../errors.js';
import { loadLowerDvinaTraceMaterializationBundle } from '../internal/lower-dvina-trace-phase-1a-bundle.js';
import { isExactLowerDvinaTraceSpatialSemanticProfile } from '../internal/lower-dvina-trace-spatial-semantic-profile.js';
import { loadLowerDvinaTracePhase2Bundle } from '../internal/lower-dvina-trace-phase-2-bundle.js';
import { resolveTracePhase2Contracts } from './lower-dvina-trace-phase-2-contracts.js';
import { createTracePhase8Runtime } from './lower-dvina-trace-phase-8-runtime.js';
import { createTracePhase9Runtime } from './lower-dvina-trace-phase-9-runtime.js';
import { resolveTracePhase10Contracts } from './lower-dvina-trace-phase-10-completion.js';
import { createTraceTurn10Runtime } from './lower-dvina-trace-turn-10-runtime.js';
import { committedTraceScenarioDefinitionRevision } from './lower-dvina-trace-committed-revision.js';
import { buildLowerDvinaTracePhase2Services } from './lower-dvina-trace-phase-2-services.js';
import { projectLowerDvinaTracePlayerSafeState } from './lower-dvina-trace-player-safe-state.js';
import { createLowerDvinaTraceTurnStepGenericOwners } from './lower-dvina-trace-turn-step-generic-owners.js';
import { createStateVersionRevalidator, executeTraceTurnWithDiagnostics, validateConversationDependencies, validatePhase2RuntimeDependencies } from './lower-dvina-trace-phase-2-runtime-input.js';
import { createTraceCombatCommand } from './lower-dvina-trace-combat-command.js';
import { buildTracePhase2TurnRequest, buildTraceTurnWorkflowInput, createTraceTurnRequestExecutor } from './lower-dvina-trace-phase-2-turn-request.js';
import { createLowerDvinaTraceNpcActorStepDirectOperations } from './lower-dvina-trace-npc-actor-step-direct-operations.js';
import { runWithinTurnDeadline } from './llm-turn-budget.js';
import { recoverTracePendingPresentation } from './lower-dvina-trace-presentation-recovery.js';
import { completeTracePhase2Replay, recordTracePhase2TurnContext, runAndPersistTracePhase2Turn } from './lower-dvina-trace-phase-2-workflow.js';
import { createTurnCommandRegistry } from '@rus/turn';
import { TRACE_SCENARIO_ID } from './lower-dvina-trace-session.js';
export function createLowerDvinaTracePhase2Runtime({
  repository, semanticResolver, turnStepModel = null,
  turnStepSemanticGroundingValidator = null, playerConversationModel = null,
  npcSemanticModel = null,
  npcAutonomousModel = null, runNpcConversationExchange = null,
  npcOwnerCapabilities = [], createNpcOwnerCapabilities = null, npcCombatModel = null,
  actionProducedWeaponClassifier = null,
  playerSafeStateProjector = projectLowerDvinaTracePlayerSafeState, narrator,
  randomSourceFactory,
  decisionSecret,
  npcDecisionSelector = null,
  turnStepBodyEventOwner = null,
  turnStepPackingCalculator = null,
  turnStepSemanticActivityOwner = null,
  turnStepOrdinaryDiscoveryResolver = null,
  createTurnStepOrdinaryDiscoveryResolver = null, createTurnStepOrdinaryContainerContentsResolver = null,
  ordinaryDiscoveryEnablementMarker = null,
  ordinaryDiscoveryScopeBinding = null,
  createTurnStepAmbientOrdinaryPortionAdmission = null,
  requireTurnStepAmbientOrdinaryAdmission = false, turnStepAmbientPortionProfileRef = null,
  createTurnStepActionProductionOwner = null,
  actionProductionProfile = null,
  createTurnStepWorldProcessResolver = null, localFireProfile = null,
  createTurnStepSpatialSemanticResolver = null, spatialSemanticProfile = null,
  createTurnStepAuthoredSpatialSemanticResolver = null,
  authoredSpatialSemanticProfile = null,
  createTurnStepBackgroundNpcResolver = null,
  npcSemanticRemainderProfile = null,
  createTurnStepAuthoredBackgroundNpcResolver = null,
  authoredNpcSemanticRemainderProfile = null,
  llmTurnBudget = null, llmDiagnostics = null,
  temporalAdvanceOwner = undefined, now = () => new Date().toISOString(),
  bundleLoader = ({ scenarioDefinitionRevision }) => loadLowerDvinaTraceMaterializationBundle({
    scenarioDefinitionRevision,
  }),
  phase2BundleLoader = loadLowerDvinaTracePhase2Bundle,
  authoredTurnProfile = null,
} = {}) {
  validatePhase2RuntimeDependencies({ repository, semanticResolver, narrator, randomSourceFactory, decisionSecret });
  const executeRequest = createTraceTurnRequestExecutor();
  return Object.freeze({ llmTurnBudget,
    async validateSessionRead({ partyId, turnBudget = llmTurnBudget ?? llmDiagnostics?.turnBudget ?? null }) { await repository.loadPhase2State(partyId, { turnBudget }); return true; },
    async recoverPendingPresentation({ partyId, session, requestId = null }) {
      return executeTraceTurnWithDiagnostics(llmDiagnostics, { party_id: partyId,
        request_id: String(requestId ?? session?.screen?.turn_id ?? partyId) }, () => {
          llmDiagnostics?.recordProgress?.('recovering_saved_result', {
            commit_state: 'committed'
          });
          return recoverTracePendingPresentation({ partyId, session, repository, narrator,
            turnBudget: llmTurnBudget ?? llmDiagnostics?.turnBudget ?? null });
        });
    },
    async submitTurn({ partyId, input = {} }) {
      const { requestId, idempotencyKey, rawText, inputDigest } =
        buildTracePhase2TurnRequest({ partyId, input });
      const executeAttempt = async () => {
        const turnBudget = llmTurnBudget ?? llmDiagnostics?.turnBudget ?? null;
        let replay = await repository.loadPhase2Replay({ partyId, idempotencyKey, turnBudget });
        if (replay) return completeTracePhase2Replay({ partyId, requestId, idempotencyKey,
          rawText, inputDigest, replay, repository, bundleLoader, narrator, turnBudget,
          llmDiagnostics });
        const state = await repository.loadPhase2State(partyId, {
          presentationIdempotencyKey: idempotencyKey,
          turnBudget,
        });
        const authored = state.scenario_id != null
          && state.scenario_id !== TRACE_SCENARIO_ID;
        const scenarioDefinitionRevision = authored ? null
          : committedTraceScenarioDefinitionRevision(state);
        const phase2Bundle = authored ? null
          : await runWithinTurnDeadline(turnBudget, () =>
            phase2BundleLoader({ scenarioDefinitionRevision }));
        if (!authored) validateConversationDependencies({
          scenarioDefinitionRevision,
          playerConversationModel,
          npcSemanticModel,
          npcAutonomousModel, npcOwnerCapabilities, npcCombatModel,
        });
        const bundle = authored
          ? liveWorldTurnBundle({ state, authoredTurnProfile })
          : await runWithinTurnDeadline(turnBudget, () =>
            bundleLoader({ scenarioDefinitionRevision }));
        const contracts = authored
          ? liveWorldTurnContracts(authoredTurnProfile)
          : resolveTracePhase2Contracts({ state, bundle, phase2Bundle });
        recordTracePhase2TurnContext(llmDiagnostics, { partyId, requestId, idempotencyKey, rawText,
          inputDigest, state, bundle, phase2Bundle, contracts,
          playerSafeStateProjector });
        const activeSpatialSemanticProfile = isExactLowerDvinaTraceSpatialSemanticProfile(bundle, spatialSemanticProfile) ? spatialSemanticProfile : null;
        const actionProductionEnabled = authored || [21, 22, 23, 24, 25, 26,
          28, 29, 30, 31, 32, 33, 34, 35].includes(bundle.definition_revision);
        const selectedSpatialResolver = authored
          ? createTurnStepAuthoredSpatialSemanticResolver
          : activeSpatialSemanticProfile == null
            ? null : createTurnStepSpatialSemanticResolver;
        const selectedSpatialProfile = authored
          ? authoredSpatialSemanticProfile : activeSpatialSemanticProfile;
        const selectedBackgroundNpcResolver = authored
          ? createTurnStepAuthoredBackgroundNpcResolver
          : [32, 33, 34, 35].includes(bundle.definition_revision)
            ? createTurnStepBackgroundNpcResolver : null;
        const selectedNpcRemainderProfile = authored
          ? authoredNpcSemanticRemainderProfile
          : [32, 33, 34, 35].includes(bundle.definition_revision)
            ? npcSemanticRemainderProfile : null;
        const { phase3Contracts, phase4Contracts, phase5Contracts,
          phase6Contracts, phase7Contracts } = authored
          ? { phase3Contracts: null, phase4Contracts: null,
              phase5Contracts: null, phase6Contracts: null,
              phase7Contracts: null }
          : resolveTracePhase2InheritedContracts({ state, bundle });
        const createBoundaryNpcOwnerCapabilities =
          typeof createNpcOwnerCapabilities !== 'function' ? null : (boundary) =>
            createNpcOwnerCapabilities({ partyId, requestId, inputDigest, state,
              bundle, phase7Contracts, npcCombatModel, revalidateStateVersion,
              ...boundary });
        const genericOwners = bundle.turn_step_owner_profiles
          ? createLowerDvinaTraceTurnStepGenericOwners({
              profiles: bundle.turn_step_owner_profiles,
              artifactPin: bundle.artifact_pins.turn_step_owner_profiles,
            })
          : null;
        const createBoundaryNpcDirectOperations = phase7Contracts == null ? null : (boundary) => createLowerDvinaTraceNpcActorStepDirectOperations({
              state, phase7Contracts, ...boundary,
              ordinaryResultPolicy: genericOwners?.ordinaryResultPolicy,
              packingCalculator: turnStepPackingCalculator, bodyEventOwner: genericOwners?.bodyEventOwner,
              createAmbientOrdinaryPortionAdmission: createTurnStepAmbientOrdinaryPortionAdmission
            });
        const turnRandomSource = randomSourceFactory({
          party_id: partyId,
          request_id: requestId,
          idempotency_key: idempotencyKey,
        });
        const revalidateStateVersion = createStateVersionRevalidator({
          repository,
          partyId,
          idempotencyKey,
          turnBudget,
        });
        const phase8 = authored ? null : createTracePhase8Runtime({
          state,
          bundle,
          phase3Contracts,
          inputDigest,
          playerConversationModel,
          npcSemanticModel,
          npcCombatModel,
          temporalAdvanceOwner,
          revalidateStateVersion,
        });
        const phase8Contracts = phase8?.contracts ?? null,
          phase9 = authored ? null : createTracePhase9Runtime({
            state,
            bundle,
            conversationBindings: phase3Contracts?.conversationBindings,
            inputDigest,
            playerConversationModel,
            npcSemanticModel,
            temporalAdvanceOwner,
            revalidateStateVersion,
          }),
          phase9Contracts = phase9?.contracts ?? null;
        const phase10Contracts = !authored && [18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35].includes(bundle.definition_revision) ? resolveTracePhase10Contracts({ bundle }) : null;
        const turn10 = !authored && bundle.definition_revision <= 35 ? createTraceTurn10Runtime({
          state,
          bundle,
          phase3Contracts,
          phase5Contracts,
          phase7Contracts,
          inputDigest,
          playerConversationModel,
          npcSemanticModel,
          temporalAdvanceOwner,
          revalidateStateVersion,
        }) : null;
        const turn10Contracts = turn10?.contracts ?? null;
        const combatCommand = authored ? null : createTraceCombatCommand({
          state,
          bundle,
          inputDigest,
          randomSource: turnRandomSource,
          npcCombatModel,
          actionProducedWeaponClassifier,
          revalidateStateVersion,
          temporalAdvanceOwner,
          phase8Contracts,
        });
        const registry = authored ? liveWorldTurnRegistry()
          : buildTracePhase2Registry({
          bundle,
          combatCommand,
          contracts,
          createTurnStepWorldProcessResolver,
          genericOwners,
          idempotencyKey,
          inputDigest,
          localFireProfile,
          npcAutonomousModel,
          npcOwnerCapabilities,
          createBoundaryNpcOwnerCapabilities,
          createBoundaryNpcDirectOperations,
          npcCombatModel,
          npcDecisionSelector,
          npcSemanticModel,
          partyId,
          phase3Contracts,
          phase4Contracts,
          phase5Contracts,
          phase6Contracts,
          phase7Contracts,
          phase8,
          phase9,
          playerConversationModel,
          randomSourceFactory,
          runNpcConversationExchange,
          repository,
          requestId,
          revalidateStateVersion,
          state,
          temporalAdvanceOwner,
          turnBudget,
          turn10,
          turnRandomSource,
        });
        const issuedAt = now();
        const services = buildLowerDvinaTracePhase2Services({
          partyId, requestId, idempotencyKey, inputDigest,
          issuedAt, state, scenarioId: state.scenario_id,
          contracts, phase3Contracts,
          phase4Contracts, phase5Contracts,
          phase6Contracts, phase7Contracts,
          turn10Contracts, phase8Contracts,
          phase9Contracts, phase10Contracts,
          registry, repository,
          semanticResolver, turnStepModel, turnStepSemanticGroundingValidator,
          npcAutonomousModel, npcCombatModel,
          playerSafeStateProjector,
          locationProfiles: bundle.location_topology_set.location_profiles,
          scenePresentation: bundle.scene_presentation ?? null,
          turnStepBodyEventOwner: turnStepBodyEventOwner ?? genericOwners?.bodyEventOwner, turnStepSemanticActivityOwner: turnStepSemanticActivityOwner ?? genericOwners?.semanticActivityOwner,
          turnStepGenericCheckContextOwner: genericOwners?.genericCheckContextOwner, turnStepGenericBodyEffect: genericOwners?.bodyEffect,
          turnStepOrdinaryDiscoveryResolver, createTurnStepOrdinaryDiscoveryResolver,
          createTurnStepOrdinaryContainerContentsResolver, ordinaryDiscoveryEnablementMarker,
          ordinaryDiscoveryScopeBinding,
          createTurnStepActionProductionOwner: actionProductionEnabled
            ? createTurnStepActionProductionOwner : null,
          actionProductionProfile: actionProductionEnabled
            ? actionProductionProfile : null,
          createTurnStepWorldProcessResolver: [22, 23, 24, 25, 26, 28, 29, 30, 31, 32, 33, 34, 35].includes(bundle.definition_revision) ? createTurnStepWorldProcessResolver : null, localFireProfile: [22, 23, 24, 25, 26, 28, 29, 30, 31, 32, 33, 34, 35].includes(bundle.definition_revision) ? localFireProfile : null,
          createTurnStepSpatialSemanticResolver: selectedSpatialResolver,
          spatialSemanticProfile: selectedSpatialProfile,
          createTurnStepBackgroundNpcResolver: selectedBackgroundNpcResolver,
          npcSemanticRemainderProfile: selectedNpcRemainderProfile,
          admitAmbientOrdinaryPortion:
            typeof createTurnStepAmbientOrdinaryPortionAdmission === 'function'
              ? createTurnStepAmbientOrdinaryPortionAdmission({
                  committedState: state,
                })
              : null,
          requireAmbientOrdinaryAdmission: requireTurnStepAmbientOrdinaryAdmission === true,
          turnStepAmbientPortionProfileRef, turnStepOrdinaryResultPolicy: genericOwners?.ordinaryResultPolicy,
          postActionPerceptionProfile:
            bundle.post_action_perception_profile ?? null,
          turnStepApprovedOwners: genericOwners, turnStepPackingCalculator,
          narrator, randomSourceFactory,
          randomSource: turnRandomSource, temporalAdvanceOwner, decisionSecret,
          decisionNow: now, turnBudget, llmDiagnostics,
        });
        return runAndPersistTracePhase2Turn({
          workflowInput: buildTraceTurnWorkflowInput({
            partyId, state, requestId, idempotencyKey, rawText, contracts,
            phase3Contracts, phase4Contracts, phase5Contracts,
            phase7Contracts, turn10Contracts, phase8, phase9Contracts
          }),
          services, issuedAt, requestId, llmDiagnostics, repository, partyId,
          inputDigest, turnBudget,
        });
      };
      return executeRequest({ partyId, idempotencyKey, inputDigest }, () =>
        executeTraceTurnWithDiagnostics(llmDiagnostics, { party_id: partyId, request_id: requestId }, executeAttempt));
    },
  });
}

function liveWorldTurnBundle({ state, authoredTurnProfile }) {
  if (authoredTurnProfile?.profile?.schema
      !== 'rus.live_world_runtime.turn_step_owner_profiles.v1'
    || authoredTurnProfile.profile.status !== 'approved'
    || !authoredTurnProfile.pin?.digest) {
    throw serverError('LIVE_WORLD_TURN_PROFILE_MISSING',
      'Approved live-world turn profile is required.', { status: 409 });
  }
  const locationRef = state.position?.location_ref;
  const displayName = state.current_visible_context?.visible_scene
    ?? state.visible_context?.visible_scene ?? locationRef;
  return Object.freeze({
    definition_revision: null,
    profile: 'live_world_authored',
    artifact_pins: {
      turn_step_owner_profiles: structuredClone(authoredTurnProfile.pin)
    },
    turn_step_owner_profiles: structuredClone(authoredTurnProfile.profile),
    location_topology_set: { location_profiles: [{
      location_profile_id: locationRef, display_name: displayName
    }] },
    calendar_profile: null,
    scene_presentation: null,
    post_action_perception_profile: null
  });
}

function liveWorldTurnContracts(authoredTurnProfile) {
  return Object.freeze({
    activity: Object.freeze({
      duration_minutes: 1,
      nearest_temporal_boundary_rule: 'split_before_earliest_boundary'
    }),
    activityPin: Object.freeze({
      id: authoredTurnProfile.profile.profile_set_id,
      version: authoredTurnProfile.profile.revision,
      digest: authoredTurnProfile.pin.digest
    }),
    calendarProfile: null
  });
}

function liveWorldTurnRegistry() {
  const blocked = () => ({ status: 'blocked', can_attempt: false,
    check_requests: [] });
  return createTurnCommandRegistry([{
    command_id: 'live_world_semantic_boundary',
    option_id: 'live_world_semantic_boundary',
    label: 'Свободное действие',
    matches: () => false,
    semantic_binding: {
      binding_id: 'live_world_semantic_boundary',
      operation: 'request_world_process',
      matches: () => false
    },
    availability: blocked,
    consequence: blocked,
    writeTargets: () => []
  }]);
}
