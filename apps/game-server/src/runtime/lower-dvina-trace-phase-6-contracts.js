import { serverError } from '../errors.js';

export function resolveTracePhase6Contracts({ bundle }) {
  if (bundle.definition_revision !== 12 || bundle.definition?.revision !== 12) gap('TRACE_PHASE_6_REVISION_MISMATCH');
  const route = exact(bundle.movement_bindings?.route_bindings, 'route_id', 'trace_ld_v1_route_shed_to_camp_carry_onisim');
  const bodyEffects = route.body_effect_profile_refs.map((id) => exact(bundle.body_environment_profiles?.effect_profiles, 'effect_profile_id', id));
  if (route.duration_minutes !== 20 || route.carried_actor_rules?.single_root_clock !== true || route.carried_actor_rules?.carrier_rebinding?.decision_boundary?.elapsed_minutes !== 10 || route.carried_actor_rules.carrier_rebinding.decision_boundary.route_progress_ppm !== 500000 || bodyEffects.some((effect) => effect.rng_consumption !== 'forbidden')) gap('TRACE_PHASE_6_CHAIN_INVALID');
  const sourceEndpoint = exact(bundle.location_topology_set?.endpoints, 'endpoint_id', route.source_endpoint);
  const destinationEndpoint = exact(bundle.location_topology_set?.endpoints, 'endpoint_id', route.destination_endpoint);
  const capacity = (bundle.location_capacity_contracts?.capacity_contracts ?? []).find((value) => value.location_ref === route.terminal_position_outcome);
  const activity = exact(bundle.activity_check_consequence_profiles
    ?.activity_profiles, 'profile_id',
  'trace_ld_v1_activity_make_stretcher_and_carry');
  const accessPolicy = exact(bundle.location_access_policies?.access_policies,
    'policy_id', activity.preconditions?.access_policy_ref);
  const boundary = route.carried_actor_rules.carrier_rebinding.decision_boundary;
  const terminal = route.terminal_placement_contract;
  if (!capacity
      || activity.version !== 2
      || boundary.boundary_id
        !== 'trace_ld_v1_boundary_mikula_carry_load_limit_10m'
      || boundary.reason_code !== 'shoulder_load_limit_reached'
      || boundary.outgoing !== 'player_clerk'
      || boundary.incoming !== 'resolved_participating_fisher'
      || boundary.kind !== 'committed_synchronized_route_boundary'
      || boundary.shoulder?.condition_profile_ref
        !== 'trace_ld_v1_condition_shoulder_bruise'
      || boundary.shoulder?.from !== 'shoulder_bruise'
      || boundary.shoulder.to !== 'shoulder_bruise'
      || boundary.shoulder.outcome !== 'load_penalty'
      || boundary.rng_consumption !== 'forbidden'
      || terminal?.group?.zone_ref !== 'working_camp'
      || terminal.carried_actor?.zone_ref !== 'fire_rest_area'
      || terminal.carried_actor.independent_movement_history !== 'forbidden'
      || terminal.ratsha_observation?.committed_fact_output
        !== 'ratsha_under_group_observation_committed') {
    gap('TRACE_PHASE_6_CAPACITY_GAP');
  }
  return Object.freeze({
    route: structuredClone(route),
    bodyEffects: structuredClone(bodyEffects),
    bodyEffectBindings: structuredClone(route.body_effect_bindings),
    sourceEndpoint: structuredClone(sourceEndpoint),
    destinationEndpoint: structuredClone(destinationEndpoint),
    capacity: structuredClone(capacity),
    accessPolicy: structuredClone(accessPolicy),
    terminalPlacement: structuredClone(terminal),
    shed_location_ref: 'trace_ld_v1_loc_old_drying_shed',
    activity: structuredClone(activity)
  });
}
function exact(records, key, id) { const values = (records ?? []).filter((value) => value[key] === id); if (values.length !== 1) gap('TRACE_PHASE_6_RECORD_GAP'); return values[0]; }
function gap(code) { throw serverError(code, 'The exact Phase 6 carry chain is incomplete.', { status: 409 }); }
