import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createWorldKnowledgeCore,
  createWorldKnowledgeFlatVectorIndex } from '../src/index.js';

const bundle = JSON.parse(await readFile(new URL(
  '../../../data/world-catalogs/novgorod/world-knowledge/production-v1/runtime-bundle.json',
  import.meta.url)));

test('flat vectors add recall candidates but applicability still decides truth', () => {
  const metadata = { schema: 'world_knowledge_vector_index_v1', dimension: 2,
    embedding_profile_ref: bundle.manifest.embedding_profile_ref, entries: [
      { target_ref: 'claim:regional-fish-exploitation', locale: 'ru',
        domain: 'environment' },
      { target_ref: 'claim:activity-fluid-balance', locale: 'ru',
        domain: 'biology_physiology' }
    ] };
  const floats = new Float32Array([1, 0, 0, 1]);
  const index = createWorldKnowledgeFlatVectorIndex(metadata,
    new Uint8Array(floats.buffer));
  const scores = index.search(new Float32Array([1, 0]), { locale: 'ru',
    domains: ['environment'], limit: 2 });
  const slice = createWorldKnowledgeCore(bundle).resolveWorldKnowledge({
    schema: 'world_knowledge_query_v1',
    pack_ref: bundle.manifest.pack_ref,
    pack_revision: bundle.manifest.revision_id,
    purpose: 'semantic_resolution', query_locale: 'ru',
    domains: ['environment'], focus_refs: [], requested_predicates: [],
    search_hints: ['несовпадающая формулировка'],
    context: { time: { year: 1230 },
      place_refs: ['region_novgorod_land'], actor_facets: {} },
    budget: { max_facts: 2, max_candidates: 2,
      max_context_chars: 2000 }
  }, { vectorScores: scores });
  assert.deepEqual(slice.facts.map(({ claim_ref }) => claim_ref),
    ['claim:regional-fish-exploitation']);
});
