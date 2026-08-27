import { runTurnWorkflow } from '@rus/turn';
import { buildTracePhase2Registry, resolveTracePhase2InheritedContracts } from './lower-dvina-trace-phase-2-runtime-context.js';
import { serverError } from '../errors.js';
import { loadLowerDvinaTraceMaterializationBundle } from '../internal/lower-dvina-trace-phase-1a-bundle.js';
import { isExactLowerDvinaTraceSpatialSemanticProfile } from '../internal/lower-dvina-trace-spatial-semantic-profile.js';
import { loadLowerDvinaTracePhase2Bundle } from '../internal/lower-dvina-trace-phase-2-bundle.js';
import { resolveTracePhase2Contracts } from './lower-dvina-trace-phase-2-contracts.js';
import { createTracePhase8Runtime } from './lower-dvina-trace-phase-8-runtime.js';
import { createTracePhase9Runtime } from './lower-dvina-trace-phase-9-runtime.js';
import { resolveTracePhase10Contracts } from './lower-dvina-trace-phase-10-completion.js';
import { completePendingTracePhase10Replay } from './lower-dvina-trace-phase-10-replay.js';
import { createTraceTurn10Runtime } from './lower-dvina-trace-turn-10-runtime.js';
import { committedTraceScenarioDefinitionRevision } from './lower-dvina-trace-committed-revision.js';
import { buildLowerDvinaTracePhase2Services } from './lower-dvina-trace-phase-2-services.js';
import { projectLowerDvinaTracePlayerSafeState } from './lower-dvina-trace-player-safe-state.js';
import { createLowerDvinaTraceTurnStepGenericOwners } from './lower-dvina-trace-turn-step-generic-owners.js';
import { createStateVersionRevalidator, executeTraceTurnWithDiagnostics, validateConversationDependencies, validatePhase2RuntimeDependencies } from './lower-dvina-trace-phase-2-runtime-input.js';
import { createTraceCombatCommand } from './lower-dvina-trace-combat-command.js';
import { buildTracePhase2TurnRequest } from './lower-dvina-trace-phase-2-turn-request.js';
import { createLowerDvinaTraceNpcActorStepDirectOperations } from './lower-dvina-trace-npc-actor-step-direct-operations.js';
export function createLowerDvinaTracePhase2Runtime({
  repository, semanticResolver, turnStepModel = null,
  playerConversationModel = null, npcSemanticModel = null, npcAutonomousModel = null, runNpcConversationExchange = null,
  npcOwnerCapabilities = [], createNpcOwnerCapabilities = null, npcCombatModel = null,
  actionProducedWeaponClassifier = null,
  playerSafeStateProjector = projectLowerDvinaTracePlayerSafeState,
  narrator,
  randomSourceFactory,
  decisionSecret,
  npcDecisionSelector = null,
  turnStepBodyEventOwner = null,
  turnStepPackingCalculator = null,
  turnStepSemanticActivityOwner = null,
  turnStepOrdinaryDiscoveryResolver = null,
  createTurnStepOrdinaryDiscoveryResolver = null, createTurnStepOrdinaryContainerContentsResolver = null,
  ordinaryDiscoveryEnablementMarker = null,
  createTurnStepAmbientOrdinaryPortionAdmission = null,
  requireTurnStepAmbientOrdinaryAdmission = false,
  createTurnStepActionProductionOwner = null,
  actionProductionProfile = null,
  createTurnStepWorldProcessResolver = null, localFireProfile = null,
  createTurnStepSpatialSemanticResolver = null,
  spatialSemanticProfile = null,
  llmDiagnostics = null,
  temporalAdvanceOwner = undefined,
  now = () => new Date().toISOString(),
  bundleLoader = ({ scenarioDefinitionRevision }) => loadLowerDvinaTraceMaterializationBundle({
    scenarioDefinitionRevision,
  }),
  phase2BundleLoader = loadLowerDvinaTracePhase2Bundle,
} = {}) {
  validatePhase2RuntimeDependencies({ repository, semanticResolver, narrator, randomSourceFactory, decisionSecret });
  return Object.freeze({
    async validateSessionRead({ partyId }) {
      await repository.loadPhase2State(partyId);
      return true;
    },
    async submitTurn({ partyId, input = {} }) {
      const { requestId, idempotencyKey, rawText, inputDigest } =
        buildTracePhase2TurnRequest({ partyId, input });
      const executeAttempt = async () => {
        let replay = await repository.loadPhase2Replay({
          partyId,
          idempotencyKey,
        });
        if (replay) {
          if (replay.input_digest !== inputDigest) {
            throw serverError('TRACE_PHASE_2_IDEMPOTENCY_CONFLICT', 'The idempotency identity is already bound to another input.', { status: 409 });
          }
          replay = await completePendingTracePhase10Replay({
            partyId,
            idempotencyKey,
            replay,
            repository,
            bundleLoader,
          });
          return repository.replayPhase2Turn ? repository.replayPhase2Turn({ partyId, replay, narrator }) : replay.public_result;
        }
        const [state, phase2Bundle] = await Promise.all([
          repository.loadPhase2State(partyId, {
            presentationIdempotencyKey: idempotencyKey,
          }),
          phase2BundleLoader(),
        ]);
        const scenarioDefinitionRevision = committedTraceScenarioDefinitionRevision(state);
        validateConversationDependencies({
          scenarioDefinitionRevision,
          playerConversationModel,
          npcSemanticModel,
          npcAutonomousModel, npcOwnerCapabilities, npcCombatModel,
        });
        const bundle = await bundleLoader({ scenarioDefinitionRevision });
        const contracts = resolveTracePhase2Contracts({
          state,
          bundle,
          phase2Bundle,
        });
        const activeSpatialSemanticProfile = isExactLowerDvinaTraceSpatialSemanticProfile(bundle, spatialSemanticProfile) ? spatialSemanticProfile : null;
        const { phase3Contracts, phase4Contracts, phase5Contracts, phase6Contracts, phase7Contracts } = resolveTracePhase2InheritedContracts({ state, bundle });
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
        });
        const phase8 = createTracePhase8Runtime({
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
        const phase8Contracts = phase8?.contracts ?? null, phase9 = createTracePhase9Runtime({
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
        const phase10Contracts = [18, 19, 20, 21, 22, 23, 24, 25].includes(bundle.definition_revision) ? resolveTracePhase10Contracts({ bundle }) : null;
        const turn10 = createTraceTurn10Runtime({
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
        });
        const turn10Contracts = turn10?.contracts ?? null;
        const combatCommand = createTraceCombatCommand({
          state,
          bundle,
          inputDigest,
          randomSource: turnRandomSource,
          npcCombatModel,
          actionProducedWeaponClassifier,
          revalidateStateVersion,
          temporalAdvanceOwner,
        });
        const registry = buildTracePhase2Registry({
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
          turn10,
          turnRandomSource,
        });
        const issuedAt = now(),
          result = await runTurnWorkflow(
            {
              party_id: partyId,
              turn_number: Number(state.party_state.turn_number) + 1,
              request_id: requestId,
              idempotency_key: idempotencyKey,
              raw_text: rawText,
              routing_context: {
                actor_id: state.actor_id,
                state_version: state.party_state.state_version,
                policy_id: 'lower_dvina_trace_semantic_intent',
                policy_version: '1',
                policy_pins: [
                  contracts.activityPin, ...(phase3Contracts?.activityPins ?? []),
                  ...(phase4Contracts?.activityPins ?? []), ...(phase5Contracts?.activityPins ?? []),
                  ...(phase7Contracts ? [phase7Contracts.activityPin] : []),
                  ...(turn10Contracts ? [turn10Contracts.activityPin] : []),
                  ...(phase8?.contracts?.activityPins ?? []), ...(phase9Contracts?.pins ?? []),
                ],
              },
            },
            buildLowerDvinaTracePhase2Services({
              partyId,
              requestId,
              idempotencyKey,
              inputDigest,
              issuedAt,
              state,
              contracts,
              phase3Contracts,
              phase4Contracts,
              phase5Contracts,
              phase6Contracts,
              phase7Contracts,
              turn10Contracts,
              phase8Contracts,
              phase9Contracts,
              phase10Contracts,
              registry,
              repository,
              semanticResolver,
              turnStepModel,
              npcAutonomousModel,
              npcCombatModel,
              playerSafeStateProjector,
              locationProfiles: bundle.location_topology_set.location_profiles,
              turnStepBodyEventOwner: turnStepBodyEventOwner ?? genericOwners?.bodyEventOwner,
              turnStepSemanticActivityOwner: turnStepSemanticActivityOwner ?? genericOwners?.semanticActivityOwner,
              turnStepGenericCheckContextOwner: genericOwners?.genericCheckContextOwner,
              turnStepGenericBodyEffect: genericOwners?.bodyEffect,
              turnStepOrdinaryDiscoveryResolver,
              createTurnStepOrdinaryDiscoveryResolver,
              createTurnStepOrdinaryContainerContentsResolver,
              ordinaryDiscoveryEnablementMarker,
              createTurnStepActionProductionOwner: [21, 22, 23, 24, 25].includes(bundle.definition_revision) ? createTurnStepActionProductionOwner : null,
              actionProductionProfile: [21, 22, 23, 24, 25].includes(bundle.definition_revision) ? actionProductionProfile : null,
              createTurnStepWorldProcessResolver: [22, 23, 24, 25].includes(bundle.definition_revision) ? createTurnStepWorldProcessResolver : null,
              localFireProfile: [22, 23, 24, 25].includes(bundle.definition_revision) ? localFireProfile : null,
              createTurnStepSpatialSemanticResolver:
                activeSpatialSemanticProfile == null
                  ? null : createTurnStepSpatialSemanticResolver,
              spatialSemanticProfile: activeSpatialSemanticProfile,
              admitAmbientOrdinaryPortion:
                typeof createTurnStepAmbientOrdinaryPortionAdmission === 'function'
                  ? createTurnStepAmbientOrdinaryPortionAdmission({
                      committedState: state,
                    })
                  : null,
              requireAmbientOrdinaryAdmission: requireTurnStepAmbientOrdinaryAdmission === true,
              turnStepOrdinaryResultPolicy: genericOwners?.ordinaryResultPolicy,
              turnStepApprovedOwners: genericOwners,
              turnStepPackingCalculator,
              narrator,
              randomSourceFactory,
              randomSource: turnRandomSource,
              decisionSecret,
              decisionNow: now,
            }),
            { now: issuedAt, requestId },
          );
        return repository.persistPhase2Screen({
          partyId,
          inputDigest,
          result,
        });
      };
      return executeTraceTurnWithDiagnostics(llmDiagnostics,
        { party_id: partyId, request_id: requestId }, executeAttempt);
    },
  });
}
