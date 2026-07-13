export const STAGE_3_SELECTION_STATUSES = Object.freeze([
  'selected',
  'blocked',
  'requires_clarification'
]);

export const STAGE_3_SEASONS = Object.freeze(['spring', 'summer', 'autumn', 'winter']);
export const STAGE_3_TIME_OF_DAY = Object.freeze(['morning', 'day', 'evening', 'night', 'deep_night']);
export const STAGE_3_LIGHT_PROFILES = Object.freeze(['dark', 'dim', 'daylight', 'twilight']);
export const STAGE_3_ALLOWED_RECORD_STATUSES = Object.freeze(['approved', 'usable_with_caution', 'draft', 'needs_review']);
export const STAGE_3_REJECTED_RECORD_STATUSES = Object.freeze(['conflict', 'rejected']);

export const STAGE_3_REQUIRED_FIELDS = Object.freeze([
  'version',
  'schema',
  'request_id',
  'selection_status',
  'era',
  'year',
  'calendar',
  'clock',
  'region',
  'political_context',
  'social_context',
  'seasonal_context',
  'downstream_constraints',
  'candidate_ids_used',
  'sources',
  'audit'
]);

// These exact keys are forbidden anywhere in the selected historical frame.
// Stage 3 chooses context, not the concrete start node or scene.
export const FORBIDDEN_DOWNSTREAM_KEYS = Object.freeze([
  'visible_scene',
  'intro_prose',
  'starting_prose',
  'start_location_id',
  'current_position',
  'position',
  'g1_id',
  'g2_id',
  'g3_id',
  'g4_id',
  'g5_id',
  'g5_anchor_id',
  'scene_anchor_id',
  'anchor_id',
  'location_id',
  'minilocation_id',
  'place_id',
  'graph_node_id',
  'node_id',
  'route_id',
  'edge_id',
  'npc',
  'npcs',
  'npc_id',
  'npc_ids',
  'item',
  'items',
  'item_id',
  'item_ids',
  'inventory',
  'equipment',
  'hidden_state',
  'hidden_event',
  'hidden_events',
  'player_character',
  'character_profile'
]);

export const WEATHER_CREATION_RE = /(?:метел|ливен|дожд[ьяе]?|снегопад|бур[яи]|гроза|туман|мороз\s*-?\s*\d|температур[аы]\s*-?\s*\d|blizzard|rainstorm|snowstorm|specific\s+weather)/iu;
export const CONCRETE_EVENT_RE = /(?:нападен|набег|пожар|суд\b|казнь|битв|сражен|заговор|посольств|войско\s+стоит|приказал|riot|raid|battle|court\s+case)/iu;
export const PLAYER_STATUS_ASSIGNMENT_RE = /(?:персонаж\s+(?:является|становится|назначен|должен|имеет\s+долг)|player\s+character\s+is|assign\s+the\s+character)/iu;
