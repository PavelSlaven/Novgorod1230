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
  check_result: checkResult, working_state: working,
  temporal_slice: temporalSlice = null,
  execution_profile: executionProfile = null }, context) {
  if (!['reach', 'break_contact'].includes(intent?.intent_kind)
      || checkResult?.outcome?.success === false) return unchanged(working);
  const supplied = executionProfile?.position_plan;
  const planned = supplied == null ? resolveTraceCombatPositionPlan({ intent,
    workingState: working, movementBindings: context.movementBindings })
    : { proposal: structuredClone(supplied) };
  if (!planned) fail('TRACE_COMBAT_MOVEMENT_OWNER_REJECTED');
  if (!sameRef(planned.proposal.actor_ref, intent.actor_ref)
      || !sameRef(planned.proposal.destination.entity_ref,
        intent.destination_ref)) {
    fail('TRACE_COMBAT_MOVEMENT_OWNER_REJECTED');
  }
  if (temporalSlice?.completion_due === false
      && planned.proposal.execution_mode === 'immediate_position_transition') {
    return unchanged(working);
  }
  if (intent.actor_ref.entity_kind !== 'npc') {
    fail('TRACE_COMBAT_NPC_MOVEMENT_REQUIRED');
  }
  const movement = executePlannedMovement(planned.proposal, {
    ...context, step, intent, workingState: working, temporalSlice });
  const next = structuredClone(movement.working_state);
  const traversal = movement.result.traversal;
  if (traversal?.terminal === false && traversal?.stranded !== true) {
    next.active_combat_traversals = [
      ...(next.active_combat_traversals ?? []).filter((entry) =>
        !sameRef(entry.actor_ref, intent.actor_ref)
          || entry.intent_id !== intent.intent_id),
      { actor_ref: structuredClone(intent.actor_ref),
        intent_id: intent.intent_id,
        movement_ref: planned.proposal.movement_ref,
        traversal: structuredClone(traversal) }
    ];
    const eventId = movementEventId(context.session.combat_id, step,
      planned.proposal.movement_ref, traversal);
    return { working_state: next, movement_result: movement.result,
      completed_intent: false, participant_status_updates: [],
      outcome_events: [movementEvent({ eventId, eventKind:
        'combat_position_transition_progressed', context, step, intent,
      planned, traversal })], signal_descriptors: [] };
  }
  if (traversal?.stranded === true) {
    next.active_combat_traversals = (next.active_combat_traversals ?? [])
      .filter((entry) => !sameRef(entry.actor_ref, intent.actor_ref)
        || entry.intent_id !== intent.intent_id);
    const eventId = movementEventId(context.session.combat_id, step,
      planned.proposal.movement_ref, traversal);
    return { working_state: next, movement_result: movement.result,
      completed_intent: false, participant_status_updates: [],
      outcome_events: [movementEvent({ eventId, eventKind:
        'combat_position_transition_interrupted', context, step, intent,
      planned, traversal })], signal_descriptors: [] };
  }
  next.active_combat_traversals = (next.active_combat_traversals ?? [])
    .filter((entry) => !sameRef(entry.actor_ref, intent.actor_ref)
      || entry.intent_id !== intent.intent_id);
  const npc = next.npcs?.find(
    ({ instance_id: id }) => id === intent.actor_ref.entity_id);
  if (!npc) fail('TRACE_COMBAT_MOVEMENT_ACTOR_MISSING');
  const destination = movement.destination;
  npc.anchor_id = destination.anchor_id ?? npc.anchor_id;
  npc.location_profile_ref = destination.location_ref;
  npc.zone_ref = destination.zone_ref;
  npc.machine_state = { ...npc.machine_state,
    location_ref: destination.location_ref,
    spatial_zone_ref: destination.zone_ref };
  const eventId = movementEventId(context.session.combat_id, step,
    planned.proposal.movement_ref, traversal);
  return { working_state: next, movement_result: movement.result,
    completed_intent: intent.intent_kind === 'reach',
    participant_status_updates: intent.intent_kind === 'break_contact'
      ? [{ actor_ref: structuredClone(intent.actor_ref),
        combat_status: 'left', clear_intent: true }] : [],
    outcome_events: [movementEvent({ eventId, eventKind:
      'combat_position_transition_completed', context, step, intent,
    planned, traversal })],
    signal_descriptors: [{ category: 'objective', significance: 'material',
      source_event_ref: { entity_kind: 'combat_event', entity_id: eventId },
      subject_ref: structuredClone(intent.actor_ref), scope_refs: [
        structuredClone(intent.destination_ref)], perception_required: false,
      perceived_change_summary: intent.intent_kind === 'reach'
        ? 'Персонаж достиг выбранного места или предмета; прежнее намерение завершено.'
        : 'Персонаж завершил перемещение и покинул непосредственное столкновение.'
    }] };
}

