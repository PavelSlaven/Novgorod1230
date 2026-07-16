import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createKnowledgeRagReader } from '../src/services/rag-reader.js';
import { validateRetrievalPolicy } from '../src/domain/retrieval-policy.js';

function sha(value) {
  return createHash('sha256').update(value).digest('hex');
}

function jsonBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
}

function makeFixture({ staleRagCorpusPin = false } = {}) {
  const texts = {
    'active.md': Buffer.from('# Active\n\nCode materializes instances from approved profiles.'),
    'proposed.md': Buffer.from('# Proposed\n\nFuture perception engine proposal.')
  };
  const manifest = {
    schema_version: 'rus.knowledge_corpus_manifest.v2', corpus_id: 'test', release: 'test',
    documents: [
      { document_id: 'active', canonical_path: 'corpus/DOCUMENTS/active.md', file_name: 'active.md', sha256: sha(texts['active.md']), bytes: texts['active.md'].length, status: 'active', provenance_mode: 'native' },
      { document_id: 'proposed', canonical_path: 'corpus/DOCUMENTS/proposed.md', file_name: 'proposed.md', sha256: sha(texts['proposed.md']), bytes: texts['proposed.md'].length, status: 'proposed', provenance_mode: 'native' }
    ]
  };
  const manifestBytes = jsonBytes(manifest);
  const policy = {
    schema_version: 'rus.knowledge_retrieval_policy.v1', policy_version: '1.0.0', baseline_manifest_sha256: sha(manifestBytes), default_statuses: ['active'],
    documents: [
      { document_id: 'active', document_type: 'architecture', priority_tier: 'highest_materialization_normative', subsystems: ['materialization'], related_document_ids: [], related_module_paths: ['packages/materialization'], related_contracts: [], search_terms: ['approved profiles', 'materializes instances'], conflicts_with_document_ids: [], semantic_coverage_disposition: 'covered' },
      { document_id: 'proposed', document_type: 'proposal', priority_tier: 'profile_normative', subsystems: ['perception'], related_document_ids: ['active'], related_module_paths: ['packages/perception'], related_contracts: [], search_terms: ['future perception'], conflicts_with_document_ids: [], semantic_coverage_disposition: 'baseline_gap' }
    ],
    control_queries: [{ query_id: 'materialization-owner', query: 'approved profiles materializes instances', expected_document_ids: ['active'], top_k: 3 }]
  };
  const semantic = { schema_version: 'rus.rag_index.v1', dimensions: 2, chunks: [{ id: 'active:0', file: 'active.md', section: 'Active', line_start: 1, line_end: 3, text: '# Active\nCode materializes instances from approved profiles.', char_count: 60, embedding: [1, 0] }] };
  const lexical = { schema_version: 'rus.lexical_index.v1', chunks: [{ id: 'proposed:0', file: 'proposed.md', section: 'Proposed', line_start: 1, line_end: 3, text: '# Proposed\nFuture perception engine proposal.', char_count: 45 }] };
  const semanticBytes = jsonBytes(semantic);
  const lexicalBytes = jsonBytes(lexical);
  const ragManifest = {
    schema_version: 'rus.knowledge_rag_manifest.v1',
    corpus_manifest_sha256: staleRagCorpusPin ? '0'.repeat(64) : sha(manifestBytes),
    semantic_index_sha256: sha(semanticBytes), lexical_index_sha256: sha(lexicalBytes),
    coverage: [
      { document_id: 'active', file_name: 'active.md', semantic_indexed: true, lexical_indexed: false },
      { document_id: 'proposed', file_name: 'proposed.md', semantic_indexed: false, lexical_indexed: true }
    ]
  };
  const wrap = (value) => ({ value, bytes: jsonBytes(value) });
  const storage = {
    readCorpusManifest: async () => ({ value: manifest, bytes: manifestBytes }),
    readAliases: async () => wrap({ schema_version: 'rus.knowledge_source_aliases.v1', aliases: {} }),
    readRetrievalPolicy: async () => wrap(policy),
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

test('RAG retrieval hard-blocks when policy and generated RAG are not pinned to the same corpus', async () => {
  const reader = createKnowledgeRagReader({ storage: makeFixture({ staleRagCorpusPin: true }).storage });
  await assert.rejects(() => reader.searchKnowledge({ query: 'approved profiles' }), (error) => error.code === 'GENERATED_INDEX_STALE');
});

test('control queries verify authoritative document presence in top-k', async () => {
  const report = await createKnowledgeRagReader({ storage: makeFixture().storage }).runControlQueries();
  assert.equal(report.ok, true);
  assert.deepEqual(report.checks[0].matched_document_ids, ['active']);
});

test('readiness reports acknowledged semantic gaps without claiming coverage', async () => {
  const status = await createKnowledgeRagReader({ storage: makeFixture().storage, allowedStatuses: ['active', 'proposed'] }).getReadinessStatus();
  assert.equal(status.status, 'degraded');
  assert.deepEqual(status.semantic_coverage_gap_document_ids, ['proposed']);
  assert.deepEqual(status.semantic_coverage_blocker_document_ids, []);
});

test('retrieval policy rejects missing document metadata', () => {
  const { manifest, policy } = makeFixture();
  const incomplete = structuredClone(policy);
  incomplete.documents.pop();
  assert.throws(() => validateRetrievalPolicy(incomplete, manifest), (error) => error.code === 'RETRIEVAL_POLICY_INCOMPLETE');
});
