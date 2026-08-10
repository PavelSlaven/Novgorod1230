import { deepFreeze } from '@rus/kernel';

/** Plans one approved movement inside an already materialized location. */
export function planApprovedLocalZoneTransition(input = {}) {
  const binding = input.transition_binding;
  const actor = input.actor;
  const parent = binding?.elapsed_accounting?.parent_execution_roles?.[
    input.parent_execution_ref
  ];
  if (input.expected_state_version !== input.state_version) {
    return failed('STATE_VERSION_MISMATCH');
  }
  if (!binding || binding.schema !== 'rus.trace_local_zone_transition.v1'
      || binding.terminal_outcome !== 'same_materialized_location_new_zone'
      || parent?.role !== 'root_interval'
      || parent.clock_write !== 'single'
      || !binding.admitted_subject_classes?.includes('actor')
      || !Number.isSafeInteger(binding.duration_minutes)
      || binding.duration_minutes <= 0) {
    return failed('APPROVED_LOCAL_TRANSITION_INVALID');
  }
  if (!actor?.actor_id || actor.location_ref !== binding.location_ref
      || !binding.source_zone_candidates.includes(actor.zone_ref)) {
    return failed('APPROVED_LOCAL_TRANSITION_SOURCE_MISMATCH');
  }
  return deepFreeze({
    pass: true,
    proposal: {
      owner: '@rus/movement-routes',
      transition_ref: binding.transition_id,
      actor_id: actor.actor_id,
      location_ref: binding.location_ref,
      source_zone_ref: actor.zone_ref,
      destination_zone_ref: binding.destination_zone_ref,
      exact_elapsed: { exact_minutes: {
        numerator: String(binding.duration_minutes), denominator: '1'
      } },
      clock_write: 'single_via_parent_execution'
    },
    errors: []
  });
}

function failed(code) {
  return deepFreeze({
    pass: false,
    errors: [{ code, category: 'validation', retryable: false }]
  });
}
