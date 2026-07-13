import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { buildKnowledgeSourceOutputsV2 } from './knowledge-materializer-v2.js';
import { readKnowledgeSourceInventory } from './knowledge-source.js';

const SOURCE_ROOT = 'data/knowledge-source';
const GENERATED_ROOT = 'generated/knowledge-source';

export async function buildKnowledgeGraphFromSnapshotV2({ root = '.' } = {}) {
  const outputs = await buildKnowledgeSourceOutputsV2({ root });
  const graphText = outputs.get(`${GENERATED_ROOT}/graph/graph.json`);
  const manifestText = outputs.get(`${GENERATED_ROOT}/graph/manifest.json`);
  return Object.freeze({
    graph: JSON.parse(graphText),
    graph_text: graphText,
    manifest: JSON.parse(manifestText)
  });
}

export async function buildRagIndexFromSnapshotV2({ root = '.' } = {}) {
  const outputs = await buildKnowledgeSourceOutputsV2({ root });
  const indexText = outputs.get(`${GENERATED_ROOT}/rag/index.json`);
  const lexicalText = outputs.get(`${GENERATED_ROOT}/rag/lexical-index.json`);
  const manifestText = outputs.get(`${GENERATED_ROOT}/rag/manifest.json`);
  return Object.freeze({
    index: JSON.parse(indexText),
    index_text: indexText,
    lexical_index: JSON.parse(lexicalText),
    lexical_index_text: lexicalText,
    manifest: JSON.parse(manifestText)
  });
}

export async function verifyKnowledgeSourceMigrationV2({ root = '.' } = {}) {
  const projectRoot = resolve(root);
  const errors = [];
  const inventory = await readKnowledgeSourceInventory({ root: projectRoot }).catch((error) => {
    errors.push(error.message);
    return { files: [] };
  });
  const manifestBytes = await readFile(join(projectRoot, SOURCE_ROOT, 'corpus-manifest.json')).catch((error) => {
    errors.push(error.message);
    return Buffer.from('{}');
  });
  const manifest = safeJson(manifestBytes, errors, 'corpus manifest');
  const inventoryByLegacyPath = new Map((inventory.files ?? []).map((item) => [item.legacy_path, item]));
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
      errors.push(`${record.document_id}: legacy inventory parity failed`);
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

  const expected = await buildKnowledgeSourceOutputsV2({ root: projectRoot }).catch((error) => {
    errors.push(error.message);
    return new Map();
  });
  const staleOutputs = [];
  for (const [rel, content] of expected) {
    const actual = await readFile(join(projectRoot, rel), 'utf8').catch(() => null);
    if (actual !== content) staleOutputs.push(rel);
  }
  if (staleOutputs.length) errors.push(`generated outputs are missing or stale: ${staleOutputs.join(', ')}`);

  return Object.freeze({
    ok: errors.length === 0,
    errors: Object.freeze(errors),
    inventory_count: inventory.files?.length ?? 0,
    document_count: manifest.documents?.length ?? 0,
    legacy_document_count: legacyDocumentCount,
    native_document_count: nativeDocumentCount,
    hash_parity: hashParity,
    legacy_sources_compared: legacyCompared,
    legacy_required: false,
    corpus_manifest_sha256: sha256(manifestBytes),
    generated_provenance_complete: staleOutputs.length === 0,
    graph: Object.freeze({ current: !staleOutputs.some((path) => path.startsWith(`${GENERATED_ROOT}/graph/`)) }),
    rag: Object.freeze({ current: !staleOutputs.some((path) => path.startsWith(`${GENERATED_ROOT}/rag/`)) })
  });
}

function safeJson(bytes, errors, label) {
  try {
    const value = JSON.parse(bytes.toString('utf8'));
    if (!Array.isArray(value.documents)) errors.push(`${label}: documents are missing`);
    return value;
  } catch (error) {
    errors.push(`${label}: ${error.message}`);
    return { documents: [] };
  }
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}
