import {
  ADAPTATIONS,
  DIFFICULTIES,
  DOMAIN_OPS,
  DURATION_CLASSES,
  EFFORTS,
  GOAL_RESULTS,
  OUTCOME_BANDS,
  RESOLUTIONS
} from './constants.js';
import { validateOperations } from './operations.js';
import { validateTurnStepRequest } from './request-validator.js';
import {
  add,
  cloneTrace,
  collectKnownRefs,
  constant,
  enumValue,
  integer,
  knownRef,
  plain,
  refs,
  requireNull,
  requiredText,
  result,
  strict
} from './validation.js';

export function validateTurnStepPlan(value, { request } = {}) {
  const errors = [];
  if (!strict(value, '$', [
    'schema', 'request_id', 'committed_state_version', 'working_revision',
    'step_index', 'interpretation', 'resolution', 'goal_result', 'activity',
    'operations', 'check', 'continuation', 'clarification', 'reason_code',
    'reason'
  ], errors)) return result(errors);
  constant(value.schema, 'turn_step_plan_v1', '$.schema', errors);
  requiredText(value.request_id, '$.request_id', errors);
  integer(value.committed_state_version, 0,
    '$.committed_state_version', errors);
  integer(value.working_revision, 0, '$.working_revision', errors);
  integer(value.step_index, 1, '$.step_index', errors);
  if (Number.isSafeInteger(value.step_index) && value.step_index > 8) {
    add(errors, '$.step_index', 'maximum', 'must be <= 8');
  }
  validateInterpretation(value.interpretation, '$.interpretation', errors);
  enumValue(value.resolution, RESOLUTIONS, '$.resolution', errors);
  enumValue(value.goal_result, GOAL_RESULTS, '$.goal_result', errors);
  validateActivity(value.activity, '$.activity', errors);
  requiredText(value.reason_code, '$.reason_code', errors);
  requiredText(value.reason, '$.reason', errors);
  const knownRefs = collectKnownRefs(request);
  const trace = {
    knownRefs,
    actorRef: request?.actor?.actor_id ?? request?.actor?.actor_ref ?? null,
    tempRefs: new Set(),
    allTempRefs: new Set(),
    retired: new Set(),
    placements: new Map(),
    inside: new Map()
  };
  const operationKinds = validateOperations(
    value.operations, '$.operations', errors, trace, { directOnly: false }
  );
  validateContinuation(value.continuation, '$.continuation', errors, trace,
    request?.prepared_followup_candidates);
  validateClarification(value.clarification, '$.clarification', errors, trace);
  validateCheck(value.check, '$.check', errors, trace);
  validateResolution(value, operationKinds, errors);
  if (value.continuation != null && value.goal_result !== 'pending') {
    add(errors, '$.goal_result', 'continuation',
      'must be pending when continuation is present');
  }
  if (request !== undefined) {
    validateEcho(value, request, errors);
    validateContinuationProgress(value, request, operationKinds, errors);
  }
  return result(errors);
}

function validateContinuationProgress(plan, request, operationKinds, errors) {
  if (plan.continuation?.remaining_intent !== request.remaining_intent) return;
  const domainKinds = operationKinds.filter((kind) => DOMAIN_OPS.has(kind));
  if (domainKinds.length === 0 || domainKinds.every(
    (kind) => kind === 'request_discovery')) return;
  add(errors, '$.continuation.remaining_intent', 'continuation_progress',
    'must omit the event covered by the selected domain operation');
}

function validateInterpretation(value, path, errors) {
  if (!strict(value, path,
    ['player_goal', 'grounded_attempt', 'adaptation'], errors)) return;
  requiredText(value.player_goal, `${path}.player_goal`, errors);
  requiredText(value.grounded_attempt, `${path}.grounded_attempt`, errors);
  enumValue(value.adaptation, ADAPTATIONS, `${path}.adaptation`, errors);
}

function validateActivity(value, path, errors) {
  if (!strict(value, path, ['owner', 'duration_class', 'effort'], errors)) {
    return;
  }
  enumValue(value.owner, ['semantic', 'domain'], `${path}.owner`, errors);
  if (value.owner === 'semantic') {
    enumValue(value.duration_class, DURATION_CLASSES,
      `${path}.duration_class`, errors);
    enumValue(value.effort, EFFORTS, `${path}.effort`, errors);
  } else if (value.owner === 'domain') {
    constant(value.duration_class, null, `${path}.duration_class`, errors);
    constant(value.effort, null, `${path}.effort`, errors);
  }
}

