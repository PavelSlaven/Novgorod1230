/**
 * Computes the space occupied by one template/state-preserving item line in
 * a container. This is intentionally unrelated to mass, volume or character
 * inventory capacity.
 */
export function calculatePackingSlots({ quantity, packing_slot_cost: packingSlotCost, packing_bundle_size: packingBundleSize } = {}) {
  const errors = [];
  if (!Number.isInteger(quantity) || quantity < 1) errors.push('PACKING_QUANTITY_INVALID');
  if (!Number.isInteger(packingSlotCost) || packingSlotCost < 1) errors.push('PACKING_SLOT_COST_INVALID');
  if (!Number.isInteger(packingBundleSize) || packingBundleSize < 1) errors.push('PACKING_BUNDLE_SIZE_INVALID');
  if (errors.length > 0) return Object.freeze({ pass: false, required_slots: null, errors: Object.freeze(errors) });
  return Object.freeze({
    pass: true,
    required_slots: Math.ceil(quantity / packingBundleSize) * packingSlotCost,
    errors: Object.freeze([])
  });
}
