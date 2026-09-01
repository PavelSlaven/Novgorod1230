export function projectLowerDvinaTraceA1Capability({
  playerSafeState, loadedProfile, resolverAvailable
}) {
  const profile = loadedProfile?.profile;
  if (profile?.status !== 'approved' || resolverAvailable !== true
      || ![...playerSafeInventoryItemRefs(playerSafeState),
        ...playerSafeActorHeldItemRefs(playerSafeState),
        ...visibleObjects(playerSafeState).map(
          ({ entity_ref: ref }) => ref?.entity_kind === 'item'
            ? ref.entity_id : null)].some(text)) {
    return playerSafeState;
  }
  return {
    ...playerSafeState,
    action_production: {
      semantic_grounding_available: true,
      max_new_entities: profile.max_new_entities,
      allowed_identity_modes: structuredClone(profile.allowed_identity_modes),
      allowed_origins: structuredClone(profile.allowed_origins),
      allowed_result_classes: structuredClone(profile.allowed_result_classes),
      allowed_output_classes: structuredClone(profile.allowed_output_classes),
      allowed_physical_forms: ['compact', 'regular', 'long', 'bulky']
    }
  };
}

function visibleObjects(state) {
  return ['visible_objects', 'current_visible_context', 'visible_context',
    'visible_context_package'].flatMap((key) => key === 'visible_objects'
    ? state[key] ?? [] : state[key]?.visible_objects ?? []);
}

function playerSafeActorHeldItemRefs(playerSafeState) {
  const actorId = ownDataProperty(playerSafeState, 'actor_id');
  const items = ownDataArray(ownDataProperty(playerSafeState, 'items'));
  if (!text(actorId) || items == null) return [];
  const refs = [];
  for (const value of items) {
    const item = ownPlainDataObject(value);
    const placement = item && ownPlainDataObject(
      ownDataProperty(item, 'placement'));
    const itemId = item && ownCanonicalItemId(item);
    if (text(itemId) && placement != null
        && ownDataProperty(placement, 'holder_character_id') === actorId) {
      refs.push(itemId);
    }
  }
  return refs;
}

function playerSafeInventoryItemRefs(playerSafeState) {
  const inventory = ownPlainDataObject(
    ownDataProperty(playerSafeState, 'inventory'));
  const items = inventory && ownDataArray(ownDataProperty(inventory, 'items'));
  if (items == null) return [];
  const refs = [];
  for (const item of items) {
    const ref = text(item) ? item : ownCanonicalItemId(item);
    if (!text(ref)) return [];
    refs.push(ref);
  }
  return refs;
}

function ownCanonicalItemId(value) {
  const item = ownPlainDataObject(value);
  const itemId = item && ownDataProperty(item, 'item_id');
  return text(itemId) ? itemId : null;
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
  const length = Object.getOwnPropertyDescriptor(value, 'length')?.value;
  if (!Number.isSafeInteger(length) || length < 0) return null;
  const values = [];
  for (let index = 0; index < length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (descriptor?.enumerable !== true || !Object.hasOwn(descriptor, 'value')) {
      return null;
    }
    values.push(descriptor.value);
  }
  return Object.getOwnPropertyNames(value).length === values.length + 1
    ? values : null;
}

function text(value) {
  return typeof value === 'string' && value.length > 0
    && value.trim() === value;
}
