import { deepFreeze } from './manifest.js';
import { knowledgeSourceError } from '../errors.js';

const SCHEMA = 'rus.knowledge_retrieval_policy.v1';
const PRIORITY_TIERS = new Set([
  'highest_materialization_normative',
  'profile_normative',
  'development_process_normative',
  'technical_contract',
  'navigation',
  'reference'
]);
const COVERAGE_DISPOSITIONS = new Set(['covered', 'baseline_gap', 'required_before_merge']);

export function validateRetrievalPolicy(value, manifest) {
  if (!value || typeof value !== 'object' || value.schema_version !== SCHEMA) {
    throw knowledgeSourceError('RETRIEVAL_POLICY_INVALID', `Retrieval policy must use ${SCHEMA}.`);
  }
  if (!manifest || !Array.isArray(manifest.documents)) {
    throw knowledgeSourceError('RETRIEVAL_POLICY_INVALID', 'Validated corpus manifest is required.');
  }
  const knownIds = new Set(manifest.documents.map((item) => item.document_id));
  const metadataInput = Array.isArray(value.documents) ? value.documents : [];
  const metadataIds = new Set();
  const documents = metadataInput.map((item, index) => normalizeMetadata(item, index, knownIds, metadataIds));
  const missing = [...knownIds].filter((id) => !metadataIds.has(id)).sort();
  if (missing.length) {
    throw knowledgeSourceError('RETRIEVAL_POLICY_INCOMPLETE', 'Retrieval policy does not cover every registered document.', {
      missing_document_ids: missing
    });
  }
  const controls = normalizeControlQueries(value.control_queries, knownIds);
  return deepFreeze({
    schema_version: SCHEMA,
    policy_version: requiredText(value.policy_version, 'policy_version'),
    baseline_manifest_sha256: validateDigest(value.baseline_manifest_sha256, 'baseline_manifest_sha256'),
    default_statuses: normalizeStatuses(value.default_statuses ?? ['active'], 'default_statuses'),
    documents,
    control_queries: controls
  });
}

function normalizeMetadata(item, index, knownIds, metadataIds) {
  if (!item || typeof item !== 'object') {
    throw knowledgeSourceError('RETRIEVAL_POLICY_INVALID', `documents[${index}] must be an object.`);
  }
  const id = requiredText(item.document_id, `documents[${index}].document_id`);
  if (!knownIds.has(id)) throw knowledgeSourceError('RETRIEVAL_POLICY_INVALID', `Unknown retrieval document_id: ${id}`);
  if (metadataIds.has(id)) throw knowledgeSourceError('RETRIEVAL_POLICY_INVALID', `Duplicate retrieval document_id: ${id}`);
  metadataIds.add(id);
  const priorityTier = requiredText(item.priority_tier, `documents[${index}].priority_tier`);
  if (!PRIORITY_TIERS.has(priorityTier)) {
    throw knowledgeSourceError('RETRIEVAL_POLICY_INVALID', `Invalid priority_tier for ${id}: ${priorityTier}`);
  }
  const coverage = requiredText(item.semantic_coverage_disposition, `documents[${index}].semantic_coverage_disposition`);
  if (!COVERAGE_DISPOSITIONS.has(coverage)) {
    throw knowledgeSourceError('RETRIEVAL_POLICY_INVALID', `Invalid semantic coverage disposition for ${id}: ${coverage}`);
  }
  const relatedDocumentIds = uniqueTextArray(item.related_document_ids, `${id}.related_document_ids`);
  for (const relatedId of relatedDocumentIds) {
    if (!knownIds.has(relatedId)) throw knowledgeSourceError('RETRIEVAL_POLICY_INVALID', `${id} references unknown related document ${relatedId}.`);
  }
  const conflicts = uniqueTextArray(item.conflicts_with_document_ids ?? [], `${id}.conflicts_with_document_ids`);
  for (const conflictId of conflicts) {
    if (!knownIds.has(conflictId)) throw knowledgeSourceError('RETRIEVAL_POLICY_INVALID', `${id} references unknown conflict document ${conflictId}.`);
  }
  const subsystems = uniqueTextArray(item.subsystems, `${id}.subsystems`);
  if (subsystems.length === 0) throw knowledgeSourceError('RETRIEVAL_POLICY_INVALID', `${id} must declare at least one subsystem.`);
  const relatedModulePaths = uniqueTextArray(item.related_module_paths ?? [], `${id}.related_module_paths`);
  const relatedContracts = uniqueTextArray(item.related_contracts ?? [], `${id}.related_contracts`);
  if (relatedDocumentIds.length === 0 && relatedModulePaths.length === 0 && relatedContracts.length === 0) {
    throw knowledgeSourceError('RETRIEVAL_POLICY_INVALID', `${id} must declare at least one relationship.`);
  }
  return {
    document_id: id,
    document_type: requiredText(item.document_type, `${id}.document_type`),
    priority_tier: priorityTier,
    subsystems,
    related_document_ids: relatedDocumentIds,
    related_module_paths: relatedModulePaths,
    related_contracts: relatedContracts,
    search_terms: uniqueTextArray(item.search_terms, `${id}.search_terms`),
    conflicts_with_document_ids: conflicts,
    semantic_coverage_disposition: coverage
  };
}

