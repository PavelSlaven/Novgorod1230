import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { loadProductionWorldKnowledge } from
  '../src/internal/world-knowledge-production.js';
import { createProductionWorldKnowledgeGrounder } from
  '../src/runtime/world-knowledge-grounding.js';
import { loadLowerDvinaTraceMaterializationBundle } from
  '../src/internal/lower-dvina-trace-phase-1a-bundle.js';

test('production grounding plans once and injects only an applicable bounded slice', async () => {
  const calls = [];
  const diagnostics = [];
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
    telemetry: { onDetail: (entry) => diagnostics.push(entry) },
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
    'Можно ли здесь добыть рыбу?', player_safe_state: {} };
  const first = await grounder.ground(request, 'semantic_resolution');
  const second = await grounder.ground(request, 'semantic_resolution');

  assert.equal(calls.length, 1);
  assert.match(calls[0].messages[0].content,
    /exactly these six keys: schema, query_locale, domains, focus_refs, requested_predicates, search_hints/u);
  assert.match(calls[0].messages[0].content,
    /The key is domains, never selected_domains/u);
  assert.equal(first, second);
  assert.equal(Object.hasOwn(request, 'world_knowledge'), false);
  assert.equal(first.world_knowledge.pack_revision, 'revision:production-v1');
  assert.equal(first.world_knowledge.facts[0].claim_ref,
    'claim:regional-fish-exploitation');
  assert.match(first.world_knowledge.context_text,
    /не устанавливает вид, запас, доступ, сезон или улов/u);
  assert.equal(diagnostics[0].planner_called, true);
  assert.equal(diagnostics[0].claim_refs.includes(
    'claim:regional-fish-exploitation'), true);
  assert.ok(diagnostics[0].claim_refs.length <= 12);
});

test('grounding uses current safe context and keeps lexical retrieval when vectors fail', async () => {
  const rootDir = fileURLToPath(new URL('../../..', import.meta.url));
  const [loaded, scenario] = await Promise.all([
    loadProductionWorldKnowledge({ rootDir }),
    loadLowerDvinaTraceMaterializationBundle({ rootDir,
      scenarioDefinitionRevision: 32 })
  ]);
  let query;
  const diagnostics = [];
  const worldKnowledge = { ...loaded,
    calendar_profile: scenario.calendar_profile,
    core: { resolveWorldKnowledge(value, options) {
      query = value;
      return loaded.core.resolveWorldKnowledge(value, options);
    } },
    encoder: { encode: async () => {
      const error = new Error('worker unavailable');
      error.code = 'WK_VECTOR_WORKER_EXIT';
      throw error;
    } } };
  const grounder = createProductionWorldKnowledgeGrounder({ worldKnowledge,
    placeRefs: ['region_novgorod_land'],
    telemetry: { onDetail: (entry) => diagnostics.push(entry) },
    roleRunner: { async run() {
      return { output: {
        schema: 'world_knowledge_query_plan_v1', query_locale: 'ru',
        domains: ['environment'],
        focus_refs: ['wk:environment:regional-fish-exploitation'],
        requested_predicates: ['supported_fact'],
        search_hints: ['добыча рыбы']
      }, provider_record: { duration_ms: 5,
        usage: { input_tokens: 20, output_tokens: 10 } } };
    } } });
  const request = { request_id: 'turn:context',
    remaining_intent: 'Можно ли здесь добыть рыбу?',
    actor: { social_status: 'hidden-hostile-field' },
    player_safe_state: {
      occupation_ref: 'occupation:fisher',
      clock: { whole_minutes: String(365 * 1440),
        subminute_numerator: '0', subminute_denominator: '1' },
      position: { location_ref: 'location:current-bank',
        g5_node_id: 'g5:current-bank' }
    } };
  const grounded = await grounder.ground(request, 'semantic_resolution');

  assert.equal(query.context.time.year, 1231);
  assert.deepEqual(query.context.place_refs, [
    'g5:current-bank', 'location:current-bank', 'region_novgorod_land'
  ]);
  assert.deepEqual(query.context.actor_facets,
    { occupation_ref: 'occupation:fisher' });
  assert.equal(grounded.world_knowledge.facts[0].claim_ref,
    'claim:regional-fish-exploitation');
  assert.equal(diagnostics[0].vector_status,
    'structured_lexical_fallback');
  assert.equal(diagnostics[0].vector_error_code, 'WK_VECTOR_WORKER_EXIT');
  assert.equal(diagnostics[0].planner_calls[0].usage.input_tokens, 20);
  assert.ok(diagnostics[0].planner_ms >= 0);
});
