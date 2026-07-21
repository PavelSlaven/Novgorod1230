import { createSpatialV3PortUnavailableResult } from '@rus/contracts/spatial-v3/ports';
import { createMovementPlanner, createRoutePlanActivationValidator } from './spatial-v3.js';

export function createTraversalResolver(dependencies = {}) {
  if (typeof dependencies.loadTopology !== 'function' || typeof dependencies.snapshotEndpoint !== 'function' || typeof dependencies.validateCapability !== 'function') return unavailableResolver();
  return createMovementPlanner(dependencies);
}

export function createTraversalCommitValidator(dependencies = {}) {
  if (typeof dependencies.loadCurrentState !== 'function' || typeof dependencies.validateCapability !== 'function' || typeof dependencies.recheckActivation !== 'function') return unavailableCommitValidator();
  const validator = createRoutePlanActivationValidator(dependencies);
  return Object.freeze({ validate: validator.activate });
}

function unavailableResolver() { return Object.freeze({ resolve: async () => createSpatialV3PortUnavailableResult('movement-routes.traversal_resolver.resolve') }); }
function unavailableCommitValidator() { return Object.freeze({ validate: async () => createSpatialV3PortUnavailableResult('movement-routes.traversal_commit_validator.validate') }); }
