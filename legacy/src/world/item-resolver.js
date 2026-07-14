import { applyStateDelta } from './delta.js';
import { countOccupiedHands, handUsageForItem, isQuickAccessibleItem, isUsableOwnedResource } from './item-access.js';
import { explainItemRecordValidation } from './json-contracts.js';
import { normalizeItemRecord } from './profile-v2.js';

function clean(value) {
  return String(value ?? '').trim().toLowerCase();
}

function itemLabel(item) {
  return clean(item?.label ?? item?.name ?? item?.title ?? item);
}

function matchesTarget(item, target) {
  const needle = clean(target);
  if (!needle || needle.length < 2) return false;
  const label = itemLabel(item);
  if (!label) return false;
  if (label === needle) return true;
  const min = Math.min(label.length, needle.length);
  if (min >= 4 && label.slice(0, min - 1) === needle.slice(0, min - 1)) return true;
  const tokens = needle.split(/[^\p{L}\-]+/u).filter((part) => part.length >= 3);
  if (!tokens.length) return label.includes(needle) || needle.includes(label);
  return tokens.every((token) => label.includes(token));
}

function playerCollections(player) {
  const items = player?.items && typeof player.items === 'object' ? player.items : {};
  return {
    carried: Array.isArray(items.carried_items) ? items.carried_items : [],
    equipment: Array.isArray(items.equipment) ? items.equipment : [],
    weapons: Array.isArray(items.weapons) ? items.weapons : [],
    armor: Array.isArray(items.armor) ? items.armor : [],
    property: Array.isArray(items.property_not_carried) ? items.property_not_carried : []
  };
}

function flattenItems(items = [], bucket = 'carried', holderId = 'player') {
  const found = [];
  for (const item of items) {
    if (!item) continue;
    found.push({ item, bucket, holderId, container: null });
    const contents = Array.isArray(item.contents) ? item.contents : [];
    for (const nested of contents) {
      found.push({ item: nested, bucket: 'contained', holderId, container: item });
    }
  }
  return found;
}

function collectPlayerItems(world) {
  const player = world.player ?? {};
  const groups = playerCollections(player);
  return [
    ...flattenItems(groups.carried, 'carried', 'player'),
    ...flattenItems(groups.equipment, 'equipment', 'player'),
    ...flattenItems(groups.weapons, 'weapons', 'player'),
    ...flattenItems(groups.armor, 'armor', 'player'),
    ...flattenItems(groups.property, 'property', 'player')
  ];
}

function collectLocationItems(world) {
  const found = [];
  for (const [index, value] of (world.microPlace?.visibleObjects ?? []).entries()) {
    if (typeof value === 'string') {
      found.push({
        item: normalizeItemRecord(value, { holderId: null, ownerId: null, placement: 'property', visible: true }, index),
        bucket: 'visible',
        holderId: null,
        container: null,
        visibleIndex: index
      });
      continue;
    }
    if (value && typeof value === 'object') {
      found.push({ item: value, bucket: 'visible', holderId: null, container: null, visibleIndex: index });
    }
  }
  for (const container of world.microPlace?.containers ?? []) {
    found.push({ item: container, bucket: 'container', holderId: null, container: null, isContainer: true });
    for (const nested of container.contents ?? []) {
      found.push({ item: nested, bucket: 'container-contents', holderId: null, container });
    }
  }
  for (const entry of world.propertyLedger ?? []) {
    if (entry?.placement === 'property' || entry?.holderId == null) {
      found.push({ item: entry, bucket: 'ledger', holderId: null, container: null });
    }
  }
  return found;
}

function findItemRef(world, target, options = {}) {
  const refs = [...collectLocationItems(world), ...collectPlayerItems(world)];
  const visibleOnly = options.visibleOnly !== false;
  const candidates = refs.filter((ref) => {
    if (!matchesTarget(ref.item, target) && !matchesTarget(ref.container, target)) return false;
    if (visibleOnly && ref.item?.visible === false) return false;
    if (visibleOnly && ref.item?.visibility === 'hidden') return false;
    return true;
  });
  return candidates[0] ?? null;
}

