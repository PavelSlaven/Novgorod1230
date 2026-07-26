import {
  createSpatialV3RuntimeBindings as createParentBindings
} from './spatial-v3-production-v2-bindings.js';

export {
  firstPlayableCommitRecheck
} from '../../infrastructure/postgres/first-playable/recheck.js';

/**
 * Exact production-v3 binding for the approved Lower Dvina boundary
 * capability. The parent facade remains the single public adapter, while this
 * module seals the release identity and forbids accidental v2 fallback.
 */
export async function createSpatialV3RuntimeBindings(context = {}) {
  if (context.release?.release_id !== 'spatial-v3-production-v3'
      || context.release?.boundary_crossing_capability
        !== 'ready_for_runtime_acceptance') {
    throw new TypeError(
      'exact spatial-v3-production-v3 boundary release is required'
    );
  }
  return createParentBindings(context);
}

export default createSpatialV3RuntimeBindings;
