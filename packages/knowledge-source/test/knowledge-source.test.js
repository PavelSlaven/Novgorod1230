import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import {
  createFileSystemKnowledgeSourceStorage,
  createKnowledgeSourceReader,
  KnowledgeSourceError
} from '../src/index.js';

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'rus-knowledge-source-'));
  const corpus = join(root, 'corpus', 'DOCUMENTS');
  const generated = join(root, 'generated');
  await mkdir(corpus, { recursive: true });
  await mkdir(join(generated, 'graph'), { recursive: true });
  await mkdir(join(generated, 'rag'), { recursive: true });
  const text = '# Alpha\n\nCanonical text.\nSecond line.\n';
  await writeFile(join(corpus, 'alpha.md'), text);
  await writeFile(join(root, 'corpus-manifest.json'), JSON.stringify({
    schema_version: 'rus.knowledge_corpus_manifest.v1',
    corpus_id: 'fixture',
    documents: [{
      document_id: 'alpha',
      canonical_path: 'corpus/DOCUMENTS/alpha.md',
      file_name: 'alpha.md',
      sha256: sha256(text),
      bytes: Buffer.byteLength(text),
      status: 'active'
    }]
  }));
  await writeFile(join(root, 'source-aliases.json'), JSON.stringify({
    schema_version: 'rus.knowledge_source_aliases.v1',
    aliases: { 'alpha.md': 'alpha' }
  }));
  const graphText = JSON.stringify({ nodes: [] });
  const ragText = JSON.stringify({ schema_version: 'rus.rag_index.v1', chunks: [] });
  const lexicalText = JSON.stringify({ schema_version: 'rus.lexical_index.v1', chunks: [] });
  await writeFile(join(generated, 'graph', 'graph.json'), graphText);
  await writeFile(join(generated, 'graph', 'manifest.json'), JSON.stringify({
    schema_version: 'rus.knowledge_graph_manifest.v1',
    corpus_manifest_sha256: sha256(await readFile(join(root, 'corpus-manifest.json'))),
    graph_sha256: sha256(graphText)
  }));
  await writeFile(join(generated, 'rag', 'index.json'), ragText);
  await writeFile(join(generated, 'rag', 'lexical-index.json'), lexicalText);
  await writeFile(join(generated, 'rag', 'manifest.json'), JSON.stringify({
    schema_version: 'rus.knowledge_rag_manifest.v1',
    corpus_manifest_sha256: sha256(await readFile(join(root, 'corpus-manifest.json'))),
    generation_mode: 'approved_semantic_snapshot_plus_deterministic_lexical_coverage',
    semantic_index_sha256: sha256(ragText),
    lexical_index_sha256: sha256(lexicalText),
    semantic_document_count: 1,
    lexical_only_document_count: 0
  }));
  return { root, corpus, generated, text };
}

test('reader exposes immutable explicit document contracts without inventing content', async () => {
  const fx = await fixture();
  const storage = createFileSystemKnowledgeSourceStorage({ sourceRoot: fx.root, generatedRoot: fx.generated });
  const reader = createKnowledgeSourceReader({ storage });
  const listed = await reader.listDocuments({});
  assert.deepEqual(listed.documents.map((item) => item.document_id), ['alpha']);
  assert.equal(Object.isFrozen(listed), true);
  const document = await reader.getDocument({ document_id: 'alpha' });
  assert.equal(document.text, fx.text);
  assert.equal(document.sha256, sha256(fx.text));
  assert.equal(Object.isFrozen(document), true);
  const alias = await reader.getDocument({ document_id: 'alpha.md' });
  assert.equal(alias.document_id, 'alpha');
});

test('reader is fail-closed for unknown ids, path traversal, hash mismatch and invalid ranges', async () => {
  const fx = await fixture();
  const storage = createFileSystemKnowledgeSourceStorage({ sourceRoot: fx.root, generatedRoot: fx.generated });
  const reader = createKnowledgeSourceReader({ storage });
  await assert.rejects(() => reader.getDocument({ document_id: 'missing' }), (error) => error instanceof KnowledgeSourceError && error.code === 'DOCUMENT_NOT_REGISTERED');
  await assert.rejects(() => reader.getDocument({ document_id: '../alpha' }), (error) => error.code === 'PATH_TRAVERSAL_REJECTED');
  await assert.rejects(() => reader.resolveSourceLocation({ document_id: 'alpha', start_line: 0, end_line: 1 }), (error) => error.code === 'SOURCE_LOCATION_INVALID');
  await writeFile(join(fx.corpus, 'alpha.md'), 'changed');
  await assert.rejects(() => reader.getDocument({ document_id: 'alpha' }), (error) => error.code === 'DOCUMENT_HASH_MISMATCH');
});

