import { sha256 } from '@rus/kernel';
import {
  validateTurnStepPlan,
  validateTurnStepRequest
} from './turn-step-contracts.js';

export function validateTurnStepCommitChecks(errors, checks) {
  exactKeys(errors, checks, ['version', 'schema', 'requests', 'results'],
    'checks');
  if (checks.version !== 1) errors.push('checks.version must be 1');
  const requests = new Map();
  for (const request of checks.requests) {
    if (!(validGenericCheckRequest(request) || validLegacyCheckRequest(request))
        || requests.has(request.check_id)) {
      errors.push('checks.requests must have unique exact check identities');
      continue;
    }
    requests.set(request.check_id, request);
  }
  const resultIds = new Set();
  for (const value of checks.results) {
    if (!validCommitCheckResult(value) || resultIds.has(value?.check_id)) {
      errors.push('checks.results must contain unique exact RNG results');
      continue;
    }
    resultIds.add(value.check_id);
    const request = requests.get(value.check_id);
    if (!request || request.difficulty !== value.difficulty) {
      errors.push('check result difficulty must match its exact request');
    }
  }
  if (requests.size !== resultIds.size
      || [...requests.keys()].some((id) => !resultIds.has(id))) {
    errors.push('every check request must have exactly one RNG result');
  }
}

export function validateTurnStepLoopTrace(errors, value, envelope) {
  if (!plain(value)) {
    errors.push('loop_trace must be an object');
    return;
  }
  exactKeys(errors, value, [
    'version', 'schema', 'root_turn_id', 'request_id',
    'committed_state_version', 'status', 'stop_reason', 'working_revision',
    'next_step_index', 'remaining_intent', 'completed_steps', 'step_traces',
    'check_results', 'clarification'
  ], 'loop_trace');
  const allowedStops = new Set([
    'terminal', 'player_response', 'clarification_required', 'no_progress',
    'step_limit'
  ]);
  validateCompletedSteps(errors, value.completed_steps);
  validateStepTraces(errors, value.step_traces, envelope);
  if (value.version !== 1
      || value.schema !== 'turn_step_commit_trace_v1'
      || !['resolved', 'player_response_required'].includes(value.status)
      || !Number.isSafeInteger(value.working_revision)
      || value.working_revision < 0
      || value.working_revision > 8
      || !Number.isSafeInteger(value.next_step_index)
      || value.next_step_index !== value.working_revision + 1
      || !Array.isArray(value.completed_steps)
      || value.completed_steps.length !== value.working_revision
      || !Array.isArray(value.step_traces)
      || value.step_traces.length < value.working_revision
      || value.step_traces.length > 8
      || !Array.isArray(value.check_results)
      || !allowedStops.has(value.stop_reason)
      || (value.status === 'resolved') !== (value.stop_reason === 'terminal')
      || (value.clarification != null)
        !== (value.stop_reason === 'clarification_required')
      || !sameJson(value.check_results, envelope.checks?.results)
      || !sameJson(value.step_traces,
        envelope.mode_resolution?.decision_trace?.step_traces)) {
    errors.push('loop_trace is invalid or disagrees with decision trace');
  }
}

function validateCompletedSteps(errors, steps) {
  if (!Array.isArray(steps)) return;
  if (steps.some((step, index) => !hasExact(step, [
    'step_index', 'summary'
  ]) || step.step_index !== index + 1 || !text(step.summary))) {
    errors.push('completed_steps must contain exact ordered step summaries');
  }
}

function validateStepTraces(errors, traces, envelope) {
  if (!Array.isArray(traces)) return;
  const genericRequests = new Map((envelope.checks?.requests ?? [])
    .filter(validGenericCheckRequest)
    .map((request) => [request.check_id, request]));
  const results = new Map((envelope.checks?.results ?? []).map(
    (result) => [result.check_id, result]));
  const bound = new Set();
  for (const [index, trace] of traces.entries()) {
    const exact = hasExact(trace, [
      'step_index', 'working_revision', 'resolution', 'goal_result',
      'repaired', 'applied', 'check_outcome', 'check_binding',
      'approved_plan', 'plan_request', 'player_response_boundary',
      'reason_code'
    ]);
    const generic = trace?.resolution === 'generic_check';
    const binding = trace?.check_binding;
    const plan = trace?.approved_plan;
    const requestEvidence = trace?.plan_request;
    const requestValidation = validateTurnStepRequest(requestEvidence);
    const planValidation = validateTurnStepPlan(plan, {
      request: requestEvidence
    });
    const validPlanEvidence = requestValidation.ok && planValidation.ok
      && requestEvidence.root_turn_id === envelope.root_turn_id
      && requestEvidence.committed_state_version
        === envelope.base_state_version
      && plan?.step_index === trace.step_index
      && plan?.working_revision === trace.working_revision
      && plan?.resolution === trace.resolution
      && plan?.goal_result === trace.goal_result
      && plan?.reason_code === trace.reason_code;
    const deferredPreparedCheck = generic
      && envelope.time_update?.prepared_effect_ledger != null
      && index === 1
      && trace.applied === false
      && trace.player_response_boundary === true
      && binding === null
      && trace.check_outcome === null;
    if (!exact || trace.step_index !== index + 1
        || trace.working_revision !== index
        || typeof trace.repaired !== 'boolean'
        || typeof trace.applied !== 'boolean'
        || typeof trace.player_response_boundary !== 'boolean'
        || !text(trace.resolution) || !text(trace.goal_result)
        || !text(trace.reason_code) || !validPlanEvidence
        || (!generic && (binding !== null || trace.check_outcome !== null))) {
      errors.push('step_traces must contain exact ordered code-owned traces');
      continue;
    }
    if (!generic) continue;
    if (deferredPreparedCheck) continue;
    const request = genericRequests.get(binding?.check_id);
    const result = results.get(binding?.check_id);
    if (!validGenericCheckRequest(binding)
        || binding.check_id
          !== `${envelope.root_turn_id}:step:${trace.step_index}`
        || binding.check_plan_digest !== sha256(plan.check)
        || binding.outcome_map_digest !== sha256(plan.check.outcomes)
        || binding.step_plan_digest !== sha256(plan)
        || !request || !result || bound.has(binding.check_id)
        || !sameJson(binding, request)
        || trace.check_outcome !== result.outcome?.band) {
      errors.push('generic check trace must bind its exact plan and outcome');
      continue;
    }
    bound.add(binding.check_id);
  }
  if (bound.size !== genericRequests.size) {
    errors.push('every generic check must bind to exactly one loop step');
  }
}

