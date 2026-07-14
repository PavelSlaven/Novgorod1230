export { STAGE16_INPUT_SCHEMA, STAGE16_DRAFT_SCHEMA, STAGE16_PRECHECK_SCHEMA, STAGE16_AUDIT_SCHEMA, STAGE16_PLACEMENT_STATUSES, STAGE16_CAUSAL_BASIS_TYPES } from '@rus/contracts';
import { isObject } from '../shared/utils.js';

export const DEFAULT_STAGE16_ITEM_PLACEMENT_POLICY = Object.freeze({
  target_visible_items_min: 0,
  target_visible_items_max: 12,
  target_interactable_items_min: 0,
  target_interactable_items_max: 6,
  target_containers_max: 6,
  allow_empty_item_scene_if_place_supports_it: true,
  require_item_profile_candidate: true,
  require_anchor_supports_item_or_container: true,
  require_property_rule_for_interactable_item: true,
  require_owner_or_holder_model: true,
  require_visibility_model: true,
  require_access_model: true,
  require_weight_size_condition: true,
  require_causal_basis: true,
  require_source_trace: true,
  do_not_create_items_from_player_desire: true,
  do_not_reveal_hidden_items: true,
  do_not_fill_closed_containers_without_causal_basis: true,
  do_not_duplicate_player_inventory: true,
  do_not_create_new_npcs: true,
  do_not_change_g5_scene: true,
  do_not_create_hidden_event: true,
  do_not_write_intro_prose: true,
  do_not_write_visible_scene: true
});

export const FORMAT_CODES = new Set([
  'ITEM_PLACEMENT_INVALID_JSON',
  'ITEM_PLACEMENT_SCHEMA_MISMATCH',
  'ITEM_PLACEMENT_REQUIRED_BLOCK_MISSING',
  'ITEM_PLACEMENT_AUDIT_SCHEMA_MISMATCH',
  'ITEM_PLACEMENT_AUDIT_REQUIRED_BLOCK_MISSING'
]);

export const RISK_REQUIRED_RARITIES = new Set(['rare', 'very_rare', 'restricted', 'unique']);

export const RISK_REQUIRED_VALUE_BANDS = new Set(['valuable', 'expensive', 'high', 'very_high', 'luxury']);

export const RISK_REQUIRED_GROUPS = new Set(['weapon', 'service', 'authority', 'sacred', 'restricted']);

export const CLOSED_CONTAINER_STATES = new Set(['closed', 'locked', 'sealed', 'hidden', 'inaccessible']);

export const HIDDEN_VISIBILITY_STATES = new Set(['hidden', 'known_but_not_seen', 'inaccessible']);

export const FORBIDDEN_OUTPUT_KEYS = new Map([
  ['new_npc', 'ITEM_PLACEMENT_CREATED_NPC'],
  ['new_npcs', 'ITEM_PLACEMENT_CREATED_NPC'],
  ['npc_instances', 'ITEM_PLACEMENT_CREATED_NPC'],
  ['new_anchor', 'ITEM_PLACEMENT_CREATED_G5_ANCHOR'],
  ['new_anchors', 'ITEM_PLACEMENT_CREATED_G5_ANCHOR'],
  ['new_edge', 'ITEM_PLACEMENT_CREATED_G5_ANCHOR'],
  ['new_edges', 'ITEM_PLACEMENT_CREATED_G5_ANCHOR'],
  ['modified_g5_scene', 'ITEM_PLACEMENT_CREATED_G5_ANCHOR'],
  ['g5_scene_graph_draft', 'ITEM_PLACEMENT_CREATED_G5_ANCHOR'],
  ['visible_scene', 'ITEM_PLACEMENT_CREATED_VISIBLE_SCENE'],
  ['intro_prose', 'ITEM_PLACEMENT_CREATED_INTRO_PROSE'],
  ['narrator_prose', 'ITEM_PLACEMENT_CREATED_INTRO_PROSE'],
  ['hidden_event', 'ITEM_PLACEMENT_CREATED_HIDDEN_EVENT'],
  ['quest', 'ITEM_PLACEMENT_CREATED_HIDDEN_EVENT'],
  ['future_plot_item', 'ITEM_PLACEMENT_PLAYER_DESIRE_MATERIALIZED']
]);

export const REQUIRED_AUDIT_CHECKS = Object.freeze([
  'all_item_candidates_exist',
  'all_container_candidates_exist',
  'all_property_rules_exist',
  'all_anchors_valid',
  'all_holders_valid',
  'causal_basis_valid',
  'visibility_access_property_risk_valid',
  'closed_containers_protected',
  'no_player_inventory_duplicates',
  'no_forbidden_entities_created',
  'source_trace_sufficient'
]);

export function normalizeStage16ItemPlacementPolicy(policy = {}) {
  return Object.freeze({
    ...DEFAULT_STAGE16_ITEM_PLACEMENT_POLICY,
    ...(isObject(policy) ? policy : {})
  });
}
