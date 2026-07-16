import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { buildCorpusChunks, computeCorpusHashFromFiles } from './knowledge-chunks.js';
import { readKnowledgeSourceInventory } from './knowledge-source.js';

const SOURCE_ROOT = 'data/knowledge-source';
const GENERATED_ROOT = 'generated/knowledge-source';

export async function buildKnowledgeSourceOutputsV2({ root = '.' } = {}) {
  const projectRoot = resolve(root);
  const { manifestBytes, manifest, registeredDocuments, activeDocuments, registeredCorpusFiles, activeCorpusFiles } = await loadCorpus(projectRoot);
  const graphSnapshotBytes = await readFile(join(projectRoot, SOURCE_ROOT, 'imports/graph/graph.json'));
  const ragSnapshotBytes = await readFile(join(projectRoot, SOURCE_ROOT, 'imports/rag/index.json'));
  const graphSnapshot = JSON.parse(graphSnapshotBytes.toString('utf8'));
  const approvedSemantic = validateApprovedSemanticSnapshot(JSON.parse(ragSnapshotBytes.toString('utf8')), activeCorpusFiles);
  const semanticIndex = approvedSemantic.index;
  const semanticFiles = approvedSemantic.files;
  const snapshotSemanticFiles = approvedSemantic.snapshotFiles;
  const compatibleGraphSnapshot = filterGraphSnapshotBySemanticFiles(graphSnapshot, semanticFiles);
  const activeManifest = { ...manifest, documents: activeDocuments };
  const graphErrors = [
    ...validateGraphSnapshotSources(graphSnapshot, activeCorpusFiles, snapshotSemanticFiles),
    ...validateStructuralGraphBoundary(graphSnapshot, activeManifest, snapshotSemanticFiles)
  ];
  if (graphErrors.length) throw new Error(`Knowledge graph snapshot is incompatible with corpus:\n${graphErrors.join('\n')}`);
  const graph = addStructuralDocumentNodes(compatibleGraphSnapshot, activeManifest, activeCorpusFiles, semanticFiles);
  const lexicalOnlyFiles = Object.fromEntries(Object.entries(registeredCorpusFiles).filter(([file]) => !semanticFiles.has(file)));
  const lexicalChunks = buildCorpusChunks(lexicalOnlyFiles).map(({ embedding, ...chunk }) => chunk);
  const coverage = registeredDocuments.map((record) => {
    const semanticIndexed = semanticFiles.has(record.file_name);
    return {
      document_id: record.document_id,
      file_name: record.file_name,
      lexical_indexed: !semanticIndexed,
      semantic_indexed: semanticIndexed,
      semantic_reason: semanticIndexed ? 'approved_embedding_snapshot' : 'approved_embedding_absent'
    };
  });
  const corpusHash = computeCorpusHashFromFiles(registeredCorpusFiles);
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
    registered_document_count: manifest.documents.length,
    source_document_count: activeDocuments.length,
    semantic_document_count: semanticFiles.size,
    structural_only_document_count: activeDocuments.length - semanticFiles.size,
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
    registered_document_count: manifest.documents.length,
    source_document_count: registeredDocuments.length,
    active_document_count: activeDocuments.length,
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

  const importedByFile = new Map();
  for (const chunk of importedChunks) {
    const rawFile = String(chunk?.file ?? '');
    const file = basename(rawFile);
    if (!file || rawFile !== file) {
      errors.push(`approved embedding chunk has invalid source path ${rawFile || '?'}`);
      continue;
    }
    if (!Array.isArray(chunk.embedding) || chunk.embedding.length !== dimensions || chunk.embedding.some((value) => !Number.isFinite(Number(value)))) {
      errors.push(`approved embedding is invalid for ${chunk.id ?? file}`);
      continue;
    }
    if (!importedByFile.has(file)) importedByFile.set(file, []);
    importedByFile.get(file).push(chunk);
  }

  const files = new Set();
  const snapshotFiles = new Set(importedByFile.keys());
  const chunks = [];
  const semanticCorpusFiles = {};
  for (const [file, importedFileChunks] of [...importedByFile].sort(([left], [right]) => left.localeCompare(right))) {
    if (!Object.hasOwn(corpusFiles, file)) continue;
    const expected = buildCorpusChunks({ [file]: corpusFiles[file] });
    if (!chunksMatchApprovedSnapshot(expected, importedFileChunks)) continue;
    files.add(file);
    semanticCorpusFiles[file] = corpusFiles[file];
    chunks.push(...expected.map((chunk, index) => ({ ...chunk, embedding: importedFileChunks[index].embedding })));
  }
  const corpusHash = computeCorpusHashFromFiles(semanticCorpusFiles);
  if (errors.length) throw new Error(`RAG snapshot is incompatible with corpus:\n${errors.slice(0, 50).join('\n')}`);

  return Object.freeze({
    files: Object.freeze(files),
    snapshotFiles: Object.freeze(snapshotFiles),
    index: Object.freeze({ ...snapshot, corpus_hash: corpusHash, chunk_count: chunks.length, chunks })
  });
}

