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

test('production normalization removes unavailable domains and refs without changing authority', async () => {
  const bundle = JSON.parse(await readFile(new URL(
    '../../../data/world-catalogs/novgorod/world-knowledge/production-v1/runtime-bundle.json',
    import.meta.url), 'utf8'));
  const inputs = [];
  const encoded = [];
  const grounder = createProductionWorldKnowledgeGrounder({
    worldKnowledge: { bundle, core: createWorldKnowledgeCore(bundle),
      encoder: { encode: async (text) => { encoded.push(text); return new Float32Array(1024); } },
      vector_index: { search: () => new Map() } },
    roleRunner: { async run(call) {
      const input = JSON.parse(call.messages[1].content);
      inputs.push(input.request ?? input);
      return { output: { schema: 'world_knowledge_query_plan_v1',
        query_locale: 'ru', domains: ['environment', 'biology'],
        focus_refs: ['wk:unavailable-ref'],
        requested_predicates: [], search_hints: [] } };
    } }
  });
  await grounder.ground({ semantic_input: 'Контекст места', player_safe_state: {} },
    'semantic_resolution');
  assert.equal(inputs.length, 1);
  assert.deepEqual(encoded, ['Контекст места']);
});

test('an unused focus does not block a supplied physical premise or force its historical domain', async () => {
  const bundle = JSON.parse(await readFile(new URL(
    '../../../data/world-catalogs/novgorod/world-knowledge/production-v1/runtime-bundle.json',
    import.meta.url), 'utf8'));
  let calls = 0;
  const plan = { schema: 'world_knowledge_query_plan_v1', query_locale: 'en',
    domains: ['craft_technology', 'physics_material_science'],
    focus_refs: ['wk:physics_material_science:fibre-twisting',
      'wk:physics_material_science:plant-cellulosic-fibres'],
    requested_predicates: [], search_hints: ['twisting textile fibres to form yarn'] };
  const grounder = createProductionWorldKnowledgeGrounder({
    worldKnowledge: { bundle, core: createWorldKnowledgeCore(bundle),
      encoder: { encode: async () => new Float32Array(1024) },
      vector_index: { search: () => new Map() } },
    placeRefs: ['region_novgorod_land'],
    roleRunner: { async run() { calls += 1; return { output: plan }; } }
  });
  const grounded = await grounder.ground({ input_locale: 'en',
    semantic_input: 'What transformation can twisting textile fibres produce?',
    player_safe_state: {} }, 'semantic_resolution');
  assert.equal(calls, 1);
  assert.ok(grounded.world_knowledge.facts.some(fact => fact.claim_ref === 'claim:textile-fibres-twist-yarn'));
  assert.ok(grounded.world_knowledge.facts.every(fact => fact.domain !== 'material_culture'));
});

test('a material focus can retrieve its chemical facts without expanding selected domains', async () => {
  const bundle = JSON.parse(await readFile(new URL(
    '../../../data/world-catalogs/novgorod/world-knowledge/production-v1/runtime-bundle.json',
    import.meta.url), 'utf8'));
  const diagnostics = [];
  const grounder = createProductionWorldKnowledgeGrounder({
    worldKnowledge: { bundle, core: createWorldKnowledgeCore(bundle),
      encoder: { encode: async () => new Float32Array(1024) },
      vector_index: { search: () => new Map() } },
    placeRefs: ['region_novgorod_land'], telemetry: { onDetail: row => diagnostics.push(row) },
    roleRunner: { async run(call) {
      assert.deepEqual(JSON.parse(call.messages[1].content).available_knowledge_refs[
        'wk:material_culture:vegetable-tanned-leather'],
      { domains: ['chemistry_process', 'physics_material_science'],
        label: 'Vegetable-tanned leather',
        description: "Leather with vegetable tannage; a particular object's processing needs separate grounding." });
      return { output: { schema: 'world_knowledge_query_plan_v1', query_locale: 'en',
        domains: ['chemistry_process'], focus_refs: ['wk:material_culture:vegetable-tanned-leather'],
        requested_predicates: [], search_hints: ['tanning prepared hide collagen tannins'] } };
    } }
  });
  const result = await grounder.ground({ input_locale: 'en',
    semantic_input: 'What inputs and change distinguish tanning from drying?',
    player_safe_state: {} }, 'semantic_resolution');
  assert.deepEqual(diagnostics[0].domains, ['chemistry_process']);
  assert.deepEqual(new Set(result.world_knowledge.facts.map(fact => fact.claim_ref)), new Set([
    'claim:vegetable-tanning-prepared-hide', 'claim:vegetable-tanning-collagen-stabilization'
  ]));
});

