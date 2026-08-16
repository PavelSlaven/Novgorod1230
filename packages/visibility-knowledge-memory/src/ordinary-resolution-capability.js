import { deepFreeze } from '@rus/kernel';

const MARKER = deepFreeze({
  ordinary_resolution: deepFreeze({
    discovery_available: false,
    container_resolution_available: false
  })
});

/**
 * PR1's player-safe ordinary capability is intentionally unavailable.
 * The input is accepted only to reject malformed or future-enabled state;
 * no caller can obtain a true capability through this API.
 */
export function projectPlayerSafeOrdinaryResolutionCapability(value = undefined) {
  if (value === undefined) return undefined;
  if (!isDisabledMarker(value)) {
    throw new TypeError('ORDINARY_RESOLUTION_CAPABILITY_NOT_AVAILABLE');
  }
  return deepFreeze({
    ordinary_resolution: deepFreeze({
      discovery_available: false,
      container_resolution_available: false
    })
  });
}

export function createDisabledOrdinaryResolutionCapability() {
  return MARKER;
}

function isDisabledMarker(value) {
  const marker = plainDataRecord(value);
  if (!marker || Object.keys(marker).length !== 1
    || !Object.hasOwn(marker, 'ordinary_resolution')) return false;
  const resolution = plainDataRecord(marker.ordinary_resolution);
  return Boolean(resolution) && Object.keys(resolution).length === 2
    && resolution.discovery_available === false
    && resolution.container_resolution_available === false;
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
