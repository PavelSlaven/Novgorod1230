import { calculateContainerUsage, calculateHandsState, calculateInventoryMass, resolveInventoryAccess, resolveInventoryLoad, validateInventoryTopology } from '@rus/items-property';
import { calculatePackingSlots } from '@rus/world-catalog-workflow';
import { concern } from '../shared/utils.js';

/**
 * Optional until a reviewed Stage 8 candidate contract supplies inventory rows.
 * Once `required` is asserted, every input is explicit and the gate is fail-closed.
 */
export function evaluateStage16InventoryFoundation(draft = {}, input = {}) {
  const foundation = input.inventory_foundation;
  if (!foundation?.required) return Object.freeze({ concerns: Object.freeze([]), trace: null });
  if (!foundation.party_id || !foundation.actor_id || !Array.isArray(draft.item_instances) || !Array.isArray(draft.container_instances)) {
    return Object.freeze({ concerns: Object.freeze([concern('INITIAL_INVENTORY_PLACEMENT_DATA_GAP', 'Stage 16 requires an explicit inventory foundation candidate.', {})]), trace: null });
  }
  const state = {
    party_id: foundation.party_id,
    actor_id: foundation.actor_id,
    strength: foundation.strength,
    item_profiles: foundation.item_profiles,
    container_profiles: foundation.container_profiles,
    packing_calculator: calculatePackingSlots,
    container_compatibility: foundation.container_compatibility ?? [],
    items: draft.item_instances.map((item) => ({ party_id: foundation.party_id, item_id: item.item_instance_id, template_id: item.item_profile_candidate_id ?? item.item_template_id, quantity: item.quantity })),
    containers: draft.container_instances.map((container) => ({ party_id: foundation.party_id, container_id: container.container_instance_id, template_id: container.container_profile_candidate_id ?? container.container_template_id })),
    item_placements: draft.item_instances.map((item) => placement('item_id', item.item_instance_id, item.placement, foundation.party_id)),
    container_placements: draft.container_instances.map((container) => placement('container_id', container.container_instance_id, container.placement, foundation.party_id))
  };
  const topology = validateInventoryTopology(state);
  const mass = calculateInventoryMass(state);
  const hands = calculateHandsState(state);
  const load = mass.pass ? resolveInventoryLoad({ total_mass_grams: mass.total_mass_grams, strength: foundation.strength }) : { pass: false, errors: mass.errors };
  const usages = state.containers.map((container) => calculateContainerUsage({ ...state, container_id: container.container_id }));
  const access = state.items.map((item) => ({ item_id: item.item_id, ...resolveInventoryAccess({ ...state, item_id: item.item_id }) }));
  const concerns = [
    ...topology.errors,
    ...mass.errors,
    ...hands.errors,
    ...(load.errors ?? []),
    ...usages.flatMap((usage) => usage.errors)
  ].map((error) => concern(error.code, error.message, error.details));
  if (concerns.length) return Object.freeze({ concerns: Object.freeze(concerns), trace: null });
  return Object.freeze({
    concerns: Object.freeze([]),
    trace: Object.freeze({
      version: 1,
      schema: 'inventory_foundation_trace',
      summary: Object.freeze({ total_mass_grams: mass.total_mass_grams, load_category: load.load_category, hands_used: hands.hands_used, hands_free: hands.hands_free }),
      container_usage: Object.freeze(usages.map((usage) => Object.freeze({ used_slots: usage.used_slots, remaining_slots: usage.remaining_slots }))),
      access: Object.freeze(access)
    })
  });
}

function placement(key, id, source = {}, partyId) {
  const value = { party_id: partyId, [key]: id };
  if (source?.g5_anchor_id) value.anchor_id = source.g5_anchor_id;
  else if (source?.container_instance_id) value.container_id = source.container_instance_id;
  else if (source?.holder_npc_instance_id) value.holder_npc_id = source.holder_npc_instance_id;
  else if (source?.holder_player_character_id) value.holder_character_id = source.holder_player_character_id;
  value.physical_position = source?.physical_position ?? null;
  value.equipment_slot_id = source?.equipment_slot_category_id ?? null;
  return value;
}
