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
  const graphSnapshot = JSON.parse(graphSnapshotBytes.toString('utf8'));
  const graphErrors = validateGraphSnapshotSources(graphSnapshot, corpusFiles);
  if (graphErrors.length) throw new Error(`Knowledge graph snapshot is incompatible with corpus:\n${graphErrors.join('\n')}`);
  const graph = addStructuralDocumentNodes(graphSnapshot, manifest, corpusFiles);
  const approvedSemantic = validateApprovedSemanticSnapshot(JSON.parse(ragSnapshotBytes.toString('utf8')), corpusFiles);
  const semanticIndex = approvedSemantic.index;
  const semanticFiles = approvedSemantic.files;
  const lexicalOnlyFiles = Object.fromEntries(Object.entries(corpusFiles).filter(([file]) => !semanticFiles.has(file)));
  const lexicalChunks = buildCorpusChunks(lexicalOnlyFiles).map(({ embedding, ...chunk }) => chunk);
  const coverage = manifest.documents.map((record) => {
    const semanticIndexed = semanticFiles.has(record.file_name);
    return {
      document_id: record.document_id,
      file_name: record.file_name,
      lexical_indexed: !semanticIndexed,
      semantic_indexed: semanticIndexed,
      semantic_reason: semanticIndexed ? 'approved_embedding_snapshot' : 'approved_embedding_absent'
    };
  });
  const corpusHash = computeCorpusHashFromFiles(corpusFiles);
  const graphText = stableJson(graph);
  const semanticIndexText = stableJson(semanticIndex);
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
    lexical_only_document_count: coverage.filter((item) => item.lexical_indexed).length,
    semantic_chunk_count: semanticIndex.chunks.length,
    lexical_chunk_count: lexicalChunks.length,
    model: String(semanticIndex.model ?? ''),
    dimensions: Number(semanticIndex.dimensions ?? 0),
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

export function validateApprovedSemanticSnapshot(snapshot, corpusFiles) {
  const errors = [];
  const importedChunks = Array.isArray(snapshot?.chunks) ? snapshot.chunks : [];
  const dimensions = Number(snapshot?.dimensions);
  if (!Number.isInteger(dimensions) || dimensions < 1) errors.push('approved embedding dimensions are invalid');
  if (Number(snapshot?.chunk_count) !== importedChunks.length) errors.push('approved embedding chunk_count differs from chunks');

  const files = new Set();
  for (const chunk of importedChunks) {
    const rawFile = String(chunk?.file ?? '');
    const file = basename(rawFile);
    if (!file || rawFile !== file) errors.push(`approved embedding chunk has invalid source path ${rawFile || '?'}`);
    else files.add(file);
  }
  const semanticCorpusFiles = {};
  for (const file of [...files].sort((left, right) => left.localeCompare(right))) {
    if (!Object.hasOwn(corpusFiles, file)) {
      errors.push(`approved embedding chunk references missing file ${file}`);
      continue;
    }
    semanticCorpusFiles[file] = corpusFiles[file];
  }

  const corpusHash = computeCorpusHashFromFiles(semanticCorpusFiles);
  if (String(snapshot?.corpus_hash ?? '') !== corpusHash) {
    errors.push('semantic corpus hash differs from approved embedding snapshot');
  }
  const expectedChunks = buildCorpusChunks(semanticCorpusFiles);
  if (expectedChunks.length !== importedChunks.length) {
    errors.push(`semantic chunk count differs: approved=${importedChunks.length}, current=${expectedChunks.length}`);
  }
  const chunks = expectedChunks.map((chunk, index) => {
    const imported = importedChunks[index];
    if (!imported) {
      errors.push(`missing approved embedding at semantic chunk index ${index} (${chunk.id})`);
      return null;
    }
    for (const field of ['id', 'file', 'section', 'line_start', 'line_end', 'text', 'char_count']) {
      if (imported[field] !== chunk[field]) errors.push(`semantic chunk[${index}] ${chunk.id}: approved ${field} differs from current corpus`);
    }
    if (!Array.isArray(imported.embedding) || imported.embedding.length !== dimensions
      || imported.embedding.some((value) => !Number.isFinite(Number(value)))) {
      errors.push(`semantic chunk[${index}] ${chunk.id}: approved embedding is invalid`);
    }
    return { ...chunk, embedding: imported.embedding };
  }).filter(Boolean);
  if (errors.length) throw new Error(`RAG snapshot is incompatible with corpus:\n${errors.slice(0, 50).join('\n')}`);

  return Object.freeze({
    files: Object.freeze(files),
    index: Object.freeze({ ...snapshot, corpus_hash: corpusHash, chunk_count: chunks.length, chunks })
  });
}

export function validateGraphSnapshotSources(graph, corpusFiles) {
  const errors = [];
  for (const node of graph?.nodes ?? []) {
    const location = node?.source_location ?? node?.sourceLocation;
    if (!location) continue;
    const rawFile = String(location.file ?? node.source_file ?? '');
    if (!/^(?:DOCUMENTS\/)?[^/\\]+$/u.test(rawFile)) {
      errors.push(`node ${node.id ?? '?'} has invalid source path ${rawFile || '?'}`);
      continue;
    }
    const file = basename(rawFile);
    if (!file || !Object.hasOwn(corpusFiles, file)) {
      errors.push(`node ${node.id ?? '?'} references missing file ${file || '?'}`);
      continue;
    }
    const lineCount = String(corpusFiles[file]).split(/\r?\n/u).length;
    const start = Number(location.line_start ?? location.lineStart);
    const end = Number(location.line_end ?? location.lineEnd);
    if (!Number.isInteger(start) || start < 1) errors.push(`${node.id ?? '?'}: invalid line_start`);
    if (!Number.isInteger(end) || end < 1) errors.push(`${node.id ?? '?'}: invalid line_end`);
    if (Number.isInteger(end) && end > lineCount) errors.push(`${node.id ?? '?'}: line_end exceeds ${file}`);
    if (Number.isInteger(start) && Number.isInteger(end) && end < start) errors.push(`${node.id ?? '?'}: inverted line range`);
  }
  return Object.freeze(errors);
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
