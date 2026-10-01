import { deepFreeze } from '@rus/kernel';
import { requestTurnStepPlan, validateTurnStepPlan } from './turn-step-contracts.js';
import { contractError } from './turn-step-contracts/validation.js';
import { isOrdinaryDiscoveryInScope } from './turn-step-ordinary-discovery.js';
import { EFFORTS } from './turn-step-contracts/constants.js';

export async function requestTurnStepPlanWithRepair({ request, turnStepModel,
  semanticPlanValidator = null,
  preparedChainContext = null,
  allowRepair = true
}) {
  let originalOutput = null;
  let canonicalizations = [];
  // Repair reuses this immutable snapshot and its existing grounding identity.
  let modelRequest = null;
  try {
    const initialPlan = await requestAndValidateTurnStepPlan({ request,
      turnStepModel: async (safeRequest) => {
        modelRequest = safeRequest;
        const output = await turnStepModel(safeRequest);
        const normalized = a1DescriptionCanonicalization(output, 1);
        originalOutput = structuredClone(normalized?.plan ?? output);
        canonicalizations = normalized?.diagnostics ?? [];
        return normalized?.plan ?? output;
      }, semanticPlanValidator, preparedChainContext, attempt: 1,
      beforeSemanticValidation: (plan) => {
        if (isRealityLimitedAchievedNoOp(plan)) {
          throw realityLimitedAchievedNoOpError();
        }
      } });
    return {
      plan: initialPlan,
      repaired: false,
      ...(canonicalizations.length === 0 ? {} : { canonicalizations })
    };
  } catch (error) {
    const parseFailure = error?.code === 'json_parse_failed';
    if (error?.code !== 'TURN_STEP_PLAN_INVALID' && !parseFailure) throw error;
    if (allowRepair !== true) {
      error.details = deepFreeze({
        ...error.details,
        repair_attempted: false,
        repair_suppressed: 'prepared_effect_chain_active'
      });
      throw error;
    }
    if (parseFailure) originalOutput = {};
    const structuralErrors = parseFailure ? [{ path: '$',
      code: 'json_parse_failed', message: 'Planner output was not valid JSON.' }]
      : [...(error.details?.errors ?? [])];
    if (!parseFailure && isRealityLimitedAchievedNoOp(originalOutput)
        && onlyInvalidDirectResultKindError(originalOutput,
          structuralErrors)) {
      structuralErrors.splice(0, structuralErrors.length,
        realityLimitedAchievedNoOpError().details.errors[0]);
    }
    const denialTrial = parseFailure ? null
      : literalDenialMetadataTrial(originalOutput, request, structuralErrors);
    const materialTrial = parseFailure ? null
      : missingMaterialTrial(originalOutput, request, structuralErrors);
    const projectionTrial = denialTrial ?? materialTrial;
    if (!parseFailure && originalOutput != null
        && !isRealityLimitedAchievedNoOp(originalOutput)
        && (!structuralErrors.some((item) => requiresSemanticRepair(item))
          || canAuditSpeechBeforeRepair(originalOutput, structuralErrors) || projectionTrial != null)
        && typeof semanticPlanValidator === 'function') {
      try {
        const trial = speechMetadataTrial(originalOutput, request);
        const result = await semanticPlanValidator(deepFreeze({ plan: projectionTrial ?? trial ?? originalOutput,
          request: structuredClone(request), prepared_chain_context:
            structuredClone(preparedChainContext), attempt: 1,
          allow_speech_metadata_projection: trial != null,
          ...(denialTrial == null ? {} : { allow_denial_metadata_projection: true }),
          ...(denialTrial == null && materialTrial == null ? {} : { material_prerequisite_candidate: true }) }));
        if (trial != null && result === true
            || (trial != null || projectionTrial != null) && result?.corrected_plan != null) return {
          plan: validateAndFreezePlan(result?.corrected_plan ?? trial, request), repaired: false
        };
      } catch (semanticError) {
        if (semanticError?.code !== 'TURN_STEP_PLAN_INVALID') throw semanticError;
        structuralErrors.push(...(semanticError.details?.errors ?? []));
      }
    }
    if (!structuralErrors.some((item) => requiresSemanticRepair(item))) {
      const failure = parseFailure
        ? contractError('TURN_STEP_PLAN_INVALID', structuralErrors) : error;
      failure.details = deepFreeze({ ...failure.details,
        repair_attempted: false,
        repair_suppressed: 'deterministic_structure_invalid' });
      throw failure;
    }
    const repairContext = deepFreeze({ schema: 'turn_step_repair_context_v1',
      attempt: 2,
      original_output: structuredClone(originalOutput),
      structural_errors: structuredClone(structuralErrors)
    });
    let repairedOutput = null;
    try {
      const repairedPlan = await requestAndValidateTurnStepPlan({
        request,
        turnStepModel: async (safeRequest) => {
          const output = await turnStepModel(modelRequest ?? safeRequest,
            repairContext);
          const normalized = a1DescriptionCanonicalization(output, 2);
          repairedOutput = structuredClone(normalized?.plan ?? output);
          canonicalizations = normalized?.diagnostics ?? [];
          return normalized?.plan ?? output;
        },
        semanticPlanValidator,
        preparedChainContext,
        attempt: 2,
        beforeSemanticValidation: (plan) => {
          if (isRealityLimitedAchievedNoOp(plan)) {
            const normalized = realityLimitedNoOpCanonicalization(plan,
              request, 2);
            canonicalizations = [...canonicalizations,
              ...normalized.diagnostics];
            return { plan: normalized.plan, skipSemanticValidation: true };
          }
          if (isRealityLimitedNotAchievedNoOp(plan)
              && hasForbiddenNoOpFields(plan)) {
            const normalized = realityLimitedNotAchievedCleanup(plan,
              request, 2);
            canonicalizations = [...canonicalizations,
              ...normalized.diagnostics];
            return { plan: normalized.plan, skipSemanticValidation: true };
          }
        }
      });
      const finalPlan = repairedPlan;
      const finalCanonicalizations = canonicalizationsForPlan(
        canonicalizations, finalPlan);
      return {
        plan: finalPlan,
        repaired: true,
        ...(finalCanonicalizations.length === 0 ? {} : {
          canonicalizations: finalCanonicalizations
        })
      };
    } catch (repairError) {
      if (repairError?.code === 'TURN_STEP_PLAN_INVALID'
          && isRealityLimitedAchievedNoOp(repairedOutput)
          && onlyInvalidDirectResultKindError(repairedOutput,
            repairError.details?.errors ?? [])) {
        const noOpCanonicalization = realityLimitedNoOpCanonicalization(
          repairedOutput, request, 2);
        const finalPlan = noOpCanonicalization.plan;
        return { plan: finalPlan, repaired: true,
          canonicalizations: [...canonicalizationsForPlan(canonicalizations,
            finalPlan),
            ...noOpCanonicalization.diagnostics] };
      }
      if (repairError?.code === 'TURN_STEP_PLAN_INVALID'
          && isRealityLimitedNotAchievedNoOp(repairedOutput)
          && hasForbiddenNoOpFields(repairedOutput)
          && onlyForbiddenNoOpFieldErrors(repairError.details?.errors ?? [])) {
        const normalized = realityLimitedNotAchievedCleanup(repairedOutput,
          request, 2);
        return { plan: normalized.plan, repaired: true,
          canonicalizations: [...canonicalizationsForPlan(canonicalizations,
            normalized.plan), ...normalized.diagnostics] };
      }
      if (repairError?.code === 'TURN_STEP_PLAN_INVALID'
          && canAuditRepairedSpeechMetadata(repairedOutput, request)
          && typeof semanticPlanValidator === 'function') {
        try {
          const result = await semanticPlanValidator(deepFreeze({
            plan: structuredClone(repairedOutput), request: structuredClone(request),
            prepared_chain_context: structuredClone(preparedChainContext), attempt: 2,
            allow_speech_metadata_projection: true
          }));
          return { plan: validateAndFreezePlan(result?.corrected_plan ?? repairedOutput, request), repaired: true };
        } catch (auditError) { repairError = auditError; }
      }
      const normalizedError = repairError?.code === 'json_parse_failed'
        ? contractError('TURN_STEP_PLAN_INVALID', [{ path: '$',
          code: 'json_parse_failed',
          message: 'Planner repair output was not valid JSON.' }])
        : repairError;
      if (normalizedError?.code === 'TURN_STEP_PLAN_INVALID') {
        normalizedError.details = deepFreeze({
          ...normalizedError.details,
          repair_attempted: true
        });
      }
      throw normalizedError;
    }
  }
}

