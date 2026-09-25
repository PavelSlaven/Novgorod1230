import { createHash } from 'node:crypto';
import { deepFreeze, validateAliases, validateCorpusManifest } from '../domain/manifest.js';
import { validateRetrievalPolicy } from '../domain/retrieval-policy.js';
import { rankKnowledgeChunks } from '../domain/retrieval.js';
import { knowledgeSourceError } from '../errors.js';

export function createKnowledgeRagReader({ storage, allowedStatuses = ['active'] } = {}) {
  assertStorage(storage);
  const visibleStatuses = normalizeStatuses(allowedStatuses);
  return Object.freeze({
    getRetrievalPolicy: () => getPolicy(storage, visibleStatuses),
    searchKnowledge: (input) => search(storage, input, visibleStatuses),
    runControlQueries: (input) => runControls(storage, input, visibleStatuses),
    getReadinessStatus: () => readiness(storage, visibleStatuses)
  });
}

async function getPolicy(storage, visibleStatuses) {
  const context = await loadPolicy(storage);
  const visibleIds = new Set(context.manifest.documents.filter((item) => visibleStatuses.has(item.status)).map((item) => item.document_id));
  return deepFreeze({ ...context.policy, documents: context.policy.documents.filter((item) => visibleIds.has(item.document_id)) });
}

async function search(storage, input = {}, visibleStatuses) {
  const query = String(input.query ?? '').trim();
  if (!query) throw knowledgeSourceError('SEARCH_BACKEND_UNAVAILABLE', 'A non-empty knowledge query is required.');
  const context = await loadContext(storage);
  const requestedStatuses = requestedStatusSet(input.statuses, context.policy.default_statuses, visibleStatuses);
  const selectedDocuments = context.manifest.documents.filter((item) => requestedStatuses.has(item.status));
  const allowed = normalizeAllowed(input.allowed_document_ids, selectedDocuments, context.aliases);
  const selected = allowed ? selectedDocuments.filter((item) => allowed.has(item.document_id)) : selectedDocuments;
  const metadataById = new Map(context.policy.documents.map((item) => [item.document_id, item]));
  const ranked = rankKnowledgeChunks({
    query,
    chunks: context.chunks,
    documentsByFile: new Map(selected.map((item) => [item.file_name, item])),
    metadataById,
    limit: input.limit
  });
  const results = ranked.map(({ chunk, document, metadata, score }) => ({
    document_id: document.document_id,
    canonical_path: document.canonical_path,
    status: document.status,
    source_sha256: document.sha256,
    section: String(chunk.section ?? ''),
    start_line: Number(chunk.line_start),
    end_line: Number(chunk.line_end),
    text: String(chunk.text ?? ''),
    score,
    retrieval_method: 'ranked_lexical_over_committed_rag_chunks',
    document_type: metadata.document_type,
    priority_tier: metadata.priority_tier,
    subsystems: metadata.subsystems,
    related_document_ids: metadata.related_document_ids,
    related_module_paths: metadata.related_module_paths,
    related_contracts: metadata.related_contracts
  }));
  const conflictIds = new Set(results.flatMap((item) => metadataById.get(item.document_id)?.conflicts_with_document_ids ?? []));
  const conflicts = [...conflictIds].map((id) => context.documentsById.get(id))
    .filter(Boolean)
    .map(({ record, line_count }) => {
      const metadata = metadataById.get(record.document_id);
      return {
        document_id: record.document_id,
        canonical_path: record.canonical_path,
        status: record.status,
        source_sha256: record.sha256,
        start_line: 1,
        end_line: line_count,
        priority_tier: metadata.priority_tier
      };
    });
  return deepFreeze({
    schema_version: 'rus.knowledge_ranked_search_result.v1',
    query,
    requested_statuses: [...requestedStatuses],
    retrieval_policy_version: context.policy.policy_version,
    rag_status: context.readiness.status,
    results,
    conflicts
  });
}

async function runControls(storage, input = {}, visibleStatuses) {
  const context = await loadContext(storage);
  const queryIds = input.query_ids == null ? null : new Set(input.query_ids.map(String));
  const controls = queryIds ? context.policy.control_queries.filter((item) => queryIds.has(item.query_id)) : context.policy.control_queries;
  const checks = [];
  for (const control of controls) {
    const response = await search(storage, { query: control.query, limit: control.top_k }, visibleStatuses);
    const returned = response.results.map((item) => item.document_id);
    const matched = control.expected_document_ids.filter((id) => returned.includes(id));
    checks.push({ ...control, returned_document_ids: returned, matched_document_ids: matched, ok: matched.length > 0 });
  }
  return deepFreeze({ schema_version: 'rus.knowledge_retrieval_control_report.v1', ok: checks.every((item) => item.ok), checks });
}

