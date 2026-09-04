import {
  canAccess, coverageStatus, isApplicable, lexicalCandidates, packCandidates, packContext,
  projectClaim, compareClaims, structuredPrefilter
} from './resolution.js';

const BUNDLE_SCHEMA = 'world_knowledge_runtime_bundle_v1';
const QUERY_SCHEMA = 'world_knowledge_query_v1';
const SLICE_SCHEMA = 'world_knowledge_slice_v1';
const PURPOSES = new Set(['semantic_resolution', 'materialization_support', 'source_grounded_qa', 'npc_decision', 'conversation', 'narration']);
const ACTOR_FACETS = new Set(['occupation_ref', 'role_ref', 'specialist_domain', 'social_status', 'sex_category', 'age_category']);
const CONDITION_FACETS = new Set(['season', 'climate', 'location_type', 'material_state', 'temperature_state', 'moisture_state', 'process_ref']);
const HARD_EXCLUSION_BASES = new Set(['introduced_after_context', 'ceased_before_context', 'not_available_in_region', 'institution_not_existing', 'explicit_domain_incompatibility']);
const ACCESS_CLASSES = new Set(['general_physical', 'common_cultural', 'occupation_bound', 'role_bound', 'specialist_bound', 'domain_internal_only']);
const ACCESS_FACETS = Object.freeze({
  general_physical: [], common_cultural: [], domain_internal_only: [],
  occupation_bound: ['occupation_ref'], role_bound: ['role_ref'],
  specialist_bound: ['specialist_domain']
});
const TYPICALITIES = new Set(['common', 'attested', 'uncommon', 'exceptional', 'unknown']);
const CONFIDENCES = new Set(['high', 'medium', 'low', 'unknown']);
const DIRECTNESSES = new Set(['direct', 'inferred', 'analogical', 'editorial', 'unknown']);
const DEFAULT_BUDGET = Object.freeze({ max_facts: 24, max_candidates: 12, max_context_chars: 7000 });

export class WorldKnowledgeError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'WorldKnowledgeError';
    this.code = code;
    this.details = Object.freeze({ ...details });
  }
}

export function createWorldKnowledgeCore(inputBundle) {
  const bundle = loadBundle(inputBundle);
  const claims = new Map(bundle.claims.map((claim) => [claim.claim_ref, claim]));
  const concepts = new Set(Object.keys(bundle.exact_indexes.concept_by_ref));
  const profiles = bundle.coverage_profiles;
  return Object.freeze({
    resolveWorldKnowledge(query, { vectorScores = null } = {}) {
      const validation = validateWorldKnowledgeQuery(query, bundle);
      if (!validation.ok) throw new WorldKnowledgeError('WORLD_KNOWLEDGE_QUERY_INVALID', validation.errors.join('; '), { errors: validation.errors });
      if (vectorScores != null && (!(vectorScores instanceof Map)
          || bundle.manifest.embedding_profile_ref == null
          || [...vectorScores].some(([ref, score]) =>
            (!claims.has(ref) && !concepts.has(ref))
            || !Number.isFinite(score)))) {
        throw new WorldKnowledgeError('WORLD_KNOWLEDGE_QUERY_INVALID',
          'vector scores are invalid for this bundle');
      }
      const normalized = structuredClone(query);
      normalized.context.conditions ??= {};
      return resolve(bundle, claims, profiles, normalized,
        claimVectorScores(bundle, claims, vectorScores ?? new Map()));
    }
  });
}

function claimVectorScores(bundle, claims, scores) {
  const result = new Map();
  for (const [ref, score] of scores) {
    const targets = claims.has(ref) ? [ref]
      : bundle.exact_indexes.concept_to_claim_refs[ref] ?? [];
    for (const target of targets) {
      result.set(target, Math.max(score, result.get(target) ?? -Infinity));
    }
  }
  return result;
}

