import { canonicalDigest } from '@rus/materialization';
import { createTurnCommandRegistry, runTurnWorkflow } from '@rus/turn';
import { serverError } from '../errors.js';
import { loadLowerDvinaTraceMaterializationBundle } from '../internal/lower-dvina-trace-phase-1a-bundle.js';
import { loadLowerDvinaTracePhase2Bundle } from '../internal/lower-dvina-trace-phase-2-bundle.js';
import { createTracePhase2InspectionCommand } from './lower-dvina-trace-phase-2-command.js';
import { resolveTracePhase2Contracts } from './lower-dvina-trace-phase-2-contracts.js';
import { resolveTracePhase3Contracts } from './lower-dvina-trace-phase-3-contracts.js';
import { createTracePhase3Commands } from './lower-dvina-trace-phase-3-command.js';
import { createTracePhase4Commands } from './lower-dvina-trace-phase-4-command.js';
import { resolveTracePhase4Contracts } from './lower-dvina-trace-phase-4-contracts.js';
import { createTracePhase5Command } from './lower-dvina-trace-phase-5-command.js';
import { resolveTracePhase5Contracts } from './lower-dvina-trace-phase-5-contracts.js';
import { resolveTracePhase6Contracts } from './lower-dvina-trace-phase-6-contracts.js';
import { createTracePhase6CarryCommand } from './lower-dvina-trace-phase-6-carry.js';
import { resolveTracePhase7Contracts } from './lower-dvina-trace-phase-7-contracts.js';
import { createTracePhase7FireRestCommand } from './lower-dvina-trace-phase-7-command.js';
import { createTracePhase8Runtime } from './lower-dvina-trace-phase-8-runtime.js';
import { createTraceTurn10Runtime } from './lower-dvina-trace-turn-10-runtime.js';
import { committedTraceScenarioDefinitionRevision } from './lower-dvina-trace-committed-revision.js'; import { buildLowerDvinaTracePhase2Services } from './lower-dvina-trace-phase-2-services.js';
import { bindLowerDvinaTraceTurnStepCommands } from './lower-dvina-trace-turn-step-bindings.js';
import { projectLowerDvinaTracePlayerSafeState } from './lower-dvina-trace-player-safe-state.js'; import { createLowerDvinaTraceTurnStepGenericOwners } from './lower-dvina-trace-turn-step-generic-owners.js';
import { createStateVersionRevalidator, executeTraceTurnWithAutonomousRetry, requiredTraceTurnText, validateConversationDependencies, validatePhase2RuntimeDependencies } from './lower-dvina-trace-phase-2-runtime-input.js';
import { createNpcSocialCheckResolver } from './lower-dvina-trace-npc-social-check.js'; import { createTraceCombatCommand } from './lower-dvina-trace-combat-command.js';
import { buildTracePhase2TargetRefs } from './lower-dvina-trace-phase-2-target-refs.js'; export function createLowerDvinaTracePhase2Runtime({
  repository,
  semanticResolver,
  turnStepModel = null,
  playerConversationModel = null,
  npcSemanticModel = null,
  npcAutonomousModel = null,
  npcCombatModel = null,
  playerSafeStateProjector = projectLowerDvinaTracePlayerSafeState,
  narrator,
  randomSourceFactory,
  decisionSecret,
  npcDecisionSelector = null,
  turnStepBodyEventOwner = null,
  turnStepPackingCalculator = null,
  turnStepSemanticActivityOwner = null,
  temporalAdvanceOwner = undefined,
  now = () => new Date().toISOString(),
  bundleLoader = ({ scenarioDefinitionRevision }) =>
    loadLowerDvinaTraceMaterializationBundle({
      scenarioDefinitionRevision
    }),
  phase2BundleLoader = loadLowerDvinaTracePhase2Bundle
} = {}) {
  validatePhase2RuntimeDependencies({
    repository,
    semanticResolver,
    narrator,
    randomSourceFactory,
    decisionSecret
  });
  return Object.freeze({
    async validateSessionRead({ partyId }) {
      await repository.loadPhase2State(partyId);
      return true;
    },
    async submitTurn({ partyId, input = {} }) {
      const requestId = requiredTraceTurnText(
        input.request_id,
        'TRACE_TURN_REQUEST_ID_REQUIRED'
      );
      const idempotencyKey = requiredTraceTurnText(
        input.idempotency_key ?? input.request_id,
        'TRACE_TURN_IDEMPOTENCY_KEY_REQUIRED'
      );
      const rawText = requiredTraceTurnText(
        input.raw_text,
        'TRACE_TURN_RAW_TEXT_REQUIRED'
      );
      const inputDigest = canonicalDigest({
        party_id: partyId,
        request_id: requestId,
        idempotency_key: idempotencyKey,
        raw_text: rawText
      });
      const executeAttempt = async () => {
      const replay = await repository.loadPhase2Replay({
        partyId,
        idempotencyKey
      });
      if (replay) {
        if (replay.input_digest !== inputDigest) {
          throw serverError(
            'TRACE_PHASE_2_IDEMPOTENCY_CONFLICT',
            'The idempotency identity is already bound to another input.',
            { status: 409 }
          );
        }
        return repository.replayPhase2Turn
          ? repository.replayPhase2Turn({ partyId, replay, narrator })
          : replay.public_result;
      }
      const [state, phase2Bundle] = await Promise.all([
        repository.loadPhase2State(partyId, {
          presentationIdempotencyKey: idempotencyKey
        }),
        phase2BundleLoader()
      ]);
      const scenarioDefinitionRevision =
        committedTraceScenarioDefinitionRevision(state);
      validateConversationDependencies({
        scenarioDefinitionRevision,
        playerConversationModel,
        npcSemanticModel,
        npcAutonomousModel,
        npcCombatModel
      });
      const bundle = await bundleLoader({ scenarioDefinitionRevision });
      const contracts = resolveTracePhase2Contracts({
        state,
        bundle,
        phase2Bundle
      });
      const phase3Contracts = [9, 10, 11, 12, 13, 14, 15, 16].includes(
        bundle.definition_revision
      )
        ? resolveTracePhase3Contracts({ state, bundle })
        : null;
      const phase4Contracts = [10, 11, 12, 13, 14, 15, 16].includes(
        bundle.definition_revision
      )
        ? resolveTracePhase4Contracts({ state, bundle })
        : null;
      const phase5Contracts = [11, 12, 13, 14, 15, 16].includes(
        bundle.definition_revision
      )
        ? resolveTracePhase5Contracts({ state, bundle })
        : null;
      const phase6Contracts = [12, 13, 14, 15, 16].includes(bundle.definition_revision)
        ? resolveTracePhase6Contracts({ bundle })
        : null;
      const genericOwners = bundle.turn_step_owner_profiles
        ? createLowerDvinaTraceTurnStepGenericOwners({
            profiles: bundle.turn_step_owner_profiles,
            artifactPin: bundle.artifact_pins.turn_step_owner_profiles
          })
        : null;
      const turnRandomSource = randomSourceFactory({ party_id: partyId,
        request_id: requestId, idempotency_key: idempotencyKey });
      const phase7Contracts = [15, 16].includes(bundle.definition_revision)
        ? resolveTracePhase7Contracts({ state, bundle }) : null;
      const revalidateStateVersion = createStateVersionRevalidator({ repository, partyId, idempotencyKey });
      const phase8 = createTracePhase8Runtime({ state, bundle,
        phase3Contracts, inputDigest, playerConversationModel,
        npcSemanticModel, npcCombatModel, temporalAdvanceOwner,
        revalidateStateVersion });
      const phase8Contracts = phase8?.contracts ?? null;
      const turn10 = createTraceTurn10Runtime({
        state, bundle, phase3Contracts, phase5Contracts, phase7Contracts,
        inputDigest, playerConversationModel, npcSemanticModel,
        temporalAdvanceOwner, revalidateStateVersion
      });
      const turn10Contracts = turn10?.contracts ?? null;
      const combatCommand = createTraceCombatCommand({
        state, bundle, inputDigest, randomSource: turnRandomSource,
        npcCombatModel, revalidateStateVersion
      });
      const commands = [
        createTracePhase2InspectionCommand({ contracts, inputDigest }),
        ...(phase3Contracts ? createTracePhase3Commands({
          contracts: phase3Contracts,
          inputDigest,
          playerConversationModel,
          npcSemanticModel,
          temporalAdvanceOwner,
          revalidateStateVersion: createStateVersionRevalidator({ repository,
            partyId, idempotencyKey })
        }) : []),
        ...(phase4Contracts ? createTracePhase4Commands({
          contracts: phase4Contracts,
          inputDigest,
          selectNpcDecision: npcDecisionSelector,
          playerConversationModel,
          npcSemanticModel,
          npcCombatModel,
          npcSocialCheckResolver: createNpcSocialCheckResolver({
            contracts: phase4Contracts,
            randomSourceFactory,
            partyId,
            requestId,
            idempotencyKey
          }),
          temporalAdvanceOwner,
          revalidateStateVersion: createStateVersionRevalidator({
            repository,
            partyId,
            idempotencyKey
          })
        }) : []),
        ...(phase5Contracts ? [createTracePhase5Command({
          contracts: phase5Contracts,
          inputDigest
        })] : []),
        ...(phase6Contracts ? [createTracePhase6CarryCommand({
          contracts: phase6Contracts, inputDigest,
          temporalAdvanceOwner
        })] : []),
        ...(phase7Contracts ? [createTracePhase7FireRestCommand({
          contracts: phase7Contracts,
          continuationTargetRefs: turn10?.companionTargetRefs ?? [],
          inputDigest,
          npcAutonomousModel,
          semanticActivityScheduleOwner:
            genericOwners?.semanticActivityScheduleOwner,
          genericCheckContextOwner: genericOwners?.genericCheckContextOwner,
          randomSource: turnRandomSource,
          temporalAdvanceOwner,
          revalidateStateVersion
        })] : []),
        ...(turn10 ? [turn10.command] : []),
        ...(phase8?.commands ?? []),
        ...(combatCommand ? [combatCommand] : [])
      ];
      const registry = createTurnCommandRegistry(
        bindLowerDvinaTraceTurnStepCommands({
          commands,
          bundle,
          targetRefs: buildTracePhase2TargetRefs({ state, contracts,
            phase3Contracts, phase4Contracts, phase5Contracts, turn10, phase8 })
        })
      );
      const issuedAt = now();
      const result = await runTurnWorkflow({
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
            contracts.activityPin,
            ...(phase3Contracts?.activityPins ?? []),
            ...(phase4Contracts?.activityPins ?? []),
            ...(phase5Contracts?.activityPins ?? []),
            ...(phase7Contracts ? [phase7Contracts.activityPin] : []),
            ...(turn10Contracts ? [turn10Contracts.activityPin] : []),
            ...(phase8?.contracts?.activityPins ?? [])
          ]
        }
      }, buildLowerDvinaTracePhase2Services({
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
        registry,
        repository,
        semanticResolver,
        turnStepModel,
        npcAutonomousModel,
        npcCombatModel,
        playerSafeStateProjector,
        turnStepBodyEventOwner:
          turnStepBodyEventOwner ?? genericOwners?.bodyEventOwner,
        turnStepSemanticActivityOwner:
          turnStepSemanticActivityOwner ?? genericOwners?.semanticActivityOwner,
        turnStepGenericCheckContextOwner:
          genericOwners?.genericCheckContextOwner,
        turnStepGenericBodyEffect: genericOwners?.bodyEffect,
        turnStepOrdinaryResultPolicy: genericOwners?.ordinaryResultPolicy,
        turnStepApprovedOwners: genericOwners,
        turnStepPackingCalculator,
        narrator,
        randomSourceFactory,
        randomSource: turnRandomSource,
        decisionSecret,
        decisionNow: now
      }), {
        now: issuedAt,
        requestId
      });
      return repository.persistPhase2Screen({
        partyId,
        inputDigest,
        result
      });
      };
      return executeTraceTurnWithAutonomousRetry(executeAttempt);
    }
  });
}
