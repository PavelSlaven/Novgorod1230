export function createWorldKnowledgeFlatVectorIndex(metadata, bytes) {
  if (metadata?.schema !== 'world_knowledge_vector_index_v1'
      || !Number.isInteger(metadata.dimension) || metadata.dimension < 1
      || !Array.isArray(metadata.entries)
      || metadata.entries.some((entry) => typeof entry?.target_ref !== 'string'
        || typeof entry.locale !== 'string' || typeof entry.domain !== 'string')
      || !(bytes instanceof Uint8Array)
      || bytes.byteLength !== metadata.entries.length * metadata.dimension * 4) {
    throw new TypeError('World Knowledge vector index is invalid');
  }
  const copied = Uint8Array.from(bytes);
  const vectors = new Float32Array(copied.buffer);
  return Object.freeze({
    embedding_profile_ref: metadata.embedding_profile_ref,
    dimension: metadata.dimension,
    search(queryVector, { locale, domains, limit = 20 } = {}) {
      if (!Array.isArray(queryVector)
          && !(queryVector instanceof Float32Array)) {
        throw new TypeError('World Knowledge query vector is invalid');
      }
      if (queryVector.length !== metadata.dimension
          || [...queryVector].some((value) => !Number.isFinite(value))
          || typeof locale !== 'string' || !Array.isArray(domains)
          || !Number.isInteger(limit) || limit < 1) {
        throw new TypeError('World Knowledge vector search is invalid');
      }
      const domainSet = new Set(domains);
      const scores = new Map();
      for (let index = 0; index < metadata.entries.length; index += 1) {
        const entry = metadata.entries[index];
        if (entry.locale !== locale || !domainSet.has(entry.domain)) continue;
        let score = 0;
        const offset = index * metadata.dimension;
        for (let axis = 0; axis < metadata.dimension; axis += 1) {
          score += queryVector[axis] * vectors[offset + axis];
        }
        if (score > (scores.get(entry.target_ref) ?? -Infinity)) {
          scores.set(entry.target_ref, score);
        }
      }
      return new Map([...scores].sort((a, b) => b[1] - a[1]
        || a[0].localeCompare(b[0])).slice(0, limit));
    }
  });
}
