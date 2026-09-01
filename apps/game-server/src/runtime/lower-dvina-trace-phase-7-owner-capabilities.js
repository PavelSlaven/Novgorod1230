import { resolveTracePhase7DomainProposals, tracePhase7ItemUseTransitions,
  tracePhase7PropertyTransitions, tracePhase7TransitionTarget } from
  './lower-dvina-trace-phase-7-owner-proposals.js';
import { mergePhase7Capability, registeredPhase7Owners } from
  './lower-dvina-trace-phase-7-owner-registry.js';
import { projectNpcSafeResourceSnapshots } from '@rus/npc-runtime';

export function projectTracePhase7OwnerCapabilities({ contracts,
  worldProcessContract, npcOwnerCapabilities, state, worldProcessResolver,
  directHandlers = {}, directOperationContract = {} }) {
  const safeResourceRefs = npcSafeResourceRefs(contracts, state);
  const activityAllowed = exactActivityAllowed(
    contracts, state, safeResourceRefs);
  const itemAllowed = exactItemAllowed(contracts, state, safeResourceRefs);
  const movement = applicableMovement(contracts, state);
  const operationContract = {};
  if (activityAllowed.length > 0) operationContract.request_activity = {
    owner: '@rus/turn',
    allowed: activityAllowed,
    factual_outcome_write: 'forbidden'
  };
  if (itemAllowed.length > 0) operationContract.request_item_use = {
    owner: '@rus/items-property',
    allowed: itemAllowed,
    factual_outcome_write: 'owner_only'
  };
  if (movement != null) operationContract.request_movement = movement;
  for (const [operation, descriptor] of Object.entries(directOperationContract)) {
    if (typeof directHandlers[operation] === 'function'
        && descriptor != null && typeof descriptor === 'object'
        && !Array.isArray(descriptor)) {
      operationContract[operation] = structuredClone(descriptor);
    }
  }
  const additional = registeredPhase7Owners({ npcOwnerCapabilities, state,
    contracts, worldProcessContract, worldProcessResolver });
  for (const owner of additional) {
    operationContract[owner.operation] = mergePhase7Capability(
      operationContract[owner.operation], owner.capability);
  }
  return Object.freeze({
    activity_allowed: activityAllowed,
    item_allowed: itemAllowed,
    movement,
    additional_owners: Object.freeze(additional),
    direct_handlers: Object.freeze({ ...directHandlers }),
    operation_contract: Object.freeze(operationContract)
  });
}

function applicableMovement(contracts, state) {
  if (contracts.localTransition == null) return null;
  const movement = Object.freeze({
    owner: '@rus/movement-routes',
    movement_kinds: Object.freeze(['local']),
    target_refs: Object.freeze([
      contracts.localTransition.destination_zone_ref]),
    route_refs: Object.freeze([contracts.localTransition.transition_id]),
    factual_outcome_write: 'owner_only'
  });
  const operation = { op: 'request_movement',
    actor_ref: contracts.zhdanko.instance_id, movement_kind: 'local',
    target_ref: contracts.localTransition.destination_zone_ref };
  return ownerApplicable({ operation, state, contracts }) ? movement : null;
}

function exactActivityAllowed(contracts, state, safeResourceRefs) {
  const profiles = new Map(contracts.scheduleActivityProfiles.map((profile) =>
    [profile.profile_id, profile]));
  const movements = new Map([[contracts.localTransition.transition_id,
    contracts.localTransition]]);
  const transitions = new Map(tracePhase7PropertyTransitions(contracts).map(
    (profile) => [profile.transition_profile_id, profile]
  ));
  return Object.freeze(Object.values(contracts.scheduleExecutions).flatMap(
    (binding) => {
      const profile = profiles.get(binding.activity_profile_ref);
      const activityKind = activityKindFor(profile, binding);
      if (activityKind == null) fail('TRACE_PHASE_7_EXECUTION_PROFILE_GAP');
      if ((profile.resource_refs ?? []).some(
        (ref) => !safeResourceRefs.has(ref))) return [];
      const required = new Set(profile.resource_refs ?? []);
      if (binding.movement_ref != null) {
        const movement = movements.get(binding.movement_ref);
        if (!movement) fail('TRACE_PHASE_7_EXECUTION_PROFILE_GAP');
        required.add(movement.destination_zone_ref);
      }
      for (const ref of binding.property_transition_refs ?? []) {
        const transition = transitions.get(ref);
        if (!transition) fail('TRACE_PHASE_7_EXECUTION_PROFILE_GAP');
        required.add(transition.subject_ref);
        required.add(transition.writes?.zone_ref
          ?? transition.writes?.location_ref);
      }
      const allowed = Object.freeze({ activity_kind: activityKind,
        target_refs: Object.freeze([...required]) });
      const operation = { op: 'request_activity',
        actor_ref: contracts.zhdanko.instance_id, ...allowed };
      return ownerApplicable({ operation, state, contracts, profile: binding })
        ? [allowed] : [];
    }
  ));
}

function exactItemAllowed(contracts, state, safeResourceRefs) {
  if (!safeResourceRefs.has(contracts.roadBag.item_ref)) return Object.freeze([]);
  const targets = tracePhase7ItemUseTransitions(contracts)
    .map(tracePhase7TransitionTarget);
  return Object.freeze(['operate', 'other'].flatMap((useKind) =>
    targets.flatMap((target) => {
      const allowed = Object.freeze({ item_ref: contracts.roadBag.item_ref,
        use_kind: useKind, target_refs: Object.freeze([target]) });
      const operation = { op: 'request_item_use',
        actor_ref: contracts.zhdanko.instance_id, ...allowed };
      return ownerApplicable({ operation, state, contracts }) ? [allowed] : [];
    })));
}

function npcSafeResourceRefs(contracts, state) {
  const npc = (state.npcs ?? []).find(({ instance_id: instanceId }) =>
    instanceId === contracts.zhdanko.instance_id) ?? contracts.zhdanko;
  return new Set(projectNpcSafeResourceSnapshots({
    npc_snapshot: npc,
    resource_snapshots: [...(state.containers ?? []), ...(state.items ?? [])],
    perception_snapshot: npc.perception_snapshot,
    knowledge_snapshot: npc.knowledge_snapshot
  }).flatMap(({ resource_ref: resourceRef, template_ref: templateRef }) =>
    [resourceRef, templateRef].filter(Boolean)));
}

function activityKindFor(profile, binding) {
  if (profile?.activity_type === 'autonomous_wait'
      && binding.movement_ref === null
      && binding.property_transition_refs?.length === 0) {
    return 'wait';
  }
  if (profile?.activity_type === 'autonomous_local_property_transfer'
      && binding.movement_ref != null
      && binding.property_transition_refs?.length > 0) {
    return 'carry';
  }
  return null;
}

function ownerApplicable(input) {
  try {
    resolveTracePhase7DomainProposals(input);
    return true;
  } catch (error) {
    if (ownerSourceMismatch(error)) return false;
    throw error;
  }
}

function ownerSourceMismatch(error) {
  if (error?.code === 'APPROVED_ITEM_TRANSITION_NOT_APPLICABLE') return true;
  return [
    'APPROVED_LOCAL_TRANSITION_SOURCE_MISMATCH',
    'APPROVED_ITEM_ZONE_TRANSITION_SOURCE_MISMATCH'
  ].includes(error?.details?.[0]?.code);
}

function fail(code) {
  throw Object.assign(new Error(code), { code });
}
