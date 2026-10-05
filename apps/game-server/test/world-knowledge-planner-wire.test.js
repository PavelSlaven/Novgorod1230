import assert from 'node:assert/strict';
import test from 'node:test';
import { validateWorldKnowledgeQueryPlannerRequest } from '@rus/world-knowledge';
import { buildProviderRequestPayload } from '../../../packages/llm-runtime/src/provider-request.js';
import { createProductionWorldKnowledgeGrounder, maskFocusRefs,
  plannerOutputForWire } from
  '../src/runtime/world-knowledge-grounding.js';

test('repair error masking replaces whole refs that share a prefix', () => {
  const focusKeys = new Map([
    ['wk:material_culture:belt', 'f0'],
    ['wk:material_culture:belt-fitting', 'f1']
  ]);
  assert.equal(maskFocusRefs(
    'plan focus_refs are unavailable: ["wk:material_culture:belt", "wk:material_culture:belt-fitting"]',
    focusKeys),
  'plan focus_refs are unavailable: ["f0", "f1"]');
});

test('repair output remaps available refs and preserves unrecognized values', () => {
  const output = { schema: 'world_knowledge_query_plan_v1',
    focus_refs: ['wk:material_culture:belt', 'unavailable-ref'],
    marker: 'preserved' };
  assert.deepEqual(plannerOutputForWire(output,
    new Map([['wk:material_culture:belt', 'f0']])), {
    schema: 'world_knowledge_query_plan_v1',
    focus_refs: ['f0', 'unavailable-ref'], marker: 'preserved'
  });
});

