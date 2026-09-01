export function isActionProductionOwnerInScope({
  operation, playerSafeState, remainingIntent
}) {
  const operationKeys = [
    'op', 'actor_ref', 'item_ref', 'use_kind', 'target_refs'
  ];
  if (ownDataProperty(operation, 'action_production') !== undefined) {
    operationKeys.push('action_production');
  }
  const itemUse = ownPlainDataRecord(operation, operationKeys);
  if (itemUse == null || itemUse.op !== 'request_item_use'
      || itemUse.use_kind !== 'other'
      || !canonicalText(itemUse.item_ref)
      || !canonicalText(remainingIntent)) {
    return false;
  }
  const targetRefs = ownCanonicalRefArray(itemUse.target_refs);
  if (targetRefs == null) return false;
  const marker = ownPlainDataRecord(
    ownDataProperty(playerSafeState, 'action_production'),
    ['semantic_grounding_available', 'max_new_entities',
      'allowed_identity_modes',
      'allowed_origins', 'allowed_result_classes', 'allowed_output_classes',
      'allowed_physical_forms']
  );
  if (marker?.semantic_grounding_available !== true
      || !Number.isSafeInteger(marker.max_new_entities)
      || marker.max_new_entities < 1 || marker.max_new_entities > 8) {
    return false;
  }
  const visibleObjects = visibleItemRefs(playerSafeState);
  const playerSafeItems = exactPlayerSafeItemRefs(playerSafeState);
  const actorHeldItems = exactActorHeldItemRefs(playerSafeState);
  if (!visibleObjects.has(itemUse.item_ref)
      && !playerSafeItems.has(itemUse.item_ref)
      && !actorHeldItems.has(itemUse.item_ref)) return false;
  const visibleTargets = new Set([
    ...visibleObjects,
    ...exactVisibleRefs(playerSafeState, 'visible_entities')
  ]);
  return targetRefs.every((ref) => visibleTargets.has(ref));
}

function visibleItemRefs(state) {
  const refs = exactVisibleRefs(state, 'visible_objects', {
    requireItemKind: true
  });
  for (const key of ['current_visible_context', 'visible_context',
    'visible_context_package']) {
    for (const ref of exactVisibleRefs(ownDataProperty(state, key),
      'visible_objects', { requireItemKind: true })) refs.add(ref);
  }
  return refs;
}

function exactActorHeldItemRefs(playerSafeState) {
  const actorId = ownDataProperty(playerSafeState, 'actor_id');
  const items = ownDataArray(ownDataProperty(playerSafeState, 'items'));
  if (!canonicalText(actorId) || items == null) return new Set();
  const refs = new Set();
  for (const value of items) {
    const item = ownPlainDataObject(value);
    const placement = item && ownPlainDataObject(
      ownDataProperty(item, 'placement'));
    const itemId = item && ownCanonicalItemId(item);
    if (canonicalText(itemId) && placement != null
        && ownDataProperty(placement, 'holder_character_id') === actorId) {
      refs.add(itemId);
    }
  }
  return refs;
}

function exactPlayerSafeItemRefs(playerSafeState) {
  const inventory = ownPlainDataObject(
    ownDataProperty(playerSafeState, 'inventory'));
  const items = inventory && ownPlayerSafeItemRefArray(
    ownDataProperty(inventory, 'items'));
  return new Set(items ?? []);
}

function ownPlayerSafeItemRefArray(value) {
  const values = ownDataArray(value);
  if (values == null) return null;
  const refs = [];
  const unique = new Set();
  for (const value of values) {
    const ref = canonicalText(value) ? value : ownCanonicalItemId(value);
    if (!canonicalText(ref) || unique.has(ref)) return null;
    refs.push(ref);
    unique.add(ref);
  }
  return refs;
}

function ownCanonicalItemId(value) {
  const item = ownPlainDataObject(value);
  const itemId = item && ownDataProperty(item, 'item_id');
  return canonicalText(itemId) ? itemId : null;
}

