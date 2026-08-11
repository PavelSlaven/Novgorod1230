import { planApprovedActorDestinationTransition } from '@rus/movement-routes';

export function resolveTraceCombatSpatialAffordances({ actorRef, state,
  movementBindings }) {
  const applicable = actorDestinationBindings(actorRef, movementBindings)
    .filter((binding) => applicablePlan({ actorRef,
      destinationRef: binding.destination_ref, intentKind: binding.intent_kind,
      state, movementBindings }) != null);
  return {
    reachable_destination_refs: uniqueRefs(applicable
      .filter(({ intent_kind: kind }) => kind === 'reach')
      .map(({ destination_ref: ref }) => ref)),
    break_contact_destination_refs: uniqueRefs(applicable
      .filter(({ intent_kind: kind }) => kind === 'break_contact')
      .map(({ destination_ref: ref }) => ref))
  };
}

export function restrictTraceCombatSpatialIntents(operationContract, spatial) {
  const unavailable = new Set([
    ...(spatial.reachable_destination_refs.length === 0 ? ['reach'] : []),
    ...(spatial.break_contact_destination_refs.length === 0
      ? ['break_contact'] : [])
  ]);
  return { ...structuredClone(operationContract),
    allowed_intent_kinds: (operationContract.allowed_intent_kinds ?? [])
      .filter((kind) => !unavailable.has(kind)), ...spatial };
}

export function resolveTraceCombatPositionPlan({ intent, workingState,
  movementBindings }) {
  if (!['reach', 'break_contact'].includes(intent?.intent_kind)
      || intent.destination_ref == null) return null;
  return applicablePlan({ actorRef: intent.actor_ref,
    destinationRef: intent.destination_ref, intentKind: intent.intent_kind,
    state: workingState, movementBindings });
}

export function applyTraceCombatPositionTransition({ step, intent,
  check_result: checkResult, working_state: working }, context) {
  if (!['reach', 'break_contact'].includes(intent?.intent_kind)
      || checkResult?.outcome?.success === false) return unchanged(working);
  const planned = resolveTraceCombatPositionPlan({ intent,
    workingState: working, movementBindings: context.movementBindings });
  if (!planned) fail('TRACE_COMBAT_MOVEMENT_OWNER_REJECTED');
  if (intent.actor_ref.entity_kind !== 'npc') {
    fail('TRACE_COMBAT_NPC_MOVEMENT_REQUIRED');
  }
  const next = structuredClone(working);
  const npc = next.npcs?.find(
    ({ instance_id: id }) => id === intent.actor_ref.entity_id);
  if (!npc) fail('TRACE_COMBAT_MOVEMENT_ACTOR_MISSING');
  const destination = planned.proposal.destination;
  npc.anchor_id = destination.anchor_id ?? npc.anchor_id;
  npc.location_profile_ref = destination.location_ref;
  npc.zone_ref = destination.zone_ref;
  npc.machine_state = { ...npc.machine_state,
    location_ref: destination.location_ref,
    spatial_zone_ref: destination.zone_ref };
  const eventId = `combat-event:${context.session.combat_id}:step:${
    step.proposal_id}:movement:${planned.proposal.movement_ref}`;
  return { working_state: next, movement_result: planned.proposal,
    completed_intent: intent.intent_kind === 'reach',
    participant_status_updates: intent.intent_kind === 'break_contact'
      ? [{ actor_ref: structuredClone(intent.actor_ref),
        combat_status: 'left', clear_intent: true }] : [],
    outcome_events: [{ event_id: eventId,
      event_kind: 'combat_position_transition_completed',
      combat_id: context.session.combat_id,
      source_step_ref: { entity_kind: 'combat_technical_step',
        entity_id: step.proposal_id },
      actor_ref: structuredClone(intent.actor_ref),
      destination_ref: structuredClone(intent.destination_ref),
      movement_ref: planned.proposal.movement_ref }] };
}

