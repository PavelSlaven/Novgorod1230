import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createKnowledgeRagReader } from '../src/services/rag-reader.js';
import { validateRetrievalPolicy } from '../src/domain/retrieval-policy.js';
import { rankKnowledgeChunks } from '../src/domain/retrieval.js';

function sha(value) {
  return createHash('sha256').update(value).digest('hex');
}

function jsonBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
}

function makeFixture({ staleRagCorpusPin = false, activeConflicts = [], proposedCoverage = 'baseline_gap', deprecatedCoverage = 'baseline_gap', controlExpected = ['active'], includeDeprecated = false } = {}) {
  const texts = {
    'active.md': Buffer.from('# Active\n\nCode materializes instances from approved profiles.'),
    'proposed.md': Buffer.from('# Proposed\n\nFuture perception engine proposal.'),
    'deprecated.md': Buffer.from('# Deprecated\n\nHistoric reference vocabulary.')
  };
  const manifest = {
    schema_version: 'rus.knowledge_corpus_manifest.v2', corpus_id: 'test', release: 'test',
    documents: [
      { document_id: 'active', canonical_path: 'corpus/DOCUMENTS/active.md', file_name: 'active.md', sha256: sha(texts['active.md']), bytes: texts['active.md'].length, status: 'active', provenance_mode: 'native' },
      { document_id: 'proposed', canonical_path: 'corpus/DOCUMENTS/proposed.md', file_name: 'proposed.md', sha256: sha(texts['proposed.md']), bytes: texts['proposed.md'].length, status: 'proposed', provenance_mode: 'native' },
      ...(includeDeprecated ? [{ document_id: 'deprecated', canonical_path: 'corpus/DOCUMENTS/deprecated.md', file_name: 'deprecated.md', sha256: sha(texts['deprecated.md']), bytes: texts['deprecated.md'].length, status: 'deprecated', provenance_mode: 'native' }] : [])
    ]
  };
  const manifestBytes = jsonBytes(manifest);
  const policy = {
    schema_version: 'rus.knowledge_retrieval_policy.v1', policy_version: '1.0.0', baseline_manifest_sha256: sha(manifestBytes), default_statuses: ['active'],
    documents: [
      { document_id: 'active', document_type: 'architecture', priority_tier: 'highest_materialization_normative', subsystems: ['materialization'], related_document_ids: [], related_module_paths: ['packages/materialization'], related_contracts: [], search_terms: ['approved profiles', 'materializes instances'], conflicts_with_document_ids: activeConflicts, semantic_coverage_disposition: 'covered' },
      { document_id: 'proposed', document_type: 'proposal', priority_tier: 'profile_normative', subsystems: ['perception'], related_document_ids: ['active'], related_module_paths: ['packages/perception'], related_contracts: [], search_terms: ['future perception'], conflicts_with_document_ids: [], semantic_coverage_disposition: proposedCoverage },
      ...(includeDeprecated ? [{ document_id: 'deprecated', document_type: 'reference', priority_tier: 'reference', subsystems: ['history'], related_document_ids: ['active'], related_module_paths: ['packages/history'], related_contracts: [], search_terms: ['historic reference'], conflicts_with_document_ids: [], semantic_coverage_disposition: deprecatedCoverage }] : [])
    ],
    control_queries: [{ query_id: 'materialization-owner', query: 'approved profiles materializes instances', expected_document_ids: controlExpected, top_k: 3 }]
  };
  const semantic = { schema_version: 'rus.rag_index.v1', dimensions: 2, chunks: [{ id: 'active:0', file: 'active.md', section: 'Active', line_start: 1, line_end: 3, text: '# Active\nCode materializes instances from approved profiles.', char_count: 60, embedding: [1, 0] }] };
  const lexical = { schema_version: 'rus.lexical_index.v1', chunks: [
    { id: 'proposed:0', file: 'proposed.md', section: 'Proposed', line_start: 1, line_end: 3, text: '# Proposed\nFuture perception engine proposal.', char_count: 45 },
    ...(includeDeprecated ? [{ id: 'deprecated:0', file: 'deprecated.md', section: 'Deprecated', line_start: 1, line_end: 3, text: '# Deprecated\nHistoric reference vocabulary.', char_count: 42 }] : [])
  ] };
  const semanticBytes = jsonBytes(semantic);
  const lexicalBytes = jsonBytes(lexical);
  const ragManifest = {
    schema_version: 'rus.knowledge_rag_manifest.v1',
    corpus_manifest_sha256: staleRagCorpusPin ? '0'.repeat(64) : sha(manifestBytes),
    semantic_index_sha256: sha(semanticBytes), lexical_index_sha256: sha(lexicalBytes),
    coverage: [
      { document_id: 'active', file_name: 'active.md', semantic_indexed: true, lexical_indexed: false },
      { document_id: 'proposed', file_name: 'proposed.md', semantic_indexed: false, lexical_indexed: true },
      ...(includeDeprecated ? [{ document_id: 'deprecated', file_name: 'deprecated.md', semantic_indexed: false, lexical_indexed: true }] : [])
    ]
  };
  const wrap = (value) => ({ value, bytes: jsonBytes(value) });
  const storage = {
    readCorpusManifest: async () => ({ value: manifest, bytes: manifestBytes }),
    readAliases: async () => wrap({ schema_version: 'rus.knowledge_source_aliases.v1', aliases: {} }),
    readRetrievalPolicy: async () => wrap(policy),
    readDocument: async (canonicalPath) => {
      const record = manifest.documents.find((item) => item.canonical_path === canonicalPath);
      if (!record) throw new Error(`Unknown document: ${canonicalPath}`);
      const bytes = texts[record.file_name];
      return { bytes, sha256: sha(bytes) };
    },
    readGeneratedManifest: async () => wrap(ragManifest),
    readGeneratedArtifact: async (kind, name) => name === 'index.json' ? { bytes: semanticBytes, sha256: sha(semanticBytes) } : { bytes: lexicalBytes, sha256: sha(lexicalBytes) }
  };
  return { storage, manifest, policy };
}

