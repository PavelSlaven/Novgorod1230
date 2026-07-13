import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { buildCorpusChunks, computeCorpusHashFromFiles } from './knowledge-chunks.js';
import { readKnowledgeSourceInventory } from './knowledge-source.js';

const SOURCE_ROOT = 'data/knowledge-source';
const GENERATED_ROOT = 'generated/knowledge-source';

export async function buildKnowledgeSourceOutputsV2({ root = '.' } = {}) {
  const projectRoot = resolve(root);
  const { manifestBytes, manifest, corpusFiles } = await loadCorpus(projectRoot);
  const graphSnapshotBytes = await readFile(join(projectRoot, SOURCE_ROOT, 'imports/graph/graph.json'));
  const ragSnapshotBytes = await readFile(join(projectRoot, SOURCE_ROOT, 'imports/rag/index.json'));
  const graph = addStructuralDocumentNodes(JSON.parse(graphSnapshotBytes.toString('utf8')), manifest, corpusFiles);
  const ragSnapshot = JSON.parse(ragSnapshotBytes.toString('utf8'));
  const semanticFiles = new Set((ragSnapshot.chunks ?? []).map((chunk) => basename(String(chunk.file ?? ''))));
  const lexicalOnlyFiles = Object.fromEntries(Object.entries(corpusFiles).filter(([file]) => !semanticFiles.has(file)));
  const lexicalChunks = buildCorpusChunks(lexicalOnlyFiles).map(({ embedding, ...chunk }) => chunk);
  const coverage = manifest.documents.map((record) => ({
    document_id: record.document_id,
    file_name: record.file_name,
    lexical_indexed: true,
    semantic_indexed: semanticFiles.has(record.file_name),
    semantic_reason: semanticFiles.has(record.file_name) ? 'approved_embedding_snapshot' : 'approved_embedding_absent'
  }));
  const corpusHash = computeCorpusHashFromFiles(corpusFiles);
  const graphText = stableJson(graph);
  const semanticIndexText = stableJson(ragSnapshot);
  const lexicalIndexText = stableJson({
    schema_version: 'rus.lexical_index.v1',
    corpus_hash: corpusHash,
    chunk_count: lexicalChunks.length,
    chunks: lexicalChunks
  });
  const graphManifest = {
    schema_version: 'rus.knowledge_graph_manifest.v1',
    generator: 'tools/docs-tools/src/knowledge-materializer-v2.js',
    generation_mode: 'approved_semantic_snapshot_plus_structural_document_nodes',
    corpus_root: `${SOURCE_ROOT}/corpus/DOCUMENTS`,
    corpus_manifest_sha256: sha256(manifestBytes),
    source_snapshot: `${SOURCE_ROOT}/imports/graph/graph.json`,
    source_snapshot_sha256: sha256(graphSnapshotBytes),
    source_document_count: manifest.documents.length,
    semantic_document_count: new Set(referencedGraphFiles(graphSnapshotBytes)).size,
    structural_only_document_count: manifest.documents.length - new Set(referencedGraphFiles(graphSnapshotBytes)).size,
    node_count: Array.isArray(graph.nodes) ? graph.nodes.length : 0,
    link_count: Array.isArray(graph.links) ? graph.links.length : 0,
    hyperedge_count: Array.isArray(graph.hyperedges) ? graph.hyperedges.length : 0,
    graph_sha256: sha256(graphText)
  };
  const ragManifest = {
    schema_version: 'rus.knowledge_rag_manifest.v1',
    generator: 'tools/docs-tools/src/knowledge-materializer-v2.js',
    generation_mode: 'approved_semantic_snapshot_plus_deterministic_lexical_coverage',
    corpus_root: `${SOURCE_ROOT}/corpus/DOCUMENTS`,
    corpus_manifest_sha256: sha256(manifestBytes),
    corpus_hash: corpusHash,
    source_snapshot: `${SOURCE_ROOT}/imports/rag/index.json`,
    source_snapshot_sha256: sha256(ragSnapshotBytes),
    semantic_index: `${GENERATED_ROOT}/rag/index.json`,
    semantic_index_sha256: sha256(semanticIndexText),
    lexical_index: `${GENERATED_ROOT}/rag/lexical-index.json`,
    lexical_index_sha256: sha256(lexicalIndexText),
    source_document_count: manifest.documents.length,
    semantic_document_count: coverage.filter((item) => item.semantic_indexed).length,
    lexical_only_document_count: coverage.filter((item) => !item.semantic_indexed).length,
    semantic_chunk_count: Array.isArray(ragSnapshot.chunks) ? ragSnapshot.chunks.length : 0,
    lexical_chunk_count: lexicalChunks.length,
    model: String(ragSnapshot.model ?? ''),
    dimensions: Number(ragSnapshot.dimensions ?? 0),
    coverage
  };
  const inventory = await readKnowledgeSourceInventory({ root: projectRoot });
  const outputs = new Map([
    [`${GENERATED_ROOT}/graph/graph.json`, graphText],
    [`${GENERATED_ROOT}/graph/manifest.json`, stableJson(graphManifest)],
    [`${GENERATED_ROOT}/graph/GRAPH_REPORT.md`, renderGraphReport(graphManifest)],
    [`${GENERATED_ROOT}/graph/graph.html`, renderGraphHtml(graphManifest)],
    [`${GENERATED_ROOT}/rag/index.json`, semanticIndexText],
    [`${GENERATED_ROOT}/rag/lexical-index.json`, lexicalIndexText],
    [`${GENERATED_ROOT}/rag/manifest.json`, stableJson(ragManifest)],
    [`${GENERATED_ROOT}/manifests/inventory.json`, stableJson(inventory)]
  ]);
  const generatedManifest = {
    schema_version: 'rus.knowledge_generated_manifest.v1',
    release: JSON.parse(await readFile(join(projectRoot, 'package.json'), 'utf8')).version,
    generator: 'npm run knowledge:generate',
    files: [...outputs.entries()].map(([path, content]) => ({ path, sha256: sha256(content), bytes: Buffer.byteLength(content) })).sort((a, b) => a.path.localeCompare(b.path))
  };
  outputs.set(`${GENERATED_ROOT}/manifests/knowledge-source-generated-manifest.json`, stableJson(generatedManifest));
  return outputs;
}

