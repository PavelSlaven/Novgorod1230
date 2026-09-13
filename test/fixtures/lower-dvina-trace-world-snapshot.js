import { lowerDvinaTraceCanonicalG5SceneBindings } from './lower-dvina-trace-v5-world-fixture.js';

export function lowerDvinaTraceWorldSnapshot() {
  const header = { id: 'trace_ld_v1_tpl_fishing_camp', version: 1 };
  const g6 = (scene_slot_key, physical_class_id, primary_scene_role_id, overhead_cover_id) => ({ scene_slot_key, physical_class_id, primary_scene_role_id, vertical_context_id: 'surface', overhead_cover_id, intra_g6_visibility_mode: 'default_clear', default_visibility_distance_band: 'near', acoustic_uniformity: 'uniform' });
  const edge = (edge_slot_key, from_position_slot_key, to_position_slot_key, reverse_edge_slot_key) => ({ edge_slot_key, from_position_slot_key, to_position_slot_key, reverse_edge_slot_key, passage_type_id: 'passage.local', transition_environment_profile_id: 'env.local_variable', transition_environment_profile_version: 3, movement_orientation_profile_id: 'orientation.topological_local', movement_orientation_profile_version: 2, cost_kind: 'action', action_units: 1, baseline_movement_method_id: null, movement_method_cost_profile_id: null, movement_method_cost_profile_version: null, base_minutes: null, dynamic_recheck_policy_id: null, dynamic_recheck_policy_version: null, capacity: 1, portal_template_id: null, portal_template_version: null, availability_condition_set_id: null, availability_condition_set_version: null });
  const link = (link_slot_key, from_position_slot_key, to_position_slot_key, reverse_link_slot_key) => ({ link_slot_key, from_position_slot_key, to_position_slot_key, reverse_link_slot_key, quality: 'clear', distance_band: 'near', portal_template_id: null, portal_template_version: null, condition_profile_id: null, condition_profile_version: null });
  const fishingCamp = { header, g6_slots: [g6('working_camp', 'spatial.g6.open', 'working_camp', 'none'), g6('s1_open_one_space', 'spatial.g6.semi_enclosed', 'ordinary_local', 'partial')], position_slots: [{ position_slot_key: 'working_camp', g6_scene_slot_key: 'working_camp', position_type_id: 'scene_position.fixed_working_reach', capacity: 7, access_class_id: 'trace_ld_v1_access_fishing_camp' }, { position_slot_key: 's1_open_one_space.interior', g6_scene_slot_key: 's1_open_one_space', position_type_id: 'scene_position.central', capacity: 1, access_class_id: 'default' }], movement_edges: [edge('s1_open_one_space.out', 'working_camp', 's1_open_one_space.interior', 's1_open_one_space.back'), edge('s1_open_one_space.back', 's1_open_one_space.interior', 'working_camp', 's1_open_one_space.out')], visibility_links: [link('s1_open_one_space.visible_out', 'working_camp', 's1_open_one_space.interior', 's1_open_one_space.visible_back'), link('s1_open_one_space.visible_back', 's1_open_one_space.interior', 'working_camp', 's1_open_one_space.visible_out')] };
  const wreckShore = structuredClone(fishingCamp);
  wreckShore.header = { id: 'trace_ld_v1_tpl_wreck_shore', version: 1 };
  wreckShore.g6_slots = [g6('open_shore', 'spatial.g6.open', 'open_shore', 'none')];
  wreckShore.position_slots = [{ position_slot_key: 'open_shore', g6_scene_slot_key: 'open_shore', position_type_id: 'scene_position.water_reach', capacity: 7, access_class_id: 'trace_ld_v1_access_wreck_shore' }];
  wreckShore.movement_edges = [];
  wreckShore.visibility_links = [];
  const dryingShed = structuredClone(fishingCamp);
  dryingShed.header = { id: 'trace_ld_v1_tpl_old_drying_shed', version: 1 };
  dryingShed.g6_slots = [g6('shed_approach', 'spatial.g6.semi_enclosed', 'shed_approach', 'partial'),
    g6('s1_enclosed_space', 'spatial.g6.enclosed', 'ordinary_local', 'full')];
  dryingShed.position_slots = [{ position_slot_key: 'shed_approach',
    g6_scene_slot_key: 'shed_approach', position_type_id: 'scene_position.approach',
    capacity: 7, access_class_id: 'trace_ld_v1_access_old_drying_shed' },
  { position_slot_key: 's1_enclosed_space.interior',
    g6_scene_slot_key: 's1_enclosed_space', position_type_id: 'scene_position.central',
    capacity: 5, access_class_id: 'trace_ld_v1_access_old_drying_shed' }];
  dryingShed.movement_edges = [edge('s1_enclosed_space.out', 'shed_approach',
    's1_enclosed_space.interior', 's1_enclosed_space.back'), edge(
    's1_enclosed_space.back', 's1_enclosed_space.interior', 'shed_approach',
    's1_enclosed_space.out')];
  dryingShed.visibility_links = [link('s1_enclosed_space.visible_out',
    'shed_approach', 's1_enclosed_space.interior', 's1_enclosed_space.visible_back'),
  link('s1_enclosed_space.visible_back', 's1_enclosed_space.interior',
    'shed_approach', 's1_enclosed_space.visible_out')];
  return { scene_template_closures: [fishingCamp, wreckShore, dryingShed],
    canonical_g5_scene_bindings: lowerDvinaTraceCanonicalG5SceneBindings };
}
