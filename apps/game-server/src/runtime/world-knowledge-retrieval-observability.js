export function retrievalObservabilityOf({ bundle, embeddingProfile,
  vectorScores, slice, embeddingMs, vectorMs, coreResolutionMs,
  totalRetrievalMs }) {
  const vectorHitRefs = Object.freeze([...vectorScores.keys()].slice(0, 3));
  return Object.freeze({
    pack_ref: bundle.manifest.pack_ref,
    pack_revision: bundle.manifest.revision_id,
    embedding_profile_ref: embeddingProfile?.embedding_profile_ref ?? null,
    model_id: embeddingProfile?.model_id ?? null,
    model_revision: embeddingProfile?.model_revision ?? null,
    encoder: 'giga-query-encoder', vector_index: 'flat',
    query_embedding_ms: embeddingMs, vector_scan_ms: vectorMs,
    core_resolution_ms: coreResolutionMs,
    total_retrieval_ms: totalRetrievalMs,
    vector_hit_refs: vectorHitRefs, vector_hit_count: vectorHitRefs.length,
    lexical_ms: null, lexical_status: 'included_in_core_resolution',
    cache_outcome: 'miss',
    hard_constraint_count: slice.hard_constraints.length,
    gaps: Object.freeze([...slice.gaps])
  });
}
