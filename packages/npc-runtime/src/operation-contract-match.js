import { record } from './internal.js';

export function matchesOperationContract(operation, contract) {
  if (!record(contract)) return false;
  if (!Array.isArray(contract.allowed)) return true;
  if (contract.allowed.length === 0) return false;
  return contract.allowed.some((entry) =>
    record(entry) && operationMatchesAllowedEntry(operation, entry));
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
