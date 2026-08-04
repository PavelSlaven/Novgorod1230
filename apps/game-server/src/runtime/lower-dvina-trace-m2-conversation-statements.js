import {
  buildConversationStatementEvent,
  resolveConversationListenerPerception
} from '@rus/npc-runtime';
import { projectConversationAudience } from
  '@rus/visibility-knowledge-memory';
import { currentSignalRecords } from
  './lower-dvina-trace-m2-conversation-decision.js';
import { requirePlayerSpeech } from
  './lower-dvina-trace-m2-conversation-plans.js';
import {
  compareRefs,
  fail,
  npcRef,
  ref,
  sameRef
} from './lower-dvina-trace-m2-conversation-shared.js';
import { evidencePresentationPerception } from './lower-dvina-trace-m2-conversation-supporting-perception.js';
import { playerDecisionSignalRecords } from
  './lower-dvina-trace-m2-conversation-participants.js';

export function applyPlayerPlan(context, working, plan) {
  requirePlayerSpeech(context, plan);
  const statement = statementFromPlan({
    context,
    plan,
    contributionIndex: 1,
    socialDeliveryResult: context.socialDeliveryResult
  });
  return applyResult({
    working,
    contributionEvent: statement,
    playerResponseBoundary: false,
    sessionStatus: 'active',
    handoff: null
  });
}

export function projectPlayerPerception(context, working, statement) {
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
    buildRecords: currentSignalRecords
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
  npcOutcome
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
        socialDeliveryResult: null
      })
    : null;
  if (statement) {
    npcOutcome.statementRef = ref(
      'conversation_statement',
      statement.statement_id
    );
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

export function projectNpcPerception(
  context,
  working,
  contributionEvent,
  npcOutcome
) {
  if (contributionEvent.schema !== 'conversation_statement_event_v1') {
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
  return applyResult({
    working: {
      ...working,
      statements: [...working.statements, contributionEvent],
      audiences: [...working.audiences, audience]
    },
    contributionEvent,
    playerResponseBoundary: true,
    sessionStatus: 'active',
    handoff: null
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
function audienceForStatement(
  context,
  statement,
  listenerActors,
  extraListenerRefs
) {
  const witnessIds = new Set(
    context.state.promise_instances?.[0]?.witness_actor_ids ?? []
  );
  const listenerRefs = [
    ...listenerActors.map(({ instance_id: instanceId }) => npcRef(instanceId)),
    ...extraListenerRefs
  ].sort(compareRefs);
  return projectConversationAudience({
    statement,
    listener_results: listenerRefs.map((listenerRef) => {
      const actor = listenerRef.entity_kind === 'npc'
        ? context.actualNpcActors.find(
            ({ instance_id: instanceId }) => instanceId === listenerRef.entity_id
          )
        : null;
      const speakerActor = statement.speaker_ref.entity_kind === 'npc'
        ? context.actualNpcActors.find(
            ({ instance_id: instanceId }) =>
              instanceId === statement.speaker_ref.entity_id
          )
        : null;
      const listenerAnchor = listenerRef.entity_kind === 'player_character'
        ? context.state.position.g5_anchor_id
        : actor?.anchor_id;
      const speakerAnchor = statement.speaker_ref.entity_kind === 'player_character'
        ? context.state.position.g5_anchor_id
        : speakerActor?.anchor_id;
      const machine = actor?.machine_state ?? {};
      const semantic = actor?.semantic_state ?? {};
      const perception = resolveConversationListenerPerception({
        listener_ref: listenerRef,
        perception_result_ref: ref(
          'perception_result',
          `perception:${statement.statement_id}:${listenerRef.entity_id}`
        ),
        acoustic_path: listenerAnchor && listenerAnchor === speakerAnchor
          ? 'clear' : 'blocked',
        distance_band: listenerAnchor && listenerAnchor === speakerAnchor
          ? 'conversation' : 'distant',
        ambient_noise: context.state.environment?.ambient_noise ?? 'ordinary',
        hearing_capability: machine.hearing_capability ?? 'full',
        attention: ['unconscious', 'incapacitated'].includes(machine.status)
          ? 'unavailable'
          : machine.attention ?? 'available',
        language_comprehension:
          semantic.language_comprehension ?? 'full',
        speaker_recognition: semantic.speaker_recognition ?? 'recognized',
        witness_policy_allows: witnessIds.has(listenerRef.entity_id)
      });
      return {
        ...perception,
        perceived_at: structuredClone(context.state.clock),
        same_time_batch_ref: ref('temporal_batch', context.batchKey)
      };
    })
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
