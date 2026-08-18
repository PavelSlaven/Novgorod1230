const KIND = 'ambient_ordinary_capability';

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
    visible_status: 'available'
  }))];
  return { ...projected, player_safe_state: {
    ...projected.player_safe_state,
    visible_context: { ...(visible ?? {}), visible_objects: visibleObjects }
  } };
}

function validCapability(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === 4
    && ['source_ref','portion_profile_ref','semantic_type','public_name']
      .every((key) => typeof value[key] === 'string'
        && value[key].length > 0 && value[key] === value[key].trim());
}
