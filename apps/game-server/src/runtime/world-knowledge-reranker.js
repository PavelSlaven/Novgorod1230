import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROFILE_REL = 'data/world-catalogs/novgorod/world-knowledge/embedding-profiles/bge-reranker-v2-m3-v1.json';
const DEFAULT_WORKER = fileURLToPath(new URL(
  '../../../../tools/world-catalog-workflow/src/bge-reranker.py', import.meta.url));

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
 * unavailable (caller keeps hybrid vectorScores; emits degrade telemetry).
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

/**
 * Adapter: Python worker returns [{claim_ref, score}] → Map for Core.
 * Loads weights from a local snapshot only (HF_HUB_OFFLINE); no hub fetch.
 */
export function createBgeRerankerScorePairs({
  rootDir = process.cwd(),
  python = 'python',
  modelPath,
  profilePath = join(rootDir, PROFILE_REL),
  workerPath = DEFAULT_WORKER,
  spawnSyncImpl = spawnSync,
  timeoutMs = 120_000
} = {}) {
  if (typeof modelPath !== 'string' || !modelPath.trim()) {
    throw new TypeError('reranker modelPath is required');
  }
  return async function scorePairs({ queryText, candidates }) {
    const dir = await mkdtemp(join(tmpdir(), 'novgorod-rerank-'));
    const inputPath = join(dir, 'input.json');
    const outputPath = join(dir, 'output.json');
    const metricsPath = join(dir, 'metrics.json');
    try {
      await writeFile(inputPath, JSON.stringify({
        query: String(queryText ?? ''),
        candidates: (candidates ?? []).map((entry) => ({
          claim_ref: entry.claim_ref, text: entry.text
        }))
      }), 'utf8');
      const result = spawnSyncImpl(python, [
        '-u', workerPath,
        '--profile', profilePath,
        '--model-path', modelPath,
        '--input', inputPath,
        '--output', outputPath,
        '--metrics-out', metricsPath
      ], {
        encoding: 'utf8', windowsHide: true, timeout: timeoutMs,
        env: { ...process.env, PYTHONUTF8: '1', HF_HUB_OFFLINE: '1',
          TRANSFORMERS_OFFLINE: '1', HF_HUB_DISABLE_TELEMETRY: '1' }
      });
      if (result.status !== 0) {
        const err = new Error(String(result.stderr || result.stdout || 'reranker failed').trim());
        err.code = 'RERANKER_WORKER_FAILED';
        throw err;
      }
      const payload = JSON.parse(await readFile(outputPath, 'utf8'));
      const scores = new Map();
      for (const entry of payload?.scores ?? []) {
        if (typeof entry?.claim_ref === 'string' && Number.isFinite(entry?.score)) {
          scores.set(entry.claim_ref, entry.score);
        }
      }
      return scores;
    } finally {
      await rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  };
}

/** Wire scorePairs only when D21 gate is open; otherwise null (no spawn/download). */
export function wireRerankerIfEnabled({ profile, scorePairs } = {}) {
  if (!rerankerProductionEnabled(profile)) return null;
  if (typeof scorePairs !== 'function') {
    throw new TypeError('enabled reranker requires scorePairs');
  }
  return Object.freeze({ scorePairs });
}
