import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRagIndex, queryVectorIndex, verifyDocumentGraph, verifyRagIndex } from '../src/index.js';

test('document graph verification checks source files and line ranges', () => {
  const graph = { nodes:[{ id:'n', source_location:{ file:'a.md', line_start:1, line_end:2 } }] };
  assert.equal(verifyDocumentGraph({ graph, corpusFiles:{ 'a.md':'one\ntwo' } }).ok, true);
  assert.equal(verifyDocumentGraph({ graph, corpusFiles:{ 'a.md':'one' } }).ok, false);
});

test('RAG build uses explicit embedding port and verifies corpus binding', async () => {
  let calls = 0;
  const index = await buildRagIndex({ chunks:[{ id:'a', file:'a.md', text:'alpha' }, { id:'b', file:'b.md', text:'beta' }], embedTexts: async () => { calls += 1; return [[1,0],[0,1]]; }, model:'fixture', corpusHash:'hash' });
  assert.equal(calls, 1);
  assert.equal(verifyRagIndex({ index, corpusHash:'hash', corpusFiles:{ 'a.md':'alpha', 'b.md':'beta' } }).ok, true);
  assert.equal(queryVectorIndex({ index, embedding:[1,0], topK:1 })[0].id, 'a');
});