function findContainer(world, target) {
  const refs = collectLocationItems(world).concat(collectPlayerItems(world));
  return refs.find((ref) => {
    const containerLike = ref.isContainer || ref.item?.type === 'container' || Array.isArray(ref.item?.contents);
    if (!containerLike) return false;
    return matchesTarget(ref.item, target);
  }) ?? null;
}

function ensureContainerContents(containerRef) {
  const container = containerRef?.item;
  if (!container || typeof container !== 'object') return [];
  if (!Array.isArray(container.contents)) container.contents = [];
  return container.contents;
}

function removeVisibleObject(world, index) {
  if (!Array.isArray(world.microPlace?.visibleObjects)) return;
  world.microPlace.visibleObjects.splice(index, 1);
}

function moveItemToPlayer(world, ref) {
  const player = world.player;
  if (!player) return false;
  if (!player.items || typeof player.items !== 'object') player.items = {};
  if (!Array.isArray(player.items.carried_items)) player.items.carried_items = [];

  const item = normalizeItemRecord(ref.item, {
    holderId: 'player',
    ownerId: ref.item?.owner_id ?? ref.item?.ownerId ?? 'player',
    placement: 'carried',
    access: 'quick',
    visible: true
  }, player.items.carried_items.length);
  if (!item) return false;

  if (ref.bucket === 'visible' && Number.isInteger(ref.visibleIndex)) {
    removeVisibleObject(world, ref.visibleIndex);
  } else if (ref.container) {
    const contents = ensureContainerContents({ item: ref.container });
    const index = contents.findIndex((entry) => entry === ref.item || itemLabel(entry) === itemLabel(ref.item));
    if (index >= 0) contents.splice(index, 1);
  } else {
    applyStateDelta(world, {
      item_changes: [{
        op: 'take',
        item_id: ref.item?.id ?? null,
        label: item.label,
        from_holder_id: ref.holderId,
        to_holder_id: 'player'
      }]
    });
    return true;
  }

  player.items.carried_items.push(item);
  return true;
}

export function resolveItemAction(world, intent, check = null) {
  const target = intent?.target || extractLooseTarget(intent?.raw);
  switch (intent?.type) {
    case 'item_take':
      return resolveTake(world, target, check);
    case 'item_drop':
      return resolveDrop(world, target, check);
    case 'item_store':
      return resolveStore(world, target, check, intent);
    case 'item_retrieve':
      return resolveRetrieve(world, target, check);
    case 'item_open_container':
      return resolveOpenContainer(world, target, check);
    case 'item_search_container':
      return resolveSearchContainer(world, target, check);
    case 'item_equip':
      return resolveEquip(world, target, check);
    case 'item_unequip':
      return resolveUnequip(world, target, check);
    case 'item_use':
      return resolveUse(world, target, check);
    case 'item_give':
      return resolveGive(world, target, check, intent);
    case 'item_hide':
      return resolveHide(world, target, check);
    case 'item_inspect':
      return resolveInspect(world, target, check);
    default:
      return blocked('неподдерживаемое предметное действие', 'Мир не распознал предметное действие.');
  }
}

function extractLooseTarget(raw) {
  const text = clean(raw);
  const match = text.match(/(?:беру|взять|открываю|обыскиваю|надеваю|снимаю|использую|передаю|даю|достаю|кладу|бросаю|прячу)\s+(.+)$/iu);
  return match?.[1]?.trim() ?? '';
}

function blocked(summary, text, minutes = 5) {
  return { ok: false, minutes, summary, text, blocked: true };
}

function success(summary, text, minutes = 5) {
  return { ok: true, minutes, summary, text };
}

