export function isOrdinaryDiscoveryInScope({ operation, playerSafeState }) {
  if (!['inspect', 'search'].includes(operation?.discovery_kind)
      || !Array.isArray(operation.target_refs)
      || operation.target_refs.length !== 1
      || typeof operation.query !== 'string'
      || operation.query.trim().length === 0
      || !ordinaryDiscoveryAvailable(playerSafeState)) return false;
  return exactVisibleScope(playerSafeState).has(operation.target_refs[0]);
}

function ordinaryDiscoveryAvailable(playerSafeState) {
  const marker = ownPlainDataRecord(ownDataProperty(playerSafeState,
    'ordinary_resolution'), [
    'discovery_available', 'container_resolution_available'
  ]);
  return marker?.discovery_available === true
    && marker.container_resolution_available === false;
}

function exactVisibleScope(...projections) {
  const refs = new Set();
  for (const projection of projections) {
    addRef(refs, projection?.position?.location_ref);
    for (const entity of projection?.visible_entities ?? []) addRef(refs,
      entity?.entity_ref);
    for (const entity of projection?.visible_objects ?? []) addRef(refs,
      entity?.entity_ref);
  }
  return refs;
}

function addRef(refs, value) {
  if (typeof value === 'string' && value.length > 0) refs.add(value);
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
