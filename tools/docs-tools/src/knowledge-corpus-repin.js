import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { CANONICAL_DEFAULT_STATUSES } from '../../../packages/knowledge-source/src/domain/retrieval-policy.js';
import { readJson, sha256, stableJson } from './knowledge-source-json.js';
import {
  applyContractIndexStatusesToDocuments,
  loadContractIndexCorpusStatuses
} from './contract-index-corpus-status.js';

export async function repinCanonicalCorpus({ root = '.' } = {}) {
  const projectRoot = resolve(root);
  const sourceRoot = join(projectRoot, 'data/knowledge-source');
  const manifestPath = join(sourceRoot, 'corpus-manifest.json');
  const policyPath = join(sourceRoot, 'retrieval-policy.json');
  const manifest = await readJson(manifestPath);
  if (manifest?.schema_version !== 'rus.knowledge_corpus_manifest.v2' || !Array.isArray(manifest.documents)) {
    throw new Error('Invalid canonical corpus manifest.');
  }
  let hashChanged = 0;
  for (const record of manifest.documents) {
    if (!/^corpus\/DOCUMENTS\/[^/]+$/u.test(String(record.canonical_path ?? ''))) {
      throw new Error(`${record.document_id}: invalid canonical_path`);
    }
    const bytes = await readFile(join(sourceRoot, record.canonical_path));
    const digest = sha256(bytes);
    if (record.sha256 === digest && record.bytes === bytes.length) continue;
    if (record.provenance_mode !== 'native' && record.source_legacy_path) {
      throw new Error(`${record.document_id}: non-native document requires its provenance procedure`);
    }
    record.sha256 = digest;
    record.bytes = bytes.length;
    hashChanged += 1;
  }
  const statusByFile = await loadContractIndexCorpusStatuses({ root: projectRoot }).catch((error) => {
    if (error?.code === 'ENOENT') return null;
    throw error;
  });
  let statusChanged = 0;
  if (statusByFile) {
    try {
      statusChanged = applyContractIndexStatusesToDocuments(manifest.documents, statusByFile);
    } catch (error) {
      throw new Error(`knowledge:repin failed: ${error.message}`);
    }
  }
  const manifestBytes = Buffer.from(stableJson(manifest));
  const manifestDigest = sha256(manifestBytes);
  const policy = await readJson(policyPath);
  if (!policy || typeof policy !== 'object') throw new Error('Invalid retrieval policy.');
  if (Array.isArray(policy.documents)) {
    for (const item of policy.documents) {
      if (item && Object.hasOwn(item, 'priority_tier')) delete item.priority_tier;
    }
  }
  policy.default_statuses = [...CANONICAL_DEFAULT_STATUSES];
  policy.baseline_manifest_sha256 = manifestDigest;
  await writeFile(manifestPath, manifestBytes);
  await writeFile(policyPath, stableJson(policy));
  return Object.freeze({
    document_count: manifest.documents.length,
    changed_documents: hashChanged,
    status_fields_changed: statusChanged,
    manifest_sha256: manifestDigest
  });
}
