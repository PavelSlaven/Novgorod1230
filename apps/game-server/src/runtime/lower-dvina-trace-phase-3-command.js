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
  inputDigest
}) {
  return [
    createTracePhase3MovementCommand({ contracts, inputDigest }),
    createTracePhase3ConversationCommand({
      contracts,
      inputDigest,
      evidence: false
    }),
    createTracePhase3ConversationCommand({
      contracts,
      inputDigest,
      evidence: true
    })
  ];
}
