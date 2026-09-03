const ACTOR_FACING_PURPOSES = new Set(['npc_decision', 'conversation', 'narration']);

export function lexicalCandidates(bundle, query) {
  const scores = new Map();
  for (const token of tokenize(query.search_hints.join(' '))) for (const ref of bundle.lexical_indexes[query.query_locale]?.[token] ?? []) {
    const targets = ref.startsWith('claim:') ? [ref] : bundle.exact_indexes.concept_to_claim_refs[ref] ?? [];
    for (const target of targets) scores.set(target, (scores.get(target) ?? 0) + 1);
  }
  return scores;
}

export function structuredPrefilter(bundle, claimMap, refs, context) {
  let selected = [...refs];
  if (Number.isInteger(context.time?.year)) {
    const matching = new Set();
    for (const [key, claimRefs] of Object.entries(bundle.structured_indexes.time_to_claim_refs)) {
      if (structuredTimeKeyMatches(key, context.time.year)) for (const ref of claimRefs) matching.add(ref);
    }
    selected = selected.filter((ref) => !claimMap.get(ref)?.applicability?.time || matching.has(ref));
  }
  if (context.place_refs.length) {
    const matching = new Set(context.place_refs.flatMap((place) => bundle.structured_indexes.place_to_claim_refs[place] ?? []));
    selected = selected.filter((ref) => !claimMap.get(ref)?.applicability?.places || matching.has(ref));
  }
  for (const [facet, value] of Object.entries(context.actor_facets)) {
    const values = Array.isArray(value) ? value : [value];
    const matching = new Set(values.flatMap((item) => bundle.structured_indexes.actor_facet_to_claim_refs[`${facet}=${item}`] ?? []));
    selected = selected.filter((ref) => claimMap.get(ref)?.applicability?.actors?.[facet] == null || matching.has(ref));
  }
  return selected;
}

function structuredTimeKeyMatches(key, year) {
  if (key === 'universal') return true;
  const [precision, exactYear, from, to] = key.split(':');
  return timeMatches({ precision, ...(exactYear ? { year: Number(exactYear) } : {}), ...(from ? { from: Number(from) } : {}), ...(to ? { to: Number(to) } : {}) }, year);
}

export function packCandidates(claims, limit) {
  const groups = new Map();
  for (const claim of claims) if (claim.conflict_group_ref) {
    const members = groups.get(claim.conflict_group_ref) ?? [];
    members.push(claim);
    groups.set(claim.conflict_group_ref, members);
  }
  const selected = [];
  const visitedGroups = new Set();
  const omittedConflictGroups = [];
  for (const claim of claims) {
    if (!claim.conflict_group_ref) { if (selected.length < limit) selected.push(claim); continue; }
    if (visitedGroups.has(claim.conflict_group_ref)) continue;
    visitedGroups.add(claim.conflict_group_ref);
    const members = groups.get(claim.conflict_group_ref);
    if (selected.length + members.length <= limit) selected.push(...members);
    else omittedConflictGroups.push(claim.conflict_group_ref);
  }
  return { selected, omittedConflictGroups };
}

export function isApplicable(applicability, context) {
  if (applicability.context_scope === 'universal') return true;
  const time = applicability.time;
  if (time && !timeMatches(time, context.time?.year)) return false;
  if (applicability.places && !applicability.places.some((place) => context.place_refs.includes(place.place_ref))) return false;
  if (applicability.actors && !Object.entries(applicability.actors).every(([key, expected]) => matchesFacet(context.actor_facets[key], expected))) return false;
  if (applicability.conditions && !applicability.conditions.every((condition) => conditionMatches(condition, context.conditions))) return false;
  return true;
}

function timeMatches(time, year) {
  if (!Number.isInteger(year)) return false;
  if (time.precision == null) return time.year != null ? year === time.year : year >= time.from && year <= time.to;
  if (['exact', 'circa'].includes(time.precision)) return year === time.year;
  if (['range', 'century_part'].includes(time.precision)) return year >= time.from && year <= time.to;
  if (time.precision === 'before') return year < time.year;
  if (time.precision === 'after') return year > time.year;
  return time.precision === 'unknown';
}

