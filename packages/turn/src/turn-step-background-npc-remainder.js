import { deepFreeze } from '@rus/kernel';

export function isBackgroundNpcSemanticRemainderInScope({ operation,
  playerSafeState }) {
  const marker = exactMarker(playerSafeState?.background_npc_remainder);
  if (marker == null || operation?.op !== 'request_discovery'
      || !['look', 'inspect'].includes(operation.discovery_kind)
      || !Array.isArray(operation.target_refs)
      || operation.target_refs.length !== 1) return false;
  const target = operation.target_refs[0];
  return marker.eligible_npc_refs.includes(target)
    && (playerSafeState.current_visible_context?.visible_npc ?? [])
      .some((entry) => entry?.entity_ref?.entity_kind === 'npc'
        && entry.entity_ref.entity_id === target);
}

export function resolveBackgroundNpcSemanticRemainder({ resolver, execution,
  actor, committedState }) {
  return resolver(deepFreeze({
    schema: 'turn_step_background_npc_remainder_request_v1',
    operation: structuredClone(execution.operation),
    plan: structuredClone(execution.plan),
    request: structuredClone(execution.request),
    actor: structuredClone(actor),
    working_projection: structuredClone(execution.working_projection),
    committed_state: structuredClone(committedState)
  }));
}

function exactMarker(value) {
  if (value == null || typeof value !== 'object' || Array.isArray(value)
      || Object.getPrototypeOf(value) !== Object.prototype
      || Object.keys(value).length !== 2
      || value.semantic_grounding_available !== true
      || !Array.isArray(value.eligible_npc_refs)
      || value.eligible_npc_refs.length === 0
      || new Set(value.eligible_npc_refs).size !== value.eligible_npc_refs.length
      || value.eligible_npc_refs.some((ref) => typeof ref !== 'string'
        || ref.length === 0)) return null;
  return value;
}
