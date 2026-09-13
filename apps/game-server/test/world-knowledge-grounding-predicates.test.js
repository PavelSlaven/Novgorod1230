import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createWorldKnowledgeCore } from '@rus/world-knowledge';
import { createProductionWorldKnowledgeGrounder } from
  '../src/runtime/world-knowledge-grounding.js';

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
