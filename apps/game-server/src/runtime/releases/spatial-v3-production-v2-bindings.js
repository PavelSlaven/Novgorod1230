import {
  createSpatialV3ProductionBindings
} from './spatial-v3-production-binding-shared.js';
import {
  createLowerDvinaTraceNpcDecisionSelector
} from '../lower-dvina-trace-phase-2-llm.js';

export {
  firstPlayableCommitRecheck
} from './spatial-v3-production-binding-shared.js';

/**
 * Exact production-v2 binding. The technical composition remains the sole
 * internal owner; the public facade is the only adapter from HTTP requests to
 * sealed first-playable commands and persisted projections.
 */
export function createSpatialV3RuntimeBindings(context = {}) {
  return createSpatialV3ProductionBindings(context, {
    createNpcRuntimePorts: ({ roleRunner }) => ({
      npcDecisionSelector:
        createLowerDvinaTraceNpcDecisionSelector({ roleRunner })
    })
  });
}

export default createSpatialV3RuntimeBindings;