function realityLimitedNoOpCanonicalization(plan, request, attempt) {
  if (!isRealityLimitedAchievedNoOp(plan)) return null;
  const normalized = structuredClone(plan);
  const diagnostics = [{ attempt, path: '$.goal_result', old_value: 'achieved',
    new_value: 'not_achieved' }];
  normalized.goal_result = 'not_achieved';
  if (normalized.direct_result_kind !== null) {
    diagnostics.push({ attempt, path: '$.direct_result_kind',
      old_value: normalized.direct_result_kind, new_value: null });
  }
  normalized.direct_result_kind = null;
  for (const path of ['assessment', 'utterance']) {
    if (!Object.hasOwn(normalized, path)) continue;
    diagnostics.push({ attempt, path: `$.${path}`,
      removed_fields: [path] });
    delete normalized[path];
  }
  return { plan: validateAndFreezePlan(normalized, request), diagnostics };
}

function realityLimitedNotAchievedCleanup(plan, request, attempt) {
  const normalized = structuredClone(plan);
  const diagnostics = [];
  if (normalized.direct_result_kind !== null) {
    diagnostics.push({ attempt, path: '$.direct_result_kind',
      old_value: normalized.direct_result_kind, new_value: null });
    normalized.direct_result_kind = null;
  }
  for (const path of ['assessment', 'utterance']) {
    if (!Object.hasOwn(normalized, path)) continue;
    diagnostics.push({ attempt, path: `$.${path}`,
      removed_fields: [path] });
    delete normalized[path];
  }
  return { plan: validateAndFreezePlan(normalized, request), diagnostics };
}

