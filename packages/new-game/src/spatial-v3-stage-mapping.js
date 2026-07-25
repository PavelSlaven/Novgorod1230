/**
 * P21 target/shadow trace.  This is deliberately data-only: the active
 * MODULAR_NEW_GAME_STAGE_PLAN continues to execute v2 until the versioned
 * production activation cutover; historical P28 evidence changed no composition.
 */
export const SPATIAL_V3_NEW_GAME_STAGE_MAPPING = Object.freeze({
  schema: 'spatial_v3.new_game_stage_mapping.v1',
  status: 'target_shadow_only',
  replaces: Object.freeze({
    active_stage_id: 13,
    active_contract: 'stage13_g5_scene_graph_draft_v2',
    target_contract: 'canonical_party_g5_start_snapshot',
    required_outputs: Object.freeze(['canonical_party_g5_projection', 'start_scene_baseline', 'start_position_binding', 'prepared_start', 'party_runtime_v3_start_write_plan']),
    persistence_schema_version: 3
  }),
  retained_boundaries: Object.freeze([
    Object.freeze({ active_stage_id: 24, active_contract: 'party_runtime_v2_write_plan', target_status: 'retired_from_target_flow', prohibition: 'no_v2_write_or_dual_write' }),
    Object.freeze({ active_stage_id: 25, active_contract: 'party_runtime_v2_commit', target_status: 'retired_from_target_flow', prohibition: 'no_v2_commit_or_fallback' })
  ])
});

export function assertSpatialV3TargetStageMapping(activeStages) {
  const ids = Array.isArray(activeStages) ? activeStages.map((stage) => stage?.id) : [];
  if (JSON.stringify(ids) !== JSON.stringify(Array.from({ length: 25 }, (_, index) => index + 2))) {
    throw new Error('P21 target mapping does not permit altering the active v2 Stage 2-26 plan before the versioned production activation cutover.');
  }
  return SPATIAL_V3_NEW_GAME_STAGE_MAPPING;
}