export function validateWorldKnowledgeQuery(value, bundle) {
  const errors = [];
  if (!plainObject(value) || value.schema !== QUERY_SCHEMA) return frozenValidation([`schema must be ${QUERY_SCHEMA}`]);
  exactKeys(value, ['schema', 'pack_ref', 'pack_revision', 'purpose', 'query_locale', 'domains', 'focus_refs', 'requested_predicates', 'search_hints', 'context', 'budget'], 'query', errors);
  if (value.pack_ref !== bundle?.manifest?.pack_ref) errors.push('query pack_ref mismatch');
  if (value.pack_revision !== bundle?.manifest?.revision_id) errors.push('query pack_revision mismatch');
  if (!PURPOSES.has(value.purpose)) errors.push('query purpose is invalid');
  if (!bundle?.manifest?.supported_locales?.includes(value.query_locale)) errors.push('query locale is unsupported');
  const domains = strings(value.domains, 'query.domains', errors);
  if (domains.some((domain) => !bundle?.manifest?.domains?.includes(domain))) errors.push('query domain is undeclared');
  strings(value.focus_refs, 'query.focus_refs', errors, true);
  strings(value.requested_predicates, 'query.requested_predicates', errors, true);
  const registeredPredicates = new Set(domains.flatMap((domain) => Object.keys(bundle?.predicate_registry?.[domain] ?? {})));
  if (value.requested_predicates?.some?.((predicate) => !registeredPredicates.has(predicate))) errors.push('query requested_predicates are not registered for selected domains');
  strings(value.search_hints, 'query.search_hints', errors, true);
  validateContext(value.context, errors);
  validateBudget(value.budget, errors);
  return frozenValidation(errors);
}

