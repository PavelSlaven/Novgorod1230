export function verifyDocumentGraph({ graph = {}, corpusFiles = {} } = {}) {
  const errors = [];
  const nodes = Array.isArray(graph.nodes) ? graph.nodes : [];
  const referenced = new Set();
  for (const node of nodes) {
    const location = node?.source_location ?? node?.sourceLocation;
    if (!location) continue;
    const file = text(location.file ?? node.source_file);
    if (!Object.hasOwn(corpusFiles, file)) { errors.push(`missing corpus file: ${file}`); continue; }
    referenced.add(file);
    const lines = lineCount(corpusFiles[file]);
    const start = Number(location.line_start ?? location.lineStart);
    const end = Number(location.line_end ?? location.lineEnd);
    if (Number.isFinite(start) && start < 1) errors.push(`invalid line_start for ${file}`);
    if (Number.isFinite(end) && end > lines) errors.push(`line_end exceeds ${file}`);
    if (Number.isFinite(start) && Number.isFinite(end) && end < start) errors.push(`inverted line range for ${file}`);
  }
  for (const file of Object.keys(corpusFiles)) if (!referenced.has(file)) errors.push(`corpus file missing from graph: ${file}`);
  return Object.freeze({ ok: errors.length === 0, errors, node_count: nodes.length, corpus_count: Object.keys(corpusFiles).length });
}

export async function buildRagIndex({ chunks = [], embedTexts, model, corpusHash } = {}) {
  if (typeof embedTexts !== 'function') throw new TypeError('embedTexts port is required');
  if (!Array.isArray(chunks) || chunks.length === 0) throw new TypeError('chunks are required');
  const vectors = await embedTexts(chunks.map((chunk) => text(chunk.text)));
  if (!Array.isArray(vectors) || vectors.length !== chunks.length) throw new TypeError('embedding port returned invalid batch');
  let dimensions = null;
  const indexed = chunks.map((chunk, index) => {
    const embedding = vectors[index];
    if (!Array.isArray(embedding) || embedding.length === 0 || embedding.some((value) => !Number.isFinite(Number(value)))) throw new TypeError(`invalid embedding for chunk ${chunk.id ?? index}`);
    dimensions ??= embedding.length;
    if (embedding.length !== dimensions) throw new TypeError('embedding dimensions are inconsistent');
    return { ...structuredClone(chunk), embedding: embedding.map(Number) };
  });
  return Object.freeze({ schema_version:'rus.rag_index.v1', model:text(model), dimensions, corpus_hash:text(corpusHash), chunk_count:indexed.length, chunks:indexed });
}

export function verifyRagIndex({ index = {}, corpusHash, corpusFiles = null } = {}) {
  const errors = [];
  if (index.schema_version !== 'rus.rag_index.v1') errors.push('invalid index schema_version');
  if (text(index.corpus_hash) !== text(corpusHash)) errors.push('corpus_hash mismatch');
  if (!Array.isArray(index.chunks) || index.chunks.length !== Number(index.chunk_count)) errors.push('chunk_count mismatch');
  for (const chunk of index.chunks ?? []) {
    if (!Array.isArray(chunk.embedding) || chunk.embedding.length !== Number(index.dimensions)) errors.push(`invalid embedding dimensions for ${chunk.id ?? '?'}`);
    if (corpusFiles && !Object.hasOwn(corpusFiles, text(chunk.file))) errors.push(`missing corpus file: ${chunk.file}`);
  }
  return Object.freeze({ ok: errors.length === 0, errors });
}

export function queryVectorIndex({ index = {}, embedding = [], topK = 8 } = {}) {
  if (!Array.isArray(embedding) || embedding.length !== Number(index.dimensions)) throw new TypeError('query embedding dimensions mismatch');
  return Object.freeze((index.chunks ?? []).map((chunk) => ({ ...structuredClone(chunk), score: cosine(embedding, chunk.embedding) }))
    .sort((a, b) => b.score - a.score || text(a.id).localeCompare(text(b.id)))
    .slice(0, Math.max(1, Math.floor(Number(topK) || 8))));
}
function cosine(a, b) { let dot=0, aa=0, bb=0; for (let i=0;i<a.length;i+=1) { const x=Number(a[i]); const y=Number(b[i]); dot+=x*y; aa+=x*x; bb+=y*y; } return aa && bb ? dot / Math.sqrt(aa*bb) : 0; }
function lineCount(value) { return String(value ?? '').split(/\r?\n/u).length; }
function text(value) { return String(value ?? '').trim(); }

export {
  buildDocumentationOutputs,
  checkDocumentationOutputs,
  validateDocumentationTree,
  writeDocumentationOutputs
} from './documentation-policy-v2.js';

export {
  buildKnowledgeGraphFromSnapshot,
  buildRagIndexFromSnapshot,
  inventoryLegacyKnowledgeSource,
  readKnowledgeSourceInventory,
  verifyKnowledgeSourceMigration,
  writeKnowledgeSourceOutputs
} from './knowledge-source.js';
export { importKnowledgeSourceFromLegacy } from './knowledge-source.js';
export { verifyCanonicalCorpus } from './knowledge-corpus-verifier.js';