function ownCanonicalRefArray(value) {
  if (!Array.isArray(value)
      || Object.getPrototypeOf(value) !== Array.prototype
      || Object.getOwnPropertySymbols(value).length !== 0) return null;
  const lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length');
  if (lengthDescriptor == null || !Object.hasOwn(lengthDescriptor, 'value')) {
    return null;
  }
  const length = lengthDescriptor.value;
  const names = Object.getOwnPropertyNames(value);
  if (names.length !== length + 1) return null;
  const refs = [];
  const unique = new Set();
  for (let index = 0; index < length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (descriptor == null || descriptor.enumerable !== true
        || !Object.hasOwn(descriptor, 'value')
        || !canonicalText(descriptor.value)
        || unique.has(descriptor.value)) return null;
    refs.push(descriptor.value);
    unique.add(descriptor.value);
  }
  return refs;
}

function exactVisibleRefs(playerSafeState, key, {
  requireItemKind = false
} = {}) {
  const refs = new Set();
  const values = ownDataArray(ownDataProperty(playerSafeState, key));
  if (values == null) return refs;
  for (const entry of values) {
    const entityRef = ownDataProperty(entry, 'entity_ref');
    if (canonicalText(entityRef)) {
      if (!requireItemKind) refs.add(entityRef);
      continue;
    }
    const identity = ownPlainDataRecord(entityRef, [
      'entity_kind', 'entity_id'
    ]);
    if (identity == null || !canonicalText(identity.entity_id)
        || (requireItemKind && identity.entity_kind !== 'item')) continue;
    refs.add(identity.entity_id);
  }
  return refs;
}

function ownPlainDataRecord(value, keys) {
  if (value == null || typeof value !== 'object' || Array.isArray(value)
      || (Object.getPrototypeOf(value) !== Object.prototype
        && Object.getPrototypeOf(value) !== null)
      || Object.getOwnPropertySymbols(value).length !== 0) return null;
  const names = Object.getOwnPropertyNames(value);
  if (names.length !== keys.length
      || !keys.every((key) => names.includes(key))) return null;
  const output = {};
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor == null || descriptor.enumerable !== true
        || !Object.hasOwn(descriptor, 'value')) return null;
    output[key] = descriptor.value;
  }
  return output;
}

function ownPlainDataObject(value) {
  if (value == null || typeof value !== 'object' || Array.isArray(value)
      || (Object.getPrototypeOf(value) !== Object.prototype
        && Object.getPrototypeOf(value) !== null)
      || Object.getOwnPropertySymbols(value).length !== 0) return null;
  return Object.getOwnPropertyNames(value).every((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor?.enumerable === true && Object.hasOwn(descriptor, 'value');
  }) ? value : null;
}

function ownDataProperty(value, key) {
  if (value == null || typeof value !== 'object') return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor?.enumerable === true && Object.hasOwn(descriptor, 'value')
    ? descriptor.value : undefined;
}

function ownDataArray(value) {
  if (!Array.isArray(value)
      || Object.getPrototypeOf(value) !== Array.prototype
      || Object.getOwnPropertySymbols(value).length !== 0) return null;
  const lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length');
  if (lengthDescriptor == null || !Object.hasOwn(lengthDescriptor, 'value')) {
    return null;
  }
  const values = [];
  for (let index = 0; index < lengthDescriptor.value; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (descriptor == null || descriptor.enumerable !== true
        || !Object.hasOwn(descriptor, 'value')) return null;
    values.push(descriptor.value);
  }
  if (Object.getOwnPropertyNames(value).length !== values.length + 1) {
    return null;
  }
  return values;
}

function canonicalText(value) {
  return typeof value === 'string' && value.length > 0
    && value.trim() === value
    && !/[\u0000-\u001f\u007f]/u.test(value);
}
