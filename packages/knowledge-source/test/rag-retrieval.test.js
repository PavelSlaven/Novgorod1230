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

function makeFixture({ staleRagCorpusPin = false, activeConflicts = [], controlExpected = ['active'], includeDeprecated = false, includeReference = false, defaultStatuses = ['active', 'reference'], proposedTier = 'proposed' } = {}) {
  const texts = {
    'active.md': Buffer.from('# Active\n\nCode materializes instances from approved profiles.'),
    'proposed.md': Buffer.from('# Proposed\n\nFuture perception engine proposal.'),
    'deprecated.md': Buffer.from('# Deprecated\n\nHistoric reference vocabulary.'),
    'reference.md': Buffer.from('# Reference guide\n\nShared topic phrase materializes instances from approved profiles.')
  };
  const manifest = {
    schema_version: 'rus.knowledge_corpus_manifest.v2', corpus_id: 'test', release: 'test',
    documents: [
      { document_id: 'active', canonical_path: 'corpus/DOCUMENTS/active.md', file_name: 'active.md', sha256: sha(texts['active.md']), bytes: texts['active.md'].length, status: 'active', priority_tier: 'highest_materialization_normative', provenance_mode: 'native' },
      { document_id: 'proposed', canonical_path: 'corpus/DOCUMENTS/proposed.md', file_name: 'proposed.md', sha256: sha(texts['proposed.md']), bytes: texts['proposed.md'].length, status: 'proposed', priority_tier: proposedTier, provenance_mode: 'native' },
      ...(includeReference ? [{ document_id: 'reference', canonical_path: 'corpus/DOCUMENTS/reference.md', file_name: 'reference.md', sha256: sha(texts['reference.md']), bytes: texts['reference.md'].length, status: 'reference', priority_tier: 'reference', provenance_mode: 'native' }] : []),
      ...(includeDeprecated ? [{ document_id: 'deprecated', canonical_path: 'corpus/DOCUMENTS/deprecated.md', file_name: 'deprecated.md', sha256: sha(texts['deprecated.md']), bytes: texts['deprecated.md'].length, status: 'deprecated', priority_tier: 'reference', provenance_mode: 'native' }] : [])
    ]
  };
  const manifestBytes = jsonBytes(manifest);
  const policy = {
    schema_version: 'rus.knowledge_retrieval_policy.v1', policy_version: '1.0.0', baseline_manifest_sha256: sha(manifestBytes), default_statuses: defaultStatuses,
    documents: [
      { document_id: 'active', document_type: 'architecture', subsystems: ['materialization'], related_document_ids: [], related_module_paths: ['packages/materialization'], related_contracts: [], search_terms: ['approved profiles', 'materializes instances'], conflicts_with_document_ids: activeConflicts },
      { document_id: 'proposed', document_type: 'proposal', subsystems: ['perception'], related_document_ids: ['active'], related_module_paths: ['packages/perception'], related_contracts: [], search_terms: ['future perception'], conflicts_with_document_ids: [] },
      ...(includeReference ? [{ document_id: 'reference', document_type: 'reference', subsystems: ['history'], related_document_ids: ['active'], related_module_paths: ['packages/history'], related_contracts: [], search_terms: ['approved profiles', 'materializes instances'], conflicts_with_document_ids: [] }] : []),
      ...(includeDeprecated ? [{ document_id: 'deprecated', document_type: 'reference', subsystems: ['history'], related_document_ids: ['active'], related_module_paths: ['packages/history'], related_contracts: [], search_terms: ['historic reference'], conflicts_with_document_ids: [] }] : [])
    ],
    control_queries: [{ query_id: 'materialization-owner', query: 'approved profiles materializes instances', expected_document_ids: controlExpected, top_k: 3 }]
  };
  const lexical = { schema_version: 'rus.lexical_index.v1', chunks: [
    { id: 'active:0', file: 'active.md', section: 'Active', line_start: 1, line_end: 3, text: '# Active\nCode materializes instances from approved profiles.', char_count: 60 },
    { id: 'proposed:0', file: 'proposed.md', section: 'Proposed', line_start: 1, line_end: 3, text: '# Proposed\nFuture perception engine proposal.', char_count: 45 },
    ...(includeReference ? [{ id: 'reference:0', file: 'reference.md', section: 'Reference guide', line_start: 1, line_end: 3, text: '# Reference guide\nShared topic phrase materializes instances from approved profiles.', char_count: 84 }] : []),
    ...(includeDeprecated ? [{ id: 'deprecated:0', file: 'deprecated.md', section: 'Deprecated', line_start: 1, line_end: 3, text: '# Deprecated\nHistoric reference vocabulary.', char_count: 42 }] : [])
  ] };
  const lexicalBytes = jsonBytes(lexical);
  const ragManifest = {
    schema_version: 'rus.knowledge_rag_manifest.v1',
    corpus_manifest_sha256: staleRagCorpusPin ? '0'.repeat(64) : sha(manifestBytes),
    lexical_index_sha256: sha(lexicalBytes),
    coverage: [
      { document_id: 'active', file_name: 'active.md', lexical_indexed: true },
      { document_id: 'proposed', file_name: 'proposed.md', lexical_indexed: true },
      ...(includeReference ? [{ document_id: 'reference', file_name: 'reference.md', lexical_indexed: true }] : []),
      ...(includeDeprecated ? [{ document_id: 'deprecated', file_name: 'deprecated.md', lexical_indexed: true }] : [])
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
    readGeneratedArtifact: async (_kind, name) => {
      if (name !== 'lexical-index.json') throw new Error(`Unexpected artifact ${name}`);
      return { bytes: lexicalBytes, sha256: sha(lexicalBytes) };
    }
  };
  return { storage, manifest, policy };
}

test('ranked RAG search defaults to active documents and returns source metadata', async () => {
  const reader = createKnowledgeRagReader({ storage: makeFixture({ defaultStatuses: ['active'] }).storage, allowedStatuses: ['active', 'proposed'] });
  const result = await reader.searchKnowledge({ query: 'approved profiles' });
  assert.deepEqual(result.requested_statuses, ['active']);
  assert.equal(result.results[0].document_id, 'active');
  assert.equal(result.results[0].status, 'active');
  assert.equal(Object.hasOwn(result.results[0], 'semantic_indexed'), false);
  assert.equal(Object.hasOwn(result.results[0], 'semantic_coverage_gap'), false);
  assert.equal(result.results[0].priority_tier, 'highest_materialization_normative');
  assert.equal(result.rag_status, 'ready');
  assert.deepEqual(result.reference_results, []);
  assert.equal(Object.isFrozen(result), true);
});

test('proposed documents require an explicit status request and remain labelled', async () => {
  const reader = createKnowledgeRagReader({ storage: makeFixture({ defaultStatuses: ['active'] }).storage, allowedStatuses: ['active', 'proposed'] });
  assert.equal((await reader.searchKnowledge({ query: 'future perception' })).results.length, 0);
  const visible = await reader.searchKnowledge({ query: 'future perception', statuses: ['proposed'] });
  assert.equal(visible.results[0].document_id, 'proposed');
  assert.equal(visible.results[0].status, 'proposed');
  assert.equal(Object.hasOwn(visible.results[0], 'semantic_coverage_gap'), false);
});

test('proposed ranks below active on equal topical match', async () => {
  const reader = createKnowledgeRagReader({
    storage: makeFixture({ defaultStatuses: ['active', 'proposed'] }).storage,
    allowedStatuses: ['active', 'proposed']
  });
  const result = await reader.searchKnowledge({ query: 'approved profiles materializes instances', statuses: ['active', 'proposed'], limit: 5 });
  assert.equal(result.results[0].document_id, 'active');
});

test('deprecated documents are lexical and require an explicit status request', async () => {
  const reader = createKnowledgeRagReader({ storage: makeFixture({ includeDeprecated: true, defaultStatuses: ['active'] }).storage, allowedStatuses: ['active', 'deprecated'] });
  assert.equal((await reader.searchKnowledge({ query: 'historic reference' })).results.length, 0);
  const visible = await reader.searchKnowledge({ query: 'historic reference', statuses: ['deprecated'] });
  assert.equal(visible.results[0].document_id, 'deprecated');
});

test('unseen-equivalent: reference lands in reference_results; deprecated redirect stays out', async () => {
  const reader = createKnowledgeRagReader({
    storage: makeFixture({
      includeReference: true,
      includeDeprecated: true,
      defaultStatuses: ['active', 'reference']
    }).storage
  });
  const result = await reader.searchKnowledge({ query: 'materializes instances from approved profiles', limit: 5 });
  assert.deepEqual([...result.requested_statuses].sort(), ['active', 'reference']);
  assert.ok(result.results.every((item) => item.status === 'active'));
  assert.ok(result.reference_results.some((item) => item.document_id === 'reference'));
  assert.ok(result.reference_results.every((item) => item.status === 'reference'));
  assert.ok(!result.results.some((item) => item.document_id === 'deprecated'));
  assert.ok(!result.reference_results.some((item) => item.document_id === 'deprecated'));
});

test('retrieval policy rejects priority_tier copies', () => {
  const { manifest, policy } = makeFixture();
  const invalid = structuredClone(policy);
  invalid.documents[0].priority_tier = 'highest_materialization_normative';
  assert.throws(() => validateRetrievalPolicy(invalid, manifest), (error) => error.code === 'RETRIEVAL_POLICY_INVALID');
});

test('RAG retrieval rejects semantic coverage markers in generated coverage', async () => {
  const { storage } = makeFixture({ defaultStatuses: ['active'] });
  const readGeneratedManifest = storage.readGeneratedManifest;
  storage.readGeneratedManifest = async () => {
    const raw = await readGeneratedManifest();
    const value = structuredClone(raw.value);
    value.coverage.find((item) => item.document_id === 'active').semantic_indexed = true;
    return { value, bytes: jsonBytes(value) };
  };
  await assert.rejects(() => createKnowledgeRagReader({ storage }).searchKnowledge({ query: 'approved profiles' }), (error) => error.code === 'GENERATED_PROVENANCE_INVALID');
});

test('RAG retrieval rejects lexical coverage without lexical chunks', async () => {
  const { storage } = makeFixture({ includeDeprecated: true });
  const emptyLexical = jsonBytes({ schema_version: 'rus.lexical_index.v1', chunks: [] });
  storage.readGeneratedArtifact = async () => ({ bytes: emptyLexical, sha256: sha(emptyLexical) });
  const readGeneratedManifest = storage.readGeneratedManifest;
  storage.readGeneratedManifest = async () => {
    const raw = await readGeneratedManifest();
    const value = structuredClone(raw.value);
    value.lexical_index_sha256 = sha(emptyLexical);
    return { value, bytes: jsonBytes(value) };
  };
  await assert.rejects(() => createKnowledgeRagReader({ storage, allowedStatuses: ['active', 'proposed', 'deprecated'] }).searchKnowledge({ query: 'future perception', statuses: ['proposed'] }), (error) => error.code === 'GENERATED_PROVENANCE_INVALID');
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
  const invalid = jsonBytes({ schema_version: 'rus.lexical_index.v1', chunks: [{ id: 'active:bad', file: 'active.md', section: 'Active', line_start: 1, line_end: 99, text: 'invalid', char_count: 7 }] });
  storage.readGeneratedArtifact = async () => ({ bytes: invalid, sha256: sha(invalid) });
  const readGeneratedManifest = storage.readGeneratedManifest;
  storage.readGeneratedManifest = async () => {
    const raw = await readGeneratedManifest();
    const value = structuredClone(raw.value);
    value.lexical_index_sha256 = sha(invalid);
    return { value, bytes: jsonBytes(value) };
  };
  const reader = createKnowledgeRagReader({ storage });
  await assert.rejects(() => reader.searchKnowledge({ query: 'approved profiles' }), (error) => error.code === 'GENERATED_PROVENANCE_INVALID');
});

test('RAG conflict reporting preserves provenance across status isolation', async () => {
  const reader = createKnowledgeRagReader({ storage: makeFixture({ activeConflicts: ['proposed'], defaultStatuses: ['active'] }).storage });
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
    priority_tier: 'proposed'
  }]);
});

