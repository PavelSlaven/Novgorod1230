import { STAGE15_INPUT_SCHEMA } from '@rus/contracts';
import { normalizeStage15NpcPlacementPolicy } from '../policy/constants.js';
import { concern, isObject, requirePass } from '../shared/utils.js';

export function buildStage15NpcPlacementInput(context, options = {}) {
  const explicit = isObject(options) ? options : {};
  const g5SceneGraph = explicit.g5_scene_graph
    ?? explicit.g5_scene_graph_draft
    ?? context?.getStageOutput?.(13)
    ?? null;
  const g5SceneAudit = explicit.g5_scene_audit
    ?? context?.getStageOutput?.(14)
    ?? null;

  return {
    version: 1,
    schema: STAGE15_INPUT_SCHEMA,
    request_id: explicit.request_id ?? context?.requestId ?? null,
    historical_frame: explicit.historical_frame ?? context?.getStageOutput?.(3) ?? null,
    selected_start_node: explicit.selected_start_node ?? context?.getStageOutput?.(9) ?? null,
    start_place_audit: explicit.start_place_audit ?? context?.getStageOutput?.(10) ?? null,
    player_character: explicit.player_character
      ?? context?.getStageOutput?.(1101)
      ?? context?.getStageOutput?.(11)
      ?? null,
    player_character_audit: explicit.player_character_audit ?? context?.getStageOutput?.(12) ?? null,
    g5_scene_graph: g5SceneGraph,
    g5_scene_audit: g5SceneAudit,
    npc_candidate_set: explicit.npc_candidate_set ?? context?.getStageOutput?.(7) ?? null,
    item_profile_candidate_set: explicit.item_profile_candidate_set ?? context?.getStageOutput?.(8) ?? null,
    npc_placement_policy: normalizeStage15NpcPlacementPolicy(
      explicit.npc_placement_policy ?? explicit.policy ?? {}
    )
  };
}

export function validateStage15NpcPlacementInput(input) {
  const concerns = [];
  if (!isObject(input)) return [concern('NPC_PLACEMENT_INVALID_JSON', 'Stage 15 input must be an object.')];
  if (input.version !== 1 || input.schema !== STAGE15_INPUT_SCHEMA) {
    concerns.push(concern('NPC_PLACEMENT_SCHEMA_MISMATCH', `Expected ${STAGE15_INPUT_SCHEMA} version 1.`));
  }
  requirePass(concerns, input.start_place_audit, 'start_place_audit', 'NPC_PLACEMENT_START_PLACE_AUDIT_FAILED');
  requirePass(concerns, input.player_character_audit, 'player_character_audit', 'NPC_PLACEMENT_PLAYER_AUDIT_FAILED');
  if (input.player_character?.schema !== 'player_character_game_profile') {
    concerns.push(concern('NPC_PLACEMENT_PLAYER_PROFILE_INVALID', 'player_character must be a shaped player_character_game_profile.', { field: 'player_character.schema' }));
  }
  if (input.g5_scene_graph?.schema !== 'g5_scene_graph_draft' || input.g5_scene_graph?.materialization_status !== 'materialized') {
    concerns.push(concern('NPC_PLACEMENT_G5_SCENE_NOT_MATERIALIZED', 'g5_scene_graph must be a materialized g5_scene_graph_draft.', { field: 'g5_scene_graph' }));
  }
  if (input.g5_scene_audit?.schema !== 'g5_scene_audit' || input.g5_scene_audit?.pass !== true) {
    concerns.push(concern('NPC_PLACEMENT_G5_AUDIT_FAILED', 'g5_scene_audit must pass.', { field: 'g5_scene_audit' }));
  }
  if (input.g5_scene_audit?.commit_permission?.can_continue_to_npc_placement !== true) {
    concerns.push(concern('NPC_PLACEMENT_G5_PERMISSION_DENIED', 'Stage 14 did not permit NPC placement.', { field: 'g5_scene_audit.commit_permission.can_continue_to_npc_placement' }));
  }
  if (input.npc_candidate_set?.schema !== 'npc_candidate_set' || input.npc_candidate_set?.selection_status !== 'ready') {
    concerns.push(concern('NPC_PLACEMENT_CANDIDATE_SET_NOT_READY', 'npc_candidate_set must have selection_status=ready.', { field: 'npc_candidate_set' }));
  }
  if (!Array.isArray(input.npc_candidate_set?.npc_candidates)) {
    concerns.push(concern('NPC_PLACEMENT_REQUIRED_BLOCK_MISSING', 'npc_candidate_set.npc_candidates must be an array.', { field: 'npc_candidate_set.npc_candidates' }));
  }
  if (!Array.isArray(input.g5_scene_graph?.g5_anchors)) {
    concerns.push(concern('NPC_PLACEMENT_REQUIRED_BLOCK_MISSING', 'g5_scene_graph.g5_anchors must be an array.', { field: 'g5_scene_graph.g5_anchors' }));
  }
  if (!isObject(input.npc_placement_policy)) {
    concerns.push(concern('NPC_PLACEMENT_REQUIRED_BLOCK_MISSING', 'npc_placement_policy is required.', { field: 'npc_placement_policy' }));
  }
  return concerns;
}
