import assert from 'node:assert/strict';
import test from 'node:test';
import { resolve } from 'node:path';
import { buildKnowledgeSourceOutputsV2 } from '../src/knowledge-materializer-v2.js';

const root = resolve(import.meta.dirname, '../../..');

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