function resolve(bundle, claimMap, profiles, query, vectorScores) {
  const exactRefs = new Set();
  for (const ref of query.focus_refs) {
    if (claimMap.has(ref)) exactRefs.add(ref);
    for (const claimRef of bundle.exact_indexes.concept_to_claim_refs[ref] ?? []) exactRefs.add(claimRef);
  }
  const lexicalScores = lexicalCandidates(bundle, query);
  const candidateRefs = new Set([...exactRefs, ...lexicalScores.keys(),
    ...vectorScores.keys()]);
  if (query.requested_predicates.length) {
    const domains = new Set(query.domains);
    for (const predicate of query.requested_predicates) for (const ref of bundle.exact_indexes.predicate_to_claim_refs[predicate] ?? []) {
      if (domains.has(claimMap.get(ref)?.domain)) candidateRefs.add(ref);
    }
  } else if (query.focus_refs.length === 0 && query.search_hints.length === 0) {
    for (const domain of query.domains) for (const ref of bundle.exact_indexes.domain_to_claim_refs[domain] ?? []) candidateRefs.add(ref);
  }
  for (const ref of [...candidateRefs]) {
    const group = claimMap.get(ref)?.conflict_group_ref;
    for (const partner of bundle.structured_indexes.conflict_group_to_claim_refs[group] ?? []) {
      candidateRefs.add(partner);
    }
  }

  const structuredRefs = structuredPrefilter(bundle, claimMap, candidateRefs, query.context);
  const allApplicable = [...structuredRefs]
    .map((ref) => claimMap.get(ref))
    .filter(Boolean)
    .filter((claim) => query.domains.includes(claim.domain))
    .filter((claim) => query.requested_predicates.length === 0 || query.requested_predicates.includes(claim.predicate))
    .filter((claim) => isApplicable(claim.applicability, query.context))
    .filter((claim) => canAccess(claim.knowledge_access, query.context.actor_facets, query.purpose));
  const strongestLexical = Math.max(0, ...allApplicable.map((claim) =>
    lexicalScores.get(claim.claim_ref) ?? 0));
  // Relative lexical admission removes incidental common-word hits before
  // authority ranking. Exact, requested-predicate and vector recall stay intact.
  const relevant = allApplicable.filter((claim) => query.search_hints.length === 0
    || exactRefs.has(claim.claim_ref) || query.requested_predicates.length > 0
    || vectorScores.has(claim.claim_ref)
    || (lexicalScores.get(claim.claim_ref) ?? 0) >= strongestLexical / 2);
  const relevantRefs = new Set(relevant.map(({ claim_ref }) => claim_ref));
  const relevantGroups = new Set(relevant.map(({ conflict_group_ref }) =>
    conflict_group_ref).filter(Boolean));
  const admitted = allApplicable.filter((claim) => relevantRefs.has(claim.claim_ref)
    || relevantGroups.has(claim.conflict_group_ref))
    .sort((a, b) => compareClaims(a, b, query, exactRefs, lexicalScores, vectorScores));
  const { selected: applicable, omittedConflictGroups } = packCandidates(admitted, query.budget.max_candidates);

  const coverage = query.domains.map((domain) => ({ domain, status: coverageStatus(domain, profiles, query) }));
  const disputeGroups = new Map();
  for (const claim of applicable) if (claim.conflict_group_ref) {
    const members = disputeGroups.get(claim.conflict_group_ref) ?? [];
    members.push(projectClaim(claim, query.query_locale));
    disputeGroups.set(claim.conflict_group_ref, members);
  }
  const disputedRefs = new Set([...disputeGroups.values()].flat().map((claim) => claim.claim_ref));
  const hardConstraints = applicable.filter((claim) => claim.polarity === 'exclude' && claim.hard_exclusion?.eligible && !disputedRefs.has(claim.claim_ref));
  const facts = applicable.filter((claim) => !hardConstraints.includes(claim) && !disputedRefs.has(claim.claim_ref));
  const selectedHard = hardConstraints.slice(0, query.budget.max_facts).map((claim) => projectClaim(claim, query.query_locale));
  const selectedFacts = facts.slice(0, Math.max(0, query.budget.max_facts - selectedHard.length)).map((claim) => projectClaim(claim, query.query_locale));
  const disputes = [...disputeGroups].sort(([a], [b]) => a.localeCompare(b)).map(([conflict_group_ref, claims]) => ({ conflict_group_ref, claims }));
  const verdict = disputes.length || omittedConflictGroups.length ? 'disputed' : selectedHard.length ? 'excluded' : selectedFacts.length ? 'supported' : 'unresolved';
  const gaps = coverage.filter((entry) => entry.status !== 'covered').map((entry) => ({ domain: entry.domain, status: entry.status }));
  for (const conflict_group_ref of omittedConflictGroups) gaps.push({ domain: query.domains.join(','), status: 'conflict_group_exceeds_candidate_budget', conflict_group_ref });
  if (verdict === 'unresolved' && gaps.length === 0) gaps.push({ domain: query.domains.join(','), status: 'unresolved' });
  const contextText = packContext({ coverage, hardConstraints: selectedHard, facts: selectedFacts, disputes, gaps }, query.budget.max_context_chars);
  return deepFreeze({
    schema: SLICE_SCHEMA,
    pack_ref: bundle.manifest.pack_ref,
    pack_revision: bundle.manifest.revision_id,
    purpose: query.purpose,
    locale: query.query_locale,
    coverage,
    verdict,
    hard_constraints: selectedHard,
    facts: selectedFacts,
    candidates: [],
    disputes,
    gaps,
    evidence_fragments: [],
    context_text: contextText,
  });
}

function loadBundle(value) {
  if (!plainObject(value) || value.schema !== BUNDLE_SCHEMA || !plainObject(value.manifest)
    || !plainObject(value.predicate_registry)
    || !Array.isArray(value.sources) || !Array.isArray(value.evidence) || !Array.isArray(value.concepts)
    || !Array.isArray(value.claims) || !Array.isArray(value.coverage_profiles)
    || !plainObject(value.exact_indexes) || !plainObject(value.lexical_indexes) || !plainObject(value.structured_indexes)) {
    throw new WorldKnowledgeError('WORLD_KNOWLEDGE_UNAVAILABLE', 'compiled World Knowledge bundle is unavailable or invalid');
  }
  const errors = validateBundleRecords(value);
  if (errors.length) throw new WorldKnowledgeError('WORLD_KNOWLEDGE_UNAVAILABLE', `compiled World Knowledge bundle is invalid: ${errors.join('; ')}`, { errors });
  return deepFreeze(structuredClone(value));
}

