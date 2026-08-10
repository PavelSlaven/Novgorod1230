import { resolveTracePhase8Contracts } from
  './lower-dvina-trace-phase-8-contracts.js';
import { createTracePhase8Commands } from './lower-dvina-trace-phase-8.js';

export function createTracePhase8Runtime({ state, bundle, phase3Contracts,
  inputDigest, playerConversationModel, npcSemanticModel, npcCombatModel,
  temporalAdvanceOwner, revalidateStateVersion }) {
  if (bundle.definition_revision !== 16) return null;
  const contracts = resolveTracePhase8Contracts({ state, bundle,
    conversationBindings: phase3Contracts?.conversationBindings });
  return Object.freeze({ contracts, commands: createTracePhase8Commands({
    contracts, inputDigest, playerConversationModel, npcSemanticModel,
    npcCombatModel, temporalAdvanceOwner, revalidateStateVersion }),
  targetRefs: { zhdankoStorehouse: contracts.ids.storehouse,
    zhdanko: contracts.actors.zhdanko.instance_id } });
}
