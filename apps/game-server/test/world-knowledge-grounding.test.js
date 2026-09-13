import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createWorldKnowledgeCore, WorldKnowledgeError } from '@rus/world-knowledge';
import { loadProductionWorldKnowledge } from
  '../src/internal/world-knowledge-production.js';
import { createProductionWorldKnowledgeGrounder, wkClosure } from
  '../src/runtime/world-knowledge-grounding.js';
import { loadLowerDvinaTraceMaterializationBundle } from
  '../src/internal/lower-dvina-trace-phase-1a-bundle.js';
import { createLowerDvinaTraceTurnStepModel } from '../src/runtime/lower-dvina-trace-phase-2-llm.js';

test('production loader requires the exact encoder readiness at startup', async () => {
  let readyCalls = 0;
  const loaded = await loadProductionWorldKnowledge({
    rootDir: fileURLToPath(new URL('../../..', import.meta.url)),
    requireEncoderReady: true,
    encoderFactory: ({ profilePath }) => {
      assert.match(profilePath, /giga-480m-0826-v1\.json$/u);
      return { ready: async () => { readyCalls += 1; },
        encode: async () => new Float32Array(1024), close: async () => {} };
    }
  });
  assert.equal(readyCalls, 1);
  assert.equal(loaded.embedding_profile.embedding_profile_ref,
    'wk-embedding:giga-480m-0826:v1');
  assert.equal(loaded.vector_index.dimension, 1024);
});