function validateBundleRecords(bundle) {
  const errors = [];
  const domains = new Set(bundle.manifest.domains ?? []);
  if (typeof bundle.manifest.pack_ref !== 'string' || typeof bundle.manifest.revision_id !== 'string'
    || domains.size === 0 || !Array.isArray(bundle.manifest.supported_locales)) errors.push('manifest is invalid');
  const concepts = new Set(bundle.concepts.filter((record) => record?.review_status === 'approved').map((record) => record.concept_ref));
  const evidence = new Set(bundle.evidence.filter((record) => record?.review_status === 'approved').map((record) => record.evidence_ref));
  const claimRefs = new Set();
  for (const claim of bundle.claims) {
    const label = claim?.claim_ref ?? '<claim>';
    if (!plainObject(claim) || claim.schema !== 'world_knowledge_claim_v1' || claim.review_status !== 'approved') { errors.push(`${label} is not an approved claim`); continue; }
    if (claimRefs.has(label)) errors.push(`${label} is duplicate`);
    claimRefs.add(label);
    if (!domains.has(claim.domain) || !plainObject(bundle.predicate_registry[claim.domain]?.[claim.predicate])) errors.push(`${label} has an unregistered predicate`);
    if (!concepts.has(claim.subject_ref)) errors.push(`${label} has an unavailable subject_ref`);
    if (!Array.isArray(claim.evidence_refs) || claim.evidence_refs.length === 0 || claim.evidence_refs.some((ref) => !evidence.has(ref))) errors.push(`${label} has unavailable evidence`);
    if (!['support', 'exclude'].includes(claim.polarity) || !validApplicability(claim.applicability)) errors.push(`${label} has invalid applicability or polarity`);
    if (!validQualifiers(claim.qualifiers)) errors.push(`${label} has invalid qualifiers`);
    if (!validAccess(claim.knowledge_access)) errors.push(`${label} has invalid knowledge_access`);
    if (!plainObject(claim.localizations) || bundle.manifest.supported_locales.some((locale) => typeof claim.localizations[locale]?.runtime_text !== 'string')) errors.push(`${label} has invalid localizations`);
    if (claim.hard_exclusion != null) {
      const hard = claim.hard_exclusion;
      if (!plainObject(hard) || Object.keys(hard).some((key) => !['eligible', 'basis_kind'].includes(key))
        || hard.eligible !== true || !HARD_EXCLUSION_BASES.has(hard.basis_kind) || claim.polarity !== 'exclude') errors.push(`${label} has invalid hard exclusion`);
    }
  }
  for (const profile of bundle.coverage_profiles) if (!validProfile(profile, domains)) errors.push(`${profile?.profile_ref ?? '<profile>'} is invalid`);
  const exact = bundle.exact_indexes;
  const structured = bundle.structured_indexes;
  const indexMaps = [exact.concept_to_claim_refs, exact.domain_to_claim_refs, exact.predicate_to_claim_refs,
    structured.time_to_claim_refs, structured.place_to_claim_refs, structured.actor_facet_to_claim_refs,
    structured.conflict_group_to_claim_refs];
  if (!plainObject(exact.concept_by_ref) || indexMaps.some((index) => !validIndex(index, claimRefs))) errors.push('compiled claim indexes are invalid');
  const profileRefs = new Set(bundle.coverage_profiles.map((profile) => profile?.profile_ref));
  if (!validIndex(structured.question_class_to_profile_refs, profileRefs)) errors.push('compiled profile indexes are invalid');
  for (const locale of bundle.manifest.supported_locales) {
    if (!validIndex(bundle.lexical_indexes[locale], new Set([...claimRefs, ...concepts]))) errors.push(`lexical index ${locale} is invalid`);
  }
  return errors;
}

function validApplicability(value) {
  if (!plainObject(value)) return false;
  if (value.context_scope === 'universal') return Object.keys(value).length === 1;
  if (!onlyKeys(value, ['context_scope', 'time', 'places', 'actors', 'conditions']) || value.context_scope != null || !['time', 'places', 'actors', 'conditions'].some((key) => value[key] != null)) return false;
  if (value.time != null && !validTime(value.time)) return false;
  if (value.places != null && (!Array.isArray(value.places) || value.places.length === 0 || value.places.some((place) => !plainObject(place) || !onlyKeys(place, ['place_ref', 'relation']) || typeof place.place_ref !== 'string' || !['used_in', 'produced_in', 'origin_in', 'trade_available_in', 'found_in'].includes(place.relation)))) return false;
  if (value.actors != null && !validFacetMap(value.actors)) return false;
  return value.conditions == null || (Array.isArray(value.conditions) && value.conditions.length > 0 && value.conditions.every(validCondition));
}

