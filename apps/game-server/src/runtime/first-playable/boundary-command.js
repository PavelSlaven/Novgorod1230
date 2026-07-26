import { serverError } from '../../errors.js';
import {
  resolveBoundaryActivation,
  resolveBoundarySegmentExecution
} from './boundary-policy-execution.js';
import {
  pausedExecutionIdentity
} from './boundary-paused-execution.js';
import {
  boundaryAnchor,
  boundarySegment,
  canonicalG5,
  journeyBinding,
  journeySegment
} from './boundary-route-steps.js';

export function resolveBoundaryApproachJourney(state, command) {
  const forward = state.location === 'landing_edge';
  const reverse = state.location === 'yp025_navigation_corridor';
  if (!state.boundary_crossing_enabled || (!forward && !reverse)) {
    throw serverError(
      'BOUNDARY_APPROACH_NOT_APPLICABLE',
      'The approved approach journey is not available here.',
      { status: 409 }
    );
  }
  if (!state.boat?.boarded) {
    throw serverError(
      'BOUNDARY_TRANSPORT_REQUIRED',
      'The approved small rowing boat must carry the player.',
      { status: 409 }
    );
  }
  const expectedJourney = reverse
    ? 'journey.lower_dvina_yp025_to_reverse_boundary_v1'
    : 'journey.lower_dvina_start_to_south_boundary_v1';
  if (command.route_binding_ref?.entity_id !== expectedJourney) {
    throw serverError(
      'BOUNDARY_APPROACH_PIN_MISMATCH',
      'The exact approved internal route chain is required.',
      { status: 409 }
    );
  }
  const rawSegments = reverse
    ? [
        boundarySegment(
          'wrsegv3__lower_dvina_yp025_to_yp026__00',
          20,
          canonicalG5(
            'cg5v3__gn_nov_g4_xp017_yp025_navigation_corridor',
            1
          ),
          boundaryAnchor()
        )
      ]
    : [
    journeyBinding(
      'cg5bindv3__g4dirv3r__g4route_gn_nov_g3_xp017_yp026_r2_sheltered_landing_terrace_1',
      canonicalG5(
        'cg5v3__gn_nov_g4_xp017_yp026_r2_sheltered_landing_terrace_landing_edge',
        3
      ),
      canonicalG5(
        'cg5v3__gn_nov_g4_xp017_yp026_r2_sheltered_landing_terrace_water_approach',
        3
      )
    ),
    journeySegment(
      'wrv3__g4dirv3r__g3route_gn_nov_g2_xp017_yp026_r2_dry_ridge_belt_1',
      'wrsegv3__g4dirv3r__g3route_gn_nov_g2_xp017_yp026_r2_dry_ridge_belt_1__00',
      60,
      'cg5v3__gn_nov_g4_xp017_yp026_r2_sheltered_landing_terrace_water_approach',
      'cg5v3__gn_nov_g4_xp017_yp026_r2_floodplain_ridge_route_south_approach'
    ),
    journeySegment(
      'wrv3__g4dirv3r__cross_g4_11',
      'wrsegv3__g4dirv3r__cross_g4_11__00',
      120,
      'cg5v3__gn_nov_g4_xp017_yp026_r2_floodplain_ridge_route_south_approach',
      'cg5v3__gn_nov_g4_xp017_yp026_r2_flooded_interior_basin_bog_edge'
    ),
    journeySegment(
      'wrv3__g4dirv3f__cross_g4_10',
      'wrsegv3__g4dirv3f__cross_g4_10__00',
      90,
      'cg5v3__gn_nov_g4_xp017_yp026_r2_flooded_interior_basin_bog_edge',
      'cg5v3__gn_nov_g4_xp017_yp026_r2_reed_backwater_entrance'
    ),
    journeySegment(
      'wrv3__g4dirv3r__cross_g4_22',
      'wrsegv3__g4dirv3r__cross_g4_22__00',
      45,
      'cg5v3__gn_nov_g4_xp017_yp026_r2_reed_backwater_entrance',
      'cg5v3__gn_nov_g4_xp017_yp026_r2_west_hidden_backwater_hidden_outlet'
    ),
    journeyBinding(
      'cg5bindv3__g4dirv3f__g4route_gn_nov_g3_xp017_yp026_r2_west_hidden_backwater_cycle',
      canonicalG5(
        'cg5v3__gn_nov_g4_xp017_yp026_r2_west_hidden_backwater_hidden_outlet',
        3
      ),
      canonicalG5(
        'cg5v3__gn_nov_g4_xp017_yp026_r2_west_hidden_backwater_entrance',
        3
      )
    ),
    journeySegment(
      'wrv3__g4dirv3r__g3route_gn_nov_g2_xp017_yp026_r2_west_distributary_belt_1',
      'wrsegv3__g4dirv3r__g3route_gn_nov_g2_xp017_yp026_r2_west_distributary_belt_1__00',
      60,
      'cg5v3__gn_nov_g4_xp017_yp026_r2_west_hidden_backwater_entrance',
      'cg5v3__gn_nov_g4_xp017_yp026_r2_west_side_channel_entrance'
    ),
    journeySegment(
      'wrv3__g4dirv3r__cross_g4_04',
      'wrsegv3__g4dirv3r__cross_g4_04__00',
      60,
      'cg5v3__gn_nov_g4_xp017_yp026_r2_west_side_channel_entrance',
      'cg5v3__gn_nov_g4_xp017_yp026_r2_sheltered_inner_reach_downstream_approach'
    ),
    journeyBinding(
      'cg5bindv3__g4dirv3f__g4route_gn_nov_g3_xp017_yp026_r2_sheltered_inner_reach_cycle',
      canonicalG5(
        'cg5v3__gn_nov_g4_xp017_yp026_r2_sheltered_inner_reach_downstream_approach',
        3
      ),
      canonicalG5(
        'cg5v3__gn_nov_g4_xp017_yp026_r2_sheltered_inner_reach_upstream_approach',
        3
      )
    ),
    journeySegment(
      'wrv3__g4dirv3r__g3route_gn_nov_g2_xp017_yp026_r2_south_main_channel_1',
      'wrsegv3__g4dirv3r__g3route_gn_nov_g2_xp017_yp026_r2_south_main_channel_1__00',
      60,
      'cg5v3__gn_nov_g4_xp017_yp026_r2_sheltered_inner_reach_upstream_approach',
      'cg5v3__gn_nov_g4_xp017_yp026_r2_south_entry_reach_upstream_approach'
    ),
    boundarySegment(
      'wrsegv3__lower_dvina_yp026_to_yp025__00',
      10,
      canonicalG5(
        'cg5v3__gn_nov_g4_xp017_yp026_r2_south_entry_reach_upstream_approach',
        3
      ),
      boundaryAnchor()
    )
  ];
  const activation = resolveBoundaryActivation({ state, command });
  const segments = rawSegments.map((segment) =>
    isLowerDvinaBoundarySegment(segment)
      ? resolveBoundarySegmentExecution({
          segment,
          state,
          command,
          activation
        })
      : segment);
  const success = segments.every((segment) =>
    segment.result_kind === 'segment_completed'
      || segment.result_kind === 'completed');
  return {
    success,
    direction: reverse ? 'reverse' : 'forward',
    route_binding_ref: structuredClone(command.route_binding_ref),
    destination: success
      ? 'yp026_boundary_anchor'
      : 'boundary_in_transit',
    elapsed_minutes: segments.reduce(
      (total, segment) => total + segment.actual_exact_elapsed,
      0
    ),
    check: null,
    segments,
    paused_execution: success
      ? null
      : pausedExecutionIdentity(
          state,
          command,
          segments,
          reverse ? 'reverse' : 'forward'
        )
  };
}

