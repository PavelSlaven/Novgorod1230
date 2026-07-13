function cleanText(value) {
  return String(value ?? '').trim().toLowerCase();
}

function normalizePlacementValue(value) {
  const text = cleanText(value);
  const map = {
    hands: 'held',
    hand: 'held',
    held: 'held',
    in_hands: 'held',
    'в руках': 'held',
    'в руке': 'held',
    'в ладони': 'held',
    body: 'equipped',
    on_body: 'equipped',
    equipped: 'equipped',
    belt: 'equipped',
    'за поясом': 'equipped',
    'на теле': 'equipped',
    'при себе': 'carried',
    carried: 'carried',
    bag: 'contained',
    contained: 'contained',
    'в мешке': 'contained',
    'в сумке': 'contained',
    property: 'property',
    borrowed: 'borrowed',
    'на хранении': 'held_for_others',
    held_for_others: 'held_for_others'
  };
  return map[text] ?? text;
}

function normalizeAccessValue(value) {
  const text = cleanText(value);
  const map = {
    immediate: 'immediate',
    quick: 'quick',
    top_bag: 'top_bag',
    deep_bag: 'deep_bag',
    contained: 'contained',
    closed_container: 'closed_container',
    not_carried: 'not_carried',
    borrowed: 'borrowed',
    restricted: 'restricted',
    'в верхнем мешке': 'top_bag',
    'глубоко в мешке': 'deep_bag',
    'в закрытом контейнере': 'closed_container',
    'не при персонаже': 'not_carried',
    'можно использовать сразу': 'immediate',
    'можно быстро достать': 'quick',
    'нужно короткое действие': 'top_bag',
    'нужно время на поиск': 'deep_bag',
    'нужно открыть контейнер': 'closed_container',
    'нельзя использовать сейчас': 'not_carried',
    'одолжено': 'borrowed',
    'на хранении': 'held_for_others',
    'доступ ограничен': 'restricted'
  };
  return map[text] ?? text;
}

function itemPlacementValue(item) {
  return normalizePlacementValue(item?.placement);
}

function itemAccessValue(item) {
  return normalizeAccessValue(item?.access);
}

function physicalAccessTier(item = {}) {
  const placement = itemPlacementValue(item);
  const access = itemAccessValue(item);

  if (placement === 'property' || access === 'not_carried') return 'not_carried';
  if (access === 'closed_container' || placement === 'closed_container') return 'closed_container';
  if (access === 'top_bag') return 'top_bag';
  if (access === 'deep_bag') return 'deep_bag';
  if (placement === 'contained' || access === 'contained') return 'deep_bag';
  if (placement === 'equipped' || placement === 'belt' || placement === 'on_body' || placement === 'body') return 'quick';
  if (placement === 'held' || placement === 'hand' || placement === 'in_hands') return 'hands';
  if (access === 'immediate') return 'hands';
  if (access === 'quick') return 'quick';
  if (access === 'borrowed' || access === 'held_for_others' || access === 'restricted') return 'quick';
  return 'quick';
}

function humanizePhysicalAccess(item = {}) {
  const tier = physicalAccessTier(item);
  if (tier === 'hands') return 'можно использовать сразу';
  if (tier === 'quick') return 'можно быстро достать';
  if (tier === 'top_bag') return 'нужно короткое действие';
  if (tier === 'deep_bag') return 'нужно время на поиск';
  if (tier === 'closed_container') return 'нужно открыть контейнер';
  if (tier === 'not_carried') return 'нельзя использовать сейчас';
  return 'доступ ограничен';
}

function isQuickAccessibleItem(item = {}) {
  const tier = physicalAccessTier(item);
  return tier === 'hands' || tier === 'quick';
}

function isUsableOwnedResource(item = {}) {
  if (!isQuickAccessibleItem(item)) return false;

  const access = itemAccessValue(item);
  const legalStatus = cleanText(item?.legal_status ?? item?.legalStatus);
  const ownerId = String(item?.owner_id ?? item?.ownerId ?? '').trim();
  const holderId = String(item?.holder_id ?? item?.holderId ?? '').trim();
  const risk = Number(item?.risk);

  if (access === 'borrowed' || access === 'held_for_others' || access === 'restricted') return false;
  if (legalStatus === 'disputed' || legalStatus === 'restricted') return false;
  if (ownerId && holderId && ownerId !== holderId) return false;
  if (Number.isFinite(risk) && risk >= 4) return false;

  return true;
}

function handUsageForItem(item = {}) {
  if (!isQuickAccessibleItem(item)) return 0;

  const label = String(item?.label ?? item?.name ?? item?.title ?? '').trim().toLowerCase();
  const type = cleanText(item?.type);
  const placement = itemPlacementValue(item);

  if (placement === 'equipped' && type !== 'armor') return 1;
  if (placement === 'equipped' && /щит/.test(label)) return 1;
  if (placement === 'equipped') return 0;
  if (/арбал|лук|носилки|сундук|ящик|тюк/.test(label)) return 2;
  if (/копь|пика|рогатин|гизарм|алебард|бердыш|глеф/.test(label)) return 2;
  if (/щит|факел|мешок|сумк|корзин|ведро|копь|посох|верёв|повод/.test(label)) return 1;
  if (type === 'weapon' || type === 'tool' || type === 'container') return 1;
  return 0;
}

function countOccupiedHands(actor = {}) {
  const items = actor?.items && typeof actor.items === 'object' ? actor.items : {};
  const groups = [
    ...(Array.isArray(items.weapons) ? items.weapons : []),
    ...(Array.isArray(items.equipment) ? items.equipment : []),
    ...(Array.isArray(items.carried_items) ? items.carried_items : [])
  ];
  const seen = new Set();
  let total = 0;

  for (const item of groups) {
    if (!item || typeof item !== 'object') continue;
    const key = String(item.id ?? `${item.label ?? ''}:${item.placement ?? ''}:${item.access ?? ''}`).trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    total += handUsageForItem(item);
    if (total >= 2) return 2;
  }

  return Math.max(0, Math.min(2, total));
}

export {
  countOccupiedHands,
  handUsageForItem,
  humanizePhysicalAccess,
  isQuickAccessibleItem,
  isUsableOwnedResource,
  itemAccessValue,
  itemPlacementValue,
  normalizeAccessValue,
  normalizePlacementValue,
  physicalAccessTier
};