async function readiness(storage, visibleStatuses) {
  const context = await loadContext(storage);
  void visibleStatuses;
  return deepFreeze({
    schema_version: 'rus.knowledge_rag_readiness.v1',
    status: context.readiness.status,
    retrieval_policy_version: context.policy.policy_version,
    control_query_count: context.policy.control_queries.length
  });
}

async function loadPolicy(storage) {
  const manifestRaw = await storage.readCorpusManifest();
  const manifest = validateCorpusManifest(manifestRaw.value);
  const aliases = validateAliases((await storage.readAliases()).value, manifest);
  const raw = await storage.readRetrievalPolicy();
  const policy = validateRetrievalPolicy(raw.value, manifest);
  const manifestSha256 = sha256(manifestRaw.bytes);
  if (policy.baseline_manifest_sha256 !== manifestSha256) {
    throw knowledgeSourceError('RETRIEVAL_POLICY_STALE', 'Retrieval policy baseline does not match the current corpus manifest.');
  }
  const documentsById = await verifyCanonicalDocuments(storage, manifest);
  return { manifest, aliases, manifestBytes: manifestRaw.bytes, policy, documentsById };
}

async function loadContext(storage) {
  const registry = await loadPolicy(storage);
  const raw = await storage.readGeneratedManifest('rag');
  if (!raw || raw.value?.schema_version !== 'rus.knowledge_rag_manifest.v1') throw knowledgeSourceError('GENERATED_INDEX_STALE', 'RAG manifest is missing or invalid.');
  const rag = raw.value;
  if (rag.corpus_manifest_sha256 !== sha256(registry.manifestBytes) || registry.policy.baseline_manifest_sha256 !== rag.corpus_manifest_sha256) {
    throw knowledgeSourceError('GENERATED_INDEX_STALE', 'Corpus, retrieval policy and RAG manifest are not pinned to the same manifest.');
  }
  const lexicalRaw = await storage.readGeneratedArtifact('rag', 'lexical-index.json');
  if (lexicalRaw.sha256 !== rag.lexical_index_sha256) throw knowledgeSourceError('GENERATED_INDEX_STALE', 'RAG artifact digest differs from its manifest.');
  const lexical = parseJson(lexicalRaw.bytes, 'lexical index');
  const coverage = validateRagCoverage(rag.coverage, registry.manifest);
  const lexicalChunks = lexical.chunks ?? [];
  validateChunkLocations(lexicalChunks, registry.documentsById);
  validateLexicalCoverage(lexicalChunks, registry.documentsById, coverage);
  return {
    ...registry,
    chunks: lexicalChunks,
    readiness: { status: 'ready' }
  };
}

function validateRagCoverage(value, manifest) {
  if (!Array.isArray(value)) throw knowledgeSourceError('GENERATED_PROVENANCE_INVALID', 'RAG coverage must be an array.');
  const recordsById = new Map(manifest.documents.map((record) => [record.document_id, record]));
  if (value.length !== recordsById.size) throw knowledgeSourceError('GENERATED_PROVENANCE_INVALID', 'RAG coverage must contain exactly one record per registered document.');
  const coverage = new Map();
  for (const item of value) {
    const documentId = String(item?.document_id ?? '');
    const record = recordsById.get(documentId);
    if (!record) throw knowledgeSourceError('GENERATED_PROVENANCE_INVALID', `RAG coverage references unknown document ${documentId || '(empty)'}.`);
    if (coverage.has(documentId)) throw knowledgeSourceError('GENERATED_PROVENANCE_INVALID', `RAG coverage duplicates ${documentId}.`);
    if (item.file_name !== record.file_name) throw knowledgeSourceError('GENERATED_PROVENANCE_INVALID', `RAG coverage file mismatch for ${documentId}.`);
    if (item.lexical_indexed !== true) throw knowledgeSourceError('GENERATED_PROVENANCE_INVALID', `RAG coverage must be lexical for ${documentId}.`);
    if (item.semantic_indexed === true) throw knowledgeSourceError('GENERATED_PROVENANCE_INVALID', `Semantic RAG coverage is not permitted for ${documentId}.`);
    coverage.set(documentId, item);
  }
  return coverage;
}

