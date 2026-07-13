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
  assert.equal(ragManifest