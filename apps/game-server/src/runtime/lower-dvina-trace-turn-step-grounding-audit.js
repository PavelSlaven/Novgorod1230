import { serverError } from '../errors.js';
import { isOrdinaryDiscoveryInScope } from '@rus/turn';
import { isDeepStrictEqual } from 'node:util';

const KINDS = new Set([
  'operation_semantic_grounding',
  'source_semantic_grounding',
  'material_transformation_grounding',
  'source_placement_grounding',
  'action_production_identity_grounding'
]);
const PROMPT = [
  'Return only {"pass":true,"concerns":[]} or',
  '{"pass":false,"concerns":[{"kind":"<allowed kind>"}]}.',
  'Audit only the supplied focused discovery or action_production against the',
  'current remaining_intent and player-safe evidence. Refs are opaque.',
  'Each operations entry contains its plan path and operation.',
  'For discovery, the operation must cover the earliest focused information',
  'need. A fixed authored query must not replace a different ordinary search,',
  'material prerequisite, handling, or transformation.',
  'When available_domain_operation_grounding supplies a semantic_scope for',
  'the exact operation, treat that purpose and result_scope as its complete',
  'authority. Shared nouns, location, or inspect wording do not expand it.',
  'A fixed authored evidence or scene investigation must fail',
  'operation_semantic_grounding whenever the current step seeks ordinary',
  'material, suitability for work, acquisition or gathering, manipulation,',
  'construction, or another practical use, even when phrased as inspect or',
  'look. It may pass only when the whole current step investigates that',
  'authored subject and every independent later action remains continuation.',
  'For action_production, every physically changed, incorporated, or consumed',
  'material needs its own source ref whose supplied item label, category,',
  'description, or facts identify that material. Unchanged implements are tool',
  'refs, never material sources. Sensory prose without an entity ref does not',
  'identify an item. If a needed ordinary material has no matching item ref,',
  'fail source_semantic_grounding so discovery can materialize it first.',
  'The result descriptor is item-local: it must not assert a destination,',
  'holder, wearer, attachment, location, or relocation. Use',
  'source_placement_grounding for such claims. Use',
  'material_transformation_grounding when the operation substitutes gathering',
  'or relocation for a physical transformation. Use',
  'action_production_identity_grounding only for an incompatible preserve,',
  'partition, or independent-output identity. Otherwise pass.',
  'Allowed kinds: operation_semantic_grounding, source_semantic_grounding,',
  'material_transformation_grounding, source_placement_grounding,',
  'action_production_identity_grounding. Do not infer hidden state, rewrite the',
  'plan, audit factual scholarship, or call another role.'
].join(' ');

export function createLowerDvinaTraceTurnStepSemanticGroundingValidator({
  roleRunner
} = {}) {
  if (typeof roleRunner?.run !== 'function') {
    throw new TypeError('Turn-step grounding auditor requires a role runner.');
  }
  return async ({ plan, request, resolved_domain_operations: resolved = [] }) => {
    const audited = [...auditedOperations(plan)];
    if (audited.length === 0) return true;
    const genericDiscovery = standaloneGenericDiscovery({ audited, plan,
      request, resolved });
    if (genericDiscovery != null) {
      if (normalized(genericDiscovery.query)
          === normalized(request.remaining_intent)) return true;
      throw serverError('TURN_STEP_PLAN_INVALID',
        'Ordinary discovery query must preserve the current intent.', {
          details: { errors: [{ path: `${audited[0].path}.query`,
            rule: 'ordinary_discovery_query_identity',
            code: 'ordinary_discovery_query_identity',
            message: 'must equal the current remaining_intent' }] }
        });
    }
    const response = await roleRunner.run({
      scope: 'turn_runtime', role_id: 'turn_step_grounding_auditor',
      request_identity: request.request_id,
      messages: [{ role: 'system', content: PROMPT }, { role: 'user',
        content: JSON.stringify({ remaining_intent: request.remaining_intent,
          player_safe_state: groundingState(request.player_safe_state,
            audited),
          operations: audited, continuation: plan.continuation }) }]
    });
    if (!valid(response?.output)) throw serverError(
      'TRACE_TURN_STEP_GROUNDING_AUDIT_INVALID',
      'Turn-step grounding auditor returned an invalid result.', { status: 503 }
    );
    if (response.output.pass) return true;
    throw serverError('TURN_STEP_PLAN_INVALID',
      'Turn-step semantic grounding is invalid.', { details: { errors:
        response.output.concerns.map(({ kind }) =>
          concern(kind, audited, resolved)) } });
  };
}

