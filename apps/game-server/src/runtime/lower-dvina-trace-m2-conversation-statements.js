import {
  buildConversationStatementEvent
} from '@rus/npc-runtime';
import { npcResponseSignalRecords, playerSignalRecords } from
  './lower-dvina-trace-m2-conversation-signals.js';
import { requirePlayerContribution } from './lower-dvina-trace-m2-conversation-plans.js';
import { fail, ref, sameRef } from './lower-dvina-trace-m2-conversation-shared.js';
import { evidencePresentationPerception } from './lower-dvina-trace-m2-conversation-supporting-perception.js';
import { playerDecisionSignalRecords } from
  './lower-dvina-trace-m2-conversation-participants.js';
import { projectSilencePerception } from
  './lower-dvina-trace-m2-conversation-nonverbal.js';
import { audienceForStatement } from
  './lower-dvina-trace-m2-conversation-audience.js';

export function applyPlayerPlan(context, working, plan) {
  requirePlayerContribution(context, plan);
  const handoff = ['action_handoff', 'combat_handoff'].includes(
    plan.contribution_kind) ? structuredClone(plan.handoff) : null;
  const statement = plan.contribution_kind === 'speech'
    ? statementFromPlan({
        context,
        plan,
        contributionIndex: 1,
        socialDeliveryResult: context.socialDeliveryResult
      })
    : nonStatementContribution(context, plan, 1);
  return applyResult({
    working,
    contributionEvent: statement,
    playerResponseBoundary: false,
    sessionStatus: handoff
      ? 'suspended'
      : plan.contribution_kind === 'leave_conversation' ? 'ended' : 'active',
    handoff
  });
}
export function projectPlayerPerception(context, working, statement, plan) {
  if (statement.schema !== 'conversation_statement_event_v1') {
    if (statement.contribution_kind === 'silence') {
      const projected = projectSilencePerception(
        context, working, statement, null, plan
      );
      return applyResult({
        ...projected,
        sessionStatus: 'active',
        handoff: null
      });
    }
    return applyResult({
      working,
      contributionEvent: statement,
      playerResponseBoundary: false,
      sessionStatus: statement.handoff ? 'suspended' : 'ended',
      handoff: statement.handoff
    });
  }
  const audience = audienceForStatement(
    context, statement, context.actualNpcActors, []
  );
  const supportingOperationPerception = evidencePresentationPerception(context);
  const evidencePerceptionRef = supportingOperationPerception !== null
    && supportingOperationPerception.result_kind !== 'not_perceived'
    ? ref(
        'perception_result',
        supportingOperationPerception.perception_id
      )
    : null;
  const newSignalRecords = playerDecisionSignalRecords({
    context, audience, statement, evidencePerceptionRef,
    buildRecords: playerSignalRecords
  });
  return applyResult({
    working: {
      ...working,
      statements: [...working.statements, statement],
      audiences: [...working.audiences, audience],
      new_signal_records: [
        ...working.new_signal_records,
        ...newSignalRecords
      ],
      supporting_operation_perceptions: [
        ...(working.supporting_operation_perceptions ?? []),
        ...(supportingOperationPerception === null
          ? [] : [supportingOperationPerception])
      ]
    },
    contributionEvent: statement,
    playerResponseBoundary: false,
    sessionStatus: 'active',
    handoff: null
  });
}
export function applyNpcPlan(
  context,
  working,
  request,
  proposal,
  contributionIndex,
  npcOutcome,
  socialDeliveryResult = null,
  checkResult = null
) {
  const contributionKind = proposal.plan.contribution_kind;
  const handoff = ['action_handoff', 'combat_handoff'].includes(
    contributionKind
  )
    ? structuredClone(proposal.plan.handoff)
    : null;
  const statement = proposal.plan.contribution_kind === 'speech'
    ? statementFromPlan({
        context,
        plan: proposal.plan,
        contributionIndex,
        socialDeliveryResult
      })
    : null;
  if (statement) {
    npcOutcome.statementRef = ref(
      'conversation_statement',
      statement.statement_id
    );
  }
  const contributionEvent = statement ?? nonStatementContribution(
    context, proposal.plan, contributionIndex
  );
  npcOutcome.contributionRef = contributionEvent.schema
    === 'conversation_statement_event_v1'
    ? ref('conversation_statement', contributionEvent.statement_id)
    : ref('conversation_contribution', contributionEvent.contribution_id);
  npcOutcome.checkResult = structuredClone(checkResult);
  npcOutcome.socialDeliveryResult = structuredClone(socialDeliveryResult);
  return applyResult({
    working: {
      ...working,
      consumed_signal_ids: [
        ...working.consumed_signal_ids,
        ...proposal.signal_ids_to_consume
      ]
    },
    contributionEvent,
    playerResponseBoundary: ['speech', 'silence'].includes(contributionKind),
    sessionStatus: handoff
      ? 'suspended'
      : contributionKind === 'leave_conversation'
        ? 'ended'
        : 'active',
    handoff
  });
}
export function projectNpcPerception(context, working, contributionEvent,
  npcOutcome, plan, request = null) {
  if (contributionEvent.schema !== 'conversation_statement_event_v1') {
    if (contributionEvent.contribution_kind === 'silence') {
      const projected = projectSilencePerception(
        context, working, contributionEvent, request
      );
      return applyResult({
        ...projected,
        sessionStatus: 'active',
        handoff: null
      });
    }
    return applyResult({
      working,
      contributionEvent,
      playerResponseBoundary: ['speech', 'silence'].includes(
        contributionEvent.contribution_kind
      ),
      sessionStatus: contributionEvent.handoff
        ? 'suspended'
        : contributionEvent.contribution_kind === 'leave_conversation'
          ? 'ended' : 'active',
      handoff: contributionEvent.handoff
    });
  }
  const listenerActors = context.actualNpcActors.filter(
    ({ instance_id: instanceId }) => instanceId !== context.targetRef.entity_id
  );
  const audience = audienceForStatement(
    context,
    contributionEvent,
    listenerActors,
    [ref('player_character', context.state.actor_id)]
  );
  npcOutcome.factualProjection = Object.freeze({
    statement_ref: npcOutcome.statementRef,
    utterance_text: contributionEvent.utterance_text,
    claims: structuredClone(contributionEvent.claims),
    actual_listener_refs: structuredClone(audience.actual_listener_refs),
    objective_truth_write: 'forbidden'
  });
  const newSignalRecords = npcResponseSignalRecords(context, contributionEvent,
    audience, plan);
  return applyResult({
    working: {
      ...working,
      statements: [...working.statements, contributionEvent],
      audiences: [...working.audiences, audience],
      new_signal_records: [
        ...working.new_signal_records,
        ...newSignalRecords
      ]
    },
    contributionEvent,
    playerResponseBoundary: true,
    sessionStatus: 'active',
    handoff: null
  });
}
function statementFromPlan({ context, plan, contributionIndex,
  socialDeliveryResult }) {
  const speech = plan.speech;
  return buildConversationStatementEvent({
    schema: 'conversation_statement_event_v1',
    statement_id:
      `statement:${context.inputDigest}:${contributionIndex}`,
    conversation_id: context.conversationId,
    exchange_id: context.exchangeId,
    speaker_ref: structuredClone(plan.speaker_ref),
    intended_addressee_refs:
      structuredClone(plan.intended_addressee_refs),
    utterance_text: speech.utterance_text,
    dominant_act: speech.dominant_act,
    interaction_tags: structuredClone(speech.interaction_tags),
    topic_refs: structuredClone(speech.topic_refs),
    claims: structuredClone(speech.claims),
    message_completeness: 'complete',
    spoken_at: structuredClone(context.state.clock),
    duration: {
      owner: 'approved_activity_contract',
      activity_ref: context.phase === 'phase_3'
        ? (context.evidencePresented
            ? context.contracts.evidenceTalk.profile_id
            : context.contracts.talk.profile_id)
        : context.contracts.negotiation.profile_id
    },
    social_delivery_result: socialDeliveryResult,
    source_plan_ref: ref(
      'semantic_plan',
      `semantic-plan:${context.inputDigest}:${contributionIndex}`
    )
  });
}

function nonStatementContribution(context, plan, contributionIndex) {
  return {
    schema: 'conversation_non_statement_contribution_v1',
    contribution_id:
      `contribution:${context.inputDigest}:${contributionIndex}`,
    conversation_id: context.conversationId,
    exchange_id: context.exchangeId,
    speaker_ref: structuredClone(plan.speaker_ref),
    contribution_kind: plan.contribution_kind,
    handoff: plan.handoff === null ? null : structuredClone(plan.handoff),
    nonverbal_audience: null
  };
}
function applyResult({
  working,
  contributionEvent,
  playerResponseBoundary,
  sessionStatus,
  handoff
}) {
  return {
    working_state: working,
    contribution_event: contributionEvent,
    player_response_boundary: playerResponseBoundary,
    session_status: sessionStatus,
    handoff
  };
}
