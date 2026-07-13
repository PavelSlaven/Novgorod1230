export const TURN_PRIMARY_MODES = Object.freeze([
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

export const TURN_ALLOWED_STATE_BLOCKS = Object.freeze([
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
  'relevant_anchors',
  'recent_changes_log',
  'relevant_events'
]);

export const TURN_ALLOWED_SUBSYSTEMS = Object.freeze([
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

export const TURN_ALLOWED_CHECKS = Object.freeze([
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

export const TURN_ALLOWED_WRITE_TARGETS = Object.freeze([
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
  'party_player_visible_message'
]);

export const TURN_ALLOWED_SECONDARY_MODES = Object.freeze([
  ...TURN_PRIMARY_MODES,
  ...TURN_ALLOWED_SUBSYSTEMS
]);

export function validateTurnModeResolution(value) {
  const concerns = [];
  if (!isObject(value)) {
    concerns.push('turn_mode_resolution must be an object');
    return { pass: false, concerns };
  }
  requireEqual(concerns, value.schema, 'turn_mode_resolution', 'schema must be turn_mode_resolution');
  requireNonEmptyString(concerns, value.turn_id, 'turn_id is required');
  requireEnum(concerns, value.selected_primary_mode, TURN_PRIMARY_MODES, 'selected_primary_mode is invalid');
  requireArrayOfEnum(concerns, value.secondary_modes, TURN_ALLOWED_SECONDARY_MODES, 'secondary_modes contains invalid value');
  requireEqual(concerns, value.intent?.player_words_are_world_facts, false, 'intent.player_words_are_world_facts must be false');
  requireNonEmptyString(concerns, value.intent?.raw_text, 'intent.raw_text is required');
  requireNonEmptyString(concerns, value.intent?.normalized_intent, 'intent.normalized_intent is required');
  requireNonEmptyString(concerns, value.current_state_refs?.party_id, 'current_state_refs.party_id is required');
  requireNonEmptyString(concerns, value.current_state_refs?.current_position_id, 'current_state_refs.current_position_id is required');
  requireNonEmptyString(concerns, value.current_state_refs?.visible_context_id, 'current_state_refs.visible_context_id is required');
  requireNonEmptyString(concerns, value.current_state_refs?.character_knowledge_map_id, 'current_state_refs.character_knowledge_map_id is required');
  requireBoolean(concerns, value.accessibility_check?.can_attempt, 'accessibility_check.can_attempt must be boolean');
  requireBoolean(concerns, value.accessibility_check?.requires_check, 'accessibility_check.requires_check must be boolean');
  requireBoolean(concerns, value.accessibility_check?.requires_time, 'accessibility_check.requires_time must be boolean');
  requireBoolean(concerns, value.accessibility_check?.requires_risk_resolution, 'accessibility_check.requires_risk_resolution must be boolean');
  requireArrayOfEnum(concerns, value.resolution_plan?.subsystems, TURN_ALLOWED_SUBSYSTEMS, 'resolution_plan.subsystems contains invalid value');
  requireArrayOfEnum(concerns, value.resolution_plan?.checks_to_run, TURN_ALLOWED_CHECKS, 'resolution_plan.checks_to_run contains invalid value');
  requireArrayOfEnum(concerns, value.resolution_plan?.state_blocks_to_load, TURN_ALLOWED_STATE_BLOCKS, 'resolution_plan.state_blocks_to_load contains invalid value');
  requireArrayOfEnum(concerns, value.resolution_plan?.expected_writes, TURN_ALLOWED_WRITE_TARGETS, 'resolution_plan.expected_writes contains invalid value');
  return { pass: concerns.length === 0, concerns };
}

export function validateTurnResolutionAudit(value) {
  const concerns = [];
  if (!isObject(value)) {
    concerns.push('turn_resolution_audit must be an object');
    return { pass: false, concerns };
  }
  requireEqual(concerns, value.schema, 'turn_resolution_audit', 'schema must be turn_resolution_audit');
  requireBoolean(concerns, value.pass, 'pass must be boolean');
  requireEnum(concerns, value.status, ['resolved', 'blocked', 'partial', 'needs_repair'], 'status is invalid');
  if (!Array.isArray(value.concerns)) concerns.push('concerns must be array');
  return { pass: concerns.length === 0, concerns };
}

export function validateTurnIntentRoute(value) {
  const concerns = [];
  if (!isObject(value)) {
    concerns.push('turn_intent_route must be an object');
    return { pass: false, concerns };
  }
  requireEqual(concerns, value.schema, 'turn_intent_route', 'schema must be turn_intent_route');
  requireEnum(concerns, value.candidate_primary_mode, TURN_PRIMARY_MODES, 'candidate_primary_mode is invalid');
  requireArrayOfEnum(concerns, value.candidate_secondary_modes, TURN_ALLOWED_SECONDARY_MODES, 'candidate_secondary_modes contains invalid value');
  requireArrayOfEnum(concerns, value.required_state_blocks, TURN_ALLOWED_STATE_BLOCKS, 'required_state_blocks contains invalid value');
  return { pass: concerns.length === 0, concerns };
}

export function validateTurnWritePlan(value) {
  const concerns = [];
  if (!isObject(value)) {
    concerns.push('party_turn_write_plan must be an object');
    return { pass: false, concerns };
  }
  requireEqual(concerns, value.schema, 'party_turn_write_plan', 'schema must be party_turn_write_plan');
  if (!Array.isArray(value.write_targets) || value.write_targets.length === 0) {
    concerns.push('write_targets must be non-empty array');
  } else {
    for (const target of value.write_targets) {
      if (!TURN_ALLOWED_WRITE_TARGETS.includes(String(target?.target ?? ''))) {
        concerns.push(`write target is invalid: ${String(target?.target ?? '<empty>')}`);
      }
    }
  }
  return { pass: concerns.length === 0, concerns };
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function requireEqual(concerns, actual, expected, message) {
  if (actual !== expected) concerns.push(message);
}

function requireNonEmptyString(concerns, value, message) {
  if (typeof value !== 'string' || !value.trim()) concerns.push(message);
}

function requireBoolean(concerns, value, message) {
  if (typeof value !== 'boolean') concerns.push(message);
}

function requireEnum(concerns, value, allowed, message) {
  if (!allowed.includes(String(value ?? ''))) concerns.push(message);
}

function requireArrayOfEnum(concerns, value, allowed, message) {
  if (!Array.isArray(value)) {
    concerns.push(message);
    return;
  }
  for (const item of value) {
    if (!allowed.includes(String(item ?? ''))) {
      concerns.push(message);
      return;
    }
  }
}
