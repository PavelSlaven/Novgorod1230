import { resolveConversationListenerPerception } from '@rus/npc-runtime';
import { projectConversationAudience } from
  '@rus/visibility-knowledge-memory';
import { compareRefs, npcRef, ref } from
  './lower-dvina-trace-m2-conversation-shared.js';

export function audienceForStatement(
  context,
  statement,
  listenerActors,
  extraListenerRefs
) {
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
        language_comprehension: semantic.language_comprehension ?? 'full',
        speaker_recognition: semantic.speaker_recognition ?? 'recognized'
      });
      return {
        ...perception,
        perceived_at: structuredClone(context.state.clock),
        same_time_batch_ref: ref('temporal_batch', context.batchKey)
      };
    })
  });
}
