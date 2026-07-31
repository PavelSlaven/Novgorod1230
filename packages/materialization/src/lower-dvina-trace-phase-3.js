import { deterministicInstanceId } from './core.js';
import { failLowerDvinaTraceMaterialization as fail } from './lower-dvina-trace-contract.js';

export function materializeLowerDvinaTracePreparedCamp({
  input,
  bundle,
  runId,
  participantSelections,
  locationSelections
}) {
  const binding = bundle.materialization_bindings.camp_spatial_binding;
  const camp = locationSelections.find(
    (value) => value.slot_key === binding.location_profile_ref
  );
  if (!camp) {
    fail('TRACE_PHASE_3_CAMP_LOCATION_MISSING', 'The approved camp location selection is missing.');
  }
  const nodeId = deterministicInstanceId(
    input.party_id,
    runId,
    'g5_node',
    binding.location_profile_ref,
    0
  );
  const anchorId = deterministicInstanceId(
    input.party_id,
    runId,
    'g5_anchor',
    binding.anchor_template.template_id,
    0
  );
  const scene = {
    location_profile_ref: binding.location_profile_ref,
    node: {
      instance_id: nodeId,
      parent_g4_id: camp.selected.g4_node_ref.id,
      template_id: binding.node_template_ref,
      slot_key: binding.node_slot_ref,
      state: {
        location_profile_ref: camp.location.location_profile_id,
        prepared_for_first_entry: true
      }
    },
    anchor: {
      instance_id: anchorId,
      node_id: nodeId,
      template_id: binding.anchor_template.template_id,
      slot_key: binding.anchor_template.slot_key,
      npc_capacity: binding.anchor_template.npc_capacity,
      item_capacity: binding.anchor_template.item_capacity,
      container_capacity: binding.anchor_template.container_capacity,
      state: structuredClone(binding.anchor_template.state)
    }
  };
  const npcs = bundle.materialization_bindings.initial_participant_placements
    .map((placement, ordinal) => materializeNpc({
      input,
      bundle,
      runId,
      participantSelections,
      placement,
      ordinal,
      anchorId
    }));
  if (new Set(npcs.map((value) => value.instance_id)).size !== npcs.length
    || npcs.length > scene.anchor.npc_capacity) {
    fail(
      'TRACE_PHASE_3_NPC_IDENTITY_INVALID',
      'Prepared camp NPC identities or capacity are invalid.'
    );
  }
  return { scene, npcs };
}

export function materializeLowerDvinaTracePreparedDryingShed({ input, bundle, runId, participantSelections, locationSelections }) {
  const binding = bundle.materialization_bindings.phase_4_initial_state_binding;
  const spatial = binding?.drying_shed_spatial_binding;
  const location = locationSelections.find(({ slot_key: key }) => key === spatial?.location_profile_ref);
  if (!location || !spatial || !Array.isArray(binding.initial_participant_placements)
    || spatial.entry_route_ref !== 'trace_ld_v1_route_camp_to_shed'
    || spatial.entry_endpoint_ref !== 'trace_ld_v1_ep_drying_shed_ridge_to_camp'
    || spatial.anchor_template?.slot_key !== 'shed_approach'
    || spatial.anchor_template?.state?.access_policy_ref !== 'trace_ld_v1_access_old_drying_shed'
    || spatial.anchor_template?.state?.capacity_contract_ref !== 'trace_ld_v1_capacity_old_drying_shed'
    || spatial.anchor_template?.state?.zone_ref !== 'shed_approach') {
    fail('TRACE_PHASE_4_BINDING_INVALID', 'Approved drying-shed binding is required.');
  }
  const nodeId = deterministicInstanceId(input.party_id, runId, 'g5_node', spatial.location_profile_ref, 0);
  const anchorId = deterministicInstanceId(input.party_id, runId, 'g5_anchor', spatial.anchor_template.template_id, 0);
  const scene = {
    location_profile_ref: spatial.location_profile_ref,
    entry_route_ref: spatial.entry_route_ref,
    entry_endpoint_ref: spatial.entry_endpoint_ref,
    node: { instance_id: nodeId, parent_g4_id: location.selected.g4_node_ref.id, template_id: spatial.node_template_ref, slot_key: spatial.node_slot_ref, state: { location_profile_ref: location.location.location_profile_id, prepared_for_first_entry: true } },
    anchor: { instance_id: anchorId, node_id: nodeId, template_id: spatial.anchor_template.template_id, slot_key: spatial.anchor_template.slot_key, npc_capacity: spatial.anchor_template.npc_capacity, item_capacity: spatial.anchor_template.item_capacity, container_capacity: spatial.anchor_template.container_capacity, state: structuredClone(spatial.anchor_template.state) }
  };
  const npcs = binding.initial_participant_placements.map((placement, ordinal) => materializeNpc({ input, bundle, runId, participantSelections, placement, ordinal, anchorId }));
  const bySlot = new Map(npcs.map((npc) => [npc.participant_slot_ref, npc]));
  const onisim = bySlot.get('onisim_boatman');
  const ratsha = bySlot.get('ratsha_storehouse_helper');
  if (!onisim || !ratsha) fail('TRACE_PHASE_4_NPC_BINDING_INVALID', 'Onisim and Ratsha must materialize exactly once.');
  const rope = binding.onisim_injury_rope_binding;
  if (rope?.condition_profile_ref !== 'trace_ld_v1_condition_onisim_injury'
    || rope.condition_state !== 'injured_unable_to_walk'
    || rope.rope_opening_state_contract_ref !== 'trace_ld_v1_opening_state_ratsha_binding_rope_onisim'
    || rope.item_template_ref !== 'trace_ld_v1_item_ratsha_binding_rope'
    || rope.owner_ref !== null
    || rope.holder_ref !== 'onisim_boatman'
    || rope.controller_ref !== 'ratsha_storehouse_helper'
    || rope.location_ref !== spatial.location_profile_ref
    || rope.use_state !== 'binding_onisim') {
    fail('TRACE_PHASE_4_ONISIM_BINDING_INVALID', 'The approved Onisim injury and rope state is required.');
  }
  onisim.machine_state.body_condition = {
    condition_profile_ref: rope.condition_profile_ref,
    state: rope.condition_state
  };
  const bindingItem = {
    item_template_ref: rope.item_template_ref,
    opening_state_contract_ref: rope.rope_opening_state_contract_ref,
    owner_ref: rope.owner_ref,
    holder_npc_id: onisim.instance_id,
    controller_npc_id: ratsha.instance_id,
    use_state: rope.use_state
  };
  if (input.scenario_definition_revision === 12) {
    const template = requiredById(
      bundle.item_container_set.item_templates,
      'item_template_id',
      rope.item_template_ref
    );
    const profile = requiredById(
      bundle.item_container_set.item_inventory_profiles,
      'inventory_profile_id',
      rope.inventory_profile_ref
    );
    if (template.inventory_profile_ref !== profile.inventory_profile_id
      && template.base_catalog_ref?.inventory_profile_id
        !== profile.inventory_profile_id) {
      fail('TRACE_PHASE_6_ROPE_PROFILE_INVALID',
        'The revision 12 binding rope must resolve its exact local inventory profile.');
    }
    if (profile.item_template_ref !== template.item_template_id
      || profile.mass_grams !== 1200
      || profile.carry_form !== 'long'
      || profile.external_hand_cost !== 1
      || profile.status !== 'approved') {
      fail('TRACE_PHASE_6_ROPE_PROFILE_INVALID',
        'The exact approved revision 12 binding-rope inventory profile is required.');
    }
    const itemId = deterministicInstanceId(
      input.party_id, runId, 'item', template.item_template_id, 0
    );
    Object.assign(bindingItem, {
      reserved_instance_id: itemId,
      run_id: runId,
      template_id: template.item_template_id,
      category_id: template.semantic_category,
      profile_id: profile.inventory_profile_id,
      legal_status: 'unowned',
      inventory_profile_snapshot: structuredClone(profile)
    });
  }
  onisim.machine_state.binding_item = bindingItem;
  ratsha.machine_state.surrender_state = 'not_surrendered';
  ratsha.machine_state.restraint_state = 'not_restrained';
  return { scene, npcs, onisim, ratsha, binding };
}

