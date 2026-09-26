import test from 'node:test';
import assert from 'node:assert/strict';
import { createKnowledgeRagReader } from '../src/services/rag-reader.js';
import { makeFixture, jsonBytes, sha } from './rag-retrieval-fixture.js';

test('reference_results stay filled when norm fragments exceed the shared ceiling', async () => {
  const reader = createKnowledgeRagReader({
    storage: makeFixture({
      includeReference: true,
      defaultStatuses: ['active', 'reference'],
      extraActiveChunks: 120
    }).storage
  });
  const crowded = await reader.searchKnowledge({ query: 'materializes instances', limit: 8 });
  assert.equal(crowded.results.length, 8);
  assert.ok(crowded.results.every((item) => item.status === 'active'));
  assert.ok(crowded.reference_results.some((item) => item.document_id === 'reference'));

  const npc = await reader.searchKnowledge({ query: 'NPC generation', limit: 8 });
  assert.ok(npc.reference_results.some((item) => item.document_id === 'reference'));
});

test('reference_results dedupe before slice so a large document cannot crowd out others', async () => {
  const strongPhrase = 'shared topical phrase materializes instances from approved profiles';
  const weakPhrase = 'shared topical phrase';
  const texts = {
    'big.md': Buffer.from(`# Big\n\n${strongPhrase}`),
    'small.md': Buffer.from(`# Small\n\n${weakPhrase}`),
    'third.md': Buffer.from(`# Third\n\n${weakPhrase} third guide`)
  };
  const manifest = {
    schema_version: 'rus.knowledge_corpus_manifest.v2', corpus_id: 'test', release: 'test',
    documents: [
      { document_id: 'big', canonical_path: 'corpus/DOCUMENTS/big.md', file_name: 'big.md', sha256: sha(texts['big.md']), bytes: texts['big.md'].length, status: 'reference', priority_tier: 'reference', provenance_mode: 'native' },
      { document_id: 'small', canonical_path: 'corpus/DOCUMENTS/small.md', file_name: 'small.md', sha256: sha(texts['small.md']), bytes: texts['small.md'].length, status: 'reference', priority_tier: 'reference', provenance_mode: 'native' },
      { document_id: 'third', canonical_path: 'corpus/DOCUMENTS/third.md', file_name: 'third.md', sha256: sha(texts['third.md']), bytes: texts['third.md'].length, status: 'reference', priority_tier: 'reference', provenance_mode: 'native' }
    ]
  };
  const manifestBytes = jsonBytes(manifest);
  const policy = {
    schema_version: 'rus.knowledge_retrieval_policy.v1', policy_version: '1.0.0', baseline_manifest_sha256: sha(manifestBytes),
    default_statuses: ['active', 'reference'],
    documents: [
      { document_id: 'big', document_type: 'reference', subsystems: ['history'], related_document_ids: ['small'], related_module_paths: ['packages/history'], related_contracts: [], search_terms: ['shared topical phrase', 'materializes instances', 'approved profiles'], conflicts_with_document_ids: [] },
      { document_id: 'small', document_type: 'reference', subsystems: ['history'], related_document_ids: ['big'], related_module_paths: ['packages/history'], related_contracts: [], search_terms: ['shared topical phrase'], conflicts_with_document_ids: [] },
      { document_id: 'third', document_type: 'reference', subsystems: ['history'], related_document_ids: ['big'], related_module_paths: ['packages/history'], related_contracts: [], search_terms: ['shared topical phrase', 'third guide'], conflicts_with_document_ids: [] }
    ],
    control_queries: [{ query_id: 'big-guide', query: 'shared topical phrase', expected_document_ids: ['big'], top_k: 3 }]
  };
  const bigChunks = Array.from({ length: 110 }, (_item, index) => ({
    id: `big:${index}`,
    file: 'big.md',
    section: `Big ${index}`,
    line_start: 1,
    line_end: 3,
    text: `# Big\n${strongPhrase} filler ${index}`,
    char_count: 90
  }));
  const lexical = {
    schema_version: 'rus.lexical_index.v1',
    chunks: [
      ...bigChunks,
      { id: 'small:0', file: 'small.md', section: 'Small', line_start: 1, line_end: 3, text: `# Small\n${weakPhrase}`, char_count: 40 },
      { id: 'third:0', file: 'third.md', section: 'Third', line_start: 1, line_end: 3, text: `# Third\n${weakPhrase} third guide`, char_count: 50 }
    ]
  };
  const lexicalBytes = jsonBytes(lexical);
  const ragManifest = {
    schema_version: 'rus.knowledge_rag_manifest.v1',
    corpus_manifest_sha256: sha(manifestBytes),
    lexical_index_sha256: sha(lexicalBytes),
    coverage: [
      { document_id: 'big', file_name: 'big.md', lexical_indexed: true },
      { document_id: 'small', file_name: 'small.md', lexical_indexed: true },
      { document_id: 'third', file_name: 'third.md', lexical_indexed: true }
    ]
  };
  const wrap = (value) => ({ value, bytes: jsonBytes(value) });
  const storage = {
    readCorpusManifest: async () => ({ value: manifest, bytes: manifestBytes }),
    readAliases: async () => wrap({ schema_version: 'rus.knowledge_source_aliases.v1', aliases: {} }),
    readRetrievalPolicy: async () => wrap(policy),
    readDocument: async (canonicalPath) => {
      const record = manifest.documents.find((item) => item.canonical_path === canonicalPath);
      const bytes = texts[record.file_name];
      return { bytes, sha256: sha(bytes) };
    },
    readGeneratedManifest: async () => wrap(ragManifest),
    readGeneratedArtifact: async () => ({ bytes: lexicalBytes, sha256: sha(lexicalBytes) })
  };
  const reader = createKnowledgeRagReader({ storage });
  const result = await reader.searchKnowledge({ query: 'shared topical phrase' });
  const ids = result.reference_results.map((item) => item.document_id);
  assert.equal(result.reference_results.length, 3);
  assert.ok(ids.includes('small'), `small must survive big crowding; got ${ids.join(',')}`);
  assert.ok(ids.includes('third'));
  assert.ok(ids.includes('big'));
  assert.ok(result.reference_results.every((item) => item.status === 'reference'));
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
