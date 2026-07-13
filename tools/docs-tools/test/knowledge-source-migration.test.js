import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, rename } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  readKnowledgeSourceInventory,
  verifyKnowledgeSourceMigration,
  buildKnowledgeGraphFromSnapshot,
  buildRagIndexFromSnapshot
} from '../src/index.js';

const root = resolve(import.meta.dirname, '../../..');

test('stored legacy DOCUMENTS inventory classifies every file and approves exactly 19 canonical sources', async () => {
  const inventory = await readKnowledgeSourceInventory({ root });
  assert.equal(inventory.files.length, 29);
  assert.equal(inventory.files.some((item) => item.classification === 'unknown'), false);
  assert.equal(inventory.files.filter((item) => item.classification === 'canonical_source').length, 19);
});

test('migrated corpus and generated provenance verify without requiring legacy', { concurrency: false }, async () => {
  const legacy = resolve(root, 'legacy/DOCUMENTS');
  const hidden = resolve(root, 'legacy/DOCUMENTS.__knowledge_source_test__');
  await rename(legacy, hidden);
  try {
    const result = await verifyKnowledgeSourceMigration({ root });
    assert.equal(result.ok, true, result.errors.join('\n'));
    assert.equal(result.document_count, 22);
    assert.equal(result.legacy_document_count, 19);
    assert.equal(result.native_document_count, 3);
    assert.equal(result.hash_parity, true);
    assert.equal(result.legacy_sources_compared, 0);
    assert.equal(result.legacy_required, false);
    assert.equal(result.generated_provenance_complete, true);
    assert.equal(result.graph.current, true);
    assert.equal(result.rag.current, true);
  } finally {
    await rename(hidden, legacy);
  }
});

test('graph and RAG materializers are deterministic and preserve approved semantic coverage', async () => {
  const graphA = await buildKnowledgeGraphFromSnapshot({ root });
  const graphB = await buildKnowledgeGraphFromSnapshot({ root });
  assert.equal(JSON.stringify(graphA), JSON.stringify(graphB));
  assert.equal(graphA.manifest.source_document_count, 22);
  assert.equal(graphA.manifest.structural_only_document_count, 3);

  const ragA = await buildRagIndexFromSnapshot({ root });
  const ragB = await buildRagIndexFromSnapshot({ root });
  assert.equal(JSON.stringify(ragA), JSON.stringify(ragB));
  assert.equal(ragA.manifest.source_document_count, 22);
  assert.equal(ragA.manifest.semantic_document_count, 19);
  assert.equal(ragA.manifest.lexical_only_document_count, 3);
  assert.equal(ragA.index.chunk_count, 813);
  assert.ok(ragA.lexical_index.chunk_count > 0);
  assert.equal(ragA.lexical_index.chunks.some((chunk) => Object.hasOwn(chunk, 'embedding')), false);

  const legacyManifest = JSON.parse(await readFile(resolve(root, 'legacy/DOCUMENTS/documents-kg/rag-index/manifest.json'), 'utf8'));
  assert.notEqual(ragA.manifest.corpus_root, legacyManifest.corpus_dir);
  assert.equal(ragA.manifest.corpus_root, 'data/knowledge-source/corpus/DOCUMENTS');
});