function isRealityLimitedAchievedNoOp(plan) {
  return plan?.resolution === 'direct' && plan.goal_result === 'achieved'
    && plan.interpretation?.adaptation === 'reality_limited'
    && Array.isArray(plan.operations) && plan.operations.length === 0;
}

function isRealityLimitedNotAchievedNoOp(plan) {
  return plan?.resolution === 'direct' && plan.goal_result === 'not_achieved'
    && plan.interpretation?.adaptation === 'reality_limited'
    && Array.isArray(plan.operations) && plan.operations.length === 0;
}

function hasForbiddenNoOpFields(plan) {
  if (!Object.hasOwn(plan ?? {}, 'direct_result_kind')
      || !(plan.direct_result_kind === null
        || typeof plan.direct_result_kind === 'string'
          && plan.direct_result_kind.length > 0)) return false;
  return plan.direct_result_kind !== null
    || Object.hasOwn(plan ?? {}, 'assessment')
    || Object.hasOwn(plan ?? {}, 'utterance');
}

function onlyInvalidDirectResultKindError(plan, errors) {
  return (plan?.direct_result_kind === null
      || typeof plan?.direct_result_kind === 'string'
        && plan.direct_result_kind.length > 0) && errors.length === 1
    && errors[0].path === '$.direct_result_kind';
}

function onlyForbiddenNoOpFieldErrors(errors) {
  const paths = new Set(['$.direct_result_kind', '$.assessment', '$.utterance']);
  return errors.length > 0 && errors.every(({ path }) => paths.has(path));
}

function realityLimitedAchievedNoOpError() {
  return contractError('TURN_STEP_PLAN_INVALID', [{ path: '$.goal_result',
    code: 'reality_limited_achieved_noop',
    message: 'an impossible reality-limited attempt cannot be achieved; choose not_achieved or partially_achieved according to the attempt. For not_achieved, set direct_result_kind to null and remove assessment and utterance.' }]);
}

