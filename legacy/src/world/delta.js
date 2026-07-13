import { appendLocationPeriod, closeLocationPeriod, getCurrentLocation } from './location.js';
import { getActiveStateValue, mirrorBodyStateFields, normalizeItemRecord, syncActorStateProfile, upsertActiveState } from './profile-v2.js';
import { buildPropertyLedger, normalizeNpcProfileLevel } from './entities.js';
import { recordWorldEvent } from './event-log.js';
import { resolveSemanticPending } from './semantic-gate.js';

export function applyStateDelta(world, delta = {}) {
  if (!delta || typeof delta !== 'object') return;

  applySceneDelta(world, delta.scene);
  applySocialDelta(world, delta.social);
  applyMemoryDelta(world, delta.memory);
  applyLocationDelta(world, delta.location);
  applyNpcDelta(world, delta.npcs);
  applyResourceDelta(world, delta.resources);
  const itemChangesTouched = applyItemChanges(world, delta.item_changes) || applyItemChanges(world, delta.resources?.item_changes);
  applyWitnessDelta(world, delta.witnesses);

  if (itemChangesTouched) {
    refreshPropertyLedger(world);
  }
}

function applySceneDelta(world, sceneDelta) {
  if (!sceneDelta || typeof sceneDelta !== 'object') return;
  let semanticResolved = false;
  if (typeof sceneDelta.weather === 'string') {
    world.scene.weather = sceneDelta.weather;
    resolveSemanticPending(world, 'weather');
    semanticResolved = true;
  }
  if (typeof sceneDelta.light === 'string') {
    world.scene.light = sceneDelta.light;
    resolveSemanticPending(world, 'light');
    semanticResolved = true;
  }
  if (typeof sceneDelta.attention === 'string') {
    world.scene.attention = sceneDelta.attention;
    resolveSemanticPending(world, 'attention');
    semanticResolved = true;
  }
  if (semanticResolved) {
    resolveSemanticPending(world, 'independent_tick');
  }
  if (Array.isArray(sceneDelta.pressure) && sceneDelta.pressure.length > 0) {
    world.scene.pressure = sceneDelta.pressure.slice(0, 3).map(String);
  }
  if (Array.isArray(sceneDelta.sounds) && sceneDelta.sounds.length > 0) {
    world.scene.sounds = sceneDelta.sounds.slice(0, 5).map(String);
  }
}

function applySocialDelta(world, socialDelta) {
  if (!socialDelta || typeof socialDelta !== 'object') return;
  const reputationDelta = socialDelta.reputation_delta ?? socialDelta.social_trace_delta ?? socialDelta.socialTrace_delta;
  world.social.reputation = adjust(world.social.reputation, reputationDelta);
  world.social.suspicion = adjust(world.social.suspicion, socialDelta.suspicion_delta);
  world.social.favors = adjust(world.social.favors, socialDelta.favors_delta);
  world.social.debts = adjust(world.social.debts, socialDelta.debts_delta);

  if (typeof socialDelta.social_trace_note === 'string' && socialDelta.social_trace_note.trim()) {
    if (!Array.isArray(world.social.socialMemory)) world.social.socialMemory = [];
    world.social.socialMemory.unshift({
      at: { ...world.clock },
      action: 'social_trace',
      actor: world.player?.name ?? 'игрок',
      place: world.place?.name ?? 'неизвестно',
      perception: socialDelta.social_trace_note.trim(),
      source: 'слышал',
      confidence: 0.35
    });
    world.social.socialMemory = world.social.socialMemory.slice(0, 20);
  }

  if (Array.isArray(socialDelta.knownBy_add)) {
    for (const name of socialDelta.knownBy_add) {
      if (typeof name === 'string' && name && !world.social.knownBy.includes(name)) {
        world.social.knownBy.push(name);
      }
    }
  }
}

function applyMemoryDelta(world, memoryDelta) {
  if (!memoryDelta || typeof memoryDelta !== 'object') return;
  if (!Array.isArray(world.memory.heardRumors)) world.memory.heardRumors = [];

  if (Array.isArray(memoryDelta.rumors_add)) {
    for (const rumor of memoryDelta.rumors_add) {
      if (typeof rumor === 'string' && rumor.trim()) {
        const text = rumor.trim();
        world.memory.heardRumors.unshift(text);
        recordWorldEvent(world, {
          kind: 'rumor',
          source: 'delta',
          visibility: 'public',
          status: 'heard',
          at: { ...world.clock },
          result: text
        });
      }
    }
    world.memory.heardRumors = world.memory.heardRumors.slice(0, 12);
  }
}

function ensureCoreStates(actor) {
  if (!actor || typeof actor !== 'object') return {};
  if (!actor.states || typeof actor.states !== 'object') {
    actor.states = {};
  }

  const health = Number(actor.body?.health ?? actor.health ?? actor.needs?.health);
  const satiety = Number(actor.body?.satiety ?? actor.satiety ?? actor.needs?.satiety);
  const vigor = Number(actor.body?.vigor ?? actor.vigor ?? actor.needs?.vigor);

  if (!Number.isFinite(actor.states.health)) {
    actor.states.health = Number.isFinite(health) ? health : 100;
  }
  if (!Number.isFinite(actor.states.satiety)) {
    actor.states.satiety = Number.isFinite(satiety) ? satiety : 100;
  }
  if (!Number.isFinite(actor.states.vigor)) {
    actor.states.vigor = Number.isFinite(vigor) ? vigor : 100;
  }

  return actor.states;
}

