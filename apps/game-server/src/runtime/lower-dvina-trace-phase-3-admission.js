export function tracePhase3PreconditionSatisfied(
  precondition,
  state,
  contracts
) {
  if (precondition.kind === 'committed_location') {
    return state.position?.location_ref === precondition.location_ref;
  }
  if (precondition.kind === 'committed_evidence_access') {
    return hasAccessibleBlueWool(state, contracts);
  }
  if (precondition.kind === 'materialized_present_npc') {
    const actor = contracts.actors.find(({ ref }) => ref === precondition.ref);
    return actor?.instance_id
      && actor.anchor_id === state.position?.g5_anchor_id;
  }
  if (precondition.kind === 'approved_access_policy') {
    return contracts.access.policy_id === precondition.policy_ref
      && contracts.access.location_ref === state.position?.location_ref
      && contracts.access.hidden_or_open_state === 'open'
      && contracts.access.unmaterialized_access === 'forbidden';
  }
  if (precondition.kind === 'npc_policy_state') {
    return resolveEremeyPolicyState(state) === precondition.state;
  }
  if (precondition.kind === 'approved_route_body_source_state') {
    const required = contracts.routeBodyEffect?.condition_outcomes;
    const current = new Set(
      (state.body_state?.active_conditions ?? []).map(({ id }) => id)
    );
    return Array.isArray(required)
      && required.every(({ from }) => current.has(from));
  }
  return false;
}

export function resolveEremeyPolicyState(state) {
  const disclosed = (state.interactions ?? []).some((interaction) =>
    interaction.consequence_ref
      === 'trace_ld_v1_consequence_eremey_cooperation_enabled'
    && interaction.statement_ref
      === 'trace_ld_v1_statement_eremey_disclosure'
    && interaction.decision_trace?.option_id === 'bounded_disclosure');
  return disclosed ? 'cooperation_enabled' : 'guarded';
}

function hasAccessibleBlueWool(state, contracts) {
  const evidenceRef = contracts.ids.evidence;
  const transition = contracts.blueWoolPickup;
  return state.items?.some((item) =>
    item.template_id === transition.item_template_ref
    && item.state?.evidence_ref === evidenceRef
    && item.placement?.holder_character_id === state.actor_id
    && item.placement?.physical_position === 'hands'
    && item.state?.property_state?.holder_ref === state.actor_id
    && item.state?.property_state?.controller_ref === state.actor_id
    && item.state?.pickup_transition?.transition_template_ref
      === transition.transition_template_id
    && item.state?.pickup_transition?.source_placement_ref
      === transition.source_placement_ref
    && (state.knowledge ?? []).some((knowledge) =>
      knowledge.fact_id === evidenceRef
      && knowledge.evidence_refs?.includes(evidenceRef)));
}
