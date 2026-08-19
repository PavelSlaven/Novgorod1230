const WEAPON_CLASSES = Object.freeze([
  'improvised_puncture_light', 'improvised_impact_light',
  'improvised_cutting_light', 'improvised_two_hand_heavy'
]);

export function projectLowerDvinaTraceA1Capability({
  playerSafeState, loadedProfile, resolverAvailable
}) {
  const profile = loadedProfile?.profile;
  if (profile?.status !== 'approved' || resolverAvailable !== true
      || !(playerSafeState.visible_objects ?? []).some(({ entity_ref: ref }) =>
        ref?.entity_kind === 'item' && text(ref.entity_id))) {
    return playerSafeState;
  }
  return {
    ...playerSafeState,
    action_production: {
      semantic_grounding_available: true,
      max_new_entities: profile.max_new_entities,
      allowed_identity_modes: structuredClone(profile.allowed_identity_modes),
      allowed_origins: structuredClone(profile.allowed_origins),
      allowed_result_classes: structuredClone(profile.allowed_result_classes),
      allowed_output_classes: structuredClone(profile.allowed_output_classes),
      weapon_qualitative_classes: [...WEAPON_CLASSES]
    }
  };
}

function text(value) {
  return typeof value === 'string' && value.length > 0
    && value.trim() === value;
}
