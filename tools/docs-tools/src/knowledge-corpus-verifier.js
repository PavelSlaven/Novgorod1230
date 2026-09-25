import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import {
  diffCorpusStatusesAgainstIndex,
  loadContractIndexCorpusStatuses
} from './contract-index-corpus-status.js';

const SOURCE_ROOT = 'data/knowledge-source';
const PRIORITY_TIERS = new Set([
  'highest_materialization_normative',
  'profile_normative',
  'development_process_normative',
  'technical_contract',
  'navigation',
  'proposed',
  'reference'
]);
const CANONICAL_DEFAULT_STATUSES = Object.freeze(['active', 'reference']);

export async function verifyCanonicalCorpus({ root = '.' } = {}) {
  const projectRoot = resolve(root);
  const sourceRoot = join(projectRoot, SOURCE_ROOT);
  const errors = [];
  const manifestBytes = await readFile(join(sourceRoot, 'corpus-manifest.json')).catch((error) => {
    errors.push(`corpus manifest missing: ${error.message}`);
    return null;
  });
  if (!manifestBytes) return freezeResult({ errors, documentCount: 0, legacyCount: 0 });

  const manifest = parseJson(manifestBytes, 'corpus manifest', errors);
  const aliasesBytes = await readFile(join(sourceRoot, 'source-aliases.json')).catch((error) => {
    errors.push(`source aliases missing: ${error.message}`);
    return null;
  });
  const aliases = aliasesBytes ? parseJson(aliasesBytes, 'source aliases', errors) : null;
  if (!manifest || !aliases) return freezeResult({ errors, documentCount: 0, legacyCount: 0 });

  if (manifest.schema_version !== 'rus.knowledge_corpus_manifest.v2' || !Array.isArray(manifest.documents)) {
    errors.push('invalid corpus manifest schema');
    return freezeResult({ errors, documentCount: 0, legacyCount: 0 });
  }
  if (aliases.schema_version !== 'rus.knowledge_source_aliases.v1' || !aliases.aliases || typeof aliases.aliases !== 'object') {
    errors.push('invalid source aliases schema');
  }

  const ids = new Set();
  const paths = new Set();
  let legacyCount = 0;
  let activeCount = 0;
  let proposedCount = 0;
  for (const record of manifest.documents) {
    const id = String(record.document_id ?? '');
    const canonicalPath = String(record.canonical_path ?? '');
    const status = String(record.status ?? '');
    const priorityTier = String(record.priority_tier ?? '');
    if (!id) errors.push('document without document_id');
    if (ids.has(id)) errors.push(`duplicate document_id: ${id}`);
    ids.add(id);
    if (!['active', 'proposed', 'reference', 'deprecated'].includes(status)) errors.push(`${id}: invalid document status ${status || '<empty>'}`);
    if (!PRIORITY_TIERS.has(priorityTier)) errors.push(`${id}: invalid priority_tier ${priorityTier || '<empty>'}`);
    if (status === 'active') activeCount += 1;
    if (status === 'proposed') proposedCount += 1;
    if (!/^corpus\/DOCUMENTS\/[^/]+$/u.test(canonicalPath)) {
      errors.push(`${id}: invalid canonical_path`);
      continue;
    }
    if (paths.has(canonicalPath)) errors.push(`duplicate canonical_path: ${canonicalPath}`);
    paths.add(canonicalPath);

    const bytes = await readFile(join(sourceRoot, canonicalPath)).catch(() => null);
    if (!bytes) {
      errors.push(`${id}: document file missing`);
      continue;
    }
    if (sha256(bytes) !== record.sha256 || bytes.length !== record.bytes) errors.push(`${id}: document hash or size mismatch`);
    if (record.file_name !== basename(canonicalPath)) errors.push(`${id}: file_name differs from canonical_path`);
    if (record.source_legacy_path) legacyCount += 1;
  }

  for (const [alias, id] of Object.entries(aliases.aliases ?? {})) {
    if (!alias.trim()) errors.push('empty source alias');
    if (!ids.has(id)) errors.push(`alias ${alias} references unknown document ${id}`);
  }

  const policyBytes = await readFile(join(sourceRoot, 'retrieval-policy.json')).catch((error) => {
    errors.push(`retrieval policy missing: ${error.message}`);
    return null;
  });
  if (policyBytes) {
    const policy = parseJson(policyBytes, 'retrieval policy', errors);
    if (policy) {
      const defaults = Array.isArray(policy.default_statuses) ? policy.default_statuses : [];
      if (defaults.length !== CANONICAL_DEFAULT_STATUSES.length
        || CANONICAL_DEFAULT_STATUSES.some((status, index) => defaults[index] !== status)) {
        errors.push(`retrieval policy default_statuses must be ${JSON.stringify([...CANONICAL_DEFAULT_STATUSES])} (got ${JSON.stringify(defaults)}); run knowledge:repin`);
      }
      for (const item of policy.documents ?? []) {
        if (item && Object.hasOwn(item, 'priority_tier')) {
          errors.push(`${item.document_id ?? '<unknown>'}: retrieval policy must not declare priority_tier; ranking reads corpus-manifest`);
        }
      }
      const expectedBaseline = sha256(manifestBytes);
      if (policy.baseline_manifest_sha256 !== expectedBaseline) {
        errors.push('retrieval policy baseline_manifest_sha256 does not match corpus-manifest; run knowledge:repin');
      }
    }
  }

  const corpusHasIndex = (manifest.documents ?? []).some((record) => record.file_name === 'CONTRACT_INDEX.md');
  if (corpusHasIndex) {
    try {
      const statusByFile = await loadContractIndexCorpusStatuses({ root: projectRoot });
      errors.push(...diffCorpusStatusesAgainstIndex(manifest.documents, statusByFile));
    } catch (error) {
      errors.push(`CONTRACT_INDEX status load failed: ${error.message}`);
    }
  }

  return freezeResult({ errors, documentCount: manifest.documents.length, activeCount, proposedCount, legacyCount, manifestSha256: sha256(manifestBytes) });
}

function parseJson(bytes, label, errors) {
  try {
    return JSON.parse(bytes.toString('utf8'));
  } catch (error) {
    errors.push(`${label} is invalid JSON: ${error.message}`);
    return null;
  }
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function freezeResult({ errors, documentCount, activeCount = 0, proposedCount = 0, legacyCount, manifestSha256 = '' }) {
  return Object.freeze({
    ok: errors.length === 0,
    errors: Object.freeze([...errors]),
    document_count: documentCount,
    active_document_count: activeCount,
    proposed_document_count: proposedCount,
    legacy_document_count: legacyCount,
    corpus_manifest_sha256: manifestSha256
  });
}