function isForeignOwnedItem(ref) {
  const ownerId = String(ref?.item?.owner_id ?? ref?.item?.ownerId ?? '').trim();
  return ownerId && ownerId !== 'player';
}

function resolveTake(world, target, check) {
  if (!target) return blocked('взять предмет', 'Нужно ясно назвать, что именно ты хочешь взять.');
  const ref = findItemRef(world, target, { visibleOnly: true });
  if (!ref) {
    return blocked('предмет не найден', `Ты не видишь здесь «${target}», и мир не создаёт предмет из твоего запроса.`);
  }
  if (ref.item?.locked || ref.container?.locked) {
    return blocked('доступ закрыт', 'Предмет или контейнер сейчас недоступен.');
  }
  if (isForeignOwnedItem(ref)) {
    return blocked(
      'чужое имущество',
      'Это чужая вещь. Нужна отдельная попытка кражи, разрешение владельца или правовое основание.'
    );
  }
  if (ref.holderId && ref.holderId !== 'player' && ref.item?.owner_id && ref.item.owner_id !== 'player') {
    return blocked('чужое имущество', 'Это не твоё, и взять без основания нельзя.');
  }
  if (!moveItemToPlayer(world, ref)) {
    return blocked('взять предмет', `Не удалось взять «${target}».`);
  }
  return success('взять предмет', `Ты берёшь ${itemLabel(ref.item)}.`);
}

function resolveDrop(world, target, check) {
  if (!target) return blocked('бросить предмет', 'Нужно назвать, что именно ты оставляешь.');
  const ref = findItemRef(world, target, { visibleOnly: false });
  if (!ref || ref.holderId !== 'player') {
    return blocked('предмет не найден', `У тебя нет «${target}», и мир не создаёт предмет из запроса.`);
  }
  applyStateDelta(world, {
    item_changes: [{
      op: 'drop',
      item_id: ref.item?.id ?? null,
      label: itemLabel(ref.item),
      from_holder_id: 'player',
      to_collection: 'property',
      placement: 'property'
    }]
  });
  if (!Array.isArray(world.microPlace?.visibleObjects)) world.microPlace = { ...(world.microPlace ?? {}), visibleObjects: [] };
  world.microPlace.visibleObjects.unshift(itemLabel(ref.item));
  return success('бросить предмет', `Ты оставляешь ${itemLabel(ref.item)} здесь.`);
}

function parseStoreParts(raw) {
  const match = String(raw ?? '').match(/(?:кладу|положить|положу|убираю)\s+(.+?)\s+в\s+(.+)$/iu);
  if (!match) return null;
  return {
    item: match[1].trim().replace(/[.,!?]+$/u, ''),
    container: match[2].trim().replace(/[.,!?]+$/u, '')
  };
}

function parseGiveParts(raw, fallbackTarget = '') {
  const text = String(raw ?? fallbackTarget ?? '').trim();
  const match = text.match(/(?:передаю|даю)\s+(.+?)\s+(.+)$/iu)
    ?? text.match(/(.+?)\s+(?:стражнику|мальчику|торговцу|(.+))$/iu);
  if (!match) return { item: fallbackTarget || text, recipient: '' };
  return {
    item: match[1].trim().replace(/[.,!?]+$/u, ''),
    recipient: (match[2] ?? '').trim().replace(/[.,!?]+$/u, '')
  };
}

function moveItemIntoContainer(world, itemRef, containerRef) {
  const item = normalizeItemRecord(itemRef.item, {
    holderId: null,
    ownerId: itemRef.item?.owner_id ?? itemRef.item?.ownerId ?? 'player',
    placement: 'contained',
    access: 'contained',
    visible: true
  }, 0);
  if (!item) return false;

  if (itemRef.holderId === 'player') {
    const groups = playerCollections(world.player);
    for (const list of [groups.carried, groups.equipment, groups.weapons, groups.armor]) {
      const index = list.findIndex((entry) => entry === itemRef.item || itemLabel(entry) === itemLabel(itemRef.item));
      if (index >= 0) list.splice(index, 1);
    }
  }

  const contents = ensureContainerContents(containerRef);
  contents.push(item);
  applyStateDelta(world, {
    item_changes: [{
      op: 'store',
      item_id: item.id ?? itemRef.item?.id ?? null,
      label: item.label,
      from_holder_id: itemRef.holderId,
      to_holder_id: null,
      container_id: containerRef.item?.id ?? null,
      placement: 'contained'
    }]
  });
  return true;
}

