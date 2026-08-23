import { assertSpatialSemanticRequirementsAdmitted, assertSpatialSemanticStructuralVariantAdmitted, validateSpatialSemanticResolution, validateSpatialSemanticCandidate } from
  '@rus/materialization/internal/lower-dvina-trace-s1';

const KEYS = ['schema', 'party_id', 'base_party_state_version', 'change_set_id',
  'causal_identity', 'envelope_ref', 'expected_envelope_state_version',
  'resolution', 'formal_spatial_context'];

export function createSpatialSemanticAtomicWritePlan(input) {
  const plan = clone(input);
  if (!exact(plan, KEYS)
      || plan.schema !== 'spatial_semantic_atomic_write_plan_v1'
      || !text(plan.party_id) || !text(plan.change_set_id) || !text(plan.envelope_ref)
      || !integer(plan.base_party_state_version, 0)
      || !integer(plan.expected_envelope_state_version, 1)
      || !identity(plan.causal_identity) || !candidate(plan.resolution)
      || !context(plan.formal_spatial_context)
      || plan.resolution.party_id !== plan.party_id
      || plan.resolution.request_id !== plan.causal_identity.request_id
      || plan.resolution.causal_request_ref !== plan.causal_identity.action_ref
      || plan.resolution.envelope_ref !== plan.envelope_ref
      || !sameFormalContext(plan.resolution.formal_spatial_refs, plan.formal_spatial_context)) fail();
  try { assertSpatialSemanticStructuralVariantAdmitted(plan.formal_spatial_context.structural_variant); assertSpatialSemanticRequirementsAdmitted({
    semantic_requirements: plan.resolution.outcome.semantic_requirements,
    structural_variant: plan.formal_spatial_context.structural_variant,
    available_mechanics: plan.formal_spatial_context.available_mechanics
  }); } catch { fail(); }
  plan.resolution.formal_spatial_refs = formalRefs(plan);
  if (!resolution(plan.resolution)) fail();
  return freeze(plan);
}

export function spatialSemanticPhysicalKeys(input) {
  if (input == null) return [];
  const plan = createSpatialSemanticAtomicWritePlan(input);
  return [
    `party_runtime.party_spatial_semantic_envelopes:${plan.party_id}:${plan.envelope_ref}`,
    `party_runtime.party_spatial_semantic_resolutions:${plan.party_id}:${plan.causal_identity.request_id}`,
    ...spatialWrites(plan).map((write) => `party_runtime.${write.target_table}:${write.id}`)
  ];
}

export function spatialSemanticRows(input) { return spatialWrites(createSpatialSemanticAtomicWritePlan(input)); }

