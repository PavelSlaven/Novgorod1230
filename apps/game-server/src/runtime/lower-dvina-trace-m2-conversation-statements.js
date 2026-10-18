import {
  buildConversationStatementEvent,
  validateConversationStatementEvent
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
import {
  addContributionParticipants,
  npcConversationSessionStatus,
  removeConversationParticipant
} from './lower-dvina-trace-m2-conversation-session.js';

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
  return projectPlayerStatementAudience(
    context, working, statement, plan, audience
  );
}

export function projectPlayerStatementAudience(
  context, working, statement, plan, audience
) {
  validatePlayerStatementAudience(context, statement, audience);
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
      ...addContributionParticipants(working, statement, audience),
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

function validatePlayerStatementAudience(context, statement, audience) {
  const invalid = () => fail(
    'TRACE_M2_PLAYER_AUDIENCE_INVALID',
    'The player statement audience must be bound to this statement and its allowed NPC listeners.'
  );
  if (!validateConversationStatementEvent(statement)
      || !audience || typeof audience !== 'object'
      || Array.isArray(audience)
      || Reflect.ownKeys(audience).length !== 5
      || !['schema', 'statement_ref', 'actual_listener_refs',
        'received_messages', 'witness_candidate_refs'].every((key) =>
        Object.hasOwn(audience, key))
      || audience.schema !== 'conversation_audience_projection_v1'
      || !Array.isArray(audience.actual_listener_refs)
      || !Array.isArray(audience.received_messages)
      || !Array.isArray(audience.witness_candidate_refs)) invalid();

  const exactRef = (value, kind, entityId) => value !== null
    && typeof value === 'object'
    && !Array.isArray(value)
    && Reflect.ownKeys(value).length === 2
    && value.entity_kind === kind
    && typeof value.entity_id === 'string'
    && value.entity_id.trim().length > 0
    && (entityId === undefined || value.entity_id === entityId);
  if (!exactRef(audience.statement_ref, 'conversation_statement',
    statement.statement_id)) invalid();

  const refKey = (value) => {
    if (!value || Reflect.ownKeys(value).length !== 2
        || !Object.hasOwn(value, 'entity_kind')
        || !Object.hasOwn(value, 'entity_id')
        || value.entity_kind !== 'npc'
        || typeof value.entity_id !== 'string' || !value.entity_id.trim()) {
      invalid();
    }
    return `${value.entity_kind}\u0000${value.entity_id}`;
  };
  const allowed = new Set(context.actualNpcActors.map(
    ({ instance_id }) => `npc\u0000${instance_id}`
  ));
  if (allowed.size !== context.actualNpcActors.length) invalid();
  const speakerKey = statement.speaker_ref.entity_kind === 'npc'
    ? `npc\u0000${statement.speaker_ref.entity_id}` : null;
  const listenerKeys = audience.actual_listener_refs.map(refKey);
  if (new Set(listenerKeys).size !== listenerKeys.length
      || listenerKeys.some((key) => !allowed.has(key) || key === speakerKey)
      || audience.received_messages.length !== listenerKeys.length) invalid();

  const messages = new Map();
  const perceptionKeys = new Set();
  const messageFields = [
    'source_statement_ref', 'listener_ref', 'perception_result_ref',
    'perception_result', 'perceived_at', 'same_time_batch_ref',
    'comprehension', 'speaker_ref', 'utterance_text', 'claims',
    'delivery_cues'
  ];
  for (const message of audience.received_messages) {
    if (!message || typeof message !== 'object'
        || Array.isArray(message)
        || Reflect.ownKeys(message).length !== messageFields.length
        || !messageFields.every((key) => Object.hasOwn(message, key))) invalid();
    const key = refKey(message?.listener_ref);
    if (!allowed.has(key) || key === speakerKey || messages.has(key)
        || !exactRef(message.source_statement_ref,
          'conversation_statement', statement.statement_id)
        || !exactRef(message.perception_result_ref, 'perception_result')
        || !exactRef(message.same_time_batch_ref, 'temporal_batch')
        || !message.perceived_at || typeof message.perceived_at !== 'object'
        || Array.isArray(message.perceived_at)
        || Reflect.ownKeys(message.perceived_at).length !== 3
        || !['whole_minutes', 'subminute_numerator',
          'subminute_denominator'].every((key) =>
          Object.hasOwn(message.perceived_at, key))
        || !/^[0-9]+$/u.test(message.perceived_at.whole_minutes)
        || !/^[0-9]+$/u.test(message.perceived_at.subminute_numerator)
        || !/^[1-9][0-9]*$/u.test(message.perceived_at.subminute_denominator)
        || !['not_perceived', 'perceived_unidentified', 'perceived_partial',
          'recognized', 'misinterpreted'].includes(message.perception_result)
        || !['full', 'partial', 'none'].includes(message.comprehension)
        || (message.speaker_ref !== null
          && !exactRef(message.speaker_ref,
            statement.speaker_ref.entity_kind))
        || !sameRef(message.speaker_ref, statement.speaker_ref)
          && message.speaker_ref !== null
        || (message.perception_result === 'not_perceived'
          || message.comprehension === 'none')) invalid();
    const perceptionKey = `${message.perception_result_ref.entity_kind}\u0000${message.perception_result_ref.entity_id}`;
    if (perceptionKeys.has(perceptionKey)) invalid();
    perceptionKeys.add(perceptionKey);
    messages.set(key, message);
  }
  if (listenerKeys.some((key) => !messages.has(key))) invalid();
  const witnessKeys = audience.witness_candidate_refs.map(refKey);
  if (new Set(witnessKeys).size !== witnessKeys.length
      || witnessKeys.some((key) => {
        const message = messages.get(key);
        return !message || message.speaker_ref === null
          || message.comprehension !== 'full'
          || message.perception_result === 'misinterpreted';
      })) invalid();
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
  const participantWorking = contributionKind === 'leave_conversation'
    ? removeConversationParticipant(working, proposal.plan.speaker_ref)
    : addContributionParticipants(working, contributionEvent);
  return applyResult({
    working: {
      ...participantWorking,
      consumed_signal_ids: [
        ...working.consumed_signal_ids,
        ...proposal.signal_ids_to_consume
      ]
    },
    contributionEvent,
    playerResponseBoundary: playerAddressed(proposal.plan),
    sessionStatus: handoff
      ? 'suspended'
      : contributionKind === 'leave_conversation'
        ? npcConversationSessionStatus(participantWorking)
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
      playerResponseBoundary: playerAddressed(contributionEvent),
      sessionStatus: contributionEvent.handoff
        ? 'suspended'
        : contributionEvent.contribution_kind === 'leave_conversation'
          ? npcConversationSessionStatus(working) : 'active',
      handoff: contributionEvent.handoff
    });
  }
  const listenerActors = context.actualNpcActors.filter(
    ({ instance_id: instanceId }) => instanceId !== context.targetRef.entity_id
      && (context.conversationActorRefs == null || context.conversationActorRefs.some(
        ({ entity_kind, entity_id }) => entity_kind === 'npc' && entity_id === instanceId
      ))
  );
  const audience = audienceForStatement(
    context,
    contributionEvent,
    listenerActors,
    context.conversationActorRefs?.some(({ entity_kind, entity_id }) =>
      entity_kind === 'player_character' && entity_id === context.state.actor_id
    ) === false ? [] : [ref('player_character', context.state.actor_id)]
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
      ...addContributionParticipants(working, contributionEvent, audience),
      statements: [...working.statements, contributionEvent],
      audiences: [...working.audiences, audience],
      new_signal_records: [
        ...working.new_signal_records,
        ...newSignalRecords
      ]
    },
    contributionEvent,
    playerResponseBoundary: playerAddressed(contributionEvent),
    sessionStatus: 'active',
    handoff: null
  });
}
function playerAddressed(contribution) {
  return contribution.intended_addressee_refs?.some(({ entity_kind, entity_id }) =>
    entity_kind === 'player_character' && typeof entity_id === 'string'
  ) ?? false;
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
      activity_ref: context.activityProfile?.profile_id
        ?? (context.phase === 'phase_3'
        ? (context.evidencePresented
            ? context.contracts.evidenceTalk.profile_id
            : context.contracts.talk.profile_id)
        : context.contracts.negotiation.profile_id)
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