test('grounding fails closed when query encoding fails, then retries without lexical fallback', async () => {
  const rootDir = fileURLToPath(new URL('../../..', import.meta.url));
  const [loaded, scenario] = await Promise.all([
    loadProductionWorldKnowledge({ rootDir }),
    loadLowerDvinaTraceMaterializationBundle({ rootDir,
      scenarioDefinitionRevision: 32 })
  ]);
  let query;
  let coreCalls = 0;
  let encoderCalls = 0;
  const worldKnowledge = { ...loaded,
    calendar_profile: scenario.calendar_profile,
    core: { resolveWorldKnowledge(value, options) {
      coreCalls += 1;
      query = value;
      return loaded.core.resolveWorldKnowledge(value, options);
    } },
    encoder: { encode: async () => {
      encoderCalls += 1;
      if (encoderCalls === 1) {
        const error = new Error('worker unavailable');
        error.code = 'WK_VECTOR_WORKER_EXIT';
        throw error;
      }
      return new Float32Array(1024);
    } } };
  const grounder = createProductionWorldKnowledgeGrounder({ worldKnowledge,
    placeRefs: ['region_novgorod_land'],
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
  await assert.rejects(
    grounder.ground(request, 'semantic_resolution'),
    (error) => error instanceof WorldKnowledgeError
      && error.code === 'WORLD_KNOWLEDGE_UNAVAILABLE'
      && error.details.cause_code === 'WK_VECTOR_WORKER_EXIT'
  );
  assert.equal(coreCalls, 0);

  const grounded = await grounder.ground(request, 'semantic_resolution');

  assert.equal(query.context.time.year, 1231);
  assert.deepEqual(query.context.place_refs, [
    'g5:current-bank', 'location:current-bank', 'region_novgorod_land'
  ]);
  assert.deepEqual(query.context.actor_facets,
    { occupation_ref: 'occupation:fisher' });
  assert.equal(grounded.world_knowledge.facts[0].claim_ref,
    'claim:regional-fish-exploitation');
  assert.equal(coreCalls, 1);
  assert.equal(encoderCalls, 2);
});

test('grounding fails closed when the single vector scan fails without calling Core', async () => {
  const rootDir = fileURLToPath(new URL('../../..', import.meta.url));
  const loaded = await loadProductionWorldKnowledge({ rootDir });
  let coreCalls = 0;
  let scans = 0;
  const grounder = createProductionWorldKnowledgeGrounder({
    worldKnowledge: { ...loaded,
      core: { resolveWorldKnowledge() { coreCalls += 1; throw new Error('must not run'); } },
      encoder: { encode: async () => new Float32Array(1024) },
      vector_index: { search() {
        scans += 1;
        throw Object.assign(new Error('bad vector scan'),
        { code: 'WK_VECTOR_SCAN_FAILED' }); } } },
    roleRunner: { async run() { return { output: {
      schema: 'world_knowledge_query_plan_v1', query_locale: 'ru',
      domains: ['environment'],
      focus_refs: ['wk:environment:regional-fish-exploitation'],
      requested_predicates: [], search_hints: ['добыча рыбы', 'сезон рыбной ловли']
    } }; } }
  });

  await assert.rejects(
    grounder.ground({ semantic_input: 'Можно ли добыть рыбу?', player_safe_state: {} },
      'semantic_resolution'),
    (error) => error instanceof WorldKnowledgeError
      && error.code === 'WORLD_KNOWLEDGE_UNAVAILABLE'
      && error.details.cause_code === 'WK_VECTOR_SCAN_FAILED'
  );
  assert.equal(coreCalls, 0);
  assert.equal(scans, 1);
});

test('NPC action grounding reads only the projected NPC role and historical context', async () => {
  const bundle = JSON.parse(await readFile(new URL(
    '../../../data/world-catalogs/novgorod/world-knowledge/production-v1/runtime-bundle.json',
    import.meta.url), 'utf8'));
  const core = createWorldKnowledgeCore(bundle);
  let query;
  const worldKnowledge = { bundle,
    core: { resolveWorldKnowledge(value, options) {
      query = value;
      return core.resolveWorldKnowledge(value, options);
    } },
    encoder: { encode: async () => new Float32Array(1024) },
    vector_index: { search: () => new Map() } };
  const grounder = createProductionWorldKnowledgeGrounder({ worldKnowledge,
    placeRefs: ['region_novgorod_land'],
    roleRunner: { async run(call) {
      assert.doesNotMatch(call.messages[0].content,
        /canonical NO_KNOWLEDGE_REQUIRED plan/u);
      assert.match(call.messages[0].content,
        /requires at least one allowed domain/u);
      return { output: {
      schema: 'world_knowledge_query_plan_v1', query_locale: 'ru',
      domains: ['environment'],
      focus_refs: ['wk:environment:regional-fish-exploitation'],
      requested_predicates: [], search_hints: ['рыба']
    } }; } } });
  await grounder.ground({
    schema: 'npc_action_decision_request_v1', request_id: 'npc:decision',
    npc_ref: 'npc:1', remaining_intent: 'продолжить работу',
    historical_context: { year: 1230, region: 'region_novgorod_land' },
    npc: { social_role: { role_ref: 'nov_role_fisher' } },
    actor: { role_ref: 'malicious-role' },
    npc_safe_state: { role_ref: 'malicious-safe-role' }
  }, 'npc_decision');
  assert.equal(query.context.time.year, 1230);
  assert.deepEqual(query.context.actor_facets, { role_ref: 'nov_role_fisher' });
  assert.deepEqual(query.context.place_refs, ['region_novgorod_land']);
});

test('player semantic grounding can request occupation context without assigning NPC skills', async () => {
  const bundle = JSON.parse(await readFile(new URL(
    '../../../data/world-catalogs/novgorod/world-knowledge/production-v1/runtime-bundle.json',
    import.meta.url), 'utf8'));
  const core = createWorldKnowledgeCore(bundle);
  const grounder = createProductionWorldKnowledgeGrounder({
    worldKnowledge: { bundle, core,
      encoder: { encode: async () => new Float32Array(1024) },
      vector_index: { search: () => new Map() } },
    placeRefs: ['region_novgorod_land'],
    roleRunner: { async run(call) {
      const request = JSON.parse(call.messages[1].content);
      assert.ok(request.allowed_domains.includes('npc_daily_life'));
      assert.ok(Object.hasOwn(request.available_knowledge_refs,
        'wk:npc_daily_life:resource-occupation-needs-setting'));
      return { output: {
        schema: 'world_knowledge_query_plan_v1', query_locale: 'en',
        domains: ['npc_daily_life'],
        focus_refs: ['wk:npc_daily_life:resource-occupation-needs-setting'],
        requested_predicates: [], search_hints: ['occupation skills setting']
      } };
    } }
  });
  const result = await grounder.ground({ request_id: 'turn:occupation',
    input_locale: 'en', semantic_input:
      'Does a person collecting pelts necessarily know net fishing?',
    player_safe_state: {} }, 'semantic_resolution');
  assert.ok(result.world_knowledge.facts.some(({ claim_ref }) =>
    claim_ref === 'claim:resource-occupation-needs-setting'));
  assert.deepEqual(result.world_knowledge.coverage,
    [{ domain: 'npc_daily_life', status: 'covered' }]);
  assert.deepEqual(result.player_safe_state, {});
});
