import { deterministicInstanceId } from './core.js';

export function buildLowerDvinaTracePhase5InitialBandage({
  input, bundle, runId, phase3Prepared, requiredById, fail
}) {
  if (![11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25].includes(
    input.scenario_definition_revision
  ) || !phase3Prepared) return null;
  const binding = bundle.materialization_bindings.phase_5_initial_state_binding
    ?.bandage_cloth_initial_binding;
  if (!binding) return null;
  const template = requiredById(
    bundle.item_container_set.item_templates, 'item_template_id', binding.item_template_ref
  );
  const profile = requiredById(
    bundle.item_container_set.item_inventory_profiles, 'inventory_profile_id', binding.inventory_profile_ref
  );
  const eremey = phase3Prepared?.npcs.find(({ participant_slot_ref: slot }) => slot === 'eremey_fisher');
  if (!eremey || template.source_resource_only !== true
    || template.property_state_template?.owner_ref !== 'eremey_fisher'
    || template.property_state_template.holder_ref !== 'eremey_fisher'
    || template.property_state_template.controller_ref !== 'eremey_fisher'
    || profile.item_template_ref !== template.item_template_id || profile.mass_grams !== 100
    || profile.carry_form !== 'compact' || profile.external_hand_cost !== 0) {
    fail('TRACE_PHASE_5_BANDAGE_PROFILE_INVALID',
      'The exact approved bandage item and inventory profile are required.');
  }
  return {
    instance_id: deterministicInstanceId(input.party_id, runId, 'item', template.item_template_id, 0),
    template_id: template.item_template_id,
    profile_id: profile.inventory_profile_id,
    category_id: template.semantic_category,
    quantity: 1,
    condition_state: binding.condition_state,
    legal_status: 'owned',
    claim_state: 'established',
    owner_npc_id: eremey.instance_id,
    holder_npc_id: eremey.instance_id,
    controller_npc_id: eremey.instance_id,
    physical_position: binding.physical_position,
    state: {
      causal_basis: template.causal_basis,
      accessibility: binding.accessibility,
      location_policy: binding.location_policy,
      inventory_profile_snapshot: structuredClone(profile)
    }
  };
}