function clampState(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(100, Math.round(numeric)));
}

function applyResourceDelta(world, resourceDelta) {
  if (!resourceDelta || typeof resourceDelta !== 'object') return;
  let playerChanged = false;
  const playerStates = ensureCoreStates(world.player);

  const satietyDelta = resolveBodyResourceDelta(resourceDelta, 'satiety_delta', 'hunger_delta', (value) => -value);
  const vigorDelta = resolveBodyResourceDelta(resourceDelta, 'vigor_delta', 'fatigue_delta', (value) => -value);
  const sleepDelta = typeof resourceDelta.sleep_delta === 'number' && typeof resourceDelta.vigor_delta !== 'number'
    ? -resourceDelta.sleep_delta
    : null;

  if (typeof satietyDelta === 'number') {
    playerStates.satiety = clampState((playerStates.satiety ?? 100) + satietyDelta);
    playerChanged = true;
  }
  if (typeof resourceDelta.thirst_delta === 'number') {
    const currentThirst = Number(getActiveStateValue(world.player, 'thirst') ?? 0);
    upsertActiveState(world.player, 'thirst', 'жажда', clampState(currentThirst + resourceDelta.thirst_delta), 'derived');
    playerChanged = true;
  }
  if (typeof vigorDelta === 'number') {
    playerStates.vigor = clampState((playerStates.vigor ?? 100) + vigorDelta);
    playerChanged = true;
  }
  if (typeof sleepDelta === 'number') {
    playerStates.vigor = clampState((playerStates.vigor ?? 100) + sleepDelta);
    playerChanged = true;
  }
  if (typeof resourceDelta.health_delta === 'number') {
    playerStates.health = clampState((playerStates.health ?? 100) + resourceDelta.health_delta);
    playerChanged = true;
  }
  if (typeof resourceDelta.bleeding_delta === 'number') {
    world.player.bleeding = Math.max(0, Math.min(100, (world.player.bleeding ?? 0) + resourceDelta.bleeding_delta));
    playerChanged = true;
  }
  if (typeof resourceDelta.fear_delta === 'number') {
    const currentFear = Number(getActiveStateValue(world.player, 'fear') ?? 0);
    upsertActiveState(world.player, 'fear', 'страх', clampState(currentFear + resourceDelta.fear_delta), 'derived');
    playerChanged = true;
  }
  // ponytail: inventory_add/property_add removed — items only via item_changes.materialize
  if (Array.isArray(resourceDelta.inventory_remove) || typeof resourceDelta.inventory_remove === 'string' || isRecord(resourceDelta.inventory_remove)) {
    const inventory = getItemCollection(world.player, 'inventory');
    const removed = removeItemMutationList(inventory, resourceDelta.inventory_remove);
    if (removed.length > 0) playerChanged = true;
  }
  if (Array.isArray(resourceDelta.property_remove) || typeof resourceDelta.property_remove === 'string' || isRecord(resourceDelta.property_remove)) {
    const property = getItemCollection(world.player, 'property');
    const removed = removeItemMutationList(property, resourceDelta.property_remove);
    if (removed.length > 0) playerChanged = true;
  }
  if (Array.isArray(resourceDelta.injuries_add)) {
    if (!Array.isArray(world.player.injuries)) world.player.injuries = [];
    for (const injury of resourceDelta.injuries_add) {
      if (!injury || typeof injury !== 'object') continue;
      if (typeof injury.id !== 'string' || !injury.id.trim()) continue;
      if (world.player.injuries.some((item) => item.id === injury.id)) continue;
      world.player.injuries.push({
        id: injury.id,
        label: typeof injury.label === 'string' ? injury.label : injury.id,
        severity: typeof injury.severity === 'number' ? injury.severity : 1,
        bleeding: typeof injury.bleeding === 'number' ? injury.bleeding : 0,
        treated: Boolean(injury.treated),
        source: typeof injury.source === 'string' ? injury.source : 'unknown',
        at: injury.at ?? null
      });
    }
    playerChanged = true;
  }
  if (Array.isArray(resourceDelta.injuries_treat)) {
    if (!Array.isArray(world.player.injuries)) world.player.injuries = [];
    for (const id of resourceDelta.injuries_treat) {
      const injury = world.player.injuries.find((item) => item.id === id);
      if (!injury) continue;
      injury.treated = true;
      injury.bleeding = Math.max(0, (injury.bleeding ?? 0) - 1);
      injury.severity = Math.max(0, (injury.severity ?? 1) - 1);
    }
    world.player.injuries = world.player.injuries.filter((item) => (item.severity ?? 0) > 0 || !item.treated);
    playerChanged = true;
  }

  if (playerChanged && world.player && typeof world.player === 'object') {
    mirrorBodyStateFields(world.player);
    world.player = syncActorStateProfile(world.player, {
      kind: 'player',
      currentLocationId: world.currentLocationId,
      currentMicroLocationId: world.currentMicroLocationId ?? world.current_position?.minilocation_id ?? null,
      region_id: world.current_position?.region_id ?? null
    });
    refreshPropertyLedger(world);
  }
}

