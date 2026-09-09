import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createWorldKnowledgeCore } from '../../../packages/world-knowledge/src/world-knowledge.js';
import { loadWorldKnowledgeAuthoringInput } from '../src/world-knowledge-authoring-loader.js';
import { compileWorldKnowledgePack } from '../src/world-knowledge-pack.js';

const root = new URL('../../../data/world-catalogs/novgorod/world-knowledge/production-v1/', import.meta.url);
const authoring = await loadWorldKnowledgeAuthoringInput(fileURLToPath(new URL('authoring.json', root)));
const bundle = compileWorldKnowledgePack(authoring);
const core = createWorldKnowledgeCore(bundle);
const foundations = bundle.claims.filter(claim => claim.claim_ref.startsWith('claim:foundations-'));

function query(refs, overrides = {}) {
  const claims = refs.map(ref => {
    const claim = bundle.claims.find(value => value.claim_ref === ref);
    assert.ok(claim, ref);
    return claim;
  });
  return core.resolveWorldKnowledge({
    schema: 'world_knowledge_query_v1', pack_ref: bundle.manifest.pack_ref,
    pack_revision: bundle.manifest.revision_id, purpose: 'semantic_resolution',
    query_locale: 'ru', domains: [...new Set(claims.map(value => value.domain))],
    focus_refs: [...new Set(claims.map(value => value.subject_ref))],
    requested_predicates: [], search_hints: [],
    context: { time: { year: 1800 }, place_refs: ['outside_novgorod'], actor_facets: {} },
    budget: { max_facts: 24, max_candidates: 24, max_context_chars: 9000 },
    ...overrides
  });
}

test('scientific foundations compile with intact bilingual text and source-linked factual premises', async () => {
  assert.ok(foundations.length > 0);
  for (const filename of ['foundations-physical.json', 'foundations-life.json',
    'foundations-earth.json', 'foundations-mind-society.json']) {
    assert.doesNotMatch(await readFile(new URL(filename, root), 'utf8'), /\uFFFD/u, filename);
  }
  for (const claim of foundations) {
    assert.deepEqual(claim.applicability, { context_scope: 'universal' }, claim.claim_ref);
    assert.equal(claim.knowledge_access.class, 'domain_internal_only', claim.claim_ref);
    assert.equal(claim.predicate, 'supported_fact');
    assert.equal(claim.hard_exclusion, null);
    assert.ok(claim.evidence_refs.length);
    for (const locale of ['ru', 'en']) {
      const slice = query([claim.claim_ref], { query_locale: locale });
      assert.ok(slice.facts.some(value => value.claim_ref === claim.claim_ref), claim.claim_ref);
      assert.ok(claim.localizations[locale].runtime_text.trim());
      assert.equal(slice.hard_constraints.length, 0);
    }
    for (const purpose of ['conversation', 'npc_decision', 'narration']) {
      assert.ok(!query([claim.claim_ref], { purpose }).facts.some(value =>
        value.claim_ref === claim.claim_ref), `${purpose}: ${claim.claim_ref}`);
    }
  }
});

test('new psychology and sociology profiles do not transfer history or actor authority', () => {
  for (const domain of ['psychology_behavior', 'social_behavior']) {
    const profile = bundle.coverage_profiles.find(value => value.domain === domain);
    assert.deepEqual(profile.scope, { context_scope: 'universal' });
    assert.deepEqual(profile.purposes, ['semantic_resolution', 'materialization_support', 'source_grounded_qa']);
    assert.ok(foundations.some(claim => claim.domain === domain));
  }
  const refs = ['claim:foundations-ms-19-attribution-explanation',
    'claim:foundations-ms-20-attribution-alternatives', 'claim:foundations-ms-25-persuasion-context'];
  for (const purpose of ['semantic_resolution', 'materialization_support', 'source_grounded_qa']) {
    const slice = query(refs, { purpose });
    for (const ref of refs) assert.ok(slice.facts.some(value => value.claim_ref === ref));
    assert.ok(slice.coverage.every(value => value.status === 'covered'));
  }
  const historical = authoring.claims.filter(claim => claim.domain === 'social_law_economy');
  assert.ok(historical.length > 0);
  assert.ok(historical.every(claim => claim.applicability.context_scope !== 'universal'));
});

test('unseen foggy hillside crossing composes weather and attention without asserting detection or safety', () => {
  const refs = ['claim:foundations-earth-27-fog-visibility',
    'claim:foundations-earth-30-upslope-fog', 'claim:foundations-ms-06-visual-selection'];
  for (const locale of ['ru', 'en']) {
    const slice = query(refs, { purpose: 'materialization_support', query_locale: locale });
    for (const ref of refs) assert.ok(slice.facts.some(value => value.claim_ref === ref));
    assert.equal(slice.hard_constraints.length, 0);
    assert.ok(slice.coverage.every(value => value.status === 'covered'));
  }
  const historical = authoring.claims.find(claim => claim.domain === 'environment'
    && claim.applicability.time && claim.applicability.places);
  assert.ok(historical);
  const outside = query([...refs, historical.claim_ref]);
  assert.ok(!outside.facts.some(value => value.claim_ref === historical.claim_ref));
});
