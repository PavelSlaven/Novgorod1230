import test from 'node:test';
import assert from 'node:assert/strict';
import { loadLocalEnv } from '../src/env.js';
import {
  loadCorpusChunks,
  sectionToChunks,
  splitDocumentSections
} from '../src/world/corpus-chunks.js';
import {
  buildRetrievalQuery,
  clearRagCaches,
  cosineSimilarity,
  searchCorpus,
  setRagIndexForTests
} from '../src/world/corpus-rag.js';
import { getCorpusDir, loadDesignBundle, loadDesignBundleSync } from '../src/world/corpus-loader.js';

await loadLocalEnv();

test('cosineSimilarity returns 1 for identical vectors and 0 for orthogonal', () => {
  assert.equal(cosineSimilarity([1, 0, 0], [1, 0, 0]), 1);
  assert.equal(cosineSimilarity([1, 0, 0], [0, 1, 0]), 0);
  assert.ok(Math.abs(cosineSimilarity([1, 1, 0], [1, 0, 0]) - (1 / Math.sqrt(2))) < 1e-9);
});

test('splitDocumentSections keeps short section as single chunk', () => {
  const text = '# Title\n\nShort body.';
  const sections = splitDocumentSections('sample.md', text);
  assert.equal(sections.length, 1);
  const chunks = sectionToChunks(sections[0]);
  assert.equal(chunks.length, 1);
  assert.match(chunks[0].text, /Short body/);
});

test('sectionToChunks splits long section into multiple chunks', () => {
  const paragraphs = Array.from({ length: 12 }, (_, index) => `Paragraph ${index + 1}: ${'x'.repeat(180)}`);
  const text = `# Long\n\n${paragraphs.join('\n\n')}`;
  const sections = splitDocumentSections('long.txt', text);
  const chunks = sectionToChunks(sections[0]);
  assert.ok(chunks.length > 1);
  assert.ok(chunks.every((chunk) => chunk.char_count <= 1600));
});

test('loadCorpusChunks reads project corpus files', () => {
  const chunks = loadCorpusChunks(getCorpusDir());
  assert.ok(chunks.length >= 100);
  assert.ok(chunks.every((chunk) => chunk.id && chunk.file && chunk.text));
});

test('searchCorpus ranks mock index without network', async () => {
  clearRagCaches();
  const index = {
    chunks: [
      { id: 'a', file: 'a.txt', section: 'A', text: 'combat armor damage', embedding: [1, 0, 0] },
      { id: 'b', file: 'b.txt', section: 'B', text: 'inventory containers', embedding: [0, 1, 0] }
    ]
  };
  const fetchImpl = async () => ({
    ok: true,
    async json() {
      return { data: [{ index: 0, embedding: [1, 0, 0] }] };
    }
  });
  const hits = await searchCorpus('combat armor', {
    topK: 2,
    minScore: 0,
    index,
    env: { CORPUS_RAG_TOP_K: '2', DEEPSEEK_API_KEY: 'test-key' },
    fetchImpl
  });
  assert.equal(hits[0]?.id, 'a');
});

test('buildRetrievalQuery includes task and frame hints', () => {
  const query = buildRetrievalQuery('combat', {
    intent: { type: 'attack' },
    world: { region: 'Ryazan' },
    pipelineStage: 'master_narrative'
  }, ['weapon', 'бой']);
  assert.match(query, /combat/);
  assert.match(query, /attack/);
  assert.match(query, /Ryazan/);
  assert.match(query, /weapon/);
});

test('loadDesignBundle combat keeps mandatory markers with mock RAG enabled', async () => {
  const previousEnabled = process.env.CORPUS_RAG_ENABLED;
  const previousFetch = globalThis.fetch;
  process.env.CORPUS_RAG_ENABLED = '1';
  clearRagCaches();
  setRagIndexForTests({
    chunks: [
      {
        id: 'extra.md:Extra:0',
        file: 'extra.md',
        section: 'Extra',
        text: '## extra.md — Extra\noptional semantic filler',
        embedding: [0.1, 0.1, 1]
      }
    ]
  });

  globalThis.fetch = async () => ({
    ok: true,
    async json() {
      return { data: [{ index: 0, embedding: [0.1, 0.1, 1] }] };
    }
  });

  try {
    const bundle = await loadDesignBundle('combat', { frame: { intent: { type: 'attack' } } });
    assert.match(bundle, /балл вреда = качество попадания/i);
    assert.match(bundle, /combat_system\.md/i);
    assert.match(bundle, /weapon danger|оруж/i);
    assert.doesNotMatch(bundle, /\[corpus bundle truncated\]/);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousEnabled === undefined) delete process.env.CORPUS_RAG_ENABLED;
    else process.env.CORPUS_RAG_ENABLED = previousEnabled;
    clearRagCaches();
  }
});

test('loadDesignBundleSync matches combat bundle without RAG', () => {
  const bundle = loadDesignBundleSync('combat');
  assert.match(bundle, /combat_system\.md/);
  assert.match(bundle, /балл вреда = качество попадания/i);
});
