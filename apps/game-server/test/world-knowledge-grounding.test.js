import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createWorldKnowledgeCore } from '@rus/world-knowledge';
import { loadProductionWorldKnowledge } from
  '../src/internal/world-knowledge-production.js';
import { createProductionWorldKnowledgeGrounder } from
  '../src/runtime/world-knowledge-grounding.js';
import { loadLowerDvinaTraceMaterializationBundle } from
  '../src/internal/lower-dvina-trace-phase-1a-bundle.js';

test('production grounding plans once and injects only an applicable bounded slice', async () => {
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
    'Можно ли здесь добыть рыбу?', player_safe_state: {} };
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
  const ownerMetadata = calls[0].messages[0].content.match(/Focus claim domains: (.*?)\. A focus concept namespace/u);
  assert.ok(ownerMetadata, 'planner must see actual claim owners, not only cross-domain exceptions');
  const owners = JSON.parse(ownerMetadata[1]);
  assert.deepEqual(owners['wk:material_culture:tree-climbing-hook'], ['material_culture']);
  assert.deepEqual(owners['wk:environment:regional-fish-exploitation'], ['environment']);
  assert.ok(owners['wk:material_culture:vegetable-tanned-leather'].includes('chemistry_process'));
  assert.ok(owners['wk:material_culture:vegetable-tanned-leather'].includes('physics_material_science'));
  assert.ok(owners['wk:material_culture:iron'].includes('craft_technology'));
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
  assert.equal(gameplayTraces.length, 1);
  const trace = gameplayTraces[0];
  assert.equal(trace.event, 'world_knowledge_resolved');
  assert.deepEqual(trace.planner_request, plannerRequest);
  assert.deepEqual(trace.query.search_hints, ['рыбные ресурсы']);
  assert.deepEqual(trace.consumer_request, first);
  assert.deepEqual(trace.retrieved_slice.facts, first.world_knowledge.facts);
  assert.equal(Object.hasOwn(first, 'gameplay_traces'), false);
});

test('production repair explicitly removes unavailable refs without changing caller authority', async () => {
  const bundle = JSON.parse(await readFile(new URL(
    '../../../data/world-catalogs/novgorod/world-knowledge/production-v1/runtime-bundle.json',
    import.meta.url), 'utf8'));
  const inputs = [];
  const grounder = createProductionWorldKnowledgeGrounder({
    worldKnowledge: { bundle, core: createWorldKnowledgeCore(bundle),
      encoder: { encode: async () => new Float32Array(1024) },
      vector_index: { search: () => new Map() } },
    roleRunner: { async run(call) {
      const input = JSON.parse(call.messages[1].content);
      inputs.push(input.request ?? input);
      if (inputs.length === 2) {
        assert.match(call.messages[0].content, /Remove unavailable focus_refs/u);
        assert.match(call.messages[0].content, /verbatim refs from request.available_knowledge_refs/u);
        assert.match(call.messages[0].content, /wk:unavailable-ref/u);
        assert.ok(input.structural_errors.some(error => error.includes('wk:unavailable-ref')));
        assert.match(input.repair_instruction, /Never copy a rejected ref/u);
      }
      return { output: { schema: 'world_knowledge_query_plan_v1',
        query_locale: 'ru', domains: ['environment'],
        focus_refs: inputs.length === 1 ? ['wk:unavailable-ref'] : [],
        requested_predicates: [], search_hints: [] } };
    } }
  });
  await grounder.ground({ semantic_input: 'Контекст места', player_safe_state: {} },
    'semantic_resolution');
  assert.equal(inputs.length, 2);
  assert.deepEqual(inputs[0], inputs[1]);
});

test('an unused focus does not block a supplied physical premise or force its historical domain', async () => {
  const bundle = JSON.parse(await readFile(new URL(
    '../../../data/world-catalogs/novgorod/world-knowledge/production-v1/runtime-bundle.json',
    import.meta.url), 'utf8'));
  let calls = 0;
  const plan = { schema: 'world_knowledge_query_plan_v1', query_locale: 'en',
    domains: ['craft_technology', 'physics_material_science'],
    focus_refs: ['wk:craft_technology:spinning', 'wk:physics_material_science:fibre-twisting',
      'wk:physics_material_science:plant-cellulosic-fibres'],
    requested_predicates: [], search_hints: ['twisting textile fibres to form yarn'] };
  const grounder = createProductionWorldKnowledgeGrounder({
    worldKnowledge: { bundle, core: createWorldKnowledgeCore(bundle),
      encoder: { async encode() { throw new Error('lexical test'); } },
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
      assert.ok(call.messages[0].content.includes(
        '"wk:material_culture:vegetable-tanned-leather":["chemistry_process","physics_material_science"]'));
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
    roleRunner: { async run() { return { output: {
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
      assert.ok(request.available_knowledge_refs.includes(
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

test('semantic planner predicates cannot discard mixed typed and generic focus premises', async () => {
  const bundle = JSON.parse(await readFile(new URL(
    '../../../data/world-catalogs/novgorod/world-knowledge/production-v1/runtime-bundle.json',
    import.meta.url), 'utf8'));
  const diagnostics = [];
  const grounder = createProductionWorldKnowledgeGrounder({
    worldKnowledge: { bundle, core: createWorldKnowledgeCore(bundle),
      encoder: { encode: async () => new Float32Array(1024) },
      vector_index: { search: () => new Map() } },
    placeRefs: ['region_novgorod_land'],
    telemetry: { onDetail: entry => diagnostics.push(entry) },
    roleRunner: { async run() { return { output: {
      schema: 'world_knowledge_query_plan_v1', query_locale: 'en',
      domains: ['craft_technology', 'material_culture'],
      focus_refs: ['wk:craft_technology:hemp-stem-processing', 'wk:material_culture:hemp-fibre'],
      requested_predicates: ['produces_form'], search_hints: ['plant fibre processing']
    } }; } }
  });
  const result = await grounder.ground({ semantic_input: 'What can stem processing produce?',
    input_locale: 'en', player_safe_state: {} }, 'semantic_resolution');
  const refs = result.world_knowledge.facts.map(fact => fact.claim_ref);
  assert.ok(refs.includes('claim:agriculture-fauna-hemp-stem-fibre'));
  assert.ok(refs.includes('claim:population-processes-hemp-cordage'));
  assert.deepEqual(diagnostics[0].predicates, []);
});
