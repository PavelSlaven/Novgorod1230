export { STAGE15_INPUT_SCHEMA, STAGE15_DRAFT_SCHEMA, STAGE15_AUDIT_SCHEMA, STAGE15_PRECHECK_SCHEMA, STAGE15_PLACEMENT_STATUSES, STAGE15_PROFILE_LEVELS } from '@rus/contracts';

export const DEFAULT_STAGE15_NPC_PLACEMENT_POLICY = Object.freeze({
  target_visible_background_npcs_min: 0,
  target_visible_background_npcs_max: 6,
  target_scene_npcs_min: 0,
  target_scene_npcs_max: 3,
  target_key_seed_npcs_max: 1,
  allow_empty_scene_if_place_supports_it: true,
  require_anchor_supports_npc: true,
  require_anchor_visibility_match: true,
  require_time_of_day_match: true,
  require_season_match: true,
  require_place_template_match: true,
  require_social_order_match: true,
  require_reason_for_presence: true,
  require_profile_level_limits: true,
  require_name_pool_for_named_scene_or_key_npc: true,
  allow_unnamed_background_npc: true,
  require_source_trace: true,
  do_not_write_intro_prose: true,
  do_not_create_dialogue: true,
  do_not_create_items_for_npc_yet: true,
  do_not_change_g5_scene: true,
  do_not_create_hidden_event: true,
  do_not_create_new_social_roles: true,
  do_not_create_new_occupations: true,
  do_not_create_new_npc_archetypes: true
});

export const PROFILE_RANK = Object.freeze({ background: 1, scene: 2, key: 3, key_seed: 3 });

export const FORMAT_CODES = new Set([
  'NPC_PLACEMENT_INVALID_JSON',
  'NPC_PLACEMENT_SCHEMA_MISMATCH',
  'NPC_PLACEMENT_REQUIRED_BLOCK_MISSING',
  'NPC_PLACEMENT_AUDIT_SCHEMA_MISMATCH',
  'NPC_PLACEMENT_AUDIT_REQUIRED_BLOCK_MISSING'
]);

export const FORBIDDEN_OUTPUT_KEYS = new Map([
  ['item_id', 'NPC_PLACEMENT_CREATED_ITEM_TOO_EARLY'],
  ['items', 'NPC_PLACEMENT_CREATED_ITEM_TOO_EARLY'],
  ['inventory', 'NPC_PLACEMENT_CREATED_ITEM_TOO_EARLY'],
  ['npc_inventory', 'NPC_PLACEMENT_CREATED_ITEM_TOO_EARLY'],
  ['container_contents', 'NPC_PLACEMENT_CREATED_ITEM_TOO_EARLY'],
  ['dialogue', 'NPC_PLACEMENT_CREATED_DIALOGUE_TOO_EARLY'],
  ['spoken_line', 'NPC_PLACEMENT_CREATED_DIALOGUE_TOO_EARLY'],
  ['visible_scene', 'NPC_PLACEMENT_CREATED_VISIBLE_SCENE_TOO_EARLY'],
  ['intro_prose', 'NPC_PLACEMENT_CREATED_INTRO_PROSE_TOO_EARLY'],
  ['narrator_prose', 'NPC_PLACEMENT_CREATED_INTRO_PROSE_TOO_EARLY'],
  ['hidden_event', 'NPC_PLACEMENT_CREATED_HIDDEN_EVENT'],
  ['quest', 'NPC_PLACEMENT_CREATED_HIDDEN_EVENT'],
  ['modified_g5_scene', 'NPC_PLACEMENT_CHANGED_G5_SCENE'],
  ['g5_scene_graph_draft', 'NPC_PLACEMENT_CHANGED_G5_SCENE'],
  ['new_anchor', 'NPC_PLACEMENT_CHANGED_G5_SCENE'],
  ['new_edge', 'NPC_PLACEMENT_CHANGED_G5_SCENE']
]);

export function normalizeStage15NpcPlacementPolicy(policy = {}) {
  const source = policy !== null && typeof policy === 'object' && !Array.isArray(policy) ? policy : {};
  return Object.freeze({ ...DEFAULT_STAGE15_NPC_PLACEMENT_POLICY, ...source });
}
