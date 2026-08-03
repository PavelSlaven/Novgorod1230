import { deepFreeze } from '@rus/kernel';

export function resolveInventoryLoad({
  total_mass_grams: totalMass,
  strength
} = {}) {
  if (!Number.isInteger(totalMass) || totalMass < 0
      || !Number.isInteger(strength) || strength < 0) {
    return deepFreeze({
      pass: false,
      load_category: null,
      at_limit: false,
      errors: [deepFreeze({
        code: 'ITEM_MASS_DATA_GAP',
        category: 'validation',
        retryable: false,
        message: 'ITEM_MASS_DATA_GAP',
        details: deepFreeze({ total_mass_grams: totalMass, strength })
      })]
    });
  }
  const light = strength * 2 * 1000;
  const moderate = strength * 4 * 1000;
  const limit = strength * 6 * 1000;
  const loadCategory = totalMass <= light ? 'light'
    : totalMass <= moderate ? 'moderate'
      : totalMass <= limit ? 'heavy' : 'overloaded';
  return deepFreeze({
    pass: true,
    load_category: loadCategory,
    at_limit: totalMass === limit,
    errors: []
  });
}
