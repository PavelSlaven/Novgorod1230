import { record } from './internal.js';

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
  return true;
}

function sameIdSet(left, right) {
  return Array.isArray(left)
    && Array.isArray(right)
    && left.length === right.length
    && new Set(left).size === left.length
    && left.every((value) => right.includes(value));
}