function standaloneGenericDiscovery({ audited, plan, request, resolved }) {
  const owner = resolved.find(({ path }) => path === audited[0]?.path);
  if (audited.length !== 1 || plan.operations?.length !== 1
      || plan.check != null || plan.continuation != null
      || owner?.owner_kind !== 'ordinary_discovery') return null;
  const operation = audited[0].operation;
  return isOrdinaryDiscoveryInScope({ operation,
    playerSafeState: request.player_safe_state }) ? operation : null;
}

function normalized(value) {
  return typeof value === 'string' ? value.normalize('NFKC').trim()
    .replace(/\s+/gu, ' ').toLocaleLowerCase('ru-RU') : null;
}

function* auditedOperations(plan) {
  for (const [index, operation] of (plan?.operations ?? []).entries()) {
    if (auditable(operation)) yield { path: `$.operations.${index}`, operation };
  }
  for (const [band, outcome] of Object.entries(plan?.check?.outcomes ?? {})) {
    for (const [index, operation] of (outcome.operations ?? []).entries()) {
      if (auditable(operation)) yield {
        path: `$.check.outcomes.${band}.operations.${index}`, operation
      };
    }
  }
}

function auditable(operation) {
  return operation?.op === 'request_discovery'
    || operation?.op === 'request_item_use'
      && operation.action_production != null;
}

function groundingState(state = {}, audited = []) {
  return {
    actor_id: state.actor_id, position: state.position,
    items: state.items ?? [], inventory: state.inventory ?? {},
    current_visible_context: state.current_visible_context ?? null,
    visible_context: state.visible_context ?? null,
    ordinary_resolution: state.ordinary_resolution ?? null,
    observed_evidence_inspection:
      state.observed_evidence_inspection ?? null,
    available_domain_operation_grounding:
      (state.available_domain_operation_grounding ?? []).filter(({ operation }) =>
        audited.some((entry) => isDeepStrictEqual(entry.operation, operation)))
  };
}

function concern(kind, audited, resolved) {
  const operationPath = audited.length === 1 ? audited[0].path
    : audited.every(({ path }) => path.startsWith('$.check.outcomes.'))
      ? '$.check.outcomes' : '$.operations';
  const path = kind === 'operation_semantic_grounding' ? operationPath
    : kind === 'source_semantic_grounding'
      ? `${operationPath}.action_production.source_refs`
      : kind === 'source_placement_grounding'
        ? `${operationPath}.action_production.result_descriptor`
        : kind === 'material_transformation_grounding'
          ? `${operationPath}.action_production`
          : `${operationPath}.action_production.identity_mode`;
  const rejected = kind === 'operation_semantic_grounding'
    && audited.length === 1
    ? resolved.find(({ path: candidate }) => candidate === audited[0].path)
      ?.bound_operation : null;
  return { path, rule: kind, code: kind,
    message: 'must remain grounded by the current intent and player-safe evidence',
    ...(rejected == null ? {} : {
      rejected_operation: structuredClone(rejected)
    }) };
}

function valid(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === 2 && typeof value.pass === 'boolean'
    && Array.isArray(value.concerns)
    && (value.pass ? value.concerns.length === 0 : value.concerns.length > 0)
    && value.concerns.every((entry) => entry != null
      && typeof entry === 'object' && !Array.isArray(entry)
      && Object.keys(entry).length === 1 && KINDS.has(entry.kind));
}
