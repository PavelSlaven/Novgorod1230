import assert from 'node:assert/strict';
import test from 'node:test';
import { validateWorldKnowledgeQueryPlannerRequest } from '@rus/world-knowledge';
import { createProductionWorldKnowledgeGrounder } from '../src/runtime/world-knowledge-grounding.js';

for (const prefix of ['sample', 'unseen-other-vocabulary']) {
  test(`planner wire retains ranked refs and domain membership once: ${prefix}`, async () => {
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
            disputes: [], gaps: [], context_text: 'Unchanged bounded slice.' };
        } } },
      telemetry: { onGameplayTrace: trace => traces.push(trace) },
      roleRunner: { async run(call) {
        calls.push(call);
        return { output: calls.length === 1 ? {} : {
          schema: 'world_knowledge_query_plan_v1', query_locale: 'en',
          domains: ['material'], focus_refs: [refs[256], refs[31]],
          requested_predicates: [], search_hints: ['common rare'] } };
      } }
    });
    const input = { input_locale: 'en', remaining_intent: 'common rare',
      player_safe_state: { actor_id: 'actor:test' } };
    const before = structuredClone(input);
    const result = await grounder.ground(input, 'semantic_resolution');
    assert.equal(calls.length, 2, 'existing single repair still runs');
    const canonical = traces[0].planner_request;
    assert.equal(validateWorldKnowledgeQueryPlannerRequest(canonical, bundle).ok, true);
    assert.deepEqual(canonical.available_knowledge_refs, [refs[256], ...refs.slice(0, 39)]);
    assert.equal(canonical.available_knowledge_refs.length, 40);
    assert.equal(canonical.semantic_input, input.remaining_intent);
    assert.equal(canonical.purpose, 'semantic_resolution');
    assert.deepEqual(canonical.planner_limits, { max_domains: 3,
      max_search_hints: 8, max_focus_refs: 8 });
    for (const call of calls) {
      const payload = JSON.parse(call.messages[1].content);
      const wire = payload.request ?? payload;
      assert.deepEqual(Object.keys(wire.available_knowledge_refs), canonical.available_knowledge_refs);
      assert.deepEqual({ ...wire, available_knowledge_refs: Object.keys(wire.available_knowledge_refs) }, canonical);
      for (const ref of canonical.available_knowledge_refs) {
        assert.deepEqual(wire.available_knowledge_refs[ref], {
          domains: expectedDomains(ref), label: '', description: ''
        });
        assert.equal(call.messages.map(message => message.content).join('\n')
          .split(JSON.stringify(ref)).length - 1, 1, ref);
      }
      assert.doesNotMatch(call.messages[0].content, /Focus claim domains:/u);
      assert.match(call.messages[0].content, /keys of request\.available_knowledge_refs/u);
    }
    assert.match(JSON.parse(calls[1].messages[1].content).repair_instruction,
      /keys of request\.available_knowledge_refs/u);
    assert.deepEqual(queries[0].focus_refs, [refs[256], refs[31]]);
    assert.deepEqual(queries[0].domains, ['material']);
    assert.deepEqual(queries[0].budget, { max_facts: 12, max_candidates: 12, max_context_chars: 5000 });
    assert.equal(queries.length, 1);
    assert.equal(result.world_knowledge.context_text, 'Unchanged bounded slice.');
    assert.deepEqual(input, before);
  });
}

function fixture(prefix) {
  const refs = Array.from({ length: 257 }, (_, i) => `wk:${prefix}:${String(i).padStart(3, '0')}`);
  const claims = refs.map((_, i) => ({ claim_ref: `claim:${prefix}:${i}`,
    domain: i === 0 ? 'excluded' : 'material' }));
  const cross = { claim_ref: `claim:${prefix}:cross`, domain: 'environment' };
  const mappings = Object.fromEntries(refs.map((ref, i) => [ref, [claims[i].claim_ref,
    ...(i === 1 ? [cross.claim_ref, cross.claim_ref] : [])]]));
  return { refs, expectedDomains: ref => ref === refs[0] ? []
    : ref === refs[1] ? ['environment', 'material'] : ['material'], bundle: {
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