async function verifyCanonicalDocuments(storage, manifest) {
  const documentsById = new Map();
  for (const record of manifest.documents) {
    const loaded = await storage.readDocument(record.canonical_path);
    if (loaded.sha256 !== record.sha256 || loaded.bytes.length !== record.bytes) {
      throw knowledgeSourceError('DOCUMENT_HASH_MISMATCH', `Document integrity check failed: ${record.document_id}`, {
        expected_sha256: record.sha256,
        actual_sha256: loaded.sha256,
        expected_bytes: record.bytes,
        actual_bytes: loaded.bytes.length
      });
    }
    documentsById.set(record.document_id, {
      record,
      line_count: loaded.bytes.toString('utf8').split(/\r?\n/u).length
    });
  }
  return documentsById;
}

function validateChunkLocations(chunks, documentsById) {
  const documentsByFile = new Map([...documentsById.values()].map((item) => [item.record.file_name, item]));
  for (const chunk of chunks) {
    const document = documentsByFile.get(String(chunk?.file ?? ''));
    const start = Number(chunk?.line_start);
    const end = Number(chunk?.line_end);
    if (!document || !Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start || end > document.line_count) {
      throw knowledgeSourceError('GENERATED_PROVENANCE_INVALID', `RAG chunk has an invalid source location: ${String(chunk?.id ?? '<unknown>')}`);
    }
  }
}

function validateLexicalCoverage(lexicalChunks, documentsById, coverage) {
  const documentsByFile = new Map([...documentsById.values()].map((item) => [item.record.file_name, item.record]));
  const lexicalDocumentIds = new Set();
  for (const chunk of lexicalChunks) {
    const document = documentsByFile.get(String(chunk.file ?? ''));
    const item = document && coverage.get(document.document_id);
    if (!document || item?.lexical_indexed !== true) {
      throw knowledgeSourceError('GENERATED_PROVENANCE_INVALID', `Lexical RAG chunk conflicts with coverage for ${document?.document_id ?? String(chunk.id ?? '<unknown>')}.`);
    }
    lexicalDocumentIds.add(document.document_id);
  }
  for (const [documentId, item] of coverage) {
    if (item.lexical_indexed === true && !lexicalDocumentIds.has(documentId)) {
      throw knowledgeSourceError('GENERATED_PROVENANCE_INVALID', `Lexical RAG coverage has no chunk for ${documentId}.`);
    }
  }
}

function requestedStatusSet(value, defaults, visibleStatuses) {
  const statuses = normalizeStatuses(value ?? defaults);
  for (const status of statuses) if (!visibleStatuses.has(status)) throw knowledgeSourceError('DOCUMENT_STATUS_NOT_ALLOWED', `Requested status is not available to this reader: ${status}`);
  return statuses;
}

function normalizeStatuses(value) {
  if (!Array.isArray(value) || value.length === 0) throw new TypeError('statuses must be a non-empty array.');
  const allowed = new Set(['active', 'proposed', 'deprecated']);
  const result = new Set();
  for (const raw of value) {
    const status = String(raw ?? '').trim();
    if (!allowed.has(status)) throw new TypeError(`Unsupported knowledge document status: ${status || '<empty>'}.`);
    result.add(status);
  }
  return result;
}

function normalizeAllowed(value, documents, aliases) {
  if (value == null) return null;
  if (!Array.isArray(value)) throw knowledgeSourceError('SEARCH_BACKEND_UNAVAILABLE', 'allowed_document_ids must be an array.');
  const known = new Set(documents.map((item) => item.document_id));
  const result = new Set();
  for (const raw of value) {
    const requested = String(raw ?? '').trim();
    const id = aliases.aliases[requested] ?? requested;
    if (!known.has(id)) throw knowledgeSourceError('DOCUMENT_NOT_REGISTERED', `Allowed document is not registered for requested statuses: ${requested}`);
    result.add(id);
  }
  return result;
}

function parseJson(bytes, label) {
  try { return JSON.parse(bytes.toString('utf8')); }
  catch (error) { throw knowledgeSourceError('GENERATED_PROVENANCE_INVALID', `${label} is invalid JSON.`, { cause: error.message }); }
}

function sha256(value) { return createHash('sha256').update(value).digest('hex'); }
function assertStorage(storage) {
  for (const method of ['readCorpusManifest', 'readAliases', 'readRetrievalPolicy', 'readDocument', 'readGeneratedManifest', 'readGeneratedArtifact']) {
    if (typeof storage?.[method] !== 'function') throw new TypeError(`storage.${method} is required.`);
  }
}
