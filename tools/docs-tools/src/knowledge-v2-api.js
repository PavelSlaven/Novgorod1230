import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { CANONICAL_DEFAULT_STATUSES } from '../../../packages/knowledge-source/src/domain/retrieval-policy.js';
import { buildKnowledgeSourceOutputsV2 } from './knowledge-materializer-v2.js';
import { readKnowledgeSourceInventory } from './knowledge-source.js';
import {
  diffCorpusStatusesAgainstIndex,
  loadContractIndexCorpusStatuses
} from './contract-index-corpus-status.js';

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
  const lexicalText = outputs.get(`${GENERATED_ROOT}/rag/lexical-index.json`);
  const manifestText = outputs.get(`${GENERATED_ROOT}/rag/manifest.json`);
  return Object.freeze({
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
  if (manifest.schema_version !== 'rus.knowledge_corpus_manifest.v2') errors.push('corpus manifest: unsupported schema_version');
  const inventoryByLegacyPath = new Map((inventory.files ?? []).map((item) => [item.legacy_path, item]));
  const unknownInventory = (inventory.files ?? []).filter((item) => item.classification === 'unknown');
  if (unknownInventory.length) errors.push(`stored inventory contains unknown files: ${unknownInventory.map((item) => item.relative_path).join(', ')}`);
  const expectedLegacyPaths = new Set((manifest.documents ?? []).filter((record) => record.source_legacy_path).map((record) => record.source_legacy_path));
  const actualLegacyPaths = new Set((inventory.files ?? []).filter((item) => item.classification === 'canonical_source').map((item) => item.legacy_path));
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
    const expectedLegacySha = record.source_legacy_sha256 ?? record.sha256;
    const expectedLegacyBytes = record.source_legacy_bytes ?? record.bytes;
    if (!inventoryRecord || inventoryRecord.sha256 !== expectedLegacySha || inventoryRecord.bytes !== expectedLegacyBytes) {
      hashParity = false;
      errors.push(`${record.document_id}: legacy inventory parity failed`);
      continue;
    }
    const legacy = await readFile(join(projectRoot, record.source_legacy_path)).catch(() => null);
    if (legacy) {
      legacyCompared += 1;
      if (record.provenance_mode !== 'canonicalized_from_legacy' && !current.equals(legacy)) {
        hashParity = false;
        errors.push(`${record.document_id}: available legacy source differs`);
      }
    }
  }

  const corpusHasIndex = (manifest.documents ?? []).some((record) => record.file_name === 'CONTRACT_INDEX.md');
  if (corpusHasIndex) {
    try {
      const statusByFile = await loadContractIndexCorpusStatuses({ root: projectRoot });
      errors.push(...diffCorpusStatusesAgainstIndex(manifest.documents ?? [], statusByFile));
    } catch (error) {
      errors.push(`CONTRACT_INDEX status load failed: ${error.message}`);
    }
  }

  const policyBytes = await readFile(join(projectRoot, SOURCE_ROOT, 'retrieval-policy.json')).catch((error) => {
    errors.push(`retrieval policy missing: ${error.message}`);
    return null;
  });
  if (policyBytes) {
    try {
      const policy = JSON.parse(policyBytes.toString('utf8'));
      const defaults = Array.isArray(policy.default_statuses) ? policy.default_statuses : [];
      const expectedDefaults = [...CANONICAL_DEFAULT_STATUSES];
      if (defaults.length !== expectedDefaults.length || expectedDefaults.some((status, index) => defaults[index] !== status)) {
        errors.push(`retrieval policy default_statuses must be ${JSON.stringify(expectedDefaults)} (got ${JSON.stringify(defaults)}); run knowledge:repin`);
      }
      for (const item of policy.documents ?? []) {
        if (item && Object.hasOwn(item, 'priority_tier')) {
          errors.push(`${item.document_id ?? '<unknown>'}: retrieval policy must not declare priority_tier; ranking reads corpus-manifest`);
        }
      }
      if (policy.baseline_manifest_sha256 !== sha256(manifestBytes)) {
        errors.push('retrieval policy baseline_manifest_sha256 does not match corpus-manifest; run knowledge:repin');
      }
    } catch (error) {
      errors.push(`retrieval policy: ${error.message}`);
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
