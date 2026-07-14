import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { loadLocalEnv } from '../src/env.js';
import { computeCorpusHash, loadCorpusChunks } from '../src/world/corpus-chunks.js';
import { embedText, embedTexts } from '../src/world/corpus-rag.js';

await loadLocalEnv();

const root = resolve(import.meta.dirname, '..');
const corpusDir = resolve(root, 'DOCUMENTS', 'documents-kg', 'corpus', 'DOCUMENTS');
const indexDir = resolve(root, 'DOCUMENTS', 'documents-kg', 'rag-index');
const indexPath = resolve(indexDir, 'index.json');
const manifestPath = resolve(indexDir, 'manifest.json');

const BATCH_SIZE = 16;
const MAX_RETRIES = 4;
const RETRY_BASE_MS = 1000;

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

function embeddingHelp(error) {
  return [
    'DeepSeek embeddings endpoint unavailable.',
    `Error: ${error.message}`,
    '',
    'Options:',
    '  1. Set DEEPSEEK_EMBEDDING_BASE_URL to an OpenAI-compatible /embeddings provider',
    '  2. Set DEEPSEEK_EMBEDDING_API_KEY (or reuse DEEPSEEK_API_KEY)',
    '  3. Set DEEPSEEK_EMBEDDING_MODEL (default: deepseek-embedding)',
    '',
    'Then rerun: npm run docs:rag:build'
  ].join('\n');
}

async function embedBatch(texts, env) {
  let lastError = null;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
    try {
      return await embedTexts(texts, env);
    } catch (error) {
      lastError = error;
      const delay = RETRY_BASE_MS * (2 ** attempt);
      console.warn(`embed batch retry ${attempt + 1}/${MAX_RETRIES} in ${delay}ms: ${error.message}`);
      await sleep(delay);
    }
  }
  throw lastError;
}

const chunks = loadCorpusChunks(corpusDir);
if (chunks.length === 0) {
  console.error(`no corpus chunks found in ${corpusDir}`);
  process.exit(1);
}

const corpusHash = computeCorpusHash(corpusDir);
const env = process.env;
const model = env.DEEPSEEK_EMBEDDING_MODEL?.trim() || 'deepseek-embedding';

console.log(`probing embeddings API (${chunks.length} chunks, model=${model})...`);
try {
  await embedText(chunks[0].text, env);
} catch (error) {
  console.error(embeddingHelp(error));
  process.exit(1);
}

const indexed = [];
let dimensions = 0;
for (let offset = 0; offset < chunks.length; offset += BATCH_SIZE) {
  const batch = chunks.slice(offset, offset + BATCH_SIZE);
  console.log(`embedding ${offset + 1}-${offset + batch.length} / ${chunks.length}`);
  const vectors = await embedBatch(batch.map((chunk) => chunk.text), env);
  for (let i = 0; i < batch.length; i += 1) {
    const embedding = vectors[i];
    dimensions = embedding.length;
    indexed.push({
      id: batch[i].id,
      file: batch[i].file,
      section: batch[i].section,
      line_start: batch[i].line_start,
      line_end: batch[i].line_end,
      text: batch[i].text,
      char_count: batch[i].char_count,
      embedding
    });
  }
}

const builtAt = new Date().toISOString();
const index = {
  version: 1,
  model,
  dimensions,
  built_at: builtAt,
  corpus_hash: corpusHash,
  chunk_count: indexed.length,
  chunks: indexed
};

const manifest = {
  built_at: builtAt,
  model,
  dimensions,
  corpus_hash: corpusHash,
  chunk_count: indexed.length,
  corpus_dir: corpusDir,
  index_path: indexPath
};

mkdirSync(dirname(indexPath), { recursive: true });
writeFileSync(indexPath, `${JSON.stringify(index)}\n`, 'utf8');
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

console.log(`rag index built: ${indexPath} (${indexed.length} chunks, ${dimensions} dims)`);