function executePlannedMovement(proposal, context) {
  if (proposal.execution_mode === 'immediate_position_transition') {
    return { working_state: context.workingState,
      destination: proposal.destination, result: proposal };
  }
  if (proposal.execution_mode !== 'requires_traversal_runtime_completion'
      || typeof context.executeTraversal !== 'function') {
    fail('TRACE_COMBAT_TRAVERSAL_OWNER_REQUIRED');
  }
  const traversal = context.executeTraversal({ proposal,
    step: context.step, intent: context.intent,
    working_state: context.workingState,
    temporal_slice: context.temporalSlice });
  const terminal = traversal?.terminal === true;
  const stranded = traversal?.stranded === true;
  const expectedResult = terminal ? 'segment_completed'
    : stranded ? 'stranded' : 'paused_in_transit';
  const expectedTravelStatus = terminal ? 'completed'
    : stranded ? 'stranded_in_transit' : 'paused_in_transit';
  const exact = context.temporalSlice?.exact_duration?.exact_minutes
    ?? proposal.exact_elapsed.exact_minutes;
  if (traversal?.owner !== '@rus/movement-routes'
      || !sameRef(traversal.actor_ref, context.intent.actor_ref)
      || traversal.route_binding?.route_id !== proposal.movement_ref
      || traversal.interval_result?.result_kind !== expectedResult
      || (terminal
        ? traversal.final_travel_state?.closed_result !== expectedTravelStatus
        : traversal.final_travel_state?.status !== expectedTravelStatus)
      || traversal.source_endpoint?.location_ref !== proposal.source.location_ref
      || traversal.source_endpoint?.g5_anchor_id !== proposal.source.anchor_id
      || traversal.target_endpoint?.location_ref
        !== proposal.destination.location_ref
      || traversal.target_endpoint?.g5_anchor_id
        !== proposal.destination.anchor_id
      || traversal.interval_result.actual_time_numerator
        !== exact.numerator
      || traversal.interval_result.actual_time_denominator !== '1') {
    fail('TRACE_COMBAT_TRAVERSAL_NOT_COMPLETED');
  }
  return { working_state: context.workingState,
    destination: proposal.destination,
    result: { ...proposal, traversal: structuredClone(traversal) } };
}

function movementEventId(combatId, step, movementRef, traversal) {
  return `combat-event:${combatId}:step:${step.proposal_id}:movement:${
    movementRef}:interval:${traversal?.interval_result?.interval_ordinal ?? 0}`;
}
function movementEvent({ eventId, eventKind, context, step, intent, planned,
  traversal }) {
  return { event_id: eventId, event_kind: eventKind,
    combat_id: context.session.combat_id,
    source_step_ref: { entity_kind: 'combat_technical_step',
      entity_id: step.proposal_id },
    actor_ref: structuredClone(intent.actor_ref),
    destination_ref: structuredClone(intent.destination_ref),
    movement_ref: planned.proposal.movement_ref,
    exact_elapsed: structuredClone(traversal == null
      ? planned.proposal.exact_elapsed
      : { exact_minutes: {
        numerator: traversal.interval_result.actual_time_numerator,
        denominator: traversal.interval_result.actual_time_denominator } }),
    ...(traversal == null ? {} : {
      traversal_execution_ref: { entity_kind: 'route_plan_execution',
        entity_id: traversal.ids.execution_id },
      traversal_interval_ref: { entity_kind: 'traversal_interval_result',
        entity_id: traversal.ids.interval_id },
      inventory_load: structuredClone(traversal.inventory_load)
    }) };
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
    local_access_bindings:
      movementBindings?.local_access_bindings ?? [],
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
    participant_slot_ref: npc.participant_slot_ref,
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
