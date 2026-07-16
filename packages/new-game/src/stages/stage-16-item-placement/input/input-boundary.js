import { STAGE16_INPUT_SCHEMA } from '@rus/contracts';
import { DEFAULT_STAGE16_ITEM_PLACEMENT_POLICY, normalizeStage16ItemPlacementPolicy } from '../policy/constants.js';
import { concern, dedupeConcerns, isObject, requirePass } from '../shared/utils.js';

export function buildStage16ItemPlacementInput(context, options = {}) {
  const explicit = isObject(options) ? options : {};
  return {
    version: 1,
    schema: STAGE16_INPUT_SCHEMA,
    request_id: explicit.request_id ?? context?.requestId ?? null,
    historical_frame: explicit.historical_frame ?? context?.getStageOutput?.(3) ?? null,
    selected_start_node: explicit.selected_start_node ?? context?.getStageOutput?.(9) ?? null,
    start_place_audit: explicit.start_place_audit ?? context?.getStageOutput?.(10) ?? null,
    player_character: explicit.player_character
      ?? context?.getStageOutput?.(1101)
      ?? context?.getStageOutput?.(11)
      ?? null,
    player_character_audit: explicit.player_character_audit ?? context?.getStageOutput?.(12) ?? null,
    g5_scene_graph: explicit.g5_scene_graph
      ?? explicit.g5_scene_graph_draft
      ?? context?.getStageOutput?.(13)
      ?? null,
    g5_scene_audit: explicit.g5_scene_audit ?? context?.getStageOutput?.(14) ?? null,
    initial_npc_placement: explicit.initial_npc_placement ?? context?.getStageOutput?.(15) ?? null,
    npc_placement_audit: explicit.npc_placement_audit ?? context?.getStageOutput?.(1502) ?? null,
    item_profile_candidate_set: explicit.item_profile_candidate_set ?? context?.getStageOutput?.(8) ?? null,
    item_placement_policy: normalizeStage16ItemPlacementPolicy(
      explicit.item_placement_policy ?? explicit.policy ?? {}
    )
  };
}

export function validateStage16ItemPlacementInput(input) {
  const concerns = [];
  if (!isObject(input)) return [concern('ITEM_PLACEMENT_INVALID_JSON', 'Stage 16 input must be an object.')];
  if (input.version !== 1 || input.schema !== STAGE16_INPUT_SCHEMA) {
    concerns.push(concern('ITEM_PLACEMENT_SCHEMA_MISMATCH', `Expected ${STAGE16_INPUT_SCHEMA} version 1.`));
  }
  requirePass(concerns, input.start_place_audit, 'start_place_audit', 'ITEM_PLACEMENT_START_PLACE_AUDIT_FAILED');
  requirePass(concerns, input.player_character_audit, 'player_character_audit', 'ITEM_PLACEMENT_PLAYER_AUDIT_FAILED');
  if (input.player_character?.schema !== 'player_character_game_profile') {
    concerns.push(concern('ITEM_PLACEMENT_PLAYER_PROFILE_INVALID', 'player_character must be player_character_game_profile.', { field: 'player_character.schema' }));
  }
  if (input.g5_scene_graph?.schema !== 'g5_scene_graph_draft' || input.g5_scene_graph?.materialization_status !== 'materialized') {
    concerns.push(concern('ITEM_PLACEMENT_G5_SCENE_NOT_MATERIALIZED', 'g5_scene_graph must be a materialized g5_scene_graph_draft.', { field: 'g5_scene_graph' }));
  }
  if (input.g5_scene_audit?.schema !== 'g5_scene_audit' || input.g5_scene_audit?.pass !== true) {
    concerns.push(concern('ITEM_PLACEMENT_G5_AUDIT_FAILED', 'g5_scene_audit must pass.', { field: 'g5_scene_audit' }));
  }
  if (input.g5_scene_audit?.commit_permission?.can_continue_to_item_placement !== true) {
    concerns.push(concern('ITEM_PLACEMENT_G5_PERMISSION_DENIED', 'Stage 14 did not permit item placement.', { field: 'g5_scene_audit.commit_permission.can_continue_to_item_placement' }));
  }
  if (input.initial_npc_placement?.schema !== 'initial_npc_placement_draft'
    || !['placed', 'empty_allowed'].includes(input.initial_npc_placement?.placement_status)) {
    concerns.push(concern('ITEM_PLACEMENT_NPC_PLACEMENT_INVALID', 'initial_npc_placement must be placed or empty_allowed.', { field: 'initial_npc_placement' }));
  }
  if (input.npc_placement_audit?.schema !== 'initial_npc_placement_audit' || input.npc_placement_audit?.pass !== true) {
    concerns.push(concern('ITEM_PLACEMENT_NPC_AUDIT_FAILED', 'npc_placement_audit must pass.', { field: 'npc_placement_audit' }));
  }
  if (input.npc_placement_audit?.commit_permission?.can_continue_to_item_placement !== true) {
    concerns.push(concern('ITEM_PLACEMENT_NPC_PERMISSION_DENIED', 'Stage 15 did not permit item placement.', { field: 'npc_placement_audit.commit_permission.can_continue_to_item_placement' }));
  }
  const candidateSet = input.item_profile_candidate_set;
  if (candidateSet?.schema !== 'item_profile_candidate_set' || candidateSet?.selection_status !== 'ready') {
    concerns.push(concern('ITEM_PLACEMENT_CANDIDATE_SET_NOT_READY', 'item_profile_candidate_set must have selection_status=ready.', { field: 'item_profile_candidate_set' }));
  }
  for (const field of ['item_profile_candidates', 'container_profile_candidates', 'property_rule_candidates', 'quantity_requirements', 'equipment_candidates']) {
    if (!Array.isArray(candidateSet?.[field])) {
      concerns.push(concern('ITEM_PLACEMENT_REQUIRED_BLOCK_MISSING', `${field} must be an array.`, { field: `item_profile_candidate_set.${field}` }));
    }
  }
  if (!Array.isArray(input.g5_scene_graph?.g5_anchors)) {
    concerns.push(concern('ITEM_PLACEMENT_REQUIRED_BLOCK_MISSING', 'g5_scene_graph.g5_anchors must be an array.', { field: 'g5_scene_graph.g5_anchors' }));
  }
  if (!isObject(input.item_placement_policy)) {
    concerns.push(concern('ITEM_PLACEMENT_REQUIRED_BLOCK_MISSING', 'item_placement_policy is required.', { field: 'item_placement_policy' }));
  } else {
    for (const key of Object.keys(DEFAULT_STAGE16_ITEM_PLACEMENT_POLICY)) {
      if (!Object.prototype.hasOwnProperty.call(input.item_placement_policy, key)) {
        concerns.push(concern('ITEM_PLACEMENT_REQUIRED_BLOCK_MISSING', `item_placement_policy.${key} is required.`, { field: `item_placement_policy.${key}` }));
      }
    }
  }
  return dedupeConcerns(concerns);
}