const SEMANTIC_REPAIR_CODES = new Set([
  'action_production_identity_grounding',
  'continuation_progress',
  'direct_result_kind',
  'domain_owner_unavailable',
  'elapsed_time_grounding',
  'material_extent_shape',
  'material_transformation_grounding',
  'operation_semantic_grounding',
  'ordinary_discovery_query_identity',
  'reality_limited_achieved_noop',
  'source_placement_grounding',
  'source_semantic_grounding'
]);

// Which physical form a torn-off piece or its surviving source has is a new semantic choice, not schema.
const ACTION_PRODUCTION_FORM_PATH =
  /^\$\.operations\[\d+\]\.action_production\.result_descriptor(\.source_fact_delta)?\.physical_form$/u;

function requiresSemanticRepair({ path, code } = {}) {
  return SEMANTIC_REPAIR_CODES.has(code)
    || code === 'additional_property' && path === '$.operation_choice'
    || code === 'enum' && ACTION_PRODUCTION_FORM_PATH.test(path);
}

function a1DescriptionCanonicalization(plan, attempt) {
  if (!Array.isArray(plan?.operations)) return null;
  const normalized = structuredClone(plan);
  const diagnostics = [];
  normalized.operations.forEach((operation, index) => {
    if (operation?.op !== 'request_item_use'
        || operation.action_production == null
        || !Object.hasOwn(operation, 'description')) return;
    delete operation.description;
    diagnostics.push({ attempt, path: `$.operations[${index}].description`,
      removed_fields: ['description'] });
  });
  if (diagnostics.length === 0) return null;
  return { plan: normalized, diagnostics };
}

function canonicalizationsForPlan(entries, plan) {
  return entries.filter(({ path }) => {
    const match = /^\$\.operations\[(\d+)\]\.description$/u.exec(path ?? '');
    if (match == null) return true;
    const operation = plan?.operations?.[Number(match[1])];
    return operation?.op === 'request_item_use'
      && operation.action_production != null
      && !Object.hasOwn(operation, 'description');
  });
}

function singleTransientOperation(plan) {
  const op = plan?.operations?.length === 1 ? plan.operations[0] : null;
  return plan?.interpretation?.adaptation === 'literal' && plan.check === null
    && plan.continuation === null && plan.clarification === null && plan.direct_result_kind === null
    && op?.op === 'request_item_use' && op.use_kind === 'other' && op.action_production == null
    && typeof op.description === 'string' && op.description.trim().length > 0 ? op : null;
}

function missingMaterialTrial(plan, request, errors) {
  const op = singleTransientOperation(plan);
  const unknownSource = ({ path, code }) => code === 'unknown_ref'
    && [ '$.operations[0].item_ref', '$.operations.0.item_ref' ].includes(path);
  if (op == null || errors.length === 0 || !errors.every(error => unknownSource(error)
    || error.path === '$.operations.0.item_ref' && error.code === 'source_placement_grounding')
    || request.player_safe_state?.items?.some(item => (item.item_id ?? item.instance_id) === op.item_ref)) return null;
  const operation = { op: 'request_discovery', actor_ref: request.actor?.actor_id ?? request.actor?.actor_ref,
    discovery_kind: 'inspect', target_refs: [request.player_safe_state?.position?.location_ref],
    query: request.remaining_intent };
  if (!isOrdinaryDiscoveryInScope({ operation, playerSafeState: request.player_safe_state })) return null;
  const trial = { ...plan, resolution: 'domain_request', goal_result: 'pending',
    activity: { owner: 'domain', duration_class: null, effort: null }, operations: [operation] };
  return validateTurnStepPlan(trial, { request }).ok ? trial : null;
}

function literalDenialMetadataTrial(plan, request, errors) {
  if (plan?.interpretation?.adaptation !== 'literal' || plan.resolution !== 'direct'
      || plan.goal_result !== 'not_achieved' || !Array.isArray(plan.operations)
      || plan.operations.length !== 0 || plan.check !== null || plan.continuation !== null
      || plan.clarification !== null || typeof plan.direct_result_kind !== 'string'
      || !plan.direct_result_kind.trim()
      || !errors.some(({ path, code }) => path === '$.direct_result_kind' && code === 'enum')
      || !errors.every(({ path }) => path === '$.direct_result_kind')) return null;
  const trial = { ...plan, direct_result_kind: null };
  return validateTurnStepPlan(trial, { request }).ok ? trial : null;
}

