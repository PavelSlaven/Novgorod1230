import { deepFreeze } from '@rus/kernel';

const POLICY_SCHEMA = 'rus.items.ordinary_result_admission_policy.v1';
const POLICY_KEYS = new Set([
  'schema', 'version', 'status', 'candidates'
]);
const CANDIDATE_KEYS = new Set([
  'semantic_type', 'name', 'significance', 'allowed_origin_kinds',
  'approved_fact_texts'
]);
const ORIGIN_KINDS = new Set([
  'direct_partition', 'ambient_ordinary', 'crafted'
]);

/**
 * Admits an LLM-proposed ordinary result only through one exact approved
 * semantic record. Text inspection is intentionally not a semantic policy.
 */
export function admitOrdinaryRuntimeResult({ operation, policy } = {}) {
  const policyError = validatePolicy(policy);
  if (policyError) return failed(policyError);
  if (!plain(operation)) return failed('ITEM_ORDINARY_RESULT_OPERATION_INVALID');
  const semanticType = exactText(operation.semantic_type);
  const name = exactText(operation.name);
  const originKind = exactText(operation.origin?.kind);
  const factTexts = Array.isArray(operation.facts)
    ? operation.facts.map((fact) => exactText(fact?.text))
    : null;
  if (!semanticType || !name || !ORIGIN_KINDS.has(originKind)
      || factTexts == null || factTexts.some((value) => !value)) {
    return failed('ITEM_ORDINARY_RESULT_OPERATION_INVALID');
  }
  const matches = policy.candidates.filter((candidate) =>
    candidate.semantic_type === semanticType && candidate.name === name);
  if (matches.length !== 1) {
    return failed('ITEM_ORDINARY_RESULT_POLICY_DATA_GAP', {
      semantic_type: semanticType,
      name,
      match_count: matches.length
    });
  }
  const candidate = matches[0];
  if (candidate.significance !== 'ordinary'
      || !candidate.allowed_origin_kinds.includes(originKind)
      || factTexts.some((value) =>
        !candidate.approved_fact_texts.includes(value))) {
    return failed('ITEM_ORDINARY_RESULT_NOT_APPROVED', {
      semantic_type: semanticType,
      name,
      origin_kind: originKind
    });
  }
  return deepFreeze({
    pass: true,
    admission: { semantic_type: semanticType, name, significance: 'ordinary' },
    errors: []
  });
}

export function admitOrdinaryRuntimeFact({ semantic_type: semanticType,
  name, text, policy } = {}) {
  const policyError = validatePolicy(policy);
  if (policyError) return failed(policyError);
  const matches = policy.candidates.filter((candidate) =>
    candidate.semantic_type === semanticType && candidate.name === name
      && candidate.significance === 'ordinary');
  if (matches.length !== 1) {
    return failed('ITEM_ORDINARY_RESULT_POLICY_DATA_GAP', {
      semantic_type: semanticType ?? null, name: name ?? null,
      match_count: matches.length
    });
  }
  const normalized = exactText(text);
  if (!normalized || !matches[0].approved_fact_texts.includes(normalized)) {
    return failed('ITEM_ORDINARY_RESULT_NOT_APPROVED', {
      semantic_type: semanticType, name, fact_text: normalized || null
    });
  }
  return deepFreeze({
    pass: true,
    admission: { semantic_type: semanticType, name, significance: 'ordinary' },
    errors: []
  });
}

function validatePolicy(policy) {
  if (!exactObject(policy, POLICY_KEYS)
      || policy.schema !== POLICY_SCHEMA
      || policy.version !== 1
      || policy.status !== 'approved'
      || !Array.isArray(policy.candidates)
      || policy.candidates.length === 0) {
    return 'ITEM_ORDINARY_RESULT_POLICY_DATA_GAP';
  }
  for (const candidate of policy.candidates) {
    if (!exactObject(candidate, CANDIDATE_KEYS)
        || !exactText(candidate.semantic_type)
        || !exactText(candidate.name)
        || candidate.significance !== 'ordinary'
        || !exactTextArray(candidate.allowed_origin_kinds)
        || candidate.allowed_origin_kinds.some((value) =>
          !ORIGIN_KINDS.has(value))
        || !exactTextArray(candidate.approved_fact_texts, true)) {
      return 'ITEM_ORDINARY_RESULT_POLICY_DATA_GAP';
    }
  }
  const identities = policy.candidates.map((candidate) =>
    `${candidate.semantic_type}\u0000${candidate.name}`);
  if (new Set(identities).size !== identities.length) {
    return 'ITEM_ORDINARY_RESULT_POLICY_DATA_GAP';
  }
  return null;
}

function exactTextArray(value, allowEmpty = false) {
  return Array.isArray(value)
    && (allowEmpty || value.length > 0)
    && value.every((entry) => Boolean(exactText(entry)))
    && new Set(value).size === value.length;
}

function exactObject(value, keys) {
  return plain(value) && Object.keys(value).length === keys.size
    && Object.keys(value).every((key) => keys.has(key));
}

function exactText(value) {
  return typeof value === 'string' && value.length > 0 && value.trim() === value
    ? value
    : '';
}

function plain(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function failed(code, details = {}) {
  return deepFreeze({
    pass: false,
    admission: null,
    errors: [{
      code,
      category: 'data_gap',
      retryable: false,
      message: code,
      details: structuredClone(details)
    }]
  });
}
