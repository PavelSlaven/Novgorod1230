const REQUEST_SCHEMA = 'world_knowledge_query_planner_request_v1';
const PLAN_SCHEMA = 'world_knowledge_query_plan_v1';
const PURPOSES = new Set(['semantic_resolution', 'materialization_support', 'source_grounded_qa', 'npc_decision', 'conversation', 'narration']);

export function validateWorldKnowledgeQueryPlannerRequest(value, bundle) {
  const errors = [];
  if (!object(value) || value.schema !== REQUEST_SCHEMA) return result([`schema must be ${REQUEST_SCHEMA}`]);
  exact(value, ['schema', 'pack_ref', 'purpose', 'input_locale', 'semantic_input', 'situation_summary', 'allowed_domains', 'available_knowledge_refs', 'planner_limits'], 'request', errors);
  if (value.pack_ref !== bundle?.manifest?.pack_ref) errors.push('request pack_ref mismatch');
  if (!PURPOSES.has(value.purpose)) errors.push('request purpose is invalid');
  if (!bundle?.manifest?.supported_locales?.includes(value.input_locale)) errors.push('request input_locale is unsupported');
  text(value.semantic_input, 'request.semantic_input', errors);
  text(value.situation_summary, 'request.situation_summary', errors);
  const domains = strings(value.allowed_domains, 'request.allowed_domains', errors);
  if (domains.some((domain) => !bundle?.manifest?.domains?.includes(domain))) errors.push('request allowed_domains contains an undeclared domain');
  const refs = strings(value.available_knowledge_refs, 'request.available_knowledge_refs', errors, true);
  const approvedRefs = new Set(bundle?.concepts?.filter((concept) => concept.review_status === 'approved').map((concept) => concept.concept_ref));
  if (refs.some((ref) => !approvedRefs.has(ref))) errors.push('request available_knowledge_refs contains an unavailable ref');
  limits(value.planner_limits, errors);
  return result(errors);
}

export function validateWorldKnowledgeQueryPlan(value, request, bundle) {
  const errors = [];
  if (!object(value) || value.schema !== PLAN_SCHEMA) return result([`schema must be ${PLAN_SCHEMA}`]);
  const requestValidation = validateWorldKnowledgeQueryPlannerRequest(request, bundle);
  if (!requestValidation.ok) return result(['planner request is invalid', ...requestValidation.errors]);
  exact(value, ['schema', 'query_locale', 'domains', 'focus_refs', 'requested_predicates', 'search_hints'], 'plan', errors);
  if (!bundle.manifest.supported_locales.includes(value.query_locale)) errors.push('plan query_locale is unsupported');
  const domains = strings(value.domains, 'plan.domains', errors);
  if (domains.length > request.planner_limits.max_domains) errors.push('plan domains exceed max_domains');
  if (domains.some((domain) => !request.allowed_domains.includes(domain))) errors.push('plan domains are not allowed');
  const refs = strings(value.focus_refs, 'plan.focus_refs', errors, true);
  if (refs.length > request.planner_limits.max_focus_refs) errors.push('plan focus_refs exceed max_focus_refs');
  if (refs.some((ref) => !request.available_knowledge_refs.includes(ref))) errors.push('plan focus_refs are unavailable');
  const predicates = strings(value.requested_predicates, 'plan.requested_predicates', errors, true);
  const registered = new Set(domains.flatMap((domain) => Object.keys(bundle.predicate_registry[domain] ?? {})));
  if (predicates.some((predicate) => !registered.has(predicate))) errors.push('plan requested_predicates are not registered for selected domains');
  const hints = strings(value.search_hints, 'plan.search_hints', errors, true);
  if (hints.length > request.planner_limits.max_search_hints) errors.push('plan search_hints exceed max_search_hints');
  return result(errors);
}

function limits(value, errors) {
  if (!object(value)) { errors.push('request.planner_limits must be an object'); return; }
  exact(value, ['max_domains', 'max_search_hints', 'max_focus_refs'], 'request.planner_limits', errors);
  for (const key of ['max_domains', 'max_search_hints', 'max_focus_refs']) {
    if (!Number.isInteger(value[key]) || value[key] <= 0) errors.push(`request.planner_limits.${key} must be a positive integer`);
  }
}

function strings(value, label, errors, allowEmpty = false) {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0) || value.some((entry) => typeof entry !== 'string' || entry.trim() === '')) {
    errors.push(`${label} must be ${allowEmpty ? 'an' : 'a non-empty'} array of strings`);
    return [];
  }
  if (new Set(value).size !== value.length) errors.push(`${label} contains duplicates`);
  return value;
}

function text(value, label, errors) { if (typeof value !== 'string' || value.trim() === '') errors.push(`${label} must be a non-empty string`); }
function object(value) { return value != null && typeof value === 'object' && !Array.isArray(value); }
function exact(value, keys, label, errors) { const allowed = new Set(keys); for (const key of Object.keys(value)) if (!allowed.has(key)) errors.push(`${label}: unknown field ${key}`); for (const key of keys) if (!Object.hasOwn(value, key)) errors.push(`${label}: field ${key} is required`); }
function result(errors) { return Object.freeze({ ok: errors.length === 0, errors: Object.freeze([...errors]) }); }
