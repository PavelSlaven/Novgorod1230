import { fail, text } from
  './lower-dvina-trace-turn-step-persistence-support.js';

export function blockedMoves(seed) {
  const blocked = new Map();
  for (const value of Object.values(seed ?? {}).filter((entry) =>
    entry?.change === 'move_blocked')) {
    const key = `${value.step_index}:${value.operation_index}`;
    if (!Number.isInteger(value.step_index)
        || !Number.isInteger(value.operation_index) || blocked.has(key)) {
      bindingMismatch(value, 'blocked move marker is invalid');
    }
    blocked.set(key, value);
  }
  return blocked;
}

export function consumeBlockedSlots(slots, cursor, blocked, aliases) {
  while (slots[cursor]?.blocked === true) {
    const slot = slots[cursor];
    const key = `${slot.step}:${slot.operationIndex}`;
    const marker = blocked.get(key);
    if (slot.operation.op !== 'move_entity'
        || !['hands_full', 'load_limit'].includes(marker?.reason)
        || marker.entity_ref !== (aliases.get(slot.operation.entity_ref)
          ?? slot.operation.entity_ref)) {
      bindingMismatch(marker,
        'blocked move is not bound to the approved operation');
    }
    blocked.delete(key);
    cursor += 1;
  }
  if (cursor === slots.length && blocked.size > 0) {
    bindingMismatch([...blocked.values()][0],
      'blocked move has no approved operation');
  }
  return cursor;
}

export function bindingMismatch(value, reason) {
  fail('TRACE_TURN_STEP_OPERATION_PLAN_MISMATCH', { reason,
    operation_id: text(value?.operation_id) ? value.operation_id : null,
    activity_id: text(value?.activity_id) ? value.activity_id : null,
    step_index: value?.step_index ?? null,
    operation_kind: value?.operation_kind ?? 'semantic_activity'
  });
}
