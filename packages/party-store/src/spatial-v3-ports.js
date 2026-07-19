import { createSpatialV3PortUnavailableResult } from '@rus/contracts/spatial-v3/ports';
import { createSpatialV3PartyRepository } from './spatial-v3-repository.js';

export function createSpatialV3Repository(options = null) {
  return options?.transaction ? createSpatialV3PartyRepository(options) : Object.freeze({ read: async () => createSpatialV3PortUnavailableResult('party-store.spatial_repository.read') });
}

export function createCombinedWritePlanCommitter(options = null) {
  if (typeof options?.committer?.commit === 'function') return Object.freeze({ commit: options.committer.commit.bind(options.committer) });
  return Object.freeze({ commit: async () => createSpatialV3PortUnavailableResult('party-store.combined_write_plan_committer.commit') });
}
