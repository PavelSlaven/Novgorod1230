export function retrievalObservabilityOf({ bundle, embeddingProfile,
  vectorScores, slice, embeddingMs, vectorMs, coreResolutionMs,
  totalRetrievalMs, cacheOutcome = 'miss' }) {
  const vectorHitRefs = Object.freeze([...vectorScores.keys()]);
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
    // ponytail: lexical timing stays inside Core resolve; exposing lexical_ms
    // needs a Core return-channel change — LW-046, not this CR.
    lexical_ms: null, lexical_status: 'included_in_core_resolution',
    cache_outcome: cacheOutcome === 'hit' ? 'hit' : 'miss',
    hard_constraint_count: slice.hard_constraints.length,
    gaps: Object.freeze([...slice.gaps])
  });
}
