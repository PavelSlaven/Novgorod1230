import { createSpatialV3PortUnavailableResult } from '@rus/contracts/spatial-v3/ports';

export function createSpatialContextLoader() {
  return Object.freeze({ load: async () => createSpatialV3PortUnavailableResult('space-map.context_loader.load') });
}

export function createSpatialTopologyRepository() {
  return Object.freeze({ read: async () => createSpatialV3PortUnavailableResult('space-map.topology_repository.read') });
}