function validTime(value) {
  if (!plainObject(value) || !['exact', 'range', 'circa', 'century_part', 'before', 'after', 'unknown'].includes(value.precision)) return false;
  if (value.precision === 'unknown') return value.year == null && value.from == null && value.to == null;
  if (['exact', 'circa', 'before', 'after'].includes(value.precision)) return Number.isInteger(value.year) && value.from == null && value.to == null;
  return Number.isInteger(value.from) && Number.isInteger(value.to) && value.from <= value.to && value.year == null;
}

function validQualifiers(value) {
  return plainObject(value) && TYPICALITIES.has(value.typicality) && CONFIDENCES.has(value.confidence) && DIRECTNESSES.has(value.directness);
}

function validAccess(value) {
  if (!plainObject(value) || !ACCESS_CLASSES.has(value.class)
      || !onlyKeys(value, ['class', 'required_facets', 'required_values'])
      || !Array.isArray(value.required_facets)
      || value.required_facets.length !== ACCESS_FACETS[value.class].length
      || new Set(value.required_facets).size !== value.required_facets.length
      || value.required_facets.some((facet) =>
        !ACCESS_FACETS[value.class].includes(facet))) return false;
  if (value.required_values == null) return true;
  if (!plainObject(value.required_values)
      || Object.keys(value.required_values).length === 0) return false;
  return Object.entries(value.required_values).every(([facet, expected]) =>
    value.required_facets.includes(facet) && validAccessValue(expected));
}

function validAccessValue(value) {
  const values = Array.isArray(value) ? value : [value];
  return values.length > 0 && values.every((entry) =>
    typeof entry === 'string' && entry.trim() === entry && entry.length > 0);
}

function validProfile(value, domains) {
  if (!plainObject(value) || !domains.has(value.domain) || !['experimental', 'reviewed', 'production'].includes(value.status)
    || !plainObject(value.scope) || !Array.isArray(value.purposes) || value.purposes.length === 0 || value.purposes.some((purpose) => !PURPOSES.has(purpose))
    || !Array.isArray(value.question_classes) || value.question_classes.length === 0 || value.question_classes.some((item) => typeof item !== 'string' || !item.trim())
    || !['not_active', 'optional', 'required_when_selected'].includes(value.runtime_requirement)
    || !plainObject(value.guard) || !['advisory', 'explicit_exclusion', 'reference_required'].includes(value.guard.mode)) return false;
  if (value.scope.context_scope === 'universal') return Object.keys(value.scope).length === 1;
  if (!onlyKeys(value.scope, ['context_scope', 'time', 'places', 'actor_facets']) || value.scope.context_scope != null || !['time', 'places', 'actor_facets'].some((key) => value.scope[key] != null)) return false;
  if (value.scope.places != null && (!Array.isArray(value.scope.places) || value.scope.places.length === 0 || value.scope.places.some((item) => typeof item !== 'string' || !item.trim()))) return false;
  if (value.scope.actor_facets != null && !validFacetMap(value.scope.actor_facets)) return false;
  const time = value.scope.time;
  return time == null || (time.precision == null
    ? (Number.isInteger(time.year) || (Number.isInteger(time.from) && Number.isInteger(time.to) && time.from <= time.to))
    : validTime(time));
}

function validFacetMap(value) {
  return plainObject(value) && Object.keys(value).length > 0 && Object.entries(value).every(([key, facet]) => ACTOR_FACETS.has(key)
    && ((typeof facet === 'string' && facet.trim()) || typeof facet === 'boolean'
      || (Array.isArray(facet) && facet.length > 0 && facet.every((item) => typeof item === 'string' && item.trim()))));
}