function validGenericCheckRequest(value) {
  return plain(value) && hasExact(value, [
    'check_id', 'difficulty', 'policy_profile_ref', 'policy_profile_pin',
    'check_policy_ref', 'consequence_policy_ref', 'check_plan_digest',
    'outcome_map_digest', 'step_plan_digest'
  ]) && text(value.check_id)
    && Number.isSafeInteger(value.difficulty)
    && text(value.policy_profile_ref)
    && validProfilePin(value.policy_profile_pin)
    && validPolicyRef(value.check_policy_ref, 'check_policy')
    && validPolicyRef(value.consequence_policy_ref, 'consequence_policy')
    && value.policy_profile_ref === value.check_policy_ref.entity_id
    && [value.check_plan_digest, value.outcome_map_digest,
      value.step_plan_digest].every(validDigest);
}

function validLegacyCheckRequest(value) {
  return plain(value) && hasExact(value, [
    'check_id', 'difficulty', 'attribute_value', 'skill_bonus',
    'state_modifier', 'equipment_modifier', 'circumstance_modifier'
  ]) && text(value.check_id) && Number.isSafeInteger(value.difficulty)
    && [value.attribute_value, value.skill_bonus, value.state_modifier,
      value.equipment_modifier, value.circumstance_modifier]
      .every(Number.isFinite);
}

function validCommitCheckResult(value) {
  if (!plain(value) || !hasExact(value, [
    'check_id', 'roll', 'modifiers', 'total', 'difficulty', 'outcome', 'audit'
  ]) || !hasExact(value.modifiers, [
    'attribute', 'skill', 'state', 'equipment', 'circumstances'
  ]) || !hasExact(value.outcome, [
    'margin', 'band', 'success', 'cost_required', 'severe_failure',
    'roll_note'
  ]) || !hasExact(value.audit, [
    'die', 'value', 'rng_mode', 'algorithm', 'seed_ref', 'counter', 'formula'
  ])) return false;
  const modifiers = Object.values(value.modifiers);
  const total = value.roll + modifiers.reduce((sum, item) => sum + item, 0);
  const margin = total - value.difficulty;
  const band = margin >= 10 ? 'clean_success'
    : margin >= 0 ? 'success'
      : margin >= -4 ? 'success_with_cost'
        : margin >= -9 ? 'failure_with_consequence' : 'severe_failure';
  const rollNote = value.roll === 1 ? 'natural_1'
    : value.roll === 20 ? 'natural_20' : null;
  return text(value.check_id)
    && Number.isSafeInteger(value.roll) && value.roll >= 1 && value.roll <= 20
    && modifiers.every(Number.isFinite)
    && Number.isFinite(value.total) && value.total === total
    && Number.isSafeInteger(value.difficulty)
    && value.outcome.margin === margin && value.outcome.band === band
    && value.outcome.success === (margin >= 0)
    && value.outcome.cost_required === (margin < 0 && margin >= -4)
    && value.outcome.severe_failure === (margin <= -10)
    && value.outcome.roll_note === rollNote
    && value.audit.die === 'd20' && value.audit.value === value.roll
    && ['seeded', 'explicit_rng'].includes(value.audit.rng_mode)
    && (value.audit.algorithm === null || text(value.audit.algorithm))
    && (value.audit.seed_ref === null || text(value.audit.seed_ref))
    && (value.audit.counter === null
      || Number.isSafeInteger(value.audit.counter))
    && (value.audit.formula === null || text(value.audit.formula));
}

function validPolicyRef(value, kind) {
  return hasExact(value, [
    'entity_kind', 'entity_id', 'authoring_version'
  ]) && value.entity_kind === kind && text(value.entity_id)
    && text(value.authoring_version);
}

function validProfilePin(value) {
  return hasExact(value, ['artifact_id', 'revision', 'digest'])
    && text(value.artifact_id)
    && Number.isSafeInteger(value.revision) && value.revision >= 1
    && validDigest(value.digest);
}

function validDigest(value) {
  return typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
}

function exactKeys(errors, value, keys, label) {
  if (!hasExact(value, keys)) errors.push(`${label} must contain exact fields`);
}

function hasExact(value, keys) {
  return plain(value) && Object.keys(value).length === keys.length
    && keys.every((key) => Object.hasOwn(value, key));
}

function sameJson(left, right) {
  try {
    return sha256(left) === sha256(right);
  } catch {
    return false;
  }
}

function plain(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function text(value) {
  return typeof value === 'string' && value.trim() === value
    && value.length > 0;
}
