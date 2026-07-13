import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { buildCorpusChunks, computeCorpusHashFromFiles } from './knowledge-chunks.js';

const LEGACY_ROOT = 'legacy/DOCUMENTS/documents-kg';
const SOURCE_ROOT = 'data/knowledge-source';
const GENERATED_ROOT = 'generated/knowledge-source';
const INVENTORY_PATH = `${SOURCE_ROOT}/imports/legacy-inventory.json`;

export async function inventoryLegacyKnowledgeSource({ root = '.' } = {}) {
  const projectRoot = resolve(root);
  const base = join(projectRoot, LEGACY_ROOT);
  const files = [];
  for (const path of await walk(base)) {
    const rel = relative(base, path).replaceAll('\\', '/');
    const bytes = await readFile(path);
    files.push({
      legacy_path: `${LEGACY_ROOT}/${rel}`,
      relative_path: rel,
      bytes: bytes.length,
      sha256: sha256(bytes),
      classification: classify(rel)
    });
  }
  files.sort((left, right) => left.relative_path.localeCompare(right.relative_path));
  return freezeInventory({
    schema_version: 'rus.knowledge_source_inventory.v1',
    source_root: LEGACY_ROOT,
    files
  });
}

export async function readKnowledgeSourceInventory({ root = '.' } = {}) {
  const inventory = await readJson(join(resolve(root), INVENTORY_PATH));
  if (inventory?.schema_version !== 'rus.knowledge_source_inventory.v1' || !Array.isArray(inventory.files)) {
    throw new Error('Invalid stored knowledge-source inventory.');
  }
  return freezeInventory(inventory);
}

export async function buildKnowledgeGraphFromSnapshot({ root = '.' } = {}) {
  const projectRoot = resolve(root);
  const { manifestBytes, manifest, corpusFiles } = await loadCorpus(projectRoot);
  const snapshotPath = join(projectRoot, SOURCE_ROOT, 'imports/graph/graph.json');
  const snapshotBytes = await readFile(snapshotPath);
  const graph = JSON.parse(snapshotBytes.toString('utf8'));
  const errors = verifyGraphSources(graph, corpusFiles);
  if (errors.length) throw new Error(`Knowledge graph snapshot is incompatible with corpus:\n${errors.join('\n')}`);
  const graphText = stableJson(graph);
  const resultManifest = {
    schema_version: 'rus.knowledge_graph_manifest.v1',
    generator: 'tools/docs-tools/src/knowledge-source.js',
    generation_mode: 'approved_snapshot_materialization',
    corpus_root: `${SOURCE_ROOT}/corpus/DOCUMENTS`,
    corpus_manifest_sha256: sha256(manifestBytes),
    source_snapshot: `${SOURCE_ROOT}/imports/graph/graph.json`,
    source_snapshot_sha256: sha256(snapshotBytes),
    source_document_count: manifest.documents.length,
    node_count: Array.isArray(graph.nodes) ? graph.nodes.length : 0,
    link_count: Array.isArray(graph.links) ? graph.links.length : 0,
    hyperedge_count: Array.isArray(graph.hyperedges) ? graph.hyperedges.length : 0,
    graph_sha256: sha256(graphText)
  };
  return Object.freeze({ graph, graph_text: graphText, manifest: resultManifest });
}

