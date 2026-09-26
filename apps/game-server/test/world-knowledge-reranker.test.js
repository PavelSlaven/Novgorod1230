import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  collectRerankScores,
  createBgeRerankerScorePairs,
  loadRerankerProfile,
  rerankerProductionEnabled,
  wireRerankerIfEnabled
} from '../src/runtime/world-knowledge-reranker.js';
import { loadProductionWorldKnowledge } from
  '../src/internal/world-knowledge-production.js';
import { DEFAULT_MIN_HINT_RELEVANCE } from
  '../src/runtime/world-knowledge-sufficiency.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '../../..');

function enabledProfile(base) {
  return Object.freeze({
    ...base,
    production_enabled: true,
    gate: { ...base.gate, decision: 'enabled' }
  });
}

test('loadRerankerProfile pins D21-closed gate and revision sha', async () => {
  const profile = await loadRerankerProfile({ rootDir: ROOT });
  assert.equal(profile.schema, 'world_knowledge_reranker_profile_v1');
  assert.equal(profile.production_enabled, false);
  assert.equal(profile.gate.decision, 'not_enabled');
  assert.equal(profile.gate.require_noise_reduction, true);
  assert.equal('require_noise_reduction_or_mrr_gain' in profile.gate, false);
  assert.equal(profile.model_revision.startsWith('refs/'), false);
  assert.equal(rerankerProductionEnabled(profile), false);
});

test('collectRerankScores stays null when gate closed (no worker call)', async () => {
  const profile = await loadRerankerProfile({ rootDir: ROOT });
  let called = 0;
  const scores = await collectRerankScores({
    profile,
    queryText: 'x',
    candidates: [{ claim_ref: 'c1', text: 't' }],
    scorePairs: async () => { called += 1; return new Map([['c1', 1]]); }
  });
  assert.equal(scores, null);
  assert.equal(called, 0);
});

test('collectRerankScores emits worker_unavailable and worker_failed', async () => {
  const profile = enabledProfile(await loadRerankerProfile({ rootDir: ROOT }));
  const details = [];
  const telemetry = { onDetail: (detail) => details.push(detail) };
  assert.equal(await collectRerankScores({
    profile, queryText: 'q', candidates: [{ claim_ref: 'a', text: 't' }],
    scorePairs: null, telemetry
  }), null);
  assert.equal(details.at(-1)?.reason, 'worker_unavailable');
  assert.equal(await collectRerankScores({
    profile, queryText: 'q', candidates: [{ claim_ref: 'a', text: 't' }],
    scorePairs: async () => ({ not: 'a map' }), telemetry
  }), null);
  assert.equal(details.at(-1)?.reason, 'worker_failed');
  assert.equal(await collectRerankScores({
    profile, queryText: 'q', candidates: [{ claim_ref: 'a', text: 't' }],
    scorePairs: async () => { const err = new Error('boom'); err.code = 'X'; throw err; },
    telemetry
  }), null);
  assert.equal(details.at(-1)?.reason, 'worker_failed');
  assert.equal(details.at(-1)?.code, 'X');
});

test('collectRerankScores returns Map when gate open and worker ok', async () => {
  const profile = enabledProfile(await loadRerankerProfile({ rootDir: ROOT }));
  const scores = await collectRerankScores({
    profile, queryText: 'q',
    candidates: [{ claim_ref: 'a', text: 't' }],
    scorePairs: async () => new Map([['a', -1.5], ['b', 0.2]])
  });
  assert.ok(scores instanceof Map);
  assert.equal(scores.get('a'), -1.5);
});

test('wireRerankerIfEnabled refuses closed gate and requires scorePairs', async () => {
  const profile = await loadRerankerProfile({ rootDir: ROOT });
  assert.equal(wireRerankerIfEnabled({ profile, scorePairs: async () => new Map() }), null);
  const open = enabledProfile(profile);
  assert.throws(() => wireRerankerIfEnabled({ profile: open }), /scorePairs/);
  const wired = wireRerankerIfEnabled({
    profile: open, scorePairs: async () => new Map([['a', 1]])
  });
  assert.equal(typeof wired.scorePairs, 'function');
});

test('createBgeRerankerScorePairs requires local modelPath', () => {
  assert.throws(() => createBgeRerankerScorePairs({ rootDir: ROOT }), /modelPath/);
});

test('production loader attaches reranker_profile + sufficiency and keeps reranker null', async () => {
  const loaded = await loadProductionWorldKnowledge({ rootDir: ROOT });
  try {
    assert.equal(loaded.reranker_profile?.reranker_profile_ref, 'wk-reranker:bge-v2-m3:v1');
    assert.equal(loaded.reranker, null);
    assert.equal(loaded.sufficiency_profile?.sufficiency_profile_ref,
      'wk-sufficiency:giga-cosine:v1');
    assert.equal(loaded.sufficiency_profile.status, 'provisional');
    assert.equal(loaded.sufficiency_profile.min_hint_relevance,
      DEFAULT_MIN_HINT_RELEVANCE);
  } finally {
    await loaded.encoder?.close?.();
  }
});
