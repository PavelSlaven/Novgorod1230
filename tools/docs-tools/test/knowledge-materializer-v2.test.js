import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { cp, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { buildKnowledgeSourceOutputsV2 } from '../src/knowledge-materializer-v2.js';

const root = resolve(import.meta.dirname, '../../..');
const compatibleSemanticFixtureFile = 'world_regions.txt';

function sourceFile(entity) {
  return basename(String(entity?.source_location?.file ?? entity?.source_file ?? ''));
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

async function materializerFixture() {
  const fixtureRoot = await mkdtemp(join(tmpdir(), 'rus-materializer-v2-'));
  await cp(resolve(root, 'data/knowledge-source'), join(fixtureRoot, 'data/knowledge-source'), { recursive: true });
  await writeFile(join(fixtureRoot, 'package.json'), JSON.stringify({ version: 'test' }));
  return fixtureRoot;
}

test('knowledge materializer preserves approved semantic vectors and indexes only native documents lexically', async () => {
  const outputs = await buildKnowledgeSourceOutputsV2({ root });
  const corpusManifest = JSON.parse(await readFile(resolve(root, 'data/knowledge-source/corpus-manifest.json'), 'utf8'));
  const ragManifest = JSON.parse(outputs.get('generated/knowledge-source/rag/manifest.json'));
  const semanticIndex = JSON.parse(outputs.get('generated/knowledge-source/rag/index.json'));
  const lexicalIndex = JSON.parse(outputs.get('generated/knowledge-source/rag/lexical-index.json'));
  const activeDocuments = corpusManifest.documents.filter((record) => record.status === 'active');
  const semanticFiles = new Set(semanticIndex.chunks.map((chunk) => basename(String(chunk.file ?? ''))));
  const semanticDocumentCount = activeDocuments.filter((record) => semanticFiles.has(record.file_name)).length;
  const lexicalOnlyDocumentCount = corpusManifest.documents.length - semanticDocumentCount;

  assert.equal(ragManifest.registered_document_count, corpusManifest.documents.length);
  assert.equal(ragManifest.source_document_count, corpusManifest.documents.length);
  assert.equal(ragManifest.semantic_document_count, semanticDocumentCount);
  assert.equal(ragManifest.lexical_only_document_count, lexicalOnlyDocumentCount);
  assert.equal(ragManifest.coverage.length, corpusManifest.documents.length);
  const coverageDocumentIds = ragManifest.coverage.map((item) => item.document_id).sort();
  const manifestDocumentIds = corpusManifest.documents.map((item) => item.document_id).sort();
  assert.deepEqual(coverageDocumentIds, manifestDocumentIds);
  assert.equal(new Set(coverageDocumentIds).size, coverageDocumentIds.length);
  assert.equal(ragManifest.coverage.filter((item) => item.semantic_indexed).length, semanticDocumentCount);
  assert.equal(ragManifest.coverage.filter((item) => item.lexical_indexed).length, lexicalOnlyDocumentCount);
  assert.ok(ragManifest.coverage.every((item) => item.semantic_indexed !== item.lexical_indexed));
  assert.equal(ragManifest.semantic_document_count + ragManifest.lexical_only_document_count, ragManifest.source_document_count);
  assert.equal(semanticIndex.chunk_count, semanticIndex.chunks.length);
  assert.ok(semanticIndex.chunk_count > 0);
  assert.ok(semanticIndex.chunks.every((chunk) => Array.isArray(chunk.embedding) && chunk.embedding.length === semanticIndex.dimensions));
  assert.ok(lexicalIndex.chunk_count > 0);
  assert.ok(lexicalIndex.chunks.every((chunk) => !Object.hasOwn(chunk, 'embedding')));

  const lexicalCoverageFiles = new Set(ragManifest.coverage.filter((item) => item.lexical_indexed).map((item) => item.file_name));
  const lexicalChunkFiles = new Set(lexicalIndex.chunks.map((chunk) => basename(String(chunk.file ?? ''))));
  assert.deepEqual(lexicalChunkFiles, lexicalCoverageFiles);
  const proposed = corpusManifest.documents.filter((record) => record.status === 'proposed');
  assert.ok(proposed.length > 0);
  for (const record of proposed) {
    const coverage = ragManifest.coverage.find((item) => item.document_id === record.document_id);
    assert.deepEqual(coverage, {
      document_id: record.document_id,
      file_name: record.file_name,
      lexical_indexed: true,
      semantic_indexed: false,
      semantic_reason: 'approved_embedding_absent'
    });
    assert.ok(lexicalChunkFiles.has(record.file_name));
    assert.equal(semanticFiles.has(record.file_name), false);
  }
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
  const semanticIndex = JSON.parse(outputs.get('generated/knowledge-source/rag/index.json'));
  const graphManifest = JSON.parse(outputs.get('generated/knowledge-source/graph/manifest.json'));
  const graph = JSON.parse(outputs.get('generated/knowledge-source/graph/graph.json'));
  const activeDocuments = corpusManifest.documents.filter((record) => record.status === 'active');
  const structuralNodes = graph.nodes.filter((node) => node.structural_only === true);
  const semanticFiles = new Set(semanticIndex.chunks.map((chunk) => basename(String(chunk.file ?? ''))));
  const structuralOnlyDocumentCount = activeDocuments.filter((record) => !semanticFiles.has(record.file_name)).length;

  assert.equal(graphManifest.registered_document_count, corpusManifest.documents.length);
  assert.equal(graphManifest.source_document_count, activeDocuments.length);
  assert.equal(graphManifest.structural_only_document_count, structuralOnlyDocumentCount);
  assert.equal(structuralNodes.length, structuralOnlyDocumentCount);
  assert.ok(structuralNodes.every((node) => node.type === 'canonical_document'));
  assert.equal(structuralNodes.some((node) => node.id === 'canonical-document:code-driven-world-materialization-architecture'), true);
  assert.equal(structuralNodes.some((node) => node.id === 'canonical-document:world-base-materialization-table-requirements'), true);
  assert.equal(structuralNodes.some((node) => node.id === 'canonical-document:universal-category-classification-policy'), false);
});

test('knowledge materializer includes changed proposed documents lexically without semantic or active-graph activation', async () => {
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
  const semanticIndex = JSON.parse(outputs.get('generated/knowledge-source/rag/index.json'));
  const graph = JSON.parse(outputs.get('generated/knowledge-source/graph/graph.json'));
  const coverage = ragManifest.coverage.find((item) => item.document_id === proposed.document_id);

  assert.equal(coverage.lexical_indexed, true);
  assert.equal(coverage.semantic_indexed, false);
  assert.ok(lexicalIndex.chunks.some((chunk) => basename(String(chunk.file)) === proposed.file_name));
  assert.equal(semanticIndex.chunks.some((chunk) => basename(String(chunk.file)) === proposed.file_name), false);
  assert.equal(graph.nodes.some((node) => node.id === `canonical-document:${proposed.document_id}`), false);
});

test('knowledge materializer downgrades changed semantic text to lexical-only coverage', async () => {
  const fixtureRoot = await materializerFixture();
  const sourceRoot = join(fixtureRoot, 'data/knowledge-source');
  const snapshot = JSON.parse(await readFile(join(sourceRoot, 'imports/rag/index.json'), 'utf8'));
  const semanticFile = basename(String(snapshot.chunks[0].file));
  const manifestPath = join(sourceRoot, 'corpus-manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const record = manifest.documents.find((item) => item.file_name === semanticFile);
  const documentPath = join(sourceRoot, record.canonical_path);
  const changed = Buffer.concat([await readFile(documentPath), Buffer.from('\nsemantic snapshot mismatch\n')]);
  await writeFile(documentPath, changed);
  record.sha256 = sha256(changed);
  record.bytes = changed.length;
  await writeFile(manifestPath, `${JSON.stringify(manifest)}\n`);

  const outputs = await buildKnowledgeSourceOutputsV2({ root: fixtureRoot });
  const ragManifest = JSON.parse(outputs.get('generated/knowledge-source/rag/manifest.json'));
  const lexicalIndex = JSON.parse(outputs.get('generated/knowledge-source/rag/lexical-index.json'));
  const graph = JSON.parse(outputs.get('generated/knowledge-source/graph/graph.json'));
  const coverage = ragManifest.coverage.find((item) => item.file_name === semanticFile);
  assert.equal(coverage.semantic_indexed, false);
  assert.equal(coverage.lexical_indexed, true);
  assert.ok(lexicalIndex.chunks.some((chunk) => basename(String(chunk.file)) === semanticFile));
  assert.equal(graph.nodes.some((node) => node.structural_only !== true && basename(String(node.source_file ?? '')) === semanticFile), false);
  assert.ok(graph.nodes.some((node) => node.id === `canonical-document:${record.document_id}` && node.structural_only === true));
});

test('knowledge materializer rejects invalid semantic graph source locations', async () => {
  const fixtureRoot = await materializerFixture();
  const sourceRoot = join(fixtureRoot, 'data/knowledge-source');
  const graphPath = join(fixtureRoot, 'data/knowledge-source/imports/graph/graph.json');
  const original = JSON.parse(await readFile(graphPath, 'utf8'));
  const semanticNode = original.nodes.find((node) => sourceFile(node) === compatibleSemanticFixtureFile);
  assert.ok(semanticNode);
  const firstFile = sourceFile(semanticNode);
  const manifest = JSON.parse(await readFile(join(sourceRoot, 'corpus-manifest.json'), 'utf8'));
  const firstRecord = manifest.documents.find((record) => record.file_name === firstFile);
  const firstText = await readFile(join(sourceRoot, firstRecord.canonical_path), 'utf8');
  const actualLineCount = firstText.split(/\r?\n/u).length - (firstText.endsWith('\n') ? 1 : 0);
  const cases = [
    ['missing location', (_location, node) => { delete node.source_location; }, /source_location is missing/u],
    ['missing location file', (location) => { delete location.file; }, /source_location\.file is missing/u],
    ['missing source_file', (_location, node) => { delete node.source_file; }, /source_file is missing/u],
    ['missing file', (location, node) => {
      location.file = 'DOCUMENTS/missing-source.md';
      node.source_file = location.file;
    }, /references missing file/u],
    ['source path traversal', (location) => { location.file = '../README.md'; }, /invalid source path/u],
    ['source_file traversal', (_location, node) => { node.source_file = '../README.md'; }, /invalid source_file/u],
    ['source_file mismatch', (_location, node) => { node.source_file = 'DOCUMENTS/character_parameters.txt'; }, /source_file differs from source_location\.file/u],
    ['line below one', (location) => { location.line_start = 0; }, /invalid line_start/u],
    ['one line after EOF', (location) => { location.line_end = actualLineCount + 1; }, /line_end exceeds/u],
    ['line beyond EOF', (location) => { location.line_end = Number.MAX_SAFE_INTEGER; }, /line_end exceeds/u],
    ['inverted range', (location) => { location.line_start = 2; location.line_end = 1; }, /inverted line range/u]
  ];

  for (const [label, corrupt, pattern] of cases) {
    const graph = structuredClone(original);
    const node = graph.nodes.find((item) => item.id === semanticNode.id);
    corrupt(node.source_location, node);
    await writeFile(graphPath, JSON.stringify(graph));
    await assert.rejects(
      () => buildKnowledgeSourceOutputsV2({ root: fixtureRoot }),
      pattern,
      label
    );
  }
});

test('knowledge materializer rejects invalid link and hyperedge provenance', async () => {
  const fixtureRoot = await materializerFixture();
  const sourceRoot = join(fixtureRoot, 'data/knowledge-source');
  const graphPath = join(sourceRoot, 'imports/graph/graph.json');
  const original = JSON.parse(await readFile(graphPath, 'utf8'));
  const manifest = JSON.parse(await readFile(join(sourceRoot, 'corpus-manifest.json'), 'utf8'));
  const sourceByNodeId = new Map(original.nodes.map((node) => [node.id, sourceFile(node)]));
  const compatibleLink = original.links.find((link) => sourceFile(link) === compatibleSemanticFixtureFile
    && sourceByNodeId.get(link.source) === compatibleSemanticFixtureFile
    && sourceByNodeId.get(link.target) === compatibleSemanticFixtureFile);
  assert.ok(compatibleLink);
  const fixtures = {
    links: compatibleLink,
    hyperedges: {
      id: 'compatible-hyperedge-fixture',
      source_file: `DOCUMENTS/${compatibleSemanticFixtureFile}`,
      source_location: { file: `DOCUMENTS/${compatibleSemanticFixtureFile}`, line_start: 1, line_end: 1 },
      nodes: [compatibleLink.source, compatibleLink.target]
    }
  };
  const cases = [
    ['missing location', (_location, entity) => { delete entity.source_location; }, /source_location is missing/u],
    ['missing source_file', (_location, entity) => { delete entity.source_file; }, /source_file is missing/u],
    ['source_file traversal', (_location, entity) => { entity.source_file = '../escape.md'; }, /invalid source_file/u],
    ['source_file mismatch', (_location, entity) => { entity.source_file = 'DOCUMENTS/character_parameters.txt'; }, /source_file differs from source_location\.file/u],
    ['one line after EOF', (location, entity, lineCount) => { location.line_end = lineCount + 1; }, /line_end exceeds/u],
    ['inverted range', (location) => { location.line_start = 2; location.line_end = 1; }, /inverted line range/u]
  ];

  for (const collection of ['links', 'hyperedges']) {
    for (const [label, corrupt, pattern] of cases) {
      const graph = structuredClone(original);
      const entity = structuredClone(fixtures[collection]);
      graph[collection].push(entity);
      const file = sourceFile(entity);
      const record = manifest.documents.find((item) => item.file_name === file);
      const text = await readFile(join(sourceRoot, record.canonical_path), 'utf8');
      const lineCount = text.split(/\r?\n/u).length - (text.endsWith('\n') ? 1 : 0);
      corrupt(entity.source_location, entity, lineCount);
      await writeFile(graphPath, JSON.stringify(graph));
      await assert.rejects(
        () => buildKnowledgeSourceOutputsV2({ root: fixtureRoot }),
        pattern,
        `${collection}: ${label}`
      );
    }
  }
});

test('knowledge materializer rejects graph semantics outside the approved embedding set', async () => {
  const fixtureRoot = await materializerFixture();
  const sourceRoot = join(fixtureRoot, 'data/knowledge-source');
  const graphPath = join(sourceRoot, 'imports/graph/graph.json');
  const graph = JSON.parse(await readFile(graphPath, 'utf8'));
  const manifest = JSON.parse(await readFile(join(sourceRoot, 'corpus-manifest.json'), 'utf8'));
  const nativeRecord = manifest.documents.find((record) => record.document_id === 'development-rules');
  graph.nodes.push({
    ...structuredClone(graph.nodes[0]),
    id: 'unapproved-native-semantic-node',
    source_file: `DOCUMENTS/${nativeRecord.file_name}`,
    source_location: { file: nativeRecord.file_name, line_start: 1, line_end: 1 }
  });
  graph.links.push({
    ...structuredClone(graph.links[0]),
    source: graph.nodes[0].id,
    target: 'unapproved-native-semantic-node',
    source_file: `DOCUMENTS/${nativeRecord.file_name}`,
    source_location: { file: nativeRecord.file_name, line_start: 1, line_end: 1 }
  });
  await writeFile(graphPath, JSON.stringify(graph));

  await assert.rejects(
    () => buildKnowledgeSourceOutputsV2({ root: fixtureRoot }),
    /not approved for semantic graph/u
  );
});

test('knowledge materializer rejects links and hyperedges touching structural document nodes', async () => {
  const fixtureRoot = await materializerFixture();
  const graphPath = join(fixtureRoot, 'data/knowledge-source/imports/graph/graph.json');
  const original = JSON.parse(await readFile(graphPath, 'utf8'));
  const structuralId = 'canonical-document:development-rules';
  const sourceByNodeId = new Map(original.nodes.map((node) => [node.id, sourceFile(node)]));
  const compatibleLink = original.links.find((link) => sourceFile(link) === compatibleSemanticFixtureFile
    && sourceByNodeId.get(link.source) === compatibleSemanticFixtureFile
    && sourceByNodeId.get(link.target) === compatibleSemanticFixtureFile);
  const compatibleHyperedge = {
    id: 'compatible-hyperedge-fixture',
    source_file: `DOCUMENTS/${compatibleSemanticFixtureFile}`,
    source_location: { file: `DOCUMENTS/${compatibleSemanticFixtureFile}`, line_start: 1, line_end: 1 },
    nodes: [compatibleLink?.source, compatibleLink?.target]
  };
  assert.ok(compatibleLink);
  assert.ok(compatibleHyperedge);
  const cases = [
    ['link', (graph) => graph.links.push({ ...structuredClone(compatibleLink), source: structuralId })],
    ['hyperedge', (graph) => graph.hyperedges.push({ ...structuredClone(compatibleHyperedge), id: 'invalid-structural-hyperedge', nodes: [...compatibleHyperedge.nodes, structuralId] })]
  ];

  for (const [label, mutate] of cases) {
    const graph = structuredClone(original);
    mutate(graph);
    await writeFile(graphPath, JSON.stringify(graph));
    await assert.rejects(
      () => buildKnowledgeSourceOutputsV2({ root: fixtureRoot }),
      /semantic relation touches structural-only node/u,
      label
    );
  }
});

test('knowledge materializer rejects invalid hyperedge member source files', async () => {
  const fixtureRoot = await materializerFixture();
  const graphPath = join(fixtureRoot, 'data/knowledge-source/imports/graph/graph.json');
  const original = JSON.parse(await readFile(graphPath, 'utf8'));
  const cases = [
    ['native structural source', 'DOCUMENTS/development_rules.txt', /not approved for semantic graph/u],
    ['missing source', 'DOCUMENTS/missing-source.md', /references missing member source/u],
    ['source traversal', '../escape.md', /invalid member source path/u]
  ];

  for (const [label, memberSource, pattern] of cases) {
    const graph = structuredClone(original);
    graph.hyperedges[0].member_source_files[memberSource] = 1;
    await writeFile(graphPath, JSON.stringify(graph));
    await assert.rejects(
      () => buildKnowledgeSourceOutputsV2({ root: fixtureRoot }),
      pattern,
      label
    );
  }
});
