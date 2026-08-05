import {
  tracePhase3PreconditionSatisfied
} from './lower-dvina-trace-phase-3-admission.js';
import {
  createTracePhase3ConversationCommand
} from './lower-dvina-trace-phase-3-conversation-command.js';
import {
  createTracePhase3MovementCommand
} from './lower-dvina-trace-phase-3-movement-command.js';

export { tracePhase3PreconditionSatisfied };

export function createTracePhase3Commands({
  contracts,
  inputDigest,
  playerConversationModel = null,
  npcSemanticModel = null,
  temporalAdvanceOwner = null,
  revalidateStateVersion = null
}) {
  return [
    createTracePhase3MovementCommand({ contracts, inputDigest }),
    createTracePhase3ConversationCommand({
      contracts,
      inputDigest,
      evidence: false,
      playerConversationModel,
      npcSemanticModel,
      temporalAdvanceOwner,
      revalidateStateVersion
    }),
    createTracePhase3ConversationCommand({
      contracts,
      inputDigest,
      evidence: true,
      playerConversationModel,
      npcSemanticModel,
      temporalAdvanceOwner,
      revalidateStateVersion
    })
  ];
}
