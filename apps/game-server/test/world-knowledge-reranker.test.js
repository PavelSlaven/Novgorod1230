import assert from 'node:assert/strict';
import { writeFileSync, mkdtempSync, mkdirSync, symlinkSync, rmSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
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
import { DEFAULT_MIN_HINT_RELEVANCE, groundingSufficiencyOf } from
  '../src/runtime/world-knowledge-sufficiency.js';
import { createProductionWorldKnowledgeGrounder } from
  '../src/runtime/world-knowledge-grounding.js';

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

test('rerankerProductionEnabled requires gate.decision enabled', async () => {
  const profile = await loadRerankerProfile({ rootDir: ROOT });
  assert.equal(rerankerProductionEnabled({
    ...profile, production_enabled: true,
    gate: { ...profile.gate, decision: 'not_enabled' }
  }), false);
  assert.equal(rerankerProductionEnabled({
    ...profile, production_enabled: true,
    gate: { ...profile.gate, decision: 'enabled' }
  }), true);
});

test('createBgeRerankerScorePairs sets HF_HUB_OFFLINE and drops non-finite scores', async () => {
  let capturedEnv = null;
  const scorePairs = createBgeRerankerScorePairs({
    rootDir: ROOT,
    modelPath: join(ROOT, 'data'),
    spawnSyncImpl: (cmd, args, opts) => {
      capturedEnv = opts.env;
      return { status: 0, stdout: '', stderr: '' };
    }
  });
  // Worker read fails (no output file) — still proves offline env.
  await assert.rejects(() => scorePairs({
    queryText: 'q',
    candidates: [{ claim_ref: 'a', text: 't' }]
  }));
  assert.equal(capturedEnv?.HF_HUB_OFFLINE, '1');
  assert.equal(capturedEnv?.TRANSFORMERS_OFFLINE, '1');

  const okPairs = createBgeRerankerScorePairs({
    rootDir: ROOT,
    modelPath: join(ROOT, 'data'),
    spawnSyncImpl: (cmd, args) => {
      const output = args[args.indexOf('--output') + 1];
      writeFileSync(output, JSON.stringify({
        scores: [
          { claim_ref: 'a', score: 1.5 },
          { claim_ref: 'b', score: 'bad' },
          { claim_ref: 'c', score: null },
          { score: 3 }
        ]
      }));
      return { status: 0, stdout: '', stderr: '' };
    }
  });
  const scores = await okPairs({
    queryText: 'q', candidates: [{ claim_ref: 'a', text: 't' }]
  });
  assert.deepEqual([...scores.keys()], ['a']);
  assert.equal(scores.get('a'), 1.5);
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

test('production loader rejects invalid sufficiency profile', async () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'novgorod-suff-'));
  try {
    const rel = 'data/world-catalogs/novgorod/world-knowledge';
    mkdirSync(join(tempRoot, rel, 'sufficiency-profiles'), { recursive: true });
    mkdirSync(join(tempRoot, rel, 'embedding-profiles'), { recursive: true });
    mkdirSync(join(tempRoot, rel, 'production-v1'), { recursive: true });
    for (const part of [
      'embedding-profiles/giga-480m-0826-v1.json',
      'embedding-profiles/bge-reranker-v2-m3-v1.json',
      'production-v1/runtime-bundle.json',
      'production-v1/vector-index.json',
      'production-v1/vectors.f32'
    ]) {
      try {
        symlinkSync(join(ROOT, rel, part), join(tempRoot, rel, part));
      } catch {
        copyFileSync(join(ROOT, rel, part), join(tempRoot, rel, part));
      }
    }
    writeFileSync(join(tempRoot, rel, 'sufficiency-profiles/giga-cosine-v1.json'),
      JSON.stringify({ schema: 'not_a_sufficiency_profile', min_hint_relevance: 0.28 }));
    await assert.rejects(
      () => loadProductionWorldKnowledge({ rootDir: tempRoot }),
      /sufficiency profile is invalid/);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('sufficiency_profile min_hint_relevance changes SUFFICIENT marker', () => {
  const slice = {
    facts: [{ claim_ref: 'claim:a' }], hard_constraints: [], disputes: [],
    coverage: [{ domain: 'materials_substances', status: 'covered' }],
    search_hint_hits: [true],
    search_hint_relevance: [0.30],
    verdict: 'supported'
  };
  assert.equal(groundingSufficiencyOf(slice, { minHintRelevance: 0.28 }),
    'SUFFICIENT_KNOWLEDGE');
  assert.equal(groundingSufficiencyOf(slice, { minHintRelevance: 0.35 }),
    'PARTIAL_KNOWLEDGE');
});

test('grounding passes rerankScores into Core when D21 gate open', async () => {
  const loaded = await loadProductionWorldKnowledge({ rootDir: ROOT });
  const resolveCalls = [];
  const realResolve = loaded.core.resolveWorldKnowledge.bind(loaded.core);
  const core = {
    resolveWorldKnowledge(query, options) {
      resolveCalls.push(options);
      return realResolve(query, options);
    }
  };
  const openProfile = Object.freeze({
    ...loaded.reranker_profile,
    production_enabled: true,
    gate: { ...loaded.reranker_profile.gate, decision: 'enabled' }
  });
  const fakeScores = new Map([
    ['claim:regional-fish-exploitation', 0.42]
  ]);
  const worldKnowledge = {
    ...loaded,
    core,
    reranker_profile: openProfile,
    reranker: {
      scorePairs: async () => fakeScores
    },
    encoder: { encode: async () => new Float32Array(1024) },
    vector_index: {
      search: () => new Map([['claim:regional-fish-exploitation', 0.9]])
    }
  };
  const grounder = createProductionWorldKnowledgeGrounder({
    worldKnowledge,
    year: 1230,
    placeRefs: ['region_novgorod_land'],
    roleRunner: {
      async run() {
        return {
          output: {
            schema: 'world_knowledge_query_plan_v1',
            query_locale: 'ru',
            domains: ['environment'],
            focus_refs: ['wk:environment:regional-fish-exploitation'],
            requested_predicates: ['supported_fact'],
            search_hints: ['рыбные ресурсы']
          },
          provider_record: {
            scope: 'turn_runtime', role_id: 'world_knowledge_query_planner',
            provider: 'test', model: 'test'
          }
        };
      }
    }
  });
  await grounder.ground({
    request_id: 'turn:rerank-pass',
    remaining_intent: 'Можно ли здесь добыть рыбу?'
  }, 'semantic_resolution');
  assert.ok(resolveCalls.length >= 1);
  const withRerank = resolveCalls.find((opts) => opts?.rerankScores instanceof Map);
  assert.ok(withRerank, 'Core must receive rerankScores when gate open');
  assert.equal(withRerank.rerankScores.get('claim:regional-fish-exploitation'), 0.42);
  await loaded.encoder?.close?.();
});
