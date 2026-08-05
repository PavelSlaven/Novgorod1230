import { resolveConversationVisualPerception } from '@rus/npc-runtime';
import { projectConversationNonverbalAudience } from
  '@rus/visibility-knowledge-memory';
import { npcSilenceSignalRecords } from
  './lower-dvina-trace-m2-conversation-signals.js';
import { compareRefs, npcRef, ref } from
  './lower-dvina-trace-m2-conversation-shared.js';

export function projectSilencePerception(
  context,
  working,
  contribution,
  request
) {
  const audience = audienceForSilence(context, contribution);
  const contributionEvent = { ...contribution, nonverbal_audience: audience };
  const newSignalRecords = npcSilenceSignalRecords(
    context,
    contributionEvent,
    audience,
    request
  );
  return {
    working: {
      ...working,
      new_signal_records: [
        ...working.new_signal_records,
        ...newSignalRecords
      ]
    },
    contributionEvent,
    playerResponseBoundary: newSignalRecords.length === 0
  };
}

function audienceForSilence(context, contribution) {
  const observerRefs = [
    ...context.actualNpcActors
      .filter(({ instance_id: instanceId }) =>
        instanceId !== contribution.speaker_ref.entity_id)
      .map(({ instance_id: instanceId }) => npcRef(instanceId)),
    ref('player_character', context.state.actor_id)
  ].sort(compareRefs);
  const speaker = context.actualNpcActors.find(
    ({ instance_id: instanceId }) =>
      instanceId === contribution.speaker_ref.entity_id
  );
  return projectConversationNonverbalAudience({
    contribution,
    observer_results: observerRefs.map((observerRef) =>
      observerResult(context, contribution, observerRef, speaker))
  });
}

function observerResult(context, contribution, observerRef, speaker) {
  const perceptionResultRef = ref(
    'perception_result',
    `perception:${contribution.contribution_id}:${observerRef.entity_id}`
  );
  const common = {
    perceived_at: structuredClone(context.state.clock),
    same_time_batch_ref: ref('temporal_batch', context.batchKey)
  };
  if (observerRef.entity_kind === 'player_character') {
    return {
      observer_ref: observerRef,
      perception_result_ref: perceptionResultRef,
      perception_result: 'recognized',
      ...common,
      speaker_recognized: true
    };
  }
  const actor = context.actualNpcActors.find(
    ({ instance_id: instanceId }) => instanceId === observerRef.entity_id
  );
  const machine = actor?.machine_state ?? {};
  const semantic = actor?.semantic_state ?? {};
  const sameAnchor = actor?.anchor_id && speaker?.anchor_id
    && actor.anchor_id === speaker.anchor_id;
  const perception = resolveConversationVisualPerception({
    observer_ref: observerRef,
    perception_result_ref: perceptionResultRef,
    visual_path: sameAnchor ? 'clear' : 'blocked',
    distance_band: sameAnchor ? 'conversation' : 'distant',
    ambient_visibility:
      context.state.environment?.ambient_visibility ?? 'clear',
    visual_capability: machine.visual_capability ?? 'full',
    attention: ['unconscious', 'incapacitated'].includes(machine.status)
      ? 'unavailable'
      : machine.attention ?? 'available'
  });
  return {
    ...perception,
    ...common,
    speaker_recognized: perception.perception_result !== 'not_perceived'
      && (semantic.speaker_recognition ?? 'recognized') === 'recognized'
  };
}