export async function buildRagIndexFromSnapshot({ root = '.' } = {}) {
  const projectRoot = resolve(root);
  const { manifestBytes, manifest, corpusFiles } = await loadCorpus(projectRoot);
  const snapshotPath = join(projectRoot, SOURCE_ROOT, 'imports/rag/index.json');
  const snapshotBytes = await readFile(snapshotPath);
  const snapshot = JSON.parse(snapshotBytes.toString('utf8'));
  const expectedChunks = buildCorpusChunks(corpusFiles);
  const importedChunks = Array.isArray(snapshot.chunks) ? snapshot.chunks : [];
  const errors = [];
  if (importedChunks.length !== expectedChunks.length) errors.push(`chunk count differs: imported=${importedChunks.length}, current=${expectedChunks.length}`);
  const chunks = expectedChunks.map((chunk, index) => {
    const imported = importedChunks[index];
    if (!imported) {
      errors.push(`missing imported embedding at chunk index ${index} (${chunk.id})`);
      return null;
    }
    for (const field of ['id', 'file', 'section', 'line_start', 'line_end', 'text', 'char_count']) {
      if (imported[field] !== chunk[field]) errors.push(`chunk[${index}] ${chunk.id}: imported ${field} differs from current corpus chunk`);
    }
    if (!Array.isArray(imported.embedding) || imported.embedding.length !== Number(snapshot.dimensions)) {
      errors.push(`chunk[${index}] ${chunk.id}: invalid imported embedding dimensions`);
    }
    return { ...chunk, embedding: imported.embedding };
  }).filter(Boolean);
  if (errors.length) throw new Error(`RAG snapshot is incompatible with corpus:\n${errors.slice(0, 50).join('\n')}`);
  const corpusHash = computeCorpusHashFromFiles(corpusFiles);
  const index = {
    schema_version: 'rus.rag_index.v1',
    version: Number(snapshot.version ?? 1),
    model: String(snapshot.model ?? ''),
    dimensions: Number(snapshot.dimensions),
    built_at: String(snapshot.built_at ?? ''),
    corpus_hash: corpusHash,
    chunk_count: chunks.length,
    chunks
  };
  const indexText = stableJson(index);
  const resultManifest = {
    schema_version: 'rus.knowledge_rag_manifest.v1',
    generator: 'tools/docs-tools/src/knowledge-source.js',
    generation_mode: 'corpus_rechunk_with_approved_embedding_snapshot',
    corpus_root: `${SOURCE_ROOT}/corpus/DOCUMENTS`,
    corpus_manifest_sha256: sha256(manifestBytes),
    corpus_hash: corpusHash,
    source_snapshot: `${SOURCE_ROOT}/imports/rag/index.json`,
    source_snapshot_sha256: sha256(snapshotBytes),
    source_document_count: manifest.documents.length,
    chunk_count: chunks.length,
    model: index.model,
    dimensions: index.dimensions,
    index_sha256: sha256(indexText)
  };
  return Object.freeze({ index, index_text: indexText, manifest: resultManifest });
}

export async function writeKnowledgeSourceOutputs({ root = '.' } = {}) {
  const projectRoot = resolve(root);
  const outputs = await buildKnowledgeSourceOutputMap(projectRoot);
  for (const [rel, content] of outputs) {
    const target = join(projectRoot, rel);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content, 'utf8');
  }
  return Object.freeze({ files: [...outputs.keys()].sort() });
}

