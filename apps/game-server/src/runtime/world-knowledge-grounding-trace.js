import { groundingSufficiencyOf } from './world-knowledge-sufficiency.js';

export function modelSlice(slice, { fromDefaultQuery = false } = {}) {
  return Object.freeze({ schema: slice.schema, pack_ref: slice.pack_ref,
    pack_revision: slice.pack_revision, purpose: slice.purpose,
    coverage: slice.coverage, verdict: slice.verdict,
    sufficiency: groundingSufficiencyOf(slice, { fromDefaultQuery }),
    hard_constraints: slice.hard_constraints, facts: slice.facts,
    disputes: slice.disputes, gaps: slice.gaps,
    context_text: slice.context_text });
}

// Development traces preserve the exact WK boundary, not the full actor-safe
// request. The latter can still carry private state unrelated to retrieval.
export function worldKnowledgeTrace({ request, purpose, semanticInput,
  plannerRequest, plannerPlan, plannerCalls, questionClasses, query, slice,
  retrievalObservability, defaultQuery = false, effectivePlan = null }) {
  const worldKnowledge = traceWorldKnowledgeSlice(slice);
  return Object.freeze({ schema: 'world_knowledge_boundary_trace_v1',
    event: 'world_knowledge_resolved', purpose,
    request_identity: text(request.request_id),
    safe_need: safeNeed(request, semanticInput),
    question_classes: Object.freeze([...questionClasses]),
    planner_identity: plannerIdentity(plannerCalls),
    planner_request: Object.freeze({ schema: plannerRequest.schema,
      pack_ref: plannerRequest.pack_ref, purpose: plannerRequest.purpose,
      input_locale: plannerRequest.input_locale,
      semantic_input: plannerRequest.semantic_input,
      situation_summary: plannerRequest.situation_summary,
      allowed_domains: [...plannerRequest.allowed_domains],
      available_knowledge_refs: [...plannerRequest.available_knowledge_refs],
      planner_limits: { ...plannerRequest.planner_limits } }),
    // planner_plan = raw planner answer; effective_plan only when default_query.
    planner_plan: freezePlan(plannerPlan),
    ...(defaultQuery ? {
      default_query: true,
      effective_plan: freezePlan(effectivePlan ?? plannerPlan)
    } : {}),
    query: Object.freeze({ schema: query.schema, pack_ref: query.pack_ref,
      pack_revision: query.pack_revision, purpose: query.purpose,
      query_locale: query.query_locale, domains: [...query.domains],
      focus_refs: [...query.focus_refs],
      requested_predicates: [...query.requested_predicates],
      search_hints: [...query.search_hints], context: structuredClone(query.context),
      budget: { ...query.budget } }), core_result: worldKnowledge,
    consumer: Object.freeze({ purpose, input: Object.freeze({
      request_schema: text(request.schema), request_identity: text(request.request_id),
      safe_need: safeNeed(request, semanticInput), world_knowledge: worldKnowledge }) }),
    retrieval_observability: retrievalObservability });
}
export function worldKnowledgeNoNeedTrace({ request, purpose, semanticInput,
  plannerRequest, plannerPlan, plannerCalls, questionClasses, worldKnowledge,
  query = null, retrievalObservability = null, defaultQuery = false,
  effectivePlan = null }) {
  const safe = safeNeed(request, semanticInput);
  return Object.freeze({ schema: 'world_knowledge_boundary_trace_v1',
    event: 'world_knowledge_not_required', purpose,
    request_identity: text(request.request_id), safe_need: safe,
    question_classes: Object.freeze([...questionClasses]),
    planner_identity: plannerIdentity(plannerCalls),
    planner_request: Object.freeze({ schema: plannerRequest.schema,
      pack_ref: plannerRequest.pack_ref, purpose: plannerRequest.purpose,
      input_locale: plannerRequest.input_locale,
      semantic_input: plannerRequest.semantic_input,
      situation_summary: plannerRequest.situation_summary,
      allowed_domains: [...plannerRequest.allowed_domains],
      available_knowledge_refs: [...plannerRequest.available_knowledge_refs],
      planner_limits: { ...plannerRequest.planner_limits } }),
    planner_plan: freezePlan(plannerPlan),
    ...(defaultQuery ? {
      default_query: true,
      effective_plan: freezePlan(effectivePlan ?? plannerPlan)
    } : {}),
    query: query == null ? null : Object.freeze({
      schema: query.schema, pack_ref: query.pack_ref,
      pack_revision: query.pack_revision, purpose: query.purpose,
      query_locale: query.query_locale, domains: [...query.domains],
      focus_refs: [...query.focus_refs],
      requested_predicates: [...query.requested_predicates],
      search_hints: [...query.search_hints],
      context: structuredClone(query.context),
      budget: { ...query.budget } }),
    core_result: null,
    consumer: Object.freeze({ purpose, input: Object.freeze({
      request_schema: text(request.schema),
      request_identity: text(request.request_id), safe_need: safe,
      world_knowledge: worldKnowledge }) }),
    retrieval_observability: retrievalObservability });
}
function freezePlan(plan) {
  return Object.freeze({ schema: plan.schema,
    query_locale: plan.query_locale,
    domains: [...(plan.domains ?? [])],
    focus_refs: [...(plan.focus_refs ?? [])],
    requested_predicates: [...(plan.requested_predicates ?? [])],
    search_hints: [...(plan.search_hints ?? [])] });
}
export function noKnowledgeRequirement(bundle, purpose) {
  return Object.freeze({ schema: 'world_knowledge_requirement_v1',
    pack_ref: bundle.manifest.pack_ref,
    pack_revision: bundle.manifest.revision_id, purpose,
    sufficiency: 'NO_KNOWLEDGE_REQUIRED', coverage: Object.freeze([]),
    hard_constraints: Object.freeze([]), facts: Object.freeze([]),
    disputes: Object.freeze([]), gaps: Object.freeze([]) });
}
export function cacheGrounded(cache, request, cacheKey, grounded) {
  const purposeCache = cache.get(request) ?? new Map();
  purposeCache.set(cacheKey, grounded);
  cache.set(request, purposeCache);
}
function safeNeed(request, semanticInput) {
  if (request.schema === 'ordinary_materialization_request_v1') {
    return Object.freeze({ source: 'ordinary_materialization', value: semanticInput });
  }
  for (const key of ['remaining_intent', 'root_player_action', 'utterance_text',
    'semantic_input', 'reason']) {
    if (typeof request[key] === 'string' && request[key].trim()) {
      return Object.freeze({ source: key, value: request[key].trim() });
    }
  }
  return Object.freeze({ source: 'redacted', value: null });
}
function traceWorldKnowledgeSlice(slice) {
  const { context_text, ...structured } = modelSlice(slice);
  return Object.freeze(structured);
}
function plannerIdentity(calls = []) {
  const call = calls.at(-1);
  return Object.freeze({ scope: text(call?.scope) ?? 'turn_runtime',
    role_id: text(call?.role_id) ?? 'world_knowledge_query_planner',
    provider: text(call?.provider), model: text(call?.model) });
}
function text(value) { return typeof value === 'string' ? value : null; }