function normalizeControlQueries(value, knownIds) {
  if (!Array.isArray(value) || value.length === 0) {
    throw knowledgeSourceError('RETRIEVAL_POLICY_INVALID', 'control_queries must contain at least one query.');
  }
  const ids = new Set();
  return value.map((item, index) => {
    if (!item || typeof item !== 'object') throw knowledgeSourceError('RETRIEVAL_POLICY_INVALID', `control_queries[${index}] must be an object.`);
    const id = requiredText(item.query_id, `control_queries[${index}].query_id`);
    if (ids.has(id)) throw knowledgeSourceError('RETRIEVAL_POLICY_INVALID', `Duplicate control query id: ${id}`);
    ids.add(id);
    const expected = uniqueTextArray(item.expected_document_ids, `${id}.expected_document_ids`);
    if (expected.length === 0) throw knowledgeSourceError('RETRIEVAL_POLICY_INVALID', `${id} must declare expected_document_ids.`);
    for (const documentId of expected) {
      if (!knownIds.has(documentId)) throw knowledgeSourceError('RETRIEVAL_POLICY_INVALID', `${id} expects unknown document ${documentId}.`);
    }
    const topK = Number(item.top_k ?? 5);
    if (!Number.isInteger(topK) || topK < 1 || topK > 20) throw knowledgeSourceError('RETRIEVAL_POLICY_INVALID', `${id}.top_k must be 1..20.`);
    return {
      query_id: id,
      query: requiredText(item.query, `${id}.query`),
      expected_document_ids: expected,
      top_k: topK
    };
  });
}

function normalizeStatuses(value, field) {
  const statuses = uniqueTextArray(value, field);
  const allowed = new Set(['active', 'proposed', 'deprecated']);
  for (const status of statuses) {
    if (!allowed.has(status)) throw knowledgeSourceError('RETRIEVAL_POLICY_INVALID', `${field} contains unsupported status ${status}.`);
  }
  if (statuses.length === 0) throw knowledgeSourceError('RETRIEVAL_POLICY_INVALID', `${field} must not be empty.`);
  return statuses;
}

function uniqueTextArray(value, field) {
  if (!Array.isArray(value)) throw knowledgeSourceError('RETRIEVAL_POLICY_INVALID', `${field} must be an array.`);
  const result = [];
  const seen = new Set();
  for (const raw of value) {
    const clean = requiredText(raw, field);
    if (seen.has(clean)) continue;
    seen.add(clean);
    result.push(clean);
  }
  return result;
}

function validateDigest(value, field) {
  const digest = requiredText(value, field);
  if (!/^[a-f0-9]{64}$/u.test(digest)) throw knowledgeSourceError('RETRIEVAL_POLICY_INVALID', `${field} must be a SHA-256 digest.`);
  return digest;
}

function requiredText(value, field) {
  const result = String(value ?? '').trim();
  if (!result) throw knowledgeSourceError('RETRIEVAL_POLICY_INVALID', `${field} is required.`);
  return result;
}
