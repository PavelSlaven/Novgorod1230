import { createSpatialV3VisibilityResolver } from '@rus/presentation/spatial-v3-projection';
import { serverError } from '../errors.js';

const conditions = ['lighting', 'stable_cover', 'dynamic_occlusion', 'concealment', 'weather'];
const results = new Set(['clear', 'partial', 'none']);

/** Resolve committed targets by identity; several targets can share a position. */
export function visibleCurrentTargets({ observer_position_id, observer_visual_capability,
  positions, g6, visibility_links, portals, targets, modifier_set } = {}) {
  if (!Array.isArray(positions) || !Array.isArray(g6)
    || !Array.isArray(visibility_links) || !portals || !Array.isArray(targets)
    || modifier_set?.complete !== true || !Array.isArray(modifier_set.rows)
    || !positions.some((row) => row.id === observer_position_id)
    || !results.has(observer_visual_capability)
    || new Set(targets.map((row) => row.target_id)).size !== targets.length
    || targets.some((row) => typeof row.target_id !== 'string' || !row.target_id
      || !positions.some((position) => position.id === row.position_id)
      || conditions.some((key) => !results.has(row[key])))) gap();
  if (modifier_set.rows.length) gap('visibility_modifier_effect_policy_required');
  const resolver = createSpatialV3VisibilityResolver({
    positions: positions.map((row) => ({ id: row.id, g6_id: row.g6_instance_id })),
    g6, links: visibility_links.map((row) => ({
      from_position_id: row.from_position_id, to_position_id: row.to_position_id,
      base_result: row.quality, portal_id: row.portal_entity_id })), portals });
  return targets.flatMap((row) => {
    const result = resolver.resolve({ from_position_id: observer_position_id,
      to_position_id: row.position_id,
      ...Object.fromEntries(conditions.map((key) => [key, row[key]])) }).visibility;
    const visibility = observer_visual_capability === 'none' || result === 'none' ? 'none'
      : observer_visual_capability === 'partial' || result === 'partial' ? 'partial' : 'clear';
    return visibility === 'none' ? [] : [{ target_id: row.target_id, visibility }];
  });
}

function gap(reason = 'complete_current_visibility_required') { throw serverError('SPATIAL_V3_VISIBILITY_DATA_GAP',
  'Complete committed visibility conditions are required.', { status: 409, details: { reason } }); }
