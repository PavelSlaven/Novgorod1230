import { createHash } from 'node:crypto';

export function sha(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function jsonBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
}

export function makeFixture({
  staleRagCorpusPin = false,
  activeConflicts = [],
  controlExpected = ['active'],
  includeDeprecated = false,
  includeReference = false,
  defaultStatuses = ['active', 'reference'],
  proposedTier = 'proposed',
  alignProposedWithActive = false,
  extraActiveChunks = 0
} = {}) {
  const activeBody = 'Code materializes instances from approved profiles.';
  const proposedBody = alignProposedWithActive ? activeBody : 'Future perception engine proposal.';
  const proposedSection = alignProposedWithActive ? 'Active' : 'Proposed';
  const proposedTerms = alignProposedWithActive
    ? ['approved profiles', 'materializes instances']
    : ['future perception'];
  const texts = {
    'active.md': Buffer.from(`# Active\n\n${activeBody}`),
    'proposed.md': Buffer.from(`# ${proposedSection}\n\n${proposedBody}`),
    'deprecated.md': Buffer.from('# Deprecated\n\nHistoric reference vocabulary.'),
    'reference.md': Buffer.from('# Reference guide\n\nNPC generation profiles and shared topic phrase materializes instances from approved profiles.')
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
      { document_id: 'proposed', document_type: 'proposal', subsystems: ['perception'], related_document_ids: ['active'], related_module_paths: ['packages/perception'], related_contracts: [], search_terms: proposedTerms, conflicts_with_document_ids: [] },
      ...(includeReference ? [{ document_id: 'reference', document_type: 'reference', subsystems: ['history'], related_document_ids: ['active'], related_module_paths: ['packages/history'], related_contracts: [], search_terms: ['NPC generation', 'approved profiles', 'materializes instances'], conflicts_with_document_ids: [] }] : []),
      ...(includeDeprecated ? [{ document_id: 'deprecated', document_type: 'reference', subsystems: ['history'], related_document_ids: ['active'], related_module_paths: ['packages/history'], related_contracts: [], search_terms: ['historic reference'], conflicts_with_document_ids: [] }] : [])
    ],
    control_queries: [{ query_id: 'materialization-owner', query: 'approved profiles materializes instances', expected_document_ids: controlExpected, top_k: 3 }]
  };
  const extraChunks = Array.from({ length: extraActiveChunks }, (_item, index) => ({
    id: `active:extra:${index}`,
    file: 'active.md',
    section: `Active extra ${index}`,
    line_start: 1,
    line_end: 3,
    text: `# Active\n${activeBody} filler ${index}`,
    char_count: 80
  }));
  const lexical = { schema_version: 'rus.lexical_index.v1', chunks: [
    { id: 'active:0', file: 'active.md', section: 'Active', line_start: 1, line_end: 3, text: `# Active\n${activeBody}`, char_count: 60 },
    ...extraChunks,
    { id: 'proposed:0', file: 'proposed.md', section: proposedSection, line_start: 1, line_end: 3, text: `# ${proposedSection}\n${proposedBody}`, char_count: 45 },
    ...(includeReference ? [{ id: 'reference:0', file: 'reference.md', section: 'Reference guide', line_start: 1, line_end: 3, text: '# Reference guide\nNPC generation profiles and shared topic phrase materializes instances from approved profiles.', char_count: 110 }] : []),
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
