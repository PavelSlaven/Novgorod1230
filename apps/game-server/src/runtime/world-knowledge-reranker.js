import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const PROFILE_REL = 'data/world-catalogs/novgorod/world-knowledge/embedding-profiles/bge-reranker-v2-m3-v1.json';

/** D21 production gate: reranker stays off until audit miss/noise improve and
 *  p95 ≤ 150 ms on the owner server. Numbers from model-bench REPORT.md. */
export async function loadRerankerProfile({ rootDir = process.cwd() } = {}) {
  const raw = JSON.parse(await readFile(join(rootDir, PROFILE_REL), 'utf8'));
  if (raw?.schema !== 'world_knowledge_reranker_profile_v1') {
    throw new TypeError('reranker profile schema mismatch');
  }
  return Object.freeze(raw);
}

export function rerankerProductionEnabled(profile) {
  return profile?.production_enabled === true
    && profile?.gate?.decision === 'enabled';
}

/**
 * Optional second-pass scores for Core. Returns null when gated off or worker
 * unavailable (caller keeps hybrid vectorScores; increments degrade counter).
 */
export async function collectRerankScores({
  profile, queryText, candidates, scorePairs, telemetry = null
} = {}) {
  if (!rerankerProductionEnabled(profile)) return null;
  if (typeof scorePairs !== 'function') {
    telemetry?.onDetail?.(Object.freeze({
      schema: 'world_knowledge_reranker_degradation_v1',
      reason: 'worker_unavailable',
      candidate_count: candidates?.length ?? 0
    }));
    return null;
  }
  try {
    const scores = await scorePairs({ queryText, candidates });
    if (!(scores instanceof Map)) {
      throw new TypeError('reranker worker must return a Map');
    }
    return scores;
  } catch (error) {
    telemetry?.onDetail?.(Object.freeze({
      schema: 'world_knowledge_reranker_degradation_v1',
      reason: 'worker_failed',
      code: String(error?.code ?? error?.name ?? 'RERANKER_FAILED'),
      candidate_count: candidates?.length ?? 0
    }));
    return null;
  }
}
