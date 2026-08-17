import { sha256 } from '@rus/kernel';
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
import {
  validateTurnStepCommitChecks,
  validateTurnStepLoopTrace
} from './turn-step-commit-validator.js';

export function validatePlayerTurnInput(value) {
  const errors = [];
  if (!plain(value)) return fail('player turn input must be an object');
  exactKeys(errors, value, [
    'version', 'schema', 'party_id', 'turn_number', 'request_id',
    'idempotency_key', 'raw_text', 'selected_action_option_id',
    'input_source', 'received_at', 'interpretation_status', 'contract'
  ], 'player_input');
  requiredText(errors, value.party_id, 'party_id');
  requiredText(errors, value.raw_text, 'raw_text');
  requiredText(errors, value.request_id, 'request_id');
  requiredText(errors, value.idempotency_key, 'idempotency_key');
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
  const allowedKeys = new Set(['version','schema','sealed_by','party_id','turn_id','base_state_version','write_targets','command_trace','turn_step_commit','first_entry_materialization','destination_position','ordinary_materialization_atomic_write_plan','action_production_atomic_write_plans','local_fire_atomic_write_plans','spatial_semantic_atomic_write_plan']);
  for (const key of Object.keys(value)) if (!allowedKeys.has(key)) errors.push(`write plan field is forbidden: ${key}`);
  requiredText(errors, value.party_id, 'party_id');
  requiredText(errors, value.turn_id, 'turn_id');
  if (!Array.isArray(value.write_targets)
      || value.write_targets.length === 0
        && value.ordinary_materialization_atomic_write_plan == null
        && !(value.action_production_atomic_write_plans?.length)
        && !(value.local_fire_atomic_write_plans?.length)
        && value.spatial_semantic_atomic_write_plan == null) {
    errors.push('write_targets must be non-empty unless an atomic extension owns the change');
  }
  for (const target of Array.isArray(value.write_targets) ? value.write_targets : []) {
    if (!plain(target)) errors.push('write target must be an object');
    else {
      if (Object.keys(target).some((key) => !['target','value'].includes(key))) errors.push('write target contains forbidden fields');
      if (typeof target.target !== 'string'
          || target.target.trim() !== target.target
          || !TURN_ALLOWED_WRITE_TARGETS.includes(target.target)) {
        errors.push('invalid write target: exact primitive string required');
      }
    }
  }
  if (value.first_entry_materialization != null) {
    if (!plain(value.first_entry_materialization)) errors.push('first_entry_materialization must be an object');
    else requiredText(errors, value.first_entry_materialization.g4_id, 'first_entry_materialization.g4_id');
    if (!plain(value.destination_position)) errors.push('destination_position must be an object for first-entry materialization');
  }
  const semanticTargets = (Array.isArray(value.write_targets)
    ? value.write_targets : []).filter(({ target } = {}) =>
    target === 'party_turn_step_operations');
  if (value.turn_step_commit != null) {
    errors.push(...validateTurnStepCommitEnvelope(value.turn_step_commit, {
      party_id: value.party_id,
      turn_id: value.turn_id,
      base_state_version: value.base_state_version,
      command_trace: value.command_trace,
      write_targets: value.write_targets
    }).errors.map((error) => `turn_step_commit.${error}`));
  } else if (semanticTargets.length > 0) {
    errors.push('turn_step_commit is required for semantic persistence');
  }
  return result(errors);
}

