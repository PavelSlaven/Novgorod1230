/** Computes exact occupied slots for one item line. */
export function calculatePackingSlots({ quantity,
  packing_slot_cost: packingSlotCost,
  packing_bundle_size: packingBundleSize } = {}) {
  const errors = [];
  if (!Number.isSafeInteger(quantity) || quantity < 1) {
    errors.push('PACKING_QUANTITY_INVALID');
  }
  if (!Number.isSafeInteger(packingSlotCost) || packingSlotCost < 1) {
    errors.push('PACKING_SLOT_COST_INVALID');
  }
  if (!Number.isSafeInteger(packingBundleSize) || packingBundleSize < 1) {
    errors.push('PACKING_BUNDLE_SIZE_INVALID');
  }
  if (errors.length > 0) return Object.freeze({
    pass: false,
    required_slots: null,
    errors: Object.freeze(errors)
  });
  const requiredSlots = Math.ceil(quantity / packingBundleSize)
    * packingSlotCost;
  if (!Number.isSafeInteger(requiredSlots)) return Object.freeze({
    pass: false,
    required_slots: null,
    errors: Object.freeze(['PACKING_REQUIRED_SLOTS_INVALID'])
  });
  return Object.freeze({
    pass: true,
    required_slots: requiredSlots,
    errors: Object.freeze([])
  });
}