function resolveStore(world, target, check, intent = null) {
  const parts = parseStoreParts(intent?.raw) ?? (target ? { item: target, container: '' } : null);
  if (!parts?.item || !parts.container) {
    return blocked('положить предмет', 'Нужно назвать предмет и контейнер: «кладу хлеб в сумку».');
  }
  const itemRef = findItemRef(world, parts.item, { visibleOnly: false });
  if (!itemRef || itemRef.holderId !== 'player') {
    return blocked('предмет не найден', `У тебя нет «${parts.item}», и мир не создаёт предмет из запроса.`);
  }
  const containerRef = findContainer(world, parts.container);
  if (!containerRef) {
    return blocked('контейнер не найден', `Здесь нет контейнера «${parts.container}».`);
  }
  if (containerRef.item?.locked || (containerRef.item?.access === 'closed_container' && !containerRef.item?.opened)) {
    return blocked('контейнер закрыт', 'Сначала нужно открыть контейнер.');
  }
  if (!moveItemIntoContainer(world, itemRef, containerRef)) {
    return blocked('положить предмет', `Не удалось положить «${parts.item}» в ${itemLabel(containerRef.item)}.`);
  }
  return success('положить предмет', `Ты кладёшь ${itemLabel(itemRef.item)} в ${itemLabel(containerRef.item)}.`);
}

function resolveRetrieve(world, target, check) {
  const ref = findItemRef(world, target, { visibleOnly: false });
  if (!ref || ref.bucket !== 'contained') {
    return blocked('достать предмет', `Ты не находишь «${target || 'предмет'}» в доступном контейнере.`);
  }
  if (ref.container?.access === 'closed_container' || ref.container?.locked) {
    return blocked('контейнер закрыт', 'Сначала нужно открыть контейнер.');
  }
  ref.item.access = 'quick';
  ref.item.placement = 'carried';
  ref.item.visible = true;
  return success('достать предмет', `Ты достаёшь ${itemLabel(ref.item)} из ${itemLabel(ref.container)}.`);
}

function resolveOpenContainer(world, target, check) {
  const ref = findContainer(world, target);
  if (!ref) {
    return blocked('контейнер не найден', `Здесь нет контейнера «${target || 'указанного'}».`);
  }
  if (ref.item.locked) {
    return blocked('контейнер заперт', `${itemLabel(ref.item)} заперт.`);
  }
  const contents = ensureContainerContents(ref);
  ref.item.opened = true;
  ref.item.access = 'quick';
  for (const entry of contents) {
    if (!entry || typeof entry !== 'object') continue;
    entry.visible = true;
    entry.visibility = entry.visibility === 'hidden' ? 'discovered' : (entry.visibility ?? 'visible');
    entry.access = entry.access === 'closed_container' ? 'contained' : entry.access;
  }
  const labels = contents.map((entry) => itemLabel(entry)).filter(Boolean);
  const text = labels.length
    ? `Ты открываешь ${itemLabel(ref.item)}. Внутри: ${labels.join(', ')}.`
    : `Ты открываешь ${itemLabel(ref.item)}. Содержимое пока не зафиксировано или контейнер пуст.`;
  return success('открыть контейнер', text);
}