export async function verifyKnowledgeSourceMigration({ root = '.' } = {}) {
  const projectRoot = resolve(root);
  const errors = [];
  const inventory = await readKnowledgeSourceInventory({ root: projectRoot }).catch((error) => {
    errors.push(error.message);
    return freezeInventory({ schema_version: 'rus.knowledge_source_inventory.v1', source_root: LEGACY_ROOT, files: [] });
  });
  const unknown = inventory.files.filter((item) => item.classification === 'unknown');
  if (unknown.length) errors.push(`stored inventory contains unknown files: ${unknown.map((item) => item.relative_path).join(', ')}`);

  const loaded = await loadCorpus(projectRoot).catch((error) => {
    errors.push(error.message);
    return { manifestBytes: Buffer.alloc(0), manifest: { documents: [] }, corpusFiles: {} };
  });
  const { manifestBytes, manifest } = loaded;
  const inventoryByLegacyPath = new Map(inventory.files.map((item) => [item.legacy_path, item]));
  const expectedLegacyPaths = new Set((manifest.documents ?? []).filter((record) => record.source_legacy_path).map((record) => record.source_legacy_path));
  const actualLegacyPaths = new Set(inventory.files.filter((item) => item.classification === 'canonical_source').map((item) => item.legacy_path));
  for (const path of expectedLegacyPaths) if (!actualLegacyPaths.has(path)) errors.push(`stored inventory is missing manifest legacy source: ${path}`);
  for (const path of actualLegacyPaths) if (!expectedLegacyPaths.has(path)) errors.push(`stored inventory has unregistered canonical source: ${path}`);
  let hashParity = true;
  let legacyCompared = 0;
  let legacyDocumentCount = 0;
  let nativeDocumentCount = 0;
  for (const record of manifest.documents ?? []) {
    const current = await readFile(join(projectRoot, SOURCE_ROOT, record.canonical_path)).catch(() => null);
    if (!current || sha256(current) !== record.sha256 || current.length !== record.bytes) {
      hashParity = false;
      errors.push(`${record.document_id}: canonical corpus parity failed`);
      continue;
    }
    if (!record.source_legacy_path) {
      nativeDocumentCount += 1;
      continue;
    }
    legacyDocumentCount += 1;
    const inventoryRecord = inventoryByLegacyPath.get(record.source_legacy_path);
    if (!inventoryRecord || inventoryRecord.sha256 !== record.sha256 || inventoryRecord.bytes !== record.bytes) {
      hashParity = false;
      errors.push(`${record.document_id}: corpus/inventory parity failed`);
      continue;
    }
    const legacy = await readFile(join(projectRoot, record.source_legacy_path)).catch(() => null);
    if (legacy) {
      legacyCompared += 1;
      if (!current.equals(legacy)) {
        hashParity = false;
        errors.push(`${record.document_id}: available legacy source differs`);
      }
    }
  }

  let outputBuildFailed = false;
  const expectedOutputs = await buildKnowledgeSourceOutputMap(projectRoot).catch((error) => {
    errors.push(error.message);
    outputBuildFailed = true;
    return new Map();
  });
  const staleOutputs = [];
  for (const [rel, expected] of expectedOutputs) {
    if (!await committedMatches(projectRoot, rel, expected)) staleOutputs.push(rel);
  }
  if (staleOutputs.length) errors.push(`generated outputs are missing or stale: ${staleOutputs.join(', ')}`);
  const graphCurrent = !outputBuildFailed && !staleOutputs.some((path) => path.startsWith(`${GENERATED_ROOT}/graph/`));
  const ragCurrent = !outputBuildFailed && !staleOutputs.some((path) => path.startsWith(`${GENERATED_ROOT}/rag/`));

  return Object.freeze({
    ok: errors.length === 0,
    errors,
    inventory_count: inventory.files.length,
    unknown_count: unknown.length,
    document_count: manifest.documents?.length ?? 0,
    legacy_document_count: legacyDocumentCount,
    native_document_count: nativeDocumentCount,
    hash_parity: hashParity,
    legacy_sources_compared: legacyCompared,
    legacy_required: false,
    corpus_manifest_sha256: sha256(manifestBytes),
    generated_provenance_complete: staleOutputs.length === 0,
    graph: { current: graphCurrent },
    rag: { current: ragCurrent }
  });
}