function validateAdditionalActivity(value, path, errors) {
  if (value === null) return;
  if (!strict(value, path, ['duration_class', 'effort'], errors)) return;
  enumValue(value.duration_class, DURATION_CLASSES,
    `${path}.duration_class`, errors);
  enumValue(value.effort, EFFORTS, `${path}.effort`, errors);
}

function validateContinuation(value, path, errors, trace = null,
  preparedFollowupCandidates = []) {
  if (value === null) return;
  if (!plain(value)) {
    strict(value, path, [], errors);
    return;
  }
  if (!strict(value, path, [
    'remaining_intent', 'depends_on_refs'
  ], errors, { optional: ['prepared_followup_ref'] })) {
    return;
  }
  requiredText(value.remaining_intent, `${path}.remaining_intent`, errors);
  refs(value.depends_on_refs, `${path}.depends_on_refs`, errors, trace,
    { allowEmpty: true });
  if (value.prepared_followup_ref != null) {
    requiredText(value.prepared_followup_ref,
      `${path}.prepared_followup_ref`, errors);
    if (!(preparedFollowupCandidates ?? []).some(({ prepared_followup_ref: ref }) =>
      ref === value.prepared_followup_ref)) {
      add(errors, `${path}.prepared_followup_ref`, 'candidate',
        'must copy a request prepared followup candidate');
    }
  }
}

function validateClarification(value, path, errors, trace = null) {
  if (value === null) return;
  if (!strict(value, path, ['question', 'target_refs'], errors)) return;
  requiredText(value.question, `${path}.question`, errors);
  refs(value.target_refs, `${path}.target_refs`, errors, trace,
    { allowEmpty: true });
}

function validateCheck(value, path, errors, baseTrace) {
  if (value === null) return;
  if (!strict(value, path, [
    'purpose', 'attribute_ref', 'skill_ref', 'difficulty_id', 'outcomes'
  ], errors)) return;
  requiredText(value.purpose, `${path}.purpose`, errors);
  knownRef(value.attribute_ref, `${path}.attribute_ref`, errors, baseTrace);
  if (value.skill_ref !== null) {
    knownRef(value.skill_ref, `${path}.skill_ref`, errors, baseTrace);
  }
  enumValue(value.difficulty_id, DIFFICULTIES,
    `${path}.difficulty_id`, errors);
  if (!strict(value.outcomes, `${path}.outcomes`, OUTCOME_BANDS, errors)) {
    return;
  }
  for (const band of OUTCOME_BANDS) {
    const outcome = value.outcomes[band];
    const outcomePath = `${path}.outcomes.${band}`;
    if (!strict(outcome, outcomePath, [
      'goal_result', 'additional_activity', 'operations', 'continuation'
    ], errors)) continue;
    enumValue(outcome.goal_result, GOAL_RESULTS,
      `${outcomePath}.goal_result`, errors);
    validateAdditionalActivity(outcome.additional_activity,
      `${outcomePath}.additional_activity`, errors);
    const outcomeTrace = cloneTrace(baseTrace);
    const kinds = validateOperations(outcome.operations,
      `${outcomePath}.operations`, errors, outcomeTrace,
      { directOnly: false });
    const domainCount = kinds.filter((kind) => DOMAIN_OPS.has(kind)).length;
    const firstDomain = kinds.findIndex((kind) => DOMAIN_OPS.has(kind));
    if (domainCount > 1) {
      add(errors, `${outcomePath}.operations`, 'resolution',
        'check outcome permits at most one domain operation');
    }
    if (firstDomain >= 0 && firstDomain !== kinds.length - 1) {
      add(errors, `${outcomePath}.operations`, 'ordering',
        'domain operation must follow direct outcome operations');
    }
    validateContinuation(outcome.continuation,
      `${outcomePath}.continuation`, errors, outcomeTrace);
    if (outcome.continuation != null && outcome.goal_result !== 'pending') {
      add(errors, `${outcomePath}.goal_result`, 'continuation',
        'must be pending when continuation is present');
    }
  }
}