test('ranked RAG search defaults to active documents and returns source metadata', async () => {
  const reader = createKnowledgeRagReader({ storage: makeFixture().storage, allowedStatuses: ['active', 'proposed'] });
  const result = await reader.searchKnowledge({ query: 'approved profiles' });
  assert.deepEqual(result.requested_statuses, ['active']);
  assert.equal(result.results[0].document_id, 'active');
  assert.equal(result.results[0].status, 'active');
  assert.equal(result.results[0].semantic_indexed, true);
  assert.equal(result.results[0].priority_tier, 'highest_materialization_normative');
  assert.equal(Object.isFrozen(result), true);
});

test('proposed documents require an explicit status request and remain labelled', async () => {
  const reader = createKnowledgeRagReader({ storage: makeFixture().storage, allowedStatuses: ['active', 'proposed'] });
  assert.equal((await reader.searchKnowledge({ query: 'future perception' })).results.length, 0);
  const visible = await reader.searchKnowledge({ query: 'future perception', statuses: ['proposed'] });
  assert.equal(visible.results[0].document_id, 'proposed');
  assert.equal(visible.results[0].status, 'proposed');
  assert.equal(visible.results[0].semantic_coverage_gap, 'baseline_gap');
});

test('deprecated documents are lexical-only and require an explicit status request', async () => {
  const reader = createKnowledgeRagReader({ storage: makeFixture({ includeDeprecated: true }).storage, allowedStatuses: ['active', 'deprecated'] });
  assert.equal((await reader.searchKnowledge({ query: 'historic reference' })).results.length, 0);
  const visible = await reader.searchKnowledge({ query: 'historic reference', statuses: ['deprecated'] });
  assert.equal(visible.results[0].document_id, 'deprecated');
  assert.equal(visible.results[0].semantic_indexed, false);
});

test('RAG retrieval rejects semantic coverage for a proposed document even when policy coverage is subverted', async () => {
  const { storage } = makeFixture({ proposedCoverage: 'covered' });
  const readGeneratedManifest = storage.readGeneratedManifest;
  storage.readGeneratedManifest = async () => {
    const raw = await readGeneratedManifest();
    const value = structuredClone(raw.value);
    value.coverage.find((item) => item.document_id === 'proposed').semantic_indexed = true;
    value.coverage.find((item) => item.document_id === 'proposed').lexical_indexed = false;
    return { value, bytes: jsonBytes(value) };
  };
  await assert.rejects(() => createKnowledgeRagReader({ storage, allowedStatuses: ['active', 'proposed'] }).searchKnowledge({ query: 'future perception', statuses: ['proposed'] }), (error) => error.code === 'GENERATED_PROVENANCE_INVALID');
});