function chunksMatchApprovedSnapshot(expected, imported) {
  if (expected.length !== imported.length) return false;
  return expected.every((chunk, index) => ['id', 'file', 'section', 'line_start', 'line_end', 'text', 'char_count'].every((field) => imported[index]?.[field] === chunk[field]));
}

export function filterGraphSnapshotBySemanticFiles(graph, semanticFiles) {
  const sourceFile = (entity) => basename(String(entity?.source_location?.file ?? entity?.source_file ?? ''));
  const nodes = (graph?.nodes ?? []).filter((node) => semanticFiles.has(sourceFile(node)));
  const nodeIds = new Set(nodes.map((node) => node.id));
  const links = (graph?.links ?? []).filter((link) => semanticFiles.has(sourceFile(link)) && nodeIds.has(link.source) && nodeIds.has(link.target));
  const hyperedges = (graph?.hyperedges ?? []).filter((edge) => semanticFiles.has(sourceFile(edge)) && (edge.nodes ?? []).every((id) => nodeIds.has(id)));
  return { ...graph, nodes, links, hyperedges };
}

export function validateGraphSnapshotSources(graph, corpusFiles, approvedSemanticFiles = null) {
  const errors = [];
  const referencedFiles = new Set();
  const collections = [
    ['node', graph?.nodes ?? []],
    ['link', graph?.links ?? []],
    ['hyperedge', graph?.hyperedges ?? []]
  ];
  for (const [kind, entities] of collections) {
    for (const entity of entities) {
      const file = validateGraphEntitySource(entity, kind, corpusFiles, approvedSemanticFiles, errors);
      if (file) referencedFiles.add(file);
      if (kind === 'hyperedge') {
        for (const memberFile of validateHyperedgeMemberSources(entity, corpusFiles, approvedSemanticFiles, errors)) referencedFiles.add(memberFile);
      }
    }
  }
  if (approvedSemanticFiles) {
    for (const file of approvedSemanticFiles) {
      if (!referencedFiles.has(file)) errors.push(`approved semantic file is missing from graph provenance: ${file}`);
    }
  }
  return Object.freeze(errors);
}

function validateGraphEntitySource(entity, kind, corpusFiles, approvedSemanticFiles, errors) {
  const label = graphEntityLabel(entity, kind);
  const location = entity?.source_location ?? entity?.sourceLocation;
  if (!location) {
    errors.push(`${label}: source_location is missing`);
    return null;
  }
  const rawFile = String(location.file ?? '');
  if (!rawFile) {
    errors.push(`${label}: source_location.file is missing`);
    return null;
  }
  if (!/^(?:DOCUMENTS\/)?[^/\\]+$/u.test(rawFile)) {
    errors.push(`${label} has invalid source path ${rawFile}`);
    return null;
  }
  const rawSourceFile = String(entity.source_file ?? '');
  if (!rawSourceFile) {
    errors.push(`${label}: source_file is missing`);
    return null;
  }
  if (!/^(?:DOCUMENTS\/)?[^/\\]+$/u.test(rawSourceFile)) {
    errors.push(`${label} has invalid source_file ${rawSourceFile}`);
    return null;
  }
  const file = basename(rawFile);
  if (basename(rawSourceFile) !== file) {
    errors.push(`${label}: source_file differs from source_location.file`);
    return null;
  }
  if (!file || !Object.hasOwn(corpusFiles, file)) {
    errors.push(`${label} references missing file ${file || '?'}`);
    return null;
  }
  if (approvedSemanticFiles && !approvedSemanticFiles.has(file)) {
    errors.push(`${label} references ${file}, which is not approved for semantic graph coverage`);
    return file;
  }
  const lineCount = logicalLineCount(corpusFiles[file]);
  const start = Number(location.line_start ?? location.lineStart);
  const end = Number(location.line_end ?? location.lineEnd);
  if (!Number.isInteger(start) || start < 1) errors.push(`${label}: invalid line_start`);
  if (!Number.isInteger(end) || end < 1) errors.push(`${label}: invalid line_end`);
  if (Number.isInteger(end) && end > lineCount) errors.push(`${label}: line_end exceeds ${file}`);
  if (Number.isInteger(start) && Number.isInteger(end) && end < start) errors.push(`${label}: inverted line range`);
  return file;
}

