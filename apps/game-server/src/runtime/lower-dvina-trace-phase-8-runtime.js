import { resolveTracePhase8Contracts } from
  './lower-dvina-trace-phase-8-contracts.js';
import { createTracePhase8Commands } from './lower-dvina-trace-phase-8.js';

export function createTracePhase8Runtime({ state, bundle, phase3Contracts,
  inputDigest, playerConversationModel, npcSemanticModel, npcCombatModel,
  temporalAdvanceOwner, revalidateStateVersion }) {
  if (![16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31].includes(bundle.definition_revision)
      || !hasEscortCommitment(state)) return null;
  const contracts = resolveTracePhase8Contracts({ state, bundle,
    conversationBindings: phase3Contracts?.conversationBindings });
  return Object.freeze({ contracts, commands: createTracePhase8Commands({
    contracts, inputDigest, playerConversationModel, npcSemanticModel,
    npcCombatModel, temporalAdvanceOwner, revalidateStateVersion }),
  targetRefs: { zhdankoStorehouse: contracts.ids.storehouse,
    zhdanko: contracts.actors.zhdanko.instance_id } });
}

function hasEscortCommitment(state) {
  return Array.isArray(state?.route_participant_commitments)
    && state.route_participant_commitments.some(
      ({ role }) => role === 'escort');
}
