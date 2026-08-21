import { deepFreeze } from '@rus/kernel';

const MARKER = deepFreeze({
  ordinary_resolution: deepFreeze({
    discovery_available: false,
    container_resolution_available: false
  })
});

export function projectPlayerSafeOrdinaryResolutionCapability(value = undefined) {
  if (value === undefined) return undefined;
  const marker = exactMarker(value);
  if (marker == null) {
    throw new TypeError('ORDINARY_RESOLUTION_CAPABILITY_NOT_AVAILABLE');
  }
  return deepFreeze(structuredClone(marker));
}

export function createDisabledOrdinaryResolutionCapability() {
  return MARKER;
}

function exactMarker(value) {
  const marker = plainDataRecord(value);
  if (!marker || Object.keys(marker).length !== 1
    || !Object.hasOwn(marker, 'ordinary_resolution')) return null;
  const resolution = plainDataRecord(marker.ordinary_resolution);
  if (!resolution || Object.keys(resolution).length !== 2
      || typeof resolution.discovery_available !== 'boolean'
      || resolution.container_resolution_available !== false) return null;
  return { ordinary_resolution: resolution };
}

function plainDataRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)
    || Object.getOwnPropertySymbols(value).length !== 0) return null;
  const names = Object.getOwnPropertyNames(value);
  const fields = {};
  for (const name of names) {
    const descriptor = Object.getOwnPropertyDescriptor(value, name);
    if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) return null;
    fields[name] = descriptor.value;
  }
  return fields;
}
