import { createTraceTurn10CompanionCommand } from
  './lower-dvina-trace-turn-10-command.js';
import { resolveTraceTurn10Contracts } from
  './lower-dvina-trace-turn-10-contracts.js';

export function createTraceTurn10Runtime({ state, bundle, phase3Contracts,
  phase5Contracts, phase7Contracts, inputDigest, playerConversationModel,
  npcSemanticModel, temporalAdvanceOwner, revalidateStateVersion }) {
  if (phase7Contracts == null) return null;
  const contracts = resolveTraceTurn10Contracts({
    state, bundle, phase3Contracts, phase5Contracts
  });
  const companionTargetRefs = [
    contracts.actors.eremey.instance_id,
    contracts.actors.participatingFisher.instance_id,
    contracts.actors.otherFisher.instance_id
  ];
  return Object.freeze({
    contracts,
    companionTargetRefs,
    matchesOperation: (operation) => matchesCompanionOperation(
      operation, state.actor_id, companionTargetRefs),
    command: createTraceTurn10CompanionCommand({
      contracts, inputDigest, playerConversationModel, npcSemanticModel,
      temporalAdvanceOwner, revalidateStateVersion
    }),
    targetRefs: {
      participatingFisher: contracts.actors.participatingFisher.instance_id,
      otherFisher: contracts.actors.otherFisher.instance_id
    }
  });
}

function matchesCompanionOperation(operation, actorRef, targetRefs) {
  return operation?.op === 'emit_interaction'
    && operation.actor_ref === actorRef
    && operation.interaction_kind === 'request'
    && operation.instrument_refs?.length === 0
    && operation.target_actor_refs?.length === targetRefs.length
    && targetRefs.every((ref) => operation.target_actor_refs.includes(ref));
}
