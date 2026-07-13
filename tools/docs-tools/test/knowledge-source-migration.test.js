import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rename, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import {
  importKnowledgeSourceFromLegacy,
  readKnowledgeSourceInventory,
  verifyKnowledgeSourceMigration,
  buildKnowledgeGraphFromSnapshot,
  buildRagIndexFromSnapshot
} from '../src/index.js';
import { writeKnowledgeSourceOutputs as writePublicKnowledgeSourceOutputs } from '@rus/docs-tools';

const root = resolve(import.meta.dirname, '../../..');

async function readCorpusManifest() {
  return JSON.parse(await readFile(resolve(root, 'data/knowledge-source/corpus-manifest.json'), 'utf8'));
}

async function readSemanticGraphFiles() {
  const graph = JSON.parse(await readFile(resolve(root, 'data/knowledge-source/imports/graph/graph.json'), 'utf8'));
  return new Set((graph.nodes ?? []).map((node) => basename(String(node?.source_location?.file ?? node?.sourceLocation?.file ?? node?.source_file ?? ''))).filter(Boolean));
}

test('stored legacy DOCUMENTS inventory exactly covers manifest legacy records', async () => {
  const manifest = await readCorpusManifest();
  const inventory = await readKnowledgeSourceInventory({ root });
  assert.equal(inventory.files.some((item) => item.classification === 'unknown'), false);
  const expectedLegacyPaths = new Set(manifest.documents.filter((record) => record.source_legacy_path).map((record) => record.source_legacy_path));
  const actualLegacyPaths = new Set(inventory.files.filter((item) => item.classification === 'canonical_source').map((item) => item.legacy_path));
  assert.deepEqual(actualLegacyPaths, expectedLegacyPaths);
});