function resolveBodyResourceDelta(resourceDelta, canonicalKey, legacyKey, legacyAdapter) {
  if (canonicalKey && typeof resourceDelta[canonicalKey] === 'number') {
    return resourceDelta[canonicalKey];
  }
  if (typeof resourceDelta[legacyKey] === 'number') {
    return legacyAdapter(resourceDelta[legacyKey]);
  }
  return null;
}

function applyItemChanges(world, itemChanges) {
  if (!Array.isArray(itemChanges) || itemChanges.length === 0) return false;

  const touchedActors = new Set();
  for (const change of itemChanges) {
    const normalized = normalizeItemChange(change);
    if (!normalized) continue;
    const result = applySingleItemChange(world, normalized);
    if (result?.sourceActor) touchedActors.add(result.sourceActor);
    if (result?.targetActor) touchedActors.add(result.targetActor);
  }

  for (const actor of touchedActors) {
    resyncActorItems(world, actor);
  }

  return touchedActors.size > 0;
}

function normalizeItemChange(change) {
  if (change === null || change === undefined) return null;
  if (typeof change === 'string') {
    const text = change.trim();
    return text ? { op: 'move', label: text } : null;
  }
  if (!isRecord(change)) return null;

  return {
    op: String(change.op ?? change.action ?? change.kind ?? 'move').trim().toLowerCase(),
    itemId: String(change.item_id ?? change.itemId ?? change.id ?? change.item?.id ?? '').trim() || null,
    label: String(change.label ?? change.item?.label ?? change.item?.name ?? change.item?.title ?? '').trim() || null,
    item: isRecord(change.item) ? structuredClone(change.item) : null,
    fromHolderId: resolveItemActorId(change.from_holder_id ?? change.fromHolderId ?? change.source_id ?? change.sourceId ?? null),
    toHolderId: resolveItemActorId(change.to_holder_id ?? change.toHolderId ?? change.target_id ?? change.targetId ?? null),
    fromOwnerId: resolveItemActorId(change.from_owner_id ?? change.fromOwnerId ?? null),
    toOwnerId: resolveItemActorId(change.to_owner_id ?? change.toOwnerId ?? null),
    fromCollection: normalizeItemCollection(change.from_collection ?? change.fromCollection ?? null),
    toCollection: normalizeItemCollection(change.to_collection ?? change.toCollection ?? null),
    access: normalizeItemAccess(change.access ?? change.item?.access ?? null),
    placement: normalizeItemPlacement(change.placement ?? change.item?.placement ?? null),
    containerId: String(change.container_id ?? change.containerId ?? change.item?.container_id ?? change.item?.containerId ?? '').trim() || null,
    visible: change.visible,
    condition: typeof (change.condition ?? change.item?.condition) === 'string' ? String(change.condition ?? change.item?.condition).trim() : null,
    marksAdd: normalizeItemMarks(change.marks_add ?? change.marksAdd ?? change.item?.marks_add ?? change.item?.marksAdd),
    marksRemove: normalizeItemMarks(change.marks_remove ?? change.marksRemove ?? change.item?.marks_remove ?? change.item?.marksRemove),
    marksSet: normalizeItemMarks(change.marks ?? change.item?.marks),
    risk: Number.isFinite(Number(change.risk ?? change.item?.risk)) ? Number(change.risk ?? change.item?.risk) : null,
    source: String(change.source ?? change.item?.source ?? '').trim() || null,
    cause: String(change.cause ?? change.item?.cause ?? '').trim() || null,
    evidence: Array.isArray(change.evidence) ? change.evidence.map(String) : (Array.isArray(change.item?.evidence) ? change.item.evidence.map(String) : [])
  };
}

