import { exactKeys, record, stableId, uniqueStableIds } from './internal.js';

export function validateWorldProcessOperation(value) {
  return exactKeys(value, ['op', 'actor_ref', 'process_action', 'process_ref',
    'process_kind', 'source_refs', 'target_refs', 'description'])
    && value.op === 'request_world_process' && stableId(value.actor_ref)
    && ['start', 'affect'].includes(value.process_action)
    && (value.process_action === 'start'
      ? value.process_ref === null : stableId(value.process_ref))
    && value.process_kind === 'fire' && uniqueStableIds(value.source_refs)
    && value.source_refs.length > 0 && uniqueStableIds(value.target_refs)
    && (value.process_action === 'start'
      ? value.target_refs.length > 0 : value.target_refs.length === 0)
    && stableId(value.description);
}

export function worldProcessOperationRefs(operation) {
  return [operation.actor_ref,
    ...(operation.process_ref === null ? [] : [operation.process_ref]),
    ...operation.source_refs, ...operation.target_refs];
}

export function matchesOperationContract(operation, contract) {
  if (!record(contract)) return false;
  if (Array.isArray(contract.allowed)) {
    if (contract.allowed.length === 0) return false;
    return contract.allowed.some((entry) =>
      record(entry) && operationMatchesAllowedEntry(operation, entry));
  }
  return matchesCapabilityContract(operation, contract);
}

function matchesCapabilityContract(operation, contract) {
  if (operation.op === 'request_activity') {
    return (!Array.isArray(contract.activity_kinds)
        || contract.activity_kinds.includes(operation.activity_kind))
      && (!Array.isArray(contract.target_refs)
        || operation.target_refs.every((ref) =>
          contract.target_refs.includes(ref)));
  }
  if (operation.op === 'request_item_use') {
    return (!Array.isArray(contract.item_refs)
        || contract.item_refs.includes(operation.item_ref))
      && (!Array.isArray(contract.use_kinds)
        || contract.use_kinds.includes(operation.use_kind))
      && (!Array.isArray(contract.target_refs)
        || operation.target_refs.every((ref) =>
          contract.target_refs.includes(ref)));
  }
  if (operation.op === 'request_movement') {
    return (!Array.isArray(contract.movement_kinds)
        || contract.movement_kinds.includes(operation.movement_kind))
      && (!Array.isArray(contract.target_refs)
        || contract.target_refs.includes(operation.target_ref));
  }
  if (operation.op === 'request_world_process') {
    return Array.isArray(contract.process_actions)
      && contract.process_actions.includes(operation.process_action)
      && Array.isArray(contract.process_kinds)
      && contract.process_kinds.includes(operation.process_kind)
      && Array.isArray(contract.process_refs)
      && contract.process_refs.includes(operation.process_ref)
      && Array.isArray(contract.source_refs)
      && operation.source_refs.every((ref) => contract.source_refs.includes(ref))
      && Array.isArray(contract.target_refs)
      && operation.target_refs.every((ref) => contract.target_refs.includes(ref));
  }
  return true;
}

function operationMatchesAllowedEntry(operation, entry) {
  if (operation.op === 'request_activity') {
    return entry.activity_kind === operation.activity_kind
      && sameIdSet(entry.target_refs, operation.target_refs);
  }
  if (operation.op === 'request_item_use') {
    return entry.item_ref === operation.item_ref
      && entry.use_kind === operation.use_kind
      && sameIdSet(entry.target_refs, operation.target_refs);
  }
  if (operation.op === 'request_world_process') {
    return entry.process_action === operation.process_action
      && entry.process_ref === operation.process_ref
      && entry.process_kind === operation.process_kind
      && sameIdSet(entry.source_refs, operation.source_refs)
      && sameIdSet(entry.target_refs, operation.target_refs);
  }
  return true;
}

function sameIdSet(left, right) {
  return Array.isArray(left)
    && Array.isArray(right)
    && left.length === right.length
    && new Set(left).size === left.length
    && left.every((value) => right.includes(value));
}
