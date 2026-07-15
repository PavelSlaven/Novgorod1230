import {
  AVAILABILITY_STATUSES,
  TURN_ALLOWED_CHECKS,
  TURN_ALLOWED_SECONDARY_MODES,
  TURN_ALLOWED_STATE_BLOCKS,
  TURN_ALLOWED_SUBSYSTEMS,
  TURN_ALLOWED_WRITE_TARGETS,
  TURN_PRIMARY_MODES,
  TURN_STATUSES
} from './contracts.js';

export function validatePlayerTurnInput(value) {
  const errors = [];
  if (!plain(value)) return fail('player turn input must be an object');
  requiredText(errors, value.party_id, 'party_id');
  requiredText(errors, value.raw_text, 'raw_text');
  integer(errors, value.turn_number, 'turn_number', 1);
  if (value.schema !== 'player_turn_input') errors.push('schema must be player_turn_input');
  if (value.contract !== 'intent_not_fact') errors.push('contract must be intent_not_fact');
  return result(errors);
}

export function validateTurnModeResolution(value) {
  const errors = [];
  if (!plain(value)) return fail('turn mode resolution must be an object');
  if (value.schema !== 'turn_mode_resolution') errors.push('schema must be turn_mode_resolution');
  requiredText(errors, value.turn_id, 'turn_id');
  enumValue(errors, value.selected_primary_mode, TURN_PRIMARY_MODES, 'selected_primary_mode');
  enumArray(errors, value.resolution_plan?.subsystems, TURN_ALLOWED_SUBSYSTEMS, 'resolution_plan.subsystems');
  enumArray(errors, value.resolution_plan?.checks_to_run, TURN_ALLOWED_CHECKS, 'resolution_plan.checks_to_run');
  enumArray(errors, value.resolution_plan?.state_blocks_to_load, TURN_ALLOWED_STATE_BLOCKS, 'resolution_plan.state_blocks_to_load');
  enumArray(errors, value.resolution_plan?.expected_writes, TURN_ALLOWED_WRITE_TARGETS, 'resolution_plan.expected_writes');
  enumArray(errors, value.secondary_modes, TURN_ALLOWED_SECONDARY_MODES, 'secondary_modes');
  if (value.intent?.player_words_are_world_facts !== false) errors.push('intent.player_words_are_world_facts must be false');
  return result(errors);
}

export function validateAvailabilityDecision(value) {
  const errors = [];
  if (!plain(value)) return fail('availability decision must be an object');
  if (value.schema !== 'turn_availability_decision') errors.push('schema must be turn_availability_decision');
  enumValue(errors, value.status, AVAILABILITY_STATUSES, 'status');
  if (typeof value.can_attempt !== 'boolean') errors.push('can_attempt must be boolean');
  if (!Array.isArray(value.check_requests)) errors.push('check_requests must be an array');
  for (const request of Array.isArray(value.check_requests) ? value.check_requests : []) {
    if (!plain(request)) errors.push('check request must be an object');
    else {
      requiredText(errors, request.check_id, 'check_request.check_id');
      const difficulty = Number(request.difficulty);
      if (!Number.isFinite(difficulty)) errors.push('check_request.difficulty must be finite');
    }
  }
  return result(errors);
}

export function validateConsequencePackage(value) {
  const errors = [];
  if (!plain(value)) return fail('consequence package must be an object');
  if (value.schema !== 'turn_consequence_package') errors.push('schema must be turn_consequence_package');
  enumValue(errors, value.status, TURN_STATUSES, 'status');
  const duration = Number(value.duration_minutes ?? 0);
  if (!Number.isFinite(duration) || duration < 0) errors.push('duration_minutes must be non-negative');
  if (!plain(value.visible_seed)) errors.push('visible_seed must be an object');
  if (!plain(value.hidden_update)) errors.push('hidden_update must be an object');
  if (!Array.isArray(value.state_changes)) errors.push('state_changes must be an array');
  if (!Array.isArray(value.suggested_actions)) errors.push('suggested_actions must be an array');
  return result(errors);
}