function applySingleItemChange(world, change) {
  if (String(change.op ?? '').toLowerCase() === 'materialize') {
    return applyMaterializeItemChange(world, change);
  }
  if (isItemUpdateOperation(change.op)) {
    return applyItemUpdate(world, change);
  }

  const sourceActor = resolveItemActor(world, change.fromHolderId ?? change.fromOwnerId ?? change.fromCollection);
  const targetActor = resolveItemActor(world, change.toHolderId ?? change.toOwnerId ?? change.toCollection ?? sourceActor?.id ?? 'player');
  const actorForRemoval = sourceActor ?? targetActor;
  if (!actorForRemoval) return null;

  const removal = removeItemFromActor(actorForRemoval, change);
  const baseItem = removal?.item ?? change.item;
  if (!baseItem) return null;

  const sourceOwnerId = change.fromOwnerId ?? removal?.item?.owner_id ?? removal?.item?.ownerId ?? actorForRemoval?.id ?? null;
  const targetOwnerId = change.toOwnerId ?? sourceOwnerId;
  const targetHolderId = change.toHolderId ?? targetActor?.id ?? null;
  const targetPlacement = normalizeItemPlacement(
    change.toCollection === 'property' || change.op === 'drop'
      ? 'property'
      : change.toCollection === 'inventory' || ['take', 'pickup', 'transfer', 'give', 'move', 'put'].includes(change.op)
        ? 'carried'
        : (change.placement ?? removal?.item?.placement ?? 'carried')
  );
  const movedItem = rebuildItemWithContext(baseItem, {
    ownerId: targetOwnerId ?? sourceOwnerId ?? null,
    holderId: targetPlacement === 'property' ? null : (targetHolderId ?? null),
    placement: targetPlacement,
    access: change.access,
    visible: change.visible,
    containerId: change.containerId ?? removal?.item?.container_id ?? removal?.item?.containerId ?? null
  });
  if (!movedItem) return null;

  movedItem.owner_id = targetOwnerId ?? movedItem.owner_id ?? null;
  movedItem.holder_id = targetPlacement === 'property' ? null : (targetHolderId ?? movedItem.holder_id ?? null);
  movedItem.placement = targetPlacement;
  movedItem.access = normalizeItemAccess(change.access ?? inferAccessForMovedItem(movedItem, change.op, sourceOwnerId, targetHolderId, targetPlacement));
  movedItem.visible = change.visible === undefined ? movedItem.visible !== false : Boolean(change.visible);
  replaceItemRecord(movedItem, rebuildItemWithContext(movedItem, {
    ownerId: movedItem.owner_id,
    holderId: movedItem.holder_id,
    placement: movedItem.placement,
    access: movedItem.access,
    visible: movedItem.visible,
    containerId: movedItem.container_id ?? null
  }));
  const baseRisk = Number.isFinite(Number(movedItem.risk)) ? Number(movedItem.risk) : 0;
  movedItem.risk = Math.max(baseRisk, inferRiskForMovedItem(movedItem, change.op, sourceOwnerId, targetHolderId, targetPlacement));
  movedItem.risk = Math.max(0, Math.min(5, Math.round(movedItem.risk)));
  if (movedItem.value && typeof movedItem.value === 'object') {
    movedItem.value.risk = movedItem.risk;
  }

  if (targetPlacement === 'property') {
    const targetCollection = ensureItemCollection(targetActor, 'property');
    targetCollection.push(movedItem);
  } else {
    const targetCollection = ensureItemCollection(targetActor, 'inventory');
    targetCollection.push(movedItem);
  }

  logItemChangeEvent(world, change, movedItem, actorForRemoval, targetActor);

  return {
    sourceActor: actorForRemoval,
    targetActor
  };
}

function applyMaterializeItemChange(world, change) {
  const targetActor = resolveItemActor(world, change.toHolderId ?? change.toOwnerId ?? 'player');
  if (!targetActor || !change.item) return null;

  const targetPlacement = normalizeItemPlacement(
    change.toCollection === 'property' ? 'property' : (change.placement ?? change.item?.placement ?? 'carried')
  );
  const targetOwnerId = change.toOwnerId ?? targetActor.id ?? 'player';
  const targetHolderId = targetPlacement === 'property' ? null : (change.toHolderId ?? targetActor.id ?? 'player');
  const materialized = rebuildItemWithContext(change.item, {
    ownerId: targetOwnerId,
    holderId: targetHolderId,
    placement: targetPlacement,
    access: change.access,
    visible: change.visible,
    containerId: change.containerId ?? null
  });
  if (!materialized) return null;

  const collection = targetPlacement === 'property'
    ? ensureItemCollection(targetActor, 'property')
    : ensureItemCollection(targetActor, 'inventory');
  collection.push(materialized);
  logItemChangeEvent(world, change, materialized, targetActor, targetActor);
  return { sourceActor: targetActor, targetActor };
}

function isItemUpdateOperation(op) {
  return ['update', 'repair', 'damage', 'mark', 'use'].includes(String(op ?? '').trim().toLowerCase());
}

function applyItemUpdate(world, change) {
  const actor = resolveItemActor(world, change.fromHolderId ?? change.toHolderId ?? change.fromOwnerId ?? change.toOwnerId ?? 'player');
  if (!actor) return null;

  const item = findActorItem(actor, change);
  if (!item) return null;

  const beforeCondition = typeof item.condition === 'string' ? item.condition : null;
  const beforeMarks = Array.isArray(item.marks) ? item.marks.slice() : [];
  const beforeRisk = Number.isFinite(Number(item.risk)) ? Number(item.risk) : null;
  const preservedContents = Array.isArray(item.contents) ? item.contents : null;

  if (change.condition) item.condition = change.condition;
  if (change.visible !== undefined) item.visible = Boolean(change.visible);
  if (change.access) item.access = change.access;
  if (change.placement) item.placement = change.placement;
  if (!Array.isArray(item.marks)) item.marks = [];
  if (change.marksSet.length > 0) item.marks = change.marksSet.slice();
  if (change.marksAdd.length > 0) {
    for (const mark of change.marksAdd) {
      if (!item.marks.includes(mark)) item.marks.push(mark);
    }
  }
  if (change.marksRemove.length > 0) {
    item.marks = item.marks.filter((mark) => !change.marksRemove.includes(mark));
  }
  if (change.risk !== null) {
    item.risk = Math.max(0, Math.min(5, Math.round(change.risk)));
  }
  replaceItemRecord(item, rebuildItemWithContext(item, {
    ownerId: item.owner_id ?? null,
    holderId: item.placement === 'property' ? null : (item.holder_id ?? null),
    placement: item.placement ?? 'carried',
    access: item.access,
    visible: item.visible,
    containerId: item.container_id ?? null
  }));
  if (preservedContents) {
    item.contents = preservedContents;
  }
  if (change.risk !== null) {
    item.risk = Math.max(0, Math.min(5, Math.round(change.risk)));
    if (item.value && typeof item.value === 'object') {
      item.value.risk = item.risk;
    }
  }

  logItemUpdateEvent(world, item, actor, {
    beforeCondition,
    beforeMarks,
    beforeRisk
  });

  return {
    sourceActor: actor,
    targetActor: actor
  };
}

