import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { buildCorpusChunks, computeCorpusHashFromFiles } from './knowledge-chunks.js';
import { readKnowledgeSourceInventory } from './knowledge-source.js';

const SOURCE_ROOT = 'data/knowledge-source';
const GENERATED_ROOT = 'generated/knowledge-source';

export async function buildKnowledgeSourceOutputsV2({ root = '.' } = {}) {
  const projectRoot = resolve(root);
  const { manifestBytes, manifest, registeredDocuments, activeDocuments, registeredCorpusFiles, activeCorpusFiles } = await loadCorpus(projectRoot);
  const lexicalChunks = buildCorpusChunks(registeredCorpusFiles).map(({ embedding, ...chunk }) => chunk);
  const coverage = registeredDocuments.map((record) => ({
    document_id: record.document_id,
    file_name: record.file_name,
    lexical_indexed: true
  }));
  const corpusHash = computeCorpusHashFromFiles(registeredCorpusFiles);
  const graph = buildStructuralGraph(activeDocuments, activeCorpusFiles);
  const graphText = stableJson(graph);
  const lexicalIndexText = stableJson({
    schema_version: 'rus.lexical_index.v1',
    corpus_hash: corpusHash,
    chunk_count: lexicalChunks.length,
    chunks: lexicalChunks
  });
  const graphManifest = {
    schema_version: 'rus.knowledge_graph_manifest.v1',
    generator: 'tools/docs-tools/src/knowledge-materializer-v2.js',
    generation_mode: 'structural_document_nodes_only',
    corpus_root: `${SOURCE_ROOT}/corpus/DOCUMENTS`,
    corpus_manifest_sha256: sha256(manifestBytes),
    registered_document_count: manifest.documents.length,
    source_document_count: activeDocuments.length,
    structural_only_document_count: activeDocuments.length,
    node_count: Array.isArray(graph.nodes) ? graph.nodes.length : 0,
    link_count: 0,
    hyperedge_count: 0,
    graph_sha256: sha256(graphText)
  };
  const ragManifest = {
    schema_version: 'rus.knowledge_rag_manifest.v1',
    generator: 'tools/docs-tools/src/knowledge-materializer-v2.js',
    generation_mode: 'deterministic_lexical_coverage',
    corpus_root: `${SOURCE_ROOT}/corpus/DOCUMENTS`,
    corpus_manifest_sha256: sha256(manifestBytes),
    corpus_hash: corpusHash,
    lexical_index: `${GENERATED_ROOT}/rag/lexical-index.json`,
    lexical_index_sha256: sha256(lexicalIndexText),
    registered_document_count: manifest.documents.length,
    source_document_count: registeredDocuments.length,
    active_document_count: activeDocuments.length,
    lexical_document_count: coverage.length,
    lexical_chunk_count: lexicalChunks.length,
    coverage
  };
  const inventory = await readKnowledgeSourceInventory({ root: projectRoot });
  const outputs = new Map([
    [`${GENERATED_ROOT}/graph/graph.json`, graphText],
    [`${GENERATED_ROOT}/graph/manifest.json`, stableJson(graphManifest)],
    [`${GENERATED_ROOT}/graph/GRAPH_REPORT.md`, renderGraphReport(graphManifest)],
    [`${GENERATED_ROOT}/graph/graph.html`, renderGraphHtml(graphManifest)],
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
    await writeFileWithRetry(target, content);
  }
  return Object.freeze({ files: Object.freeze([...outputs.keys()].sort()) });
}

async function writeFileWithRetry(target, content) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await writeFile(target, content, 'utf8');
      return;
    } catch (error) {
      if (!['UNKNOWN', 'EBUSY', 'EPERM'].includes(error?.code) || attempt === 4) throw error;
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 10 * (attempt + 1)));
    }
  }
}

async function loadCorpus(projectRoot) {
  const sourceRoot = join(projectRoot, SOURCE_ROOT);
  const manifestBytes = await readFile(join(sourceRoot, 'corpus-manifest.json'));
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  const registeredCorpusFiles = {};
  for (const record of manifest.documents ?? []) {
    const bytes = await readFile(join(sourceRoot, record.canonical_path));
    if (sha256(bytes) !== record.sha256 || bytes.length !== record.bytes) throw new Error(`${record.document_id}: corpus manifest hash mismatch`);
    registeredCorpusFiles[record.file_name] = bytes.toString('utf8');
  }
  const registeredDocuments = [...(manifest.documents ?? [])];
  const activeDocuments = (manifest.documents ?? []).filter((record) => record.status === 'active');
  const activeCorpusFiles = Object.fromEntries(activeDocuments.map((record) => [record.file_name, registeredCorpusFiles[record.file_name]]));
  return { manifestBytes, manifest, registeredDocuments, activeDocuments, registeredCorpusFiles, activeCorpusFiles };
}

function buildStructuralGraph(activeDocuments, corpusFiles) {
  const nodes = activeDocuments.map((record) => {
    const lineEnd = logicalLineCount(corpusFiles[record.file_name]);
    return {
      id: `canonical-document:${record.document_id}`,
      type: 'canonical_document',
      label: record.file_name,
      structural_only: true,
      source_file: `DOCUMENTS/${record.file_name}`,
      source_location: { file: record.file_name, line_start: 1, line_end: lineEnd }
    };
  });
  nodes.sort((a, b) => String(a.id ?? '').localeCompare(String(b.id ?? '')));
  return {
    schema_version: 'rus.knowledge_graph.v1',
    nodes,
    links: [],
    hyperedges: []
  };
}

function logicalLineCount(value) {
  const content = String(value ?? '');
  if (!content) return 0;
  return content.split(/\r?\n/u).length - (content.endsWith('\n') ? 1 : 0);
}

function renderGraphReport(manifest) {
  return `# Knowledge graph materialization report\n\n- Mode: \`${manifest.generation_mode}\`\n- Corpus documents: ${manifest.source_document_count}\n- Structural-only documents: ${manifest.structural_only_document_count}\n- Nodes: ${manifest.node_count}\n- Links: ${manifest.link_count}\n- Hyperedges: ${manifest.hyperedge_count}\n- Graph SHA-256: \`${manifest.graph_sha256}\`\n\nGraph is structural document nodes only. The generator does not invent semantic relations or embeddings.\n`;
}

function renderGraphHtml(manifest) {
  return `<!doctype html><meta charset="utf-8"><title>RUS knowledge graph</title><h1>RUS knowledge graph</h1><p>Documents: ${manifest.source_document_count}; structural only: ${manifest.structural_only_document_count}; nodes: ${manifest.node_count}.</p><p>Machine-readable graph: <a href="graph.json">graph.json</a>.</p>`;
}

function stableJson(value) { return `${JSON.stringify(value, null, 2)}\n`; }
function sha256(value) { return createHash('sha256').update(value).digest('hex'); }