export function resolveBoundaryTraversal(state, command) {
  if (!state.boundary_crossing_enabled) {
    throw serverError(
      'BOUNDARY_CAPABILITY_BLOCKED',
      'The exact boundary capability is not enabled by the release pin.',
      { status: 409 }
    );
  }
  if (!state.boat?.boarded) {
    throw serverError(
      'BOUNDARY_TRANSPORT_REQUIRED',
      'The approved small rowing boat must carry the player.',
      { status: 409 }
    );
  }
  const forward = state.boundary_dispatch_direction === 'forward';
  const reverse = state.boundary_dispatch_direction === 'reverse';
  if (state.location !== 'yp026_boundary_anchor'
      || (!forward && !reverse)) {
    throw serverError(
      'BOUNDARY_ROUTE_NOT_APPLICABLE',
      'The selected boundary route does not start here.',
      { status: 409 }
    );
  }
  const expectedRoute = forward
    ? 'wrv3__lower_dvina_yp026_to_yp025'
    : 'wrv3__lower_dvina_yp025_to_yp026';
  if (command.route_binding_ref?.entity_id !== expectedRoute
      || command.route_binding_ref?.version !== 1) {
    throw serverError(
      'BOUNDARY_ROUTE_PIN_MISMATCH',
      'The exact approved directed route is required.',
      { status: 409 }
    );
  }
  const activation = resolveBoundaryActivation({ state, command });
  const rawSegment = forward
    ? boundarySegment(
        'wrsegv3__lower_dvina_yp026_to_yp025__01',
        30,
        boundaryAnchor(),
        canonicalG5(
          'cg5v3__gn_nov_g4_xp017_yp025_navigation_corridor',
          1
        )
      )
    : boundarySegment(
        'wrsegv3__lower_dvina_yp025_to_yp026__01',
        10,
        boundaryAnchor(),
        canonicalG5(
          'cg5v3__gn_nov_g4_xp017_yp026_r2_south_entry_reach_upstream_approach',
          3
        )
      );
  const segment = resolveBoundarySegmentExecution({
    segment: rawSegment,
    state,
    command,
    activation
  });
  const segments = [segment];
  return {
    success: segment.completed,
    direction: forward ? 'forward' : 'reverse',
    route_binding_ref: structuredClone(command.route_binding_ref),
    destination: segment.completed
      ? (forward
          ? 'yp025_navigation_corridor'
          : 'yp026_south_entry_reach')
      : 'boundary_in_transit',
    elapsed_minutes: segments.reduce(
      (total, segment) => total + segment.actual_exact_elapsed,
      0
    ),
    check: activation.check,
    consequence: segment.consequence,
    segments,
    paused_execution: segment.completed
      ? null
      : pausedExecutionIdentity(
          state,
          command,
          segments,
          forward ? 'forward' : 'reverse'
        )
  };
}

function isLowerDvinaBoundarySegment(segment) {
  return segment.segment_ref?.entity_id
    ?.startsWith('wrsegv3__lower_dvina_');
}
