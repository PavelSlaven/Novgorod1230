import { serverError } from '../../errors.js';
import {
  resolveBoundarySegmentResume
} from './boundary-policy-execution.js';
import { hash } from './shared.js';

export function resolveBoundaryResume(state, command) {
  const paused = state.boundary_paused_execution;
  if (state.location !== 'boundary_in_transit' || paused == null) {
    throw serverError(
      'BOUNDARY_RESUME_NOT_APPLICABLE',
      'No approved paused boundary traversal is active.',
      { status: 409 }
    );
  }
  if (command.route_binding_ref?.entity_id
      !== paused.route_binding_ref.entity_id
      || command.route_binding_ref?.version
        !== paused.route_binding_ref.version) {
    throw serverError(
      'BOUNDARY_RESUME_PIN_MISMATCH',
      'The paused execution must resume with its exact route pin.',
      { status: 409 }
    );
  }
  const segment = resolveBoundarySegmentResume({
    segment: structuredClone(paused.segment),
    state,
    command,
    progressPpm: paused.progress_ppm
  });
  return {
    success: true,
    resume: true,
    direction: paused.direction,
    route_binding_ref: structuredClone(paused.route_binding_ref),
    destination: paused.direction === 'forward'
      ? 'yp025_navigation_corridor'
      : paused.resume_destination,
    elapsed_minutes: segment.actual_exact_elapsed,
    check: segment.intervals[0].check,
    consequence: null,
    segments: [segment],
    paused_execution: structuredClone(paused)
  };
}

export function pausedExecutionIdentity(
  state,
  command,
  segments,
  direction
) {
  const stepOrdinal = segments.findIndex((segment) =>
    !['segment_completed', 'completed'].includes(
      segment.result_kind
    ));
  const segment = segments[stepOrdinal];
  const suffix = hash(command.canonical_digest).slice(0, 24);
  return {
    execution_id:
      `route-execution:${state.party_id}:${suffix}`,
    route_plan_id: `route-plan:${state.party_id}:${suffix}`,
    travel_state_id:
      `travel-state:${state.party_id}:${suffix}:${stepOrdinal}`,
    step_ordinal: stepOrdinal,
    next_interval_ordinal: segment.intervals.length,
    next_event_ordinal: 3,
    progress_ppm:
      segment.intervals.at(-1).actual_progress_after_ppm,
    cumulative_segment_elapsed:
      segment.actual_exact_elapsed,
    direction,
    route_binding_ref: structuredClone(command.route_binding_ref),
    segment: {
      step_kind: segment.step_kind,
      segment_ref: structuredClone(segment.segment_ref),
      base_minutes: segment.base_minutes,
      departure_ref: structuredClone(segment.departure_ref),
      arrival_ref: structuredClone(segment.arrival_ref),
      dynamic_recheck_policy_ref:
        structuredClone(segment.dynamic_recheck_policy_ref)
    },
    resume_destination:
      command.verb === 'journey_to_boundary'
        ? 'yp026_boundary_anchor'
        : (command.route_binding_ref.entity_id.includes(
            'yp025_to_yp026'
          ) ? 'yp026_south_entry_reach'
            : 'yp025_navigation_corridor')
  };
}
