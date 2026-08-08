import { createTraceTurn10CompanionCommand } from
  './lower-dvina-trace-turn-10-command.js';
import { resolveTraceTurn10Contracts } from
  './lower-dvina-trace-turn-10-contracts.js';

export function createTraceTurn10Runtime({ state, bundle, phase3Contracts,
  phase5Contracts, phase7Contracts, inputDigest, playerConversationModel,
  npcSemanticModel, revalidateStateVersion }) {
  if (phase7Contracts == null) return null;
  const contracts = resolveTraceTurn10Contracts({
    state, bundle, phase3Contracts, phase5Contracts
  });
  return Object.freeze({
    contracts,
    command: createTraceTurn10CompanionCommand({
      contracts, inputDigest, playerConversationModel, npcSemanticModel,
      revalidateStateVersion
    }),
    targetRefs: {
      participatingFisher: contracts.actors.participatingFisher.instance_id,
      otherFisher: contracts.actors.otherFisher.instance_id
    }
  });
}
