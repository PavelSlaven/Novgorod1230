import { createWorldBaseReader } from '@rus/world-base';

export function createWorldBaseAdapter({ query } = {}) {
  if (typeof query !== 'function') throw new TypeError('world-base query function is required.');
  return createWorldBaseReader({ query });
}
