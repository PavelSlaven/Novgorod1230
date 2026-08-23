import { failure, freeze, text } from './spatial-v3-validation.js';

/** S1 formal topology stays code-owned; P16 only persists these row templates. */
export function materializeS1FormalSpatialProposal({ party_id, request_id, local_ref, kind,
  structural_variant, baseline_ref, g5_ref, position_ref, topology = null }) {
  if (!text(party_id) || !text(request_id) || !text(local_ref)
      || !['ordinary_structure', 'local_natural_feature'].includes(kind)
      || !['open_one_space', 'descriptive_local_reference'].includes(structural_variant)
      || !text(baseline_ref) || !text(g5_ref) || !text(position_ref)) {
    return failure('s1_formal_spatial_data_gap', null, { stage: 's1_formal_spatial_refs' });
  }
  const structural = structural_variant === 'open_one_space';
  if (structural && !s1Topology(topology, baseline_ref, g5_ref, position_ref)) {
    return failure('s1_formal_spatial_data_gap', null, { stage: 's1_first_entry_topology' });
  }
  const refs = {
    schema: 'rus.s1_formal_spatial_refs.v1', status: 'materialized', structural_variant,
    local_ref, placement_ref: `${kind}:${local_ref}`,
    g6_instance_ref: structural ? topology.g6_instance_ref : null,
    position_ref: structural ? topology.interior_position_ref : null, portal_ref: null,
    movement_edge_refs: structural ? topology.movement_edge_refs : [],
    visibility_link_refs: structural ? topology.visibility_link_refs : [] };
  const placement = (position_node_id) => ({ target_table: 'entity_placements', id: refs.placement_ref,
    record: { entity_kind: kind, entity_id: local_ref, placement_kind: 'scene_position',
      position_node_id, host_entity_ref: null, occupies_capacity_units: 0,
      visibility_modifier_ref: null, interaction_profile_ref: null, state_version: 0 } });
  if (!structural) return freeze({ ok: true, proposal: {
    schema: 'rus.s1_formal_spatial_proposal.v1', refs, rows: [placement(position_ref)] } });
  return freeze({ ok: true, proposal: { schema: 'rus.s1_formal_spatial_proposal.v1', refs,
    rows: [placement(structural ? topology.interior_position_ref : position_ref)] } });
}

/** First-entry-only physical topology. Late S1 may only bind these immutable refs. */
export function materializeS1OpenOneSpaceTopology({ party_id, baseline_ref, g5_ref,
  position_ref, scene_template_ref, slot }) {
  if (![party_id, baseline_ref, g5_ref, position_ref, scene_template_ref].every(text)
      || !s1Slot(slot, scene_template_ref)) {
    return failure('s1_formal_spatial_data_gap', null, { stage: 's1_first_entry_topology' });
  }
  const base = `s1:${party_id}:${baseline_ref}:${slot.g6.slot_key}`;
  const topology = { g6_instance_ref: `${base}:g6`, position_ref: `${base}:position`,
    movement_edge_refs: [`${base}:edge:out`, `${base}:edge:back`],
    visibility_link_refs: [`${base}:edge:out:visible`, `${base}:edge:back:visible`] };
  const rows = [
    { target_table: 'party_g6_instances', id: topology.g6_instance_ref,
      record: { id: topology.g6_instance_ref, scene_baseline_id: baseline_ref,
        source_scene_template_ref: versionedSceneTemplate(scene_template_ref), scene_slot_key: slot.g6.slot_key,
        enclosing_stable_structure_id: null, host_kind: 'g5_site', host_id: g5_ref,
        physical_class_id: slot.g6.physical_class_id,
        primary_scene_role_id: slot.g6.primary_scene_role_id,
        vertical_context_id: slot.g6.vertical_context_id,
        overhead_cover_id: slot.g6.overhead_cover_id,
        intra_g6_visibility_mode: slot.g6.intra_g6_visibility_mode,
        default_visibility_distance_band: slot.g6.default_visibility_distance_band,
        acoustic_uniformity: slot.g6.acoustic_uniformity, status: 'active', state_version: 0 } },
    { target_table: 'scene_position_nodes', id: topology.position_ref,
      record: { id: topology.position_ref, g6_instance_id: topology.g6_instance_ref,
        position_type_id: slot.position.position_type_id, template_slot_key: slot.position.slot_key,
        template_instance_ordinal: 0, stable_basis_ref: null, capacity: slot.position.capacity,
        access_class_id: slot.position.access_class_id, light_profile_ref: null, hazard_profile_ref: null,
        status: 'active', state_version: 0 } }
  ];
  for (const [id, from, to, reverse] of [[topology.movement_edge_refs[0], position_ref,
    topology.position_ref, topology.movement_edge_refs[1]], [topology.movement_edge_refs[1], topology.position_ref,
    position_ref, topology.movement_edge_refs[0]]]) rows.push({ target_table: 'scene_movement_edges', id,
    record: { id, scene_baseline_id: baseline_ref, source_scene_template_ref: versionedSceneTemplate(scene_template_ref),
      source_edge_slot_key: slot.movement[id === topology.movement_edge_refs[0] ? 'out_slot_key' : 'back_slot_key'], from_position_id: from, to_position_id: to,
      passage_type_id: slot.movement.passage_type_id, transition_environment_profile_ref: slot.movement.transition_environment_profile_ref,
      movement_orientation_profile_ref: slot.movement.movement_orientation_profile_ref, cost_kind: 'action',
      action_units: 1, baseline_movement_method_id: null, movement_method_cost_profile_ref: null,
      base_minutes: null, dynamic_recheck_policy_ref: null, capacity: 1, portal_entity_id: null,
      availability_condition_set_ref: null, reverse_edge_id: reverse, status: 'active', state_version: 0 } });
  for (const [id, from, to, reverse] of [[topology.visibility_link_refs[0], position_ref,
    topology.position_ref, topology.visibility_link_refs[1]], [topology.visibility_link_refs[1], topology.position_ref,
    position_ref, topology.visibility_link_refs[0]]]) rows.push({ target_table: 'visibility_links', id,
    record: { id, scene_baseline_id: baseline_ref, source_scene_template_ref: versionedSceneTemplate(scene_template_ref),
      source_link_slot_key: slot.visibility[id === topology.visibility_link_refs[0] ? 'out_slot_key' : 'back_slot_key'], from_position_id: from, to_position_id: to, quality: slot.visibility.quality,
      distance_band: slot.visibility.distance_band, portal_entity_id: null, condition_profile_ref: null,
      reverse_link_id: reverse, status: 'active', state_version: 0 } });
  return freeze({ ok: true, topology: freeze(topology), rows: freeze(rows) });
}