for (const prefix of ['sample', 'unseen-other-vocabulary']) {
 for (const repairPath of [false, true]) {
  test(`planner projects visible state and restores opaque focus keys: ${prefix}, repair=${repairPath}`, async () => {
    const { bundle, refs, expectedDomains } = fixture(prefix);
    const calls = [], traces = [], queries = [];
    const grounder = createProductionWorldKnowledgeGrounder({
      worldKnowledge: { bundle,
        encoder: { encode: async () => [1] },
        vector_index: { search: () => new Map() },
        core: { resolveWorldKnowledge(query) {
          queries.push(query);
          return { schema: 'world_knowledge_slice_v1', pack_ref: 'pack:test',
            pack_revision: 'revision:test', purpose: query.purpose,
            coverage: [], verdict: 'insufficient', hard_constraints: [], facts: [],
            disputes: [], gaps: [] };
        } } },
      telemetry: { onGameplayTrace: trace => traces.push(trace) },
      roleRunner: { async run(call) {
        calls.push(call);
        const wire = JSON.parse(call.messages[1].content);
        const request = wire.request ?? wire;
        const focusKey = Object.keys(request.available_knowledge_refs)[0];
        const validPlan = {
          schema: 'world_knowledge_query_plan_v1', query_locale: 'en',
          domains: ['material'], focus_refs: [focusKey],
          requested_predicates: [], search_hints: ['common rare'] };
        const invalidPlan = { ...validPlan, domains: ['unavailable-domain'] };
        return { output: repairPath && calls.length === 1
          ? invalidPlan : validPlan };
      } }
    });
    const input = { input_locale: 'en', remaining_intent: 'common rare',
      player_safe_state: { actor_id: 'player_character_abcdef1234567890',
        position: { g4_id: 'g4v3__secret', location_ref: 'trace_ld_v1_hidden' },
        current_visible_context: { version: 1,
          schema: 'visible_context_package', visible_scene: `У берега. ${'Дальний участок сцены тоже виден. '.repeat(180)} Последний ориентир видимой сцены.`,
          visible_changes: ['Рядом лежит мокрая верёвка.'],
          sensory_details: ['Пахнет дымом.'],
          visible_npc: [{ entity_ref: { entity_kind: 'npc',
            entity_id: 'npc_abcdef1234567890' }, display_label: 'Олег',
            recognition: 'recognized', observable_cues: npcCues('wool', 'ochre') },
          ...Array.from({ length: 8 }, (_, index) => ({
            entity_ref: { entity_kind: 'npc',
              entity_id: `npc_visible_${String(index).padStart(2, '0')}_abcdef` },
            display_label: `Видимый человек ${index + 1}`,
            recognition: 'unrecognized',
            observable_cues: npcCues('wool', 'ochre')
          }))],
          visible_objects: [{ entity_ref: { entity_kind: 'item',
            entity_id: 'item_abcdef1234567890' }, display_label: 'Продолжить путь — выход 3' },
          { entity_ref: { entity_kind: 'item', entity_id: 'item_1234567890abcdef' } },
          { entity_ref: { entity_kind: 'g4_directional_exit', entity_id: 'g4_exit_abcdef1234567890' },
            display_label: 'По руслу — выход 1' },
          { entity_ref: { entity_kind: 'g4_directional_exit', entity_id: 'g4_exit_1234567890abcdef' },
            display_label: 'Проход 3' },
          'item_abcdefabcdefabcdef', { entity_ref: { entity_kind:
            'ambient_ordinary_capability', entity_id: 'ambient_abcdef1234567890' },
          display_label: '', ambient_portion_bounds: { quantity_unit: 'item',
            min_quantity: 1, max_quantity: 3, min_mass_grams: 200,
            max_mass_grams: 700 } } ],
          known_context: ['Вас зовут Микула.',
            'Текущие состояния вашего тела: [{"id":"wet","status":"active"},{"id":"cold_with_possible_shivering","status":"active"},{"id":"headache","status":"active"},{"id":"shoulder_bruise","status":"active"},{"id":"unmapped_body_state","label":"Правая нога ноет.","status":"active"}]'],
          uncertainties: [] } } };
    const before = structuredClone(input);
    const result = await grounder.ground(input, 'semantic_resolution');
    assert.equal(calls.length, repairPath ? 2 : 1);
    const canonical = traces[0].planner_request;
    assert.equal(validateWorldKnowledgeQueryPlannerRequest(canonical, bundle).ok, true);
    assert.deepEqual(canonical.available_knowledge_refs, [refs[256], ...refs.slice(1, 96)]);
    assert.equal(canonical.available_knowledge_refs.length, 96);
    assert.equal(canonical.semantic_input, input.remaining_intent);
    assert.equal(canonical.purpose, 'semantic_resolution');
    assert.deepEqual(canonical.planner_limits, { max_domains: 3,
      max_search_hints: 8, max_focus_refs: 8 });
    for (const call of calls) {
      const providerBody = buildProviderRequestPayload({
        model: 'qwen3.8-27b-uncensored-w4a16-tp2', maxTokens: 20000,
        responseFormat: { type: 'json_object' },
        compatibility: 'openai_compatible', thinking: { type: 'disabled' },
        temperature: 0, topP: 1
      }, call.messages);
      assert.equal(providerBody.temperature, 0);
      assert.equal(providerBody.max_tokens, 20000);
      assert.deepEqual(providerBody.response_format, { type: 'json_object' });
      const providerUser = providerBody.messages[1].content;
      const payload = JSON.parse(providerUser);
      const wire = payload.request ?? payload;
      assert.deepEqual(Object.keys(wire.available_knowledge_refs),
        canonical.available_knowledge_refs.map((_, index) => `f${index.toString(36)}`));
      assert.equal(Object.hasOwn(wire, 'schema'), false);
      assert.equal(Object.hasOwn(wire, 'pack_ref'), false);
      for (const [index, key] of Object.keys(wire.available_knowledge_refs).entries()) {
        const ref = canonical.available_knowledge_refs[index];
        assert.deepEqual(wire.available_knowledge_refs[key], {
          domains: expectedDomains(ref), label: '', description: ''
        });
      }
      const userText = providerUser;
      assert.doesNotMatch(userText, /player_character_|g4v3__|g5_(?:node|anchor)_|trace_ld_v1_|(?:npc|item)_[a-f\d]{8,}/u);
      assert.doesNotMatch(JSON.stringify(wire),
        /"(?:entity_ref|entity_id|version|schema)"/u);
      assert.doesNotMatch(userText,
        /display_name|item_visual_profile_snapshot|visible_fabric/u);
      assert.match(userText, /Место: У берега\./u);
      assert.match(userText, /Рядом лежит мокрая верёвка\./u);
      assert.match(userText, /Пахнет дымом\./u);
      assert.match(userText, /чинит сети/u);
      assert.match(userText, /Видимый человек: узнанный, Олег, русые волнистые волосы средней длины, короткая борода, охряная одежда/u);
      assert.match(userText, /Последний ориентир видимой сцены\./u);
      for (let index = 1; index <= 8; index += 1) {
        assert.match(userText, new RegExp(`Видимый человек: незнакомый, Видимый человек ${index}, русые волнистые волосы средней длины, короткая борода, охряная одежда`, 'u'));
      }
      assert.doesNotMatch(userText,
        /\b(?:male|adult|blond|wool|ochre|short_beard|braid|none|suspicious|medium|viewer|three_quarter|slightly_turned|neutral)\b/u);
      assert.doesNotMatch(userText, /Олег, Олег/u);
      assert.match(userText, /Видимый предмет: предмет/u);
      assert.match(userText, /Видимый предмет: По руслу/u);
      assert.match(userText, /Видимый предмет: проход/u);
      assert.doesNotMatch(userText, /выход 1|Проход 3/u);
      assert.match(userText, /Видимый предмет: предмет, видимое количество: количество от 1 до 3 штук, масса от 200 до 700 г/u);
      assert.doesNotMatch(userText, /item_1234567890abcdef/u);
      assert.doesNotMatch(userText, /item_abcdefabcdefabcdef/u);
      assert.match(userText, /Вас зовут Микула\./u);
      for (const state of [
        'Одежда промокла насквозь.', 'Вас знобит.',
        'Голова отзывается тупой болью.', 'Ушибленное плечо ноет.',
        'Правая нога ноет.'
      ]) assert.ok(userText.includes(state), `missing body state ${state}`);
      assert.doesNotMatch(userText, /Продолжить путь|cold_with_possible_shivering|shoulder_bruise|"id"|"status"/u);
      assert.doesNotMatch(call.messages[0].content, /Focus claim domains:/u);
      assert.match(call.messages[0].content, /keys of request\.available_knowledge_refs/u);
    }
    if (repairPath) {
      const repairPayload = JSON.parse(calls[1].messages[1].content);
      assert.match(repairPayload.repair_instruction,
        /focus_refs only from keys of request\.available_knowledge_refs/u);
      assert.deepEqual(repairPayload.original_output, {
        schema: 'world_knowledge_query_plan_v1', query_locale: 'en',
        domains: ['unavailable-domain'], focus_refs: ['f0'],
        requested_predicates: [], search_hints: ['common rare']
      });
    }
    assert.deepEqual(queries[0].focus_refs, [refs[256]]);
    assert.deepEqual(queries[0].domains, ['material']);
    assert.deepEqual(queries[0].budget, { max_facts: 12, max_candidates: 12 });
    assert.equal(queries.length, 1);
    assert.deepEqual(result.world_knowledge.facts, []);
    assert.deepEqual(input, before);
  });
 }
}

