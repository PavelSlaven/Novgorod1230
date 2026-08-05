import { resolveConversationVisualPerception } from '@rus/npc-runtime';
import { ref } from './lower-dvina-trace-m2-conversation-shared.js';

export function evidencePresentationPerception(context) {
  const presentation = context.evidencePresentation;
  if (presentation == null) return null;
  const target = context.actualNpcActors.find(
    ({ instance_id: instanceId }) => instanceId === context.targetRef.entity_id
  );
  const machine = target?.machine_state ?? {};
  const targetAnchor = target?.anchor_id;
  const actorAnchor = context.state.position.g5_anchor_id;
  const perceptionId = `perception:${presentation.event_id}:${
    context.targetRef.entity_id}`;
  const resolved = resolveConversationVisualPerception({
    observer_ref: context.targetRef,
    perception_result_ref: ref('perception_result', perceptionId),
    visual_path: targetAnchor && targetAnchor === actorAnchor
      ? 'clear' : 'blocked',
    distance_band: targetAnchor && targetAnchor === actorAnchor
      ? 'conversation' : 'distant',
    ambient_visibility:
      context.state.environment?.ambient_visibility ?? 'clear',
    visual_capability: machine.visual_capability ?? 'full',
    attention: ['unconscious', 'incapacitated'].includes(machine.status)
      ? 'unavailable'
      : machine.attention ?? 'available'
  });
  return Object.freeze({
    schema: 'conversation_supporting_operation_perception_v1',
    perception_id: perceptionId,
    conversation_id: presentation.conversation_id,
    exchange_id: presentation.exchange_id,
    observer_ref: structuredClone(context.targetRef),
    source_event_ref: ref('evidence_presentation', presentation.event_id),
    subject_ref: structuredClone(presentation.entity_ref),
    result_kind: resolved.perception_result,
    occurred_at: structuredClone(context.state.clock)
  });
}
