export function buildTracePhase4CombatMovementBindings({ route, reverseRoute,
  escapeExecution, executionVersion, sourceEndpoint, destinationEndpoint,
  access, capacity,
  campLocationRef, campAnchorId, ratshaActorId }) {
  if (escapeExecution?.execution_binding_id
        !== 'trace_ld_v1_decision_execution_ratsha_continue_escape'
      || escapeExecution.execution_kind
        !== 'post_player_boundary_route_attempt'
      || escapeExecution.movement_refs?.length !== 1
      || escapeExecution.movement_refs[0] !== reverseRoute.route_id
      || escapeExecution.time_contract?.roots?.length !== 1
      || escapeExecution.time_contract.roots[0]?.root_ref
        !== reverseRoute.route_id
      || !Number.isSafeInteger(executionVersion) || executionVersion <= 0) {
    throw Object.assign(new Error('TRACE_PHASE_4_ESCAPE_EXECUTION_GAP'), {
      code: 'TRACE_PHASE_4_ESCAPE_EXECUTION_GAP' });
  }
  return { route_bindings: [structuredClone(route),
    structuredClone(reverseRoute)], local_transition_bindings: [],
  local_access_bindings: [], route_execution_bindings: [{
    movement_ref: reverseRoute.route_id, route: structuredClone(reverseRoute),
    execution_profile: {
      entity_kind: 'npc_decision_execution_binding',
      entity_id: escapeExecution.execution_binding_id,
      version: executionVersion
    },
    source_endpoint: structuredClone(destinationEndpoint),
    destination_endpoint: structuredClone(sourceEndpoint),
    destination_location_ref: campLocationRef,
    destination_anchor_id: campAnchorId,
    access_policy: structuredClone(access),
    capacity_contract: structuredClone(capacity) }],
  actor_destination_bindings: [{ actor_ref: {
    entity_kind: 'npc', entity_id: ratshaActorId },
  intent_kind: 'break_contact', destination_ref: {
    entity_kind: 'location_anchor', entity_id: campAnchorId },
  movement_ref: reverseRoute.route_id }] };
}

export function buildTraceInteriorEntryBinding({ access, capacity, binding,
  sourceZoneRef, localTransition, durationMinutes, fail }) {
  const rules = capacity.admission_model?.zone_assignment?.rules ?? [];
  const matches = rules.filter(({ when }) =>
    when?.predicate === 'access_policy_admitted'
    && when.policy_ref === access.policy_id
    && when.entry_class === 'interior_entry');
  const ratsha = binding?.participant_roles?.ratsha_storehouse_helper;
  if (matches.length !== 1
      || capacity.decision_anchor !== 'yard'
      || !localTransition.source_zone_candidates?.includes(sourceZoneRef)
      || !matches[0].allowed_zone_refs?.includes('storehouse_interior')
      || !capacity.admission_model.allowed_participant_slots
        ?.includes('ratsha_storehouse_helper')
      || !ratsha?.execution_profiles?.some(({ profile_id: id,
        intent_kind: kind, status }) =>
        id === 'trace_ld_v1_combat_ratsha_reach_bag'
        && kind === 'reach' && status === 'approved')
      || !Number.isSafeInteger(durationMinutes) || durationMinutes <= 0) {
    return fail('TRACE_PHASE_8_INTERIOR_ENTRY_GAP');
  }
  return { schema: 'rus.trace_local_access_transition.v1',
    transition_id:
      'trace_ld_v1_access_zhdanko_storehouse:interior_entry',
    location_ref: access.location_ref,
    source_zone_candidates: [sourceZoneRef],
    destination_zone_candidates: [...matches[0].allowed_zone_refs],
    admitted_actor_slot_refs: ['ratsha_storehouse_helper'],
    access_policy_ref: access.policy_id,
    capacity_contract_ref: capacity.contract_id,
    duration_minutes: durationMinutes,
    terminal_outcome: 'same_materialized_location_new_zone' };
}
