import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { readJson, readJsonIfPresent, sha256, stableJson } from './knowledge-source-json.js';
const LEGACY_ROOT = 'legacy/DOCUMENTS/documents-kg';
const SOURCE_ROOT = 'data/knowledge-source';
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

export { verifyKnowledgeSourceMigrationV2 as verifyKnowledgeSourceMigration } from './knowledge-v2-api.js';

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
  if (currentManifest && (currentManifest.schema_version !== 'rus.knowledge_corpus_manifest.v2' || !Array.isArray(currentManifest.documents))) {
    throw new Error('Invalid existing corpus manifest.');
  }
  if (currentAliases && (currentAliases.schema_version !== 'rus.knowledge_source_aliases.v1' || !currentAliases.aliases || typeof currentAliases.aliases !== 'object')) {
    throw new Error('Invalid existing source aliases.');
  }
  if (Boolean(currentManifest) !== Boolean(currentAliases)) throw new Error('Existing corpus manifest and source aliases must be present together.');

  const nativeDocuments = (currentManifest?.documents ?? []).filter((record) => !record.source_legacy_path || record.provenance_mode === 'canonicalized_from_legacy');
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
    const preservedCanonicalized = nativeDocuments.find((record) => record.document_id === documentId && record.canonical_path === canonicalPath && record.source_legacy_path === item.legacy_path);
    if (preservedCanonicalized) {
      const expectedDigest = preservedCanonicalized.source_legacy_sha256;
      const expectedBytes = preservedCanonicalized.source_legacy_bytes;
      if (expectedDigest !== sha256(bytes) || expectedBytes !== bytes.length) {
        throw new Error(`Canonicalized legacy provenance changed: ${item.legacy_path}`);
      }
      aliases[fileName] = documentId;
      continue;
    }
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
      provenance_mode: 'legacy_mirror',
      source_legacy_path: item.legacy_path
    });
    aliases[fileName] = documentId;
    legacyWrites.push({ targetPath, bytes });
  }
  const documents = [...nativeDocuments, ...legacyDocuments];
  documents.sort((left, right) => left.document_id.localeCompare(right.document_id));
  const corpusManifest = {
    ...(currentManifest ?? {}),
    schema_version: 'rus.knowledge_corpus_manifest.v2',
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
  const historyWrite = await prepareImportHistory({ sourceRoot, inventory, documents: documents.filter((record) => record.source_legacy_path), importedAt });
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
  return Object.freeze({ document_count: documents.length, legacy_document_count: documents.filter((record) => record.source_legacy_path).length, inventory_count: inventory.files.length });
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
  const inventorySha256 = sha256(stableJson(inventory));
  const baseMigrationId = 'knowledge-source-0.23.0';
  const existingBase = existing.entries.find((item) => item.migration_id === baseMigrationId);
  const migrationId = existingBase && existingBase.inventory_sha256 !== inventorySha256
    ? `${baseMigrationId}-${inventorySha256.slice(0, 12)}`
    : baseMigrationId;
  const entry = {
    migration_id: migrationId,
    imported_at: importedAt,
    source_release: '0.22.0-migration.22',
    source_root: `${LEGACY_ROOT}/corpus/DOCUMENTS`,
    target_root: `${SOURCE_ROOT}/corpus/DOCUMENTS`,
    document_count: documents.length,
    inventory_sha256: inventorySha256,
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

function classify(rel) {
  if (/^corpus\/DOCUMENTS\/[^/]+$/u.test(rel)) return 'canonical_source';
  if (rel.startsWith('graphify-out/')) return 'generated_graph';
  if (rel.startsWith('rag-index/')) return 'generated_rag';
  if (['CHANGELOG_3.2.md', 'readme.txt'].includes(rel)) return 'documentation';
  return 'unknown';
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

async function walk(dir) {
  const result = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) result.push(...await walk(path));
    else result.push(path);
  }
  return result;
}
