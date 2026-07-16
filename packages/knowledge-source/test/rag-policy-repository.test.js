import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createFileSystemKnowledgeSourceStorage, createKnowledgeRagReader, validateCorpusManifest, validateRetrievalPolicy } from '../src/index.js';

const root = resolve(import.meta.dirname, '../../..');
const sourceRoot = resolve(root, 'data/knowledge-source');
const generatedRoot = resolve(root, 'generated/knowledge-source');

function sha(value) { return createHash('sha256').update(value).digest('hex'); }

test('repository retrieval policy covers every registered document and pins current corpus', async () => {
  const manifestBytes = await readFile(resolve(sourceRoot, 'corpus-manifest.json'));
  const manifest = validateCorpusManifest(JSON.parse(manifestBytes.toString('utf8')));
  const policy = validateRetrievalPolicy(JSON.parse(await readFile(resolve(sourceRoot, 'retrieval-policy.json'), 'utf8')), manifest);
  assert.equal(policy.baseline_manifest_sha256, sha(manifestBytes));
  assert.equal(policy.documents.length, manifest.documents.length);
  assert.ok(policy.control_queries.length >= 5);
});

test('repository RAG exposes explicit baseline semantic gaps and no unacknowledged blocker', async () => {
  const storage = createFileSystemKnowledgeSourceStorage({ sourceRoot, generatedRoot });
  const status = await createKnowledgeRagReader({ storage }).getReadinessStatus();
  assert.equal(status.status, 'degraded');
  assert.equal(status.semantic_coverage_blocker_document_ids.length, 0);
  assert.equal(status.semantic_coverage_gap_document_ids.length, 23);
});
