import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { readJson, sha256, stableJson } from './knowledge-source-json.js';

export async function repinCanonicalCorpus({ root = '.' } = {}) {
  const sourceRoot = join(resolve(root), 'data/knowledge-source');
  const manifestPath = join(sourceRoot, 'corpus-manifest.json');
  const policyPath = join(sourceRoot, 'retrieval-policy.json');
  const manifest = await readJson(manifestPath);
  if (manifest?.schema_version !== 'rus.knowledge_corpus_manifest.v2' || !Array.isArray(manifest.documents)) {
    throw new Error('Invalid canonical corpus manifest.');
  }
  let changed = 0;
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
    changed += 1;
  }
  const manifestBytes = changed ? Buffer.from(stableJson(manifest)) : await readFile(manifestPath);
  const manifestDigest = sha256(manifestBytes);
  const policy = await readFile(policyPath, 'utf8');
  const pinPattern = /"baseline_manifest_sha256"\s*:\s*"[a-f0-9]{64}"/gu;
  if ([...policy.matchAll(pinPattern)].length !== 1) throw new Error('Invalid retrieval policy baseline manifest pin.');
  const repinnedPolicy = policy.replace(pinPattern, `"baseline_manifest_sha256": "${manifestDigest}"`);
  if (changed) await writeFile(manifestPath, manifestBytes);
  if (repinnedPolicy !== policy) await writeFile(policyPath, repinnedPolicy);
  return Object.freeze({ document_count: manifest.documents.length, changed_documents: changed, manifest_sha256: manifestDigest });
}
