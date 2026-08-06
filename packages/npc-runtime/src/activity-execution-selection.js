import { deepFreeze } from '@rus/kernel';

export function selectApplicableNpcActivityExecution(input = {}) {
  const operation = input.operation;
  if (operation?.op !== 'request_activity'
      || !Array.isArray(operation.target_refs)
      || !Array.isArray(input.activity_profiles)
      || !Array.isArray(input.execution_bindings)
      || !Array.isArray(input.movement_bindings)
      || !Array.isArray(input.property_transition_profiles)) {
    return failed('NPC_ACTIVITY_EXECUTION_SELECTION_INVALID');
  }
  const profiles = new Map(input.activity_profiles.map(
    (profile) => [profile.profile_id, profile]));
  const movements = new Map(input.movement_bindings.map(
    (binding) => [binding.transition_id, binding]));
  const transitions = new Map(input.property_transition_profiles.map(
    (profile) => [profile.transition_profile_id, profile]));
  const matches = input.execution_bindings.filter((binding) => applicable({
    operation,
    binding,
    profile: profiles.get(binding.activity_profile_ref),
    movements,
    transitions
  }));
  if (matches.length !== 1) {
    return failed(matches.length === 0
      ? 'NPC_ACTIVITY_EXECUTION_NOT_APPLICABLE'
      : 'NPC_ACTIVITY_EXECUTION_AMBIGUOUS');
  }
  return deepFreeze({
    pass: true,
    execution_binding: structuredClone(matches[0]),
    errors: []
  });
}

function applicable({ operation, binding, profile, movements, transitions }) {
  if (!profile || !activityKindMatches(operation.activity_kind, profile,
    binding)) return false;
  const required = new Set(profile.resource_refs ?? []);
  if (binding.movement_ref != null) {
    const movement = movements.get(binding.movement_ref);
    if (!movement) return false;
    required.add(movement.destination_zone_ref);
  }
  for (const ref of binding.property_transition_refs ?? []) {
    const transition = transitions.get(ref);
    if (!transition) return false;
    required.add(transition.subject_ref);
    required.add(transition.writes?.zone_ref
      ?? transition.writes?.location_ref);
  }
  return sameSet(operation.target_refs, [...required]);
}

function activityKindMatches(kind, profile, binding) {
  if (kind === 'wait') {
    return profile.activity_type === 'autonomous_wait'
      && binding.movement_ref === null
      && binding.property_transition_refs?.length === 0;
  }
  if (kind === 'carry') {
    return profile.activity_type === 'autonomous_local_property_transfer'
      && binding.movement_ref != null
      && binding.property_transition_refs?.length > 0;
  }
  return false;
}

function sameSet(left, right) {
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  return leftSet.size === left.length
    && rightSet.size === right.length
    && leftSet.size === rightSet.size
    && [...leftSet].every((value) => rightSet.has(value));
}

function failed(code) {
  return deepFreeze({
    pass: false,
    errors: [{ code, category: 'validation', retryable: false }]
  });
}