function removeItemFromActor(actor, change) {
  if (!actor || typeof actor !== 'object') return null;
  const collections = [
    ['inventory', getItemCollection(actor, 'inventory')],
    ['property', getItemCollection(actor, 'property')]
  ];
  let removedItem = null;
  for (const [collectionName, items] of collections) {
    if (!Array.isArray(items) || items.length === 0) continue;
    let index = findItemIndex(items, change);
    while (index >= 0) {
      const [item] = items.splice(index, 1);
      if (!removedItem) {
        removedItem = item;
      }
      index = findItemIndex(items, change);
    }
  }
  return removedItem ? { collectionName: null, item: removedItem } : null;
}

function getItemCollection(actor, collectionName) {
  if (!actor || typeof actor !== 'object') return [];
  const items = actor.items && typeof actor.items === 'object' ? actor.items : null;
  if (collectionName === 'inventory') {
    if (Array.isArray(items?.carried_items)) return items.carried_items;
    if (Array.isArray(items?.equipment)) return items.equipment;
    if (Array.isArray(items?.weapons)) return items.weapons;
    if (Array.isArray(items?.armor)) return items.armor;
    return [];
  }
  if (collectionName === 'property') {
    if (Array.isArray(items?.property_not_carried)) return items.property_not_carried;
    if (Array.isArray(items?.borrowed_items)) return items.borrowed_items;
    if (Array.isArray(items?.foreign_items_with_character)) return items.foreign_items_with_character;
    return [];
  }
  return [];
}

function ensureItemCollection(actor, collectionName) {
  if (!actor || typeof actor !== 'object') return [];
  if (collectionName === 'inventory') {
    if (actor.items && typeof actor.items === 'object' && !Array.isArray(actor.items)) {
      if (!Array.isArray(actor.items.carried_items)) actor.items.carried_items = [];
      return actor.items.carried_items;
    }
    actor.items = {};
    actor.items.carried_items = [];
    return actor.items.carried_items;
  }
  if (collectionName === 'property') {
    if (actor.items && typeof actor.items === 'object' && !Array.isArray(actor.items)) {
      if (!Array.isArray(actor.items.property_not_carried)) actor.items.property_not_carried = [];
      return actor.items.property_not_carried;
    }
    actor.items = actor.items && typeof actor.items === 'object' && !Array.isArray(actor.items) ? actor.items : {};
    actor.items.property_not_carried = [];
    return actor.items.property_not_carried;
  }
  if (!actor.items || typeof actor.items !== 'object' || Array.isArray(actor.items)) {
    actor.items = {};
  }
  if (!Array.isArray(actor.items[collectionName])) actor.items[collectionName] = [];
  return actor.items[collectionName];
}

function findItemIndex(items, change) {
  const wantedId = String(change.itemId ?? '').trim();
  const wantedLabel = String(change.label ?? '').trim().toLowerCase();
  return (Array.isArray(items) ? items : []).findIndex((item) => {
    if (wantedId && resolveItemId(item) === wantedId) return true;
    const label = resolveItemLabel(item).toLowerCase();
    if (!wantedLabel || !label) return false;
    return label === wantedLabel || label.includes(wantedLabel) || wantedLabel.includes(label);
  });
}

function resolveItemActor(world, ref) {
  const actorId = resolveItemActorId(ref);
  if (!actorId) return null;
  if (actorId === 'player') return world.player ?? null;
  const npc = (world.npcs ?? []).find((item) => item.id === actorId || item.name === actorId || String(item.name ?? '').toLowerCase() === actorId.toLowerCase());
  return npc ?? null;
}

function resolveItemActorId(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') {
    const text = value.trim();
    return text ? text : null;
  }
  if (!isRecord(value)) return null;
  return String(value.id ?? value.handle ?? value.name ?? value.label ?? '').trim() || null;
}

function normalizeItemCollection(value) {
  const text = String(value ?? '').trim().toLowerCase();
  if (text === 'property' || text === 'not_carried' || text === 'outside' || text === 'stored') return 'property';
  if (text === 'carried' || text === 'inventory' || text === 'held' || text === 'equipped') return 'inventory';
  if (text === 'borrowed') return 'inventory';
  return null;
}

function normalizeItemPlacement(value) {
  const text = String(value ?? '').trim().toLowerCase();
  if (text === 'property' || text === 'not_carried' || text === 'outside') return 'property';
  if (text === 'borrowed') return 'carried';
  if (text === 'contained') return 'contained';
  if (text === 'equipped') return 'equipped';
  if (text === 'held_for_others') return 'carried';
  return text || 'carried';
}

function normalizeItemAccess(value) {
  const text = String(value ?? '').trim().toLowerCase();
  if (!text) return null;
  if (text === 'property') return 'not_carried';
  if (text === 'carried') return 'immediate';
  if (text === 'held_for_others') return 'restricted';
  if (text === 'outside') return 'not_carried';
  return text;
}

function normalizeItemMarks(value) {
  const list = Array.isArray(value) ? value : (value ? [value] : []);
  return list
    .map((item) => String(item ?? '').trim())
    .filter(Boolean);
}

