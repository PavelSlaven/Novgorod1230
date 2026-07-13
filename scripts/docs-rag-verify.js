import { existsSync, readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { computeCorpusHash } from '../src/world/corpus-chunks.js';
import { getRagIndexPath } from '../src/world/corpus-rag.js';

const root = resolve(import.meta.dirname, '..');
const corpusDir = resolve(root, 'DOCUMENTS', 'documents-kg', 'corpus', 'DOCUMENTS');
const indexPath = getRagIndexPath();
const manifestPath = resolve(root, 'DOCUMENTS', 'documents-kg', 'rag-index', 'manifest.json');
const errors = [];

function fail(message) {
  errors.push(message);
}

if (!existsSync(indexPath)) {
  fail(`rag index missing: ${indexPath}`);
}

if (errors.length) {
  console.error('docs rag verify failed:\n' + errors.map((item) => `- ${item}`).join('\n'));
  process.exit(1);
}

const index = JSON.parse(readFileSync(indexPath, 'utf8'));
const chunkCount = Number(index?.chunk_count ?? index?.chunks?.length ?? 0);
if (chunkCount <= 0) {
  fail('rag index chunk_count must be > 0');
}

const corpusHash = computeCorpusHash(corpusDir);
if (index.corpus_hash !== corpusHash) {
  fail(`corpus_hash mismatch (index=${index.corpus_hash}, corpus=${corpusHash})`);
}

for (const chunk of index.chunks ?? []) {
  const filePath = resolve(corpusDir, basename(String(chunk.file ?? '')));
  if (!existsSync(filePath)) {
    fail(`chunk ${chunk.id} references missing file: ${chunk.file}`);
  }
  if (!Array.isArray(chunk.embedding) || chunk.embedding.length === 0) {
    fail(`chunk ${chunk.id} missing embedding`);
  }
}

if (existsSync(manifestPath)) {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (Number(manifest.chunk_count ?? 0) !== chunkCount) {
    fail(`manifest chunk_count ${manifest.chunk_count} != index ${chunkCount}`);
  }
}

if (errors.length) {
  console.error('docs rag verify failed:\n' + errors.map((item) => `- ${item}`).join('\n'));
  process.exit(1);
}

console.log(`docs rag verify ok (${chunkCount} chunks, model=${index.model ?? '?'})`);