export function validateNarrationResult(value) {
  const errors = [];
  if (!plain(value)) return fail('narration result must be an object');
  if (value.schema !== 'narration_flow_result') errors.push('schema must be narration_flow_result');
  if (value.status !== 'approved' || value.pass !== true) errors.push('narration flow must be approved');
  if (!plain(value.approved_output)) errors.push('approved_output must be an object');
  else {
    if (value.approved_output.schema !== 'narration_output') errors.push('approved_output schema must be narration_output');
    requiredText(errors, value.approved_output.prose, 'approved_output.prose');
  }
  if (!plain(value.final_audit) || value.final_audit.pass !== true) errors.push('final_audit must approve the output');
  return result(errors);
}

export function validateTurnWritePlan(value) {
  const errors = [];
  if (!plain(value)) return fail('turn write plan must be an object');
  if (value.schema !== 'party_turn_write_plan' || value.version !== 2 || value.sealed_by !== 'turn_code_planner_v2') errors.push('write plan must be sealed party_turn_write_plan v2');
  const allowedKeys = new Set(['version','schema','sealed_by','party_id','turn_id','base_state_version','write_targets','command_trace','first_entry_materialization','destination_position','perception_cycle','perception_pins','perception_reaction_decisions']);
  for (const key of Object.keys(value)) if (!allowedKeys.has(key)) errors.push(`write plan field is forbidden: ${key}`);
  requiredText(errors, value.party_id, 'party_id');
  requiredText(errors, value.turn_id, 'turn_id');
  if (!Array.isArray(value.write_targets) || value.write_targets.length === 0) errors.push('write_targets must be non-empty array');
  for (const target of Array.isArray(value.write_targets) ? value.write_targets : []) {
    if (!plain(target)) errors.push('write target must be an object');
    else {
      if (Object.keys(target).some((key) => !['target','value'].includes(key))) errors.push('write target contains forbidden fields');
      if (!TURN_ALLOWED_WRITE_TARGETS.includes(text(target.target))) errors.push(`invalid write target: ${text(target.target) || '<empty>'}`);
    }
  }
  if (value.first_entry_materialization != null) {
    if (!plain(value.first_entry_materialization)) errors.push('first_entry_materialization must be an object');
    else requiredText(errors, value.first_entry_materialization.g4_id, 'first_entry_materialization.g4_id');
    if (!plain(value.destination_position)) errors.push('destination_position must be an object for first-entry materialization');
  }
  if ((value.perception_cycle == null) !== (value.perception_pins == null)) errors.push('perception_cycle and perception_pins must be supplied together');
  if (value.perception_cycle != null && !Array.isArray(value.perception_reaction_decisions)) errors.push('perception_reaction_decisions must be an array with perception_cycle');
  if (value.perception_cycle == null && value.perception_reaction_decisions != null) errors.push('perception_reaction_decisions requires perception_cycle');
  return result(errors);
}

export function validateTurnResult(value) {
  const errors = [];
  if (!plain(value)) return fail('turn result must be an object');
  if (value.schema !== 'turn_result') errors.push('schema must be turn_result');
  requiredText(errors, value.turn_id, 'turn_id');
  enumValue(errors, value.status, TURN_STATUSES.filter((entry) => entry !== 'repair_required'), 'status');
  if (!plain(value.screen)) errors.push('screen must be an object');
  if (!plain(value.commit)) errors.push('commit must be an object');
  return result(errors);
}

export function assertValid(label, validation) {
  if (!validation.ok) {
    const error = new Error(`${label} invalid: ${validation.errors.join('; ')}`);
    error.code = 'TURN_CONTRACT_INVALID';
    error.details = { label, errors: validation.errors };
    throw error;
  }
}

function plain(value) { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function text(value) { return String(value ?? '').trim(); }
function result(errors) { return { ok: errors.length === 0, errors }; }
function fail(message) { return { ok: false, errors: [message] }; }
function requiredText(errors, value, label) { if (!text(value)) errors.push(`${label} is required`); }
function integer(errors, value, label, min) { const n = Number(value); if (!Number.isInteger(n) || n < min) errors.push(`${label} must be integer >= ${min}`); }
function enumValue(errors, value, allowed, label) { if (!allowed.includes(text(value))) errors.push(`${label} is invalid`); }
function enumArray(errors, value, allowed, label) {
  if (!Array.isArray(value)) { errors.push(`${label} must be an array`); return; }
  for (const item of value) if (!allowed.includes(text(item))) { errors.push(`${label} contains invalid value`); return; }
}
