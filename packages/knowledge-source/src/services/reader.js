import { createHash } from 'node:crypto';
import { deepFreeze, validateAliases, validateCorpusManifest } from '../domain/manifest.js';
import { knowledgeSourceError } from '../errors.js';

export function createKnowledgeSourceReader({ storage } = {}) {
  assertStorage(storage);
  return Object.freeze({
    listDocuments: async () => {
      const { manifest } = await loadRegistry(storage);
      return deepFreeze({ schema_version: 'rus.knowledge_document_list.v1', documents: structuredClone(manifest.documents) });
    },
    getCorpusManifest: async () => {
      const { manifest } = await loadRegistry(storage);
      return structuredCloneFrozen(manifest);
    },
    getDocument: (input) => getDocument(storage, input),
    resolveSourceLocation: (input) => resolveSourceLocation(storage, input),
    searchDocuments: (input) => searchDocuments(storage, input),
    verifyCorpus: () => verifyCorpus(storage),
    getGeneratedIndexStatus: () => getGeneratedIndexStatus(storage)
  });
}

async function loadRegistry(storage) {
  const manifestRaw = await storage.readCorpusManifest();
  const manifest = validateCorpusManifest(manifestRaw.value);
  const aliases = validateAliases((await storage.readAliases()).value, manifest);
  return { manifest, aliases, manifestBytes: manifestRaw.bytes };
}

async function getDocument(storage, input = {}) {
  const requestedId = validateDocumentReference(input.document_id);
  const { manifest, aliases } = await loadRegistry(storage);
  const documentId = aliases.aliases[requestedId] ?? requestedId;
  const record = manifest.documents.find((item) => item.document_id === documentId);
  if (!record) throw knowledgeSourceError('DOCUMENT_NOT_REGISTERED', `Document is not registered: ${requestedId}`);
  const loaded = await storage.readDocument(record.canonical_path);
  if (loaded.sha256 !== record.sha256 || loaded.bytes.length !== record.bytes) {
    throw knowledgeSourceError('DOCUMENT_HASH_MISMATCH', `Document integrity check failed: ${documentId}`, {
      expected_sha256: record.sha256,
      actual_sha256: loaded.sha256,
      expected_bytes: record.bytes,
      actual_bytes: loaded.bytes.length
    });
  }
  return deepFreeze({
    schema_version: 'rus.knowledge_document.v1',
    document_id: record.document_id,
    canonical_path: record.canonical_path,
    sha256: record.sha256,
    bytes: record.bytes,
    text: loaded.bytes.toString('utf8')
  });
}

async function resolveSourceLocation(storage, input = {}) {
  const start = Number(input.start_line);
  const end = Number(input.end_line);
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start) {
    throw knowledgeSourceError('SOURCE_LOCATION_INVALID', 'Source location must use positive ordered line numbers.');
  }
  const document = await getDocument(storage, input);
  const lines = document.text.split(/\r?\n/u);
  if (end > lines.length) throw knowledgeSourceError('SOURCE_LOCATION_INVALID', `Line ${end} exceeds ${document.document_id} length ${lines.length}.`);
  return deepFreeze({
    schema_version: 'rus.knowledge_source_location.v1',
    document_id: document.document_id,
    canonical_path: document.canonical_path,
    start_line: start,
    end_line: end,
    text: lines.slice(start - 1, end).join('\n'),
    source_sha256: document.sha256
  });
}

async function searchDocuments(storage, input = {}) {
  const query = String(input.query ?? '').trim();
  if (!query) throw knowledgeSourceError('SEARCH_BACKEND_UNAVAILABLE', 'A non-empty full-text query is required.');
  const mode = String(input.search_mode ?? 'full_text');
  if (mode !== 'full_text') throw knowledgeSourceError('SEARCH_BACKEND_UNAVAILABLE', `Unsupported search mode: ${mode}`);
  const limit = normalizeLimit(input.limit);
  const { manifest, aliases } = await loadRegistry(storage);
  const allowed = normalizeAllowed(input.allowed_document_ids, manifest, aliases);
  const needle = query.toLocaleLowerCase('ru-RU');
  const results = [];
  for (const record of manifest.documents) {
    if (allowed && !allowed.has(record.document_id)) continue;
    const document = await getDocument(storage, { document_id: record.document_id });
    const lines = document.text.split(/\r?\n/u);
    const index = lines.findIndex((line) => line.toLocaleLowerCase('ru-RU').includes(needle));
    if (index < 0) continue;
    const start = Math.max(0, index - 1);
    const end = Math.min(lines.length, index + 2);
    results.push({
      document_id: document.document_id,
      canonical_path: document.canonical_path,
      start_line: start + 1,
      end_line: end,
      text: lines.slice(start, end).join('\n'),
      retrieval_method: 'full_text',
      source_sha256: document.sha256
    });
    if (results.length >= limit) break;
  }
  return deepFreeze({ schema_version: 'rus.knowledge_search_result.v1', query, results });
}

