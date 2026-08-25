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
  if (Array.isArray(contract.alternatives)) {
    return contract.alternatives.some((alternative) =>
      matchesOperationContract(operation, alternative));
  }
  if (Array.isArray(contract.allowed)) {
    if (contract.allowed.length === 0) return false;
    return modeTargetsAllowed(operation, contract)
      && contract.allowed.some((entry) =>
      record(entry) && operationMatchesAllowedEntry(operation, entry));
  }
  return modeTargetsAllowed(operation, contract)
    && matchesCapabilityContract(operation, contract);
}

function modeTargetsAllowed(operation, contract) {
  if (!['emit_interaction', 'request_conversation', 'request_combat']
    .includes(operation?.op)) return true;
  return (!Array.isArray(contract.target_actor_refs)
      || Array.isArray(operation.target_actor_refs)
        && operation.target_actor_refs.every((ref) =>
          contract.target_actor_refs.includes(ref)))
    && (operation.op !== 'emit_interaction'
      || !Array.isArray(contract.instrument_refs)
      || Array.isArray(operation.instrument_refs)
        && operation.instrument_refs.every((ref) =>
          contract.instrument_refs.includes(ref)));
}

function matchesCapabilityContract(operation, contract) {
  if (DIRECT_OPERATION_REFS.has(operation.op)) {
    return matchesDirectCapability(operation, contract);
  }
  if (operation.op === 'request_activity') {
    return (!Array.isArray(contract.activity_kinds)
        || contract.activity_kinds.includes(operation.activity_kind))
      && (!Array.isArray(contract.target_refs)
        || operation.target_refs.every((ref) =>
          contract.target_refs.includes(ref)));
  }
  if (operation.op === 'request_item_use') {
    const base = (!Array.isArray(contract.item_refs)
        || contract.item_refs.includes(operation.item_ref))
      && (!Array.isArray(contract.use_kinds)
        || contract.use_kinds.includes(operation.use_kind))
      && (!Array.isArray(contract.target_refs)
        || operation.target_refs.every((ref) =>
          contract.target_refs.includes(ref)));
    const action = operation.action_production;
    return base && (contract.action_production == null || action != null
      && exactActionProductionRefs(operation, contract.action_production));
  }
  if (operation.op === 'request_container_access') {
    return (!Array.isArray(contract.actor_refs)
        || contract.actor_refs.includes(operation.actor_ref))
      && (!Array.isArray(contract.container_refs)
        || contract.container_refs.includes(operation.container_ref))
      && (!Array.isArray(contract.access_kinds)
        || contract.access_kinds.includes(operation.access_kind));
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
  if (DIRECT_OPERATION_REFS.has(operation.op)) {
    return matchesDirectCapability(operation, entry);
  }
  if (operation.op === 'request_discovery') {
    return sameIdSet(entry.target_refs, operation.target_refs)
      && (!Array.isArray(entry.discovery_kinds)
        || entry.discovery_kinds.includes(operation.discovery_kind));
  }
  if (operation.op === 'request_activity') {
    return entry.activity_kind === operation.activity_kind
      && sameIdSet(entry.target_refs, operation.target_refs);
  }
  if (operation.op === 'request_item_use') {
    return entry.item_ref === operation.item_ref
      && entry.use_kind === operation.use_kind
      && sameIdSet(entry.target_refs, operation.target_refs)
      && (entry.action_production == null
        || exactActionProductionRefs(operation, entry.action_production));
  }
  if (operation.op === 'request_container_access') {
    return entry.actor_ref === operation.actor_ref
      && entry.container_ref === operation.container_ref
      && Array.isArray(entry.access_kinds)
      && entry.access_kinds.includes(operation.access_kind);
  }
  if (operation.op === 'request_world_process') {
    return entry.process_action === operation.process_action
      && entry.process_ref === operation.process_ref
      && entry.process_kind === operation.process_kind
      && sameIdSet(entry.source_refs, operation.source_refs)
      && sameIdSet(entry.target_refs, operation.target_refs);
  }
  if (['emit_interaction', 'request_conversation', 'request_combat']
    .includes(operation.op)) {
    return !Array.isArray(entry.target_actor_refs)
      || sameIdSet(entry.target_actor_refs, operation.target_actor_refs);
  }
  return true;
}

const DIRECT_OPERATION_REFS = new Set([
  'create_entity', 'move_entity', 'change_entity_facts',
  'set_entity_mechanics', 'retire_entity', 'apply_body_event'
]);

function matchesDirectCapability(operation, contract) {
  const refs = directRefs(operation);
  return (!Array.isArray(contract.entity_refs)
      || refs.entity_refs.every((ref) => contract.entity_refs.includes(ref)))
    && (!Array.isArray(contract.source_refs)
      || refs.source_refs.every((ref) => contract.source_refs.includes(ref)))
    && (!Array.isArray(contract.target_refs)
      || refs.target_refs.every((ref) => contract.target_refs.includes(ref)))
    && (!Array.isArray(contract.actor_refs)
      || refs.actor_refs.every((ref) => contract.actor_refs.includes(ref)))
    && (!Array.isArray(contract.body_part_refs)
      || operation.body_part_ref == null
      || contract.body_part_refs.includes(operation.body_part_ref))
    && (!Array.isArray(contract.mechanisms)
      || operation.mechanism == null
      || contract.mechanisms.includes(operation.mechanism))
    && (!Array.isArray(contract.severities)
      || operation.severity == null
      || contract.severities.includes(operation.severity));
}

function directRefs(operation) {
  if (operation.op === 'create_entity') return {
    entity_refs: [], source_refs: operation.origin.source_refs,
    target_refs: [operation.placement.target_ref], actor_refs: []
  };
  if (operation.op === 'move_entity') return {
    entity_refs: [operation.entity_ref], source_refs: [],
    target_refs: [operation.placement.target_ref], actor_refs: []
  };
  if (operation.op === 'apply_body_event') return {
    entity_refs: [], source_refs: [], target_refs: [],
    actor_refs: [operation.actor_ref]
  };
  return { entity_refs: [operation.entity_ref], source_refs: [],
    target_refs: [], actor_refs: [] };
}

function exactActionProductionRefs(operation, contract) {
  const action = operation.action_production;
  const sources = action?.source_refs;
  const tools = action?.tool_refs;
  return Array.isArray(sources) && sources.length > 0
    && Array.isArray(tools) && sources[0] === operation.item_ref
    && new Set(sources).size === sources.length
    && new Set(tools).size === tools.length
    && !sources.some((ref) => tools.includes(ref))
    && sources.every((ref) => contract.source_refs.includes(ref))
    && tools.every((ref) => contract.tool_refs.includes(ref))
    && sameIdSet(operation.target_refs, [...sources.slice(1), ...tools]);
}

function sameIdSet(left, right) {
  return Array.isArray(left)
    && Array.isArray(right)
    && left.length === right.length
    && new Set(left).size === left.length
    && left.every((value) => right.includes(value));
}