function rebuildItemWithContext(item, overrides = {}) {
  if (!item || typeof item !== 'object') return null;
  const stripped = stripDerivedItemFields(item, overrides);
  return normalizeItemRecord(stripped, {
    ownerId: overrides.ownerId ?? item.owner_id ?? item.ownerId ?? null,
    holderId: overrides.holderId ?? item.holder_id ?? item.holderId ?? null,
    placement: overrides.placement ?? item.placement ?? 'carried',
    access: overrides.access,
    visible: overrides.visible,
    containerId: overrides.containerId ?? item.container_id ?? item.containerId ?? null
  }, 0);
}

function stripDerivedItemFields(item, overrides = {}) {
  const clone = { ...item };
  delete clone.owner_id;
  delete clone.ownerId;
  delete clone.holder_id;
  delete clone.holderId;
  delete clone.placement;
  delete clone.access;
  delete clone.visibility;
  delete clone.legal_status;
  delete clone.legalStatus;
  delete clone.discoverability;
  delete clone.plausibility;
  delete clone.value;
  delete clone.value_profile;
  delete clone.risk;

  if (overrides.ownerId !== undefined) clone.owner_id = overrides.ownerId;
  if (overrides.holderId !== undefined) clone.holder_id = overrides.holderId;
  if (overrides.placement !== undefined) clone.placement = overrides.placement;
  if (overrides.access !== undefined) clone.access = overrides.access;
  if (overrides.visible !== undefined) clone.visible = overrides.visible;
  if (overrides.containerId !== undefined) clone.container_id = overrides.containerId;

  if (Array.isArray(item.contents)) {
    clone.contents = item.contents.map((child) => stripDerivedItemFields(child));
  }
  return clone;
}

function replaceItemRecord(target, next) {
  if (!target || !next || typeof target !== 'object' || typeof next !== 'object') return target;
  for (const key of Object.keys(target)) {
    delete target[key];
  }
  Object.assign(target, next);
  return target;
}

function inferAccessForMovedItem(item, op, sourceOwnerId, targetHolderId, targetPlacement) {
  if (targetPlacement === 'property') return 'not_carried';
  if (op === 'drop') return 'not_carried';
  if (sourceOwnerId && targetHolderId && sourceOwnerId !== targetHolderId) return 'borrowed';
  return item?.owner_id && item?.holder_id && item.owner_id !== item.holder_id ? 'restricted' : 'immediate';
}

function inferRiskForMovedItem(item, op, sourceOwnerId, targetHolderId, targetPlacement) {
  let risk = Number(item?.risk ?? 0);
  if (!Number.isFinite(risk)) risk = 0;
  if (sourceOwnerId && targetHolderId && sourceOwnerId !== targetHolderId) risk = Math.max(risk, 2);
  if (targetPlacement === 'property') risk = Math.max(risk, 1);
  if (op === 'steal') risk = Math.max(risk, 4);
  return Math.max(0, Math.min(5, Math.round(risk)));
}

function resolveItemId(item) {
  if (!isRecord(item)) return '';
  return String(item.id ?? '').trim();
}

function resolveItemLabel(item) {
  if (item === null || item === undefined) return '';
  if (typeof item === 'string') return item.trim();
  if (!isRecord(item)) return String(item).trim();
  return String(item.label ?? item.name ?? item.title ?? item.id ?? '').trim();
}

function findActorItem(actor, change) {
  const collections = [
    getItemCollection(actor, 'inventory'),
    getItemCollection(actor, 'property')
  ];
  for (const items of collections) {
    const found = findNestedItem(items, change);
    if (found) return found;
  }
  return null;
}

function findNestedItem(items, change) {
  for (const item of Array.isArray(items) ? items : []) {
    if (matchesItemChange(item, change)) return item;
    const nested = findNestedItem(item?.contents, change);
    if (nested) return nested;
  }
  return null;
}

function matchesItemChange(item, change) {
  const wantedId = String(change.itemId ?? '').trim();
  const wantedLabel = String(change.label ?? '').trim().toLowerCase();
  if (wantedId && resolveItemId(item) === wantedId) return true;
  const label = resolveItemLabel(item).toLowerCase();
  if (!wantedLabel || !label) return false;
  return label === wantedLabel || label.includes(wantedLabel) || wantedLabel.includes(label);
}

function resyncActorItems(world, actor) {
  if (!actor || typeof actor !== 'object') return;
  const kind = actor.id === world.player?.id || actor.id === 'player' ? 'player' : 'npc';
  const updated = syncActorStateProfile(actor, {
    kind,
    currentLocationId: world.currentLocationId,
    currentMicroLocationId: world.currentMicroLocationId ?? world.current_position?.minilocation_id ?? null,
    region_id: world.current_position?.region_id ?? null
  });
  delete actor.inventory;
  delete actor.property;
  delete actor.load_category;
  Object.assign(actor, updated);
  if (kind === 'player') {
    world.player = actor;
  }
}

function refreshPropertyLedger(world) {
  if (!world || typeof world !== 'object') return;
  world.propertyLedger = buildPropertyLedger(world.npcs ?? [], world.player ?? null, world.current_position ?? null, world);
}