async function verifyCorpus(storage) {
  const { manifest } = await loadRegistry(storage);
  const errors = [];
  for (const item of manifest.documents) {
    await getDocument(storage, { document_id: item.document_id }).catch((error) => errors.push({ code: error.code ?? 'UNKNOWN', document_id: item.document_id, message: error.message }));
  }
  return deepFreeze({ ok: errors.length === 0, document_count: manifest.documents.length, errors });
}

async function getGeneratedIndexStatus(storage) {
  const manifestRaw = await storage.readCorpusManifest();
  validateCorpusManifest(manifestRaw.value);
  const currentHash = createHash('sha256').update(manifestRaw.bytes).digest('hex');
  return deepFreeze({
    schema_version: 'rus.knowledge_generated_status.v1',
    corpus_manifest_sha256: currentHash,
    graph: await generatedStatus(storage, 'graph', currentHash, 'rus.knowledge_graph_manifest.v1'),
    rag: await generatedStatus(storage, 'rag', currentHash, 'rus.knowledge_rag_manifest.v1')
  });
}

async function generatedStatus(storage, kind, currentHash, schemaVersion) {
  const raw = await storage.readGeneratedManifest(kind);
  if (!raw) return { status: 'missing', reason: 'manifest_missing' };
  const value = raw.value;
  if (value?.schema_version !== schemaVersion) return { status: 'stale', reason: 'manifest_schema_invalid' };
  if (String(value.corpus_manifest_sha256 ?? '') !== currentHash) return { status: 'stale', reason: 'corpus_manifest_hash_mismatch' };

  if (kind === 'rag' && value.generation_mode === 'approved_semantic_snapshot_plus_deterministic_lexical_coverage') {
    if (!value.semantic_index_sha256 || !value.lexical_index_sha256) return { status: 'stale', reason: 'manifest_contract_invalid' };
    const semantic = await storage.readGeneratedArtifact('rag', 'index.json').catch(() => null);
    if (!semantic) return { status: 'missing', reason: 'semantic_artifact_missing' };
    if (String(value.semantic_index_sha256) !== semantic.sha256) return { status: 'stale', reason: 'semantic_artifact_hash_mismatch' };
    const lexical = await storage.readGeneratedArtifact('rag', 'lexical-index.json').catch(() => null);
    if (!lexical) return { status: 'missing', reason: 'lexical_artifact_missing' };
    if (String(value.lexical_index_sha256) !== lexical.sha256) return { status: 'stale', reason: 'lexical_artifact_hash_mismatch' };
    return {
      status: 'current',
      manifest_sha256: createHash('sha256').update(raw.bytes).digest('hex'),
      artifact_sha256: semantic.sha256,
      lexical_artifact_sha256: lexical.sha256,
      semantic_document_count: Number(value.semantic_document_count ?? 0),
      lexical_only_document_count: Number(value.lexical_only_document_count ?? 0)
    };
  }

  const artifactName = kind === 'graph' ? 'graph.json' : 'index.json';
  const digestField = kind === 'graph' ? 'graph_sha256' : 'index_sha256';
  const artifact = await storage.readGeneratedArtifact(kind, artifactName).catch(() => null);
  if (!artifact) return { status: 'missing', reason: 'artifact_missing' };
  if (String(value[digestField] ?? '') !== artifact.sha256) return { status: 'stale', reason: 'artifact_hash_mismatch' };
  return { status: 'current', manifest_sha256: createHash('sha256').update(raw.bytes).digest('hex'), artifact_sha256: artifact.sha256 };
}

function validateDocumentReference(value) {
  const result = String(value ?? '').trim();
  if (!result) throw knowledgeSourceError('DOCUMENT_NOT_REGISTERED', 'document_id is required.');
  if (!/^[\p{L}\p{N}._-]+$/u.test(result)) throw knowledgeSourceError('PATH_TRAVERSAL_REJECTED', `Unsafe document reference: ${result}`);
  return result;
}

function normalizeAllowed(value, manifest, aliases) {
  if (value == null) return null;
  if (!Array.isArray(value)) throw knowledgeSourceError('SEARCH_BACKEND_UNAVAILABLE', 'allowed_document_ids must be an array.');
  const known = new Set(manifest.documents.map((item) => item.document_id));
  const result = new Set();
  for (const requested of value) {
    const clean = validateDocumentReference(requested);
    const documentId = aliases.aliases[clean] ?? clean;
    if (!known.has(documentId)) throw knowledgeSourceError('DOCUMENT_NOT_REGISTERED', `Allowed document is not registered: ${clean}`);
    result.add(documentId);
  }
  return result;
}

function normalizeLimit(value) {
  const limit = Number(value ?? 8);
  return Number.isInteger(limit) && limit > 0 ? Math.min(limit, 100) : 8;
}

function structuredCloneFrozen(value) {
  return deepFreeze(structuredClone(value));
}

function assertStorage(storage) {
  for (const method of ['readCorpusManifest', 'readAliases', 'readDocument', 'readGeneratedManifest', 'readGeneratedArtifact']) {
    if (typeof storage?.[method] !== 'function') throw new TypeError(`storage.${method} is required.`);
  }
}
