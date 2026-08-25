import { buildConversationSession } from '@rus/npc-runtime';
import {
  compareText,
  fail,
  ref,
  text
} from './lower-dvina-trace-conversation-state-validation.js';
import { projectActiveConversationParticipantRefs } from
  './lower-dvina-trace-conversation-participants-state.js';

export function projectConversationSession({ state, exchange, statements,
  audiences, contributions, terminalOutcomes, request }) {
  const existing = (state.conversation_sessions ?? []).find(
    ({ conversation_id: id }) => id === request.conversation_id
  );
  const firstContribution = contributions[0];
  const last = contributions.at(-1);
  const activeParticipantRefs = projectActiveConversationParticipantRefs({
    existing, contributions, audiences, terminalOutcomes
  });
  const lastContributionRef = last?.schema
    === 'conversation_statement_event_v1'
    ? ref('conversation_statement', last.statement_id)
    : last?.schema === 'conversation_non_statement_contribution_v1'
      && text(last.contribution_id)
      ? ref('conversation_contribution', last.contribution_id)
      : existing?.last_contribution_ref ?? null;
  if (!lastContributionRef
      || !text(state.position?.location_ref)
      || !text(exchange.session_status)
      || !text(exchange.stop_reason)
      || (firstContribution == null && existing == null)) {
    fail(
      'TRACE_M2_CONVERSATION_SESSION_INVALID',
      'The semantic exchange cannot produce a formal conversation session.'
    );
  }
  const candidate = {
    schema: 'conversation_session_v1',
    conversation_id: request.conversation_id,
    state_version: existing ? existing.state_version + 1 : 1,
    status: exchange.session_status,
    started_at: existing?.started_at
      ?? (firstContribution?.schema === 'conversation_statement_event_v1'
        ? firstContribution.spoken_at : structuredClone(state.clock)),
    location_ref: existing?.location_ref
      ?? ref('location', state.position.location_ref),
    initiator_ref: existing?.initiator_ref ?? firstContribution?.speaker_ref,
    active_participant_refs: activeParticipantRefs,
    last_contribution_ref: lastContributionRef,
    topic_refs: [...new Set([
      ...(existing?.topic_refs ?? []),
      ...statements.flatMap(({ topic_refs: topicRefs }) => topicRefs)
    ])].sort(compareText),
    status_reason: exchange.stop_reason
  };
  try {
    return buildConversationSession(candidate);
  } catch (error) {
    fail(
      'TRACE_M2_CONVERSATION_SESSION_INVALID',
      'The semantic exchange cannot produce a formal conversation session.',
      error
    );
  }
}