test('production grounding plans once and injects only an applicable bounded slice', async (t) => {
  const calls = [];
  const diagnostics = [];
  const gameplayTraces = [];
  const loaded = await loadProductionWorldKnowledge({
    rootDir: fileURLToPath(new URL('../../..', import.meta.url))
  });
  const worldKnowledge = { ...loaded,
    encoder: { encode: async () => new Float32Array(1024) },
    vector_index: { search: () => new Map([
      ['claim:regional-fish-exploitation', 1]
    ]) } };
  const grounder = createProductionWorldKnowledgeGrounder({ worldKnowledge,
    year: 1230, placeRefs: ['region_novgorod_land'],
    telemetry: { onDetail: (entry) => diagnostics.push(entry),
      onGameplayTrace: (entry) => gameplayTraces.push(entry) },
    roleRunner: { async run(call) {
      calls.push(call);
      return { output: {
        schema: 'world_knowledge_query_plan_v1', query_locale: 'ru',
        domains: ['environment'],
        focus_refs: ['wk:environment:regional-fish-exploitation'],
        requested_predicates: ['supported_fact'],
        search_hints: ['рыбные ресурсы']
      } };
    } } });
  const request = { request_id: 'turn:1', remaining_intent:
    'Можно ли здесь добыть рыбу?', player_safe_state: { hidden: 'never-trace-me' } };
  const first = await grounder.ground(request, 'semantic_resolution');
  const second = await grounder.ground(request, 'semantic_resolution');

  assert.equal(calls.length, 1);
  const plannerRequest = JSON.parse(calls[0].messages[1].content);
  const applicableDomains = worldKnowledge.bundle.coverage_profiles
    .filter(profile => profile.status === 'production'
      && profile.runtime_requirement !== 'not_active'
      && profile.purposes.includes('semantic_resolution'))
    .map(profile => profile.domain);
  assert.deepEqual(plannerRequest.allowed_domains, [...new Set(applicableDomains)].sort());
  assert.match(calls[0].messages[0].content,
    /exactly these six keys: schema, query_locale, domains, focus_refs, requested_predicates, search_hints/u);
  assert.match(calls[0].messages[0].content,
    /The key is domains, never selected_domains/u);
  assert.match(calls[0].messages[0].content,
    /select knowledge about that evidential relationship or limit, not attributes of the proposed conclusion/u);
  assert.match(calls[0].messages[0].content,
    /do not invent alternative histories, causes, entities, or explanations/u);
  assert.match(calls[0].messages[0].content,
    /Return requested_predicates as an empty array/u);
  assert.match(calls[0].messages[0].content,
    /include the approved classification or use-context relationship needed for that application/u);
  assert.match(calls[0].messages[0].content,
    /For conjunctive requirements, cover every mandatory relationship/u);
  assert.match(calls[0].messages[0].content,
    /Never retrieve to predict whether an action will succeed, be heard/u);
  assert.match(calls[0].messages[0].content,
    /purpose, hope, or expected result does not itself create a factual need/u);
  assert.match(calls[0].messages[0].content,
    /explicit alternatives permit one result, retrieve at least one complete admissible alternative/u);
  assert.match(calls[0].messages[0].content,
    /shared mandatory qualifiers and applicable limits/u);
  assert.doesNotMatch(calls[0].messages[0].content, /including each independent part of a multi-part question/u);
  assert.doesNotMatch(calls[0].messages[0].content, /Focus claim domains:/u);
  const owners = plannerRequest.available_knowledge_refs;
  assert.deepEqual(owners['wk:environment:regional-fish-exploitation'], {
    domains: ['environment'],
    label: 'Использование рыбных ресурсов исторически засвидетельствовано на региональном масштабе средневекового Новгорода',
    description: 'Использование рыбных ресурсов исторически засвидетельствовано на региональном масштабе средневекового Новгорода; это не устанавливает вид, запас, доступ, сезон или улов в сцене.'
  });
  assert.ok(Object.keys(owners).length <= 256);
  assert.ok(Object.keys(owners).every((ref) =>
    !calls[0].messages[0].content.includes(ref)));
  assert.equal(first, second);
  assert.equal(Object.hasOwn(request, 'world_knowledge'), false);
  assert.equal(first.world_knowledge.pack_revision, 'revision:production-v1');
  assert.equal(first.world_knowledge.facts[0].claim_ref,
    'claim:regional-fish-exploitation');
  assert.match(first.world_knowledge.context_text,
    /не устанавливает вид, запас, доступ, сезон или улов/u);
  assert.equal(diagnostics[0].planner_called, true);
  assert.deepEqual(diagnostics[0].focus_refs,
    ['wk:environment:regional-fish-exploitation']);
  assert.equal(diagnostics[0].query_locale, 'ru');
  assert.equal(Object.isFrozen(diagnostics[0].focus_refs), true);
  assert.equal(Object.hasOwn(diagnostics[0], 'search_hints'), false);
  assert.equal(diagnostics[0].claim_refs.includes(
    'claim:regional-fish-exploitation'), true);
  assert.ok(diagnostics[0].claim_refs.length <= 12);
  assertRetrievalObservability(diagnostics[0].retrieval_observability, first);
  assert.equal(gameplayTraces.length, 1);
  const trace = gameplayTraces[0];
  assert.equal(trace.event, 'world_knowledge_resolved');
  assert.equal(trace.schema, 'world_knowledge_boundary_trace_v1');
  assert.deepEqual(trace.safe_need, { source: 'remaining_intent',
    value: 'Можно ли здесь добыть рыбу?' });
  assert.deepEqual(trace.planner_request, {
    schema: plannerRequest.schema, pack_ref: plannerRequest.pack_ref,
    purpose: plannerRequest.purpose, input_locale: plannerRequest.input_locale,
    semantic_input: plannerRequest.semantic_input,
    situation_summary: plannerRequest.situation_summary,
    allowed_domains: plannerRequest.allowed_domains,
    available_knowledge_refs: Object.keys(owners),
    planner_limits: plannerRequest.planner_limits
  });
  assert.deepEqual(trace.planner_plan.search_hints, ['рыбные ресурсы']);
  assert.deepEqual(trace.query.search_hints, ['рыбные ресурсы']);
  const { context_text, ...structured } = first.world_knowledge;
  assert.deepEqual(trace.core_result, structured);
  assert.deepEqual(trace.consumer, { purpose: 'semantic_resolution', input: {
    request_schema: null, request_identity: 'turn:1',
    safe_need: trace.safe_need, world_knowledge: structured } });
  assert.equal(JSON.stringify(trace).includes('never-trace-me'), false);
  assertRetrievalObservability(trace.retrieval_observability, first);
  assert.deepEqual(trace.retrieval_observability,
    diagnostics[0].retrieval_observability);
  assert.equal(Object.hasOwn(first, 'gameplay_traces'), false);
  const beforeConsumer = structuredClone(first);
  let consumerWire;
  await createLowerDvinaTraceTurnStepModel({ roleRunner: { async run(call) {
    consumerWire = JSON.parse(call.messages[1].content);
    return { output: {} };
  } } })(first);
  assert.deepEqual(consumerWire, { ...first, world_knowledge: structured });
  assert.ok(context_text.includes(first.world_knowledge.facts[0].runtime_text));
  assert.deepEqual(first, beforeConsumer);
  t.diagnostic(`Production WK wire reduction: ${JSON.stringify(first).length - JSON.stringify(consumerWire).length} chars.`);
});

