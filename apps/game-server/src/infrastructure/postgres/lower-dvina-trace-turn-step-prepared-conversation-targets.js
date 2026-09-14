import { samePreparedValue } from
  './lower-dvina-trace-turn-step-prepared-effect-authority.js';

export function validPreparedPhase3ConversationTargets(
  operation,
  conversation
) {
  const targets = operation?.target_actor_refs;
  if (!Array.isArray(targets) || targets.length === 0
      || targets.some((target) => typeof target !== 'string'
        || target.trim().length === 0)
      || new Set(targets).size !== targets.length
      || conversation?.npc_id !== targets[0]) return false;
  const semantic = conversation.semantic_exchange;
  const expectedRefs = targets.map((entityId) => ({
    entity_kind: 'npc', entity_id: entityId
  }));
  const primarySourceRef = semantic?.decision_request?.perceived_message
    ?.source_statement_ref;
  const matchingSources = (semantic?.statements ?? []).filter((statement) =>
    statement?.speaker_ref?.entity_kind === 'player_character'
      && samePreparedValue(
        statement.intended_addressee_refs, expectedRefs));
  const source = primarySourceRef == null
    ? matchingSources.at(-1)
    : matchingSources.find(({ statement_id: statementId }) =>
      primarySourceRef.entity_kind === 'conversation_statement'
        && primarySourceRef.entity_id === statementId);
  if (source == null) return false;
  const sourceRef = {
    entity_kind: 'conversation_statement', entity_id: source.statement_id
  };
  const targetIds = new Set(targets);
  const decisionTargetIds = new Set();
  const directTargetIds = new Set();
  const decisions = (semantic.decisions ?? []).map(({ request }) => request)
    .filter((request) => samePreparedValue(
      request?.perceived_message?.source_statement_ref, sourceRef));
  for (const request of decisions) {
    const targetId = request?.npc_ref?.entity_kind === 'npc'
      ? request.npc_ref.entity_id : null;
    const outcomes = (semantic.npc_outcomes ?? []).filter(
      ({ request_id: requestId }) => requestId === request?.request_id);
    if (!targetIds.has(targetId) || decisionTargetIds.has(targetId)
        || outcomes.length !== 1) return false;
    decisionTargetIds.add(targetId);
    const outcome = outcomes[0];
    if (outcome.applied === true && outcome.contribution_ref != null) {
      directTargetIds.add(targetId);
    }
  }
  const unavailableTargetIds = new Set();
  for (const outcome of semantic.terminal_npc_outcomes ?? []) {
    const targetId = outcome?.npc_ref?.entity_kind === 'npc'
      ? outcome.npc_ref.entity_id : null;
    if (outcome?.outcome !== 'npc_unavailable'
        || !targetIds.has(targetId)
        || unavailableTargetIds.has(targetId)) return false;
    unavailableTargetIds.add(targetId);
  }
  const audiences = (semantic.audiences ?? []).filter(({ statement_ref: ref }) =>
    samePreparedValue(ref, sourceRef));
  if (audiences.length !== 1) return false;
  return expectedRefs.every((targetRef) => {
    const id = targetRef.entity_id;
    const messages = audiences[0].received_messages?.filter(
      ({ listener_ref: listenerRef }) =>
        samePreparedValue(listenerRef, targetRef)) ?? [];
    return messages.length === 1
      && directTargetIds.has(id) !== unavailableTargetIds.has(id);
  });
}