function resolveSearchContainer(world, target, check) {
  const ref = findContainer(world, target);
  if (!ref) {
    return blocked('контейнер не найден', `Здесь нет контейнера «${target || 'указанного'}».`);
  }
  if ((ref.item.locked || ref.item.access === 'closed_container') && !ref.item.opened) {
    return blocked('контейнер закрыт', 'Сначала нужно открыть контейнер.');
  }
  const contents = ensureContainerContents(ref);
  const prior = ref.item._searchSnapshot ?? contents.map((entry) => itemLabel(entry)).join('|');
  const current = contents.map((entry) => itemLabel(entry)).join('|');
  ref.item._searchSnapshot = current;
  if (prior && prior !== current) {
    return blocked('нестабильное содержимое', 'Содержимое контейнера не должно меняться между обысками без отдельного события.');
  }
  const labels = contents.map((entry) => itemLabel(entry)).filter(Boolean);
  return success('обыск контейнера', labels.length
    ? `Ты обыскиваешь ${itemLabel(ref.item)} и снова находишь: ${labels.join(', ')}.`
    : `Ты обыскиваешь ${itemLabel(ref.item)}, но ничего нового не обнаруживаешь.`);
}

function resolveEquip(world, target, check) {
  const ref = findItemRef(world, target, { visibleOnly: false });
  if (!ref || ref.holderId !== 'player') {
    return blocked('экипировка', `У тебя нет «${target || 'предмета'}» для экипировки.`);
  }
  const hands = countOccupiedHands(world.player);
  const needed = handUsageForItem(ref.item);
  if (hands + needed > 2) {
    return blocked('руки заняты', 'Свободных рук не хватает, чтобы экипировать это сейчас.');
  }
  applyStateDelta(world, {
    item_changes: [{
      op: 'equip',
      item_id: ref.item?.id ?? null,
      label: itemLabel(ref.item),
      from_holder_id: 'player',
      to_holder_id: 'player',
      placement: 'equipped',
      access: 'quick'
    }]
  });
  return success('экипировка', `Ты экипируешь ${itemLabel(ref.item)}.`);
}

function resolveUnequip(world, target, check) {
  const ref = findItemRef(world, target, { visibleOnly: false });
  if (!ref || ref.bucket !== 'equipment' && ref.item?.placement !== 'equipped') {
    return blocked('снять экипировку', `«${target || 'предмет'}» сейчас не экипирован.`);
  }
  applyStateDelta(world, {
    item_changes: [{
      op: 'unequip',
      item_id: ref.item?.id ?? null,
      label: itemLabel(ref.item),
      from_holder_id: 'player',
      to_holder_id: 'player',
      placement: 'carried',
      access: 'quick'
    }]
  });
  return success('снять экипировку', `Ты снимаешь ${itemLabel(ref.item)}.`);
}

function resolveUse(world, target, check) {
  const ref = findItemRef(world, target, { visibleOnly: false });
  if (!ref || ref.holderId !== 'player') {
    return blocked('использовать предмет', `У тебя нет «${target || 'предмета'}» для использования.`);
  }
  if (!isQuickAccessibleItem(ref.item) || !isUsableOwnedResource(ref.item)) {
    return blocked('предмет недоступен', `${itemLabel(ref.item)} сейчас нельзя быстро использовать.`);
  }
  const label = itemLabel(ref.item);
  const consumable = /бинт|леч|хлеб|зель|снадоб|еда|пищ/i.test(label)
    || ['consumable', 'medical', 'food', 'resource'].includes(String(ref.item?.type ?? '').toLowerCase());
  if (consumable) {
    ref.item.condition = 'израсходован';
    ref.item.access = 'unavailable';
    const groups = playerCollections(world.player);
    for (const list of [groups.carried, groups.equipment, groups.weapons, groups.armor]) {
      const index = list.findIndex((entry) => entry === ref.item || itemLabel(entry) === label);
      if (index >= 0) {
        list.splice(index, 1);
        break;
      }
    }
    return success('использовать предмет', `Ты используешь ${itemLabel(ref.item)} — предмет израсходован.`);
  }
  return success('использовать предмет', `Ты используешь ${itemLabel(ref.item)}.`);
}