function logItemChangeEvent(world, change, item, sourceActor, targetActor) {
  if (!world || typeof world !== 'object' || !item) return;

  const label = resolveItemLabel(item) || 'предмет';
  const sourceName = sourceActor?.name ?? (sourceActor?.id === 'player' ? world.player?.name : null) ?? null;
  const targetName = targetActor?.name ?? (targetActor?.id === 'player' ? world.player?.name : null) ?? null;
  const op = String(change?.op ?? 'move').trim().toLowerCase();
  const placement = String(item?.placement ?? '').trim().toLowerCase();

  let result = `${label} меняет положение.`;
  if (op === 'drop' || placement === 'property') {
    result = sourceName
      ? `${sourceName} выводит ${label} из быстрого доступа.`
      : `${label} выведен из быстрого доступа.`;
  } else if (op === 'take' || op === 'pickup') {
    result = targetName
      ? `${targetName} берёт ${label} при себе.`
      : `${label} взят при себе.`;
  } else if (op === 'transfer' || op === 'give' || op === 'move' || op === 'put') {
    if (sourceName && targetName && sourceName !== targetName) {
      result = `${targetName} получает ${label} от ${sourceName}.`;
    } else if (targetName) {
      result = `${targetName} перемещает ${label}.`;
    }
  }

  recordWorldEvent(world, {
    kind: 'property',
    source: 'item_delta',
    visibility: 'public',
    status: 'changed',
    at: { ...world.clock },
    label,
    result,
    relatedIds: [
      item?.id ?? null,
      sourceActor?.id ?? null,
      targetActor?.id ?? null
    ].filter(Boolean)
  });
}

function logItemUpdateEvent(world, item, actor, before = {}) {
  if (!world || typeof world !== 'object' || !item) return;

  const label = resolveItemLabel(item) || 'предмет';
  const actorName = actor?.name ?? (actor?.id === 'player' ? world.player?.name : null) ?? null;
  const changes = [];

  if (before.beforeCondition !== item.condition && item.condition) {
    changes.push(`состояние: ${item.condition}`);
  }
  if ((before.beforeMarks ?? []).join('|') !== (Array.isArray(item.marks) ? item.marks.join('|') : '')) {
    changes.push(`следы: ${Array.isArray(item.marks) && item.marks.length > 0 ? item.marks.join(', ') : 'убраны'}`);
  }
  if (before.beforeRisk !== item.risk && item.risk !== null && item.risk !== undefined) {
    changes.push(`риск: ${item.risk}/5`);
  }

  const result = actorName
    ? `${actorName} меняет состояние ${label}${changes.length > 0 ? ` (${changes.join('; ')})` : ''}.`
    : `Состояние ${label} изменилось${changes.length > 0 ? ` (${changes.join('; ')})` : ''}.`;

  recordWorldEvent(world, {
    kind: 'property',
    source: 'item_delta',
    visibility: 'public',
    status: 'changed',
    at: { ...world.clock },
    label,
    result,
    relatedIds: [
      item?.id ?? null,
      actor?.id ?? null
    ].filter(Boolean)
  });
}

function normalizeItemMutationList(value, defaults = {}) {
  const list = Array.isArray(value) ? value : (value ? [value] : []);
  return list.map((item) => normalizeItemMutationItem(item, defaults)).filter(Boolean);
}

function normalizeItemMutationItem(item, defaults = {}) {
  if (item === null || item === undefined) return null;
  if (typeof item === 'string') {
    const text = item.trim();
    return text ? normalizeItemRecord({ label: text }, defaults, 0) : null;
  }
  if (!isRecord(item)) return null;

  const next = structuredClone(item);
  if (next.placement === undefined || next.placement === null || next.placement === '') {
    next.placement = defaults.placement ?? 'carried';
  }
  if (next.owner_id === undefined && next.ownerId === undefined && defaults.ownerId !== undefined) {
    next.owner_id = defaults.ownerId;
  }
  if (next.holder_id === undefined && next.holderId === undefined && defaults.holderId !== undefined) {
    next.holder_id = defaults.holderId;
  }
  if (next.access === undefined && next.placement === 'carried') {
    next.access = 'immediate';
  }
  if (next.visible === undefined) {
    next.visible = true;
  }
  return next;
}

function removeItemMutationList(target, removals) {
  const list = Array.isArray(removals) ? removals : [removals];
  const removed = [];
  for (const wanted of list) {
    const index = findItemMutationIndex(target, wanted);
    if (index < 0) continue;
    removed.push(target.splice(index, 1)[0]);
  }
  return removed;
}

function findItemMutationIndex(items, wanted) {
  const exactId = mutationItemId(wanted);
  const wantedText = mutationItemText(wanted);
  if (!exactId && !wantedText) return -1;
  return (Array.isArray(items) ? items : []).findIndex((item) => {
    if (exactId && mutationItemId(item) === exactId) return true;
    const itemText = mutationItemText(item);
    if (!itemText || !wantedText) return false;
    return itemText === wantedText || itemText.includes(wantedText) || wantedText.includes(itemText);
  });
}

function mutationItemText(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim().toLowerCase();
  if (!isRecord(value)) return String(value).trim().toLowerCase();
  return String(value.label ?? value.name ?? value.title ?? value.id ?? '').trim().toLowerCase();
}

function mutationItemId(value) {
  if (!isRecord(value)) return '';
  return String(value.id ?? value.item_id ?? value.itemId ?? '').trim();
}

