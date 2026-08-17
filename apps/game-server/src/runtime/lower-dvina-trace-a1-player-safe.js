export function projectLowerDvinaTraceA1Capability({
  playerSafeState, loadedProfile, resolverAvailable
}) {
  if (loadedProfile?.profile?.status !== 'approved'
      || resolverAvailable !== true) return playerSafeState;
  const eligible = new Set([
    ...loadedProfile.profile.source_profiles,
    ...loadedProfile.profile.tool_profiles
  ].map(({ template_id: id }) => id));
  const eligibleObjects = (playerSafeState.items ?? [])
    .filter((item) => eligible.has(item.template_id))
    .map((item) => ({
      entity_ref: { entity_kind: 'item', entity_id: item.item_id }
    }));
  if (eligibleObjects.length === 0) return playerSafeState;
  const visibleObjects = [];
  const visibleRefs = new Set();
  for (const object of [
    ...(playerSafeState.visible_objects ?? []), ...eligibleObjects
  ]) {
    const ref = object?.entity_ref;
    const key = typeof ref?.entity_kind === 'string'
        && typeof ref?.entity_id === 'string'
      ? `${ref.entity_kind}\u0000${ref.entity_id}` : null;
    if (key !== null && visibleRefs.has(key)) continue;
    if (key !== null) visibleRefs.add(key);
    visibleObjects.push(object);
  }
  return {
    ...playerSafeState,
    visible_objects: visibleObjects,
    action_production: { semantic_grounding_available: true }
  };
}
