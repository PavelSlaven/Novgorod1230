export const STAGE12_INPUT_SCHEMA = 'player_character_audit_input';

export const STAGE12_OUTPUT_SCHEMA = 'player_character_audit';

export const STAGE12_CODE_PRECHECK_SCHEMA = 'player_character_code_precheck';

export const STAGE11_DOSSIER_SCHEMA = 'player_character_dossier';

export const PLAYER_AUDIT_REQUIRED_CHECKS = Object.freeze([
  'schema_and_structure',
  'historical_compatibility',
  'region_compatibility',
  'start_place_compatibility',
  'social_status',
  'occupation',
  'origin',
  'body_state',
  'attributes',
  'skills',
  'inventory',
  'property_and_access',
  'knowledge',
  'relations',
  'goals',
  'source_trace',
  'downstream_entity_leak_check'
]);

export const PLAYER_AUDIT_ALLOWED_CONCERN_CODES = Object.freeze(new Set([
  'PLAYER_AUDIT_SCHEMA_INVALID',
  'PLAYER_AUDIT_MISSING_REQUIRED_FIELD',
  'PLAYER_AUDIT_START_PLACE_AUDIT_NOT_PASSED',
  'PLAYER_AUDIT_DOSSIER_SCHEMA_MISMATCH',
  'PLAYER_AUDIT_SOCIAL_ROLE_NOT_ALLOWED',
  'PLAYER_AUDIT_OCCUPATION_NOT_ALLOWED',
  'PLAYER_AUDIT_OCCUPATION_NULL_REASON_MISSING',
  'PLAYER_AUDIT_ITEM_PROFILE_NOT_ALLOWED',
  'PLAYER_AUDIT_PROPERTY_RULE_NOT_ALLOWED',
  'PLAYER_AUDIT_NPC_REF_NOT_ALLOWED',
  'PLAYER_AUDIT_STATE_RANGE_INVALID',
  'PLAYER_AUDIT_ATTRIBUTE_RANGE_INVALID',
  'PLAYER_AUDIT_ATTRIBUTE_BALANCE_INVALID',
  'PLAYER_AUDIT_SKILL_RANGE_INVALID',
  'PLAYER_AUDIT_SKILL_BASIS_MISSING',
  'PLAYER_AUDIT_COMBAT_SKILL_BASIS_MISSING',
  'PLAYER_AUDIT_SOURCE_TRACE_MISSING',
  'PLAYER_AUDIT_SOURCE_TRACE_INVALID',
  'PLAYER_AUDIT_DOWNSTREAM_ENTITY_LEAK',
  'PLAYER_AUDIT_HISTORICAL_ANACHRONISM',
  'PLAYER_AUDIT_REGION_MISMATCH',
  'PLAYER_AUDIT_START_PLACE_MISMATCH',
  'PLAYER_AUDIT_NO_REASON_HERE',
  'PLAYER_AUDIT_NO_IMMEDIATE_NEED',
  'PLAYER_AUDIT_SOCIAL_STATUS_IMPOSSIBLE',
  'PLAYER_AUDIT_ORIGIN_INCOMPATIBLE',
  'PLAYER_AUDIT_BODY_STATE_INVALID',
  'PLAYER_AUDIT_INVENTORY_NOT_ALLOWED',
  'PLAYER_AUDIT_INVENTORY_ACCESS_INVALID',
  'PLAYER_AUDIT_PROPERTY_ACCESS_INVALID',
  'PLAYER_AUDIT_KNOWLEDGE_LEAK',
  'PLAYER_AUDIT_RELATION_REF_INVALID',
  'PLAYER_AUDIT_GOAL_CONFLICT',
  'PLAYER_AUDIT_AUDIT_OUTPUT_INVALID',
  'PLAYER_AUDIT_COMMIT_PERMISSION_MISMATCH',
  'PLAYER_AUDIT_REPAIR_ROUTE_INVALID',
  'PLAYER_AUDIT_EVIDENCE_MISSING',
  'PLAYER_AUDIT_CONCERN_ENUM_INVALID',
  'PLAYER_AUDIT_SEVERITY_ENUM_INVALID',
  'PLAYER_AUDIT_MODIFIED_CHARACTER',
  'PLAYER_AUDIT_NEW_INVENTORY',
  'PLAYER_AUDIT_NEW_BIOGRAPHY',
  'PLAYER_AUDIT_CREATED_VISIBLE_SCENE',
  'PLAYER_AUDIT_CREATED_INTRO_PROSE',
  'PLAYER_AUDIT_CREATED_G5',
  'PLAYER_AUDIT_CREATED_NPC',
  'PLAYER_AUDIT_CODE_PRECHECK_FAILED'
]));

export const PLAYER_AUDIT_ALLOWED_SEVERITIES = Object.freeze(new Set([
  'info',
  'warning',
  'soft_warning',
  'repairable',
  'hard_block',
  'blocker',
  'critical'
]));

export const PLAYER_AUDIT_ALLOWED_REPAIR_ROUTES = Object.freeze(new Set([
  'player_character_format_repair',
  'player_character_semantic_repair',
  'player_character_audit_format_repair',
  'player_character_audit_router',
  'item_profile_retriever',
  'npc_candidate_retriever',
  'start_place_audit',
  'start_node_selector',
  'regional_context_loader',
  'historical_frame_selector',
  'normalized_request_recheck',
  'stage11',
  'player_character',
  '11',
  'blocked',
  'manual_review',
  'needs_manual_review'
]));

export const FORBIDDEN_AUDIT_KEYS = Object.freeze(new Set([
  'player_character_dossier',
  'modified_character',
  'replacement_character',
  'changed_character',
  'character_patch',
  'new_inventory',
  'inventory_patch',
  'new_biography',
  'biography_patch',
  'visible_scene',
  'intro_prose',
  'g5_scene',
  'g5_scene_graph',
  'g5_scene_graph_draft',
  'g5_anchor',
  'g5_anchors',
  'minilocation',
  'minilocations',
  'new_npc',
  'new_npcs',
  'materialized_npc',
  'materialized_npcs',
  'npc_entity',
  'npc_entities'
]));