test('control queries verify authoritative document presence in top-k', async () => {
  const report = await createKnowledgeRagReader({ storage: makeFixture({ defaultStatuses: ['active'] }).storage }).runControlQueries();
  assert.equal(report.ok, true);
  assert.deepEqual(report.checks[0].matched_document_ids, ['active']);
});

test('control-query failure is returned as a failed report', async () => {
  const report = await createKnowledgeRagReader({ storage: makeFixture({ controlExpected: ['proposed'], defaultStatuses: ['active'] }).storage }).runControlQueries();
  assert.equal(report.ok, false);
  assert.equal(report.checks[0].ok, false);
});

test('readiness is ready for lexical-only coverage', async () => {
  const status = await createKnowledgeRagReader({ storage: makeFixture({ defaultStatuses: ['active'] }).storage, allowedStatuses: ['active', 'proposed'] }).getReadinessStatus();
  assert.equal(status.status, 'ready');
  assert.equal(Object.hasOwn(status, 'semantic_coverage_gap_document_ids'), false);
  assert.equal(Object.hasOwn(status, 'semantic_coverage_blocker_document_ids'), false);
});

test('ranked retrieval resolves equal scores deterministically by document id and chunk id', () => {
  const documentsByFile = new Map([
    ['b.md', { document_id: 'b', file_name: 'b.md', status: 'reference', priority_tier: 'reference' }],
    ['a.md', { document_id: 'a', file_name: 'a.md', status: 'reference', priority_tier: 'reference' }]
  ]);
  const metadataById = new Map([
    ['a', { search_terms: [], subsystems: [] }],
    ['b', { search_terms: [], subsystems: [] }]
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

test('retrieval policy rejects semantic_coverage_disposition', () => {
  const { manifest, policy } = makeFixture();
  const invalid = structuredClone(policy);
  invalid.documents[0].semantic_coverage_disposition = 'baseline_gap';
  assert.throws(() => validateRetrievalPolicy(invalid, manifest), (error) => error.code === 'RETRIEVAL_POLICY_INVALID');
});
