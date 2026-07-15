import {
  NPC_REACTION_ROUTING_SCHEMA,
  PERCEPTION_RESULT_SCHEMA,
  SENSORY_EVENT_SCHEMA,
  SENSORY_SCENE_SNAPSHOT_SCHEMA
} from './schema-names.js';

export const SENSORY_MODALITIES = Object.freeze(['sound', 'visual']);
export const PERCEPTION_LEVELS = Object.freeze(['blocked','below_threshold','detected','localized','classified','identified','speech_understood']);
export const DIRECTION_RESOLUTIONS = Object.freeze(['none','zone','direction','precise']);
export const CONFIDENCE_BANDS = Object.freeze(['none','low','medium','high','certain']);
export const REACTION_ROUTING_STATUSES = Object.freeze(['no_reaction','code_reaction','bounded_decision_required','data_gap','blocked']);

const EVENT_STRING_FIELDS = Object.freeze([
  'event_id','party_id','turn_id','source_kind','source_id','source_anchor_id','signal_profile_id',
  'causal_action_id','emitted_at','directionality_profile_id','semantic_class_id'
]);
const SNAPSHOT_ARRAY_FIELDS = Object.freeze([
  'g5_nodes','g5_edges','g5_anchors','actor_positions','actor_attention_states',
  'actor_perception_profile_refs','active_light_sources','ambient_sound_profiles','prospective_edge_states'
]);
const RESULT_STRING_FIELDS = Object.freeze([
  'result_id','event_id','observer_kind','observer_id','observer_anchor_id','path_id'
]);

export function validateSensoryEvent(value) {
  const issues = base(value, SENSORY_EVENT_SCHEMA, 'SENSORY_EVENT');
  if (!isObject(value)) return issues;
  requiredStrings(issues, value, EVENT_STRING_FIELDS, 'SENSORY_EVENT');
  requiredInteger(issues, value, 'wave_index', 0, 'SENSORY_EVENT');
  requiredInteger(issues, value, 'duration_ms', 0, 'SENSORY_EVENT');
  requiredInteger(issues, value, 'base_strength_units', 0, 'SENSORY_EVENT');
  requiredInteger(issues, value, 'state_version', 0, 'SENSORY_EVENT');
  enumValue(issues, value.modality, SENSORY_MODALITIES, 'modality', 'SENSORY_EVENT');
  requiredStringArray(issues, value, 'routine_context_tags', 'SENSORY_EVENT');
  digest(issues, value.profile_digest, 'profile_digest', 'SENSORY_EVENT');
  const parent = value.parent_event_id ?? null;
  const reaction = value.causal_reaction_id ?? null;
  if (value.wave_index === 0 && (parent !== null || reaction !== null)) issue(issues, 'SENSORY_EVENT_CAUSALITY_INVALID', 'Wave zero events cannot have causal parents.', 'parent_event_id');
  if (Number.isInteger(value.wave_index) && value.wave_index > 0 && (!text(parent) || !text(reaction))) issue(issues, 'SENSORY_EVENT_CAUSALITY_INVALID', 'Secondary events require parent_event_id and causal_reaction_id.', 'parent_event_id');
  return issues;
}

export function validateSensorySceneSnapshot(value) {
  const issues = base(value, SENSORY_SCENE_SNAPSHOT_SCHEMA, 'SENSORY_SNAPSHOT');
  if (!isObject(value)) return issues;
  requiredStrings(issues, value, ['party_id','g4_id'], 'SENSORY_SNAPSHOT');
  requiredInteger(issues, value, 'state_version', 0, 'SENSORY_SNAPSHOT');
  requiredObject(issues, value, 'clock', 'SENSORY_SNAPSHOT');
  requiredObject(issues, value, 'weather', 'SENSORY_SNAPSHOT');
  requiredObject(issues, value, 'light_state', 'SENSORY_SNAPSHOT');
  for (const field of SNAPSHOT_ARRAY_FIELDS) requiredArray(issues, value, field, 'SENSORY_SNAPSHOT');
  digest(issues, value.snapshot_digest, 'snapshot_digest', 'SENSORY_SNAPSHOT');
  return issues;
}