export function materializeS1FirstEntryPreparation({ party_id, binding, scene, npcs }) {
  const s1 = materializeS1OpenOneSpaceTopology({
    party_id,
    baseline_ref: `baseline:${scene?.node?.instance_id}`,
    g5_ref: `g5:${scene?.node?.instance_id}`,
    position_ref: `position:${scene?.anchor?.instance_id}`,
    scene_template_ref: binding?.destination?.g6?.scene_template_ref,
    slot: binding?.destination?.g6?.s1_topology_slot
  });
  if (!s1.ok) return s1;
  return freeze({ ok: true, preparation: freeze({
    binding: structuredClone(binding), scene: structuredClone(scene),
    npcs: structuredClone(npcs), s1_topology: structuredClone(s1.topology),
    s1_physical_writes: structuredClone(s1.rows)
  }) });
}

function s1Slot(value, sceneTemplateRef) {
  const source = value?.source_scene_template_ref;
  return value && typeof value === 'object' && versionedRef(source, 'scene_template', sceneTemplateRef)
    && text(value.g6?.slot_key) && ['spatial.g6.enclosed', 'spatial.g6.semi_enclosed', 'spatial.g6.open', 'spatial.g6.water'].includes(value.g6.physical_class_id)
    && ['surface', 'elevated', 'subsurface'].includes(value.g6.vertical_context_id)
    && ['none', 'partial', 'full'].includes(value.g6.overhead_cover_id)
    && value.g6.intra_g6_visibility_mode === 'default_clear' && ['near', 'short', 'medium'].includes(value.g6.default_visibility_distance_band)
    && value.g6.acoustic_uniformity === 'uniform' && text(value.g6.primary_scene_role_id)
    && text(value.position?.slot_key) && value.position.position_type_id === 'scene_position.central' && Number.isSafeInteger(value.position.capacity) && value.position.capacity > 0 && text(value.position.access_class_id)
    && ['out_slot_key', 'back_slot_key', 'passage_type_id'].every((key) => text(value.movement?.[key]))
    && ['out_slot_key', 'back_slot_key', 'quality', 'distance_band'].every((key) => text(value.visibility?.[key]))
    && value.visibility.quality === 'clear'
    && versionedRef(value.movement.transition_environment_profile_ref,
      'transition_environment_profile', 'topological_default')
    && versionedRef(value.movement.movement_orientation_profile_ref,
      'movement_orientation_profile', 'topological_default');
}

function versionedRef(value, kind, id) {
  return value && Object.keys(value).sort().join('\u0000') === 'authoring_version\u0000entity_ref'
    && value.authoring_version === '1' && value.entity_ref
    && Object.keys(value.entity_ref).sort().join('\u0000') === 'entity_id\u0000entity_kind'
    && value.entity_ref.entity_kind === kind && value.entity_ref.entity_id === id;
}

function versionedSceneTemplate(entityId) {
  return { entity_ref: { entity_kind: 'scene_template', entity_id: entityId }, authoring_version: '1' };
}

function s1Topology(value, baseline_ref, g5_ref, position_ref) {
  return value && typeof value === 'object' && value.baseline_ref === baseline_ref
    && value.g5_ref === g5_ref && value.position_ref === position_ref
    && text(value.g6_instance_ref) && text(value.interior_position_ref)
    && Array.isArray(value.movement_edge_refs) && value.movement_edge_refs.length === 2
    && Array.isArray(value.visibility_link_refs) && value.visibility_link_refs.length === 2
    && [...value.movement_edge_refs, ...value.visibility_link_refs].every(text);
}