test('full-text search is explicit, source-backed and restricted by allowed ids', async () => {
  const fx = await fixture();
  const reader = createKnowledgeSourceReader({
    storage: createFileSystemKnowledgeSourceStorage({ sourceRoot: fx.root, generatedRoot: fx.generated })
  });
  const result = await reader.searchDocuments({ query: 'Canonical', limit: 5, allowed_document_ids: ['alpha'], search_mode: 'full_text' });
  assert.equal(result.results.length, 1);
  assert.equal(result.results[0].document_id, 'alpha');
  assert.equal(result.results[0].retrieval_method, 'full_text');
  assert.equal(result.results[0].text.includes('Canonical'), true);
  assert.deepEqual((await reader.searchDocuments({ query: 'Canonical', allowed_document_ids: [] })).results, []);
});

test('generated status detects stale corpus binding', async () => {
  const fx = await fixture();
  const reader = createKnowledgeSourceReader({
    storage: createFileSystemKnowledgeSourceStorage({ sourceRoot: fx.root, generatedRoot: fx.generated })
  });
  const status = await reader.getGeneratedIndexStatus({});
  assert.equal(status.graph.status, 'current');
  assert.equal(status.rag.status, 'current');
  await writeFile(join(fx.generated, 'graph', 'graph.json'), '{\"changed\":true}');
  const corrupt = await reader.getGeneratedIndexStatus({});
  assert.equal(corrupt.graph.status, 'stale');
  assert.equal(corrupt.graph.reason, 'artifact_hash_mismatch');
  const current = JSON.parse(await readFile(join(fx.root, 'corpus-manifest.json'), 'utf8'));
  current.release = 'changed';
  await writeFile(join(fx.root, 'corpus-manifest.json'), JSON.stringify(current));
  const stale = await reader.getGeneratedIndexStatus({});
  assert.equal(stale.graph.status, 'stale');
  assert.equal(stale.rag.status, 'stale');
});

test('v2 generated status rejects invalid, missing and corrupt semantic or lexical artifacts', async () => {
  const cases = [
    ['semantic digest mismatch', async (fx) => writeFile(join(fx.generated, 'rag', 'index.json'), '{"changed":true}'), 'stale', 'semantic_artifact_hash_mismatch'],
    ['semantic artifact missing', async (fx) => rename(join(fx.generated, 'rag', 'index.json'), join(fx.generated, 'rag', 'index.json.missing')), 'missing', 'semantic_artifact_missing'],
    ['lexical digest mismatch', async (fx) => writeFile(join(fx.generated, 'rag', 'lexical-index.json'), '{"changed":true}'), 'stale', 'lexical_artifact_hash_mismatch'],
    ['lexical artifact missing', async (fx) => rename(join(fx.generated, 'rag', 'lexical-index.json'), join(fx.generated, 'rag', 'lexical-index.json.missing')), 'missing', 'lexical_artifact_missing'],
    ['invalid digest contract', async (fx) => {
      const path = join(fx.generated, 'rag', 'manifest.json');
      const manifest = JSON.parse(await readFile(path, 'utf8'));
      delete manifest.semantic_index_sha256;
      await writeFile(path, JSON.stringify(manifest));
    }, 'stale', 'manifest_contract_invalid']
  ];

  for (const [label, corrupt, status, reason] of cases) {
    const fx = await fixture();
    await corrupt(fx);
    const reader = createKnowledgeSourceReader({
      storage: createFileSystemKnowledgeSourceStorage({ sourceRoot: fx.root, generatedRoot: fx.generated })
    });
    const result = await reader.getGeneratedIndexStatus({});
    assert.equal(result.rag.status, status, label);
    assert.equal(result.rag.reason, reason, label);
  }
});
