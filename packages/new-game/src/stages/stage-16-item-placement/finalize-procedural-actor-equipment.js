import { calculateHandsState, calculateInventoryMass, resolveInventoryLoad,
  validateInventoryTopology } from '@rus/items-property';
import { MaterializationError } from '@rus/materialization';
import { evaluateStage16NormalizedInventory } from './validation/inventory-validation.js';

/** Pure Stage 16 mechanics dry-run; it never mutates or persists party state. */
export function dryRunProceduralActorEquipment({ allocationPlan, immediate = {},
  scenePackage = {} } = {}) {
  const plan = allocationPlan?.policy ?? allocationPlan;
  const actorId = allocationPlan?.actor_instance_id ?? plan?.actor_instance_id;
  const actor = (immediate.npcs ?? []).find(({ instance_id: id }) => id === actorId);
  const gap = (message, details = {}) => result('PROCEDURAL_NPC_EQUIPMENT_DATA_GAP', message, details);
  const invalid = (message, details = {}) => result('PROCEDURAL_NPC_EQUIPMENT_INVALID', message, details);
  if (!actorId || !actor || !Number.isInteger(actor.base_attributes?.values?.strength)) {
    return gap('Persisted NPC strength is required.', { actor_instance_id: actorId ?? null });
  }
  if (!Array.isArray(immediate.items) || !Array.isArray(immediate.containers)) {
    return gap('Full immediate inventory is required.');
  }
  const allocations = allocationPlan?.allocations ?? plan?.allocations;
  if (!Array.isArray(allocations)) return gap('Allocation plan is required.');
  const existingIds = new Set([...immediate.items, ...immediate.containers]
    .map((entry) => entry?.instance_id ?? entry?.item_instance_id ?? entry?.container_instance_id)
    .filter(Boolean));
  const proposedIds = new Set();
  const itemProfiles = {};
  const containerProfiles = {};
  for (const entry of [...immediate.items, ...immediate.containers]) {
    const id = entry.instance_id ?? entry.item_instance_id ?? entry.container_instance_id;
    const snapshot = entry.state?.inventory_profile_snapshot;
    if (!snapshot) continue;
    const template = entry.template_id ?? entry.item_template_id ?? entry.container_template_id;
    if (template) (entry.container_instance_id ? containerProfiles : itemProfiles)[template] = profileForTemplate(snapshot, template);
  }
  const profileRows = scenePackage.inventory_profiles;
  if (!Array.isArray(profileRows)) return gap('Scene package inventory profiles are required.');
  const created = [];
  const reuse = [];
  for (const allocation of allocations) {
    const id = allocation?.item_instance_id ?? allocation?.container_instance_id;
    const isContainer = allocation?.container_instance_id != null || allocation?.container_template_ref != null;
    if (!id || proposedIds.has(id)) return invalid('Allocation identity collides.', { id: id ?? null });
    proposedIds.add(id);
    const existing = [...immediate.items, ...immediate.containers].find((entry) =>
      (entry.instance_id ?? entry.item_instance_id ?? entry.container_instance_id) === id);
    const template = allocation.item_template_ref ?? allocation.container_template_ref;
    const profileId = allocation.inventory_profile_ref ?? allocation.inventory_profile_id;
    const quantity = allocation.quantity;
    if (!Number.isInteger(quantity) || quantity < 1) return gap('Allocation quantity is required.', { id });
    const placement = allocationPlacement(allocation, actorId);
    if (!placement) return gap('Allocation placement is required.', { id });
    if (allocation.disposition === 'reuse') {
      const snapshot = existing?.state?.inventory_profile_snapshot;
      if (!snapshot) return gap('Persisted inventory mechanics snapshot is required.', { id });
      if (!existing || !hasPlacement(existing, draftPlacements(immediate, isContainer ? 'container' : 'item'), id)) {
        return gap('Persisted inventory placement is required.', { id });
      }
      if (!existing || (existing.template_id ?? existing.item_template_id ?? existing.container_template_id) !== template
        || existing.inventory_profile_ref !== profileId
        || existing.quantity !== quantity
        || existing.physical_position !== placement.physical_position
        || !sameOwner(existing, actorId)) {
        return invalid('Reuse row is stale or does not match persisted inventory.', { id });
      }
      reuse.push(existing);
      continue;
    }
    if (existingIds.has(id)) return invalid('Created item collides with existing inventory.', { id });
    const profile = profileRows.find((row) => profileIdOf(row) === profileId
      && templateOf(row) === template && row.status === 'approved');
    if (!profile) return gap('Exact approved create inventory profile is required.', { id, profile_id: profileId, template_id: template });
    const target = { instance_id: id, template_id: template, quantity,
      quantity_unit_id: allocation.quantity_unit_id ?? 'piece',
      inventory_profile_ref: profileId,
      state: { inventory_profile_snapshot: structuredClone(profile) },
      ...(actor.actor_kind === 'player_character'
        ? { holder_character_id: actorId, owner_character_id: actorId, controller_character_id: actorId }
        : { holder_npc_id: actorId, owner_npc_id: actorId, controller_npc_id: actorId }),
      physical_position: placement.physical_position };
    created.push({ target, placement, isContainer });
    if (isContainer) containerProfiles[template] = profileForTemplate(profile, template);
    else itemProfiles[template] = profileForTemplate(profile, template);
  }
  const draft = structuredClone(immediate);
  draft.items.push(...created.filter(({ isContainer }) => !isContainer).map(({ target }) => target));
  draft.containers.push(...created.filter(({ isContainer }) => isContainer).map(({ target }) => target));
  const state = { party_id: allocationPlan?.party_id ?? immediate.party_id ?? 'party', actor_id: actorId,
    actor_kind: actor.actor_kind === 'player_character' ? 'player_character' : 'npc',
    strength: actor.base_attributes.values.strength, items: draft.items.map(toItem),
    containers: draft.containers.map(toContainer), item_profiles: itemProfiles,
    container_profiles: containerProfiles,
    item_placements: inventoryPlacements(draft, 'item'),
    container_placements: inventoryPlacements(draft, 'container') };
  const evaluated = evaluateStage16NormalizedInventory(state);
  if (evaluated.concerns.length) return invalid('Procedural inventory mechanics rejected the dry-run.', { concerns: evaluated.concerns });
  return Object.freeze({ pass: true, immediate: draft,
    allocations: Object.freeze([...reuse.map((entry) => ({ disposition: 'reuse', item_instance_id: entry.instance_id })),
      ...created.map(({ target }) => ({ disposition: 'create', item_instance_id: target.instance_id }))]),
    trace: evaluated.trace, readiness: allocationPlan?.readiness ?? 'pending_runtime_inventory_owner_validation',
    pending_gap: allocationPlan?.pending_gap ?? 'PROCEDURAL_NPC_EQUIPMENT_RUNTIME_COMMIT_PENDING' });
}