export function validatePerceptionResult(value) {
  const issues = base(value, PERCEPTION_RESULT_SCHEMA, 'PERCEPTION_RESULT');
  if (!isObject(value)) return issues;
  requiredStrings(issues, value, RESULT_STRING_FIELDS, 'PERCEPTION_RESULT');
  requiredInteger(issues, value, 'arrival_strength_units', 0, 'PERCEPTION_RESULT');
  requiredInteger(issues, value, 'threshold_units', 0, 'PERCEPTION_RESULT');
  requiredInteger(issues, value, 'margin_units', undefined, 'PERCEPTION_RESULT');
  requiredInteger(issues, value, 'state_version', 0, 'PERCEPTION_RESULT');
  enumValue(issues, value.modality, SENSORY_MODALITIES, 'modality', 'PERCEPTION_RESULT');
  enumValue(issues, value.perception_level, PERCEPTION_LEVELS, 'perception_level', 'PERCEPTION_RESULT');
  enumValue(issues, value.direction_resolution, DIRECTION_RESOLUTIONS, 'direction_resolution', 'PERCEPTION_RESULT');
  enumValue(issues, value.confidence_band, CONFIDENCE_BANDS, 'confidence_band', 'PERCEPTION_RESULT');
  requiredBoolean(issues, value, 'physical_reach', 'PERCEPTION_RESULT');
  requiredBoolean(issues, value, 'perceived', 'PERCEPTION_RESULT');
  requiredArray(issues, value, 'applied_profile_ids', 'PERCEPTION_RESULT');
  digest(issues, value.trace_digest, 'trace_digest', 'PERCEPTION_RESULT');
  if (Number.isInteger(value.arrival_strength_units) && Number.isInteger(value.threshold_units) && value.margin_units !== value.arrival_strength_units - value.threshold_units) issue(issues, 'PERCEPTION_RESULT_INVARIANT', 'margin_units must equal arrival_strength_units - threshold_units.', 'margin_units');
  const levelIndex = PERCEPTION_LEVELS.indexOf(value.perception_level);
  if (value.physical_reach === false && value.perception_level !== 'blocked') issue(issues, 'PERCEPTION_RESULT_INVARIANT', 'A signal without physical reach must be blocked.', 'perception_level');
  if (value.perceived === false && levelIndex > 1) issue(issues, 'PERCEPTION_RESULT_INVARIANT', 'An unperceived signal cannot be localized, classified or identified.', 'perception_level');
  if (value.perceived === false && (value.identified_source_id !== null || value.identified_semantic_class_id !== null || value.speech_content_id !== null)) issue(issues, 'PERCEPTION_RESULT_INVARIANT', 'An unperceived signal cannot have identified content.', 'identified_source_id');
  if (value.perception_level === 'speech_understood' && value.modality !== 'sound') issue(issues, 'PERCEPTION_RESULT_INVARIANT', 'speech_understood is valid only for sound.', 'modality');
  return issues;
}

export function validateNpcReactionRouting(value) {
  const issues = base(value, NPC_REACTION_ROUTING_SCHEMA, 'NPC_REACTION_ROUTING');
  if (!isObject(value)) return issues;
  requiredStrings(issues, value, ['routing_id','party_id','event_id','observer_id','reaction_policy_id'], 'NPC_REACTION_ROUTING');
  requiredInteger(issues, value, 'state_version', 0, 'NPC_REACTION_ROUTING');
  enumValue(issues, value.status, REACTION_ROUTING_STATUSES, 'status', 'NPC_REACTION_ROUTING');
  requiredArray(issues, value, 'options', 'NPC_REACTION_ROUTING');
  digest(issues, value.trace_digest, 'trace_digest', 'NPC_REACTION_ROUTING');
  if (value.status === 'no_reaction' && value.options?.length !== 0) issue(issues, 'NPC_REACTION_ROUTING_INVARIANT', 'no_reaction cannot expose options.', 'options');
  if (value.status === 'code_reaction' && value.options?.length !== 1) issue(issues, 'NPC_REACTION_ROUTING_INVARIANT', 'code_reaction requires exactly one option.', 'options');
  if (value.status === 'bounded_decision_required' && value.options?.length < 2) issue(issues, 'NPC_REACTION_ROUTING_INVARIANT', 'bounded decision requires at least two options.', 'options');
  return issues;
}

function base(value, schema, prefix) {
  const issues = [];
  if (!isObject(value)) { issue(issues, `${prefix}_INVALID`, `${schema} must be an object.`, 'value'); return issues; }
  if (value.version !== 1) issue(issues, `${prefix}_SCHEMA_MISMATCH`, `${schema}.version must be 1.`, 'version');
  if (value.schema !== schema) issue(issues, `${prefix}_SCHEMA_MISMATCH`, `schema must be ${schema}.`, 'schema');
  return issues;
}
function requiredStrings(issues, value, fields, prefix) { for (const field of fields) requiredString(issues, value, field, prefix); }
function requiredString(issues, value, field, prefix) { if (typeof value[field] !== 'string' || !value[field].trim()) issue(issues, `${prefix}_REQUIRED_FIELD`, `${field} must be a non-empty string.`, field); }
function requiredStringArray(issues, value, field, prefix) { requiredArray(issues, value, field, prefix); if (Array.isArray(value[field]) && value[field].some((entry) => typeof entry !== 'string' || !entry.trim())) issue(issues, `${prefix}_FIELD_INVALID`, `${field} must contain non-empty strings.`, field); }
function requiredArray(issues, value, field, prefix) { if (!Array.isArray(value[field])) issue(issues, `${prefix}_REQUIRED_FIELD`, `${field} must be an array.`, field); }
function requiredObject(issues, value, field, prefix) { if (!isObject(value[field])) issue(issues, `${prefix}_REQUIRED_FIELD`, `${field} must be an object.`, field); }
function requiredInteger(issues, value, field, minimum, prefix) { if (!Number.isInteger(value[field]) || (minimum !== undefined && value[field] < minimum)) issue(issues, `${prefix}_REQUIRED_FIELD`, `${field} must be an integer${minimum === undefined ? '' : ` >= ${minimum}`}.`, field); }
function requiredBoolean(issues, value, field, prefix) { if (typeof value[field] !== 'boolean') issue(issues, `${prefix}_REQUIRED_FIELD`, `${field} must be a boolean.`, field); }
function enumValue(issues, value, allowed, field, prefix) { if (!allowed.includes(value)) issue(issues, `${prefix}_FIELD_INVALID`, `${field} is invalid.`, field, allowed, value); }
function digest(issues, value, field, prefix) { if (!/^[a-f0-9]{64}$/u.test(String(value ?? ''))) issue(issues, `${prefix}_REQUIRED_FIELD`, `${field} must be a SHA-256 digest.`, field); }
function issue(issues, code, message, field, expected = null, actual = null) { issues.push(Object.freeze({ code, message, field, expected, actual })); }
function isObject(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function text(value) { return typeof value === 'string' && value.trim(); }
