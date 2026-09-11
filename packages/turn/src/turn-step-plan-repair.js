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
  // Repair reuses this immutable snapshot and its existing grounding identity.
  let modelRequest = null;
  try {
    return {
      plan: await requestAndValidateTurnStepPlan({ request,
        turnStepModel: async (safeRequest) => {
          modelRequest = safeRequest;
          const output = await turnStepModel(safeRequest);
          originalOutput = structuredClone(output);
          return output;
        }, semanticPlanValidator, preparedChainContext, attempt: 1 }),
      repaired: false
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
    const denialTrial = parseFailure ? null
      : literalDenialMetadataTrial(originalOutput, request, structuralErrors);
    const materialTrial = parseFailure ? null
      : missingMaterialTrial(originalOutput, request, structuralErrors);
    const projectionTrial = denialTrial ?? materialTrial;
    if (!parseFailure && originalOutput != null
        && (!structuralErrors.some(requiresSemanticRepair)
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
    if (!structuralErrors.some(requiresSemanticRepair)) {
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
      return {
        plan: await requestAndValidateTurnStepPlan({
          request,
          turnStepModel: async (safeRequest) => {
            const output = await turnStepModel(modelRequest ?? safeRequest, repairContext);
            repairedOutput = structuredClone(output);
            return output;
          },
          semanticPlanValidator,
          preparedChainContext,
          attempt: 2
        }),
        repaired: true
      };
    } catch (repairError) {
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

const SEMANTIC_REPAIR_CODES = new Set([
  'action_production_identity_grounding',
  'continuation_progress',
  'direct_result_kind',
  'domain_owner_unavailable',
  'material_extent_shape',
  'material_transformation_grounding',
  'operation_semantic_grounding',
  'ordinary_discovery_query_identity',
  'source_placement_grounding',
  'source_semantic_grounding'
]);

function requiresSemanticRepair({ code } = {}) {
  return SEMANTIC_REPAIR_CODES.has(code);
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
  semanticPlanValidator, preparedChainContext, attempt = 1 }) {
  const plan = await requestTurnStepPlan({ request, turnStepModel });
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
