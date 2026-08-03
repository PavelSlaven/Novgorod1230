import { buildConversationStatementEvent } from '@rus/npc-runtime';
import { projectConversationAudience } from
  '@rus/visibility-knowledge-memory';
import { currentSignalRecords } from
  './lower-dvina-trace-m2-conversation-decision.js';
import { requireExactPlayerSpeech } from
  './lower-dvina-trace-m2-conversation-plans.js';
import {
  compareRefs,
  fail,
  npcRef,
  ref,
  sameRef
} from './lower-dvina-trace-m2-conversation-shared.js';

export function applyPlayerPlan(context, working, plan) {
  requireExactPlayerSpeech(context, plan);
  const statement = statementFromPlan({
    context,
    plan,
    contributionIndex: 1,
    socialDeliveryResult: context.socialDeliveryResult
  });
  const audience = audienceForStatement(
    context,
    statement,
    context.actualNpcActors,
    []
  );
  const targetMessage = audience.received_messages.find(
    ({ listener_ref: listenerRef }) => sameRef(listenerRef, context.targetRef)
  );
  if (!targetMessage) {
    fail(
      'TRACE_M2_CONVERSATION_TARGET_NOT_PERCEIVING',
      'The target NPC must receive the committed player statement.'
    );
  }
  const newSignalRecords = currentSignalRecords(
    context,
    statement,
    targetMessage.perception_result_ref
  );
  return applyResult({
    working: {
      ...working,
      statements: [...working.statements, statement],
      audiences: [...working.audiences, audience],
      new_signal_records: [
        ...working.new_signal_records,
        ...newSignalRecords
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
  npcOutcome
) {
  const handoff = npcOutcome.kind === 'combat_handoff'
    ? structuredClone(proposal.plan.handoff)
    : null;
  const statement = proposal.plan.contribution_kind === 'speech'
    ? statementFromPlan({
        context,
        plan: proposal.plan,
        contributionIndex,
        socialDeliveryResult: null
      })
    : null;
  const listenerActors = context.actualNpcActors.filter(
    ({ instance_id: instanceId }) => instanceId !== context.targetRef.entity_id
  );
  const audience = statement
    ? audienceForStatement(
        context,
        statement,
        listenerActors,
        [ref('player_character', context.state.actor_id)]
      )
    : null;
  if (statement) {
    npcOutcome.statementRef = ref(
      'conversation_statement',
      statement.statement_id
    );
    npcOutcome.factualProjection = Object.freeze({
      statement_ref: npcOutcome.statementRef,
      utterance_text: statement.utterance_text,
      claims: structuredClone(statement.claims),
      actual_listener_refs: structuredClone(audience.actual_listener_refs),
      objective_truth_write: 'forbidden'
    });
  }
  const contributionEvent = statement ?? {
    schema: 'conversation_non_statement_contribution_v1',
    contribution_id:
      `contribution:${context.inputDigest}:${contributionIndex}`,
    conversation_id: context.conversationId,
    exchange_id: context.exchangeId,
    speaker_ref: context.targetRef,
    contribution_kind: proposal.plan.contribution_kind,
    handoff
  };
  return applyResult({
    working: {
      ...working,
      statements: statement
        ? [...working.statements, statement]
        : working.statements,
      audiences: audience
        ? [...working.audiences, audience]
        : working.audiences,
      consumed_signal_ids: [
        ...working.consumed_signal_ids,
        ...proposal.signal_ids_to_consume
      ]
    },
    contributionEvent,
    playerResponseBoundary: false,
    sessionStatus: handoff ? 'suspended' : 'ended',
    handoff
  });
}

function statementFromPlan({
  context,
  plan,
  contributionIndex,
  socialDeliveryResult
}) {
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
        ? (context.checkResult === null
            ? context.contracts.talk.profile_id
            : context.contracts.evidenceTalk.profile_id)
        : context.contracts.negotiation.profile_id
    },
    social_delivery_result: socialDeliveryResult,
    source_plan_ref: ref(
      'semantic_plan',
      `semantic-plan:${context.inputDigest}:${contributionIndex}`
    )
  });
}

function audienceForStatement(
  context,
  statement,
  listenerActors,
  extraListenerRefs
) {
  const witnessIds = context.phase === 'phase_4'
    ? new Set([
        context.contracts.actors.eremey_fisher.instance_id,
        context.contracts.actors.participating_fisher.instance_id
      ])
    : new Set();
  const listenerRefs = [
    ...listenerActors.map(({ instance_id: instanceId }) => npcRef(instanceId)),
    ...extraListenerRefs
  ].sort(compareRefs);
  return projectConversationAudience({
    statement,
    listener_results: listenerRefs.map((listenerRef) => ({
      listener_ref: listenerRef,
      perception_result_ref: ref(
        'perception_result',
        `perception:${statement.statement_id}:${listenerRef.entity_id}`
      ),
      perception_result: 'recognized',
      comprehension: 'full',
      speaker_recognized: true,
      witness_policy_allows: witnessIds.has(listenerRef.entity_id)
    }))
  });
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
