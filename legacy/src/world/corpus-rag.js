import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const RAG_INDEX_PATH = resolve(process.cwd(), 'DOCUMENTS', 'documents-kg', 'rag-index', 'index.json');
const DEFAULT_EMBEDDING_MODEL = 'deepseek-embedding';
const DEFAULT_TOP_K = 12;
const DEFAULT_MIN_SCORE = 0.2;
const REQUEST_TIMEOUT_MS = 30000;

let ragIndexCache = null;
const queryEmbeddingCache = new Map();
let testIndexOverride = null;

export function setRagIndexForTests(index = null) {
  testIndexOverride = index;
  ragIndexCache = null;
}

export function getRagIndexPath() {
  return RAG_INDEX_PATH;
}

export function isCorpusRagEnabled(env = process.env) {
  const raw = String(env.CORPUS_RAG_ENABLED ?? '').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes';
}

export function loadRagIndex() {
  if (testIndexOverride) return testIndexOverride;
  if (ragIndexCache) return ragIndexCache;
  if (!existsSync(RAG_INDEX_PATH)) return null;
  try {
    ragIndexCache = JSON.parse(readFileSync(RAG_INDEX_PATH, 'utf8'));
    return ragIndexCache;
  } catch {
    return null;
  }
}

export function clearRagCaches() {
  ragIndexCache = null;
  queryEmbeddingCache.clear();
  testIndexOverride = null;
}

function embeddingConfig(env = process.env) {
  const apiKey = env.DEEPSEEK_EMBEDDING_API_KEY?.trim()
    || env.DEEPSEEK_API_KEY?.trim()
    || '';
  const baseUrl = (env.DEEPSEEK_EMBEDDING_BASE_URL?.trim()
    || env.DEEPSEEK_BASE_URL?.trim()
    || 'https://api.deepseek.com').replace(/\/+$/, '');
  const model = env.DEEPSEEK_EMBEDDING_MODEL?.trim() || DEFAULT_EMBEDDING_MODEL;
  return { apiKey, baseUrl, model };
}

async function requestEmbeddings(input, env = process.env, fetchImpl = globalThis.fetch) {
  const { apiKey, baseUrl, model } = embeddingConfig(env);
  if (!apiKey) {
    throw new Error('Embedding API key missing. Set DEEPSEEK_API_KEY or DEEPSEEK_EMBEDDING_API_KEY.');
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error('Embedding request timeout')), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetchImpl(`${baseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ model, input }),
      signal: controller.signal
    });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`Embedding request failed (${response.status}): ${body.slice(0, 300)}`);
    }
    const data = await response.json();
    const rows = Array.isArray(data?.data) ? [...data.data] : [];
    rows.sort((left, right) => Number(left.index ?? 0) - Number(right.index ?? 0));
    const vectors = rows.map((row) => row.embedding).filter((vector) => Array.isArray(vector) && vector.length > 0);
    if (vectors.length === 0) {
      throw new Error('Embedding response missing vectors');
    }
    return vectors;
  } finally {
    clearTimeout(timeout);
  }
}

export async function embedText(text, env = process.env, fetchImpl = globalThis.fetch) {
  const [vector] = await requestEmbeddings(text, env, fetchImpl);
  return vector;
}

export async function embedTexts(texts, env = process.env, fetchImpl = globalThis.fetch) {
  if (!Array.isArray(texts) || texts.length === 0) return [];
  if (texts.length === 1) return requestEmbeddings(texts[0], env, fetchImpl);
  return requestEmbeddings(texts, env, fetchImpl);
}

async function getQueryEmbedding(query, env, fetchImpl) {
  const key = createHash('sha256').update(String(query)).digest('hex');
  if (queryEmbeddingCache.has(key)) return queryEmbeddingCache.get(key);
  const vector = await embedText(query, env, fetchImpl);
  queryEmbeddingCache.set(key, vector);
  return vector;
}

export function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    const left = Number(a[i]) || 0;
    const right = Number(b[i]) || 0;
    dot += left * right;
    normA += left * left;
    normB += right * right;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export function buildRetrievalQuery(task, frame = {}, taskKeywords = []) {
  const parts = [String(task ?? '').trim()];
  if (taskKeywords.length) parts.push(taskKeywords.join(' '));
  const intentType = String(frame?.intent?.type ?? '').trim();
  if (intentType) parts.push(intentType);
  const region = frame?.world?.region ?? frame?.region;
  if (region) parts.push(String(region));
  if (frame?.world?.inventoryFocus) parts.push('inventory equipment items');
  const pipelineStage = frame?.pipelineStage;
  if (pipelineStage) parts.push(String(pipelineStage));
  return parts.filter(Boolean).join(' | ');
}

export async function searchCorpus(query, options = {}) {
  const {
    topK = Number(options.env?.CORPUS_RAG_TOP_K ?? DEFAULT_TOP_K) || DEFAULT_TOP_K,
    minScore = DEFAULT_MIN_SCORE,
    excludeIds = [],
    env = process.env,
    fetchImpl = globalThis.fetch,
    index = null
  } = options;
  const ragIndex = index ?? loadRagIndex();
  if (!ragIndex || !Array.isArray(ragIndex.chunks) || ragIndex.chunks.length === 0) return [];
  const excluded = new Set(excludeIds);
  const queryVector = await getQueryEmbedding(query, env, fetchImpl);
  const scored = [];
  for (const chunk of ragIndex.chunks) {
    if (excluded.has(chunk.id)) continue;
    const score = cosineSimilarity(queryVector, chunk.embedding);
    if (score < minScore) continue;
    scored.push({ ...chunk, score });
  }
  scored.sort((left, right) => right.score - left.score);
  return scored.slice(0, Math.max(1, topK));
}

export function formatRagChunk(chunk) {
  return String(chunk.text ?? '').trim();
}
