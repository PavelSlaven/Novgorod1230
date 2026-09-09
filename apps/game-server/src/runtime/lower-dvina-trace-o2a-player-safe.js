const KIND = 'ambient_ordinary_capability';
const SOURCE_KIND = 'ordinary_resource_source';
const LEGACY_DISCOVERY_KIND = 'ordinary_discovery_capability';

export function projectLowerDvinaTraceO2aCapabilities({ projected,
  admission } = {}) {
  const capabilities = Array.isArray(admission?.capabilities)
    ? admission.capabilities.filter(validCapability) : [];
  const visible = projected?.player_safe_state?.visible_context;
  const existing = Array.isArray(visible?.visible_objects)
    ? visible.visible_objects.filter((entry) =>
      entry?.entity_ref?.entity_kind !== KIND) : [];
  if (capabilities.length === 0 && existing.length
      === (visible?.visible_objects?.length ?? 0)) return projected;
  const visibleObjects = [...existing, ...capabilities.map((capability) => ({
    entity_ref: { entity_kind: KIND,
      entity_id: capability.portion_profile_ref },
    display_label: capability.public_name,
    recognition: 'code_owned_source_capability',
    visible_status: 'available',
    ambient_portion_bounds: structuredClone(capability.ambient_portion_bounds)
  }))];
  return { ...projected, player_safe_state: {
    ...projected.player_safe_state,
    visible_context: { ...(visible ?? {}), visible_objects: visibleObjects }
  } };
}

export function projectLowerDvinaTraceO2aDiscoverySources({ projected,
  sources } = {}) {
  const entries = Array.isArray(sources)
    ? sources.filter((value) => value != null
      && typeof value.source_ref === 'string'
      && typeof value.public_name === 'string'
      && value.disclosure_state === 'visible') : [];
  const visible = projected?.player_safe_state?.visible_context;
  const existing = Array.isArray(visible?.visible_objects)
    ? visible.visible_objects.filter((entry) =>
      ![SOURCE_KIND, LEGACY_DISCOVERY_KIND].includes(
        entry?.entity_ref?.entity_kind)) : [];
  if (entries.length === 0 && existing.length
      === (visible?.visible_objects?.length ?? 0)) return projected;
  return { ...projected, player_safe_state: { ...projected.player_safe_state,
    visible_context: { ...(visible ?? {}), visible_objects: [
      ...existing, ...entries.map((entry) => ({ entity_ref: {
        entity_kind: SOURCE_KIND, entity_id: entry.source_ref },
      display_label: entry.public_name,
      recognition: 'code_owned_committed_source', visible_status: 'known' }))
    ] } } };
}

function validCapability(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === 5
    && ['source_ref','portion_profile_ref','semantic_type','public_name']
      .every((key) => text(value[key]))
    && validBounds(value.ambient_portion_bounds);
}

function validBounds(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === 5
    && typeof value.quantity_unit === 'string' && value.quantity_unit.trim()
    && Number.isFinite(value.min_quantity) && value.min_quantity > 0
    && Number.isFinite(value.max_quantity) && value.max_quantity >= value.min_quantity
    && Number.isSafeInteger(value.min_mass_grams) && value.min_mass_grams > 0
    && Number.isSafeInteger(value.max_mass_grams)
    && value.max_mass_grams >= value.min_mass_grams;
}

function text(value) { return typeof value === 'string' && value.trim() === value && value.length > 0; }
