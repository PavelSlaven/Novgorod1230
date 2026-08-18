import {
  assertOrdinaryMaterializationRequestV1,
  ORDINARY_MATERIALIZATION_REQUEST_V1_SCHEMA
} from '@rus/contracts/ordinary-materialization-v1';
import {
  createOrdinaryCandidateKey,
  createOrdinaryCategoryKey,
  canonicalDigest,
  createOrdinaryContextVersion,
  createOrdinaryCoverageKey
} from '@rus/materialization';

/**
 * Builds the candidate-free Stage A request from one committed server snapshot.
 * This boundary intentionally has no action, candidate, narration, or actor input.
 */
export function buildOrdinaryMaterializationSeedScopeRequest(input = {}) {
  const outer = exactRecord(input, ['objective_context'],
    'ORDINARY_SEED_REQUEST_INPUT_INVALID');
  const context = exactRecord(outer.objective_context, [
    'request_id', 'scope_ref', 'context_refs', 'policy_refs',
    'ordinary_state', 'technical_limits'
  ], 'ORDINARY_SEED_REQUEST_OBJECTIVE_INVALID');
  const request = copyJson({
    schema: ORDINARY_MATERIALIZATION_REQUEST_V1_SCHEMA,
    request_id: context.request_id,
    mode: 'seed_scope',
    scope_ref: context.scope_ref,
    context_refs: context.context_refs,
    policy_refs: context.policy_refs,
    ordinary_state: context.ordinary_state,
    candidate_query: null,
    technical_limits: context.technical_limits
  }, 'ORDINARY_SEED_REQUEST_OBJECTIVE_INVALID');
  try {
    assertOrdinaryMaterializationRequestV1(request);
  } catch (error) {
    throw Object.assign(new TypeError('Committed ordinary seed context is invalid.'), {
      code: 'ORDINARY_SEED_REQUEST_OBJECTIVE_INVALID', cause: error
    });
  }
  return freezeJson(request);
}

/** Builds the closed Stage B request from server-classified candidate data. */
export function buildOrdinaryMaterializationPresenceRequest(input = {}) {
  const outer = exactRecord(input, ['objective_context', 'candidate_context'],
    'ORDINARY_PRESENCE_REQUEST_INPUT_INVALID');
  const context = exactRecord(outer.objective_context, [
    'request_id', 'scope_ref', 'context_refs', 'policy_refs',
    'ordinary_state', 'technical_limits', 'ordinary_state_version',
    'property_placement_context'
  ], 'ORDINARY_PRESENCE_REQUEST_OBJECTIVE_INVALID');
  const candidate = exactRecord(outer.candidate_context, [
    'normalized_candidate_ref', 'normalizer_version', 'semantic_type',
    'candidate_hint', 'functional_bucket', 'admission_class',
    'availability_class', 'coverage_kind', 'coverage_ref', 'policy_version'
  ], 'ORDINARY_PRESENCE_REQUEST_CANDIDATE_INVALID');
  const contextRefs = copyJson(context.context_refs,
    'ORDINARY_PRESENCE_REQUEST_OBJECTIVE_INVALID');
  const scopeRef = copyJson(context.scope_ref,
    'ORDINARY_PRESENCE_REQUEST_OBJECTIVE_INVALID');
  const policyRefs = copyJson(context.policy_refs,
    'ORDINARY_PRESENCE_REQUEST_OBJECTIVE_INVALID');
  const propertyPlacementContext = exactRecord(copyJson(
    context.property_placement_context,
    'ORDINARY_PRESENCE_REQUEST_OBJECTIVE_INVALID'), [
    'scope_ref', 'item_kind', 'property_catalog_version_ref',
    'placement_catalog_version_ref', 'personal_communal_refs', 'occupied_site_refs',
    'unowned_cause_refs', 'placement_context_refs', 'property_catalog',
    'placement_catalog'
  ], 'ORDINARY_PRESENCE_REQUEST_OBJECTIVE_INVALID');
  if (JSON.stringify(propertyPlacementContext.scope_ref) !== JSON.stringify(scopeRef)
      || propertyPlacementContext.item_kind !== 'man_made') {
    throw Object.assign(new TypeError('Property placement context must be pinned to the G6 scope.'), {
      code: 'ORDINARY_PRESENCE_REQUEST_OBJECTIVE_INVALID'
    });
  }
  const propertyPlacementContextDigest = canonicalDigest({
    domain: 'rus.items.ordinary_world_property_placement_context.v1',
    ...propertyPlacementContext
  });
  if (candidate.policy_version !== policyRefs.ordinary_presence_policy_ref) {
    throw Object.assign(new TypeError('Presence policy version must be pinned by the objective.'), {
      code: 'ORDINARY_PRESENCE_REQUEST_CANDIDATE_INVALID'
    });
  }
  let candidate_key;
  let coverage_key;
  let category_key;
  try {
    candidate_key = createOrdinaryCandidateKey({ scope_ref: scopeRef,
      normalized_candidate_ref: candidate.normalized_candidate_ref,
      normalizer_version: candidate.normalizer_version,
      functional_bucket: candidate.functional_bucket,
      admission_class: candidate.admission_class,
      availability_class: candidate.availability_class,
      policy_version: candidate.policy_version });
    coverage_key = createOrdinaryCoverageKey({ scope_ref: scopeRef,
      coverage_kind: candidate.coverage_kind, coverage_ref: candidate.coverage_ref,
      policy_version: candidate.policy_version });
    category_key = createOrdinaryCategoryKey({ scope_ref: scopeRef,
      functional_bucket: candidate.functional_bucket,
      admission_class: candidate.admission_class,
      availability_class: candidate.availability_class,
      policy_version: candidate.policy_version });
  } catch (error) {
    throw Object.assign(new TypeError('Committed ordinary presence candidate is invalid.'), {
      code: 'ORDINARY_PRESENCE_REQUEST_CANDIDATE_INVALID', cause: error
    });
  }
  const request = copyJson({
    schema: ORDINARY_MATERIALIZATION_REQUEST_V1_SCHEMA,
    request_id: context.request_id, mode: 'resolve_presence',
    scope_ref: scopeRef, context_refs: contextRefs,
    policy_refs: policyRefs, ordinary_state: context.ordinary_state,
    candidate_query: { candidate_key, candidate_hint: candidate.candidate_hint,
      coverage_key, evidence_weight: 0 }, technical_limits: context.technical_limits
  }, 'ORDINARY_PRESENCE_REQUEST_INPUT_INVALID');
  try { assertOrdinaryMaterializationRequestV1(request); } catch (error) {
    throw Object.assign(new TypeError('Committed ordinary presence context is invalid.'), {
      code: 'ORDINARY_PRESENCE_REQUEST_OBJECTIVE_INVALID', cause: error
    });
  }
  const context_version = createOrdinaryContextVersion({ scope_ref: scopeRef,
    context_refs: contextRefs,
    ordinary_presence_policy_ref: policyRefs.ordinary_presence_policy_ref,
    property_basis_ref: contextRefs.property_context_ref,
    property_placement_context_digest: propertyPlacementContextDigest });
  const identity = copyJson({ candidate_key, coverage_key, category_key, context_version,
    normalized_candidate_ref: candidate.normalized_candidate_ref,
    normalizer_version: candidate.normalizer_version,
    semantic_type: candidate.semantic_type, coverage_kind: candidate.coverage_kind,
    coverage_ref: candidate.coverage_ref, policy_version: candidate.policy_version,
    functional_bucket: candidate.functional_bucket,
    admission_class: candidate.admission_class,
    availability_class: candidate.availability_class
  }, 'ORDINARY_PRESENCE_REQUEST_INPUT_INVALID');
  return freezeJson(copyJson({
    schema: 'ordinary_materialization_presence_envelope_v1', request, identity,
    ordinary_state_version: context.ordinary_state_version,
    property_placement_context: propertyPlacementContext,
    property_placement_context_digest: propertyPlacementContextDigest
  }, 'ORDINARY_PRESENCE_REQUEST_INPUT_INVALID'));
}

