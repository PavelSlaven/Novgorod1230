import { createM2ConversationContext, executeM2ConversationExchange,
  prepareM2PlayerConversationPlan } from
  './lower-dvina-trace-m2-conversation-exchange.js';
import { classifyRatshaPlan } from
  './lower-dvina-trace-m2-conversation-plans.js';
import { freezeResult, ref, sameTimeBatchKey, SURRENDER_OPERATION } from
  './lower-dvina-trace-m2-conversation-shared.js';

export async function prepareTracePhase8PlayerPlan(input) {
  return prepareM2PlayerConversationPlan(contextFor(input));
}

export async function resolveTracePhase8Conversation(input) {
  const context = contextFor(input);
  const result = await executeM2ConversationExchange(context);
  const handoff = structuredClone(result.exchange.handoff);
  return freezeResult({ input_digest: input.inputDigest,
    exchange: result.exchange,
    same_time_batch_ref: ref('temporal_batch',
      sameTimeBatchKey(input.state.party_id, result.clockAfter)),
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
    pending_player_execution: structuredClone(result.exchange.pending_player_execution),
    resumed_npc_execution: structuredClone(result.resumedNpcExecution),
    resumed_player_execution: structuredClone(result.resumedPlayerExecution),
    social_delivery_result: result.socialDeliveryResult,
    new_signal_records: result.newSignalRecords,
    consumed_signal_ids: result.consumedSignalIds,
    terminal_npc_outcomes: structuredClone(result.terminalNpcOutcomes),
    surrender: result.npcOutcome?.kind === 'surrender'
      ? { fact_id: 'zhdanko_surrender_committed' } : null,
    commitment: null, knife_transition_eligibility: null,
    lie: null, bargain: null,
    speech: result.npcOutcome?.kind === 'speech'
      ? result.npcOutcome.factualProjection : null,
    silence: result.npcOutcome?.kind === 'silence',
    leave_conversation: result.npcOutcome?.kind === 'leave_conversation',
    handoff, action_handoff: handoff?.kind === 'actor_step' ? handoff : null,
    combat_handoff: handoff?.kind === 'combat' ? handoff : null,
    response_kind: result.npcOutcome?.kind ?? null,
    objective_truth_writes: [] });
}

function contextFor({ state, contracts, playerInput, inputDigest,
  playerConversationModel, npcSemanticModel, temporalAdvanceOwner,
  revalidateStateVersion, playerPlan = null }) {
  const target = contracts.actors.zhdanko;
  const actualNpcActors = [{ ref: 'zhdanko', ...structuredClone(target) }];
  return createM2ConversationContext({ phase: 'phase_8', state, contracts,
    playerInput, inputDigest, checkResult: null,
    mapping: contracts.combatBindings.conversation.signal_mapping,
    targetActor: { ref: 'zhdanko_storehouse_controller', ...target },
    actualNpcActors,
    requiredIntendedAddresseeRefs: [ref('npc', target.instance_id)],
    playerConversationModel, npcSemanticModel,
    revalidateStateVersion, temporalAdvanceOwner,
    playerOperationContract: {},
    npcOperationContract: { [SURRENDER_OPERATION]: {
      required_dominant_acts: ['accept', 'promise', 'confess'],
      required_interaction_tag: 'surrender' } },
    npcDecisionScope: { action_handoff_available: false,
      combat_handoff_available: true },
    npcContributionReferencePolicy: { entity_refs: [], knowledge_refs: [],
      combat_target_refs: [ref('player_character', state.actor_id)] },
    activityProfile: contracts.accusationActivity,
    playerPlan, offerStage: null, checkRequest: null,
    classifyNpcPlan: classifyRatshaPlan });
}
