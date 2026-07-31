const SCENARIO_ID = 'lower_dvina_trace_v1';

export function assertLowerDvinaTracePhase5Cutover(bundle, fail) {
  const manifest = bundle.phase_1a_manifest;
  const bindings = bundle.materialization_bindings;
  const definition = bundle.definition;
  if (manifest?.package_id !== 'lower_dvina_trace_phase_1a_v7'
    || manifest.revision !== 7
    || manifest.scenario_definition_revision !== 11
    || manifest.superseded_package_ref?.id !== 'lower_dvina_trace_phase_1a_v6'
    || manifest.superseded_package_ref.revision !== 6
    || bindings?.binding_set_id
      !== 'lower_dvina_trace_phase_1a_materialization_bindings_v7'
    || bindings.revision !== 7
    || bindings.scenario_definition_revision !== 11
    || definition?.scenario_id !== SCENARIO_ID
    || definition.revision !== 11
    || definition.supersedes_definition_ref?.revision !== 10) {
    fail('TRACE_PHASE_5_CUTOVER_IDENTITY_INVALID',
      'Phase 5 must exact-supersede the immutable revision 10 chain.');
  }
  assertLowerDvinaTracePhase5InitialBindings(bundle, fail);
}

export function assertLowerDvinaTracePhase5InitialBindings(
  bundle, fail, {
    waterProfileRef = 'trace_ld_v1_item_eremey_drinking_water_vessel'
  } = {}
) {
  const binding = bundle.materialization_bindings.phase_5_initial_state_binding
    ?.bandage_cloth_initial_binding;
  if (binding?.item_template_ref !== 'trace_ld_v1_item_bandage_cloth'
    || binding.participant_slot_ref !== 'eremey_fisher'
    || binding.owner_ref !== 'eremey_fisher'
    || binding.holder_ref !== 'eremey_fisher'
    || binding.controller_ref !== 'eremey_fisher'
    || binding.physical_position !== 'worn_quick'
    || binding.accessibility !== 'quick'
    || binding.condition_state !== 'clean_serviceable'
    || binding.inventory_profile_ref
      !== 'trace_ld_v1_inventory_profile_bandage_cloth'
    || binding.location_policy !== 'follow_direct_holder'
    || binding.static_placement_slot_ref !== null) {
    fail('TRACE_PHASE_5_BANDAGE_BINDING_INVALID',
      'The exact approved bandage materialization binding is required.');
  }
  assertPhase5ArrivalResources(
    bundle.materialization_bindings.phase_5_initial_state_binding
      ?.phase_5_resource_arrival_binding,
    fail,
    waterProfileRef
  );
}

function assertPhase5ArrivalResources(binding, fail, waterProfileRef) {
  const byTemplate = new Map((binding?.arrival_item_bindings ?? [])
    .map((entry) => [entry.item_template_ref, entry]));
  const net = byTemplate.get('trace_ld_v1_item_fishing_net');
  const poles = byTemplate.get('trace_ld_v1_item_carry_poles');
  const water = binding?.eremey_water_vessel_initial_binding;
  if (binding?.resource_carrier_ref
        !== 'trace_ld_v1_audience_slot_participating_fisher'
      || binding.resolved_carrier_ref !== 'resolved_participating_fisher'
      || binding.carrier_resolution_policy
        !== 'resolve_exactly_one_committed_slot_trace_or_fail_closed'
      || binding.rng_consumption !== 'forbidden'
      || binding.fallback_policy !== 'forbidden'
      || binding.arrival_location_ref
        !== 'trace_ld_v1_loc_old_drying_shed'
      || !exactCarrierItem(net, 'trace_ld_v1_item_fishing_net',
        'trace_ld_v1_inventory_profile_fishing_net_group_load',
        'eremey_fisher')
      || !exactCarrierItem(poles, 'trace_ld_v1_item_carry_poles',
        'trace_ld_v1_inventory_profile_carry_poles_group_load',
        'background_fisher_1')
      || water?.item_template_ref
        !== 'trace_ld_v1_item_eremey_drinking_water_vessel'
      || water.persistence_profile_ref
        !== waterProfileRef
      || water.owner_ref !== 'eremey_fisher'
      || water.holder_ref !== 'eremey_fisher'
      || water.controller_ref !== 'eremey_fisher'
      || water.physical_position !== 'worn_quick'
      || water.accessibility !== 'quick'
      || water.condition_state !== 'serviceable'
      || water.use_state !== 'one_patient_drink_available'
      || water.water_portions_remaining !== 1
      || water.location_policy !== 'follow_direct_holder') {
    fail('TRACE_PHASE_5_RESOURCE_ARRIVAL_BINDING_INVALID',
      'The exact committed participating-fisher resource binding is required.');
  }
}

function exactCarrierItem(binding, template, profile, owner) {
  return binding?.item_template_ref === template
    && binding.persistence_profile_ref === profile
    && binding.owner_ref === owner
    && binding.holder_ref === 'resolved_participating_fisher'
    && binding.controller_ref === 'resolved_participating_fisher'
    && binding.physical_position === 'external_load'
    && binding.accessibility === 'quick'
    && binding.condition_state === 'serviceable'
    && binding.use_state === 'carried_for_group_use'
    && binding.location_policy === 'follow_resolved_participating_fisher';
}