function resolveGive(world, target, check, intent = null) {
  const parts = parseGiveParts(intent?.raw, target);
  const itemTarget = parts.item || target;
  if (!itemTarget) return blocked('передать предмет', 'Нужно назвать, что и кому ты передаёшь.');
  const ref = findItemRef(world, itemTarget, { visibleOnly: false });
  if (!ref || ref.holderId !== 'player') {
    return blocked('передать предмет', `У тебя нет «${itemTarget}» для передачи.`);
  }
  if (!world.pendingInteractions) world.pendingInteractions = [];
  world.pendingInteractions.unshift({
    type: 'pending_item_transfer',
    from_actor_id: 'player',
    to_actor_id: null,
    to_label: parts.recipient || null,
    item_id: ref.item?.id ?? null,
    item_label: itemLabel(ref.item),
    requires_acceptance: true,
    legal_risk: ref.item?.owner_id && ref.item.owner_id !== 'player' ? 'ownership' : 'ordinary'
  });
  world.pendingInteractions = world.pendingInteractions.slice(0, 12);
  const recipientText = parts.recipient ? ` ${parts.recipient}` : '';
  return success('передать предмет', `Ты протягиваешь ${itemLabel(ref.item)}${recipientText} — передача ждёт реакции другого человека.`);
}

function resolveHide(world, target, check) {
  const ref = findItemRef(world, target, { visibleOnly: false });
  if (!ref || ref.holderId !== 'player') {
    return blocked('спрятать предмет', `У тебя нет «${target || 'предмета'}» для сокрытия.`);
  }
  ref.item.visible = false;
  ref.item.visibility = 'hidden';
  ref.item.discoverability = Math.max(1, Number(ref.item.discoverability ?? 3) - 1);
  return success('спрятать предмет', `Ты прячешь ${itemLabel(ref.item)}.`);
}

function resolveInspect(world, target, check) {
  const ref = findItemRef(world, target, { visibleOnly: true });
  if (!ref) {
    return blocked('осмотр предмета', `Ты не видишь «${target || 'предмет'}».`);
  }
  const details = [
    itemLabel(ref.item),
    ref.item?.condition ? `состояние: ${ref.item.condition}` : null,
    ref.item?.material ? `материал: ${ref.item.material}` : null,
    ref.item?.access ? `доступ: ${ref.item.access}` : null
  ].filter(Boolean);
  return success('осмотр предмета', `Ты внимательно смотришь на ${details.join('; ')}.`);
}

function isSignificantItemCandidate(item) {
  if (!item || typeof item !== 'object') return false;
  const type = clean(item.type);
  if (['weapon', 'armor', 'container', 'document', 'valuable'].includes(type)) return true;
  if (Number(item.risk ?? 0) >= 2) return true;
  const ownership = clean(item.ownership_status ?? item.ownershipStatus);
  if (['stolen', 'disputed', 'illegal'].includes(ownership)) return true;
  return Boolean(item.owner_id || item.holder_id);
}

function validateSignificantItemFields(item, pathPrefix = 'item_change.item') {
  if (!isSignificantItemCandidate(item)) return [];
  const result = explainItemRecordValidation(item);
  return result.ok ? [] : result.errors.map((entry) => `${pathPrefix}: ${entry}`);
}