export async function importKnowledgeSourceFromLegacy({ root = '.', importedAt = '2026-07-12T00:00:00.000Z' } = {}) {
  const projectRoot = resolve(root);
  const inventory = await inventoryLegacyKnowledgeSource({ root: projectRoot });
  const unknown = inventory.files.filter((item) => item.classification === 'unknown');
  if (unknown.length) throw new Error(`Unknown legacy DOCUMENTS files: ${unknown.map((item) => item.relative_path).join(', ')}`);
  const sourceRoot = join(projectRoot, SOURCE_ROOT);
  const manifestPath = join(sourceRoot, 'corpus-manifest.json');
  const aliasesPath = join(sourceRoot, 'source-aliases.json');
  const currentManifest = await readJsonIfPresent(manifestPath);
  const currentAliases = await readJsonIfPresent(aliasesPath);
  if (currentManifest && (currentManifest.schema_version !== 'rus.knowledge_corpus_manifest.v1' || !Array.isArray(currentManifest.documents))) {
    throw new Error('Invalid existing corpus manifest.');
  }
  if (currentAliases && (currentAliases.schema_version !== 'rus.knowledge_source_aliases.v1' || !currentAliases.aliases || typeof currentAliases.aliases !== 'object')) {
    throw new Error('Invalid existing source aliases.');
  }
  if (Boolean(currentManifest) !== Boolean(currentAliases)) throw new Error('Existing corpus manifest and source aliases must be present together.');

  const nativeDocuments = (currentManifest?.documents ?? []).filter((record) => !record.source_legacy_path);
  for (const record of nativeDocuments) {
    if (!/^corpus\/DOCUMENTS\/[^/]+$/u.test(String(record.canonical_path ?? ''))) {
      throw new Error(`${record.document_id}: invalid native canonical_path`);
    }
    const bytes = await readFile(join(sourceRoot, record.canonical_path));
    if (sha256(bytes) !== record.sha256 || bytes.length !== record.bytes) {
      throw new Error(`${record.document_id}: native corpus manifest hash mismatch`);
    }
  }
  const nativeIds = new Set(nativeDocuments.map((record) => record.document_id));
  const nativePaths = new Set(nativeDocuments.map((record) => record.canonical_path));
  const legacyDocuments = [];
  const legacyWrites = [];
  const plannedLegacyIds = new Set();
  const plannedLegacyPaths = new Set();
  const aliases = { ...(currentAliases?.aliases ?? {}) };
  for (const item of inventory.files.filter((entry) => entry.classification === 'canonical_source')) {
    const fileName = basename(item.relative_path);
    const documentId = documentIdFor(fileName);
    const canonicalPath = `corpus/DOCUMENTS/${fileName}`;
    const sourcePath = join(projectRoot, item.legacy_path);
    const targetPath = join(sourceRoot, canonicalPath);
    const bytes = await readFile(sourcePath);
    if (nativeIds.has(documentId) || nativePaths.has(canonicalPath)) {
      throw new Error(`Legacy import conflicts with native document: ${documentId}`);
    }
    if (plannedLegacyIds.has(documentId) || plannedLegacyPaths.has(canonicalPath)) {
      throw new Error(`Duplicate legacy import target: ${documentId}`);
    }
    if (Object.hasOwn(aliases, fileName) && aliases[fileName] !== documentId) {
      throw new Error(`Legacy alias conflicts with existing alias: ${fileName}`);
    }
    plannedLegacyIds.add(documentId);
    plannedLegacyPaths.add(canonicalPath);
    legacyDocuments.push({
      document_id: documentId,
      canonical_path: canonicalPath,
      file_name: fileName,
      sha256: sha256(bytes),
      bytes: bytes.length,
      status: 'active',
      source_legacy_path: item.legacy_path
    });
    aliases[fileName] = documentId;
    legacyWrites.push({ targetPath, bytes });
  }
  const documents = [...nativeDocuments, ...legacyDocuments];
  documents.sort((left, right) => left.document_id.localeCompare(right.document_id));
  const corpusManifest = {
    ...(currentManifest ?? {}),
    schema_version: 'rus.knowledge_corpus_manifest.v1',
    corpus_id: currentManifest?.corpus_id ?? 'rus-xiii-canonical-documentation',
    release: currentManifest?.release ?? '0.23.0-migration.23',
    source_release: currentManifest?.source_release ?? '0.22.0-migration.22',
    documents
  };
  const documentIds = new Set(documents.map((record) => record.document_id));
  for (const [alias, documentId] of Object.entries(aliases)) {
    if (!documentIds.has(documentId)) throw new Error(`Alias ${alias} references unknown document ${documentId}`);
  }
  const importWrites = [];
  for (const item of inventory.files.filter((entry) => entry.classification !== 'canonical_source')) {
    const category = item.classification === 'generated_graph' ? 'graph'
      : item.classification === 'generated_rag' ? 'rag'
        : 'legacy-documentation';
    const suffix = item.classification === 'generated_graph'
      ? item.relative_path.replace(/^graphify-out\//u, '')
      : item.classification === 'generated_rag'
        ? item.relative_path.replace(/^rag-index\//u, '')
        : item.relative_path;
    importWrites.push({
      targetPath: join(sourceRoot, 'imports', category, suffix),
      bytes: await readFile(join(projectRoot, item.legacy_path))
    });
  }
  const historyWrite = await prepareImportHistory({ sourceRoot, inventory, documents: legacyDocuments, importedAt });
  for (const { targetPath, bytes } of legacyWrites) {
    await mkdir(dirname(targetPath), { recursive: true });
    await writeFile(targetPath, bytes);
  }
  await mkdir(join(sourceRoot, 'imports'), { recursive: true });
  await writeFile(manifestPath, stableJson(corpusManifest));
  await writeFile(aliasesPath, stableJson({ schema_version: 'rus.knowledge_source_aliases.v1', aliases }));
  await writeFile(join(projectRoot, INVENTORY_PATH), stableJson(inventory));
  if (historyWrite) await writeFile(historyWrite.targetPath, historyWrite.bytes);

  for (const { targetPath, bytes } of importWrites) {
    await mkdir(dirname(targetPath), { recursive: true });
    await writeFile(targetPath, bytes);
  }
  return Object.freeze({ document_count: documents.length, legacy_document_count: legacyDocuments.length, inventory_count: inventory.files.length });
}

async function buildKnowledgeSourceOutputMap(projectRoot) {
  const inventory = await readKnowledgeSourceInventory({ root: projectRoot });
  const graph = await buildKnowledgeGraphFromSnapshot({ root: projectRoot });
  const rag = await buildRagIndexFromSnapshot({ root: projectRoot });
  const outputs = new Map([
    [`${GENERATED_ROOT}/graph/graph.json`, graph.graph_text],
    [`${GENERATED_ROOT}/graph/manifest.json`, stableJson(graph.manifest)],
    [`${GENERATED_ROOT}/graph/GRAPH_REPORT.md`, renderGraphReport(graph.manifest)],
    [`${GENERATED_ROOT}/graph/graph.html`, renderGraphHtml(graph.manifest)],
    [`${GENERATED_ROOT}/rag/index.json`, rag.index_text],
    [`${GENERATED_ROOT}/rag/manifest.json`, stableJson(rag.manifest)],
    [`${GENERATED_ROOT}/manifests/inventory.json`, stableJson(inventory)]
  ]);
  const generatedManifest = {
    schema_version: 'rus.knowledge_generated_manifest.v1',
    release: (await readJson(join(projectRoot, 'package.json'))).version,
    generator: 'npm run knowledge:generate',
    files: [...outputs.entries()]
      .map(([path, content]) => ({ path, sha256: sha256(content), bytes: Buffer.byteLength(content) }))
      .sort(byPath)
  };
  outputs.set(`${GENERATED_ROOT}/manifests/knowledge-source-generated-manifest.json`, stableJson(generatedManifest));
  return outputs;
}

async function prepareImportHistory({ sourceRoot, inventory, documents, importedAt }) {
  const path = join(sourceRoot, 'import-history.json');
  let existing;
  try {
    existing = await readJson(path);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw new Error(`Invalid knowledge-source import history: ${error.message}`);
    existing = { schema_version: 'rus.knowledge_import_history.v1', entries: [] };
  }
  if (existing?.schema_version !== 'rus.knowledge_import_history.v1' || !Array.isArray(existing.entries)) {
    throw new Error('Invalid knowledge-source import history.');
  }
  const entry = {
    migration_id: 'knowledge-source-0.23.0',
    imported_at: importedAt,
    source_release: '0.22.0-migration.22',
    source_root: `${LEGACY_ROOT}/corpus/DOCUMENTS`,
    target_root: `${SOURCE_ROOT}/corpus/DOCUMENTS`,
    document_count: documents.length,
    inventory_sha256: sha256(stableJson(inventory)),
    status: 'verified'
  };
  const previous = existing.entries.find((item) => item.migration_id === entry.migration_id);
  if (previous) {
    for (const field of ['source_release', 'source_root', 'target_root', 'document_count', 'inventory_sha256', 'status']) {
      if (previous[field] !== entry[field]) throw new Error(`Import history conflict for ${entry.migration_id}: ${field}`);
    }
    return null;
  }
  return Object.freeze({ targetPath: path, bytes: stableJson({ ...existing, entries: [...existing.entries, entry] }) });
}

async function loadCorpus(projectRoot) {
  const sourceRoot = join(projectRoot, SOURCE_ROOT);
  const manifestBytes = await readFile(join(sourceRoot, 'corpus-manifest.json'));
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  if (manifest.schema_version !== 'rus.knowledge_corpus_manifest.v1' || !Array.isArray(manifest.documents)) throw new Error('Invalid corpus manifest.');
  const corpusFiles = {};
  for (const record of manifest.documents) {
    const bytes = await readFile(join(sourceRoot, record.canonical_path));
    if (sha256(bytes) !== record.sha256 || bytes.length !== record.bytes) throw new Error(`${record.document_id}: corpus manifest hash mismatch`);
    corpusFiles[record.file_name] = bytes.toString('utf8');
  }
  return { manifestBytes, manifest, corpusFiles };
}

function verifyGraphSources(graph, corpusFiles) {
  const errors = [];
  const referenced = new Set();
  for (const node of graph.nodes ?? []) {
    const location = node?.source_location ?? node?.sourceLocation;
    if (!location) continue;
    const file = basename(String(location.file ?? node.source_file ?? ''));
    if (!Object.hasOwn(corpusFiles, file)) {
      errors.push(`node ${node.id ?? '?'} references missing file ${file}`);
      continue;
    }
    referenced.add(file);
    const lines = corpusFiles[file].split(/\r?\n/u).length;
    const start = Number(location.line_start ?? location.lineStart);
    const end = Number(location.line_end ?? location.lineEnd);
    if (Number.isFinite(start) && start < 1) errors.push(`${node.id}: invalid line_start`);
    if (Number.isFinite(end) && end > lines) errors.push(`${node.id}: line_end exceeds ${file}`);
    if (Number.isFinite(start) && Number.isFinite(end) && end < start) errors.push(`${node.id}: inverted line range`);
  }
  for (const file of Object.keys(corpusFiles)) if (!referenced.has(file)) errors.push(`corpus file missing from graph: ${file}`);
  return errors;
}

function classify(rel) {
  if (/^corpus\/DOCUMENTS\/[^/]+$/u.test(rel)) return 'canonical_source';
  if (rel.startsWith('graphify-out/')) return 'generated_graph';
  if (rel.startsWith('rag-index/')) return 'generated_rag';
  if (['CHANGELOG_3.2.md', 'readme.txt'].includes(rel)) return 'documentation';
  return 'unknown';
}

function renderGraphReport(manifest) {
  return `# Knowledge graph materialization report\n\n- Mode: \`${manifest.generation_mode}\`\n- Corpus: \`${manifest.corpus_root}\`\n- Documents: ${manifest.source_document_count}\n- Nodes: ${manifest.node_count}\n- Links: ${manifest.link_count}\n- Hyperedges: ${manifest.hyperedge_count}\n- Graph SHA-256: \`${manifest.graph_sha256}\`\n\nSemantic nodes and links are preserved from the approved legacy snapshot. The generator validates every source location against the migrated corpus and does not invent new semantic relations.\n`;
}

function renderGraphHtml(manifest) {
  return `<!doctype html><meta charset="utf-8"><title>RUS knowledge graph</title><h1>RUS knowledge graph</h1><p>Documents: ${manifest.source_document_count}; nodes: ${manifest.node_count}; links: ${manifest.link_count}; hyperedges: ${manifest.hyperedge_count}.</p><p>Machine-readable graph: <a href="graph.json">graph.json</a>.</p>`;
}

function documentIdFor(fileName) {
  if (fileName === 'README.md') return 'documentation-corpus-readme';
  return fileName.replace(/\.(?:md|txt)$/u, '').replaceAll('_', '-').toLowerCase();
}

function freezeInventory(inventory) {
  return Object.freeze({
    ...structuredClone(inventory),
    files: Object.freeze((inventory.files ?? []).map((item) => Object.freeze({ ...item })))
  });
}

async function committedMatches(root, rel, expected) {
  const actual = await readFile(join(root, rel), 'utf8').catch(() => null);
  return actual === expected;
}

async function walk(dir) {
  const result = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) result.push(...await walk(path));
    else result.push(path);
  }
  return result;
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function readJsonIfPresent(path) {
  try {
    return await readJson(path);
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function byPath(left, right) {
  return left.path.localeCompare(right.path);
}