function exactRecord(value, keys, code) {
  if (value == null || typeof value !== 'object' || Array.isArray(value)
      || (Object.getPrototypeOf(value) !== Object.prototype
        && Object.getPrototypeOf(value) !== null)
      || Object.getOwnPropertySymbols(value).length !== 0) {
    throw Object.assign(new TypeError('Expected an exact plain data record.'), { code });
  }
  const names = Object.getOwnPropertyNames(value);
  if (names.length !== keys.length || keys.some((key) => !names.includes(key))) {
    throw Object.assign(new TypeError('Expected an exact closed record.'), { code });
  }
  const result = {};
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor?.enumerable !== true || !Object.hasOwn(descriptor, 'value')) {
      throw Object.assign(new TypeError('Accessors are not accepted.'), { code });
    }
    result[key] = descriptor.value;
  }
  return result;
}

function copyJson(value, code, seen = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean'
      || (typeof value === 'number' && Number.isFinite(value))) return value;
  if (typeof value !== 'object' || seen.has(value)) {
    throw Object.assign(new TypeError('Expected JSON data.'), { code });
  }
  seen.add(value);
  let result;
  if (Array.isArray(value)) {
    const names = Object.getOwnPropertyNames(value);
    if (Object.getPrototypeOf(value) !== Array.prototype
        || Object.getOwnPropertySymbols(value).length !== 0
        || names.length !== value.length + 1 || !names.includes('length')
        || Array.from({ length: value.length }, (_, index) => String(index))
          .some((key) => !names.includes(key))) {
      throw Object.assign(new TypeError('Expected a dense JSON array.'), { code });
    }
    result = Array.from({ length: value.length }, (_, index) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (descriptor?.enumerable !== true || !Object.hasOwn(descriptor, 'value')) {
        throw Object.assign(new TypeError('Accessors are not accepted.'), { code });
      }
      return copyJson(descriptor.value, code, seen);
    });
  } else {
    const source = exactRecord(value, Object.getOwnPropertyNames(value), code);
    result = Object.fromEntries(Object.entries(source).map(([key, entry]) => [
      key, copyJson(entry, code, seen)
    ]));
  }
  return result;
}

function freezeJson(value) {
  if (value == null || typeof value !== 'object' || Object.isFrozen(value)) {
    return value;
  }
  for (const child of Object.values(value)) freezeJson(child);
  return Object.freeze(value);
}
