import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { cp, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { buildKnowledgeSourceOutputsV2 } from '../src/knowledge-materializer-v2.js';

const root = resolve(import.meta.dirname, '../../..');

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

async function materializerFixture() {
  const fixtureRoot = await mkdtemp(join(tmpdir(), 'rus-materializer-v2-'));
  await cp(resolve(root, 'data/knowledge-source'), join(fixtureRoot, 'data/knowledge-source'), { recursive: true });
  await writeFile(join(fixtureRoot, 'package.json'), JSON.stringify({ version: 'test' }));
  return fixtureRoot;
}

test('knowledge materializer indexes every registered document lexically', async () => {
  const outputs = await buildKnowledgeSourceOutputsV2({ root });
  const corpusManifest = JSON.parse(await readFile(resolve(root, 'data/knowledge-source/corpus-manifest.json'), 'utf8'));
  const ragManifest = JSON.parse(outputs.get('generated/knowledge-source/rag/manifest.json'));
  const lexicalIndex = JSON.parse(outputs.get('generated/knowledge-source/rag/lexical-index.json'));

  assert.equal(outputs.has('generated/knowledge-source/rag/index.json'), false);
  assert.equal(ragManifest.registered_document_count, corpusManifest.documents.length);
  assert.equal(ragManifest.source_document_count, corpusManifest.documents.length);
  assert.equal(ragManifest.lexical_document_count, corpusManifest.documents.length);
  assert.equal(ragManifest.coverage.length, corpusManifest.documents.length);
  assert.ok(ragManifest.coverage.every((item) => item.lexical_indexed === true));
  assert.ok(ragManifest.coverage.every((item) => !Object.hasOwn(item, 'semantic_indexed')));
  assert.ok(lexicalIndex.chunk_count > 0);
  assert.equal(lexicalIndex.chunk_count, lexicalIndex.chunks.length);
  assert.ok(lexicalIndex.chunks.every((chunk) => !Object.hasOwn(chunk, 'embedding')));
  const lexicalChunkFiles = new Set(lexicalIndex.chunks.map((chunk) => String(chunk.file ?? '')));
  for (const record of corpusManifest.documents) {
    assert.ok(lexicalChunkFiles.has(record.file_name), record.document_id);
  }
});

test('RAG manifest digests only the lexical artifact', async () => {
  const outputs = await buildKnowledgeSourceOutputsV2({ root });
  const manifest = JSON.parse(outputs.get('generated/knowledge-source/rag/manifest.json'));
  const lexicalText = outputs.get('generated/knowledge-source/rag/lexical-index.json');
  assert.equal(manifest.lexical_index_sha256, sha256(lexicalText));
  assert.equal(typeof manifest.lexical_index, 'string');
  assert.equal(Object.hasOwn(manifest, 'semantic_index'), false);
  assert.equal(Object.hasOwn(manifest, 'source_snapshot'), false);
});

test('knowledge materializer builds structural graph nodes for every active document', async () => {
  const outputs = await buildKnowledgeSourceOutputsV2({ root });
  const corpusManifest = JSON.parse(await readFile(resolve(root, 'data/knowledge-source/corpus-manifest.json'), 'utf8'));
  const graphManifest = JSON.parse(outputs.get('generated/knowledge-source/graph/manifest.json'));
  const graph = JSON.parse(outputs.get('generated/knowledge-source/graph/graph.json'));
  const activeDocuments = corpusManifest.documents.filter((record) => record.status === 'active');
  const structuralNodes = graph.nodes.filter((node) => node.structural_only === true);

  assert.equal(graphManifest.generation_mode, 'structural_document_nodes_only');
  assert.equal(graphManifest.source_document_count, activeDocuments.length);
  assert.equal(graphManifest.structural_only_document_count, activeDocuments.length);
  assert.equal(structuralNodes.length, activeDocuments.length);
  assert.equal(graph.links.length, 0);
  assert.equal(graph.hyperedges.length, 0);
  assert.ok(structuralNodes.every((node) => node.type === 'canonical_document'));
  assert.equal(structuralNodes.some((node) => node.id === 'canonical-document:code-driven-world-materialization-architecture'), true);
  assert.equal(structuralNodes.some((node) => node.id === 'canonical-document:items-and-property'), true);
  assert.equal(structuralNodes.some((node) => node.id === 'canonical-document:weapons-and-armor'), false);
});

test('knowledge materializer includes changed proposed documents lexically without activating them in the graph', async () => {
  const fixtureRoot = await materializerFixture();
  const sourceRoot = join(fixtureRoot, 'data/knowledge-source');
  const manifestPath = join(sourceRoot, 'corpus-manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const proposed = manifest.documents.find((record) => record.status === 'proposed');
  const documentPath = join(sourceRoot, proposed.canonical_path);
  const changed = Buffer.concat([await readFile(documentPath), Buffer.from('\nproposed lexical change\n')]);
  await writeFile(documentPath, changed);
  proposed.sha256 = sha256(changed);
  proposed.bytes = changed.length;
  await writeFile(manifestPath, `${JSON.stringify(manifest)}\n`);

  const outputs = await buildKnowledgeSourceOutputsV2({ root: fixtureRoot });
  const ragManifest = JSON.parse(outputs.get('generated/knowledge-source/rag/manifest.json'));
  const lexicalIndex = JSON.parse(outputs.get('generated/knowledge-source/rag/lexical-index.json'));
  const graph = JSON.parse(outputs.get('generated/knowledge-source/graph/graph.json'));
  const coverage = ragManifest.coverage.find((item) => item.document_id === proposed.document_id);

  assert.equal(coverage.lexical_indexed, true);
  assert.ok(lexicalIndex.chunks.some((chunk) => String(chunk.file) === proposed.file_name));
  assert.equal(graph.nodes.some((node) => node.id === `canonical-document:${proposed.document_id}`), false);
});

test('unseen-equivalent: new active document stays lexical and readiness stays ready', async () => {
  const fixtureRoot = await materializerFixture();
  const sourceRoot = join(fixtureRoot, 'data/knowledge-source');
  const manifestPath = join(sourceRoot, 'corpus-manifest.json');
  const policyPath = join(sourceRoot, 'retrieval-policy.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const policy = JSON.parse(await readFile(policyPath, 'utf8'));
  const text = Buffer.from('# Unseen Equivalent\n\nNew active document for lexical RAG readiness.\n');
  const fileName = 'unseen_equivalent_lexical.md';
  const documentId = 'unseen-equivalent-lexical';
  await writeFile(join(sourceRoot, 'corpus/DOCUMENTS', fileName), text);
  manifest.documents.push({
    document_id: documentId,
    canonical_path: `corpus/DOCUMENTS/${fileName}`,
    file_name: fileName,
    sha256: sha256(text),
    bytes: text.length,
    status: 'active',
    priority_tier: 'technical_contract',
    provenance_mode: 'native'
  });
  policy.documents.push({
    document_id: documentId,
    document_type: 'technical_contract',
    priority_tier: 'technical_contract',
    subsystems: ['knowledge-source'],
    related_document_ids: ['contract-index'],
    related_module_paths: ['packages/knowledge-source'],
    related_contracts: [],
    search_terms: ['unseen equivalent lexical'],
    conflicts_with_document_ids: []
  });
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  policy.baseline_manifest_sha256 = sha256(await readFile(manifestPath));
  await writeFile(policyPath, `${JSON.stringify(policy, null, 2)}\n`);

  const { writeKnowledgeSourceOutputsV2 } = await import('../src/knowledge-materializer-v2.js');
  await writeKnowledgeSourceOutputsV2({ root: fixtureRoot });
  const { createFileSystemKnowledgeSourceStorage } = await import('../../../packages/knowledge-source/src/adapters/filesystem-storage.js');
  const { createKnowledgeRagReader } = await import('../../../packages/knowledge-source/src/services/rag-reader.js');
  const storage = createFileSystemKnowledgeSourceStorage({
    sourceRoot: join(fixtureRoot, 'data/knowledge-source'),
    generatedRoot: join(fixtureRoot, 'generated/knowledge-source')
  });
  const status = await createKnowledgeRagReader({ storage }).getReadinessStatus();
  assert.equal(status.status, 'ready');
  const ragManifest = JSON.parse(await readFile(join(fixtureRoot, 'generated/knowledge-source/rag/manifest.json'), 'utf8'));
  const coverage = ragManifest.coverage.find((item) => item.document_id === documentId);
  assert.equal(coverage.lexical_indexed, true);
  assert.ok(!Object.hasOwn(coverage, 'semantic_indexed'));
});
