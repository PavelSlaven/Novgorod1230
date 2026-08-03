import {
  assertLowerDvinaTraceSemanticConversationRows,
  isLowerDvinaTraceSemanticRevision
} from './lower-dvina-trace-semantic-conversation-read.js';

export async function assertPhase3SemanticRows(pool, payload) {
  const semanticRevision = isLowerDvinaTraceSemanticRevision(payload);
  const decisionTraces =
    await assertLowerDvinaTraceSemanticConversationRows(pool, payload);
  return { semanticRevision, decisionTraces };
}
