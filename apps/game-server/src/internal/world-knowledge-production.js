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
  python = 'python', requireEncoderReady = false,
  encoderFactory = createGigaQueryEncoder } = {}) {
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
  const encoder = encoderFactory({
    profilePath: resolve(rootDir, EMBEDDING_PROFILE_PATH), python });
  if (requireEncoderReady) await encoder.ready();
  return freeze({ bundle, embedding_profile: embeddingProfile,
    core: createWorldKnowledgeCore(bundle),
    vector_index: createWorldKnowledgeFlatVectorIndex(vectorMetadata,
      vectorBytes, { conceptToClaimRefs: bundle.exact_indexes.concept_to_claim_refs }),
    encoder });
}

export async function checkProductionWorldKnowledgeReadiness({
  rootDir = process.cwd(), python = 'python'
} = {}) {
  const loaded = await loadProductionWorldKnowledge({ rootDir, python,
    requireEncoderReady: true });
  try {
    const russian = await loaded.encoder.encode(
      'Как вода, мороз и грязь влияют на зимнюю дорогу?');
    const repeat = await loaded.encoder.encode(
      'Как вода, мороз и грязь влияют на зимнюю дорогу?');
    const english = await loaded.encoder.encode(
      'How do water, frost, and mud affect a winter road?');
    const dimensions = [russian.length, repeat.length, english.length];
    if (dimensions.some((value) => value !== 1024)
        || [...russian, ...repeat, ...english].some((value) =>
          !Number.isFinite(value))) {
      throw new TypeError('World Knowledge readiness vector is invalid');
    }
    const difference = Math.max(...russian.map((value, index) =>
      Math.abs(value - repeat[index])));
    if (difference > 1e-6) {
      throw new TypeError('World Knowledge query encoder is not deterministic');
    }
    const domains = loaded.bundle.manifest.domains;
    const russianHits = loaded.vector_index.search(russian,
      { locale: 'ru', domains, limit: 3 });
    const englishHits = loaded.vector_index.search(english,
      { locale: 'en', domains, limit: 3 });
    if (russianHits.size === 0 || englishHits.size === 0) {
      throw new TypeError('World Knowledge production vector retrieval failed');
    }
    return freeze({ status: 'ready', offline: true,
      embedding_profile_ref: loaded.embedding_profile.embedding_profile_ref,
      model_id: loaded.embedding_profile.model_id,
      model_revision: loaded.embedding_profile.model_revision,
      dimension: loaded.embedding_profile.dimension,
      russian_norm: vectorNorm(russian), english_norm: vectorNorm(english),
      deterministic_max_delta: difference,
      russian_top_refs: [...russianHits.keys()],
      english_top_refs: [...englishHits.keys()] });
  } finally {
    await loaded.encoder.close();
  }
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

function vectorNorm(vector) {
  return Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
}

function freeze(value) {
  if (value == null || typeof value !== 'object' || Object.isFrozen(value)) {
    return value;
  }
  Object.freeze(value);
  for (const nested of Object.values(value)) freeze(nested);
  return value;
}