test('RAG retrieval rejects semantic coverage for a deprecated document even when policy coverage is subverted', async () => {
  const { storage } = makeFixture({ includeDeprecated: true, deprecatedCoverage: 'covered' });
  const readGeneratedManifest = storage.readGeneratedManifest;
  storage.readGeneratedManifest = async () => {
    const raw = await readGeneratedManifest();
    const value = structuredClone(raw.value);
    value.coverage.find((item) => item.document_id === 'deprecated').semantic_indexed = true;
    value.coverage.find((item) => item.document_id === 'deprecated').lexical_indexed = false;
    return { value, bytes: jsonBytes(value) };
  };
  await assert.rejects(() => createKnowledgeRagReader({ storage, allowedStatuses: ['active', 'deprecated'] }).searchKnowledge({ query: 'historic reference', statuses: ['deprecated'] }), (error) => error.code === 'GENERATED_PROVENANCE_INVALID');
});

test('RAG retrieval rejects a semantic chunk for a proposed document', async () => {
  const { storage } = makeFixture();
  const readGeneratedArtifact = storage.readGeneratedArtifact;
  const injectedSemantic = jsonBytes({ schema_version: 'rus.rag_index.v1', dimensions: 2, chunks: [
    { id: 'active:0', file: 'active.md', section: 'Active', line_start: 1, line_end: 3, text: '# Active\nCode materializes instances from approved profiles.', char_count: 60, embedding: [1, 0] },
    { id: 'proposed:injected', file: 'proposed.md', section: 'Proposed', line_start: 1, line_end: 3, text: '# Proposed\nFuture perception engine proposal.', char_count: 45, embedding: [0, 1] }
  ] });
  storage.readGeneratedArtifact = async (kind, name) => name === 'index.json'
    ? { bytes: injectedSemantic, sha256: sha(injectedSemantic) }
    : readGeneratedArtifact(kind, name);
  const readGeneratedManifest = storage.readGeneratedManifest;
  storage.readGeneratedManifest = async () => {
    const raw = await readGeneratedManifest();
    const value = structuredClone(raw.value);
    value.semantic_index_sha256 = sha(injectedSemantic);
    return { value, bytes: jsonBytes(value) };
  };
  await assert.rejects(() => createKnowledgeRagReader({ storage, allowedStatuses: ['active', 'proposed'] }).searchKnowledge({ query: 'future perception', statuses: ['proposed'] }), (error) => error.code === 'GENERATED_PROVENANCE_INVALID');
});

test('RAG retrieval rejects proposed and deprecated lexical coverage without lexical chunks', async () => {
  const { storage } = makeFixture({ includeDeprecated: true });
  const readGeneratedArtifact = storage.readGeneratedArtifact;
  const emptyLexical = jsonBytes({ schema_version: 'rus.lexical_index.v1', chunks: [] });
  storage.readGeneratedArtifact = async (kind, name) => name === 'lexical-index.json'
    ? { bytes: emptyLexical, sha256: sha(emptyLexical) }
    : readGeneratedArtifact(kind, name);
  const readGeneratedManifest = storage.readGeneratedManifest;
  storage.readGeneratedManifest = async () => {
    const raw = await readGeneratedManifest();
    const value = structuredClone(raw.value);
    value.lexical_index_sha256 = sha(emptyLexical);
    return { value, bytes: jsonBytes(value) };
  };
  await assert.rejects(() => createKnowledgeRagReader({ storage, allowedStatuses: ['active', 'proposed', 'deprecated'] }).searchKnowledge({ query: 'future perception', statuses: ['proposed'] }), (error) => error.code === 'GENERATED_PROVENANCE_INVALID');
});

