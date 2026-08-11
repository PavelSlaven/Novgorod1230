import { deepFreeze } from '@rus/kernel';

/** Plans one factual actor move to an approved, already materialized target. */
export function planApprovedActorDestinationTransition(input = {}) {
  if (!validStateVersion(input.state_version)
      || !validStateVersion(input.expected_state_version)
      || String(input.expected_state_version) !== String(input.state_version)) {
    return failed('STATE_VERSION_MISMATCH');
  }
  const actor = input.actor;
  const destination = input.destination;
  if (!validActor(actor) || !validDestination(destination)) {
    return failed('APPROVED_DESTINATION_TRANSITION_INPUT_INVALID');
  }
  const candidates = [
    ...localCandidates(input.local_transition_bindings, actor, destination,
      input.allowed_movement_refs),
    ...routeCandidates(input.route_bindings, actor, destination,
      input.known_route_refs, input.allowed_movement_refs)
  ];
  if (candidates.length !== 1) {
    return failed(candidates.length === 0
      ? 'APPROVED_DESTINATION_TRANSITION_NOT_APPLICABLE'
      : 'APPROVED_DESTINATION_TRANSITION_AMBIGUOUS');
  }
  return deepFreeze({ pass: true, proposal: candidates[0], errors: [] });
}

function localCandidates(bindings = [], actor, destination, allowed = []) {
  if (actor.location_ref !== destination.location_ref
      || actor.zone_ref === destination.zone_ref) return [];
  return bindings.filter((binding) =>
    binding?.schema === 'rus.trace_local_zone_transition.v1'
    && binding.terminal_outcome === 'same_materialized_location_new_zone'
    && binding.location_ref === actor.location_ref
    && binding.source_zone_candidates?.includes(actor.zone_ref)
    && binding.destination_zone_ref === destination.zone_ref
    && binding.admitted_subject_classes?.includes('actor')
    && allowedMovement(binding.transition_id, allowed)
    && positiveMinutes(binding.duration_minutes)
  ).map((binding) => proposal({ kind: 'local_zone_transition',
    movementRef: binding.transition_id, actor, destination,
    durationMinutes: binding.duration_minutes }));
}

function routeCandidates(bindings = [], actor, destination, known = [],
  allowed = []) {
  if (actor.location_ref === destination.location_ref) return [];
  const byId = new Map(bindings.map((binding) => [binding?.route_id, binding]));
  const knownRefs = new Set(known ?? []);
  return bindings.filter((binding) => {
    const reverse = byId.get(binding?.reverse_route_ref);
    const routeKnown = binding?.knowledge_state !== 'closed_until_disclosed'
      || knownRefs.has(binding.route_id)
      || knownRefs.has(binding.reverse_route_ref);
    return binding?.schema === 'rus.trace_movement_binding.v1'
      && binding.terminal_position_outcome === destination.location_ref
      && reverse?.terminal_position_outcome === actor.location_ref
      && reverse.reverse_route_ref === binding.route_id
      && allowedMovement(binding.route_id, allowed)
      && positiveMinutes(binding.duration_minutes)
      && routeKnown;
  }).map((binding) => proposal({ kind: 'route_traversal',
    movementRef: binding.route_id, actor, destination,
    durationMinutes: binding.duration_minutes }));
}

function proposal({ kind, movementRef, actor, destination, durationMinutes }) {
  return {
    owner: '@rus/movement-routes',
    movement_kind: kind,
    movement_ref: movementRef,
    actor_ref: structuredClone(actor.actor_ref),
    source: spatialSnapshot(actor),
    destination: {
      entity_ref: structuredClone(destination.entity_ref),
      ...spatialSnapshot(destination)
    },
    exact_elapsed: { exact_minutes: {
      numerator: String(durationMinutes), denominator: '1'
    } },
    clock_write: 'single_via_parent_execution'
  };
}

function spatialSnapshot(value) {
  return { location_ref: value.location_ref, zone_ref: value.zone_ref,
    anchor_id: value.anchor_id ?? null };
}

function validActor(value) {
  return validRef(value?.actor_ref) && text(value.location_ref)
    && text(value.zone_ref);
}

function validDestination(value) {
  return validRef(value?.entity_ref) && text(value.location_ref)
    && text(value.zone_ref);
}

function validRef(value) {
  return text(value?.entity_kind) && text(value?.entity_id);
}

function positiveMinutes(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function allowedMovement(id, allowed) {
  return !Array.isArray(allowed) || allowed.length === 0
    || allowed.includes(id);
}

function validStateVersion(value) {
  return Number.isSafeInteger(value) && value >= 0
    || typeof value === 'string' && /^(?:0|[1-9][0-9]*)$/u.test(value);
}

function text(value) {
  return typeof value === 'string' && value.length > 0;
}

function failed(code) {
  return deepFreeze({ pass: false,
    errors: [{ code, category: 'validation', retryable: false }] });
}