function applicablePlan({ actorRef, destinationRef, intentKind, state,
  movementBindings }) {
  const binding = actorDestinationBindings(actorRef, movementBindings).find(
    (candidate) => candidate.intent_kind === intentKind
      && sameRef(candidate.destination_ref, destinationRef));
  if (!binding) return null;
  const actor = actorSpatial(actorRef, state);
  const destination = binding.destination
    ?? destinationSpatial(destinationRef, state);
  if (!actor || !destination) return null;
  const result = planApprovedActorDestinationTransition({
    state_version: state.party_state?.state_version,
    expected_state_version: state.party_state?.state_version,
    actor, destination,
    local_transition_bindings:
      movementBindings?.local_transition_bindings ?? [],
    route_bindings: movementBindings?.route_bindings ?? [],
    known_route_refs: [binding.movement_ref],
    allowed_movement_refs: [binding.movement_ref]
  });
  return result.pass ? result : null;
}

function actorDestinationBindings(actorRef, movementBindings) {
  return (movementBindings?.actor_destination_bindings ?? []).filter(
    ({ actor_ref: candidate }) => sameRef(candidate, actorRef));
}

function actorSpatial(actorRef, state) {
  if (actorRef?.entity_kind !== 'npc') return null;
  const npc = state.npcs?.find(
    ({ instance_id: id }) => id === actorRef.entity_id);
  if (!npc) return null;
  const machineLocation = npc.machine_state?.location_ref;
  const sharesPlayerAnchor = npc.anchor_id != null
    && npc.anchor_id === state.position?.g5_anchor_id;
  const usePlayerPosition = sharesPlayerAnchor
    && machineLocation !== state.position?.location_ref;
  const playerScene = usePlayerPosition ? state.prepared_scenes?.find(
    ({ location_profile_ref: id }) => id === state.position.location_ref)
    : null;
  return { actor_ref: structuredClone(actorRef), anchor_id: npc.anchor_id,
    location_ref: usePlayerPosition ? state.position.location_ref
      : machineLocation ?? npc.location_profile_ref,
    zone_ref: usePlayerPosition
      ? playerScene?.anchor?.state?.zone_ref ?? state.position.zone_ref
      : npc.machine_state?.spatial_zone_ref ?? npc.zone_ref };
}

function destinationSpatial(destinationRef, state) {
  if (destinationRef?.entity_kind === 'location_anchor') {
    const scene = state.prepared_scenes?.find(
      ({ anchor }) => anchor?.instance_id === destinationRef.entity_id);
    if (!scene?.location_profile_ref) return null;
    return { entity_ref: structuredClone(destinationRef),
      location_ref: scene.location_profile_ref,
      zone_ref: scene.anchor.state?.zone_ref ?? scene.anchor.slot_key,
      anchor_id: scene.anchor.instance_id };
  }
  if (destinationRef?.entity_kind === 'container') {
    const container = state.containers?.find(
      ({ container_id: id }) => id === destinationRef.entity_id);
    const locationRef = container?.state?.location_ref;
    const zoneRef = container?.state?.zone_ref;
    if (!locationRef || !zoneRef) return null;
    return { entity_ref: structuredClone(destinationRef),
      location_ref: locationRef, zone_ref: zoneRef,
      anchor_id: container.anchor_id ?? null };
  }
  return null;
}

function uniqueRefs(refs) {
  const seen = new Set();
  return refs.filter((value) => {
    const key = `${value.entity_kind}\0${value.entity_id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).map((value) => structuredClone(value));
}

function sameRef(left, right) {
  return left?.entity_kind === right?.entity_kind
    && left?.entity_id === right?.entity_id;
}
function unchanged(working) { return { working_state: structuredClone(working),
  participant_status_updates: [], outcome_events: [],
  completed_intent: false }; }
function fail(code) { throw Object.assign(new Error(code), { code }); }
