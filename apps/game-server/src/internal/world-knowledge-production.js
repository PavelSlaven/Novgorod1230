import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createWorldKnowledgeCore,
  createWorldKnowledgeFlatVectorIndex } from '@rus/world-knowledge';
import { createGigaQueryEncoder } from
  '../infrastructure/embedding/giga-query-encoder.js';

const BUNDLE_PATH = 'data/world-catalogs/novgorod/world-knowledge/production-v1/runtime-bundle.json';
const EMBEDDING_PROFILE_PATH = 'data/world-catalogs/novgorod/world-knowledge/embedding-profiles/giga-480m-0826-v1.json';
const VECTOR_METADATA_PATH = 'data/world-catalogs/novgorod/world-knowledge/production-v1/vector-index.json';
const VECTOR_DATA_PATH = 'data/world-catalogs/novgorod/world-knowledge/production-v1/vectors.f32';

export async function loadProductionWorldKnowledge({ rootDir = process.cwd(),
  python = 'python' } = {}) {
  const [bundle, embeddingProfile, vectorMetadata, vectorBytes] =
    await Promise.all([
    readJson(resolve(rootDir, BUNDLE_PATH)),
    readJson(resolve(rootDir, EMBEDDING_PROFILE_PATH)),
    readJson(resolve(rootDir, VECTOR_METADATA_PATH)),
    readFile(resolve(rootDir, VECTOR_DATA_PATH))
  ]);
  if (bundle?.schema !== 'world_knowledge_runtime_bundle_v1'
      || bundle.manifest?.pack_ref !== 'wk-pack:novgorod-1230'
      || bundle.manifest?.revision_id !== 'revision:production-v1'
      || bundle.manifest?.status !== 'production') {
    throw new TypeError('production World Knowledge bundle is invalid');
  }
  if (embeddingProfile?.schema !== 'world_knowledge_embedding_profile_v1'
      || embeddingProfile.embedding_profile_ref
        !== 'wk-embedding:giga-480m-0826:v1'
      || embeddingProfile.model_revision
        !== '0c94f705aa35719324fb46f7e75b0a5c275da6e4'
      || embeddingProfile.dimension !== 1024
      || embeddingProfile.normalization !== 'l2'
      || embeddingProfile.pooling !== 'mean'
      || embeddingProfile.status !== 'production'
      || bundle.manifest.embedding_profile_ref
        !== embeddingProfile.embedding_profile_ref) {
    throw new TypeError('World Knowledge embedding profile is invalid');
  }
  if (vectorMetadata?.schema !== 'world_knowledge_vector_index_v1'
      || vectorMetadata.pack_ref !== bundle.manifest.pack_ref
      || vectorMetadata.pack_revision !== bundle.manifest.revision_id
      || vectorMetadata.embedding_profile_ref
        !== embeddingProfile.embedding_profile_ref
      || vectorMetadata.model_id !== embeddingProfile.model_id
      || vectorMetadata.model_revision !== embeddingProfile.model_revision
      || vectorMetadata.dimension !== embeddingProfile.dimension
      || vectorMetadata.normalization !== embeddingProfile.normalization
      || vectorMetadata.pooling !== embeddingProfile.pooling
      || !validEntries(vectorMetadata.entries, bundle)) {
    throw new TypeError('World Knowledge vector index is invalid');
  }
  return freeze({ bundle, embedding_profile: embeddingProfile,
    core: createWorldKnowledgeCore(bundle),
    vector_index: createWorldKnowledgeFlatVectorIndex(vectorMetadata,
      vectorBytes, { conceptToClaimRefs: bundle.exact_indexes.concept_to_claim_refs }),
    encoder: createGigaQueryEncoder({
      profilePath: resolve(rootDir, EMBEDDING_PROFILE_PATH), python }) });
}

function validEntries(entries, bundle) {
  if (!Array.isArray(entries)) return false;
  const targets = new Map([...bundle.concepts.map((value) =>
    [value.concept_ref, value.domain]), ...bundle.claims.map((value) =>
    [value.claim_ref, value.domain])]);
  const seen = new Set();
  for (const entry of entries) {
    const key = `${entry?.target_ref}\0${entry?.locale}`;
    if (typeof entry?.entry_ref !== 'string' || !entry.entry_ref
        || seen.has(key) || targets.get(entry.target_ref) !== entry.domain
        || !bundle.manifest.supported_locales.includes(entry.locale)
        || typeof entry.retrieval_text !== 'string'
        || !entry.retrieval_text.trim()) return false;
    seen.add(key);
  }
  return seen.size === targets.size * bundle.manifest.supported_locales.length;
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

function freeze(value) {
  if (value == null || typeof value !== 'object' || Object.isFrozen(value)) {
    return value;
  }
  Object.freeze(value);
  for (const nested of Object.values(value)) freeze(nested);
  return value;
}