function validateHyperedgeMemberSources(hyperedge, corpusFiles, approvedSemanticFiles, errors) {
  const files = [];
  const members = hyperedge?.member_source_files;
  if (members === undefined) return files;
  if (!members || typeof members !== 'object' || Array.isArray(members)) {
    errors.push(`${graphEntityLabel(hyperedge, 'hyperedge')}: member_source_files is invalid`);
    return files;
  }
  for (const rawFile of Object.keys(members)) {
    if (!/^(?:DOCUMENTS\/)?[^/\\]+$/u.test(rawFile)) {
      errors.push(`${graphEntityLabel(hyperedge, 'hyperedge')} has invalid member source path ${rawFile}`);
      continue;
    }
    const file = basename(rawFile);
    if (!Object.hasOwn(corpusFiles, file)) {
      errors.push(`${graphEntityLabel(hyperedge, 'hyperedge')} references missing member source ${file}`);
      continue;
    }
    if (approvedSemanticFiles && !approvedSemanticFiles.has(file)) {
      errors.push(`${graphEntityLabel(hyperedge, 'hyperedge')} member source ${file} is not approved for semantic graph coverage`);
      continue;
    }
    files.push(file);
  }
  return files;
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

function addStructuralDocumentNodes(snapshot, manifest, corpusFiles, semanticFiles) {
  const graph = structuredClone(snapshot);
  graph.nodes = Array.isArray(graph.nodes) ? graph.nodes : [];
  for (const record of manifest.documents ?? []) {
    if (semanticFiles.has(record.file_name)) continue;
    const lineEnd = logicalLineCount(corpusFiles[record.file_name]);
    graph.nodes.push({
      id: `canonical-document:${record.document_id}`,
      type: 'canonical_document',
      label: record.file_name,
      structural_only: true,
      source_file: `DOCUMENTS/${record.file_name}`,
      source_location: { file: record.file_name, line_start: 1, line_end: lineEnd }
    });
  }
  graph.nodes.sort((a, b) => String(a.id ?? '').localeCompare(String(b.id ?? '')));
  return graph;
}

function validateStructuralGraphBoundary(graph, manifest, semanticFiles) {
  const errors = [];
  const structuralIds = new Set((manifest.documents ?? [])
    .filter((record) => !semanticFiles.has(record.file_name))
    .map((record) => `canonical-document:${record.document_id}`));
  for (const node of graph?.nodes ?? []) {
    if (structuralIds.has(String(node?.id ?? ''))) errors.push(`semantic graph uses reserved structural-only node id ${node.id}`);
  }
  for (const link of graph?.links ?? []) {
    const endpoints = [link?.source, link?.target, link?.from, link?.to].filter((value) => typeof value === 'string');
    if (endpoints.some((id) => structuralIds.has(id))) errors.push(`semantic relation touches structural-only node: ${graphEntityLabel(link, 'link')}`);
  }
  for (const hyperedge of graph?.hyperedges ?? []) {
    const endpoints = Array.isArray(hyperedge?.nodes) ? hyperedge.nodes : [];
    if (endpoints.some((id) => structuralIds.has(String(id)))) errors.push(`semantic relation touches structural-only node: ${graphEntityLabel(hyperedge, 'hyperedge')}`);
  }
  return Object.freeze(errors);
}

function graphEntityLabel(entity, kind) {
  if (kind === 'link') return `link ${entity?.id ?? `${entity?.source ?? '?'}->${entity?.target ?? '?'}`}`;
  return `${kind} ${entity?.id ?? '?'}`;
}

function logicalLineCount(value) {
  const content = String(value ?? '');
  if (!content) return 0;
  return content.split(/\r?\n/u).length - (content.endsWith('\n') ? 1 : 0);
}

function renderGraphReport(manifest) {
  return `# Knowledge graph materialization report\n\n- Mode: \`${manifest.generation_mode}\`\n- Corpus documents: ${manifest.source_document_count}\n- Semantic documents: ${manifest.semantic_document_count}\n- Structural-only documents: ${manifest.structural_only_document_count}\n- Nodes: ${manifest.node_count}\n- Links: ${manifest.link_count}\n- Hyperedges: ${manifest.hyperedge_count}\n- Graph SHA-256: \`${manifest.graph_sha256}\`\n\nApproved semantic nodes and links are preserved unchanged. New canonical documents receive structural document nodes only; the generator does not invent semantic relations.\n`;
}

function renderGraphHtml(manifest) {
  return `<!doctype html><meta charset="utf-8"><title>RUS knowledge graph</title><h1>RUS knowledge graph</h1><p>Documents: ${manifest.source_document_count}; semantic: ${manifest.semantic_document_count}; structural only: ${manifest.structural_only_document_count}; nodes: ${manifest.node_count}.</p><p>Machine-readable graph: <a href="graph.json">graph.json</a>.</p>`;
}

function stableJson(value) { return `${JSON.stringify(value, null, 2)}\n`; }
function sha256(value) { return createHash('sha256').update(value).digest('hex'); }
