import { validateNpcDecisionBoundary } from '@rus/npc-runtime';
import { canonicalDigest } from '@rus/materialization';

export function assertSemanticExchangeShape({
  semanticExchange,
  exchange,
  decisions,
  primaryDecision,
  record,
  fail
}) {
  const boundary = semanticExchange.decision_boundary;
  const request = semanticExchange.decision_request;
  const plan = semanticExchange.decision_plan;
  const hasDecision = decisions.length > 0;
  const unavailableResume = exchange?.contributions?.length === 0
    && semanticExchange.resumed_npc_execution?.plan != null
    && semanticExchange.pending_npc_execution === null
    && exchange.applied_contribution_count === 0
    && exchange.completed_contribution_count === 0
    && exchange.session_status === 'ended'
    && exchange.stop_reason === 'npc_unavailable';
  if (!record(exchange)
      || exchange.schema !== 'conversation_exchange_result_v1'
      || !Array.isArray(exchange.contributions)
      || (exchange.contributions.length < 1 && !unavailableResume)
      || !Array.isArray(exchange.npc_decisions)
      || !Array.isArray(semanticExchange.objective_truth_writes)
      || semanticExchange.objective_truth_writes.length !== 0
      || (hasDecision && (!validateNpcDecisionBoundary(boundary)
        || boundary.boundary_id !== request?.boundary_id
        || boundary.npc_ref.entity_id !== request?.npc_ref?.entity_id
        || boundary.state_version !== String(request?.state_version)
        || primaryDecision?.boundary?.boundary_id !== boundary.boundary_id
        || primaryDecision?.request?.request_id !== request?.request_id
        || primaryDecision?.proposal?.plan?.request_id !== plan?.request_id
        || decisions.some((decision) =>
          !validateNpcDecisionBoundary(decision?.boundary)
          || decision.boundary.boundary_id !== decision.request?.boundary_id
          || decision.boundary.npc_ref.entity_id
            !== decision.request?.npc_ref?.entity_id
          || decision.boundary.state_version
            !== String(decision.request?.state_version)
          || decision.proposal?.plan?.request_id
            !== decision.request?.request_id
          || decision.request.conversation_id
            !== primaryDecision.request.conversation_id
          || decision.request.exchange_id
            !== primaryDecision.request.exchange_id))
        || (semanticExchange.decisions != null
          && canonicalDigest(semanticExchange.decisions)
            !== canonicalDigest(decisions)))
      || (!hasDecision && (boundary !== null || request !== null
        || plan !== null))) {
    fail(
      'TRACE_M2_SEMANTIC_EXCHANGE_INVALID',
      'The committed semantic exchange has an invalid NPC decision cardinality.'
    );
  }
}
