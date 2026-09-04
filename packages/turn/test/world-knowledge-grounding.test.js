import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createWorldKnowledgeCore } from '@rus/world-knowledge';
import { requestWorldKnowledgeQueryPlan, resolveTurnStepWorldKnowledge } from '../src/index.js';

const bundle = JSON.parse(await readFile(new URL('../../../data/world-catalogs/novgorod/world-knowledge/pilot-v1/runtime-bundle.json', import.meta.url)));
const plannerRequest = {
  schema: 'world_knowledge_query_planner_request_v1', pack_ref: bundle.manifest.pack_ref,
  purpose: 'semantic_resolution', input_locale: 'ru', semantic_input: 'Требую долг.',
  situation_summary: 'Спор о долге.', allowed_domains: ['economy_trade'],
  available_knowledge_refs: ['wk:economy:debt_record'],
  planner_limits: { max_domains: 1, max_search_hints: 2, max_focus_refs: 1 }
};
const plan = {
  schema: 'world_knowledge_query_plan_v1', query_locale: 'ru', domains: ['economy_trade'],
  focus_refs: ['wk:economy:debt_record'], requested_predicates: ['attested_use'], search_hints: ['долг']
};
const authoritative = {
  pack_revision: bundle.manifest.revision_id,
  context: { time: { year: 1230 }, place_refs: ['region_novgorod_land'], actor_facets: {} },
  budget: { max_facts: 8, max_candidates: 8, max_context_chars: 2000 }
};

test('planner gets one structural repair over the same immutable request', async () => {
  const seen = [];
  const frozen = [];
  const result = await requestWorldKnowledgeQueryPlan({
    request: plannerRequest, bundle,
    plannerModel(request, repair) {
      frozen.push(Object.isFrozen(request));
      seen.push({ request: structuredClone(request), repair: structuredClone(repair) });
      return repair == null ? { ...plan, facts: ['forbidden'] } : plan;
    }
  });
  assert.equal(result.repaired, true);
  assert.equal(seen.length, 2);
  assert.deepEqual(seen[0].request, seen[1].request);
  assert.deepEqual(frozen, [true, true]);
  assert.equal(seen[1].repair.schema, 'world_knowledge_query_plan_repair_v1');
});

test('exact and NONE needs bypass planner', async () => {
  let plannerCalls = 0;
  const core = createWorldKnowledgeCore(bundle);
  assert.equal(await resolveTurnStepWorldKnowledge({ mode: 'NONE' }), null);
  const result = await resolveTurnStepWorldKnowledge({
    mode: 'EXACT', core, plannerModel: () => plannerCalls++,
    exactQuery: {
      schema: 'world_knowledge_query_v1', pack_ref: bundle.manifest.pack_ref,
      pack_revision: bundle.manifest.revision_id, purpose: 'semantic_resolution', query_locale: 'ru',
      domains: ['economy_trade'], focus_refs: ['wk:economy:debt_record'],
      requested_predicates: ['attested_use'], search_hints: [], context: authoritative.context,
      budget: authoritative.budget
    }
  });
  assert.equal(plannerCalls, 0);
  assert.equal(result.slice.verdict, 'supported');
  assert.equal(result.planner_called, false);
});

test('structural repair identifies unavailable focus refs without replacing caller authority', async () => {
  const invalid = { ...plan, focus_refs: ['wk:law:debt_record'] };
  let calls = 0;
  const result = await requestWorldKnowledgeQueryPlan({
    request: plannerRequest, bundle,
    plannerModel(request, repair) {
      calls += 1;
      if (repair == null) return invalid;
      assert.deepEqual(repair.original_output, invalid);
      assert.deepEqual(request.available_knowledge_refs, ['wk:economy:debt_record']);
      assert.match(repair.structural_errors.join(' '), /wk:law:debt_record/u);
      return plan;
    }
  });
  assert.equal(calls, 2);
  assert.equal(result.repaired, true);
  assert.deepEqual(result.plan.focus_refs, plannerRequest.available_knowledge_refs);
  await assert.rejects(requestWorldKnowledgeQueryPlan({
    request: plannerRequest, bundle, plannerModel: () => invalid
  }), error => error.code === 'TURN_WORLD_KNOWLEDGE_QUERY_PLAN_INVALID');
});

test('RETRIEVE merges only authoritative context after planning', async () => {
  const result = await resolveTurnStepWorldKnowledge({
    mode: 'RETRIEVE', core: createWorldKnowledgeCore(bundle), bundle,
    plannerRequest, authoritative, plannerModel: async () => plan
  });
  assert.equal(result.planner_called, true);
  assert.equal(result.slice.pack_revision, authoritative.pack_revision);
  assert.equal(result.slice.verdict, 'supported');
});

test('RETRIEVE rejects missing authoritative context before planning', async () => {
  let plannerCalls = 0;
  await assert.rejects(
    resolveTurnStepWorldKnowledge({
      mode: 'RETRIEVE', core: createWorldKnowledgeCore(bundle), bundle, plannerRequest,
      plannerModel: async () => { plannerCalls += 1; return plan; }
    }),
    (error) => error.code === 'TURN_WORLD_KNOWLEDGE_CONTEXT_INVALID'
  );
  assert.equal(plannerCalls, 0);
});
