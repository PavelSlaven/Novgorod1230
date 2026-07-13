const WEIGHT_MISMATCH_TOLERANCE = 0.5;

function cleanText(value) {
  return String(value ?? '').trim();
}

function sumItemCollections(player = {}) {
  const collections = [
    ...(Array.isArray(player.items?.carried_items) ? player.items.carried_items : []),
    ...(Array.isArray(player.items?.equipment) ? player.items.equipment : []),
    ...(Array.isArray(player.items?.weapons) ? player.items.weapons : []),
    ...(Array.isArray(player.items?.armor) ? player.items.armor : []),
    ...(Array.isArray(player.items?.clothing) ? player.items.clothing : []),
    ...(Array.isArray(player.items?.containers) ? player.items.containers : [])
  ];
  const clothing = player.items?.clothing ?? player?.body?.clothing ?? player?.clothing ?? null;
  if (clothing && typeof clothing === 'object') {
    collections.push(clothing);
  } else if (cleanText(clothing)) {
    collections.push({ label: clothing, weight: 0 });
  }
  const seenIds = new Set();
  return collections.reduce((sum, item) => {
    const itemId = cleanText(item?.id);
    if (itemId) {
      if (seenIds.has(itemId)) return sum;
      seenIds.add(itemId);
    }
    const weight = Number(item?.weight ?? item?.mass);
    const itemWeight = Number.isFinite(weight) ? weight : 0;
    const contentsWeight = Array.isArray(item?.contents)
      ? item.contents.reduce((inner, nested) => {
        const nestedWeight = Number(nested?.weight ?? nested?.mass);
        return inner + (Number.isFinite(nestedWeight) ? nestedWeight : 0);
      }, 0)
      : 0;
    return sum + itemWeight + contentsWeight;
  }, 0);
}

export function calculateCarriedWeightFromItems(player = {}) {
  return sumItemCollections(player);
}

export function deriveLoadWeightValidation(player = {}) {
  const calculated = calculateCarriedWeightFromItems(player);
  const rawTotal = player.items?.total_weight;
  if (rawTotal === undefined || rawTotal === null) {
    return { calculated_total_weight: calculated, status: 'calculated_only', source_of_truth: 'calculated' };
  }
  const explicit = Number(rawTotal);
  if (!Number.isFinite(explicit)) {
    return { calculated_total_weight: calculated, status: 'calculated_only', source_of_truth: 'calculated' };
  }
  if (Math.abs(explicit - calculated) <= WEIGHT_MISMATCH_TOLERANCE) {
    return {
      explicit_total_weight: explicit,
      calculated_total_weight: calculated,
      status: 'match',
      source_of_truth: 'calculated'
    };
  }
  return {
    explicit_total_weight: explicit,
    calculated_total_weight: calculated,
    status: 'mismatch',
    source_of_truth: 'calculated'
  };
}

export function deriveCarriedWeight(player = {}) {
  return calculateCarriedWeightFromItems(player);
}

export function syncPlayerLoadValidation(player = {}) {
  if (!player.items || typeof player.items !== 'object') player.items = {};
  const validation = deriveLoadWeightValidation(player);
  if (validation.status === 'mismatch') {
    player.items.load_validation = validation;
  } else if (player.items.load_validation) {
    delete player.items.load_validation;
  }
  player.items.total_weight_derived = validation.calculated_total_weight;
  return validation;
}

export function resolveLoadCategory(player = {}) {
  syncPlayerLoadValidation(player);
  const explicit = String(player.items?.load_category ?? '').trim().toLowerCase();
  if (explicit) return explicit;

  const totalWeight = deriveCarriedWeight(player);
  const strength = Number(player.attributes?.strength);
  if (!Number.isFinite(totalWeight) || !Number.isFinite(strength)) return null;
  if (strength <= 0) return totalWeight > 0 ? 'overloaded' : 'light';
  if (totalWeight <= strength * 2) return 'light';
  if (totalWeight <= strength * 4) return 'moderate';
  if (totalWeight <= strength * 6) return 'heavy';
  return 'overloaded';
}