export function validateStateDeltaItemChange(world, change) {
  const errors = [];
  if (!change || typeof change !== 'object') {
    return { ok: false, errors: ['item_change: expected object'] };
  }
  const op = clean(change.op ?? change.action ?? 'move');
  const itemId = clean(change.item_id ?? change.itemId ?? change.id ?? change.item?.id);
  const label = clean(change.label ?? change.item?.label ?? change.item?.name);

  if (op === 'materialize') {
    const basis = clean(change.materialization_basis ?? change.materializationBasis);
    const approvedBasis = new Set([
      'existing_container_profile',
      'visible_scene_object',
      'local_plausibility',
      'consequence_of_action',
      'place_seed',
      'container_fixed_contents',
      'npc_inventory',
      'player_seed'
    ]);
    const source = clean(change.source ?? change.item?.source);
    const approvedSources = new Set([
      'place_seed',
      'container_fixed_contents',
      'npc_inventory',
      'visible_scene_object',
      'player_seed'
    ]);
    const sourceFactIds = Array.isArray(change.source_fact_ids)
      ? change.source_fact_ids
      : (Array.isArray(change.sourceFactIds) ? change.sourceFactIds : []);
    if (!itemId) errors.push('item_change.materialize: item_id is required');
    if (!basis || !approvedBasis.has(basis)) {
      errors.push('item_change.materialize: materialization_basis is required');
    }
    if (!approvedSources.has(source)) {
      errors.push('item_change.materialize: source must be place_seed|container_fixed_contents|npc_inventory|visible_scene_object|player_seed');
    }
    if (!clean(change.cause ?? change.item?.cause)) {
      errors.push('item_change.materialize: cause is required');
    }
    const evidence = Array.isArray(change.evidence) ? change.evidence : change.item?.evidence;
    if (!Array.isArray(evidence) || evidence.length === 0 || !evidence.some((entry) => clean(entry))) {
      errors.push('item_change.materialize: evidence[] is required');
    }
    const stagedGeneration = ['place_seed', 'player_seed', 'container_fixed_contents'].includes(source);
    if (!stagedGeneration && sourceFactIds.length === 0 && (!Array.isArray(evidence) || evidence.length === 0)) {
      errors.push('item_change.materialize: source_fact_ids or evidence is required');
    }
    if (!clean(change.why_not_visible_before ?? change.whyNotVisibleBefore) && !stagedGeneration) {
      errors.push('item_change.materialize: why_not_visible_before is required');
    }
    if (!change.item || typeof change.item !== 'object') {
      errors.push('item_change.materialize: item object is required');
    }
    const ownerId = clean(change.owner_id ?? change.ownerId ?? change.item?.owner_id);
    const holderId = clean(change.holder_id ?? change.holderId ?? change.item?.holder_id);
    if (!ownerId || !holderId) {
      errors.push('item_change.materialize: owner_id and holder_id are required');
    }
    return errors.length ? { ok: false, errors } : { ok: true, errors: [] };
  }

  if (change.item && typeof change.item === 'object' && !itemId && op !== 'discover') {
    const sourceRef = itemId || label;
    if (!sourceRef || !findItemRef(world, sourceRef, { visibleOnly: false })) {
      errors.push('item_change: cannot create unreferenced item without approved discover source');
    }
  }
  if (['take', 'move', 'pickup', 'transfer', 'give', 'equip', 'unequip', 'use'].includes(op)) {
    if (!itemId && !label) {
      errors.push('item_change: move requires existing item id or label');
    } else if (!findItemRef(world, label || itemId, { visibleOnly: false })
      && !(world.propertyLedger ?? []).some((entry) => clean(entry.id) === itemId || matchesTarget(entry, label))) {
      errors.push('item_change: source item must exist before move');
    }
  }
  if (change.item && typeof change.item === 'object') {
    errors.push(...validateSignificantItemFields(change.item));
  }
  return errors.length ? { ok: false, errors } : { ok: true, errors: [] };
}

export function validateStateDeltaItemChanges(world, changes = []) {
  const errors = [];
  for (const [index, change] of (Array.isArray(changes) ? changes : []).entries()) {
    const result = validateStateDeltaItemChange(world, change);
    if (!result.ok) errors.push(...result.errors.map((item) => `[${index}] ${item}`));
  }
  return errors.length ? { ok: false, errors } : { ok: true, errors: [] };
}