function conditionMatches(condition, values) {
  const actual = values[condition.facet];
  if (condition.operator === 'present') return actual != null;
  if (condition.operator === 'includes') return Array.isArray(actual) && actual.includes(condition.value);
  return matchesFacet(actual, condition.value);
}

function matchesFacet(actual, expected) {
  const expectedValues = Array.isArray(expected) ? expected : [expected];
  const actualValues = Array.isArray(actual) ? actual : [actual];
  return expectedValues.some((value) => actualValues.includes(value));
}

export function canAccess(access, actorFacets, purpose) {
  if (!ACTOR_FACING_PURPOSES.has(purpose)) return true;
  if (access.class === 'domain_internal_only') return false;
  return access.required_facets.every((facet) => actorFacets[facet] != null);
}

export function coverageStatus(domain, profiles, query) {
  const matches = profiles.filter((profile) => profile.domain === domain && profile.purposes.includes(query.purpose) && scopeMatches(profile.scope, query.context));
  if (matches.some((profile) => profile.status === 'production' && profile.runtime_requirement !== 'not_active')) return 'covered';
  if (matches.length) return 'partial';
  return 'out_of_scope';
}

function scopeMatches(scope, context) {
  if (scope.context_scope === 'universal') return true;
  if (scope.time && !timeMatches(scope.time, context.time?.year)) return false;
  if (scope.places && !scope.places.some((place) => context.place_refs.includes(place))) return false;
  if (scope.actor_facets && !Object.entries(scope.actor_facets).every(([key, value]) => matchesFacet(context.actor_facets[key], value))) return false;
  return true;
}

export function rank(claim, query, exactRefs, lexicalScores,
  vectorScores = new Map()) {
  return (claim.hard_exclusion?.eligible ? 1_000_000 : 0)
    + (exactRefs.has(claim.claim_ref) ? 100_000 : 0)
    + (query.requested_predicates.includes(claim.predicate) ? 10_000 : 0)
    + specificity(claim.applicability) * 100
    + qualifierScore(claim.qualifiers)
    + (lexicalScores.get(claim.claim_ref) ?? 0)
    + (vectorScores.get(claim.claim_ref) ?? 0);
}

function specificity(value) { return value.context_scope === 'universal' ? 0 : ['time', 'places', 'actors', 'conditions'].filter((key) => value[key] != null).length; }
function qualifierScore(value) { return ({ high: 30, medium: 20, low: 10, unknown: 0 }[value.confidence] ?? 0) + ({ direct: 3, inferred: 2, analogical: 1, editorial: 0, unknown: 0 }[value.directness] ?? 0); }

export function projectClaim(claim, locale) {
  return {
    claim_ref: claim.claim_ref,
    domain: claim.domain,
    predicate: claim.predicate,
    polarity: claim.polarity,
    object: structuredClone(claim.object),
    runtime_text: claim.localizations?.[locale]?.runtime_text ?? '',
    qualifiers: structuredClone(claim.qualifiers),
    evidence_refs: [...claim.evidence_refs]
  };
}

export function packContext(slice, limit) {
  const lines = [
    ...slice.coverage.map((entry) => `COVERAGE ${entry.domain}: ${entry.status}`),
    ...slice.hardConstraints.map((claim) => `HARD ${claim.claim_ref}: ${claim.runtime_text}`),
    ...slice.facts.map((claim) => `FACT ${claim.claim_ref}: ${claim.runtime_text}`),
    ...slice.disputes.map((group) => `DISPUTE ${group.conflict_group_ref}: ${group.claims.map((claim) => claim.claim_ref).join(', ')}`),
    ...slice.gaps.map((gap) => `GAP ${gap.domain}: ${gap.status}`)
  ];
  let result = '';
  for (const line of lines) {
    const next = result ? `${result}\n${line}` : line;
    if (next.length > limit) break;
    result = next;
  }
  return result;
}

function tokenize(value) { return value.toLocaleLowerCase().normalize('NFKC').match(/[\p{L}\p{N}]{2,}/gu) ?? []; }