test('an explicit empty plan records NO_KNOWLEDGE_REQUIRED without retrieval', async () => {
  const loaded = await loadProductionWorldKnowledge({
    rootDir: fileURLToPath(new URL('../../..', import.meta.url))
  });
  let coreCalls = 0;
  let encoderCalls = 0;
  let vectorCalls = 0;
  const diagnostics = [];
  const traces = [];
  const grounder = createProductionWorldKnowledgeGrounder({
    worldKnowledge: { ...loaded,
      core: { resolveWorldKnowledge() { coreCalls += 1; } },
      encoder: { async encode() { encoderCalls += 1; return new Float32Array(1024); } },
      vector_index: { search() { vectorCalls += 1; return new Map(); } } },
    telemetry: { onDetail: entry => diagnostics.push(entry),
      onGameplayTrace: entry => traces.push(entry) },
    roleRunner: { async run(call) {
      assert.match(call.messages[0].content, /canonical NO_KNOWLEDGE_REQUIRED plan/u);
      return { output: { schema: 'world_knowledge_query_plan_v1',
        query_locale: 'ru', domains: [], focus_refs: [],
        requested_predicates: [], search_hints: [] } };
    } }
  });
  const request = { request_id: 'turn:no-wk', remaining_intent: 'Громко зову Онисима.',
    player_safe_state: {} };
  const grounded = await grounder.ground(request, 'semantic_resolution');
  assert.equal(coreCalls, 0);
  assert.equal(encoderCalls, 0);
  assert.equal(vectorCalls, 0);
  assert.equal(grounded.world_knowledge.sufficiency,
    'NO_KNOWLEDGE_REQUIRED');
  assert.deepEqual(grounded.world_knowledge.facts, []);
  assert.match(wkClosure(grounded).join(' '),
    /Do not add a historical, scientific, social, craft/u);
  assert.equal(diagnostics[0].planner_called, true);
  assert.equal(diagnostics[0].vector_status, 'not_required');
  assert.equal(diagnostics[0].retrieval_observability, null);
  assert.deepEqual(diagnostics[0].domains, []);
  assert.equal(traces[0].event, 'world_knowledge_not_required');
  assert.equal(traces[0].query, null);
  assert.equal(traces[0].core_result, null);
  assert.deepEqual(traces[0].consumer.input.world_knowledge,
    grounded.world_knowledge);
});

function assertRetrievalObservability(observability, grounded) {
  assert.equal(observability.pack_ref, 'wk-pack:novgorod-1230');
  assert.equal(observability.pack_revision, 'revision:production-v1');
  assert.equal(observability.embedding_profile_ref,
    'wk-embedding:giga-480m-0826:v1');
  assert.equal(observability.model_id,
    'ai-sage/Giga-Embeddings-instruct-480M-0826');
  assert.equal(observability.model_revision,
    '0c94f705aa35719324fb46f7e75b0a5c275da6e4');
  assert.equal(observability.encoder, 'giga-query-encoder');
  assert.equal(observability.vector_index, 'flat');
  assert.deepEqual(observability.vector_hit_refs,
    ['claim:regional-fish-exploitation']);
  assert.equal(observability.vector_hit_count, 1);
  assert.equal(observability.lexical_ms, null);
  assert.equal(observability.lexical_status, 'included_in_core_resolution');
  assert.equal(observability.cache_outcome, 'miss');
  assert.equal(observability.hard_constraint_count,
    grounded.world_knowledge.hard_constraints.length);
  assert.deepEqual(observability.gaps, grounded.world_knowledge.gaps);
  for (const field of ['query_embedding_ms', 'vector_scan_ms',
    'core_resolution_ms', 'total_retrieval_ms']) {
    assert.equal(Number.isFinite(observability[field]), true, field);
    assert.ok(observability[field] >= 0, field);
  }
}

