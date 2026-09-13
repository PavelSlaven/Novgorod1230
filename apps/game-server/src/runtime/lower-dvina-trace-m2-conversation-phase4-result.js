import { buildSurrenderProjection } from
  './lower-dvina-trace-m2-conversation-surrender.js';
import { fail, freezeResult, ref, sameTimeBatchKey } from
  './lower-dvina-trace-m2-conversation-shared.js';

export function phase4ConversationResult(result, context, state, offerStage,
  checkRequest, inputDigest) {
  const surrender = result.npcOutcome?.kind === 'surrender'
    ? buildSurrenderProjection(result, context) : null;
  const confession = surrender !== null
    ? confessionProjection(result, context) : null;
  const handoff = structuredClone(result.exchange.handoff);
  return freezeResult({ input_digest: inputDigest, exchange: result.exchange,
    same_time_batch_ref: ref('temporal_batch',
      sameTimeBatchKey(state.party_id, result.clockAfter)),
    clock_after: structuredClone(result.clockAfter),
    exact_elapsed_minutes: result.elapsedMinutes,
    temporal_boundary_refs: structuredClone(result.temporalBoundaryRefs),
    statements: result.statements, audiences: result.audiences,
    decision_boundary: result.decision?.boundary ?? null,
    decision_request: result.decision?.request ?? null,
    decision_plan: result.decision?.proposal.plan ?? null,
    decisions: structuredClone(result.decisions),
    npc_outcomes: structuredClone(result.npcOutcomes),
    pending_npc_execution: structuredClone(result.exchange.pending_npc_execution),
    pending_player_execution: result.exchange.pending_player_execution == null
      ? null : { ...structuredClone(result.exchange.pending_player_execution),
          conversation_id: context.conversationId,
          exchange_id: context.exchangeId,
          check_result: structuredClone(context.checkResult),
          social_delivery_result: structuredClone(context.socialDeliveryResult),
          offer_stage: structuredClone(offerStage),
          check_request: structuredClone(checkRequest) },
    resumed_npc_execution: structuredClone(result.resumedNpcExecution),
    resumed_player_execution: structuredClone(result.resumedPlayerExecution),
    social_delivery_result: result.socialDeliveryResult,
    new_signal_records: result.newSignalRecords,
    consumed_signal_ids: result.consumedSignalIds,
    terminal_npc_outcomes: structuredClone(result.terminalNpcOutcomes),
    offer_stage: structuredClone(offerStage),
    check_request: structuredClone(checkRequest),
    surrender: surrender?.surrender ?? null, confession,
    commitment: surrender?.commitment ?? null,
    knife_transition_eligibility: surrender?.knifeTransitionEligibility ?? null,
    lie: result.npcOutcome?.kind === 'lie'
      ? result.npcOutcome.factualProjection : null,
    bargain: result.npcOutcome?.kind === 'bargain'
      ? result.npcOutcome.factualProjection : null,
    speech: result.npcOutcome?.kind === 'speech'
      ? result.npcOutcome.factualProjection : null,
    silence: result.npcOutcome?.kind === 'silence',
    leave_conversation: result.npcOutcome?.kind === 'leave_conversation', handoff,
    action_handoff: handoff?.kind === 'actor_step' ? handoff : null,
    combat_handoff: handoff?.kind === 'combat' ? handoff : null,
    response_kind: result.npcOutcome?.kind ?? null,
    objective_truth_writes: [] });
}
function confessionProjection(result, context) {
  const authored = context.contracts.confessionStatement;
  if (result.npcOutcome?.confessionClaimId
      !== authored.assertion.assertion_id) return null;
  const statementRef = result.npcOutcome.statementRef;
  const statement = result.statements.find(({ statement_id: statementId }) =>
    statementRef?.entity_kind === 'conversation_statement'
      && statementRef.entity_id === statementId);
  const audience = result.audiences.find(({ statement_ref: ref }) =>
    ref.entity_kind === 'conversation_statement'
      && ref.entity_id === statement?.statement_id);
  const requiredAudienceIds = [
    context.contracts.actors.eremey_fisher.instance_id,
    context.contracts.actors.participating_fisher.instance_id
  ];
  const listenerIds = new Set((audience?.actual_listener_refs ?? [])
    .map(({ entity_id }) => entity_id));
  if (!statement || statement.dominant_act !== 'confess'
      || !statement.claims.some(({ claim_id }) =>
        claim_id === authored.assertion.assertion_id)
      || !requiredAudienceIds.every((actorId) => listenerIds.has(actorId))) {
    fail('TRACE_M2_RATSHA_CONFESSION_UNBACKED',
      'Ratsha confession requires the exact committed claim and audience.');
  }
  return { statement_ref: authored.statement_template_id,
    source_statement_ref: structuredClone(statementRef),
    assertion: structuredClone(authored.assertion),
    content_scope: authored.assertion.content_scope,
    effect_contract_ref:
      context.contracts.confessionEffect.statement_effect_contract_id,
    required_audience_ids: requiredAudienceIds, truth_projection: 'forbidden',
    requires_independent_confirmation: true };
}