test('migrated corpus and generated provenance verify without requiring legacy', { concurrency: false }, async () => {
  const manifest = await readCorpusManifest();
  const legacyCount = manifest.documents.filter((record) => record.source_legacy_path).length;
  const legacy = resolve(root, 'legacy/DOCUMENTS');
  const hidden = resolve(root, 'legacy/DOCUMENTS.__knowledge_source_test__');
  await rename(legacy, hidden);
  try {
    const result = await verifyKnowledgeSourceMigration({ root });
    assert.equal(result.ok, true, result.errors.join('\n'));
    assert.equal(result.document_count, manifest.documents.length);
    assert.equal(result.legacy_document_count, legacyCount);
    assert.equal(result.native_document_count, manifest.documents.length - legacyCount);
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
  const manifest = await readCorpusManifest();
  const semanticGraphFiles = await readSemanticGraphFiles();
  const expectedStructuralOnlyCount = manifest.documents.filter((record) => !semanticGraphFiles.has(record.file_name)).length;
  const graphA = await buildKnowledgeGraphFromSnapshot({ root });
  const graphB = await buildKnowledgeGraphFromSnapshot({ root });
  assert.equal(JSON.stringify(graphA), JSON.stringify(graphB));
  assert.equal(graphA.manifest.source_document_count, manifest.documents.length);
  assert.equal(graphA.manifest.structural_only_document_count, expectedStructuralOnlyCount);

  const ragA = await buildRagIndexFromSnapshot({ root });
  const ragB = await buildRagIndexFromSnapshot({ root });
  assert.equal(JSON.stringify(ragA), JSON.stringify(ragB));
  assert.equal(ragA.manifest.source_document_count, manifest.documents.length);
  assert.equal(ragA.manifest.semantic_document_count, 19);
  assert.equal(ragA.manifest.lexical_only_document_count, manifest.documents.length - 19);
  assert.equal(ragA.index.chunk_count, 813);
  assert.ok(ragA.lexical_index.chunk_count > 0);
  assert.equal(ragA.lexical_index.chunks.some((chunk) => Object.hasOwn(chunk, 'embedding')), false);

  const legacyManifest = JSON.parse(await readFile(resolve(root, 'legacy/DOCUMENTS/documents-kg/rag-index/manifest.json'), 'utf8'));
  assert.notEqual(ragA.manifest.corpus_root, legacyManifest.corpus_dir);
  assert.equal(ragA.manifest.corpus_root, 'data/knowledge-source/corpus/DOCUMENTS');
});

test('public knowledge writer uses the v2 structural and lexical materializer', { concurrency: false }, async () => {
  const manifest = await readCorpusManifest();
  const semanticGraphFiles = await readSemanticGraphFiles();
  const expectedStructuralOnlyCount = manifest.documents.filter((record) => !semanticGraphFiles.has(record.file_name)).length;
  const result = await writePublicKnowledgeSourceOutputs({ root });
  assert.deepEqual(result.files, [
    'generated/knowledge-source/graph/GRAPH_REPORT.md',
    'generated/knowledge-source/graph/graph.html',
    'generated/knowledge-source/graph/graph.json',
    'generated/knowledge-source/graph/manifest.json',
    'generated/knowledge-source/manifests/inventory.json',
    'generated/knowledge-source/manifests/knowledge-source-generated-manifest.json',
    'generated/knowledge-source/rag/index.json',
    'generated/knowledge-source/rag/lexical-index.json',
    'generated/knowledge-source/rag/manifest.json'
  ]);

  const graph = JSON.parse(await readFile(resolve(root, 'generated/knowledge-source/graph/graph.json'), 'utf8'));
  const ragManifest = JSON.parse(await readFile(resolve(root, 'generated/knowledge-source/rag/manifest.json'), 'utf8'));
  const lexicalIndex = JSON.parse(await readFile(resolve(root, 'generated/knowledge-source/rag/lexical-index.json'), 'utf8'));
  const expectedLexicalOnlyCount = manifest.documents.length - ragManifest.semantic_document_count;
  assert.equal(graph.nodes.filter((node) => node.structural_only === true).length, expectedStructuralOnlyCount);
  assert.equal(ragManifest.semantic_document_count, 19);
  assert.equal(ragManifest.lexical_only_document_count, expectedLexicalOnlyCount);
  assert.equal(lexicalIndex.chunk_count, lexicalIndex.chunks.length);
  assert.ok(lexicalIndex.chunk_count > 0);
  assert.equal(lexicalIndex.chunks.some((chunk) => Object.hasOwn(chunk, 'embedding')), false);
});

test('re-importing legacy sources preserves native records, aliases and files', { concurrency: false }, async () => {
  const fixtureRoot = await mkdtemp(join(tmpdir(), 'rus-knowledge-import-'));
  await cp(resolve(root, 'data/knowledge-source'), join(fixtureRoot, 'data/knowledge-source'), { recursive: true });
  await cp(resolve(root, 'legacy/DOCUMENTS/documents-kg'), join(fixtureRoot, 'legacy/DOCUMENTS/documents-kg'), { recursive: true });
  const sourceRoot = join(fixtureRoot, 'data/knowledge-source');
  const beforeManifest = JSON.parse(await readFile(join(sourceRoot, 'corpus-manifest.json'), 'utf8'));
  const beforeAliases = JSON.parse(await readFile(join(sourceRoot, 'source-aliases.json'), 'utf8')).aliases;
  const nativeRecords = beforeManifest.documents.filter((record) => !record.source_legacy_path);
  const nativeIds = new Set(nativeRecords.map((record) => record.document_id));
  const nativeAliases = Object.fromEntries(Object.entries(beforeAliases).filter(([, documentId]) => nativeIds.has(documentId)));
  const nativeBytes = new Map();
  for (const record of nativeRecords) nativeBytes.set(record.document_id, await readFile(join(sourceRoot, record.canonical_path)));

  const result = await importKnowledgeSourceFromLegacy({ root: fixtureRoot });
  const afterManifest = JSON.parse(await readFile(join(sourceRoot, 'corpus-manifest.json'), 'utf8'));
  const afterAliases = JSON.parse(await readFile(join(sourceRoot, 'source-aliases.json'), 'utf8')).aliases;
  const afterById = new Map(afterManifest.documents.map((record) => [record.document_id, record]));

  assert.equal(result.document_count, beforeManifest.documents.length);
  assert.equal(afterManifest.documents.length, beforeManifest.documents.length);
  for (const record of nativeRecords) {
    assert.deepEqual(afterById.get(record.document_id), record);
    assert.deepEqual(await readFile(join(sourceRoot, record.canonical_path)), nativeBytes.get(record.document_id));
  }
  for (const [alias, documentId] of Object.entries(nativeAliases)) assert.equal(afterAliases[alias], documentId);
});

test('legacy import rejects native collisions before changing canonical state', { concurrency: false }, async () => {
  const fixtureRoot = await mkdtemp(join(tmpdir(), 'rus-knowledge-import-collision-'));
  await cp(resolve(root, 'data/knowledge-source'), join(fixtureRoot, 'data/knowledge-source'), { recursive: true });
  await cp(resolve(root, 'legacy/DOCUMENTS/documents-kg'), join(fixtureRoot, 'legacy/DOCUMENTS/documents-kg'), { recursive: true });
  const sourceRoot = join(fixtureRoot, 'data/knowledge-source');
  const manifestPath = join(sourceRoot, 'corpus-manifest.json');
  const aliasesPath = join(sourceRoot, 'source-aliases.json');
  const manifestBefore = await readFile(manifestPath);
  const aliasesBefore = await readFile(aliasesPath);
  const manifest = JSON.parse(manifestBefore.toString('utf8'));
  const nativeRecord = manifest.documents.find((record) => record.document_id === 'development-rules');
  const nativePath = join(sourceRoot, nativeRecord.canonical_path);
  const nativeBefore = await readFile(nativePath);
  const collisionPath = join(fixtureRoot, 'legacy/DOCUMENTS/documents-kg/corpus/DOCUMENTS', nativeRecord.file_name);
  await writeFile(collisionPath, 'malicious legacy collision\n');

  await assert.rejects(
    () => importKnowledgeSourceFromLegacy({ root: fixtureRoot }),
    /Legacy import conflicts with native document/u
  );
  assert.deepEqual(await readFile(manifestPath), manifestBefore);
  assert.deepEqual(await readFile(aliasesPath), aliasesBefore);
  assert.deepEqual(await readFile(nativePath), nativeBefore);
});

test('legacy import rejects history conflicts before changing canonical state', { concurrency: false }, async () => {
  const fixtureRoot = await mkdtemp(join(tmpdir(), 'rus-knowledge-import-history-'));
  await cp(resolve(root, 'data/knowledge-source'), join(fixtureRoot, 'data/knowledge-source'), { recursive: true });
  await cp(resolve(root, 'legacy/DOCUMENTS/documents-kg'), join(fixtureRoot, 'legacy/DOCUMENTS/documents-kg'), { recursive: true });
  const sourceRoot = join(fixtureRoot, 'data/knowledge-source');
  const manifestPath = join(sourceRoot, 'corpus-manifest.json');
  const aliasesPath = join(sourceRoot, 'source-aliases.json');
  const inventoryPath = join(sourceRoot, 'imports/legacy-inventory.json');
  const manifestBefore = await readFile(manifestPath);
  const aliasesBefore = await readFile(aliasesPath);
  const inventoryBefore = await readFile(inventoryPath);
  const manifest = JSON.parse(manifestBefore.toString('utf8'));
  const corpusBefore = new Map();
  for (const record of manifest.documents) corpusBefore.set(record.canonical_path, await readFile(join(sourceRoot, record.canonical_path)));
  const legacyRecord = manifest.documents.find((record) => record.source_legacy_path);
  await writeFile(join(fixtureRoot, legacyRecord.source_legacy_path), 'changed legacy source\n');

  await assert.rejects(
    () => importKnowledgeSourceFromLegacy({ root: fixtureRoot }),
    /Import history conflict .* inventory_sha256/u
  );
  assert.deepEqual(await readFile(manifestPath), manifestBefore);
  assert.deepEqual(await readFile(aliasesPath), aliasesBefore);
  assert.deepEqual(await readFile(inventoryPath), inventoryBefore);
  for (const [canonicalPath, bytes] of corpusBefore) assert.deepEqual(await readFile(join(sourceRoot, canonicalPath)), bytes, canonicalPath);
});

test('legacy import rejects malformed history before changing canonical state', { concurrency: false }, async () => {
  const fixtureRoot = await mkdtemp(join(tmpdir(), 'rus-knowledge-import-invalid-history-'));
  await cp(resolve(root, 'data/knowledge-source'), join(fixtureRoot, 'data/knowledge-source'), { recursive: true });
  await cp(resolve(root, 'legacy/DOCUMENTS/documents-kg'), join(fixtureRoot, 'legacy/DOCUMENTS/documents-kg'), { recursive: true });
  const sourceRoot = join(fixtureRoot, 'data/knowledge-source');
  const manifestPath = join(sourceRoot, 'corpus-manifest.json');
  const aliasesPath = join(sourceRoot, 'source-aliases.json');
  const inventoryPath = join(sourceRoot, 'imports/legacy-inventory.json');
  const historyPath = join(sourceRoot, 'import-history.json');
  const manifestBefore = await readFile(manifestPath);
  const aliasesBefore = await readFile(aliasesPath);
  const inventoryBefore = await readFile(inventoryPath);
  const manifest = JSON.parse(manifestBefore.toString('utf8'));
  const corpusBefore = new Map();
  for (const record of manifest.documents) corpusBefore.set(record.canonical_path, await readFile(join(sourceRoot, record.canonical_path)));
  await writeFile(historyPath, '{ invalid json\n');

  await assert.rejects(
    () => importKnowledgeSourceFromLegacy({ root: fixtureRoot }),
    /Invalid knowledge-source import history/u
  );
  assert.deepEqual(await readFile(manifestPath), manifestBefore);
  assert.deepEqual(await readFile(aliasesPath), aliasesBefore);
  assert.deepEqual(await readFile(inventoryPath), inventoryBefore);
  for (const [canonicalPath, bytes] of corpusBefore) assert.deepEqual(await readFile(join(sourceRoot, canonicalPath)), bytes, canonicalPath);
});
