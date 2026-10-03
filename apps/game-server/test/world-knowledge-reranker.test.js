import assert from 'node:assert/strict';
import { writeFileSync, mkdtempSync, mkdirSync, symlinkSync, rmSync, copyFileSync, readFileSync } from 'node:fs';
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
    assert.equal(loaded.sufficiency_profile.sufficient_enabled, false);
  } finally {
    await loaded.encoder?.close?.();
  }
});

test('production loader rejects single-field invalid sufficiency profile (C26)', async () => {
  // Mutation kill: change ONE field of a valid profile so validation must
  // reach schema/ref/relevance_source/sufficient_enabled checks.
  const tempRoot = mkdtempSync(join(tmpdir(), 'novgorod-suff-'));
  try {
    const rel = 'data/world-catalogs/novgorod/world-knowledge';
    mkdirSync(join(tempRoot, rel, 'sufficiency-profiles'), { recursive: true });
    mkdirSync(join(tempRoot, rel, 'embedding-profiles'), { recursive: true });
    mkdirSync(join(tempRoot, rel, 'production-v2'), { recursive: true });
    for (const part of [
      'embedding-profiles/giga-480m-0826-v1.json',
      'embedding-profiles/bge-reranker-v2-m3-v1.json',
      'production-v2/runtime-bundle.json',
      'production-v2/vector-index.json',
      'production-v2/vectors.f32'
    ]) {
      try {
        symlinkSync(join(ROOT, rel, part), join(tempRoot, rel, part));
      } catch {
        copyFileSync(join(ROOT, rel, part), join(tempRoot, rel, part));
      }
    }
    const valid = JSON.parse(readFileSync(
      join(ROOT, rel, 'sufficiency-profiles/giga-cosine-v1.json'), 'utf8'));
    // Only relevance_source is wrong — schema/ref/min_hint stay valid.
    writeFileSync(join(tempRoot, rel, 'sufficiency-profiles/giga-cosine-v1.json'),
      JSON.stringify({ ...valid, relevance_source: 'not_giga_cosine' }));
    await assert.rejects(
      () => loadProductionWorldKnowledge({ rootDir: tempRoot }),
      (err) => err instanceof TypeError
        && /sufficiency profile is invalid/.test(err.message));
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
  assert.equal(groundingSufficiencyOf(slice, {
    minHintRelevance: 0.28, sufficientEnabled: true
  }), 'SUFFICIENT_KNOWLEDGE');
  assert.equal(groundingSufficiencyOf(slice, {
    minHintRelevance: 0.35, sufficientEnabled: true
  }), 'PARTIAL_KNOWLEDGE');
});

test('sufficient_enabled false caps at PARTIAL even when relevance passes', () => {
  const slice = {
    facts: [{ claim_ref: 'claim:a' }], hard_constraints: [], disputes: [],
    coverage: [{ domain: 'materials_substances', status: 'covered' }],
    search_hint_hits: [true],
    search_hint_relevance: [0.99],
    verdict: 'supported'
  };
  assert.equal(groundingSufficiencyOf(slice, {
    minHintRelevance: 0.28, sufficientEnabled: false
  }), 'PARTIAL_KNOWLEDGE');
  assert.equal(groundingSufficiencyOf(slice, {
    minHintRelevance: 0.28, sufficientEnabled: true
  }), 'SUFFICIENT_KNOWLEDGE');
});

test('grounding applies sufficiency_profile threshold, not DEFAULT fallback', async () => {
  // Mutation kill: if grounding ignores sufficiency_profile and falls back to
  // DEFAULT_MIN_HINT_RELEVANCE (0.28), relevance 0.30 would stay SUFFICIENT.
  const loaded = await loadProductionWorldKnowledge({ rootDir: ROOT });
  const profileThreshold = 0.50;
  assert.notEqual(profileThreshold, DEFAULT_MIN_HINT_RELEVANCE);
  const worldKnowledge = {
    ...loaded,
    sufficiency_profile: Object.freeze({
      ...loaded.sufficiency_profile,
      min_hint_relevance: profileThreshold,
      // Force-enable so threshold mutation is observable (production stays off).
      sufficient_enabled: true
    }),
    encoder: { encode: async () => new Float32Array(1024) },
    vector_index: {
      search: () => new Map([['claim:regional-fish-exploitation', 0.9]])
    },
    core: {
      resolveWorldKnowledge() {
        return {
          schema: 'world_knowledge_slice_v1',
          pack_ref: loaded.bundle.manifest.pack_ref,
          pack_revision: loaded.bundle.manifest.revision_id,
          purpose: 'semantic_resolution',
          coverage: [{ domain: 'environment', status: 'covered' }],
          verdict: 'supported',
          hard_constraints: [],
          facts: [{ claim_ref: 'claim:regional-fish-exploitation',
            runtime_text: 'fish' }],
          disputes: [],
          gaps: [],
          context_text: 'fish',
          search_hint_hits: [true],
          search_hint_relevance: [0.30],
          rerank_applied: false
        };
      },
      admittedCandidateRefs() { return ['claim:regional-fish-exploitation']; }
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
            requested_predicates: [],
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
  const grounded = await grounder.ground({
    request_id: 'turn:sufficiency-profile',
    remaining_intent: 'Можно ли здесь добыть рыбу?'
  }, 'semantic_resolution');
  assert.equal(grounded.world_knowledge.sufficiency, 'PARTIAL_KNOWLEDGE');
  assert.equal(
    groundingSufficiencyOf({
      facts: grounded.world_knowledge.facts,
      hard_constraints: [],
      disputes: [],
      coverage: [{ domain: 'environment', status: 'covered' }],
      search_hint_hits: [true],
      search_hint_relevance: [0.30]
    }, { minHintRelevance: DEFAULT_MIN_HINT_RELEVANCE, sufficientEnabled: true }),
    'SUFFICIENT_KNOWLEDGE',
    'control: same relevance is SUFFICIENT under DEFAULT 0.28');
  await loaded.encoder?.close?.();
});

test('grounding with sufficient_enabled false never emits SUFFICIENT', async () => {
  const loaded = await loadProductionWorldKnowledge({ rootDir: ROOT });
  assert.equal(loaded.sufficiency_profile.sufficient_enabled, false);
  const worldKnowledge = {
    ...loaded,
    encoder: { encode: async () => new Float32Array(1024) },
    vector_index: {
      search: () => new Map([['claim:regional-fish-exploitation', 0.9]])
    },
    core: {
      resolveWorldKnowledge() {
        return {
          schema: 'world_knowledge_slice_v1',
          pack_ref: loaded.bundle.manifest.pack_ref,
          pack_revision: loaded.bundle.manifest.revision_id,
          purpose: 'semantic_resolution',
          coverage: [{ domain: 'environment', status: 'covered' }],
          verdict: 'supported',
          hard_constraints: [],
          facts: [{ claim_ref: 'claim:regional-fish-exploitation',
            runtime_text: 'fish' }],
          disputes: [],
          gaps: [],
          context_text: 'fish',
          search_hint_hits: [true],
          search_hint_relevance: [0.99],
          rerank_applied: false
        };
      },
      admittedCandidateRefs() { return ['claim:regional-fish-exploitation']; }
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
            requested_predicates: [],
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
  const grounded = await grounder.ground({
    request_id: 'turn:sufficient-disabled',
    remaining_intent: 'Можно ли здесь добыть рыбу?'
  }, 'semantic_resolution');
  assert.equal(grounded.world_knowledge.sufficiency, 'PARTIAL_KNOWLEDGE');
  await loaded.encoder?.close?.();
});

test('grounding passes rerankScores into Core when D21 gate open', async () => {
  const loaded = await loadProductionWorldKnowledge({ rootDir: ROOT });
  const resolveCalls = [];
  const admittedCalls = [];
  const realResolve = loaded.core.resolveWorldKnowledge.bind(loaded.core);
  const realAdmitted = loaded.core.admittedCandidateRefs.bind(loaded.core);
  const core = {
    admittedCandidateRefs(query, options) {
      const refs = realAdmitted(query, options);
      admittedCalls.push(refs);
      return refs;
    },
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
  const scoredRefs = [];
  const worldKnowledge = {
    ...loaded,
    core,
    reranker_profile: openProfile,
    reranker: {
      scorePairs: async ({ candidates }) => {
        scoredRefs.push(...candidates.map((entry) => entry.claim_ref));
        return new Map(candidates.map((entry, index) =>
          [entry.claim_ref, index === 0 ? 0.1 : 10 - index]));
      }
    },
    encoder: { encode: async () => new Float32Array(1024) },
    vector_index: {
      // Only one vector hit — admission may still add lexical/exact partners.
      search: () => new Map([['claim:regional-fish-exploitation', 0.9]])
    }
  };
  const diagnostics = [];
  const grounder = createProductionWorldKnowledgeGrounder({
    worldKnowledge,
    year: 1230,
    placeRefs: ['region_novgorod_land'],
    telemetry: { onDetail: (detail) => diagnostics.push(detail) },
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
  assert.ok(admittedCalls.length >= 1);
  const withRerank = resolveCalls.find((opts) => opts?.rerankScores instanceof Map);
  assert.ok(withRerank, 'Core must receive rerankScores when gate open');
  // Worker must score admitted set, not merely vector top-k.
  assert.deepEqual([...withRerank.rerankScores.keys()].sort(),
    [...admittedCalls[0]].sort());
  assert.ok(scoredRefs.length >= admittedCalls[0].length);
  const diag = diagnostics.find((entry) =>
    entry?.schema === 'world_knowledge_grounding_diagnostic_v1'
    && entry?.retrieval_observability);
  assert.equal(diag?.retrieval_observability?.rerank_applied, true);
  assert.ok(diag?.retrieval_observability?.rerank_scored_candidate_count
    >= admittedCalls[0].length);
  await loaded.encoder?.close?.();
});

test('open gate with full admitted scores changes packed order', async () => {
  const loaded = await loadProductionWorldKnowledge({ rootDir: ROOT });
  const envClaims = loaded.bundle.claims
    .filter((claim) => claim.domain === 'environment')
    .map((claim) => claim.claim_ref);
  assert.ok(envClaims.length >= 2);
  const [alpha, beta] = envClaims;
  const query = {
    schema: 'world_knowledge_query_v1',
    pack_ref: loaded.bundle.manifest.pack_ref,
    pack_revision: loaded.bundle.manifest.revision_id,
    purpose: 'semantic_resolution',
    query_locale: 'ru',
    domains: ['environment'],
    focus_refs: [],
    requested_predicates: [],
    search_hints: [],
    context: {
      time: { year: 1230 },
      place_refs: ['region_novgorod_land'],
      actor_facets: {},
      conditions: { started_historical_events: [] }
    },
    budget: { max_facts: 2, max_candidates: 2, max_context_chars: 5000 }
  };
  const vectorScores = new Map([[alpha, 0.95], [beta, 0.90]]);
  const baseline = loaded.core.resolveWorldKnowledge(query, { vectorScores });
  assert.equal(baseline.rerank_applied, false);
  assert.equal(baseline.facts[0]?.claim_ref, alpha);
  const admitted = loaded.core.admittedCandidateRefs(query, { vectorScores });
  assert.ok(admitted.includes(alpha) && admitted.includes(beta));
  // Invert: score baseline-first last so packed order flips.
  const inverted = new Map(admitted.map((ref) => [ref, ref === alpha ? 0.01 : 10]));
  const reranked = loaded.core.resolveWorldKnowledge(query, {
    vectorScores, rerankScores: inverted
  });
  assert.equal(reranked.rerank_applied, true);
  assert.notEqual(reranked.facts[0]?.claim_ref, alpha,
    'rerank must change packed order when all admitted are scored');
  await loaded.encoder?.close?.();
});

test('A1: scorePairs receives lexical-only admitted refs, not vector top-k alone', async () => {
  // Mutation kill: if grounding scores only vectorScores.keys(), lexical-only
  // admitted claim never reaches scorePairs and all-or-nothing rerank fails.
  const loaded = await loadProductionWorldKnowledge({ rootDir: ROOT });
  const vectorOnly = 'claim:vector-only-hit';
  const lexicalOnly = 'claim:lexical-only-admitted';
  const scoredRefs = [];
  const worldKnowledge = {
    ...loaded,
    core: {
      admittedCandidateRefs() {
        return Object.freeze([vectorOnly, lexicalOnly]);
      },
      resolveWorldKnowledge(_query, options) {
        assert.ok(options?.rerankScores instanceof Map);
        assert.deepEqual([...options.rerankScores.keys()].sort(),
          [lexicalOnly, vectorOnly].sort());
        return {
          schema: 'world_knowledge_slice_v1',
          pack_ref: loaded.bundle.manifest.pack_ref,
          pack_revision: loaded.bundle.manifest.revision_id,
          purpose: 'semantic_resolution',
          coverage: [{ domain: 'environment', status: 'covered' }],
          verdict: 'supported',
          hard_constraints: [],
          facts: [{ claim_ref: lexicalOnly }],
          disputes: [],
          gaps: [],
          context_text: '',
          search_hint_hits: [true],
          search_hint_relevance: [0.9],
          rerank_applied: true
        };
      }
    },
    reranker_profile: Object.freeze({
      ...loaded.reranker_profile,
      production_enabled: true,
      gate: { ...loaded.reranker_profile.gate, decision: 'enabled' }
    }),
    reranker: {
      scorePairs: async ({ candidates }) => {
        scoredRefs.push(...candidates.map((entry) => entry.claim_ref));
        return new Map(candidates.map((entry) => [entry.claim_ref, 1]));
      }
    },
    encoder: { encode: async () => new Float32Array(1024) },
    vector_index: {
      search: () => new Map([[vectorOnly, 0.99]])
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
            focus_refs: [],
            requested_predicates: [],
            search_hints: ['рыба']
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
    request_id: 'turn:a1-lexical-score',
    remaining_intent: 'Есть ли здесь рыба?'
  }, 'semantic_resolution');
  assert.ok(scoredRefs.includes(lexicalOnly),
    'scorePairs must include lexical-only admitted claim');
  assert.ok(scoredRefs.includes(vectorOnly));
  await loaded.encoder?.close?.();
});

test('S2: grounding falls back when min_hint_relevance is non-finite', async () => {
  // Mutation kill: if grounding passes NaN through, sufficiency threshold
  // collapses to 0 and weak relevance becomes SUFFICIENT.
  const loaded = await loadProductionWorldKnowledge({ rootDir: ROOT });
  const worldKnowledge = {
    ...loaded,
    sufficiency_profile: Object.freeze({
      ...loaded.sufficiency_profile,
      min_hint_relevance: Number.NaN,
      sufficient_enabled: true
    }),
    encoder: { encode: async () => new Float32Array(1024) },
    vector_index: {
      search: () => new Map([['claim:regional-fish-exploitation', 0.9]])
    },
    core: {
      resolveWorldKnowledge() {
        return {
          schema: 'world_knowledge_slice_v1',
          pack_ref: loaded.bundle.manifest.pack_ref,
          pack_revision: loaded.bundle.manifest.revision_id,
          purpose: 'semantic_resolution',
          coverage: [{ domain: 'environment', status: 'covered' }],
          verdict: 'supported',
          hard_constraints: [],
          facts: [{ claim_ref: 'claim:regional-fish-exploitation' }],
          disputes: [],
          gaps: [],
          context_text: '',
          search_hint_hits: [true],
          search_hint_relevance: [0.10]
        };
      }
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
            requested_predicates: [],
            search_hints: ['рыба']
          },
          provider_record: {
            scope: 'turn_runtime', role_id: 'world_knowledge_query_planner',
            provider: 'test', model: 'test'
          }
        };
      }
    }
  });
  const grounded = await grounder.ground({
    request_id: 'turn:s2-nonfinite-floor',
    remaining_intent: 'Есть ли здесь рыба?'
  }, 'semantic_resolution');
  assert.equal(grounded.world_knowledge.sufficiency, 'PARTIAL_KNOWLEDGE');
  // Control: same relevance clears DEFAULT floor (0.28) when finite + enabled.
  assert.equal(groundingSufficiencyOf({
    facts: [{ claim_ref: 'c' }], hard_constraints: [], disputes: [],
    coverage: [{ domain: 'environment', status: 'covered' }],
    search_hint_hits: [true], search_hint_relevance: [0.10], verdict: 'supported'
  }, { minHintRelevance: DEFAULT_MIN_HINT_RELEVANCE, sufficientEnabled: true }),
  'PARTIAL_KNOWLEDGE');
  await loaded.encoder?.close?.();
});

test('A3: production loader rejects sufficiency profile without sufficient_enabled', async () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'novgorod-suff-a3-'));
  try {
    const rel = 'data/world-catalogs/novgorod/world-knowledge';
    mkdirSync(join(tempRoot, rel, 'sufficiency-profiles'), { recursive: true });
    mkdirSync(join(tempRoot, rel, 'embedding-profiles'), { recursive: true });
    mkdirSync(join(tempRoot, rel, 'production-v2'), { recursive: true });
    for (const part of [
      'embedding-profiles/giga-480m-0826-v1.json',
      'embedding-profiles/bge-reranker-v2-m3-v1.json',
      'production-v2/runtime-bundle.json',
      'production-v2/vector-index.json',
      'production-v2/vectors.f32'
    ]) {
      try {
        symlinkSync(join(ROOT, rel, part), join(tempRoot, rel, part));
      } catch {
        copyFileSync(join(ROOT, rel, part), join(tempRoot, rel, part));
      }
    }
    const valid = JSON.parse(readFileSync(
      join(ROOT, rel, 'sufficiency-profiles/giga-cosine-v1.json'), 'utf8'));
    const { sufficient_enabled: _drop, ...withoutFlag } = valid;
    writeFileSync(join(tempRoot, rel, 'sufficiency-profiles/giga-cosine-v1.json'),
      JSON.stringify(withoutFlag));
    await assert.rejects(
      () => loadProductionWorldKnowledge({ rootDir: tempRoot }),
      (err) => err instanceof TypeError
        && /sufficiency profile is invalid/.test(err.message));
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('C26: production loader rejects wrong sufficiency schema alone', async () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'novgorod-suff-c26-'));
  try {
    const rel = 'data/world-catalogs/novgorod/world-knowledge';
    mkdirSync(join(tempRoot, rel, 'sufficiency-profiles'), { recursive: true });
    mkdirSync(join(tempRoot, rel, 'embedding-profiles'), { recursive: true });
    mkdirSync(join(tempRoot, rel, 'production-v2'), { recursive: true });
    for (const part of [
      'embedding-profiles/giga-480m-0826-v1.json',
      'embedding-profiles/bge-reranker-v2-m3-v1.json',
      'production-v2/runtime-bundle.json',
      'production-v2/vector-index.json',
      'production-v2/vectors.f32'
    ]) {
      try {
        symlinkSync(join(ROOT, rel, part), join(tempRoot, rel, part));
      } catch {
        copyFileSync(join(ROOT, rel, part), join(tempRoot, rel, part));
      }
    }
    const valid = JSON.parse(readFileSync(
      join(ROOT, rel, 'sufficiency-profiles/giga-cosine-v1.json'), 'utf8'));
    writeFileSync(join(tempRoot, rel, 'sufficiency-profiles/giga-cosine-v1.json'),
      JSON.stringify({ ...valid, schema: 'world_knowledge_sufficiency_profile_v0' }));
    await assert.rejects(
      () => loadProductionWorldKnowledge({ rootDir: tempRoot }),
      (err) => err instanceof TypeError
        && /sufficiency profile is invalid/.test(err.message));
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});