export function validateTurnStepCommitEnvelope(value, binding = null) {
  const errors = [];
  if (!plain(value)) return fail('must be an object');
  exactKeys(errors, value, [
    'version', 'schema', 'party_id', 'root_turn_id', 'base_state_version',
    'player_input', 'mode_resolution', 'checks', 'consequence',
    'time_update', 'body_update', 'hidden_update', 'visible_context',
    'loop_trace'
  ], 'envelope');
  if (value.version !== 1
      || value.schema !== 'turn_step_commit_envelope_v1') {
    errors.push('must be turn_step_commit_envelope_v1 version 1');
  }
  requiredText(errors, value.party_id, 'party_id');
  requiredText(errors, value.root_turn_id, 'root_turn_id');
  if (!Number.isSafeInteger(value.base_state_version)
      || value.base_state_version < 0) {
    errors.push('base_state_version must be a non-negative safe integer');
  }
  if (!strictJson(value)) {
    errors.push('must contain only detached strict JSON data');
  }
  if (!plain(value.player_input)
      || !validatePlayerTurnInput(value.player_input).ok) {
    errors.push('player_input must be a valid player_turn_input');
  }
  if (!plain(value.mode_resolution)
      || !validateTurnModeResolution(value.mode_resolution).ok) {
    errors.push('mode_resolution must be a valid turn_mode_resolution');
  }
  if (!plain(value.checks) || value.checks.schema !== 'turn_check_results'
      || !Array.isArray(value.checks.requests)
      || !Array.isArray(value.checks.results)) {
    errors.push('checks must be a turn_check_results object');
  } else {
    validateTurnStepCommitChecks(errors, value.checks);
  }
  if (!validateConsequencePackage(value.consequence).ok) {
    errors.push('consequence must be a valid turn_consequence_package');
  }
  if (!plain(value.time_update)
      || value.time_update.schema !== 'turn_time_update') {
    errors.push('time_update must be a turn_time_update object');
  }
  if (!plain(value.body_update)
      || value.body_update.schema !== 'turn_body_update'
      || typeof value.body_update.applied !== 'boolean') {
    errors.push('body_update must be a turn_body_update object');
  }
  if (!plain(value.hidden_update)
      || value.hidden_update.schema !== 'turn_hidden_update'
      || !plain(value.hidden_update.approved_update)) {
    errors.push('hidden_update must be a turn_hidden_update object');
  }
  if (!plain(value.visible_context)
      || value.visible_context.schema !== 'visible_context_package') {
    errors.push('visible_context must be a visible_context_package');
  }
  validateTurnStepLoopTrace(errors, value.loop_trace, value);
  if (value.player_input?.party_id !== value.party_id
      || value.mode_resolution?.turn_id !== value.root_turn_id
      || value.loop_trace?.root_turn_id !== value.root_turn_id
      || value.loop_trace?.request_id
        !== value.player_input?.request_id
      || value.root_turn_id
        !== `turn:${value.party_id}:${value.player_input?.turn_number}`
      || value.loop_trace?.committed_state_version
        !== value.base_state_version
      || value.mode_resolution?.decision_trace?.state_version
        !== value.base_state_version) {
    errors.push('root identities and committed state version must cross-bind');
  }
  if (binding && (binding.party_id !== value.party_id
      || binding.turn_id !== value.root_turn_id
      || binding.base_state_version !== value.base_state_version
      || !sameJson(binding.command_trace,
        value.mode_resolution?.decision_trace))) {
    errors.push('write plan identity and decision trace must cross-bind');
  }
  if (binding) {
    const clarification = value.loop_trace?.clarification;
    const message = binding.write_targets?.filter(({ target } = {}) =>
      target === 'party_player_visible_message') ?? [];
    if ((clarification == null) !== (message.length === 0)
        || message.length > 1
        || (message.length === 1
          && !sameJson(message[0].value?.clarification, clarification))) {
      errors.push('clarification must cross-bind to one player-visible message');
    }
    const batch = binding.write_targets?.filter(({ target } = {}) =>
      target === 'party_turn_step_operations') ?? [];
    if (clarification != null && batch.length === 0
        && (Number(value.consequence?.duration_minutes) !== 0
          || value.body_update?.applied !== false
          || value.checks?.results?.length !== 0)) {
      errors.push('pure clarification must have zero duration, body, and checks');
    }
  }
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

function exactKeys(errors, value, keys, label) {
  const expected = [...keys].sort();
  const actual = Object.keys(value).sort();
  if (expected.length !== actual.length
      || expected.some((key, index) => key !== actual[index])) {
    errors.push(`${label} must contain exact fields`);
  }
}

function sameJson(left, right) {
  try {
    return sha256(left) === sha256(right);
  } catch {
    return false;
  }
}

function strictJson(value, ancestors = new Set()) {
  if (value === null || typeof value === 'string'
      || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'object' || ancestors.has(value)) return false;
  if (!Array.isArray(value)
      && Object.getPrototypeOf(value) !== Object.prototype) return false;
  ancestors.add(value);
  const keys = Reflect.ownKeys(value);
  const valid = keys.every((key) => {
    if (typeof key !== 'string' || (Array.isArray(value) && key === 'length')) {
      return Array.isArray(value) && key === 'length';
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor?.enumerable === true
      && Object.hasOwn(descriptor, 'value')
      && strictJson(descriptor.value, ancestors);
  });
  const dense = !Array.isArray(value)
    || (keys.length === value.length + 1
      && value.every((_entry, index) => Object.hasOwn(value, index)));
  ancestors.delete(value);
  return valid && dense;
}