function formalRefs(plan) {
  const variant = plan.formal_spatial_context.structural_variant;
  const base = `s1:${plan.party_id}:${plan.causal_identity.request_id}`;
  const structural = variant !== 'descriptive_local_reference';
  return { schema: 'rus.s1_formal_spatial_refs.v1', status: 'materialized',
    structural_variant: variant, local_ref: plan.resolution.local_ref,
    placement_ref: `${plan.formal_spatial_context.kind}:${plan.resolution.local_ref}`, g6_instance_ref: structural ? `${base}:g6` : null,
    position_ref: structural ? `${base}:position` : null,
    portal_ref: null,
    movement_edge_refs: structural ? [`${base}:edge:out`, `${base}:edge:back`] : [],
    visibility_link_refs: structural ? [`${base}:edge:out:visible`, `${base}:edge:back:visible`] : [] };
}
function spatialWrites(plan) {
  const refs = plan.resolution.formal_spatial_refs;
  const c = plan.formal_spatial_context; const base = { party_id: plan.party_id };
  const placement = (position_node_id) => ({ target_table: 'entity_placements', id: refs.placement_ref,
    record: { ...base, entity_kind: c.kind, entity_id: plan.resolution.local_ref, placement_kind: 'scene_position', position_node_id, host_entity_ref: null, occupies_capacity_units: 0, visibility_modifier_ref: null, interaction_profile_ref: null, state_version: 0, updated_change_set_id: plan.change_set_id } });
  if (refs.structural_variant === 'descriptive_local_reference') return [placement(plan.resolution.position_ref)];
  const writes = [
    { target_table: 'party_g6_instances', id: refs.g6_instance_ref, record: { ...base, id: refs.g6_instance_ref, scene_baseline_id: c.baseline_ref, source_scene_template_ref: { entity_id: refs.g6_instance_ref }, scene_slot_key: refs.g6_instance_ref, enclosing_stable_structure_id: null, host_kind: 'g5_site', host_id: c.g5_ref, physical_class_id: 'ordinary', primary_scene_role_id: 'ordinary_local', vertical_context_id: 'ground', overhead_cover_id: 'none', intra_g6_visibility_mode: 'default_clear', default_visibility_distance_band: 'near', acoustic_uniformity: 'uniform', status: 'active', state_version: 0, created_change_set_id: plan.change_set_id, updated_change_set_id: plan.change_set_id, terminal_change_set_id: null } },
    { target_table: 'scene_position_nodes', id: refs.position_ref, record: { ...base, id: refs.position_ref, g6_instance_id: refs.g6_instance_ref, position_type_id: 'ordinary_local', template_slot_key: refs.position_ref, template_instance_ordinal: 0, stable_basis_ref: null, capacity: 1, access_class_id: 'public', light_profile_ref: null, hazard_profile_ref: null, status: 'active', state_version: 0, created_change_set_id: plan.change_set_id, updated_change_set_id: plan.change_set_id, terminal_change_set_id: null } }
  ];
  for (const [id, from, to, reverse] of [[refs.movement_edge_refs[0], plan.resolution.position_ref, refs.position_ref, refs.movement_edge_refs[1]], [refs.movement_edge_refs[1], refs.position_ref, plan.resolution.position_ref, refs.movement_edge_refs[0]]]) writes.push({ target_table: 'scene_movement_edges', id, record: { ...base, id, scene_baseline_id: c.baseline_ref, source_scene_template_ref: { entity_id: id }, source_edge_slot_key: id, from_position_id: from, to_position_id: to, passage_type_id: 'passage.local', transition_environment_profile_ref: { entity_ref: { entity_kind: 'transition_environment_profile', entity_id: 'env.local_variable' }, authoring_version: '1' }, movement_orientation_profile_ref: { entity_ref: { entity_kind: 'movement_orientation_profile', entity_id: 'orientation.topological_local' }, authoring_version: '1' }, cost_kind: 'action', action_units: 1, baseline_movement_method_id: null, movement_method_cost_profile_ref: null, base_minutes: null, dynamic_recheck_policy_ref: null, capacity: 1, portal_entity_id: null, availability_condition_set_ref: null, reverse_edge_id: reverse, status: 'active', state_version: 0, created_change_set_id: plan.change_set_id, updated_change_set_id: plan.change_set_id, terminal_change_set_id: null } });
  for (const [id, from, to, reverse] of [[refs.visibility_link_refs[0], plan.resolution.position_ref, refs.position_ref, refs.visibility_link_refs[1]], [refs.visibility_link_refs[1], refs.position_ref, plan.resolution.position_ref, refs.visibility_link_refs[0]]]) writes.push({ target_table: 'visibility_links', id, record: { ...base, id, scene_baseline_id: c.baseline_ref, source_scene_template_ref: { entity_id: id }, source_link_slot_key: id, from_position_id: from, to_position_id: to, quality: 'clear', distance_band: 'near', portal_entity_id: null, condition_profile_ref: null, reverse_link_id: reverse, status: 'active', state_version: 0, created_change_set_id: plan.change_set_id, updated_change_set_id: plan.change_set_id, terminal_change_set_id: null } });
  return [...writes, placement(plan.resolution.position_ref)];
}

function resolution(value) { try { validateSpatialSemanticResolution(value); return true; } catch { return false; } }
function candidate(value) { try { validateSpatialSemanticCandidate(value); return true; } catch { return false; } }
function identity(value) { return exact(value, ['request_id','root_turn_id','action_ref','step_index','actor_ref']) && ['request_id','root_turn_id','action_ref','actor_ref'].every((key) => text(value[key])) && integer(value.step_index, 1) && value.step_index <= 8; }
function context(value) { return exact(value, ['baseline_ref','g5_ref','kind','structural_variant','available_mechanics'])
  && ['baseline_ref','g5_ref','kind','structural_variant'].every((key) => text(value[key]))
  && Array.isArray(value.available_mechanics) && new Set(value.available_mechanics).size === value.available_mechanics.length
  && value.available_mechanics.every((mechanic) => typeof mechanic === 'string'); }
function sameFormalContext(refs, context) { return refs?.structural_variant === context.structural_variant
  && (refs.schema === 'rus.s1_formal_spatial_refs.v1'
    || JSON.stringify(refs.available_mechanics) === JSON.stringify(context.available_mechanics)); }
function exact(value, keys) { return plain(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key)); }
function text(value) { return typeof value === 'string' && value.length > 0; }
function integer(value, min) { return Number.isSafeInteger(value) && value >= min; }
function plain(value) { return value != null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype; }
function freeze(value) { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
function clone(value) { try { return structuredClone(value); } catch { fail(); } }
function fail() { const error = new Error('SPATIAL_SEMANTIC_PLAN_INVALID'); error.code = 'SPATIAL_SEMANTIC_PLAN_INVALID'; throw error; }
