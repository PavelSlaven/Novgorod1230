import {
  calculateContainerUsage,
  calculateHandsState,
  calculateInventoryMass,
  projectRuntimeInventoryInstance,
  resolveInventoryMechanicsProfile,
  resolveInventoryLoad,
  runtimeItemIsTerminal,
  validateInventoryTopology
} from '@rus/items-property';

export function buildCommittedInventoryInput(
  state,
  { additionalItems = [], itemPlacementChanges = [],
    actorId = state.actor_id, actorStrength =
      state.player_profile.attributes.strength.value,
    normalizeNpcHolder = false } = {}
) {
  const placementByItemId = new Map(
    itemPlacementChanges.map((placement) => [placement.item_id, placement])
  );
  const items = [...(state.items ?? []), ...additionalItems]
    .filter((item) => !runtimeItemIsTerminal(item));
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
    actor_id: actorId,
    state_version: state.party_state.state_version,
    expected_state_version: state.party_state.state_version,
    current_g5_anchor_id: state.position.g5_anchor_id,
    strength: actorStrength,
    items: items.map(projectRuntimeInventoryInstance),
    item_placements: items.map((item) => {
      const placement = placementByItemId.get(item.item_id)
        ?? item.placement;
      return { party_id: state.party_id, item_id: item.item_id,
        ...actorPlacement(placement, actorId, normalizeNpcHolder) };
    }),
    item_profiles: itemProfiles,
    containers: structuredClone(state.containers ?? []),
    container_placements: (state.container_placements ?? []).map(
      (placement) => actorPlacement(placement, actorId, normalizeNpcHolder)),
    container_profiles: structuredClone(state.container_profiles ?? [])
  };
}

export function createCommittedItemMechanicsResolver(
  state,
  { packingCalculator = null } = {}
) {
  const committedInput = buildCommittedInventoryInput(state);
  return Object.freeze((ref, { runtimeItems = [], retiredItemRefs = [] } = {}) => {
    const input = runtimeItems.length > 0 || retiredItemRefs.length > 0
      ? buildCommittedInventoryInput(withRuntimeItemOverlay(
          state, runtimeItems, retiredItemRefs))
      : committedInput;
    const itemsById = new Map(input.items.map((item) => [item.item_id, item]));
    const containersById = new Map(input.containers.map((container) =>
      [container.container_id, container]));
    const item = itemsById.get(ref);
    if (item) {
      const resolved = resolveInventoryMechanicsProfile({
        instance: item,
        profiles: input.item_profiles
      });
      return resolved.pass ? structuredClone(resolved.profile) : null;
    }
    const container = containersById.get(ref);
    if (!container) return null;
    const resolved = resolveInventoryMechanicsProfile({
      instance: container,
      profiles: input.container_profiles
    });
    if (!resolved.pass) return null;
    const usage = calculateContainerUsage({
      ...input,
      container_id: ref,
      container_compatibility: structuredClone(
        state.container_compatibility ?? []),
      packing_calculator: packingCalculator
    });
    return {
      ...structuredClone(resolved.profile),
      ...(usage.pass ? { used_slots: usage.used_slots } : {})
    };
  });
}

export function validateCommittedInventoryState(
  state,
  { packingCalculator = null } = {}
) {
  const input = buildCommittedInventoryInput(state);
  const topology = validateInventoryTopology(input);
  const errors = [...topology.errors];
  for (const container of input.containers) {
    const usage = calculateContainerUsage({
      ...input,
      container_id: container.container_id,
      container_compatibility: structuredClone(
        state.container_compatibility ?? []),
      packing_calculator: packingCalculator
    });
    errors.push(...usage.errors);
  }
  const mass = calculateInventoryMass(input);
  const hands = calculateHandsState(input);
  errors.push(...mass.errors, ...hands.errors);
  const load = mass.pass ? resolveInventoryLoad({
    total_mass_grams: mass.total_mass_grams,
    strength: input.strength
  }) : Object.freeze({ pass: false, load_category: null, errors: mass.errors });
  if (mass.pass) errors.push(...load.errors);
  if (load.pass && load.load_category === 'overloaded') {
    errors.push(inventoryIssue('INVENTORY_LOAD_EXCEEDED', 'capacity', {
      total_mass_grams: mass.total_mass_grams,
      strength: input.strength
    }));
  }
  return Object.freeze({
    pass: errors.length === 0,
    errors: Object.freeze(errors),
    topology,
    mass,
    hands,
    load
  });
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

export function getCommittedActorInventoryLoad(state, actorId) {
  const npc = (state.npcs ?? []).find(({ instance_id: id }) => id === actorId);
  if (!npc) throw inventoryError('ACTOR_INVENTORY_OWNER_MISSING');
  const inventory = buildCommittedInventoryInput(state, { actorId,
    actorStrength: null, normalizeNpcHolder: true });
  const mass = calculateInventoryMass(inventory);
  const hands = calculateHandsState(inventory);
  const loadCategory = npc.machine_state?.load_category
    ?? npc.inventory?.load_category ?? null;
  if (!mass.pass || !hands.pass
      || loadCategory != null
        && !['light', 'moderate', 'heavy', 'overloaded']
          .includes(loadCategory)) {
    throw inventoryError('ACTOR_INVENTORY_LOAD_INVALID', {
      actor_id: actorId, mass_errors: mass.errors,
      hands_errors: hands.errors, load_category: loadCategory });
  }
  return Object.freeze({ total_mass_grams: mass.total_mass_grams,
    hands_used: hands.hands_used, load_category: loadCategory });
}

function withRuntimeItemOverlay(state, runtimeItems, retiredItemRefs) {
  const byId = new Map((state.items ?? []).map((item) => [
    item?.item_id ?? item?.instance_id,
    structuredClone(item)
  ]));
  for (const itemId of retiredItemRefs) byId.delete(itemId);
  for (const item of runtimeItems) {
    const itemId = item?.item_id ?? item?.instance_id;
    if (typeof itemId !== 'string' || itemId.length === 0) continue;
    byId.set(itemId, {
      ...byId.get(itemId),
      ...structuredClone(item),
      item_id: itemId,
      instance_id: itemId
    });
  }
  return { ...state, items: [...byId.values()] };
}

function actorPlacement(value, actorId, normalizeNpcHolder) {
  const next = structuredClone(value ?? {});
  if (normalizeNpcHolder && next.holder_npc_id === actorId) {
    next.holder_character_id = actorId;
    delete next.holder_npc_id;
  }
  return next;
}

function inventoryError(code, details = null) {
  return Object.assign(new Error(code), { code, details });
}

function inventoryIssue(code, category, details) {
  return Object.freeze({
    code,
    category,
    retryable: false,
    message: code,
    details: Object.freeze(structuredClone(details))
  });
}
