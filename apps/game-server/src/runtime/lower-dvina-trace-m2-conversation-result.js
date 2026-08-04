export function projectM2ConversationExecutionResult({
  exchange,
  context,
  pendingExecution,
  npcOutcomes,
  resumedOutcome
}) {
  const primaryDecision = exchange.npc_decisions.find(({ request }) =>
    request.npc_ref.entity_kind === context.targetRef.entity_kind
      && request.npc_ref.entity_id === context.targetRef.entity_id) ?? null;
  const primaryOutcome = pendingExecution === null
    ? (primaryDecision === null ? null
      : npcOutcomes.get(primaryDecision.request.request_id))
    : resumedOutcome;
  const npcContributionApplied = (primaryDecision !== null
      || pendingExecution !== null)
    && exchange.contributions.some(({ speaker_ref: speaker }) =>
      speaker?.entity_kind === context.targetRef.entity_kind
        && speaker.entity_id === context.targetRef.entity_id);
  return {
    exchange,
    decision: primaryDecision ?? exchange.npc_decisions[0] ?? null,
    decisions: exchange.npc_decisions,
    statements: exchange.working_state.statements,
    audiences: exchange.working_state.audiences,
    supportingOperationPerceptions:
      exchange.working_state.supporting_operation_perceptions,
    newSignalRecords: exchange.working_state.new_signal_records,
    consumedSignalIds: exchange.working_state.consumed_signal_ids,
    clockAfter: exchange.working_state.clock,
    elapsedMinutes: exchange.working_state.elapsed_minutes,
    temporalBoundaryRefs: exchange.temporal_boundary_refs,
    socialDeliveryResult: context.socialDeliveryResult,
    npcOutcome: npcContributionApplied ? primaryOutcome : null,
    npcOutcomes: exchange.npc_decisions.map(({ request }) => ({
      request_id: request.request_id,
      outcome: structuredClone(npcOutcomes.get(request.request_id)),
      applied: exchange.contributions.some(({ speaker_ref: speaker }) =>
        speaker?.entity_kind === request.npc_ref.entity_kind
          && speaker.entity_id === request.npc_ref.entity_id)
    })),
    resumedNpcExecution: pendingExecution === null ? null : {
      decision_trace_ref: structuredClone(
        context.state.pending_npc_conversation_execution.decision_trace_ref
      ),
      plan: structuredClone(pendingExecution.plan)
    }
  };
}
