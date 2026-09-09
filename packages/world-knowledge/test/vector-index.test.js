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

test('vector limit is applied after concept entries collapse to claim targets', () => {
  const metadata = { schema: 'world_knowledge_vector_index_v1', dimension: 2,
    embedding_profile_ref: bundle.manifest.embedding_profile_ref, entries: [
      { target_ref: 'claim:a', locale: 'ru', domain: 'environment' },
      { target_ref: 'wk:a', locale: 'ru', domain: 'environment' },
      { target_ref: 'wk:b', locale: 'ru', domain: 'environment' }
  ] };
  const floats = new Float32Array([1, 0, 0.9, 0, 0.8, 0]);
  const conceptToClaimRefs = { 'wk:a': ['claim:a'], 'wk:b': ['claim:b'] };
  const index = createWorldKnowledgeFlatVectorIndex(metadata,
    new Uint8Array(floats.buffer), { conceptToClaimRefs });
  conceptToClaimRefs['wk:b'][0] = 'claim:mutated';
  assert.deepEqual([...index.search(new Float32Array([1, 0]), {
    locale: 'ru', domains: ['environment'], limit: 2 })].map(([ref]) => ref),
  ['claim:a', 'claim:b']);
});

test('vector relevance is calibrated against lexical relevance', () => {
  const core = createWorldKnowledgeCore(bundle);
  const slice = core.resolveWorldKnowledge({
    schema: 'world_knowledge_query_v1',
    pack_ref: bundle.manifest.pack_ref,
    pack_revision: bundle.manifest.revision_id,
    purpose: 'semantic_resolution',
    query_locale: 'ru',
    domains: ['physics_material_science'],
    focus_refs: [],
    requested_predicates: [],
    search_hints: ['Верёвка из растительного волокна тёрлась о кол, была перегнута и завязана узлом. Что меняется для её прочности?'],
    context: { time: { year: 1230 }, place_refs: ['region_novgorod_land'],
      actor_facets: {} },
    budget: { max_facts: 10, max_candidates: 10, max_context_chars: 2000 }
  }, { vectorScores: new Map([
    ['claim:modern-fibre-rope-condition-can-reduce-available-strength', 0.49]
  ]) });
  assert.ok(slice.facts.some(({ claim_ref }) => claim_ref
    === 'claim:modern-fibre-rope-condition-can-reduce-available-strength'));
});
