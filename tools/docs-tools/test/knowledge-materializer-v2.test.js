import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { buildKnowledgeSourceOutputsV2 } from '../src/knowledge-materializer-v2.js';

const root = resolve(import.meta.dirname, '../../..');

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

test('knowledge materializer preserves approved semantic vectors and indexes only native documents lexically', async () => {
  const outputs = await buildKnowledgeSourceOutputsV2({ root });
  const corpusManifest = JSON.parse(await readFile(resolve(root, 'data/knowledge-source/corpus-manifest.json'), 'utf8'));
  const ragManifest = JSON.parse(outputs.get('generated/knowledge-source/rag/manifest.json'));
  const semanticIndex = JSON.parse(outputs.get('generated/knowledge-source/rag/index.json'));
  const lexicalIndex = JSON.parse(outputs.get('generated/knowledge-source/rag/lexical-index.json'));
  const semanticFiles = new Set(semanticIndex.chunks.map((chunk) => basename(String(chunk.file ?? ''))));
  const semanticDocumentCount = corpusManifest.documents.filter((record) => semanticFiles.has(record.file_name)).length;
  const lexicalOnlyDocumentCount = corpusManifest.documents.length - semanticDocumentCount;

  assert.equal(ragManifest.source_document_count, corpusManifest.documents.length);
  assert.equal(ragManifest.semantic_document_count, semanticDocumentCount);
  assert.equal(ragManifest.lexical_only_document_count, lexicalOnlyDocumentCount);
  assert.equal(ragManifest.coverage.filter((item) => item.semantic_indexed).length, semanticDocumentCount);
  assert.equal(ragManifest.coverage.filter((item) => item.lexical_indexed).length, lexicalOnlyDocumentCount);
  assert.ok(ragManifest.coverage.every((item) => item.semantic_indexed !== item.lexical_indexed));
  assert.equal(semanticIndex.chunk_count, 813);
  assert.ok(semanticIndex.chunks.every((chunk) => Array.isArray(chunk.embedding) && chunk.embedding.length === semanticIndex.dimensions));
  assert.ok(lexicalIndex.chunk_count > 0);
  assert.ok(lexicalIndex.chunks.every((chunk) => !Object.hasOwn(chunk, 'embedding')));

  const lexicalCoverageFiles = new Set(ragManifest.coverage.filter((item) => item.lexical_indexed).map((item) => item.file_name));
  const lexicalChunkFiles = new Set(lexicalIndex.chunks.map((chunk) => basename(String(chunk.file ?? ''))));
  assert.deepEqual(lexicalChunkFiles, lexicalCoverageFiles);
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
  const corpusManifest = JSON.parse(await readFile(resolve(root, 'data/knowledge-source/corpus-manifest.json'), 'utf8'));
  const graphSnapshot = JSON.parse(await readFile(resolve(root, 'data/knowledge-source/imports/graph/graph.json'), 'utf8'));
  const graphManifest = JSON.parse(outputs.get('generated/knowledge-source/graph/manifest.json'));
  const graph = JSON.parse(outputs.get('generated/knowledge-source/graph/graph.json'));
  const structuralNodes = graph.nodes.filter((node) => node.structural_only === true);
  const semanticFiles = new Set((graphSnapshot.nodes ?? []).map((node) => basename(String(node?.source_location?.file ?? node?.sourceLocation?.file ?? node?.source_file ?? ''))).filter(Boolean));
  const structuralOnlyDocumentCount = corpusManifest.documents.filter((record) => !semanticFiles.has(record.file_name)).length;

  assert.equal(graphManifest.source_document_count, corpusManifest.documents.length);
  assert.equal(graphManifest.structural_only_document_count, structuralOnlyDocumentCount);
  assert.equal(structuralNodes.length, structuralOnlyDocumentCount);
  assert.ok(structuralNodes.every((node) => node.type === 'canonical_document'));
});