test('RAG retrieval rejects semantic coverage without a semantic chunk', async () => {
  const { storage } = makeFixture();
  const readGeneratedArtifact = storage.readGeneratedArtifact;
  const emptySemantic = jsonBytes({ schema_version: 'rus.rag_index.v1', dimensions: 2, chunks: [] });
  storage.readGeneratedArtifact = async (kind, name) => name === 'index.json'
    ? { bytes: emptySemantic, sha256: sha(emptySemantic) }
    : readGeneratedArtifact(kind, name);
  const readGeneratedManifest = storage.readGeneratedManifest;
  storage.readGeneratedManifest = async () => {
    const raw = await readGeneratedManifest();
    const value = structuredClone(raw.value);
    value.semantic_index_sha256 = sha(emptySemantic);
    return { value, bytes: jsonBytes(value) };
  };
  await assert.rejects(() => createKnowledgeRagReader({ storage }).searchKnowledge({ query: 'approved profiles' }), (error) => error.code === 'GENERATED_PROVENANCE_INVALID');
});

test('RAG retrieval hard-blocks when policy and generated RAG are not pinned to the same corpus', async () => {
  const reader = createKnowledgeRagReader({ storage: makeFixture({ staleRagCorpusPin: true }).storage });
  await assert.rejects(() => reader.searchKnowledge({ query: 'approved profiles' }), (error) => error.code === 'GENERATED_INDEX_STALE');
});

test('RAG retrieval hard-blocks when a canonical document digest differs from the manifest', async () => {
  const { storage } = makeFixture();
  const readDocument = storage.readDocument;
  storage.readDocument = async (canonicalPath) => canonicalPath.endsWith('active.md')
    ? { bytes: Buffer.from('# Active\nTampered canonical source.'), sha256: sha(Buffer.from('# Active\nTampered canonical source.')) }
    : readDocument(canonicalPath);
  const reader = createKnowledgeRagReader({ storage });
  await assert.rejects(() => reader.searchKnowledge({ query: 'approved profiles' }), (error) => error.code === 'DOCUMENT_HASH_MISMATCH');
});

test('RAG retrieval hard-blocks when a proposed canonical document changes without regeneration', async () => {
  const { storage } = makeFixture();
  const readDocument = storage.readDocument;
  storage.readDocument = async (canonicalPath) => canonicalPath.endsWith('proposed.md')
    ? (() => {
      const bytes = Buffer.from('# Proposed\n\nChanged without regenerating the lexical index.');
      return { bytes, sha256: sha(bytes) };
    })()
    : readDocument(canonicalPath);
  const reader = createKnowledgeRagReader({ storage, allowedStatuses: ['active', 'proposed'] });
  await assert.rejects(() => reader.searchKnowledge({ query: 'future perception', statuses: ['proposed'] }), (error) => error.code === 'DOCUMENT_HASH_MISMATCH');
});

test('RAG retrieval hard-blocks when generated coverage omits a registered proposed document', async () => {
  const { storage } = makeFixture();
  const readGeneratedManifest = storage.readGeneratedManifest;
  storage.readGeneratedManifest = async () => {
    const raw = await readGeneratedManifest();
    const value = structuredClone(raw.value);
    value.coverage = value.coverage.filter((item) => item.document_id !== 'proposed');
    return { value, bytes: jsonBytes(value) };
  };
  const reader = createKnowledgeRagReader({ storage, allowedStatuses: ['active', 'proposed'] });
  await assert.rejects(() => reader.searchKnowledge({ query: 'future perception', statuses: ['proposed'] }), (error) => error.code === 'GENERATED_PROVENANCE_INVALID');
});

test('RAG retrieval hard-blocks when generated coverage duplicates a registered document', async () => {
  const { storage } = makeFixture();
  const readGeneratedManifest = storage.readGeneratedManifest;
  storage.readGeneratedManifest = async () => {
    const raw = await readGeneratedManifest();
    const value = structuredClone(raw.value);
    value.coverage.push(structuredClone(value.coverage[1]));
    return { value, bytes: jsonBytes(value) };
  };
  const reader = createKnowledgeRagReader({ storage, allowedStatuses: ['active', 'proposed'] });
  await assert.rejects(() => reader.searchKnowledge({ query: 'future perception', statuses: ['proposed'] }), (error) => error.code === 'GENERATED_PROVENANCE_INVALID');
});