function canAuditSpeechBeforeRepair(plan, errors) {
  return errors.some(({ code }) => code === 'direct_result_kind')
    && plan.resolution === 'direct'
    && plan.direct_result_kind === 'player_utterance'
    && (plan.operations == null
      || Array.isArray(plan.operations) && plan.operations.length === 0)
    && plan.check == null
    && typeof plan.utterance?.speaker_ref === 'string'
    && typeof plan.utterance?.utterance_text === 'string'
    && ['verbatim', 'intent_paraphrase'].includes(plan.utterance?.input_mode);
}

function speechMetadataEnvelope(plan, request) {
  if (plan?.resolution !== 'direct' || plan.direct_result_kind !== 'player_utterance'
      || plan.activity?.owner !== 'semantic' || plan.activity.duration_class !== 'moment'
      || Object.hasOwn(plan.activity, 'requested_duration_minutes')
      || !EFFORTS.includes(plan.activity.effort) || !Array.isArray(plan.operations)
      || plan.operations.length !== 0 || plan.check !== null || plan.clarification !== null
      || plan.utterance?.speaker_ref !== (request.actor?.actor_id ?? request.actor?.actor_ref)
      || typeof plan.utterance?.utterance_text !== 'string' || !plan.utterance.utterance_text.trim()
      || !Array.isArray(plan.continuation?.depends_on_refs)
      || plan.continuation.depends_on_refs.length !== 0
      || plan.continuation.prepared_followup_ref != null
      || plan.continuation.pending_discovery != null) return false;
  return true;
}

function isSpeechMetadataError({ path, code }) {
  return path === '$.utterance.utterance_text' && code === 'direct_result_kind'
    || path === '$.goal_result' && code === 'continuation';
}

function canAuditRepairedSpeechMetadata(plan, request) {
  if (!speechMetadataEnvelope(plan, request) || plan.activity.effort !== 'none'
      || typeof plan.continuation.remaining_intent !== 'string'
      || !plan.continuation.remaining_intent.trim()
      || plan.continuation.remaining_intent === request.remaining_intent
      || !request.remaining_intent.endsWith(plan.continuation.remaining_intent)) return false;
  const validation = validateTurnStepPlan(plan, { request });
  return !validation.ok && validation.errors.every(isSpeechMetadataError);
}

function speechMetadataTrial(plan, request) {
  if (!speechMetadataEnvelope(plan, request)) return null;
  const trial = { ...plan, activity: { ...plan.activity, effort: 'none' } };
  const validation = validateTurnStepPlan(trial, { request });
  return validation.errors.every(isSpeechMetadataError) ? trial : null;
}

function validateAndFreezePlan(plan, request) {
  const validation = validateTurnStepPlan(plan, { request });
  if (!validation.ok) throw contractError('TURN_STEP_PLAN_INVALID', validation.errors);
  return deepFreeze(structuredClone(plan));
}

export async function requestAndValidateTurnStepPlan({ request, turnStepModel,
  semanticPlanValidator, preparedChainContext, attempt = 1,
  beforeSemanticValidation = null }) {
  let plan = await requestTurnStepPlan({ request, turnStepModel });
  if (typeof beforeSemanticValidation === 'function') {
    const normalized = beforeSemanticValidation(plan);
    if (normalized?.plan != null) {
      plan = validateAndFreezePlan(normalized.plan, request);
      if (normalized.skipSemanticValidation === true) return plan;
    }
  }
  if (typeof semanticPlanValidator === 'function') {
    const result = await semanticPlanValidator(deepFreeze({ plan,
      request: structuredClone(request),
      prepared_chain_context: structuredClone(preparedChainContext), attempt,
      allow_speech_metadata_projection: true }));
    if (result?.corrected_plan != null) {
      return validateAndFreezePlan(result.corrected_plan, request);
    }
  }
  return plan;
}
