import { phase3SemanticInteractions } from './lower-dvina-trace-phase-3-state-interactions.js';
import { applyConversationTemporalNpcWrites } from './lower-dvina-trace-conversation-temporal.js';

export function projectPhase3SemanticConversation({
  next, state, factual, conversation, turnNumber
}) {
  const semantic = conversation.semantic_exchange;
  applyConversationTemporalNpcWrites(next, semantic);
  const resumedPlan = semantic.resumed_npc_execution?.plan ?? null;
  const npcRef = resumedPlan?.speaker_ref
    ?? semantic.decision_request?.npc_ref ?? {
    entity_kind: 'npc', entity_id: conversation.npc_id
  };
  const appliedTargetOutcomes = (semantic.npc_outcomes ?? []).filter(
    ({ npc_ref: outcomeNpcRef, applied }) => applied
      && sameRef(outcomeNpcRef, npcRef));
  const finalOutcome = appliedTargetOutcomes.at(-1) ?? null;
  const finalDecision = semantic.decisions?.find(({ request }) => request.request_id === finalOutcome?.request_id) ?? null;
  const resumedRequestId = semantic.resumed_npc_execution?.decision_trace_ref?.entity_id;
  const npcPlan = finalDecision?.proposal?.plan ?? (finalOutcome?.request_id === resumedRequestId ? resumedPlan : null)
    ?? (finalOutcome === null ? resumedPlan ?? semantic.decision_plan : null);
  const hasDecision = semantic.decision_request !== null;
  const resumed = resumedPlan !== null;
  const npcApplied = appliedTargetOutcomes.length > 0;
  const npcStatements = semantic.statements.filter(({ speaker_ref: speaker }) =>
    sameRef(speaker, npcRef));
  const expectedStatementIds = new Set(appliedTargetOutcomes
    .filter(({ contribution_ref: contributionRef }) =>
      contributionRef?.entity_kind === 'conversation_statement')
    .map(({ contribution_ref: contributionRef }) => contributionRef.entity_id));
  const speechResponse = ['route_disclosure', 'withhold', 'speech']
    .includes(semantic.response_kind);
  const npcSpeechContribution = hasDecision
    || resumed
    ? npcPlan?.contribution_kind === 'speech'
    : false;
  const expectedContributionKind = npcApplied
    ? (speechResponse ? 'speech' : semantic.response_kind)
    : npcPlan?.contribution_kind;
  if (npcRef?.entity_kind !== 'npc'
      || npcStatements.length !== expectedStatementIds.size
      || npcStatements.some(({ statement_id: statementId }) =>
        !expectedStatementIds.has(statementId))
      || conversation.npc_id !== npcRef.entity_id
      || (npcApplied
        && finalOutcome?.outcome?.kind !== semantic.response_kind)
      || ((hasDecision || resumed) && npcPlan?.contribution_kind
        !== expectedContributionKind)
      || (!hasDecision && !resumed && (semantic.response_kind !== null
        || semantic.decision_plan !== null))
      || !Array.isArray(conversation.objective_fact_outputs)
      || conversation.objective_fact_outputs.length !== 0
      || ((hasDecision || resumed) && !npcApplied
        && semantic.response_kind !== null)
      || ((hasDecision || resumed) && ![
        'route_disclosure', 'withhold', 'speech', 'silence',
        'leave_conversation', null
      ].includes(semantic.response_kind))) {
    semanticFail('TRACE_M2_PHASE_3_SEMANTIC_SHAPE_INVALID');
  }
  const statement = semantic.route_disclosure === null
    ? npcStatements.at(-1) ?? null
    : npcStatements.find(({ statement_id: statementId }) =>
      statementId === semantic.route_disclosure.source_statement_ref?.entity_id)
      ?? null;
  next.interactions = [
    ...(next.interactions ?? []),
    ...phase3SemanticInteractions({
      semantic, conversation, npcRef, npcStatements, state, factual,
      turnNumber
    })
  ];
  const disclosure = semantic.route_disclosure;
  if (semantic.response_kind === 'route_disclosure') {
    if (!disclosure
        || disclosure.objective_truth_write !== 'forbidden'
        || disclosure.source_statement_ref?.entity_kind
          !== 'conversation_statement'
        || disclosure.source_statement_ref.entity_id
          !== statement.statement_id
        || typeof disclosure.route_ref !== 'string'
        || !disclosure.route_ref.trim()) {
      semanticFail('TRACE_M2_PHASE_3_ROUTE_DISCLOSURE_INVALID');
    }
    next.route_knowledge = [...new Set([
      ...(next.route_knowledge ?? []), disclosure.route_ref
    ])].sort();
    next.knowledge = mergeKnowledge(next.knowledge, [{
      fact_id: disclosure.route_ref,
      knowledge_state: 'known_from_committed_source',
      evidence_refs: [statement.statement_id]
    }]);
  } else if (disclosure !== null) {
    semanticFail('TRACE_M2_PHASE_3_ROUTE_DISCLOSURE_INVALID');
  }
  return next;
}

export function mergeKnowledge(current = [], added = []) {
  const byId = new Map(current.map((entry) => [entry.fact_id, entry]));
  for (const entry of added) if (!byId.has(entry.fact_id)) {
    byId.set(entry.fact_id, entry);
  }
  return [...byId.values()].sort((a, b) => a.fact_id.localeCompare(b.fact_id));
}

function sameRef(left, right) {
  return left?.entity_kind === right?.entity_kind &&
    left?.entity_id === right?.entity_id;
}

function semanticFail(code) {
  throw Object.assign(new Error(
    'The Phase 3 semantic conversation projection is incomplete.'), { code });
}