test('RAG retrieval rejects a generated chunk with an invalid source location', async () => {
  const { storage } = makeFixture();
  const readGeneratedArtifact = storage.readGeneratedArtifact;
  storage.readGeneratedArtifact = async (kind, name) => {
    if (name !== 'index.json') return readGeneratedArtifact(kind, name);
    const invalid = jsonBytes({ schema_version: 'rus.rag_index.v1', dimensions: 2, chunks: [{ id: 'active:bad', file: 'active.md', section: 'Active', line_start: 1, line_end: 99, text: 'invalid', char_count: 7, embedding: [1, 0] }] });
    return { bytes: invalid, sha256: sha(invalid) };
  };
  const ragManifest = await storage.readGeneratedManifest('rag');
  ragManifest.value.semantic_index_sha256 = sha((await storage.readGeneratedArtifact('rag', 'index.json')).bytes);
  ragManifest.bytes = jsonBytes(ragManifest.value);
  const reader = createKnowledgeRagReader({ storage });
  await assert.rejects(() => reader.searchKnowledge({ query: 'approved profiles' }), (error) => error.code === 'GENERATED_PROVENANCE_INVALID');
});

test('RAG conflict reporting preserves full provenance across status isolation', async () => {
  const reader = createKnowledgeRagReader({ storage: makeFixture({ activeConflicts: ['proposed'] }).storage });
  const result = await reader.searchKnowledge({ query: 'approved profiles' });
  assert.deepEqual(result.requested_statuses, ['active']);
  assert.deepEqual(result.results.map((item) => item.document_id), ['active']);
  assert.deepEqual(result.conflicts, [{
    document_id: 'proposed',
    canonical_path: 'corpus/DOCUMENTS/proposed.md',
    status: 'proposed',
    source_sha256: result.conflicts[0].source_sha256,
    start_line: 1,
    end_line: 3,
    priority_tier: 'profile_normative',
    semantic_coverage_disposition: 'baseline_gap'
  }]);
});

test('control queries verify authoritative document presence in top-k', async () => {
  const report = await createKnowledgeRagReader({ storage: makeFixture().storage }).runControlQueries();
  assert.equal(report.ok, true);
  assert.deepEqual(report.checks[0].matched_document_ids, ['active']);
});

test('control-query failure is returned as a failed report', async () => {
  const report = await createKnowledgeRagReader({ storage: makeFixture({ controlExpected: ['proposed'] }).storage }).runControlQueries();
  assert.equal(report.ok, false);
  assert.equal(report.checks[0].ok, false);
});

test('readiness reports acknowledged semantic gaps without claiming coverage', async () => {
  const status = await createKnowledgeRagReader({ storage: makeFixture().storage, allowedStatuses: ['active', 'proposed'] }).getReadinessStatus();
  assert.equal(status.status, 'degraded');
  assert.deepEqual(status.semantic_coverage_gap_document_ids, ['proposed']);
  assert.deepEqual(status.semantic_coverage_blocker_document_ids, []);
});

test('required_before_merge semantic coverage blocks readiness', async () => {
  const status = await createKnowledgeRagReader({ storage: makeFixture({ proposedCoverage: 'required_before_merge' }).storage, allowedStatuses: ['active', 'proposed'] }).getReadinessStatus();
  assert.equal(status.status, 'blocked');
  assert.deepEqual(status.semantic_coverage_blocker_document_ids, ['proposed']);
});

test('ranked retrieval resolves equal scores deterministically by document id and chunk id', () => {
  const documentsByFile = new Map([
    ['b.md', { document_id: 'b', file_name: 'b.md' }],
    ['a.md', { document_id: 'a', file_name: 'a.md' }]
  ]);
  const metadataById = new Map([
    ['a', { priority_tier: 'reference', search_terms: [], subsystems: [] }],
    ['b', { priority_tier: 'reference', search_terms: [], subsystems: [] }]
  ]);
  const chunks = [
    { id: 'b:1', file: 'b.md', section: '', text: 'token' },
    { id: 'a:2', file: 'a.md', section: '', text: 'token' },
    { id: 'a:1', file: 'a.md', section: '', text: 'token' }
  ];
  assert.deepEqual(rankKnowledgeChunks({ query: 'token', chunks, documentsByFile, metadataById }).map((item) => item.chunk.id), ['a:1', 'a:2', 'b:1']);
});

test('retrieval policy rejects missing document metadata', () => {
  const { manifest, policy } = makeFixture();
  const incomplete = structuredClone(policy);
  incomplete.documents.pop();
  assert.throws(() => validateRetrievalPolicy(incomplete, manifest), (error) => error.code === 'RETRIEVAL_POLICY_INCOMPLETE');
});
