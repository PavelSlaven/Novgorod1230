import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { validateWorldKnowledgeQueryPlan, validateWorldKnowledgeQueryPlannerRequest } from '../src/index.js';

const bundle = JSON.parse(await readFile(new URL('../../../data/world-catalogs/novgorod/world-knowledge/pilot-v1/runtime-bundle.json', import.meta.url)));

function request() {
  return {
    schema: 'world_knowledge_query_planner_request_v1',
    pack_ref: bundle.manifest.pack_ref,
    purpose: 'semantic_resolution',
    input_locale: 'ru',
    semantic_input: 'Требую вернуть долг.',
    situation_summary: 'Публичный спор.',
    allowed_domains: ['economy_trade', 'law_institutions'],
    available_knowledge_refs: ['wk:economy:debt_record'],
    planner_limits: { max_domains: 2, max_search_hints: 2, max_focus_refs: 1 }
  };
}

test('planner contracts accept only bounded selections from caller authority', () => {
  const input = request();
  const plan = {
    schema: 'world_knowledge_query_plan_v1',
    query_locale: 'ru',
    domains: ['economy_trade'],
    focus_refs: ['wk:economy:debt_record'],
    requested_predicates: ['attested_use'],
    search_hints: ['спор о долге']
  };
  assert.equal(validateWorldKnowledgeQueryPlannerRequest(input, bundle).ok, true);
  assert.equal(validateWorldKnowledgeQueryPlan(plan, input, bundle).ok, true);
  assert.equal(validateWorldKnowledgeQueryPlan({ ...plan, facts: ['invented'] }, input, bundle).ok, false);
  assert.deepEqual(validateWorldKnowledgeQueryPlan({ ...plan, focus_refs: ['wk:invented'] }, input, bundle), {
    ok: false, errors: ['plan focus_refs are unavailable: ["wk:invented"]']
  });
  assert.equal(validateWorldKnowledgeQueryPlan({ ...plan, requested_predicates: ['invented'] }, input, bundle).ok, false);
  assert.equal(validateWorldKnowledgeQueryPlannerRequest({ ...input, purpose: 'invented' }, bundle).ok, false);
});
