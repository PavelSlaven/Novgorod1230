import { deepFreeze } from '@rus/kernel';

const ENVIRONMENT_LAYERS = new Set([
  'natural_layers', 'surface', 'relief', 'vegetation', 'environment', 'water',
  'place_function', 'work_zone'
]);
const FUNCTIONAL_LAYERS = new Set(['tool', 'storage', 'work_material']);

/** Pure player-safe projection of persisted procedural scene packages.
 *  Only concrete factual values/refs reach narration/presentation. Profile
 *  candidates and abstract-only natural refs are not factual first-screen
 *  content; readiness gaps stay typed, never false success. */
export function projectPlayerSafeScenePackages(packages, items = []) {
  if (!Array.isArray(packages)) return Object.freeze([]);
  return deepFreeze(packages.map((entry) => {
    const {
      scene_package_id: id, family, g5_node_id: g5, g6_instance_id: g6,
      position_id: position, profile, allocation_policy: allocation
    } = entry;
    const resolved = allocationResolved(allocation);
    const readiness = playerSafeReadiness(profile?.readiness);
    return {
      scene_package_id: id, family, g5_node_id: g5, g6_instance_id: g6,
      position_id: position,
      environment_facets: (profile?.components ?? [])
        .filter((component) => ENVIRONMENT_LAYERS.has(component.layer))
        .map((component) => playerSafeComponent(component, {
          readiness, resolved: false, items: []
        }))
        .filter(Boolean),
      functional_groups: (profile?.components ?? [])
        .filter((component) => FUNCTIONAL_LAYERS.has(component.layer))
        .map((component) => playerSafeComponent(component, {
          readiness, resolved, items, allocation
        }))
        .filter(Boolean),
      allocation_status: resolved ? 'resolved' : allocation?.status ?? null,
      readiness
    };
  }));
}

export function playerSafeComponent(component = {}, context = {}) {
  const source = component.source_value && typeof component.source_value === 'object'
    ? component.source_value : {};
  const layer = component.layer;
  const out = {
    layer,
    required: component.required === true
  };
  const layerReadiness = context.readiness?.functional_layers
    ?.find((entry) => entry.layer === layer);
  const abstractOnly = layer === 'natural_layers'
    && (layerReadiness?.factual_basis === 'abstract_generic_only'
      || layerReadiness?.source_gap_code === 'NATURAL_BASELINE_FACTUAL_DATA_GAP'
      || onlyAbstractNaturalRefs(component.typed_semantic_refs
        ?? source.typed_semantic_refs));

  if (abstractOnly) {
    out.factual_status = 'NATURAL_BASELINE_FACTUAL_DATA_GAP';
  } else {
    const semantics = component.semantics ?? source.semantics;
    if (typeof semantics === 'string' && semantics) out.semantics = semantics;
    const variant = component.variant_id ?? source.variant_id;
    if (typeof variant === 'string' && variant) out.variant_id = variant;
    const refs = (component.typed_semantic_refs ?? source.typed_semantic_refs);
    if (Array.isArray(refs) && refs.length > 0) {
      const concrete = refs.filter((ref) => typeof ref === 'string' && ref
        && !isAbstractNaturalRef(ref));
      if (concrete.length > 0) out.typed_semantic_refs = concrete;
    }
  }

  const place = component.place_function_ref ?? source.place_function_ref;
  if (place && typeof place === 'object' && !Array.isArray(place)) {
    const safe = playerSafePlaceFunction(place);
    if (Object.keys(safe).length > 0) out.place_function = safe;
  }

  // Profile candidates are not committed instances. Project materials only from
  // persisted inventory when Stage 16 allocation is resolved for this layer.
  if (FUNCTIONAL_LAYERS.has(layer)) {
    if (context.resolved === true) {
      const materials = visibleMaterialsFromPersisted(context.items,
        context.allocation, layer);
      if (materials.length > 0) out.visible_materials = materials;
      else if (component.required === true
          || (component.candidates ?? source.candidates)?.length > 0) {
        out.factual_status = 'PROCEDURAL_VISIBLE_MATERIALS_DATA_GAP';
      }
    } else if ((component.candidates ?? source.candidates)?.length > 0
        || component.required === true) {
      out.factual_status = 'PROCEDURAL_VISIBLE_MATERIALS_DATA_GAP';
    }
    const semantics = component.semantics ?? source.semantics;
    if (typeof semantics === 'string' && semantics && out.semantics == null) {
      out.semantics = semantics;
    }
  }

  return out;
}

function playerSafeReadiness(readiness) {
  if (!readiness || typeof readiness !== 'object') {
    return {
      required_layers_satisfied: false,
      unresolved_current_gaps: Object.freeze([])
    };
  }
  return {
    required_layers_satisfied: readiness.required_layers_satisfied === true,
    unresolved_current_gaps: Object.freeze(
      [...(readiness.unresolved_current_gaps ?? [])]),
    functional_layers: Object.freeze((readiness.functional_layers ?? [])
      .map(({ layer, status, factual_basis, source_gap_code }) => ({
        layer, status,
        ...(factual_basis == null ? {} : { factual_basis }),
        ...(source_gap_code == null ? {} : { source_gap_code })
      })))
  };
}

function visibleMaterialsFromPersisted(items, allocation, layer) {
  if (!Array.isArray(items) || items.length === 0) return [];
  const lines = allocation?.allocations
    ?? allocation?.policy?.allocations
    ?? [];
  const out = [];
  for (const line of lines) {
    if (line?.layer !== layer) continue;
    const id = line?.item_instance_id ?? line?.container_instance_id;
    if (!id) continue;
    const item = items.find((entry) =>
      (entry.instance_id ?? entry.item_instance_id
        ?? entry.container_instance_id) === id);
    if (!item) continue;
    const material = {
      item_instance_id: id,
      item_template_ref: item.template_id ?? item.item_template_id
        ?? item.container_template_id ?? line.item_template_ref
        ?? line.container_template_ref,
      quantity: item.quantity
    };
    const profile = item.inventory_profile_ref ?? item.profile_id
      ?? line.inventory_profile_ref;
    if (profile != null) material.inventory_profile_ref = profile;
    const category = item.object_category_ref ?? line.object_category_ref;
    if (category != null) material.object_category_ref = category;
    out.push(material);
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

function onlyAbstractNaturalRefs(refs) {
  if (!Array.isArray(refs) || refs.length === 0) return false;
  const strings = refs.filter((ref) => typeof ref === 'string' && ref);
  return strings.length > 0 && strings.every(isAbstractNaturalRef);
}

function isAbstractNaturalRef(ref) {
  return ref.startsWith('generic_')
    || ref === 'water_adjacency'
    || ref === 'generic_substrate'
    || ref === 'generic_riparian_ecology';
}

function allocationResolved(allocation) {
  return allocation?.status === 'materialized_stage16';
}
