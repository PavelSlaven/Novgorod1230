import { calculateHandsState, calculateInventoryMass, resolveInventoryLoad,
  validateInventoryTopology } from '@rus/items-property';
import { MaterializationError } from '@rus/materialization';

/** Stage 16 owns approved procedural equipment; inactive policy creates nothing. */
export function finalizeProceduralActorEquipment(partyMaterialization) {
  const packages = partyMaterialization?.procedural_scene_packages?.packages ?? [];
  const active = packages.filter(({ allocation_policy: policy }) =>
    policy?.status === 'approved_for_stage16_materialization');
  if (active.length === 0) return partyMaterialization;
  for (const { allocation_policy: policy } of active) {
    const actor = partyMaterialization.immediate?.npcs?.find((npc) =>
      npc.instance_id === policy.actor_instance_id);
    if (actor?.base_attributes?.values?.strength == null) {
      throw new MaterializationError('PROCEDURAL_NPC_ATTRIBUTES_DATA_GAP',
        'Stage 16 requires persisted actor_base_attributes_v1.');
    }
    // Exact runtime rows are intentionally required before this inactive gate opens.
    const topology = validateInventoryTopology({ party_id: partyMaterialization.party_id,
      actor_id: actor.instance_id, items: [], containers: [],
      item_placements: [], container_placements: [] });
    const mass = calculateInventoryMass({ party_id: partyMaterialization.party_id,
      actor_id: actor.instance_id, items: [], containers: [],
      item_placements: [], container_placements: [] });
    const hands = calculateHandsState({ party_id: partyMaterialization.party_id,
      actor_id: actor.instance_id, items: [], containers: [],
      item_placements: [], container_placements: [] });
    const load = resolveInventoryLoad({ total_mass_grams: mass.total_mass_grams,
      strength: actor.base_attributes.values.strength });
    if (!topology.pass || !mass.pass || !hands.pass || !load.pass) {
      throw new MaterializationError('PROCEDURAL_NPC_EQUIPMENT_DATA_GAP',
        'Stage 16 inventory basis is incomplete.');
    }
    throw new MaterializationError('PROCEDURAL_NPC_EQUIPMENT_DATA_GAP',
      'Stage 16 requires independently runtime-approved allocation rows.');
  }
  return partyMaterialization;
}