test('normalization drops unknown opaque focus keys and keeps valid selections', async () => {
  const { bundle } = fixture('unknown-key');
  const calls = [];
  const queries = [];
  const grounder = createProductionWorldKnowledgeGrounder({
    worldKnowledge: { bundle,
      encoder: { encode: async () => [1] },
      vector_index: { search: () => new Map() },
      core: { resolveWorldKnowledge(query) {
        queries.push(query);
        return { schema: 'world_knowledge_slice_v1', pack_ref: 'pack:test',
          pack_revision: 'revision:test', purpose: query.purpose,
          coverage: [], verdict: 'insufficient', hard_constraints: [], facts: [],
          disputes: [], gaps: [] };
      } } },
    roleRunner: { async run(call) {
      calls.push(call);
      const output = { schema: 'world_knowledge_query_plan_v1',
        query_locale: 'en', domains: ['material'], focus_refs: ['f0', 'f-unknown'],
        requested_predicates: [], search_hints: ['common rare'] };
      return { output };
    } }
  });
  await grounder.ground({ input_locale: 'en',
    remaining_intent: 'common rare', player_safe_state: {
    current_visible_context: { visible_scene: 'У берега.' }
  } }, 'semantic_resolution');
  assert.equal(calls.length, 1);
  assert.equal(queries.length, 1);
  assert.deepEqual(queries[0].focus_refs, ['wk:unknown-key:256']);
});

