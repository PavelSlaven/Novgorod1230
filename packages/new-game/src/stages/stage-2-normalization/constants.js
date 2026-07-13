export const STAGE_2_SELECTION_MODES = Object.freeze([
  'explicit',
  'random',
  'constrained_random',
  'inferred',
  'unresolved'
]);

export const STAGE_2_SOURCES = Object.freeze([
  'ui_field',
  'player_text',
  'explicit_player_random',
  'missing',
  'inferred_from_text'
]);

export const STAGE_2_CONFIDENCE = Object.freeze(['low', 'medium', 'high']);

export const STAGE_2_REQUIRED_FIELDS = Object.freeze([
  'version',
  'schema',
  'request_id',
  'language',
  'start_mode',
  'player_intent_summary',
  'era_request',
  'year_request',
  'season_request',
  'time_of_day_request',
  'region_request',
  'start_place_request',
  'character_request',
  'tone_request',
  'difficulty_request',
  'hard_constraints',
  'soft_preferences',
  'forbidden_content',
  'unknowns_to_resolve',
  'requires_clarification',
  'clarification_questions',
  'adaptation_flags',
  'invalid_or_unsafe_literals',
  'audit'
]);

export const REQUEST_BLOCK_FIELDS = Object.freeze([
  'era_request',
  'year_request',
  'season_request',
  'time_of_day_request',
  'region_request',
  'start_place_request',
  'tone_request',
  'difficulty_request'
]);

// These exact keys are forbidden anywhere in the stage-2 output.
// Stage 2 only preserves raw player text and hints. It never emits resolved ids.
export const FORBIDDEN_WORLD_ID_KEYS = Object.freeze([
  'region_id',
  'place_id',
  'graph_node_id',
  'node_id',
  'location_id',
  'minilocation_id',
  'anchor_id',
  'g1_id',
  'g2_id',
  'g3_id',
  'g4_id',
  'g5_anchor_id',
  'route_id',
  'edge_id',
  'social_class_id',
  'social_role_id',
  'role_id',
  'occupation_id',
  'skill_id',
  'npc_id',
  'item_id',
  'container_id',
  'event_id',
  'historical_event_id'
]);

// These keys indicate that the normalizer started creating world content.
// It may say that the player asked for an item or NPC as raw text, but it may
// not produce created NPC/item/location structures.
export const FORBIDDEN_ENTITY_KEYS = Object.freeze([
  'npc',
  'npcs',
  'created_npc',
  'created_npcs',
  'item',
  'items',
  'created_item',
  'created_items',
  'inventory',
  'equipment',
  'scene',
  'start_scene',
  'hidden_state',
  'visible_context',
  'current_position',
  'party_state',
  'player_character',
  'character_profile'
]);

export const RANDOM_WORD_RE = /(?:^|\s)(?:случайн|любо[йеая]|на тво[её]\s+усмотрение|пусть\s+игра\s+выберет|как\s+получится|random)(?:\s|$)/iu;
