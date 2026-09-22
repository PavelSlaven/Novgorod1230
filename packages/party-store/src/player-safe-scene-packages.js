import { deepFreeze } from '@rus/kernel';

const ENVIRONMENT_LAYERS = new Set([
  'natural_layers', 'surface', 'relief', 'vegetation', 'environment', 'water',
  'place_function', 'work_zone'
]);
const FUNCTIONAL_LAYERS = new Set(['tool', 'storage', 'work_material']);

/** Pure player-safe projection of persisted procedural scene packages. */
export function projectPlayerSafeScenePackages(packages, items = []) {
  if (!Array.isArray(packages)) return Object.freeze([]);
  return deepFreeze(packages.map(({ scene_package_id: id, family,
    g5_node_id: g5, g6_instance_id: g6, position_id: position, profile,
    allocation_policy: allocation }) => ({
    scene_package_id: id, family, g5_node_id: g5, g6_instance_id: g6,
    position_id: position,
    environment_facets: (profile?.components ?? [])
      .filter((entry) => ENVIRONMENT_LAYERS.has(entry.layer))
      .map(playerSafeComponent),
    functional_groups: (profile?.components ?? [])
      .filter((entry) => FUNCTIONAL_LAYERS.has(entry.layer))
      .map(playerSafeComponent),
    allocation_status: allocationResolved(items, allocation)
      ? 'resolved' : allocation?.status ?? null
  })));
}

export function playerSafeComponent(component = {}) {
  const source = component.source_value && typeof component.source_value === 'object'
    ? component.source_value : {};
  const out = {
    layer: component.layer,
    required: component.required === true
  };
  const semantics = component.semantics ?? source.semantics;
  if (typeof semantics === 'string' && semantics) out.semantics = semantics;
  const variant = component.variant_id ?? source.variant_id;
  if (typeof variant === 'string' && variant) out.variant_id = variant;
  const refs = component.typed_semantic_refs ?? source.typed_semantic_refs;
  if (Array.isArray(refs) && refs.length > 0) {
    out.typed_semantic_refs = refs.filter((ref) => typeof ref === 'string' && ref);
  }
  const place = component.place_function_ref ?? source.place_function_ref;
  if (place && typeof place === 'object' && !Array.isArray(place)) {
    const safe = playerSafePlaceFunction(place);
    if (Object.keys(safe).length > 0) out.place_function = safe;
  }
  const candidates = component.candidates ?? source.candidates;
  if (Array.isArray(candidates) && candidates.length > 0) {
    out.visible_materials = candidates.map(playerSafeCandidate).filter(Boolean);
  }
  return out;
}

function playerSafePlaceFunction(place) {
  const out = {};
  for (const key of [
    'scene_template_id', 'g5_id', 'scene_slot_key', 'physical_class_id',
    'primary_scene_role_id'
  ]) {
    if (typeof place[key] === 'string' && place[key]) out[key] = place[key];
  }
  return out;
}

function playerSafeCandidate(candidate) {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    return null;
  }
  const out = {};
  for (const key of [
    'item_template_ref', 'inventory_profile_ref', 'object_category_ref',
    'min_quantity', 'max_quantity'
  ]) {
    if (candidate[key] != null) out[key] = candidate[key];
  }
  return Object.keys(out).length > 0 ? out : null;
}

function allocationResolved(_items, allocation) {
  return allocation?.status === 'materialized_stage16';
}