test('all hints use one combined query embedding and one vector lookup', async () => {
  const bundle = JSON.parse(await readFile(new URL(
    '../../../data/world-catalogs/novgorod/world-knowledge/production-v1/runtime-bundle.json',
    import.meta.url), 'utf8'));
  const template = bundle.claims.find(claim => claim.domain === 'physics_material_science');
  bundle.claims = ['first', 'second', 'third', 'fourth', 'fifth'].map((id) => ({
    ...structuredClone(template), claim_ref: `claim:test-${id}`,
    applicability: { context_scope: 'universal' },
    localizations: Object.fromEntries(bundle.manifest.supported_locales.map(locale =>
      [locale, { runtime_text: `Independent test premise ${id}.` }]))
  }));
  const refs = bundle.claims.map(claim => claim.claim_ref);
  bundle.exact_indexes.concept_to_claim_refs = {};
  bundle.exact_indexes.domain_to_claim_refs = { physics_material_science: refs };
  bundle.exact_indexes.predicate_to_claim_refs = { [template.predicate]: refs };
  bundle.lexical_indexes = Object.fromEntries(bundle.manifest.supported_locales.map(locale => [locale, {}]));
  for (const key of ['time_to_claim_refs', 'place_to_claim_refs',
    'actor_facet_to_claim_refs', 'conflict_group_to_claim_refs']) bundle.structured_indexes[key] = {};
  const core = createWorldKnowledgeCore(bundle);
  const encoded = [];
  const searches = [];
  const traces = [];
  let coreCalls = 0;
  let finalScores;
  let finalQuery;
  const hints = ['How does one physical relationship operate?',
    'What establishes a different independent relationship?'];
  const grounder = createProductionWorldKnowledgeGrounder({
    worldKnowledge: { bundle,
      core: { resolveWorldKnowledge(query, options) {
        coreCalls += 1;
        finalQuery = query;
        finalScores = options.vectorScores;
        return core.resolveWorldKnowledge(query, options);
      } },
      encoder: { async encode(text) { encoded.push(text); return [1]; } },
      vector_index: { search(vector, options) {
        searches.push(options);
        const ranked = [[refs[0], 0.8], [refs[1], 0.9],
          [refs[2], 0.6], [refs[3], 0.5], [refs[4], 0.4]];
        return new Map(ranked.slice(0, options.limit));
      } } },
    telemetry: { onGameplayTrace: trace => traces.push(trace) },
    roleRunner: { async run() { return { output: {
      schema: 'world_knowledge_query_plan_v1', query_locale: 'en',
      domains: ['physics_material_science'], focus_refs: [],
      requested_predicates: [], search_hints: hints
    } }; } }
  });
  const grounded = await grounder.ground({ semantic_input: hints.join(' '),
    input_locale: 'en', player_safe_state: {} }, 'semantic_resolution');
  assert.deepEqual(encoded, [hints.join('\n')]);
  assert.deepEqual(searches, [{ locale: 'en',
    domains: ['physics_material_science'], limit: finalQuery.budget.max_candidates }]);
  assert.equal(coreCalls, 1);
  assert.equal(finalQuery.budget.max_candidates, 12);
  assert.equal(finalScores.get(refs[0]), 0.8);
  assert.equal(finalScores.get(refs[4]), 0.4);
  assert.deepEqual(new Set(grounded.world_knowledge.facts.map(fact => fact.claim_ref)), new Set(refs));
  assert.equal(traces[0].retrieval_observability.vector_hit_count, 5);
});
