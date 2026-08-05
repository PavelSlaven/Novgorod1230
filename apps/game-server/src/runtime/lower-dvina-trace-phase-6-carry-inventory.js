import { canonicalDigest } from '@rus/materialization';
import { buildCommittedInventoryInput } from './lower-dvina-trace-committed-inventory.js';
import { calculateHandsState, calculateInventoryMass, resolveInventoryLoad } from '@rus/items-property';

const REQUIRED_FREE_EXTERNAL_HANDS = 1;

export function carrierInventoryAdmission({ state, resources, prior,
  cumulativeBefore, rebindRequired, initialCarrierIds, reboundCarrierIds,
  replacementBoundary }) {
  const requests = [{ checkpoint: prior == null ? 'activity_start' : 'activity_resume', cumulative_elapsed_minutes: cumulativeBefore, carrierIds: prior?.internal_rebinding_applied === true ? reboundCarrierIds : initialCarrierIds }];
  if (rebindRequired) requests.push({
    checkpoint: 'exact_internal_rebind',
    cumulative_elapsed_minutes: replacementBoundary.elapsed_minutes,
    route_progress_ppm: replacementBoundary.route_progress_ppm,
    boundary_id: replacementBoundary.boundary_id,
    carrierIds: reboundCarrierIds
  });
  const excludedAssemblyItemIds = new Set([resources.net.item_id, resources.poles.item_id]);
  const snapshots = new Map();
  const checkpoints = requests.map((request) => {
    const checkpointSnapshots = request.carrierIds.map((actorId) => {
      const snapshot = carrierInventorySnapshot({ state, actorId, excludedAssemblyItemIds });
      snapshots.set(actorId, snapshot);
      return snapshot;
    });
    return { checkpoint: request.checkpoint, cumulative_elapsed_minutes: request.cumulative_elapsed_minutes, required_free_external_hands: REQUIRED_FREE_EXTERNAL_HANDS, active_carrier_ids: [...request.carrierIds], snapshot_digests: checkpointSnapshots.map(({ canonical_digest: digest }) => digest) };
  });
  return { snapshots: [...snapshots.values()], checkpoints };
}

export function carrierInventorySnapshot({ state, actorId,
  excludedAssemblyItemIds }) {
  const isPlayer = actorId === state.actor_id;
  const playerStrength = state.player_profile?.attributes?.strength?.value;
  if (isPlayer && (!Number.isSafeInteger(playerStrength) || playerStrength < 0)) fail('TRACE_PHASE_6_CARRIER_STRENGTH_MISSING', { actor_id: actorId });
  const items = (state.items ?? []).filter(
    ({ item_id: itemId }) => !excludedAssemblyItemIds.has(itemId)
  ).map((item) => ({
    ...item,
    placement: normalizeNpcHolder(item.placement, actorId)
  }));
  const inventory = buildCommittedInventoryInput({
    ...state,
    actor_id: actorId,
    items,
    container_placements: (state.container_placements ?? []).map(
      (placement) => normalizeNpcHolder(placement, actorId)
    )
  });
  inventory.strength = isPlayer ? playerStrength : null;
  const mass = calculateInventoryMass(inventory);
  const hands = calculateHandsState(inventory);
  const load = isPlayer && mass.pass ? resolveInventoryLoad({ total_mass_grams: mass.total_mass_grams, strength: playerStrength }) : { pass: !isPlayer, load_category: null, at_limit: null, errors: isPlayer ? mass.errors : [] };
  if (!mass.pass || !hands.pass || (isPlayer && (!load.pass || load.load_category === 'overloaded')) || hands.hands_free < REQUIRED_FREE_EXTERNAL_HANDS) fail('TRACE_PHASE_6_CARRIER_INVENTORY_INVALID', { actor_id: actorId, mass_errors: mass.errors, hands_errors: hands.errors, load_errors: load.errors, load_category: load.load_category, hands_free: hands.hands_free, required_free_external_hands: REQUIRED_FREE_EXTERNAL_HANDS });
  const carriedIds = carriedInventoryIds(inventory, actorId);
  const value = { actor_id: actorId, item_ids: carriedIds.item_ids, container_ids: carriedIds.container_ids, excluded_assembly_item_ids: [...excludedAssemblyItemIds].sort(), strength: isPlayer ? playerStrength : null, total_mass_grams: mass.total_mass_grams, load_category: load.load_category, at_load_limit: load.at_limit, load_evaluation: isPlayer ? 'evaluated_from_approved_player_strength' : 'not_evaluated_without_approved_strength', hands_used_before_activity: hands.hands_used, hands_free_before_activity: hands.hands_free, required_free_external_hands: REQUIRED_FREE_EXTERNAL_HANDS, activity_grip_hands: REQUIRED_FREE_EXTERNAL_HANDS, hands_used_with_activity: hands.hands_used + REQUIRED_FREE_EXTERNAL_HANDS };
  return { ...value, canonical_digest: canonicalDigest(value) };
}

function normalizeNpcHolder(value, actorId) { const next = structuredClone(value ?? {}); if (next.holder_npc_id === actorId) { next.holder_character_id = next.holder_npc_id; delete next.holder_npc_id; } return next; }
function carriedInventoryIds(inventory, actorId) {
  const containerPlacements = new Map(inventory.container_placements.map((placement) => [placement.container_id, placement]));
  const carriedContainer = (containerId) => { const seen = new Set(); let current = containerId; while (current != null) { if (seen.has(current)) return false; seen.add(current); const placement = containerPlacements.get(current); if (placement?.holder_character_id === actorId) return true; current = placement?.parent_container_id ?? null; } return false; };
  const placements = new Map(inventory.item_placements.map((placement) => [placement.item_id, placement]));
  const containerIds = inventory.containers.filter(({ container_id: containerId }) => carriedContainer(containerId)).map(({ container_id: containerId }) => containerId).sort();
  const itemIds = inventory.items.filter(({ item_id: itemId }) => { const placement = placements.get(itemId); return placement?.holder_character_id === actorId || (placement?.container_id != null && carriedContainer(placement.container_id)); }).map(({ item_id: itemId }) => itemId).sort();
  return { item_ids: itemIds, container_ids: containerIds };
}
function fail(code, details = null) { throw Object.assign(new Error(code), { code, details }); }
