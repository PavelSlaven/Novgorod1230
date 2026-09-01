import { deterministicInstanceId } from './core.js';
import { failLowerDvinaTraceMaterialization as fail } from './lower-dvina-trace-contract.js';
import { materializeS1FirstEntryPreparation } from './spatial-v3-s1-first-entry.js';

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
  if (input.scenario_definition_revision < 24
      || input.scenario_definition_revision >= 26) return { scene, npcs };
  const firstEntry = materializeS1FirstEntryPreparation({
    party_id: input.party_id,
    binding: bundle.materialization_bindings.first_entry_preparation,
    start_binding: bundle.materialization_bindings.start_spatial_binding,
    source_g4_id: locationSelections.find(({ slot_key: key }) =>
      key === bundle.materialization_bindings.start_spatial_binding
        .location_profile_ref)?.selected?.g4_node_ref?.id,
    scene,
    npcs,
    world_base_reference_snapshot: input.world_base_reference_snapshot
  });
  if (!firstEntry.ok) {
    fail('TRACE_FIRST_ENTRY_S1_TOPOLOGY_INVALID',
      'Approved first-entry S1 topology is incomplete.');
  }
  return { scene, npcs, first_entry_preparation: firstEntry.preparation };
}

export function materializeLowerDvinaTraceFirstEntryPreparationMembers({ input,
  bundle, camp, shed, locationSelections }) {
  if (input.scenario_definition_revision < 26) return null;
  const members = bundle.materialization_bindings.first_entry_preparation?.members;
  if (!Array.isArray(members) || members.length !== 2
      || members.some(({ ordinal }, index) => ordinal !== index)) {
    fail('TRACE_FIRST_ENTRY_MEMBER_BINDING_INVALID',
      'Revision 26 requires exactly camp and drying-shed first-entry members.');
  }
  const scenes = [camp, shed];
  const preparations = members.map((member, ordinal) => {
    const prepared = scenes[ordinal];
    const source = member.source_binding
      ?? bundle.materialization_bindings.start_spatial_binding;
    const sourceG4 = ordinal === 0
      ? locationSelections.find(({ slot_key: key }) => key === source.location_profile_ref)
        ?.selected?.g4_node_ref?.id
      : camp.scene.node.parent_g4_id;
    const materialized = materializeS1FirstEntryPreparation({
      party_id: input.party_id,
      binding: member.binding,
      start_binding: source,
      source_g4_id: sourceG4,
      scene: prepared.scene,
      npcs: prepared.npcs,
      world_base_reference_snapshot: input.world_base_reference_snapshot
    });
    if (!materialized.ok) fail('TRACE_FIRST_ENTRY_S1_TOPOLOGY_INVALID',
      'Approved first-entry S1 topology is incomplete.');
    return { ordinal, ...materialized.preparation };
  });
  return { ...preparations[0], members: preparations };
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
  if ([12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26].includes(input.scenario_definition_revision)) {
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

export function materializeLowerDvinaTracePreparedStorehouse({
  input,
  bundle,
  runId,
  participantSelections,
  locationSelections
}) {
  const binding = bundle.materialization_bindings.initial_autonomous_materialization;
  const spatial = binding?.storehouse_spatial_binding;
  const placement = binding?.npc_placement;
  const bag = binding?.container_placement;
  const weapon = binding?.weapon_placement ?? null;
  const weaponRequired = [16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26]
    .includes(input.scenario_definition_revision);
  const location = locationSelections.find(
    ({ slot_key: key }) => key === spatial?.location_profile_ref
  );
  if (!location || binding?.resolution_policy
      !== 'existing_approved_candidate_sets_only_or_fail_closed'
    || binding?.contents_policy !== 'approved_existing_container_contents_only'
    || !spatial || !placement || !bag
    || spatial.location_profile_ref !== 'trace_ld_v1_loc_zhdanko_storehouse'
    || spatial.node_template_ref !== 'trace_ld_v1_tpl_zhdanko_storehouse'
    || spatial.anchor_template?.slot_key !== 'storehouse_yard'
    || spatial.anchor_template?.state?.access_policy_ref
      !== 'trace_ld_v1_access_zhdanko_storehouse'
    || spatial.anchor_template?.state?.capacity_contract_ref
      !== 'trace_ld_v1_capacity_zhdanko_storehouse'
    || placement.participant_slot_ref !== 'zhdanko_storehouse_controller'
    || placement.materialization_depth !== 'key'
    || placement.location_profile_ref !== spatial.location_profile_ref
    || placement.zone_ref !== spatial.anchor_template.state.zone_ref
    || bag.container_template_ref !== 'trace_ld_v1_container_road_bag'
    || bag.owner_ref !== 'trace_ld_v1_external_owner_savva_tverdich'
    || bag.holder_ref !== placement.participant_slot_ref
    || bag.controller_ref !== placement.participant_slot_ref
    || bag.closure_state !== 'tied'
    || (weaponRequired && (weapon?.item_template_ref
        !== 'trace_ld_v1_item_zhdanko_axe'
      || weapon.owner_ref !== placement.participant_slot_ref
      || weapon.holder_ref !== placement.participant_slot_ref
      || weapon.controller_ref !== placement.participant_slot_ref
      || weapon.physical_position !== 'hands'
      || weapon.accessibility !== 'immediate'
      || weapon.location_ref !== spatial.location_profile_ref
      || weapon.zone_ref !== spatial.anchor_template.state.zone_ref))
    || JSON.stringify(bag.exact_content_item_refs)
      !== JSON.stringify([
        'trace_ld_v1_item_sealed_packet',
        'trace_ld_v1_item_wet_cloak',
        'trace_ld_v1_item_writing_tablet'
      ])) {
    fail('TRACE_M3_INITIAL_PROJECTION_BINDING_INVALID',
      'The exact approved Zhdanko storehouse and road-bag binding is required.');
  }
  const containerTemplate = requiredById(
    bundle.item_container_set.container_templates,
    'container_template_id',
    bag.container_template_ref
  );
  if (containerTemplate.status !== 'approved'
    || containerTemplate.semantic_category !== 'road_bag_container'
    || containerTemplate.capacity_contract?.unlisted_content_policy !== 'forbidden'
    || JSON.stringify(containerTemplate.capacity_contract?.exact_allowed_item_template_ids)
      !== JSON.stringify(bag.exact_content_item_refs)) {
    fail('TRACE_M3_ROAD_BAG_TEMPLATE_INVALID',
      'The road bag must resolve to its approved exact content set.');
  }
  const nodeId = deterministicInstanceId(
    input.party_id, runId, 'g5_node', spatial.location_profile_ref, 0
  );
  const anchorId = deterministicInstanceId(
    input.party_id, runId, 'g5_anchor', spatial.anchor_template.template_id, 0
  );
  const scene = {
    location_profile_ref: spatial.location_profile_ref,
    node: {
      instance_id: nodeId,
      parent_g4_id: location.selected.g4_node_ref.id,
      template_id: spatial.node_template_ref,
      slot_key: spatial.node_slot_ref,
      state: {
        location_profile_ref: location.location.location_profile_id,
        prepared_for_first_entry: true
      }
    },
    anchor: {
      instance_id: anchorId,
      node_id: nodeId,
      template_id: spatial.anchor_template.template_id,
      slot_key: spatial.anchor_template.slot_key,
      npc_capacity: spatial.anchor_template.npc_capacity,
      item_capacity: spatial.anchor_template.item_capacity,
      container_capacity: spatial.anchor_template.container_capacity,
      state: structuredClone(spatial.anchor_template.state)
    }
  };
  const npc = materializeNpc({
    input,
    bundle,
    runId,
    participantSelections,
    placement,
    ordinal: 0,
    anchorId
  });
  const roadBagResource = requiredById(
    bundle.npc_decision_schedule_policies.schedule_resource_bindings,
    'resource_binding_id',
    'trace_ld_v1_schedule_resource_road_bag'
  );
  if (roadBagResource.item_ref !== bag.container_template_ref
      || roadBagResource.holder_ref !== bag.holder_ref
      || roadBagResource.controller_ref !== bag.controller_ref
      || roadBagResource.opening_location_ref
        !== spatial.location_profile_ref
      || !roadBagResource.allowed_zone_refs.includes(
        roadBagResource.opening_zone_ref
      )) {
    fail('TRACE_M3_ROAD_BAG_OPENING_STATE_INVALID',
      'The road bag requires one approved opening location and zone.');
  }
  npc.machine_state = {
    ...npc.machine_state,
    location_ref: placement.location_profile_ref,
    spatial_zone_ref: placement.zone_ref
  };
  const container = {
    instance_id: deterministicInstanceId(
      input.party_id, runId, 'container', containerTemplate.container_template_id, 0
    ),
    template_id: containerTemplate.container_template_id,
    anchor_id: null,
    holder_npc_id: npc.instance_id,
    ...(input.scenario_definition_revision >= 19
      ? {
          physical_position: 'worn_quick',
          claim_state: containerTemplate.accessibility_contract.initial_access
        }
      : {}),
    owner_external_ref: bag.owner_ref,
    controller_npc_id: npc.instance_id,
    closure_state: bag.closure_state,
    state: {
      causal_basis: containerTemplate.causal_basis,
      physical_condition: structuredClone(containerTemplate.physical_condition),
      owner_external_ref: bag.owner_ref,
      controller_npc_id: npc.instance_id,
      location_ref: roadBagResource.opening_location_ref,
      zone_ref: roadBagResource.opening_zone_ref,
      exact_content_item_refs: structuredClone(bag.exact_content_item_refs),
      content_materialization: 'deferred_until_exact_inventory_profiles_are_approved'
    }
  };
  const weaponItem = weapon == null ? null : materializeStorehouseWeapon({
    input, bundle, runId, weapon, npc });
  const packet = [17, 18, 19, 20, 21, 22, 23, 24, 25, 26].includes(input.scenario_definition_revision)
    ? materializeHiddenPacket({ input, bundle, runId, container, npc,
      roadBagResource })
    : null;
  if (packet) {
    const profile = bundle.materialization_bindings
      .initial_autonomous_materialization.packet_placement
      .parent_container_inventory_profile;
    container.state.inventory_profile_snapshot = {
      ...structuredClone(profile),
      capacity: containerTemplate.capacity_contract.capacity
    };
  }
  return { scene, npc, container, weapon: weaponItem, packet };
}

function materializeHiddenPacket({ input, bundle, runId, container, npc,
  roadBagResource }) {
  const packet = bundle.materialization_bindings
    .initial_autonomous_materialization?.packet_placement;
  const template = requiredById(bundle.item_container_set.item_templates,
    'item_template_id', packet?.item_template_ref);
  if (packet?.parent_container_ref !== 'trace_ld_v1_container_road_bag'
    || packet.owner_ref !== 'trace_ld_v1_external_owner_savva_tverdich'
    || packet.holder_ref_rule !== 'inherit_parent_holder'
    || packet.controller_ref_rule !== 'inherit_parent_controller'
    || packet.seal_state !== 'intact'
    || packet.document_contents_state !== 'sealed'
    || packet.document_contents_access !== 'forbidden'
    || packet.location_ref_rule !== 'inherit_parent_location'
    || packet.zone_ref_rule !== 'inherit_parent_zone'
    || packet.inventory_profile?.item_template_id !== packet.item_template_ref
    || packet.inventory_profile?.mass_grams !== 100
    || packet.inventory_profile?.carry_form !== 'compact'
    || packet.inventory_profile?.external_hand_cost !== 0
    || packet.inventory_profile?.status !== 'approved'
    || packet.parent_container_inventory_profile?.container_template_id
      !== packet.parent_container_ref
    || packet.parent_container_inventory_profile?.mass_grams !== 300
    || packet.parent_container_inventory_profile?.inventory_role
      !== 'primary_container'
    || template.status !== 'approved') {
    fail('TRACE_PHASE9_HIDDEN_PACKET_BINDING_INVALID',
      'Revision 17 requires the exact sealed packet placement overlay.');
  }
  return {
    instance_id: deterministicInstanceId(input.party_id, runId, 'item',
      template.item_template_id, 0),
    template_id: template.item_template_id,
    profile_id: packet.inventory_profile.id,
    category_id: template.semantic_category,
    quantity: 1,
    condition_state: 'sealed_intact',
    legal_status: template.property_state_template.legal_status,
    claim_state: 'entrusted',
    owner_external_ref: packet.owner_ref,
    controller_npc_id: npc.instance_id,
    container_id: container.instance_id,
    state: {
      physical_parent_container_id: container.instance_id,
      inherited_holder_npc_id: npc.instance_id,
      location_ref: roadBagResource.opening_location_ref,
      zone_ref: roadBagResource.opening_zone_ref,
      seal_state: packet.seal_state,
      document_contents_state: packet.document_contents_state,
      document_contents_access: packet.document_contents_access,
      inventory_profile_snapshot: structuredClone(packet.inventory_profile),
      property_state_template: structuredClone(template.property_state_template)
    }
  };
}

function materializeStorehouseWeapon({ input, bundle, runId, weapon, npc }) {
  const template = requiredById(bundle.item_container_set.item_templates,
    'item_template_id', weapon.item_template_ref);
  const profile = requiredById(bundle.item_inventory_profiles, 'id',
    template.base_catalog_ref.inventory_profile_id);
  if (template.status !== 'approved'
      || template.weapon_contract?.owner_ref !== weapon.owner_ref
      || profile.item_template_id !== template.base_catalog_ref.template_id) {
    fail('TRACE_M4_STOREHOUSE_WEAPON_INVALID',
      'The storehouse weapon requires one approved item and inventory profile.');
  }
  return { instance_id: deterministicInstanceId(input.party_id, runId,
    'item', template.item_template_id, 0),
  template_id: template.item_template_id, profile_id: profile.id,
  category_id: template.semantic_category, quantity: 1,
  condition_state: 'serviceable', legal_status: 'owned',
  claim_state: 'established', owner_npc_id: npc.instance_id,
  holder_npc_id: npc.instance_id, controller_npc_id: npc.instance_id,
  physical_position: weapon.physical_position,
  state: { causal_basis: template.causal_basis,
    accessibility: weapon.accessibility,
    location_ref: weapon.location_ref, zone_ref: weapon.zone_ref,
    weapon_contract: structuredClone(template.weapon_contract),
    inventory_profile_snapshot: structuredClone(profile) } };
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
