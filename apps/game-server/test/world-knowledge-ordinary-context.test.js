import assert from 'node:assert/strict';
import test from 'node:test';
import { loadProductionWorldKnowledge } from '../src/internal/world-knowledge-production.js';
import { createProductionWorldKnowledgeGrounder } from '../src/runtime/world-knowledge-grounding.js';
import { presenceRequest } from './lower-dvina-trace-ordinary-stage-b-eval-fixture.js';

test('ordinary lookup preserves approved scene and complete need without opaque-ref vocabulary', async () => {
  const loaded = await loadProductionWorldKnowledge();
  const calls = [], traces = [];
  const grounder = createProductionWorldKnowledgeGrounder({
    worldKnowledge: { ...loaded,
      encoder: { encode: async () => new Float32Array(1024) },
      vector_index: { search: () => new Map() } },
    telemetry: { onGameplayTrace: value => traces.push(value) },
    roleRunner: { async run(call) {
      calls.push(JSON.parse(call.messages[1].content));
      return { output: { schema: 'world_knowledge_query_plan_v1',
        query_locale: 'ru', domains: ['physics_material_science'],
        focus_refs: [], requested_predicates: [], search_hints: ['намокание дерева'] } };
    } }
  });
  const request = presenceRequest('Деревянный клин либо лоскут ткани из моего мешка');
  const before = structuredClone(request);
  const scene = { visible_scene: 'Мокрый речной берег',
    sensory_details: ['На гальке обломки мокрых досок.'],
    visible_objects: ['Обрывок верёвки'] };
  const authoritative = { semantic_context: scene };
  const first = await grounder.ground(request, 'materialization_support', authoritative);
  assert.deepEqual(JSON.parse(calls[0].situation_summary), { visible: scene });
  const need = JSON.parse(calls[0].semantic_input);
  assert.equal(need.candidate_hint, request.candidate_query.candidate_hint);
  assert.equal(need.evidence_weight, 0);
  assert.equal(need.mode, 'resolve_presence');
  assert.equal(need.max_new_entities, request.technical_limits.max_new_entities);
  assert.equal(need.candidate.admission_class, 'common_mundane');
  assert.equal(need.candidate.coverage_kind, 'visible_surface');
  assert.deepEqual(need.allowed_admission_classes, ['common_mundane']);
  assert.deepEqual(request, before);
  assert.deepEqual(first, traces[0].consumer_request);
  assert.deepEqual(traces[0].query.budget,
    { max_facts: 12, max_candidates: 12, max_context_chars: 5000 });

  const alternateRefs = structuredClone(request);
  alternateRefs.request_id = 'PRIVATE_WRITING_BOAT_CRAFT_TOKEN';
  alternateRefs.scope_ref.entity_id = 'PRIVATE_WRITING_BOAT_CRAFT_TOKEN';
  alternateRefs.context_refs = { unrelated_ref: 'PRIVATE_WRITING_BOAT_CRAFT_TOKEN' };
  alternateRefs.candidate_query.candidate_key = 'PRIVATE_WRITING_BOAT_CRAFT_TOKEN';
  alternateRefs.authority_envelope.candidate.coverage_ref = 'PRIVATE_WRITING_BOAT_CRAFT_TOKEN';
  await grounder.ground(alternateRefs, 'materialization_support', authoritative);
  assert.deepEqual(calls[1], calls[0], 'opaque identity changes must not change lookup need or focus candidates');
  assert.doesNotMatch(JSON.stringify(calls[1]), /PRIVATE_WRITING_BOAT_CRAFT_TOKEN/u);

  const seed = { ...request, mode: 'seed_scope', candidate_query: null,
    authority_envelope: { stage: 'seed_scope' } };
  const seeded = await grounder.ground(seed, 'materialization_support', authoritative);
  const seedNeed = JSON.parse(calls[2].semantic_input);
  assert.equal(seedNeed.candidate_hint, null);
  assert.equal(seedNeed.candidate, null);
  assert.deepEqual(JSON.parse(calls[2].situation_summary), { visible: scene });
  assert.ok(Object.keys(calls[2].available_knowledge_refs).length > 0);
  const changedScene = { visible_scene: 'Сухой луг', sensory_details: [],
    visible_objects: ['Луговая трава'] };
  await grounder.ground(seed, 'materialization_support', { semantic_context: changedScene });
  assert.deepEqual(JSON.parse(calls[3].situation_summary), { visible: changedScene });
  assert.notDeepEqual(calls[3].available_knowledge_refs, calls[2].available_knowledge_refs);
  assert.equal(await grounder.ground(seed, 'materialization_support', authoritative), seeded);
  assert.equal(calls.length, 4, 'retry retains context-specific lookup cache');
});