function materializeNpc({
  input,
  bundle,
  runId,
  participantSelections,
  placement,
  ordinal,
  anchorId
}) {
  const selection = participantSelections.find(
    (value) => value.slot_key === placement.participant_slot_ref
  );
  if (!selection || selection.materialization_rule !== placement.materialization_depth) {
    fail(
      'TRACE_PHASE_3_PARTICIPANT_SELECTION_MISSING',
      `The sealed participant ${placement.participant_slot_ref} is missing or incompatible.`
    );
  }
  const profile = requiredById(
    bundle.participant_profile_set.profiles,
    'profile_id',
    selection.selected_profile.profile_id
  );
  if (profile.revision !== selection.selected_profile.revision
    || profile.knowledge_scope_ref == null
    || !Object.hasOwn(profile, 'canonical_name')
    || typeof profile.social_role_id !== 'string'
    || typeof profile.occupation_id !== 'string'
    || typeof profile.scenario_function !== 'string'
    || typeof profile.causal_basis !== 'string') {
    fail(
      'TRACE_PHASE_3_PARTICIPANT_PROFILE_INVALID',
      `The participant profile for ${placement.participant_slot_ref} is not exact.`
    );
  }
  const knowledgeScope = requiredById(
    bundle.participant_profile_set.knowledge_scope_profiles,
    'profile_id',
    profile.knowledge_scope_ref
  );
  return {
    instance_id: deterministicInstanceId(
      input.party_id,
      runId,
      'npc',
      placement.instance_key,
      ordinal
    ),
    participant_slot_ref: placement.participant_slot_ref,
    profile_id: profile.profile_id,
    profile_revision: profile.revision,
    profile_level: placement.materialization_depth,
    anchor_id: anchorId,
    location_profile_ref: placement.location_profile_ref,
    zone_ref: placement.zone_ref,
    role_ref: {
      id: profile.social_role_id,
      source: 'approved_scenario_profile'
    },
    occupation_ref: {
      id: profile.occupation_id,
      source: 'approved_scenario_profile'
    },
    identity_state: {
      canonical_name: profile.canonical_name,
      ...(Object.hasOwn(profile, 'name_policy')
        ? { name_policy: profile.name_policy }
        : {})
    },
    machine_state: {
      status: 'active',
      materialization_depth: placement.materialization_depth
    },
    semantic_state: {
      scenario_function: profile.scenario_function,
      causal_basis: profile.causal_basis
    },
    knowledge_profile_snapshot: structuredClone(knowledgeScope),
    profile_candidate_set_digest: selection.candidate_set_digest,
    profile_record_digest: selection.record_digest
  };
}

function requiredById(values, key, id) {
  const matches = values.filter((value) => value?.[key] === id);
  if (matches.length !== 1) {
    fail('TRACE_SCENARIO_REFERENCE_INVALID', `Expected exactly one ${key}=${id}.`);
  }
  return matches[0];
}
