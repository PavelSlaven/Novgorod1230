import { createTurnCommandRegistry } from '@rus/turn';
import { createTracePhase2InspectionCommand } from './lower-dvina-trace-phase-2-command.js';
import { createTracePhase3Commands } from './lower-dvina-trace-phase-3-command.js';
import { createTracePhase4Commands } from './lower-dvina-trace-phase-4-command.js';
import { createTracePhase5Command } from './lower-dvina-trace-phase-5-command.js';
import { createTracePhase6CarryCommand } from './lower-dvina-trace-phase-6-carry.js';
import { createTracePhase7FireRestCommand } from './lower-dvina-trace-phase-7-command.js';
import { createStateVersionRevalidator } from './lower-dvina-trace-phase-2-runtime-input.js';
import { createNpcSocialCheckResolver } from './lower-dvina-trace-npc-social-check.js';
import { buildTracePhase2TargetRefs } from './lower-dvina-trace-phase-2-target-refs.js';
import { bindLowerDvinaTraceTurnStepCommands } from './lower-dvina-trace-turn-step-bindings.js';
import { projectLowerDvinaTraceF1NpcCapability } from './releases/lower-dvina-trace-f1-production.js';
import { resolveTracePhase3Contracts } from './lower-dvina-trace-phase-3-contracts.js';
import { resolveTracePhase4Contracts } from './lower-dvina-trace-phase-4-contracts.js';
import { resolveTracePhase5Contracts } from './lower-dvina-trace-phase-5-contracts.js';
import { resolveTracePhase6Contracts } from './lower-dvina-trace-phase-6-contracts.js';
import { resolveTracePhase7Contracts } from './lower-dvina-trace-phase-7-contracts.js';
import { createTraceKnownRouteCommands } from
  './lower-dvina-trace-known-route-command.js';

export function resolveTracePhase2InheritedContracts({ state, bundle }) {
  const revision = bundle.definition_revision;
  const ready = ![24, 25, 26].includes(revision)
    || state.first_entry_preparation?.spatial_v3?.target?.status === 'prepared';
  const enabled = (first) => revision >= first && revision <= 26;
  return {
    phase3Contracts: enabled(9) ? resolveTracePhase3Contracts({ state, bundle }) : null,
    phase4Contracts: enabled(10) && ready ? resolveTracePhase4Contracts({ state, bundle }) : null,
    phase5Contracts: enabled(11) && ready ? resolveTracePhase5Contracts({ state, bundle }) : null,
    phase6Contracts: enabled(12) && ready ? resolveTracePhase6Contracts({ bundle }) : null,
    phase7Contracts: enabled(15) && ready ? resolveTracePhase7Contracts({ state, bundle }) : null,
  };
}

export function buildTracePhase2Registry(context) {
  const {
    bundle,
    combatCommand,
    contracts,
    createTurnStepWorldProcessResolver,
    createBoundaryNpcOwnerCapabilities,
    createBoundaryNpcDirectOperations,
    genericOwners,
    idempotencyKey,
    inputDigest,
    localFireProfile,
    npcAutonomousModel,
    npcOwnerCapabilities,
    directHandlers,
    directOperationContract,
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
  } = context;
  const commands = [
    createTracePhase2InspectionCommand({ contracts, inputDigest }),
    ...(phase3Contracts
      ? createTracePhase3Commands({
          contracts: phase3Contracts,
          inputDigest,
          playerConversationModel,
          npcSemanticModel,
          temporalAdvanceOwner,
          revalidateStateVersion: createStateVersionRevalidator({ repository,
            partyId, idempotencyKey, turnBudget }),
        })
      : []),
    ...(phase4Contracts
      ? createTracePhase4Commands({
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
            idempotencyKey,
          }),
          temporalAdvanceOwner,
          revalidateStateVersion: createStateVersionRevalidator({
            repository,
            partyId,
            idempotencyKey,
            turnBudget,
          }),
        })
      : []),
    ...(phase5Contracts
      ? [
          createTracePhase5Command({
            contracts: phase5Contracts,
            inputDigest,
          }),
        ]
      : []),
    ...(phase6Contracts
      ? [
          createTracePhase6CarryCommand({
            contracts: phase6Contracts,
            inputDigest,
            temporalAdvanceOwner,
          }),
        ]
      : []),
    ...(phase7Contracts
      ? [
          createTracePhase7FireRestCommand({
            contracts: phase7Contracts,
            conversationBindings: phase3Contracts?.conversationBindings ?? null,
            conversationActivity: phase3Contracts?.talk ?? null,
            preparedFollowupRef: turn10?.command.command_id ?? null,
            inputDigest,
            npcAutonomousModel,
            semanticActivityScheduleOwner: genericOwners?.semanticActivityScheduleOwner,
            genericCheckContextOwner: genericOwners?.genericCheckContextOwner,
            localFireProfile: [22, 23, 24, 25, 26].includes(bundle.definition_revision) ? localFireProfile : null,
            worldProcessResolver:
              [22, 23, 24, 25, 26].includes(bundle.definition_revision) && typeof createTurnStepWorldProcessResolver === 'function' && localFireProfile?.profile?.status === 'approved'
                ? createTurnStepWorldProcessResolver({ partyId, requestId, inputDigest })
                : null,
            projectNpcWorldProcessCapability: projectLowerDvinaTraceF1NpcCapability,
            npcOwnerCapabilities,
            directHandlers,
            directOperationContract,
            createBoundaryNpcOwnerCapabilities,
            createBoundaryNpcDirectOperations,
            runNpcConversationExchange: typeof runNpcConversationExchange !== 'function'
              ? null
              : (input) => runNpcConversationExchange({ ...input,
                revalidateStateVersion }),
            randomSource: turnRandomSource,
            temporalAdvanceOwner,
            revalidateStateVersion,
          }),
        ]
      : []),
    ...(turn10 ? [turn10.command] : []),
    ...(phase8?.commands ?? []),
    ...(phase9?.commands ?? []),
    ...(combatCommand ? [combatCommand] : []),
  ];
  const boundCommands = bindLowerDvinaTraceTurnStepCommands({
      commands,
      bundle,
      targetRefs: buildTracePhase2TargetRefs({ state, contracts, phase3Contracts, phase4Contracts, phase5Contracts, turn10, phase8, phase9 }),
    });
  const registry = createTurnCommandRegistry([
    ...boundCommands,
    ...(phase3Contracts == null || bundle.definition_revision < 13 ? [] : createTraceKnownRouteCommands({
      state, contracts: phase3Contracts, inputDigest,
      authoredCommands: boundCommands
    }))
  ]);

  return registry;
}
