import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { buildKnowledgeSourceOutputsV2 } from '../src/knowledge-materializer-v2.js';

const root = resolve(import.meta.dirname, '../../..');

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

test('knowledge materializer preserves approved semantic vectors and marks native documents lexical-only', async () => {
  const outputs = await buildKnowledgeSourceOutputsV2({ root });
  const ragManifest = JSON.parse(outputs.get('generated/knowledge-source/rag/manifest.json'));
  const semanticIndex = JSON.parse(outputs.get('generated/knowledge-source/rag/index.json'));
  const lexicalIndex = JSON.parse(outputs.get('generated/knowledge-source/rag/lexical-index.json'));

  assert.equal(ragManifest.source_document_count, 22);
  assert.equal(ragManifest.semantic_document_count, 19);
  assert.equal(ragManifest.lexical_only_document_count, 3);
  assert.equal(ragManifest.coverage.filter((item) => !item.semantic_indexed).length, 3);
  assert.equal(semanticIndex.chunk_count, 813);
  assert.ok(semanticIndex.chunks.every((chunk) => Array.isArray(chunk.embedding) && chunk.embedding.length === semanticIndex.dimensions));
  assert.ok(lexicalIndex.chunk_count > 0);
  assert.ok(lexicalIndex.chunks.every((chunk) => !Object.hasOwn(chunk, 'embedding')));
});

test('RAG manifest separates source provenance from generated artifact digests', async () => {
  const outputs = await buildKnowledgeSourceOutputsV2({ root });
  const manifest = JSON.parse(outputs.get('generated/knowledge-source/rag/manifest.json'));
  const semanticText = outputs.get('generated/knowledge-source/rag/index.json');
  const lexicalText = outputs.get('generated/knowledge-source/rag/lexical-index.json');
  const sourceBytes = await readFile(resolve(root, 'data/knowledge-source/imports/rag/index.json'));

  assert.equal(manifest.source_snapshot_sha256, sha256(sourceBytes));
  assert.equal(manifest.semantic_index_sha256, sha256(semanticText));
  assert.equal(manifest.lexical_index_sha256, sha256(lexicalText));
  assert.equal(typeof manifest.semantic_index, 'string');
  assert.equal(typeof manifest.lexical_index, 'string');
});

test('knowledge materializer adds structural graph nodes without invented semantic links', async () => {
  const outputs = await buildKnowledgeSourceOutputsV2({ root });
  const graphManifest = JSON.parse(outputs.get('generated/knowledge-source/graph/manifest.json'));
  const graph = JSON.parse(outputs.get('generated/knowledge-source/graph/graph.json'));
  const structuralNodes = graph.nodes.filter((node) => node.structural_only === true);

  assert.equal(graphManifest.source_document_count, 22);
  assert.equal(graphManifest.structural_only_document_count, 3);
  assert.equal(structuralNodes.length, 3);
  assert.ok(structuralNodes.every((node) => node.type === 'canonical_document'));
});
