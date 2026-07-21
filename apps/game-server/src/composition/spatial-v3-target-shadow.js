import { createSpatialV3TargetShadowComposition } from '@rus/turn/spatial-v3-target-composition';

/**
 * Deliberately separate from production.js. P28 is the only authority that may
 * replace the active v2 composition; this factory is for target/shadow tests.
 */
export function createSpatialV3TargetShadowCompositionRoot(ports = {}) {
  const root = createSpatialV3TargetShadowComposition(ports);
  return Object.freeze({
    ...root,
    health: () => Object.freeze({ status: 'ok', composition: 'spatial_v3_target_shadow', activation: 'not_authorized' })
  });
}
