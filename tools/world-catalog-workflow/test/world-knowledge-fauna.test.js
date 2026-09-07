import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createWorldKnowledgeCore } from '../../../packages/world-knowledge/src/world-knowledge.js';
import { loadWorldKnowledgeAuthoringInput } from '../src/world-knowledge-authoring-loader.js';
import { compileWorldKnowledgePack } from '../src/world-knowledge-pack.js';

const input = fileURLToPath(new URL('../../../data/world-catalogs/novgorod/world-knowledge/production-v1/authoring.json', import.meta.url));
const bundle = compileWorldKnowledgePack(await loadWorldKnowledgeAuthoringInput(input));
const core = createWorldKnowledgeCore(bundle);
const fauna = bundle.claims.filter(claim => claim.claim_ref.startsWith('claim:fauna-'));
const claim = suffix => 'claim:fauna-' + suffix;

function query(focus_refs, overrides = {}) {
  return core.resolveWorldKnowledge({
    schema: 'world_knowledge_query_v1',
    pack_ref: bundle.manifest.pack_ref, pack_revision: bundle.manifest.revision_id,
    purpose: 'semantic_resolution', query_locale: 'ru',
    domains: ['biology_physiology'], focus_refs,
    requested_predicates: [], search_hints: [],
    context: { time: { year: 1230 }, place_refs: ['region_novgorod_land'], actor_facets: {} },
    budget: { max_facts: 24, max_candidates: 24, max_context_chars: 7000 },
    ...overrides
  });
}

test('scientific fauna uses reviewed biological premises, not historical presence or actor knowledge', () => {
  assert.ok(fauna.length > 0);
  const evidence = new Map(bundle.evidence.map(row => [row.evidence_ref, row]));
  for (const row of fauna) {
    assert.equal(row.domain, 'biology_physiology', row.claim_ref);
    assert.equal(row.predicate, 'supported_fact');
    assert.deepEqual(row.applicability, { context_scope: 'universal' });
    assert.equal(row.knowledge_access.class, 'domain_internal_only');
    assert.equal(row.hard_exclusion, null);
    assert.equal(row.review_status, 'approved');
    assert.ok(row.evidence_refs.length > 0);
    for (const ref of row.evidence_refs) assert.equal(evidence.get(ref)?.review_status, 'approved');
  }
  for (const subject of new Set(fauna.map(row => row.subject_ref))) {
    const local = query([subject]);
    const elsewhere = query([subject], {
      context: { time: { year: 1800 }, place_refs: ['outside_novgorod'], actor_facets: {} }
    });
    assert.ok(local.facts.length > 0, subject);
    assert.deepEqual(local.facts.map(row => row.claim_ref), elsewhere.facts.map(row => row.claim_ref));
    for (const purpose of ['conversation', 'npc_decision', 'narration']) {
      assert.equal(query([subject], { purpose }).facts.length, 0, subject + ':' + purpose);
    }
  }
});

test('fauna covers distinct ecological groups and useful behavior rather than presence alone', () => {
  const groups = [
    ['wild mammals', ['mammals-wolf-pack-pup-care', 'mammals-eurasian-lynx-ambush-hunting',
      'mammals-european-otter-vibrissal-foraging', 'mammals-red-fox-seed-dispersal']],
    ['domestic mammals', ['mammals-domestic-cattle-flight-zone', 'mammals-domestic-horse-separation-stress',
      'mammals-ruminant-grazing-selectivity', 'mammals-domestic-dog-multimodal-communication',
      'sheep-flocking', 'ewe-lambing-seclusion', 'ewe-lamb-recognition', 'goat-sociality', 'doe-kid-care']],
    ['birds', ['mallard-brood', 'bird-navigation', 'tawny-owl-pellets', 'great-tit-winter-flocks',
      'chicken-dust-bathing', 'chicken-brooding']],
    ['fish', ['pike-ambush', 'salmon-anadromy', 'eel-migration', 'fish-low-oxygen',
      'fish-vibration-senses', 'perch-group-behavior']],
    ['amphibians and reptiles', ['frog-metamorphosis', 'toad-breeding-return', 'adder-defence',
      'adder-viviparity', 'amphibian-moist-skin']],
    ['invertebrates', ['bee-waggle', 'dragonfly-foodweb', 'culex-life-cycle',
      'tick-questing', 'earthworm-soil-effects', 'mussel-fish-host', 'cross-spider-web',
      'crayfish-egg-carrying']]
  ];
  for (const [group, suffixes] of groups) {
    const refs = suffixes.map(claim);
    for (const query_locale of ['ru', 'en']) {
      const slice = query(refs, { query_locale, purpose: 'materialization_support' });
      for (const ref of refs) assert.ok(slice.facts.some(row => row.claim_ref === ref), group + ':' + ref);
      assert.equal(slice.hard_constraints.length, 0);
    }
  }
});

test('migration, juvenile dispersal and winter dormancy remain different relations', () => {
  const refs = ['bird-migration-energy', 'salmon-repeat-spawning', 'eel-migration',
    'cross-spider-ballooning', 'bee-swarming', 'common-frog-aquatic-overwintering',
    'adder-winter-refuge', 'brown-bear-winter-denning',
    'mammals-red-squirrel-no-hibernation-weather-shelter'].map(claim);
  for (const query_locale of ['ru', 'en']) {
    const slice = query(refs, { query_locale });
    for (const ref of refs) assert.ok(slice.facts.some(row => row.claim_ref === ref), ref);
    const squirrel = slice.facts.find(row => row.claim_ref === refs.at(-1));
    assert.match(squirrel.runtime_text, query_locale === 'ru' ? /не.*спяч/u : /not hibernate/u);
    const eel = slice.facts.find(row => row.claim_ref === refs[2]);
    assert.match(eel.runtime_text, query_locale === 'ru' ? /море/u : /sea/u);
  }
});

test('unseen stream obstruction question composes animal engineering, water quality and development', () => {
  const refs = ['mammals-eurasian-beaver-dam-hydrology', 'fish-summer-night-oxygen',
    'tadpole-temperature', 'dragonfly-foodweb'].map(claim);
  const result = query(refs, { purpose: 'materialization_support' });
  for (const ref of refs) assert.ok(result.facts.some(row => row.claim_ref === ref), ref);
  assert.equal(result.hard_constraints.length, 0);
  assert.equal(result.facts.length, refs.length);
});

test('experimental animal behavior keeps age, context and individual variation in both locales', () => {
  for (const query_locale of ['ru', 'en']) {
    const slice = query([claim('perch-experience'), claim('perch-group-behavior'),
      claim('crayfish-juvenile-activity')], { query_locale });
    assert.equal(slice.facts.length, 3);
    for (const row of slice.facts.filter(row => row.claim_ref.includes('perch'))) {
      assert.match(row.runtime_text, query_locale === 'ru' ? /опыт/u : /experiment/i);
    }
    const crayfish = slice.facts.find(row => row.claim_ref.includes('crayfish'));
    assert.match(crayfish.runtime_text, query_locale === 'ru' ? /молод|молоди/ui : /juvenile/i);
    assert.match(crayfish.runtime_text, query_locale === 'ru' ? /укрыти/u : /shelter/i);
    assert.match(crayfish.runtime_text, query_locale === 'ru' ? /лаборатор/u : /laboratory/i);
  }
});
