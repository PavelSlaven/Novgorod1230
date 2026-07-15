import { deepFreeze } from '@rus/kernel';

export const TURN_PRIMARY_MODES = deepFreeze([
  'attention',
  'movement_scene',
  'movement_route',
  'long_course',
  'item_property',
  'social_npc',
  'combat',
  'time_wait_work_sleep',
  'body_recovery',
  'stealth_order_violation',
  'knowledge_history',
  'combined'
]);


export const TURN_ALLOWED_SUBSYSTEMS = deepFreeze([
  'movement',
  'route',
  'long_course_materialization',
  'item_access',
  'inventory',
  'ownership_access',
  'npc_interaction',
  'social_status',
  'combat_resolution',
  'body_state',
  'recovery',
  'stealth',
  'knowledge_memory',
  'time_progression',
  'event_reaction',
  'visible_context_projection'
]);

export const TURN_ALLOWED_CHECKS = deepFreeze([
  'physical_access',
  'knowledge_access',
  'social_access',
  'visibility',
  'hearing',
  'distance',
  'time_cost',
  'risk_resolution',
  'combat_resolution',
  'stealth_resolution',
  'route_access',
  'body_state'
]);

export const TURN_ALLOWED_SECONDARY_MODES = deepFreeze([...TURN_PRIMARY_MODES, ...TURN_ALLOWED_SUBSYSTEMS]);

export const TURN_ALLOWED_STATE_BLOCKS = deepFreeze([
  'party_state',
  'current_position',
  'clock_weather_light',
  'visible_context',
  'character_knowledge_map',
  'relevant_hidden_state',
  'relevant_npcs',
  'relevant_items',
  'relevant_containers',
  'relevant_routes',
  'active_journey',
  'journey_legs',
  'travel_position',
  'environment_landmarks',
  'environment_cues',
  'movement_traces',
  'transport_state',
  'relevant_anchors',
  'recent_changes_log',
  'relevant_events'
]);

export const TURN_ALLOWED_WRITE_TARGETS = deepFreeze([
  'party_state',
  'party_current_position',
  'party_visible_context_package',
  'party_character_knowledge_map',
  'party_hidden_state',
  'party_events',
  'party_npcs',
  'party_items',
  'party_containers',
  'party_narrator_output',
  'party_player_visible_message',
  'party_journeys',
  'party_journey_legs',
  'party_environment_runs',
  'party_environment_choices',
  'party_environment_landmarks',
  'party_environment_cues',
  'party_environment_traces'
]);

export const TURN_WORKFLOW_STAGE_IDS = deepFreeze([
  'normalize_intent',
  'resolve_mode',
  'load_context',
  'availability',
  'checks',
  'consequence',
  'time_update',
  'hidden_update',
  'visible_projection',
  'narration',
  'persistence_plan',
  'commit',
  'screen_projection'
]);

export const TURN_STATUSES = deepFreeze(['resolved', 'blocked', 'partial', 'repair_required']);
export const AVAILABILITY_STATUSES = deepFreeze(['available', 'blocked', 'partial', 'check_required']);
