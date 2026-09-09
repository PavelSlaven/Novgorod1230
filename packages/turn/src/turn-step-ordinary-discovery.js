export function isOrdinaryDiscoveryInScope({ operation, playerSafeState }) {
  const capability = ordinaryResolutionCapability(playerSafeState);
  const supportedKind = ['inspect', 'search'].includes(operation?.discovery_kind)
    ? capability?.discovery_available === true
    : operation?.discovery_kind === 'look'
      && capability?.scene_seed_available === true;
  if (!supportedKind
      || !Array.isArray(operation.target_refs)
      || operation.target_refs.length !== 1
      || typeof operation.query !== 'string'
      || operation.query.trim().length === 0
      || capability == null) return false;
  return isCurrentVisibleDiscoveryRef(playerSafeState, operation.target_refs[0]);
}

export function isCurrentVisibleDiscoveryRef(playerSafeState, targetRef) {
  return exactVisibleScope(playerSafeState).has(targetRef);
}

function ordinaryResolutionCapability(playerSafeState) {
  const marker = ownPlainDataRecord(ownDataProperty(playerSafeState,
    'ordinary_resolution'), [
    'discovery_available', 'container_resolution_available',
    'scene_seed_available'
  ]);
  return marker?.container_resolution_available === false
    && typeof marker.discovery_available === 'boolean'
    && typeof marker.scene_seed_available === 'boolean' ? marker : null;
}

function exactVisibleScope(...projections) {
  const refs = new Set();
  for (const projection of projections) {
    addRef(refs, projection?.position?.location_ref);
    const spatial = ownPlainDataRecord(ownDataProperty(projection,
      'spatial_semantic'), ['semantic_grounding_available', 'position_ref']);
    if (spatial?.semantic_grounding_available === true) {
      addRef(refs, spatial.position_ref);
    }
    for (const entity of projection?.visible_entities ?? []) addRef(refs,
      entity?.entity_ref);
    for (const entity of projection?.visible_objects ?? []) addRef(refs,
      entity?.entity_ref);
    for (const entity of projection?.current_visible_context?.visible_objects
      ?? []) addRef(refs, entity?.entity_ref);
  }
  return refs;
}

function addRef(refs, value) {
  const ref = typeof value === 'string' ? value : value?.entity_id;
  if (typeof ref === 'string' && ref.length > 0) refs.add(ref);
}

function ownPlainDataRecord(value, keys) {
  if (value == null || typeof value !== 'object' || Array.isArray(value)
      || (Object.getPrototypeOf(value) !== Object.prototype
        && Object.getPrototypeOf(value) !== null)
      || Object.getOwnPropertySymbols(value).length !== 0) return null;
  const names = Object.getOwnPropertyNames(value);
  if (names.length !== keys.length || !keys.every((key) => names.includes(key))) {
    return null;
  }
  const output = {};
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor == null || descriptor.enumerable !== true
        || !Object.hasOwn(descriptor, 'value')) return null;
    output[key] = descriptor.value;
  }
  return output;
}

function ownDataProperty(value, key) {
  if (value == null || typeof value !== 'object') return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor?.enumerable === true && Object.hasOwn(descriptor, 'value')
    ? descriptor.value : undefined;
}
