import { deliveryResult } from './lower-dvina-trace-m2-conversation-shared.js';
import { buildPlayerRequest } from './lower-dvina-trace-m2-conversation-request.js';
import {
  advanceConversationContributionTime,
  conversationExchangeDurationMinutes
} from './lower-dvina-trace-m2-conversation-time.js';
import { initialConversationParticipantRefs } from
  './lower-dvina-trace-m2-conversation-session.js';
import { conversationContributionSlots } from
  './lower-dvina-trace-m2-conversation-time-contract.js';

export function createM2ConversationExchangeSetup(context, initialNpcDecision,
  pendingPlayerExecution, pendingNpcExecution) {
  const exchangeDurationMinutes = (pendingPlayerExecution ?? pendingNpcExecution)
    ?.remaining_exchange_minutes
    ?? conversationExchangeDurationMinutes(context, initialNpcDecision !== null);
  const initialWorkingState = {
    state_version: context.stateVersion,
    clock: structuredClone(context.state.clock),
    world_state: structuredClone(context.state),
    elapsed_minutes: 0,
    temporal_boundary_refs: [],
    temporal_advance_results: [],
    statements: [],
    audiences: [],
    supporting_operation_perceptions: [],
    new_signal_records: initialNpcDecision?.signal_record == null ? [] : [
      structuredClone(initialNpcDecision.signal_record)
    ],
    consumed_signal_ids: [],
    terminal_npc_outcomes: [],
    active_participant_refs: initialConversationParticipantRefs(context)
  };
  const decisions = new Map();
  if (initialNpcDecision !== null) {
    decisions.set(initialNpcDecision.request.request_id, initialNpcDecision);
  }
  return {
    decisions,
    npcOutcomes: new Map(),
    exchangeInput: {
      ...(initialNpcDecision === null ? { playerRequest: buildPlayerRequest(context) }
        : { initialNpcDecision: {
          boundary: initialNpcDecision.boundary,
          request: initialNpcDecision.request,
          persisted_trace: initialNpcDecision.persisted_trace
        } }),
      initialWorkingState,
      maxContributionsPerExchange:
        context.contracts.conversationBindings.max_contributions_per_exchange,
      timeBudget: {
        total_minutes: exchangeDurationMinutes,
        contribution_slots: conversationContributionSlots(
          context, pendingPlayerExecution, pendingNpcExecution,
          initialNpcDecision
        ),
        ...(context.conversationTimeContract?.mode === 'same_timestamp'
          ? { mode: 'same_timestamp' } : {})
      },
      pendingPlayerExecution,
      pendingNpcExecution
    },
    advanceContributionTime: ({ working_state: working,
      planned_duration_minutes: plannedDurationMinutes }) =>
      advanceConversationContributionTime(context, working, plannedDurationMinutes)
  };
}
