import { createHash } from 'node:crypto';
import { canonicalStringify } from '@rus/runtime-catalog/canonical-records';

const NORMALIZERS = new Set([
  'replace_parent_revision_id',
  'replace_target_revision_id',
  'replace_imported_revision_id',
  'replace_bundle_id',
  'replace_promotion_id',
  'replace_compiler_commit',
  'remove_derived_digest'
]);

export function comparePr17OverlaySemantics({
  sourceDocuments,
  rebuiltDocuments,
  allowlist,
  transitionAssertionMapping = []
}) {
  validateAllowlist(allowlist);
  const source = structuredClone(sourceDocuments);
  const rebuilt = structuredClone(rebuiltDocuments);
  for (const rule of allowlist) {
    applyRule(source, rule);
    applyRule(rebuilt, rule);
  }
  const sourceDigest = digest(sourceDocuments);
  const rebuiltDigest = digest(rebuiltDocuments);
  const normalizedSourceDigest = digest(source);
  const normalizedRebuiltDigest = digest(rebuilt);
  const transitionDifferences = validateTransitionMapping(transitionAssertionMapping);
  const differences = [
    ...(normalizedSourceDigest === normalizedRebuiltDigest
      ? []
      : [{ code: 'SEMANTIC_DOCUMENT_DIFFERENCE', json_pointer: '/' }]),
    ...transitionDifferences
  ];
  const report = {
    schema: 'rus.semantic_equivalence_report.v2',
    normalization_schema: 'rus.pr17_overlay_semantic_normalization.v2',
    allowlist_digest: digest(allowlist),
    source_pr17_payload_digest: sourceDigest,
    rebuilt_semantic_payload_digest: rebuiltDigest,
    normalized_source_digest: normalizedSourceDigest,
    normalized_rebuilt_digest: normalizedRebuiltDigest,
    transition_assertion_mapping: structuredClone(transitionAssertionMapping),
    all_differences: differences,
    result: differences.length === 0 ? 'PASS' : 'FAIL'
  };
  return deepFreeze({
    ...report,
    semantic_equivalence_report_digest: digest(report)
  });
}

function validateAllowlist(allowlist) {
  if (!Array.isArray(allowlist)) throw new TypeError('Semantic allowlist must be an array.');
  for (const rule of allowlist) {
    if (!rule?.document_kind || !rule?.json_pointer || !rule?.reason_code
        || !NORMALIZERS.has(rule?.normalizer_id)
        || rule.json_pointer === '/schema_version'
        || rule.json_pointer.includes('*')) {
      throw Object.assign(new Error('Semantic normalization allowlist contains an unsafe rule.'), {
        code: 'SEMANTIC_NORMALIZATION_RULE_INVALID'
      });
    }
  }
}

function applyRule(documents, rule) {
  const document = documents?.[rule.document_kind];
  if (document == null) return;
  const segments = rule.json_pointer.split('/').slice(1).map(unescapePointer);
  const parent = segments.slice(0, -1).reduce((value, segment) => value?.[segment], document);
  const key = segments.at(-1);
  if (parent == null || !Object.hasOwn(parent, key)) return;
  if (rule.normalizer_id === 'remove_derived_digest') delete parent[key];
  else parent[key] = `<normalized:${rule.normalizer_id}>`;
}

function validateTransitionMapping(mapping) {
  if (!Array.isArray(mapping) || mapping.length !== 9) {
    return [{ code: 'SEMANTIC_G4_MAPPING_COUNT_MISMATCH', expected: 9, actual: mapping?.length ?? 0 }];
  }
  const seenTransitions = new Set();
  const seenAssertions = new Set();
  const differences = [];
  for (const item of mapping) {
    const semantic = [
      item.graph_node_record_key,
      item.asserted_status,
      item.source_transition_semantic_digest,
      item.historical_approval_basis_digest
    ];
    if (semantic.some((value) => !String(value ?? '').trim())
        || item.asserted_status !== 'approved') {
      differences.push({ code: 'SEMANTIC_G4_MAPPING_INVALID', record_key: item.graph_node_record_key ?? null });
    }
    if (seenTransitions.has(item.source_transition_id)
        || seenAssertions.has(item.graph_node_record_key)) {
      differences.push({ code: 'SEMANTIC_G4_MAPPING_NOT_ONE_TO_ONE', record_key: item.graph_node_record_key ?? null });
    }
    seenTransitions.add(item.source_transition_id);
    seenAssertions.add(item.graph_node_record_key);
  }
  return differences;
}

function digest(value) {
  return createHash('sha256').update(canonicalStringify(value)).digest('hex');
}

function unescapePointer(value) {
  return value.replaceAll('~1', '/').replaceAll('~0', '~');
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}