function result(code, message, details) { return Object.freeze({ pass: false, concerns: Object.freeze([{ code, message, details }]), trace: null }); }
function profileIdOf(profile) { return profile?.id ?? profile?.inventory_profile_id; }
function templateOf(profile) { return profile?.template_id ?? profile?.item_template_id ?? profile?.item_template_ref ?? profile?.container_template_id; }
function sameOwner(item, actorId) { const ids = [item.owner_id, item.holder_id, item.controller_id, item.owner_npc_id, item.holder_npc_id, item.controller_npc_id, item.owner_character_id, item.holder_character_id, item.controller_character_id].filter(Boolean); return ids.length >= 3 && ids.every((id) => id === actorId); }
function allocationPlacement(allocation, actorId) { const position = allocation.physical_position; if (!position) return null; return { ...allocation, physical_position: position, ...(allocation.container_id ? { container_id: allocation.container_id } : allocation.actor_kind === 'player_character' ? { holder_character_id: actorId } : { holder_npc_id: actorId }) }; }
function profileForTemplate(profile, template) { return { ...structuredClone(profile), template_id: template }; }
function toItem(item) { return { item_id: item.instance_id ?? item.item_instance_id, template_id: item.template_id ?? item.item_template_id, quantity: item.quantity, quantity_unit_id: item.quantity_unit_id }; }
function toContainer(container) { return { container_id: container.instance_id ?? container.container_instance_id, template_id: container.template_id ?? container.container_template_id }; }
function inventoryPlacements(immediate, kind) { const key = kind === 'item' ? 'item_id' : 'container_id'; const entries = kind === 'item' ? immediate.items : immediate.containers; const explicit = immediate[`${kind}_placements`]; return entries.map((entry) => explicit?.find((row) => row[key] === (entry.instance_id ?? entry[`${kind}_instance_id`])) ?? placementFromEntry(entry, key)); }
function draftPlacements(immediate, kind) { return inventoryPlacements(immediate, kind); }
function hasPlacement(entry, placements, id) { return placements.some((row) => row?.[entry.item_instance_id != null ? 'item_id' : 'container_id'] === id && ['anchor_id', 'container_id', 'holder_npc_id', 'holder_character_id', 'attached_item_id', 'location_ref', 'scene_position_id'].some((key) => row[key] != null)); }
function placementFromEntry(entry, key) { const value = { [key]: entry.instance_id ?? entry[key.replace('_id', '_instance_id')] }; for (const field of ['anchor_id', 'container_id', 'holder_npc_id', 'holder_character_id', 'attached_item_id', 'parent_container_id']) if (entry[field] != null) value[field] = entry[field]; if (entry.physical_position != null) value.physical_position = entry.physical_position; if (entry.equipment_slot_id != null) value.equipment_slot_id = entry.equipment_slot_id; return value; }

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