function validCondition(value) {
  if (!plainObject(value) || !onlyKeys(value, ['facet', 'operator', 'value']) || !CONDITION_FACETS.has(value.facet)
    || !['equals', 'includes', 'present'].includes(value.operator)) return false;
  if (value.operator === 'present') return value.value == null;
  return typeof value.value === 'boolean' || Number.isFinite(value.value) || (typeof value.value === 'string' && value.value.trim())
    || (Array.isArray(value.value) && value.value.length > 0 && value.value.every((item) => typeof item === 'string' && item.trim()));
}

function onlyKeys(value, allowed) { const keys = new Set(allowed); return Object.keys(value).every((key) => keys.has(key)); }

function validIndex(value, refs) {
  return plainObject(value) && Object.values(value).every((entries) => Array.isArray(entries)
    && entries.every((ref) => refs.has(ref)));
}

function validateContext(value, errors) {
  if (!plainObject(value)) { errors.push('query.context must be an object'); return; }
  exactKeys(value, ['time', 'place_refs', 'actor_facets', 'conditions'], 'query.context', errors, ['time', 'place_refs', 'actor_facets']);
  if (!plainObject(value.time) || !Number.isInteger(value.time.year)) errors.push('query.context.time.year is required');
  else exactKeys(value.time, ['year'], 'query.context.time', errors);
  strings(value.place_refs, 'query.context.place_refs', errors, true);
  if (!plainObject(value.actor_facets)) errors.push('query.context.actor_facets must be an object');
  else {
    for (const [key, facet] of Object.entries(value.actor_facets)) {
      if (!ACTOR_FACETS.has(key)) errors.push(`query.context.actor_facets: unknown field ${key}`);
      if (!(typeof facet === 'string' && facet.trim()) && !(Array.isArray(facet) && facet.length > 0 && facet.every((item) => typeof item === 'string' && item.trim()))) {
        errors.push(`query.context.actor_facets.${key} must be a string or non-empty string array`);
      }
    }
  }
  if (value.conditions != null && !plainObject(value.conditions)) errors.push('query.context.conditions must be an object');
  else if (value.conditions != null) for (const [key, condition] of Object.entries(value.conditions)) {
    if (!CONDITION_FACETS.has(key)) errors.push(`query.context.conditions: unknown field ${key}`);
    const valid = typeof condition === 'boolean' || Number.isFinite(condition) || (typeof condition === 'string' && condition.trim())
      || (Array.isArray(condition) && condition.length > 0 && condition.every((item) => typeof item === 'string' && item.trim()));
    if (!valid) errors.push(`query.context.conditions.${key} is invalid`);
  }
}

function validateBudget(value, errors) {
  if (!plainObject(value)) { errors.push('query.budget must be an object'); return; }
  exactKeys(value, Object.keys(DEFAULT_BUDGET), 'query.budget', errors);
  for (const key of Object.keys(DEFAULT_BUDGET)) if (!Number.isInteger(value[key]) || value[key] <= 0) errors.push(`query.budget.${key} must be a positive integer`);
}

function strings(value, label, errors, allowEmpty = false) {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0) || value.some((item) => typeof item !== 'string' || item.trim() === '')) {
    errors.push(`${label} must be ${allowEmpty ? 'an' : 'a non-empty'} array of strings`);
    return [];
  }
  if (new Set(value).size !== value.length) errors.push(`${label} contains duplicates`);
  return value;
}

function exactKeys(value, allowed, label, errors, required = allowed) {
  if (!plainObject(value)) return;
  const set = new Set(allowed);
  for (const key of Object.keys(value)) if (!set.has(key)) errors.push(`${label}: unknown field ${key}`);
  for (const key of required) if (!Object.hasOwn(value, key)) errors.push(`${label}: field ${key} is required`);
}

function plainObject(value) { return value != null && typeof value === 'object' && !Array.isArray(value); }
function frozenValidation(errors) { return Object.freeze({ ok: errors.length === 0, errors: Object.freeze([...errors]) }); }
function deepFreeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.freeze(value); for (const nested of Object.values(value)) deepFreeze(nested); return value; }