test('unknown active body condition without safe label raises a typed gap', async () => {
  const { bundle } = fixture('body-gap');
  const grounder = createProductionWorldKnowledgeGrounder({
    worldKnowledge: { bundle,
      encoder: { encode: async () => [1] },
      vector_index: { search: () => new Map() },
      core: { resolveWorldKnowledge() { throw new Error('not reached'); } } },
    roleRunner: { async run() { throw new Error('not reached'); } }
  });
  await assert.rejects(grounder.ground({ input_locale: 'en',
    remaining_intent: 'common rare', player_safe_state: {
      current_visible_context: { visible_scene: 'У берега.',
        known_context: ['Текущие состояния вашего тела: [{"id":"unmapped_body_state","status":"active"}]'] }
    } }, 'semantic_resolution'), error =>
    error.code === 'WORLD_KNOWLEDGE_BODY_CONDITION_LABEL_GAP');
});

function fixture(prefix) {
  const refs = Array.from({ length: 257 }, (_, i) => `wk:${prefix}:${String(i).padStart(3, '0')}`);
  const claims = refs.map((_, i) => ({ claim_ref: `claim:${prefix}:${i}`,
    domain: i === 0 ? 'excluded' : 'material',
    applicability: { context_scope: 'universal' },
    knowledge_access: { class: 'general_physical', required_facets: [] } }));
  const cross = { claim_ref: `claim:${prefix}:cross`, domain: 'environment',
    applicability: { context_scope: 'universal' },
    knowledge_access: { class: 'general_physical', required_facets: [] } };
  const mappings = Object.fromEntries(refs.map((ref, i) => [ref, [claims[i].claim_ref,
    ...(i === 1 ? [cross.claim_ref, cross.claim_ref] : [])]]));
  return { refs, expectedDomains: ref => ref === refs[1] ? ['environment', 'material']
    : ['material'], bundle: {
    manifest: { status: 'production', pack_ref: 'pack:test', revision_id: 'revision:test',
      supported_locales: ['en'], default_locale: 'en', domains: ['material', 'environment', 'excluded'] },
    coverage_profiles: ['material', 'environment'].map(domain => ({ domain,
      status: 'production', purposes: ['semantic_resolution'] })),
    concepts: [...refs].reverse().map(concept_ref => ({ concept_ref,
      domain: 'material', review_status: 'approved', localizations: {} })),
    claims: [...claims, cross], exact_indexes: { concept_to_claim_refs: mappings },
    lexical_indexes: { en: { common: claims.map(claim => claim.claim_ref), rare: [claims[256].claim_ref] } },
    predicate_registry: { material: {}, environment: {} }
  } };
}

function npcCues(fabric, color) {
  return {
    identity: { display_name: 'Видимое имя', sex_category: 'male',
      age_category: 'adult', appearance: { hair: { color: 'blond',
        length: 'medium', style: 'wavy', facial_hair: 'short_beard' } } },
    equipment: [{ physical_position: 'equipped',
      equipment_slot_category_id: 'outer_garment',
      visual_profile_snapshot: { schema: 'item_visual_profile_snapshot_v1',
        version: 1, equipment_slot: 'outer_garment', visible_fabric: fabric,
        trim: 'braid', main_visible_color: color, headwear_kind: 'none' } }],
    outward_presentation: { emotion: 'suspicious', intensity: 'medium',
      gaze: 'viewer', body_pose: 'three_quarter',
      head_pose: 'slightly_turned', background: 'neutral' },
    ordinary_remainder: { ordinary_activity: 'чинит сети' }
  };
}
