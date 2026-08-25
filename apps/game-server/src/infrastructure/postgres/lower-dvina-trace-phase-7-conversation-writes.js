import {
  appendNpcSemanticConversationWrites,
  buildNpcSemanticConversationWriteInput
} from './npc-semantic-conversation-writes.js';
import { appendNpcActorStepModeHandoffWrites } from
  './lower-dvina-trace-npc-actor-step-mode-handoff-writes.js';

export function appendPhase7ConversationWrites({ inserts, updates, appends,
  partyId, state, next, phase7, changeSetId, idemId }) {
  const semanticExchange = phase7.actor_step_owner_outputs?.consequence_fragment
    ?.state_changes?.find(({ mode_handoff: handoff }) =>
      handoff?.mode === 'conversation')?.mode_handoff?.result;
  if (semanticExchange == null) {
    appendNpcActorStepModeHandoffWrites({ inserts, updates, partyId, phase7,
      changeSetId });
    return;
  }
  const semanticInput = buildNpcSemanticConversationWriteInput({ state, next,
    semanticExchange });
  appendNpcSemanticConversationWrites({ inserts, updates, appends, partyId,
    changeSetId, idempotencyRecordId: idemId,
    rootTurnId: phase7.autonomous.request.root_turn_id,
    workingRevision: phase7.autonomous.request.working_revision,
    sessionWrite: semanticInput.sessionWrite,
    semanticExchange: semanticInput.semanticExchange,
    signalRecords: semanticInput.signalRecords,
    actualMessageEvidence: semanticInput.actualMessageEvidence,
    persistedMessageStatements: semanticInput.persistedMessageStatements,
    persistedMessageAudiences: semanticInput.persistedMessageAudiences,
    supportingOperationEvidence: semanticInput.supportingOperationEvidence,
    partyStateVersion: semanticInput.partyStateVersion,
    sameTimeBatchRef: semanticInput.sameTimeBatchRef,
    contributions: semanticInput.contributions });
}
