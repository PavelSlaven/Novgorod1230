export function projectM2ConversationExecutionResult({
  exchange,
  context,
  pendingExecution,
  pendingPlayerExecution,
  npcOutcomes,
  resumedOutcome
}) {
  const primaryDecision = exchange.npc_decisions.find(({ request }) =>
    request.npc_ref.entity_kind === context.targetRef.entity_kind
      && request.npc_ref.entity_id === context.targetRef.entity_id)
    ?? exchange.npc_decisions[0] ?? null;
  const projectedOutcomes = exchange.npc_decisions.map(({ request }) => {
    const outcome = npcOutcomes.get(request.request_id);
    return {
      request_id: request.request_id,
      npc_ref: structuredClone(request.npc_ref),
      contribution_ref: structuredClone(outcome?.contributionRef ?? null),
      outcome: structuredClone(outcome),
      applied: contributionApplied(exchange, outcome?.contributionRef)
    };
  });
  if (pendingExecution !== null && resumedOutcome !== null) {
    projectedOutcomes.unshift({
      request_id: pendingExecution.source_decision_trace_ref.entity_id,
      npc_ref: structuredClone(pendingExecution.plan.speaker_ref),
      contribution_ref:
        structuredClone(resumedOutcome.contributionRef ?? null),
      outcome: structuredClone(resumedOutcome),
      applied: contributionApplied(exchange, resumedOutcome.contributionRef)
    });
  }
  const primaryOutcome = projectedOutcomes.filter(({ npc_ref: npcRef,
    applied }) => applied
      && npcRef.entity_kind === context.targetRef.entity_kind
      && npcRef.entity_id === context.targetRef.entity_id).at(-1)?.outcome
    ?? null;
  return {
    exchange,
    decision: primaryDecision,
    decisions: exchange.npc_decisions,
    statements: exchange.working_state.statements,
    audiences: exchange.working_state.audiences,
    supportingOperationPerceptions:
      exchange.working_state.supporting_operation_perceptions,
    newSignalRecords: exchange.working_state.new_signal_records,
    consumedSignalIds: exchange.working_state.consumed_signal_ids,
    terminalNpcOutcomes:
      exchange.working_state.terminal_npc_outcomes ?? [],
    clockAfter: exchange.working_state.clock,
    elapsedMinutes: exchange.working_state.elapsed_minutes,
    temporalBoundaryRefs: exchange.temporal_boundary_refs,
    socialDeliveryResult: context.socialDeliveryResult,
    npcOutcome: primaryOutcome,
    npcOutcomes: projectedOutcomes,
    resumedNpcExecution: pendingExecution === null ? null : {
      decision_trace_ref: structuredClone(
        context.state.pending_npc_conversation_execution.decision_trace_ref
      ),
      plan: structuredClone(pendingExecution.plan)
    },
    resumedPlayerExecution: pendingPlayerExecution === null ? null : {
      plan: structuredClone(pendingPlayerExecution.plan)
    }
  };
}

function contributionApplied(exchange, contributionRef) {
  return contributionRef !== null && contributionRef !== undefined
    && exchange.contributions.some((contribution) => {
      const contributionId = contribution.schema
        === 'conversation_statement_event_v1'
        ? contribution.statement_id : contribution.contribution_id;
      const contributionKind = contribution.schema
        === 'conversation_statement_event_v1'
        ? 'conversation_statement' : 'conversation_contribution';
      return contributionRef.entity_kind === contributionKind
        && contributionRef.entity_id === contributionId;
    });
}
