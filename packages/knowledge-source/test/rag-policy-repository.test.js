import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createFileSystemKnowledgeSourceStorage } from '../src/adapters/filesystem-storage.js';
import { createKnowledgeRagReader } from '../src/services/rag-reader.js';
import { validateCorpusManifest } from '../src/domain/manifest.js';
import { validateRetrievalPolicy } from '../src/domain/retrieval-policy.js';

const root = resolve(import.meta.dirname, '../../..');
const sourceRoot = resolve(root, 'data/knowledge-source');
const generatedRoot = resolve(root, 'generated/knowledge-source');

function sha(value) { return createHash('sha256').update(value).digest('hex'); }

function activeBaselineGapCount(policy, manifest) {
  const activeDocumentIds = new Set(manifest.documents.filter((document) => document.status === 'active').map((document) => document.document_id));
  return policy.documents.filter((document) => (
    activeDocumentIds.has(document.document_id) && document.semantic_coverage_disposition === 'baseline_gap'
  )).length;
}

test('repository retrieval policy covers every registered document and pins current corpus', async () => {
  const manifestBytes = await readFile(resolve(sourceRoot, 'corpus-manifest.json'));
  const manifest = validateCorpusManifest(JSON.parse(manifestBytes.toString('utf8')));
  const policy = validateRetrievalPolicy(JSON.parse(await readFile(resolve(sourceRoot, 'retrieval-policy.json'), 'utf8')), manifest);
  assert.equal(policy.baseline_manifest_sha256, sha(manifestBytes));
  assert.equal(policy.documents.length, manifest.documents.length);
  assert.ok(policy.control_queries.length >= 5);
});

test('repository policy registers proposed classification documents without changing their corpus status', async () => {
  const manifest = validateCorpusManifest(JSON.parse(await readFile(resolve(sourceRoot, 'corpus-manifest.json'), 'utf8')));
  const policy = validateRetrievalPolicy(JSON.parse(await readFile(resolve(sourceRoot, 'retrieval-policy.json'), 'utf8')), manifest);
  const proposedIds = [
    'universal-category-classification-policy',
    'universal-category-classification-references'
  ];
  assert.deepEqual(
    manifest.documents.filter((document) => proposedIds.includes(document.document_id)).map((document) => document.status),
    ['proposed', 'proposed']
  );
  assert.deepEqual(
    policy.documents.filter((document) => proposedIds.includes(document.document_id)).map((document) => document.document_id),
    proposedIds
  );
});

test('repository RAG exposes explicit baseline semantic gaps and no unacknowledged blocker', async () => {
  const storage = createFileSystemKnowledgeSourceStorage({ sourceRoot, generatedRoot });
  const status = await createKnowledgeRagReader({ storage }).getReadinessStatus();
  const manifest = validateCorpusManifest(JSON.parse(await readFile(resolve(sourceRoot, 'corpus-manifest.json'), 'utf8')));
  const policy = validateRetrievalPolicy(JSON.parse(await readFile(resolve(sourceRoot, 'retrieval-policy.json'), 'utf8')), manifest);
  assert.equal(status.status, 'degraded');
  assert.equal(status.semantic_coverage_blocker_document_ids.length, 0);
  assert.equal(status.semantic_coverage_gap_document_ids.length, activeBaselineGapCount(policy, manifest));
});