function isRecord(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function applyWitnessDelta(world, witnessDelta) {
  if (!witnessDelta || typeof witnessDelta !== 'object') return;
  const location = getCurrentLocation(world);
  if (!location) return;

  if (Array.isArray(witnessDelta.recent_witnesses_add)) {
    if (!Array.isArray(world.social.recentWitnesses)) world.social.recentWitnesses = [];
    for (const witness of witnessDelta.recent_witnesses_add) {
      if (typeof witness === 'string' && witness.trim()) {
        world.social.recentWitnesses.unshift(witness.trim());
      }
    }
    world.social.recentWitnesses = world.social.recentWitnesses.slice(0, 6);
  }

  if (Array.isArray(witnessDelta.location_notes_add)) {
    if (!Array.isArray(location.recentTraces)) location.recentTraces = [];
    for (const note of witnessDelta.location_notes_add) {
      if (typeof note === 'string' && note.trim()) {
        location.recentTraces.unshift({
          at: { ...world.clock },
          kind: 'witness',
          text: note.trim()
        });
      }
    }
    location.recentTraces = location.recentTraces.slice(0, 12);
  }
}

function applyLocationDelta(world, locationDelta) {
  if (!locationDelta || typeof locationDelta !== 'object') return;
  const location = getCurrentLocation(world);
  if (!location) return;
  const changes = [];

  if (Array.isArray(locationDelta.recent_traces)) {
    for (const trace of locationDelta.recent_traces) {
      if (trace && typeof trace === 'object' && typeof trace.text === 'string') {
        location.recentTraces.unshift({
          at: { ...world.clock },
          kind: typeof trace.kind === 'string' ? trace.kind : 'model',
          text: trace.text
        });
      } else if (typeof trace === 'string' && trace.trim()) {
        location.recentTraces.unshift({
          at: { ...world.clock },
          kind: 'model',
          text: trace.trim()
        });
      }
    }
    location.recentTraces = location.recentTraces.slice(0, 12);
    if (locationDelta.recent_traces.length > 0) {
      changes.push('появились новые следы');
    }
  }

  if (Array.isArray(locationDelta.periods_add)) {
    for (const period of locationDelta.periods_add) {
      appendLocationPeriod(world, location.id, period);
    }
    if (locationDelta.periods_add.length > 0) {
      changes.push('начался новый период места');
    }
  }

  if (Array.isArray(locationDelta.periods_close)) {
    for (const period of locationDelta.periods_close) {
      if (!period || typeof period !== 'object' || typeof period.id !== 'string') continue;
      closeLocationPeriod(world, location.id, period.id, period);
    }
    if (locationDelta.periods_close.length > 0) {
      changes.push('закрыт старый период места');
    }
  }

  if (changes.length > 0) {
    recordWorldEvent(world, {
      kind: 'place',
      source: 'location_delta',
      visibility: 'public',
      status: 'changed',
      at: { ...world.clock },
      label: location.name ?? location.id,
      result: `${location.name ?? 'Место'}: ${changes.join('; ')}.`,
      relatedIds: [location.id]
    });
  }
}

function applyNpcDelta(world, npcDelta) {
  if (!Array.isArray(npcDelta) || npcDelta.length === 0) return;

  for (const patch of npcDelta) {
    if (!patch || typeof patch !== 'object') continue;
    const npc = resolveNpcDeltaTarget(world, patch);
    if (!npc) continue;
    const changes = [];

    if (typeof patch.mood === 'string' && patch.mood.trim()) {
      npc.mood = patch.mood.trim();
      changes.push(`настроение: ${npc.mood}`);
    }
    if (typeof patch.location === 'string' && patch.location.trim()) {
      npc.location = patch.location.trim();
      changes.push(`занятие: ${npc.location}`);
    }
    if (typeof patch.note === 'string' && patch.note.trim()) {
      if (!Array.isArray(npc.notes)) npc.notes = [];
      npc.notes.unshift(patch.note.trim());
      npc.notes = npc.notes.slice(0, 6);
      changes.push(`новая заметка: ${patch.note.trim()}`);
    }
    if (typeof patch.profileLevel === 'string' || typeof patch.profile_level === 'string') {
      const level = normalizeNpcProfileLevel(patch.profileLevel ?? patch.profile_level);
      npc.profileLevel = level;
      if (npc.actorProfile && typeof npc.actorProfile === 'object') {
        npc.actorProfile.profileLevel = level;
      }
      changes.push(`уровень профиля: ${level}`);
    }

    if (changes.length > 0) {
      recordWorldEvent(world, {
        kind: 'npc',
        source: 'npc_delta',
        visibility: 'public',
        status: 'changed',
        at: { ...world.clock },
        label: npc.name ?? npc.id,
        result: `${npc.name ?? 'NPC'}: ${changes.join('; ')}.`,
        relatedIds: [npc.id, npc.locationId].filter(Boolean)
      });
    }
  }
}

function resolveNpcDeltaTarget(world, patch = {}) {
  if (!Array.isArray(world?.npcs) || !patch || typeof patch !== 'object') return null;

  const rawId = patch.id ?? patch.npc_id ?? patch.npcId ?? patch.handle ?? null;
  const id = typeof rawId === 'string' ? rawId.trim() : '';
  if (id) {
    const byId = world.npcs.find((item) => item?.id === id);
    if (byId) return byId;
  }

  const name = typeof patch.name === 'string' ? patch.name.trim() : '';
  if (!name) return null;
  return world.npcs.find((item) => item?.name === name) ?? null;
}

function adjust(value, delta) {
  if (typeof delta !== 'number' || Number.isNaN(delta)) return value;
  return Math.max(-20, Math.min(20, value + delta));
}
