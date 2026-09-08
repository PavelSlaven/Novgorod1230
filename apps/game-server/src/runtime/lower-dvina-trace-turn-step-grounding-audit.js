import { serverError } from '../errors.js';

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
  'For discovery, the operation must cover the earliest focused information',
  'need. A fixed authored query must not replace a different ordinary search,',
  'material prerequisite, handling, or transformation.',
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
  return async ({ plan, request }) => {
    const audited = (plan?.operations ?? []).filter((operation) =>
      operation?.op === 'request_discovery'
        || operation?.op === 'request_item_use'
          && operation.action_production != null);
    if (audited.length === 0) return true;
    const response = await roleRunner.run({
      scope: 'turn_runtime', role_id: 'turn_step_grounding_auditor',
      request_identity: request.request_id,
      messages: [{ role: 'system', content: PROMPT }, { role: 'user',
        content: JSON.stringify({ remaining_intent: request.remaining_intent,
          player_safe_state: groundingState(request.player_safe_state),
          operations: audited, continuation: plan.continuation }) }],
      overrides: { temperature: 0, maxTokens: 2_000 }
    });
    if (!valid(response?.output)) throw serverError(
      'TRACE_TURN_STEP_GROUNDING_AUDIT_INVALID',
      'Turn-step grounding auditor returned an invalid result.', { status: 503 }
    );
    if (response.output.pass) return true;
    throw serverError('TURN_STEP_PLAN_INVALID',
      'Turn-step semantic grounding is invalid.', { details: { errors:
        response.output.concerns.map(({ kind }) => concern(kind)) } });
  };
}

function groundingState(state = {}) {
  return {
    actor_id: state.actor_id, position: state.position,
    items: state.items ?? [], inventory: state.inventory ?? {},
    current_visible_context: state.current_visible_context ?? null,
    visible_context: state.visible_context ?? null,
    ordinary_resolution: state.ordinary_resolution ?? null
  };
}

function concern(kind) {
  const path = kind === 'operation_semantic_grounding' ? '$.operations'
    : kind === 'source_semantic_grounding'
      ? '$.operations.0.action_production.source_refs'
      : kind === 'source_placement_grounding'
        ? '$.operations.0.action_production.result_descriptor'
        : kind === 'material_transformation_grounding'
          ? '$.operations.0.action_production'
          : '$.operations.0.action_production.identity_mode';
  return { path, rule: kind, code: kind,
    message: 'must remain grounded by the current intent and player-safe evidence' };
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
