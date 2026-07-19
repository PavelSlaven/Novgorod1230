import { createSpatialV3PortUnavailableResult } from '@rus/contracts/spatial-v3/ports';

export function createTraversalResolver() {
  return Object.freeze({ resolve: async () => createSpatialV3PortUnavailableResult('movement-routes.traversal_resolver.resolve') });
}

export function createTraversalCommitValidator() {
  return Object.freeze({ validate: async () => createSpatialV3PortUnavailableResult('movement-routes.traversal_commit_validator.validate') });
}
