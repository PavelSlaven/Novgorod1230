import {
  calculateHandsState,
  calculateInventoryMass,
  resolveInventoryLoad
} from '@rus/items-property';

export function buildCommittedInventoryInput(
  state,
  { additionalItems = [], itemPlacementChanges = [] } = {}
) {
  const placementByItemId = new Map(
    itemPlacementChanges.map((placement) => [placement.item_id, placement])
  );
  const items = [...(state.items ?? []), ...additionalItems];
  const itemProfiles = [];
  const profileTemplateIds = new Set();
  for (const item of items) {
    const profile = item.inventory_profile
      ?? item.state?.inventory_profile_snapshot;
    if (!profile || profileTemplateIds.has(item.template_id)) continue;
    profileTemplateIds.add(item.template_id);
    itemProfiles.push({ ...structuredClone(profile), template_id: item.template_id });
  }
  return {
    party_id: state.party_id,
    actor_id: state.actor_id,
    state_version: state.party_state.state_version,
    expected_state_version: state.party_state.state_version,
    current_g5_anchor_id: state.position.g5_anchor_id,
    strength: state.player_profile.attributes.strength.value,
    items: items.map((item) => ({
      item_id: item.item_id,
      template_id: item.template_id,
      quantity: item.quantity
    })),
    item_placements: items.map((item) => {
      const placement = placementByItemId.get(item.item_id)
        ?? item.placement;
      return { party_id: state.party_id, item_id: item.item_id,
        ...structuredClone(placement) };
    }),
    item_profiles: itemProfiles,
    containers: structuredClone(state.containers ?? []),
    container_placements: structuredClone(state.container_placements ?? []),
    container_profiles: structuredClone(state.container_profiles ?? [])
  };
}

export function getCommittedInventoryLoad(state, options) {
  const inventory = buildCommittedInventoryInput(state, options);
  const mass = calculateInventoryMass(inventory);
  const hands = calculateHandsState(inventory);
  const load = mass.pass
    ? resolveInventoryLoad({
      total_mass_grams: mass.total_mass_grams,
      strength: inventory.strength
    })
    : { pass: false, load_category: null, errors: mass.errors };
  return Object.freeze({ inventory, mass, hands, load });
}
