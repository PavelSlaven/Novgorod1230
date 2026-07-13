import { loadLocalEnv } from '../src/env.js';
import { searchCorpus } from '../src/world/corpus-rag.js';

await loadLocalEnv();

const query = process.argv.slice(2).join(' ').trim();
if (!query) {
  console.error('usage: node scripts/docs-rag-query.js "<query>"');
  process.exit(1);
}

const topK = Number(process.env.CORPUS_RAG_TOP_K ?? 8) || 8;
const hits = await searchCorpus(query, { topK });
if (hits.length === 0) {
  console.log('no hits');
  process.exit(0);
}

for (const hit of hits) {
  console.log(`\n--- ${hit.id} score=${hit.score.toFixed(4)} ---\n${hit.text}\n`);
}
