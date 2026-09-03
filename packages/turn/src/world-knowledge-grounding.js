import { deepFreeze } from '@rus/kernel';
import { validateWorldKnowledgeQueryPlan, validateWorldKnowledgeQueryPlannerRequest } from '@rus/world-knowledge';
import { turnFailure } from './errors.js';

export async function requestWorldKnowledgeQueryPlan({ request, bundle, plannerModel } = {}) {
  const requestValidation = validateWorldKnowledgeQueryPlannerRequest(request, bundle);
  if (!requestValidation.ok) throw turnFailure('TURN_WORLD_KNOWLEDGE_PLANNER_REQUEST_INVALID', 'World Knowledge planner request is invalid.', { errors: requestValidation.errors });
  if (typeof plannerModel !== 'function') throw turnFailure('TURN_WORLD_KNOWLEDGE_PLANNING_UNAVAILABLE', 'World Knowledge query planner is unavailable.');
  const safeRequest = deepFreeze(structuredClone(request));
  let output = await plannerModel(safeRequest, null);
  let validation = validateWorldKnowledgeQueryPlan(output, safeRequest, bundle);
  if (validation.ok) return deepFreeze({ plan: structuredClone(output), repaired: false });
  const repair = deepFreeze({
    schema: 'world_knowledge_query_plan_repair_v1',
    original_output: structuredClone(output),
    structural_errors: [...validation.errors]
  });
  output = await plannerModel(safeRequest, repair);
  validation = validateWorldKnowledgeQueryPlan(output, safeRequest, bundle);
  if (!validation.ok) throw turnFailure('TURN_WORLD_KNOWLEDGE_QUERY_PLAN_INVALID', 'World Knowledge query plan and its one repair are invalid.', { errors: validation.errors, repair_attempted: true });
  return deepFreeze({ plan: structuredClone(output), repaired: true });
}

export async function resolveTurnStepWorldKnowledge({ mode, core, bundle, exactQuery = null,
  plannerRequest = null, authoritative = null, plannerModel = null } = {}) {
  if (mode === 'NONE') return null;
  if (!core || typeof core.resolveWorldKnowledge !== 'function') throw turnFailure('TURN_WORLD_KNOWLEDGE_UNAVAILABLE', 'World Knowledge Core is unavailable.');
  if (mode === 'EXACT') return deepFreeze({
    slice: await core.resolveWorldKnowledge(exactQuery), planner_called: false, repaired: false
  });
  if (mode !== 'RETRIEVE') throw turnFailure('TURN_WORLD_KNOWLEDGE_NEED_INVALID', 'World Knowledge need mode is invalid.');
  if (!authoritative || typeof authoritative.pack_revision !== 'string'
    || authoritative.context == null || authoritative.budget == null) {
    throw turnFailure('TURN_WORLD_KNOWLEDGE_CONTEXT_INVALID', 'Authoritative World Knowledge context is invalid.');
  }
  const planned = await requestWorldKnowledgeQueryPlan({ request: plannerRequest, bundle, plannerModel });
  const query = {
    schema: 'world_knowledge_query_v1',
    pack_ref: plannerRequest.pack_ref,
    pack_revision: authoritative.pack_revision,
    purpose: plannerRequest.purpose,
    query_locale: planned.plan.query_locale,
    domains: planned.plan.domains,
    focus_refs: planned.plan.focus_refs,
    requested_predicates: planned.plan.requested_predicates,
    search_hints: planned.plan.search_hints,
    context: structuredClone(authoritative.context),
    budget: structuredClone(authoritative.budget)
  };
  return deepFreeze({
    slice: await core.resolveWorldKnowledge(query),
    planner_called: true,
    repaired: planned.repaired
  });
}