export async function writeKnowledgeSourceOutputsV2({ root = '.' } = {}) {
  const projectRoot = resolve(root);
  const outputs = await buildKnowledgeSourceOutputsV2({ root: projectRoot });
  for (const [rel, content] of outputs) {
    const target = join(projectRoot, rel);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content, 'utf8');
  }
  return Object.freeze({ files: Object.freeze([...outputs.keys()].sort()) });
}

async function loadCorpus(projectRoot) {
  const sourceRoot = join(projectRoot, SOURCE_ROOT);
  const manifestBytes = await readFile(join(sourceRoot, 'corpus-manifest.json'));
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  const corpusFiles = {};
  for (const record of manifest.documents ?? []) {
    const bytes = await readFile(join(sourceRoot, record.canonical_path));
    if (sha256(bytes) !== record.sha256 || bytes.length !== record.bytes) throw new Error(`${record.document_id}: corpus manifest hash mismatch`);
    corpusFiles[record.file_name] = bytes.toString('utf8');
  }
  return { manifestBytes, manifest, corpusFiles };
}

function addStructuralDocumentNodes(snapshot, manifest, corpusFiles) {
  const graph = structuredClone(snapshot);
  graph.nodes = Array.isArray(graph.nodes) ? graph.nodes : [];
  const referenced = new Set(referencedGraphFiles(Buffer.from(JSON.stringify(snapshot))));
  for (const record of manifest.documents ?? []) {
    if (referenced.has(record.file_name)) continue;
    const lineEnd = String(corpusFiles[record.file_name] ?? '').split(/\r?\n/u).length;
    graph.nodes.push({
      id: `canonical-document:${record.document_id}`,
      type: 'canonical_document',
      label: record.file_name,
      structural_only: true,
      source_location: { file: record.file_name, line_start: 1, line_end: lineEnd }
    });
  }
  graph.nodes.sort((a, b) => String(a.id ?? '').localeCompare(String(b.id ?? '')));
  return graph;
}

function referencedGraphFiles(snapshotBytes) {
  const graph = JSON.parse(snapshotBytes.toString('utf8'));
  return (graph.nodes ?? []).map((node) => basename(String(node?.source_location?.file ?? node?.sourceLocation?.file ?? node?.source_file ?? ''))).filter(Boolean);
}

function renderGraphReport(manifest) {
  return `# Knowledge graph materialization report\n\n- Mode: \`${manifest.generation_mode}\`\n- Corpus documents: ${manifest.source_document_count}\n- Semantic documents: ${manifest.semantic_document_count}\n- Structural-only documents: ${manifest.structural_only_document_count}\n- Nodes: ${manifest.node_count}\n- Links: ${manifest.link_count}\n- Hyperedges: ${manifest.hyperedge_count}\n- Graph SHA-256: \`${manifest.graph_sha256}\`\n\nApproved semantic nodes and links are preserved unchanged. New canonical documents receive structural document nodes only; the generator does not invent semantic relations.\n`;
}

function renderGraphHtml(manifest) {
  return `<!doctype html><meta charset="utf-8"><title>RUS knowledge graph</title><h1>RUS knowledge graph</h1><p>Documents: ${manifest.source_document_count}; semantic: ${manifest.semantic_document_count}; structural only: ${manifest.structural_only_document_count}; nodes: ${manifest.node_count}.</p><p>Machine-readable graph: <a href="graph.json">graph.json</a>.</p>`;
}

function stableJson(value) { return `${JSON.stringify(value, null, 2)}\n`; }
function sha256(value) { return createHash('sha256').update(value).digest('hex'); }