function validateResolution(plan, kinds, errors) {
  const domainCount = kinds.filter((kind) => DOMAIN_OPS.has(kind)).length;
  const firstDomain = kinds.findIndex((kind) => DOMAIN_OPS.has(kind));
  if (plan.resolution === 'direct') {
    requireSemanticActivity(plan, errors);
    requireNull(plan.check, '$.check', errors);
    requireNull(plan.clarification, '$.clarification', errors);
    if (domainCount > 0) {
      add(errors, '$.operations', 'resolution',
        'direct permits only direct operations');
    }
  } else if (plan.resolution === 'generic_check') {
    requireSemanticActivity(plan, errors);
    if (!plain(plan.check)) {
      add(errors, '$.check', 'resolution',
        'generic_check requires a check');
    }
    requireNull(plan.clarification, '$.clarification', errors);
    if (domainCount > 0) {
      add(errors, '$.operations', 'resolution',
        'generic_check permits only direct operations');
    }
    if (Array.isArray(plan.operations) && plan.operations.length > 0) {
      add(errors, '$.operations', 'resolution',
        'generic_check requires outcome-specific operations');
    }
    if (plan.continuation !== null) {
      add(errors, '$.continuation', 'resolution',
        'generic_check requires outcome-specific continuation');
    }
    if (plan.goal_result !== 'pending') {
      add(errors, '$.goal_result', 'resolution',
        'generic_check must be pending');
    }
  } else if (plan.resolution === 'domain_request') {
    const actionProduction = plan.operations?.find((operation) =>
      operation?.op === 'request_item_use'
        && operation.action_production != null);
    const expectedOwner = actionProduction ? 'semantic' : 'domain';
    if (plan.activity?.owner !== expectedOwner) {
      add(errors, '$.activity.owner', 'resolution',
        actionProduction
          ? 'action production requires semantic activity'
          : 'domain_request requires domain activity');
    }
    requireNull(plan.check, '$.check', errors);
    requireNull(plan.clarification, '$.clarification', errors);
    if (domainCount !== 1) {
      add(errors, '$.operations', 'resolution',
        'domain_request requires exactly one domain operation');
    }
    if (actionProduction && plan.operations.length !== 1) {
      add(errors, '$.operations', 'resolution',
        'action production does not support direct preparation operations');
    }
    if (firstDomain >= 0 && firstDomain !== kinds.length - 1) {
      add(errors, '$.operations', 'ordering',
        'domain operation must follow direct preparation operations');
    }
    if (plan.goal_result !== 'pending') {
      add(errors, '$.goal_result', 'resolution',
        'domain_request must be pending');
    }
  } else if (plan.resolution === 'clarification_required') {
    requireSemanticActivity(plan, errors);
    requireNull(plan.check, '$.check', errors);
    if (plan.clarification === null) {
      add(errors, '$.clarification', 'resolution',
        'clarification_required requires clarification');
    }
    if (kinds.length > 0) {
      add(errors, '$.operations', 'resolution',
        'clarification_required permits no operations');
    }
    if (plan.continuation !== null) {
      add(errors, '$.continuation', 'resolution',
        'clarification_required permits no hidden continuation');
    }
    if (plan.goal_result !== 'pending') {
      add(errors, '$.goal_result', 'resolution',
        'clarification_required must be pending');
    }
  }
  if (plan.resolution !== 'generic_check' && plan.check !== null) {
    add(errors, '$.check', 'resolution',
      'check is allowed only for generic_check');
  }
  if (plan.resolution !== 'clarification_required'
      && plan.clarification !== null) {
    add(errors, '$.clarification', 'resolution',
      'clarification is allowed only for clarification_required');
  }
}

function validateEcho(plan, request, errors) {
  const validation = validateTurnStepRequest(request);
  if (!validation.ok) {
    add(errors, '$request', 'invalid_request',
      'echo source request is invalid');
    return;
  }
  for (const key of [
    'request_id', 'committed_state_version', 'working_revision', 'step_index'
  ]) {
    if (plan[key] !== request[key]) {
      add(errors, `$.${key}`, 'echo_mismatch',
        `must exactly echo request.${key}`);
    }
  }
}

function requireSemanticActivity(plan, errors) {
  if (plan.activity?.owner !== 'semantic') {
    add(errors, '$.activity.owner', 'resolution',
      `${plan.resolution} requires semantic activity`);
  }
}
