import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createWorldKnowledgeCore } from '../../../packages/world-knowledge/src/world-knowledge.js';
import { loadWorldKnowledgeAuthoringInput } from '../src/world-knowledge-authoring-loader.js';
import { compileWorldKnowledgePack } from '../src/world-knowledge-pack.js';
import { buildWorldKnowledgeEmbeddingEntries } from '../src/world-knowledge-embeddings.js';

const input = fileURLToPath(new URL('../../../data/world-catalogs/novgorod/world-knowledge/production-v1/authoring.json', import.meta.url));
const pack = await loadWorldKnowledgeAuthoringInput(input);
const bundle = compileWorldKnowledgePack(pack);
const core = createWorldKnowledgeCore(bundle);

test('production bundle retains exact independent approvals for every claim', async () => {
  const committed = JSON.parse(await readFile(new URL('../../../data/world-catalogs/novgorod/world-knowledge/production-v1/runtime-bundle.json', import.meta.url), 'utf8'));
  assert.deepEqual(bundle, committed);
  assert.equal(pack.verifications.length, pack.claims.length);
  const verdicts = new Map(pack.verifications.map(record => [record.verification_ref, record]));
  const descriptor = JSON.parse(await readFile(input, 'utf8'));
  const authoringPaths = new Set(descriptor.includes.map(path => `data/world-catalogs/novgorod/world-knowledge/production-v1/${path}`));
  const candidateShards = new Map();
  for (const claim of bundle.claims) {
    const verdict = verdicts.get(claim.verification_ref);
    assert.equal(verdict?.claim_ref, claim.claim_ref);
    assert.equal(verdict.verdict, 'APPROVE');
    const [, candidateCommit, candidatePath, candidateClaim] = /^git:([a-f0-9]{40}):(.+)#(.+)$/u.exec(verdict.candidate_ref);
    assert.ok(authoringPaths.has(candidatePath), verdict.candidate_ref);
    const candidateObject = `${candidateCommit}:${candidatePath}`;
    if (!candidateShards.has(candidateObject)) {
      candidateShards.set(candidateObject, JSON.parse(execFileSync('git', ['show', candidateObject], {
        cwd: fileURLToPath(new URL('../../../', import.meta.url)), encoding: 'utf8'
      })));
    }
    assert.equal(candidateClaim, claim.claim_ref);
    const shard = candidateShards.get(candidateObject);
    assert.ok(['world_knowledge_authoring_pack_v1', 'world_knowledge_authoring_fragment_v1'].includes(shard.schema));
    assert.deepEqual(shard.claims.find(record => record.claim_ref === candidateClaim), pack.claims.find(record => record.claim_ref === candidateClaim));
    assert.deepEqual(shard.claim_localizations.filter(record => record.claim_ref === candidateClaim), pack.claim_localizations.filter(record => record.claim_ref === candidateClaim));
  }
  for (const review of new Set(pack.verifications.map(record => record.review_ref.split('#')[0]))) {
    const report = await readFile(new URL(`../../../data/world-catalogs/novgorod/world-knowledge/${review}`, import.meta.url), 'utf8');
    assert.ok(report.trim(), review);
  }
  assert.equal(Object.hasOwn(bundle, 'verifications'), false);
  const profile = JSON.parse(await readFile(new URL('../../../data/world-catalogs/novgorod/world-knowledge/embedding-profiles/giga-480m-0826-v1.json', import.meta.url), 'utf8'));
  const index = JSON.parse(await readFile(new URL('../../../data/world-catalogs/novgorod/world-knowledge/production-v1/vector-index.json', import.meta.url), 'utf8'));
  assert.deepEqual(buildWorldKnowledgeEmbeddingEntries(bundle, profile), index.entries);
  const unapproved = JSON.parse(await readFile(new URL('../../../data/world-catalogs/novgorod/world-knowledge/research/unapproved-foundation-v2.json', import.meta.url), 'utf8'));
  for (const claim of unapproved.claims) {
    assert.ok(!bundle.claims.some(record => record.claim_ref === claim.claim_ref));
    assert.ok(!pack.verifications.some(record => record.claim_ref === claim.claim_ref));
  }
});

function query(domains, focus_refs, overrides = {}) {
  return core.resolveWorldKnowledge({
    schema: 'world_knowledge_query_v1',
    pack_ref: bundle.manifest.pack_ref,
    pack_revision: bundle.manifest.revision_id,
    purpose: 'semantic_resolution', query_locale: 'ru',
    domains, focus_refs, requested_predicates: [], search_hints: [],
    context: { time: { year: 1230 }, place_refs: ['region_novgorod_land'],
      actor_facets: {} },
    budget: { max_facts: 24, max_candidates: 24, max_context_chars: 7000 },
    ...overrides
  });
}

test('gameplay gap premises compose without granting scene facts or actor expertise', () => {
  const cases = [
    ['claim:research-stitching-can-secure-weak-textile-to-support',
      'claim:research-failure-of-stitched-leather-join-can-separate-components'],
    ['claim:research-boiling-alone-does-not-establish-fuel-or-toxic-chemical-water-drinkability',
      'claim:heating-reduces-microbial-viability'],
    ['claim:research-fuel-combustion-can-produce-carbon-monoxide',
      'claim:research-carbon-monoxide-can-accumulate-indoors'],
    ['claim:research-cold-water-immersion-can-cause-immersion-hypothermia',
      'claim:candidate-physiology-v3-shivering-thermogenesis'],
    ['claim:candidate-nettle-bast-fibre-retting-decortication',
      'claim:modern-fibre-rope-condition-can-reduce-available-strength'],
    ['claim:aquatic-macrophyte-form-determines-attachment-and-leaf-position',
      'claim:candidate-river-flood-woody-debris-transport-retention-conditional'],
    ['claim:water-can-cool-class-a-fire-fuel-and-flame',
      'claim:smoke-particles-can-attenuate-light-and-reduce-visibility'],
    ['claim:candidate-plant-identity-can-require-multiple-diagnostic-characters',
      'claim:candidate-edible-plant-status-does-not-transfer-to-every-part'],
    ['claim:candidate-physiology-v3-shivering-thermogenesis',
      'claim:candidate-physiology-v3-vestibular-postural-correction',
      'claim:candidate-physiology-v3-protective-withdrawal'],
    ['claim:food-drying-depends-on-humidity-airflow',
      'claim:stored-grain-airflow-can-reduce-temperature-differences'],
    ['claim:wet-granular-liquid-bridges-can-provide-capillary-cohesion',
      'claim:partially-saturated-granular-deformation-can-change-pore-phase-configuration',
      'claim:foundations-earth-07-soil-water-states']
  ];
  for (const refs of cases) {
    const claims = refs.map(ref => {
      const claim = bundle.claims.find(item => item.claim_ref === ref);
      assert.ok(claim, ref);
      assert.equal(claim.applicability.context_scope, 'universal', ref);
      return claim;
    });
    const domains = [...new Set(claims.map(claim => claim.domain))];
    const focus = [...new Set(claims.map(claim => claim.subject_ref))];
    for (const query_locale of ['ru', 'en']) {
      const slice = query(domains, focus, { query_locale });
      for (const ref of refs) assert.ok(slice.facts.some(fact => fact.claim_ref === ref), ref);
      assert.equal(slice.hard_constraints.length, 0);
      for (const purpose of ['conversation', 'npc_decision', 'narration']) {
        const subjective = query(domains, focus, { query_locale, purpose });
        for (const claim of claims.filter(item => item.knowledge_access.class === 'domain_internal_only')) {
          assert.ok(!subjective.facts.some(fact => fact.claim_ref === claim.claim_ref), claim.claim_ref);
        }
      }
    }
  }
});

test('wild-flora science composes with historical gathering without granting food or actor knowledge', () => {
  const modernRefs = [
    'claim:wild-mushroom-resemblance-not-edibility',
    'claim:most-fungi-hyphae-substrate-nutrition',
    'claim:bearberry-lingonberry-resemblance-not-identification',
    'claim:mezereon-poisonous-sap-all-parts'
  ];
  const focus = modernRefs.map(ref => {
    const claim = bundle.claims.find(value => value.claim_ref === ref);
    assert.ok(claim, ref);
    assert.deepEqual(claim.applicability, { context_scope: 'universal' });
    assert.equal(claim.knowledge_access.class, 'domain_internal_only');
    return claim.subject_ref;
  });
  const historicalRef = 'claim:troitsky-gathered-plants-probably-link-to-southern-deciduous-woodland';
  const historicalFocus = 'wk:environment:southern-deciduous-gathered-plants';
  for (const query_locale of ['ru', 'en']) {
    const slice = query(['biology_physiology', 'environment'],
      [...focus, historicalFocus], { query_locale, purpose: 'materialization_support' });
    for (const ref of [...modernRefs, historicalRef]) {
      assert.ok(slice.facts.some(fact => fact.claim_ref === ref), ref);
    }
    assert.equal(slice.hard_constraints.length, 0);
    const fungi = slice.facts.find(fact => fact.claim_ref === modernRefs[1]);
    assert.match(fungi.runtime_text, query_locale === 'ru' ? /большинств/u : /Most fungi/u);
    const historical = slice.facts.find(fact => fact.claim_ref === historicalRef);
    assert.equal(historical.qualifiers.directness, 'inferred');
    assert.equal(historical.qualifiers.confidence, 'medium');
  }
  const elsewhere = query(['biology_physiology', 'environment'],
    [...focus, historicalFocus], {
      context: { time: { year: 1800 }, place_refs: ['outside_novgorod'], actor_facets: {} }
    });
  assert.ok(!elsewhere.facts.some(fact => fact.claim_ref === historicalRef));
  for (const ref of modernRefs) assert.ok(elsewhere.facts.some(fact => fact.claim_ref === ref), ref);
  for (const purpose of ['conversation', 'npc_decision', 'narration']) {
    assert.equal(query(['biology_physiology'], focus, { purpose }).facts.length, 0);
  }
});

test('an unfamiliar mushroom on stored wood composes substrate biology without a foraging recipe', () => {
  const slice = query(['biology_physiology'], [
    'wk:biology_physiology:fungal-mycelium-nutrition',
    'wk:biology_physiology:fungal-decomposition',
    'wk:biology_physiology:wild-mushroom-identification'
  ]);
  for (const ref of ['claim:most-fungi-hyphae-substrate-nutrition',
    'claim:fungal-decomposition-affects-nutrient-recycling',
    'claim:wild-mushroom-resemblance-not-edibility']) {
    assert.ok(slice.facts.some(fact => fact.claim_ref === ref), ref);
  }
  assert.equal(slice.hard_constraints.length, 0);
});

test('seasonal conveyance and probable communion function preserve source scope and unknown material', () => {
  for (const [focus, ref] of [
    ['wk:material_culture:sledge', 'claim:transport-winter-sledge-1220'],
    ['wk:material_culture:probable-travel-chalice', 'claim:probable-travel-chalice-communion']
  ]) {
    for (const query_locale of ['ru', 'en']) {
      const slice = query(['material_culture'], [focus], { purpose: 'materialization_support', query_locale });
      const fact = slice.facts.find(item => item.claim_ref === ref);
      assert.ok(fact, ref);
      assert.equal(fact.qualifiers.confidence, 'medium');
      assert.equal(fact.qualifiers.directness, 'inferred');
      if (ref === 'claim:transport-winter-sledge-1220') assert.match(fact.runtime_text, /1220/u);
      else {
        assert.match(fact.runtime_text, query_locale === 'ru' ? /вероятнее всего/u : /most likely/u);
        assert.match(fact.runtime_text, query_locale === 'ru' ? /Материал.*не названы/u : /Material.*unspecified/u);
      }
      assert.equal(slice.hard_constraints.length, 0);
    }
    for (const purpose of ['conversation', 'npc_decision', 'narration']) {
      assert.ok(query(['material_culture'], [focus], { purpose }).facts.every(fact => fact.claim_ref !== ref));
    }
    assert.ok(query(['material_culture'], [focus], {
      context: { time: { year: 1800 }, place_refs: ['outside_novgorod'], actor_facets: {} }
    }).facts.every(fact => fact.claim_ref !== ref));
  }
});

test('historical hunting grounds compose with general mechanics without defining a trap or relocating geography', () => {
  const historicalFocus = ['wk:craft_technology:early-rus-hunting-resource-grounds'];
  const physicsFocus = ['wk:physics_material_science:force-contact-geometry',
    'wk:physics_material_science:dry-friction', 'wk:physics_material_science:surface-friction'];
  const refs = ['claim:early-rus-hunting-ground-terms', 'claim:force-contact-geometry',
    'claim:dry-friction', 'claim:population-physics-static-friction'];
  const slice = query(['craft_technology', 'physics_material_science'],
    [...historicalFocus, ...physicsFocus], { purpose: 'materialization_support' });
  for (const ref of refs) assert.ok(slice.facts.some(fact => fact.claim_ref === ref), ref);
  const historical = slice.facts.find(fact => fact.claim_ref === refs[0]);
  assert.equal(historical.qualifiers.directness, 'inferred');
  assert.match(historical.runtime_text, /Днепру и Десне, а не к Новгородской/u);
  assert.match(historical.runtime_text, /не описание механизма ловушки/u);
  assert.equal(slice.hard_constraints.length, 0);
  for (const purpose of ['conversation', 'npc_decision', 'narration']) {
    assert.equal(query(['craft_technology'], historicalFocus, { purpose }).facts.length, 0);
  }
  const outside = query(['craft_technology', 'physics_material_science'],
    [...historicalFocus, ...physicsFocus], {
      context: { time: { year: 1800 }, place_refs: ['outside_novgorod'], actor_facets: {} }
    });
  assert.ok(!outside.facts.some(fact => fact.claim_ref === refs[0]));
  for (const ref of refs.slice(1)) assert.ok(outside.facts.some(fact => fact.claim_ref === ref));
});

test('officeholder episodes and burial containers retain dated individual evidence without actor authority', () => {
  for (const [domain, focus, refs] of [
    ['npc_daily_life', ['wk:npc_daily_life:posadnik-role-context'],
      ['claim:posadnik-fedor-conflict-1224', 'claim:posadnik-volodislav-pursuit-1228']],
    ['material_culture', ['wk:material_culture:plank-burial-container',
      'wk:material_culture:hollowed-log-burial-container'],
      ['claim:burial-plank-coffin-nails', 'claim:burial-coffin-lid-transverse-plank',
        'claim:burial-hollowed-log-container']]
  ]) {
    for (const query_locale of ['ru', 'en']) {
      const slice = query([domain], focus, { purpose: 'materialization_support', query_locale });
      assert.deepEqual(new Set(slice.facts.map(fact => fact.claim_ref)), new Set(refs));
      assert.ok(slice.facts.every(fact => fact.qualifiers.directness === 'inferred' &&
        fact.qualifiers.confidence === 'medium' && fact.predicate === 'supported_fact'));
      assert.equal(slice.hard_constraints.length, 0);
      if (domain === 'npc_daily_life') {
        assert.match(slice.context_text, /1224/u);
        assert.match(slice.context_text, /1228/u);
      } else assert.match(slice.context_text, query_locale === 'ru' ? /предварительн/u : /preliminary|preliminarily/u);
    }
    for (const purpose of ['conversation', 'npc_decision', 'narration']) {
      assert.equal(query([domain], focus, { purpose }).facts.length, 0);
    }
    for (const context of [
      { time: { year: 1500 }, place_refs: ['region_novgorod_land'], actor_facets: {} },
      { time: { year: 1230 }, place_refs: ['outside_novgorod'], actor_facets: {} }
    ]) assert.equal(query([domain], focus, { context }).facts.length, 0);
  }
});

test('spinning capability and oil records preserve distinct applicability without granting actor knowledge', () => {
  const spinning = query(['physics_material_science'], ['wk:physics_material_science:fibre-twisting']);
  assert.equal(spinning.facts[0].claim_ref, 'claim:textile-fibres-twist-yarn');
  assert.equal(spinning.facts[0].qualifiers.typicality, 'unknown');
  const oil = query(['material_culture'], ['wk:material_culture:historically-recorded-maslo']);
  assert.equal(oil.facts.length, 1);
  assert.equal(oil.facts[0].claim_ref, 'claim:maslo-birchbark-718-account');
  assert.equal(oil.facts[0].qualifiers.directness, 'inferred');
  assert.match(oil.facts[0].runtime_text, /горшок масла/u);
  assert.doesNotMatch(oil.facts[0].runtime_text, /два горшка|двух горшках/u);
  const outside = { time: { year: 1800 }, place_refs: ['outside_novgorod'], actor_facets: {} };
  assert.equal(query(['physics_material_science'], ['wk:physics_material_science:fibre-twisting'],
    { context: outside }).facts.length, 1);
  assert.equal(query(['material_culture'], ['wk:material_culture:historically-recorded-maslo'],
    { context: outside }).facts.length, 0);
  for (const purpose of ['conversation', 'npc_decision', 'narration']) {
    assert.equal(query(['physics_material_science'], ['wk:physics_material_science:fibre-twisting'],
      { purpose }).facts.length, 0);
    assert.equal(query(['material_culture'], ['wk:material_culture:historically-recorded-maslo'],
      { purpose }).facts.length, 0);
  }
});

test('analysed textile colourants retain source dates, import uncertainty and non-recipe terminology', () => {
  const focus = ['wk:material_culture:textile-colourants'];
  const refs = ['claim:textile-ellagic-acid-analysis', 'claim:textile-chrysin-analysis',
    'claim:textile-indigo-yellow-analysis', 'claim:textile-lac-dye-analysis'];
  for (const query_locale of ['ru', 'en']) {
    const slice = query(['material_culture'], focus, { query_locale });
    assert.deepEqual(new Set(slice.facts.map(fact => fact.claim_ref)), new Set(refs));
    assert.match(slice.facts.find(fact => fact.claim_ref === refs[1]).runtime_text, /глиняная|глиняной/u);
    assert.match(slice.facts.find(fact => fact.claim_ref === refs[2]).runtime_text,
      query_locale === 'ru' ? /импортное происхождение.*возможным/u : /imported origin remains possible/u);
    assert.equal(slice.hard_constraints.length, 0);
  }
  const earlier = query(['material_culture'], focus, {
    context: { time: { year: 1150 }, place_refs: ['region_novgorod_land'], actor_facets: {} }
  });
  assert.deepEqual(new Set(earlier.facts.map(fact => fact.claim_ref)), new Set(refs.slice(0, 2)));
  for (const purpose of ['conversation', 'npc_decision', 'narration']) {
    assert.equal(query(['material_culture'], focus, { purpose }).facts.length, 0);
  }
  assert.equal(query(['material_culture'], focus, {
    context: { time: { year: 1230 }, place_refs: ['outside_novgorod'], actor_facets: {} }
  }).facts.length, 0);
});

test('oil and fat treatments retain distinct material states without historical or actor authority', () => {
  const refs = ['claim:oil-rawhide-moisture-resistance',
    'claim:oil-fat-vegetable-leather-flexibility', 'claim:oil-tanning-crosslinking-fibres'];
  const domains = ['physics_material_science', 'chemistry_process'];
  const focus = ['wk:material_culture:rawhide', 'wk:material_culture:vegetable-tanned-leather',
    'wk:chemistry_process:oil-tanning'];
  for (const query_locale of ['ru', 'en']) {
    const slice = query(domains, focus, { query_locale });
    for (const ref of refs) {
      const fact = slice.facts.find(item => item.claim_ref === ref);
      assert.ok(fact, ref);
      assert.deepEqual(fact.qualifiers, { typicality: 'unknown', confidence: 'high', directness: 'direct' });
      assert.match(fact.runtime_text, query_locale === 'ru' ? /не|это не/u : /not|neither/u);
    }
    assert.equal(slice.hard_constraints.length, 0);
  }
  // Universal reactions remain usable outside the historical pack region.
  const universal = query(domains, focus, {
    context: { time: { year: 1800 }, place_refs: ['outside_novgorod'], actor_facets: {} }
  });
  for (const ref of refs) assert.ok(universal.facts.some(item => item.claim_ref === ref));
  for (const purpose of ['conversation', 'npc_decision', 'narration']) {
    assert.ok(query(domains, focus, { purpose }).facts.every(item => !refs.includes(item.claim_ref)));
  }
});

test('household care rules remain conditional comparative texts rather than enacted law or personal duties', () => {
  const refs = ['claim:rp-minor-children-conditional-care', 'claim:rp-caretaker-principal-goods',
    'claim:rp-mother-household-care-succession'];
  const focus = ['wk:social_law_economy:conditional-dependant-care',
    'wk:social_law_economy:conditional-maternal-care-succession'];
  for (const query_locale of ['ru', 'en']) {
    const slice = query(['social_law_economy'], focus, { query_locale, purpose: 'materialization_support' });
    assert.deepEqual(new Set(slice.facts.map(fact => fact.claim_ref)), new Set(refs));
    assert.ok(slice.facts.every(fact => fact.qualifiers.directness === 'inferred'
      && fact.qualifiers.confidence === 'medium' && fact.qualifiers.typicality === 'unknown'));
    assert.equal(slice.hard_constraints.length, 0);
  }
  for (const purpose of ['npc_decision', 'conversation', 'narration']) {
    assert.equal(query(['social_law_economy'], focus, { purpose }).facts.length, 0);
  }
  for (const context of [
    { time: { year: 1100 }, place_refs: ['region_novgorod_land'], actor_facets: {} },
    { time: { year: 1230 }, place_refs: ['outside_novgorod'], actor_facets: {} }
  ]) assert.equal(query(['social_law_economy'], focus, { context }).facts.length, 0);
});

test('pitch observations remain bound to their coating system without general resin sealing or historical availability', () => {
  const refs = ['claim:pine-pitch-woven-basket-coating', 'claim:pine-pitch-severe-oxidation'];
  const focus = ['wk:material_culture:pine-pitch-coating'];
  for (const query_locale of ['ru', 'en']) {
    const slice = query(['physics_material_science'], focus, { query_locale });
    assert.deepEqual(new Set(slice.facts.map(fact => fact.claim_ref)), new Set(refs));
    assert.ok(slice.facts.every(fact => fact.qualifiers.typicality === 'attested'));
    assert.match(slice.facts.find(fact => fact.claim_ref === refs[0]).runtime_text,
      query_locale === 'ru' ? /плетёной корзине/u : /woven-basket system/u);
    assert.equal(slice.hard_constraints.length, 0);
  }
  for (const purpose of ['npc_decision', 'conversation', 'narration']) {
    assert.equal(query(['physics_material_science'], focus, { purpose }).facts.length, 0);
  }
  assert.equal(query(['material_culture'], focus, { purpose: 'materialization_support' }).facts.length, 0);
});

test('basic care keeps conditional pressure and waterproof protection separate from guaranteed recovery', () => {
  const refs = ['claim:care-direct-pressure-bleeding', 'claim:care-waterproof-wound-cover'];
  const focus = ['wk:biology_physiology:tissue-injury-response'];
  for (const query_locale of ['ru', 'en']) {
    const slice = query(['biology_physiology'], focus, {
      query_locale, context: { time: { year: 1800 },
        place_refs: ['outside_novgorod'], actor_facets: {} }
    });
    for (const ref of refs) assert.ok(slice.facts.some(fact => fact.claim_ref === ref), ref);
    const barrier = slice.facts.find(fact => fact.claim_ref === refs[1]);
    assert.match(barrier.runtime_text, query_locale === 'ru' ? /водонепроницаемая повязка/u : /waterproof bandage/u);
    assert.match(barrier.runtime_text, query_locale === 'ru' ? /загрязнённой водой/u : /contaminated-water exposure/u);
    assert.equal(slice.hard_constraints.length, 0);
  }
  for (const purpose of ['npc_decision', 'conversation', 'narration']) {
    assert.ok(query(['biology_physiology'], focus, { purpose }).facts.every(fact => !refs.includes(fact.claim_ref)));
  }
});

test('vegetable tanning retains prepared-hide prerequisites and chemistry without local practice or actor knowledge', () => {
  const refs = ['claim:vegetable-tanning-prepared-hide', 'claim:vegetable-tanning-collagen-stabilization'];
  const focus = ['wk:material_culture:vegetable-tanned-leather'];
  for (const query_locale of ['ru', 'en']) {
    const slice = query(['chemistry_process'], focus, {
      query_locale, context: { time: { year: 1800 },
        place_refs: ['outside_novgorod'], actor_facets: {} }
    });
    assert.deepEqual(new Set(slice.facts.map(fact => fact.claim_ref)), new Set(refs));
    assert.ok(slice.facts.every(fact => fact.qualifiers.directness === 'direct'));
    assert.equal(slice.hard_constraints.length, 0);
  }
  for (const purpose of ['npc_decision', 'conversation', 'narration']) {
    assert.equal(query(['chemistry_process'], focus, { purpose }).facts.length, 0);
  }
});

test('pollen-based wetland context retains regional inference rather than a present reed source', () => {
  const ref = 'claim:novgorod-wetland-pollen-context';
  const focus = ['wk:environment:novgorod-wetland-vegetation-context'];
  for (const query_locale of ['ru', 'en']) {
    const slice = query(['environment'], focus, { query_locale, purpose: 'materialization_support' });
    const fact = slice.facts.find(fact => fact.claim_ref === ref);
    assert.ok(fact);
    assert.equal(fact.qualifiers.directness, 'inferred');
    assert.equal(fact.qualifiers.confidence, 'medium');
    assert.match(fact.runtime_text, /Spirea \(Filipendula\)/u);
  }
  for (const context of [
    { time: { year: 1800 }, place_refs: ['region_novgorod_land'], actor_facets: {} },
    { time: { year: 1230 }, place_refs: ['outside_novgorod'], actor_facets: {} }
  ]) assert.equal(query(['environment'], focus, { context }).facts.length, 0);
  assert.equal(query(['environment'], focus, { purpose: 'npc_decision' }).facts.length, 0);
});

test('stone tool maintenance remains qualified historical use rather than any-rock or scene authority', () => {
  const refs = ['claim:stone-whetstone-edge-maintenance', 'claim:stone-grinding-metal-use'];
  for (const query_locale of ['ru', 'en']) {
    const slice = query(['material_culture'], ['wk:material_culture:stone'], { query_locale });
    for (const ref of refs) {
      const fact = slice.facts.find(fact => fact.claim_ref === ref);
      assert.ok(fact, ref);
      assert.equal(fact.qualifiers.confidence, 'medium');
      assert.equal(fact.qualifiers.directness, 'inferred');
    }
    const elsewhere = query(['material_culture'], ['wk:material_culture:stone'], {
      query_locale, context: { time: { year: 1800 }, place_refs: ['outside_novgorod'], actor_facets: {} }
    });
    assert.ok(elsewhere.facts.every(fact => !refs.includes(fact.claim_ref)));
  }
  for (const purpose of ['npc_decision', 'conversation', 'narration']) {
    assert.ok(query(['material_culture'], ['wk:material_culture:stone'], { purpose })
      .facts.every(fact => !refs.includes(fact.claim_ref)));
  }
});

test('rewetting dried and ceramically transformed clay preserves the physical state distinction', () => {
  const refs = ['claim:clay-fired-no-replasticization',
    'claim:clay-firing-structural-transformation', 'claim:clay-dried-replasticization'];
  for (const query_locale of ['ru', 'en']) {
    const slice = query(['physics_material_science'], ['wk:material_culture:clay'], {
      query_locale, context: { time: { year: 1800 },
        place_refs: ['outside_novgorod'], actor_facets: {} }
    });
    for (const ref of refs) assert.ok(slice.facts.some(fact => fact.claim_ref === ref), ref);
    assert.equal(slice.hard_constraints.length, 0);
  }
  for (const purpose of ['npc_decision', 'conversation', 'narration']) {
    const slice = query(['physics_material_science'], ['wk:material_culture:clay'], { purpose });
    assert.ok(slice.facts.every(fact => !refs.includes(fact.claim_ref)));
  }
});

test('mixed tool and material focus retains both requested stone-working relationships in a bounded slice', () => {
  const slice = query(['craft_technology', 'physics_material_science', 'material_culture'],
    ['wk:craft_technology:woodworking', 'wk:material_culture:saw',
      'wk:material_culture:stone', 'wk:physics_material_science:solid-deformation',
      'wk:physics_material_science:surface-friction'], {
      query_locale: 'en',
      search_hints: ['conditional sawing methods for hard-stone blank',
        'conditional smoothing methods for hard-stone blank',
        'does sawing method guarantee any knife works on every rock',
        'does smoothing method guarantee any grit works on every rock',
        'suitability of hard-stone blank for sawing and smoothing',
        'conditions for effective sawing of hard stone',
        'conditions for effective smoothing of hard stone',
        'dependence of sawing and smoothing on tool and material properties'],
      budget: { max_facts: 12, max_candidates: 12, max_context_chars: 5000 }
    });
  const refs = new Set(slice.facts.map(({ claim_ref }) => claim_ref));
  assert.ok(refs.has('claim:hard-stone-abrasive-sawing'));
  assert.ok(refs.has('claim:hard-stone-abrasive-shaping'));
});

test('transport evidence supplies qualified vehicle and hired-worker context without assigning scene state or expertise', () => {
  const domains = ['material_culture', 'npc_daily_life'];
  const focus = ['wk:material_culture:sledge', 'wk:material_culture:boat',
    'wk:material_culture:horse-tack', 'wk:npc_daily_life:boat-worker'];
  const expected = ['sledge-summer-cargo', 'boat-cargo-dispatch',
    'hired-boatman', 'horse-sledge-equipment',
    'private-boat-arrangement'].map((suffix) => 'claim:transport-' + suffix);
  for (const query_locale of ['ru', 'en']) {
    const slice = query(domains, focus, { query_locale, purpose: 'materialization_support' });
    for (const ref of expected) {
      const fact = slice.facts.find(({ claim_ref }) => claim_ref === ref);
      assert.ok(fact, ref);
      assert.equal(fact.qualifiers.confidence, 'medium');
      assert.equal(fact.qualifiers.directness,
        ref === 'claim:transport-private-boat-arrangement' ? 'direct' : 'inferred');
      assert.ok(fact.runtime_text.length > 0);
    }
    assert.equal(slice.hard_constraints.length, 0);
  }
  for (const purpose of ['conversation', 'npc_decision', 'narration']) {
    assert.ok(query(domains, focus, { purpose }).facts.every(({ claim_ref }) =>
      !expected.includes(claim_ref)));
  }
  for (const context of [
    { time: { year: 1500 }, place_refs: ['region_novgorod_land'], actor_facets: {} },
    { time: { year: 1230 }, place_refs: ['outside_novgorod'], actor_facets: {} }
  ]) assert.ok(query(domains, focus, { context }).facts.every(({ claim_ref }) =>
    !expected.includes(claim_ref)));
});

test('material-focused queries include scientific classification and origin without borrowing historical availability', () => {
  for (const [focus, ref] of [
    ['wk:material_culture:hemp-fibre', 'claim:material-water-hemp-cellulosic-fibre'],
    ['wk:material_culture:linen-textile', 'claim:material-water-linen-flax-origin']
  ]) {
    for (const query_locale of ['ru', 'en']) {
      const slice = query(['physics_material_science', 'material_culture'], [focus], {
        query_locale,
        context: { time: { year: 1800 }, place_refs: ['outside_novgorod'], actor_facets: {} }
      });
      const fact = slice.facts.find(({ claim_ref }) => claim_ref === ref);
      assert.ok(fact, ref);
      assert.equal(fact.domain, 'physics_material_science');
      assert.equal(fact.qualifiers.directness, 'direct');
      assert.equal(fact.qualifiers.confidence, 'high');
      assert.deepEqual(fact.evidence_refs, ['evidence:plant-fibres-cci']);
    }
    assert.ok(query(['physics_material_science', 'material_culture'], [focus], {
      purpose: 'conversation'
    }).facts.every(({ claim_ref }) => claim_ref !== ref));
  }
  const wet = query(['physics_material_science', 'material_culture'], [
    'wk:physics_material_science:natural-fibre-water-response',
    'wk:physics_material_science:textile-water-damage',
    'wk:material_culture:hemp-fibre', 'wk:material_culture:cordage'
  ], {
    search_hints: ['Как волокна пеньковой верёвки реагируют на воду?',
      'Вызывает ли намокание необратимую порчу пеньковой верёвки?'],
    budget: { max_facts: 12, max_candidates: 12, max_context_chars: 5000 }
  });
  for (const ref of ['claim:material-water-hemp-cellulosic-fibre',
    'claim:material-water-natural-fibres-water-swelling']) {
    assert.ok(wet.facts.some(({ claim_ref }) => claim_ref === ref), ref);
  }
});

test('hay feeding composes separate biology and history while river landings remain contextual categories', () => {
  const domains = ['material_culture', 'biology_physiology', 'architecture_settlement'];
  const focus = ['wk:material_culture:hay', 'wk:biology_physiology:horse-forage-feeding',
    'wk:architecture_settlement:river-landing'];
  const universal = 'claim:fodder-healthy-horse-forage';
  const historical = ['claim:fodder-hay-account', 'claim:river-landing-category',
    'claim:river-landing-named-list', 'claim:river-landing-market-approaches',
    'claim:river-landing-surfacing-allocation'];
  for (const query_locale of ['ru', 'en']) {
    const slice = query(domains, focus, { query_locale, purpose: 'materialization_support' });
    for (const ref of [universal, ...historical]) {
      const fact = slice.facts.find(({ claim_ref }) => claim_ref === ref);
      assert.ok(fact, ref);
      assert.equal(fact.qualifiers.directness, ref === universal ? 'direct' : 'inferred');
    }
    assert.equal(slice.hard_constraints.length, 0);
  }
  const elsewhere = query(domains, focus, {
    context: { time: { year: 1800 }, place_refs: ['outside_novgorod'], actor_facets: {} }
  });
  assert.deepEqual(elsewhere.facts.map(({ claim_ref }) => claim_ref), [universal]);
  assert.equal(query(domains, focus, { purpose: 'npc_decision' }).facts.length, 0);
});

test('livestock biology supplies distinct digestive premises without transferring history or actor knowledge', () => {
  const domains = ['biology_physiology', 'environment', 'material_culture'];
  const focus = ['wk:biology_physiology:ruminant-digestion',
    'wk:biology_physiology:swine-digestion', 'wk:material_culture:hay'];
  const refs = ['ruminant-membership', 'rumen-fermentation', 'rumen-forage-digestion',
    'rumen-fermentation-nutrients', 'swine-membership', 'swine-comparative-diet']
    .map(suffix => 'claim:livestock-' + suffix);
  for (const query_locale of ['ru', 'en']) {
    const slice = query(domains, focus, { query_locale });
    for (const ref of [...refs, 'claim:fodder-hay-account']) {
      assert.ok(slice.facts.some(fact => fact.claim_ref === ref), ref);
    }
    const outside = query(domains, focus, { query_locale,
      context: { time: { year: 1800 }, place_refs: ['outside_novgorod'], actor_facets: {} }
    });
    assert.deepEqual(new Set(outside.facts.map(fact => fact.claim_ref)), new Set(refs));
    assert.equal(outside.hard_constraints.length, 0);
    assert.ok(outside.facts.every(fact => fact.qualifiers.directness === 'direct'));
  }
  for (const purpose of ['conversation', 'npc_decision', 'narration']) {
    assert.equal(query(domains, focus, { purpose }).facts.length, 0);
  }
  // Unseen-equivalent species query uses the class relation, not a species handler.
  const goat = query(['biology_physiology'], ['wk:biology_physiology:ruminant-digestion'], { query_locale: 'en',
    search_hints: ['Why can a goat digest hay and grass?'] });
  for (const ref of ['claim:livestock-ruminant-membership',
    'claim:livestock-rumen-forage-digestion']) {
    assert.ok(goat.facts.some(fact => fact.claim_ref === ref), ref);
  }
});

test('stone-working possibilities, early wheel technology and church statutes retain different authority limits', () => {
  const scientific = ['claim:hard-stone-abrasive-sawing', 'claim:hard-stone-abrasive-shaping'];
  const historical = ['claim:ceramic-novgorod-wheel', 'claim:religion-olenin-church-people',
    'claim:religion-olenin-adjudication', 'claim:religion-priest-child-baptism'];
  const domains = ['physics_material_science', 'material_culture', 'social_law_economy'];
  const focus = ['wk:material_culture:stone', 'wk:material_culture:ceramic-vessel',
    'wk:social_law_economy:church-people-statutory-category',
    'wk:social_law_economy:ecclesiastical-adjudication',
    'wk:social_law_economy:priest-baptism-statutory-context'];
  for (const query_locale of ['ru', 'en']) {
    const slice = query(domains, focus, { query_locale, purpose: 'materialization_support' });
    for (const ref of [...scientific, ...historical]) {
      const fact = slice.facts.find(fact => fact.claim_ref === ref);
      assert.ok(fact, ref);
      assert.equal(fact.qualifiers.confidence, 'medium');
      assert.equal(fact.qualifiers.directness, 'inferred');
    }
    for (const context of [
      { time: { year: 1800 }, place_refs: ['region_novgorod_land'], actor_facets: {} },
      { time: { year: 1230 }, place_refs: ['outside_novgorod'], actor_facets: {} }
    ]) {
      const outside = query(domains, focus, { context, query_locale });
      for (const ref of scientific) assert.ok(outside.facts.some(fact => fact.claim_ref === ref));
      assert.ok(outside.facts.every(fact => !historical.includes(fact.claim_ref)));
    }
  }
  for (const purpose of ['conversation', 'npc_decision', 'narration']) {
    assert.ok(query(domains, focus, { purpose }).facts.every(fact =>
      ![...scientific, ...historical].includes(fact.claim_ref)));
  }
});

test('production retrieval composes historical inputs and tool functions without an authored result recipe', () => {
  const slice = query(['craft_technology'], ['wk:craft_technology:bark-assembly']);
  const relations = slice.facts.map((fact) => [fact.predicate, fact.object.value]);
  for (const relation of [
    ['requires_input', 'wk:material_culture:birch-bark'],
    ['requires_input', 'wk:material_culture:bast'],
    ['requires_tool', 'wk:material_culture:cutting-tool'],
    ['requires_tool', 'wk:material_culture:piercing-tool']
  ]) assert.ok(relations.some((value) => JSON.stringify(value) === JSON.stringify(relation)));
  assert.equal(slice.verdict, 'supported');
  // The same premises can ground a new laced bark sleeve: no sleeve handler,
  // output identity, quantity or successful transformation is asserted here.
  assert.ok(slice.facts.every((fact) => !Object.hasOwn(fact, 'party_mutation')));
});

test('actual fisher role receives craft facts; unrelated roles cannot borrow that expertise', () => {
  const domains = ['craft_technology'];
  const focus = ['wk:craft_technology:bark-assembly'];
  const actorQuery = (role_ref, purpose) => query(domains, focus, {
    purpose, context: { time: { year: 1230 }, place_refs: ['region_novgorod_land'],
      actor_facets: { role_ref } }
  });
  for (const purpose of ['npc_decision', 'conversation', 'narration']) {
    assert.ok(actorQuery('nov_role_fisher', purpose).facts.some((fact) =>
      fact.claim_ref === 'claim:population-bark-bast'));
    assert.ok(!actorQuery('nov_role_boatman', purpose).facts.some((fact) =>
      fact.claim_ref === 'claim:population-bark-bast'));
  }
  assert.ok(actorQuery('nov_role_boatman', 'materialization_support').facts.some((fact) =>
    fact.claim_ref === 'claim:population-bark-bast'));
});

test('material responses survive historical context changes; historical practice does not', () => {
  const context = { time: { year: 1800 }, place_refs: ['outside_novgorod'],
    actor_facets: {} };
  const physical = query(['physics_material_science'], ['wk:material_culture:wood'], { context });
  assert.ok(physical.facts.some((fact) =>
    fact.claim_ref === 'claim:population-material-wood-shrinkage'));
  const historical = query(['craft_technology'], ['wk:craft_technology:bark-assembly'], { context });
  assert.equal(historical.facts.length, 0);
  assert.equal(historical.verdict, 'unresolved');
});

test('an unseen soaked wooden wedge uses uptake and swelling facts without granting scientific NPC knowledge', () => {
  const domains = ['physics_material_science'];
  const focus = ['wk:material_culture:wood'];
  const slice = query(domains, focus, {
    context: { time: { year: 1800 }, place_refs: ['outside_novgorod'], actor_facets: {} },
    requested_predicates: ['responds_to']
  });
  const refs = new Set(slice.facts.map(({ claim_ref }) => claim_ref));
  const technical = ['claim:wood-liquid-fibre-saturation',
    'claim:wood-liquid-capillary-uptake', 'claim:wood-liquid-directional-uptake',
    'claim:population-material-wood-shrinkage'];
  for (const ref of [...technical, 'claim:wood-liquid-moisture-change']) assert.ok(refs.has(ref), ref);
  const dimensional = slice.facts.find(({ claim_ref }) =>
    claim_ref === 'claim:population-material-wood-shrinkage');
  assert.equal(dimensional.object.value, 'bound_water_gain_or_loss_below_fibre_saturation');
  assert.match(slice.context_text, /разбухание древесины/u);
  assert.match(slice.context_text, /потеря — усушку/u);
  assert.equal(slice.hard_constraints.length, 0);
  const conversation = query(domains, focus, { purpose: 'conversation' });
  assert.ok(conversation.facts.every(({ claim_ref }) => !technical.includes(claim_ref)));
});

test('wood, metal, fibre and clay have distinct conditional responses instead of one material rule', () => {
  for (const [domain, concept, expected] of [
    ['chemistry_process', 'iron', 'iron-rust'],
    ['chemistry_process', 'wood', 'wood-combustion'],
    ['physics_material_science', 'wool', 'wet-wool'],
    ['physics_material_science', 'clay', 'clay-plasticity']
  ]) {
    const slice = query([domain], ['wk:material_culture:' + concept]);
    assert.ok(slice.facts.some((fact) =>
      fact.claim_ref === 'claim:population-material-' + expected), expected);
  }
  const wool = query(['physics_material_science'], ['wk:material_culture:wool']);
  assert.ok(!wool.facts.some((fact) => fact.claim_ref === 'claim:population-material-wet-silk'));
});

test('later machine families are excluded without banning ordinary steam or magnetic experiments', () => {
  for (const [concept, claim] of [
    ['atmospheric-reciprocating-engine', 'newcomen-boundary'],
    ['electromagnetic-motor', 'motor-boundary']
  ]) {
    const slice = query(['craft_technology'], ['wk:craft_technology:' + concept]);
    assert.equal(slice.verdict, 'excluded');
    assert.ok(slice.hard_constraints.some((fact) =>
      fact.claim_ref === 'claim:technology-' + claim));
  }
  const steam = query(['physics_material_science'], ['wk:physics_material_science:phase-change']);
  assert.equal(steam.verdict, 'supported');
  assert.equal(steam.hard_constraints.length, 0);
  const circuit = query(['physics_material_science'], ['wk:physics_material_science:conducting-circuit']);
  assert.ok(circuit.facts.some((fact) => fact.claim_ref === 'claim:technology-circuit-prerequisite'));
});

test('an unfamiliar porous vessel attachment composes water and fracture facts without a vessel recipe', () => {
  const slice = query(['physics_material_science'], [
    'wk:material_culture:porous-ceramic',
    'wk:material_culture:ceramic-attachment',
    'wk:material_culture:ceramic'
  ]);
  const refs = new Set(slice.facts.map((fact) => fact.claim_ref));
  for (const suffix of ['ceramic-water', 'ceramic-joint', 'ceramic-fracture']) {
    assert.ok(refs.has('claim:population-' + suffix));
  }
  assert.equal(slice.hard_constraints.length, 0);
  assert.equal(slice.verdict, 'supported');
});

test('scientific glass-forming knowledge is objective context, not automatic NPC expertise', () => {
  const focus = ['wk:physics_material_science:glass-forming'];
  const objective = query(['physics_material_science'], focus);
  assert.ok(objective.facts.some((fact) => fact.claim_ref === 'claim:population-glass-cooling'));
  const subjective = query(['physics_material_science'], focus, { purpose: 'conversation' });
  assert.ok(!subjective.facts.some((fact) => fact.claim_ref === 'claim:population-glass-cooling'));
});

test('rewetting dried food composes microbial conditions without certifying food safety', () => {
  const slice = query(['biology_physiology'], [
    'wk:biology_physiology:food-drying',
    'wk:biology_physiology:microbial-growth'
  ]);
  const refs = new Set(slice.facts.map((fact) => fact.claim_ref));
  for (const ref of [
    'claim:drying-reduces-microbial-growth-conditions',
    'claim:microbial-growth-depends-on-available-moisture',
    'claim:microbial-growth-depends-on-species-temperature-range'
  ]) assert.ok(refs.has(ref));
  assert.equal(slice.verdict, 'supported');
  assert.equal(slice.hard_constraints.length, 0);
});

test('conditional historical legal premises are not automatically a speakers legal expertise', () => {
  const focus = ['wk:social_law_economy:market-purchase-dispute'];
  const objective = query(['social_law_economy'], focus);
  assert.ok(objective.facts.some((fact) =>
    fact.claim_ref === 'claim:rp-market-purchase-relates-proof-participant'));
  const subjective = query(['social_law_economy'], focus, { purpose: 'conversation' });
  assert.equal(subjective.facts.length, 0);
  const earlier = query(['social_law_economy'], focus, {
    context: { time: { year: 1100 }, place_refs: ['region_novgorod_land'], actor_facets: {} }
  });
  assert.equal(earlier.facts.length, 0);
});

test('legal focus concepts name their source conditions without losing the procedural evidence', () => {
  for (const [focus, expected] of [
    ['lost-stolen-property-recognition', 'rp-property-claim-relates-acquisition-chain'],
    ['merchant-journey-loss-of-third-party-goods-or-funds', 'rp-merchant-credit-relates-third-party-goods']
  ]) {
    const slice = query(['social_law_economy'], ['wk:social_law_economy:' + focus]);
    assert.ok(slice.facts.some(({ claim_ref }) => claim_ref === 'claim:' + expected));
    assert.equal(slice.hard_constraints.length, 0);
  }
  // A debt-record focus alone does not select a lost-property procedure.
  const debt = query(['social_law_economy'], ['wk:social_law_economy:debt-record']);
  assert.ok(!debt.facts.some(({ claim_ref }) =>
    claim_ref === 'claim:rp-property-claim-relates-acquisition-chain'));
});

test('an unfamiliar wooden repair composes historical joint forms without requiring a registered repair recipe', () => {
  const slice = query(['material_culture'], [
    'wk:craft_technology:vessel-joinery',
    'wk:craft_technology:plank-gap-caulking'
  ]);
  const refs = new Set(slice.facts.map((fact) => fact.claim_ref));
  for (const suffix of [
    'wooden-peg-vessel-joint', 'forged-iron-nail-vessel-joint',
    'tarred-tow-caulking', 'iron-clamp-caulking'
  ]) assert.ok(refs.has('claim:construction-' + suffix));
  assert.equal(slice.verdict, 'supported');
  assert.equal(slice.hard_constraints.length, 0);
  assert.ok(slice.facts.filter((fact) => fact.claim_ref.includes('caulking'))
    .every((fact) => fact.qualifiers.directness === 'inferred'));
});

test('shirt alteration composes material and fastening facts without a costume or tailoring recipe', () => {
  const slice = query(['material_culture'], [
    'wk:material_culture:tunic-shirt',
    'wk:material_culture:shirt-collar-button'
  ]);
  const refs = new Set(slice.facts.map((fact) => fact.claim_ref));
  for (const suffix of ['wool-shirt', 'linen-shirt', 'bone-button', 'button-shirt', 'shirt-gussets']) {
    assert.ok(refs.has('claim:clothing-' + suffix));
  }
  assert.equal(slice.verdict, 'supported');
  assert.equal(slice.hard_constraints.length, 0);
  const outside = query(['material_culture'], ['wk:material_culture:tunic-shirt'], {
    context: { time: { year: 1230 }, place_refs: ['outside_novgorod'], actor_facets: {} }
  });
  assert.equal(outside.facts.length, 0);
});

test('unleavened flatbread uses general dough and heating premises without a local recipe', () => {
  const focus = ['wk:physics_material_science:bread-dough-formation-and-baking'];
  const slice = query(['physics_material_science'], focus, {
    context: { time: { year: 1800 }, place_refs: ['outside_novgorod'], actor_facets: {} }
  });
  const refs = new Set(slice.facts.map(({ claim_ref }) => claim_ref));
  for (const suffix of ['ground-plant-base', 'liquid', 'optional-leaven',
    'dough-before-baking', 'oven-baking', 'open-fire-baking']) {
    assert.ok(refs.has('claim:grain-processing-bread-' + suffix));
  }
  assert.equal(slice.hard_constraints.length, 0);
  assert.equal(query(['physics_material_science'], focus, {
    purpose: 'conversation'
  }).facts.length, 0);
});

test('wall-painting materials remain qualified historical context, not universal actor knowledge', () => {
  const focus = ['wk:craft_technology:wall-painting'];
  const slice = query(['material_culture', 'craft_technology'], focus);
  const refs = new Set(slice.facts.map(({ claim_ref }) => claim_ref));
  for (const suffix of ['yellow-ochre', 'red-ochre', 'lazurite',
    'blue-lime-basis', 'blue-layer-order', 'wet-dry-techniques']) {
    assert.ok(refs.has('claim:pigment-' + suffix));
  }
  assert.ok(slice.facts.every(({ qualifiers }) => qualifiers.directness === 'inferred'));
  assert.equal(query(['material_culture', 'craft_technology'], focus, {
    purpose: 'conversation'
  }).facts.length, 0);
  assert.equal(query(['material_culture', 'craft_technology'], focus, {
    context: { time: { year: 1230 }, place_refs: ['outside_novgorod'], actor_facets: {} }
  }).facts.length, 0);
});

test('ordinary smithing retrieval is not excluded by irrelevant later-machine facts', () => {
  const slice = query(['material_culture', 'craft_technology', 'npc_daily_life'], [], {
    query_locale: 'en',
    search_hints: ['What material and tools supported a smith working metal: anvil, hammer and tongs?'],
    budget: { max_facts: 10, max_candidates: 10, max_context_chars: 7000 }
  });
  assert.equal(slice.hard_constraints.length, 0);
  const refs = new Set(slice.facts.map(({ claim_ref }) => claim_ref));
  for (const suffix of ['iron-input', 'anvil', 'hammer', 'tongs']) {
    assert.ok(refs.has('claim:occupation-smith-' + suffix), suffix);
  }
});

test('an unfamiliar porous insert separates surface wetting, capillary geometry and connected flow', () => {
  const domains = ['physics_material_science'];
  const focus = ['wk:physics_material_science:liquid-surface-wetting',
    'wk:physics_material_science:capillary-action',
    'wk:physics_material_science:porous-medium-water-flow'];
  const slice = query(domains, focus, {
    context: { time: { year: 1800 }, place_refs: ['outside_novgorod'], actor_facets: {} }
  });
  const refs = new Set(slice.facts.map(({ claim_ref }) => claim_ref));
  for (const suffix of ['wetting-forces', 'capillary-rise-depression', 'capillary-height',
    'percolation-openings', 'permeability-connected-pores']) assert.ok(refs.has('claim:water-' + suffix));
  assert.match(slice.context_text, /Изолированные поры не доказывают сквозной путь/u);
  assert.match(slice.context_text, /Смачиваемость не устанавливает пористость/u);
  assert.equal(slice.hard_constraints.length, 0);
  assert.equal(query(domains, focus, { purpose: 'conversation' }).facts.length, 0);
});

test('water responses distinguish hide processing and natural fibres without granting actor expertise', () => {
  const domain = ['physics_material_science'];
  const families = [
    { focus: ['wk:material_culture:leather',
      'wk:material_culture:vegetable-tanned-leather',
      'wk:material_culture:alum-tawed-skin', 'wk:material_culture:rawhide'],
    claims: ['leather-water-processing', 'vegetable-leather-water',
      'alum-skin-water', 'rawhide-wet-dry'] },
    { focus: ['wk:physics_material_science:plant-cellulosic-fibres',
      'wk:material_culture:linen-textile',
      'wk:physics_material_science:natural-fibre-water-response',
      'wk:physics_material_science:textile-water-damage'],
    claims: ['plant-fibre-cellulose', 'new-linen-water',
      'natural-fibres-water-swelling', 'textile-water-load',
      'textile-liquid-contaminants'] }
  ];
  for (const { focus, claims } of families) {
    const expected = claims.map((suffix) => 'claim:material-water-' + suffix);
    const slice = query(domain, focus, {
      context: { time: { year: 1800 }, place_refs: ['outside_novgorod'], actor_facets: {} }
    });
    for (const ref of expected) assert.ok(slice.facts.some(({ claim_ref }) => claim_ref === ref), ref);
    assert.equal(slice.hard_constraints.length, 0);
    for (const purpose of ['npc_decision', 'conversation', 'narration']) {
      assert.ok(query(domain, focus, { purpose }).facts.every(({ claim_ref }) =>
        !expected.includes(claim_ref)));
    }
  }
  // Unknown processing of a wet strap cannot select rawhide's drying response.
  const generic = query(domain, ['wk:material_culture:leather']);
  assert.ok(!generic.facts.some(({ claim_ref }) =>
    claim_ref === 'claim:material-water-rawhide-wet-dry'));
});

test('regional geology supplies a qualified source envelope, not a deposit or medieval extraction', () => {
  const domains = ['environment'];
  const focus = ['wk:environment:regional-quaternary-deposits'];
  const slice = query(domains, focus, { purpose: 'materialization_support' });
  assert.deepEqual(new Set(slice.facts.map(({ claim_ref }) => claim_ref)), new Set([
    'claim:terrain-background', 'claim:terrain-parent-material-assemblage'
  ]));
  assert.ok(slice.facts.every(({ predicate, qualifiers }) =>
    predicate === 'supported_fact' && qualifiers.directness === 'inferred' &&
    qualifiers.confidence === 'medium'));
  assert.match(slice.context_text, /не наличие всех пород/u);
  assert.match(slice.context_text, /свидетельство средневековой добычи/u);
  assert.equal(slice.hard_constraints.length, 0);
  assert.equal(query(domains, focus, { purpose: 'conversation' }).facts.length, 0);
  assert.equal(query(domains, focus, {
    context: { time: { year: 1230 }, place_refs: ['outside_novgorod'], actor_facets: {} }
  }).facts.length, 0);
});

test('earlier resin and glue evidence composes repair premises without a recipe or present supplies', () => {
  const domains = ['material_culture'];
  const focus = ['wk:material_culture:pine-resin', 'wk:material_culture:animal-glue',
    'wk:material_culture:aspen-cladding', 'wk:material_culture:bast'];
  const expected = ['pine-resin-surfaces', 'pine-resin-bast', 'animal-glue-chalk',
    'animal-glue-pegged-planks', 'aspen-cladding-joint', 'bast-vessel-fastening']
    .map((suffix) => 'claim:construction-' + suffix);
  const slice = query(domains, focus, { purpose: 'materialization_support' });
  for (const ref of expected) {
    const fact = slice.facts.find(({ claim_ref }) => claim_ref === ref);
    assert.ok(fact, ref);
    assert.equal(fact.qualifiers.confidence, 'medium');
    assert.equal(fact.qualifiers.directness, 'inferred');
    assert.match(fact.runtime_text, /XI века/u);
  }
  assert.equal(slice.hard_constraints.length, 0);
  for (const purpose of ['conversation', 'npc_decision', 'narration']) {
    assert.ok(query(domains, focus, { purpose }).facts.every(({ claim_ref }) =>
      !expected.includes(claim_ref)));
  }
  const outside = query(domains, focus, {
    context: { time: { year: 1230 }, place_refs: ['outside_novgorod'], actor_facets: {} }
  });
  assert.ok(outside.facts.every(({ claim_ref }) => !expected.includes(claim_ref)));
});

test('monumental construction separates observed work from inferred procurement without creating scene resources', () => {
  const domains = ['architecture_settlement'];
  const focus = ['wk:architecture_settlement:monumental-stone-church-construction',
    'wk:architecture_settlement:construction-pottery-production'];
  const slice = query(domains, focus, { purpose: 'materialization_support' });
  for (const [suffix, directness] of [
    ['quarry-procurement', 'inferred'], ['auxiliary-construction-work', 'direct'],
    ['construction-pottery-products', 'direct'], ['compared-church-masonry', 'direct'],
    ['plinth-patterns-1207', 'inferred']
  ]) {
    const fact = slice.facts.find(({ claim_ref }) => claim_ref === 'claim:construction-' + suffix);
    assert.ok(fact, suffix);
    assert.equal(fact.qualifiers.directness, directness);
    assert.equal(fact.qualifiers.confidence, directness === 'direct' ? 'high' : 'medium');
  }
  assert.equal(slice.hard_constraints.length, 0);
  assert.match(slice.context_text, /1207/u);
  assert.match(slice.context_text, /видимо/u);
  for (const purpose of ['npc_decision', 'conversation', 'narration']) {
    assert.equal(query(domains, focus, { purpose }).facts.length, 0);
  }
  for (const context of [
    { time: { year: 1500 }, place_refs: ['region_novgorod_land'], actor_facets: {} },
    { time: { year: 1230 }, place_refs: ['outside_novgorod'], actor_facets: {} }
  ]) assert.equal(query(domains, focus, { context }).facts.length, 0);
});

test('plant processing and rural borts compose historical resources without creating sources or actor expertise', () => {
  for (const [domains, focus, suffixes] of [
    [['environment', 'craft_technology', 'material_culture'],
      ['wk:environment:flax-hemp-cultivation', 'wk:craft_technology:hemp-stem-processing',
        'wk:material_culture:hemp-tow'],
      ['flax-hemp-cultivation', 'hemp-stem-fibre', 'hemp-processing-tow', 'tow-log-gaps']],
    [['craft_technology', 'material_culture'],
      ['wk:craft_technology:tree-bort-practice', 'wk:material_culture:tree-climbing-hook'],
      ['rural-tree-borts', 'bort-climbing-hooks', 'borts-honey', 'borts-wax']]
  ]) {
    const refs = suffixes.map((suffix) => 'claim:agriculture-fauna-' + suffix);
    const slice = query(domains, focus, { purpose: 'materialization_support' });
    for (const ref of refs) assert.ok(slice.facts.some(({ claim_ref }) => claim_ref === ref), ref);
    assert.equal(slice.hard_constraints.length, 0);
    for (const purpose of ['conversation', 'npc_decision', 'narration']) {
      assert.ok(query(domains, focus, { purpose }).facts.every(({ claim_ref }) => !refs.includes(claim_ref)));
    }
    assert.ok(query(domains, focus, {
      context: { time: { year: 1800 }, place_refs: ['outside_novgorod'], actor_facets: {} }
    }).facts.every(({ claim_ref }) => !refs.includes(claim_ref)));
  }
  const bow = query(['material_culture'], ['wk:material_culture:one-piece-ash-hunting-bow']);
  assert.equal(bow.facts.length, 1);
  assert.equal(bow.facts[0].qualifiers.directness, 'direct');
  assert.equal(query(['material_culture'], ['wk:material_culture:one-piece-ash-hunting-bow'], {
    context: { time: { year: 1200 }, place_refs: ['region_novgorod_land'], actor_facets: {} }
  }).facts.length, 0);
});

test('pottery, coloured wool and commodity records retain bounded evidence instead of recipes or prices', () => {
  for (const [domain, focus, refs] of [
    ['material_culture', ['wk:material_culture:ceramic-vessel'],
      ['claim:pottery-handmade-local-clay', 'claim:pottery-handmade-temper']],
    ['material_culture', ['wk:material_culture:wool'], ['claim:clothing-nerev-coloured-wool']],
    ['social_law_economy', ['wk:social_law_economy:regional-economic-activities',
      'wk:social_law_economy:business-record', 'wk:social_law_economy:accounting-or-commodity-entry'],
      ['claim:social-daily-economic-activities', 'claim:social-daily-fur-sale-accounting',
        'claim:social-daily-honey-documentary-entry', 'claim:social-daily-wax-commodity-context']]
  ]) {
    const slice = query([domain], focus, { purpose: 'materialization_support' });
    for (const ref of refs) {
      const fact = slice.facts.find(({ claim_ref }) => claim_ref === ref);
      assert.ok(fact, ref);
      assert.equal(fact.qualifiers.directness, 'inferred');
      assert.equal(fact.qualifiers.confidence, 'medium');
    }
    assert.equal(slice.hard_constraints.length, 0);
    assert.ok(query([domain], focus, { purpose: 'conversation' }).facts.every(({ claim_ref }) =>
      !refs.includes(claim_ref)));
  }
});

test('bathing context retains literary limits without granting medical effects or NPC knowledge', () => {
  const domains = ['architecture_settlement', 'material_culture'];
  const focus = ['wk:architecture_settlement:wooden-bathhouse',
    'wk:craft_technology:bathing-washing'];
  const slice = query(domains, focus);
  assert.deepEqual(new Set(slice.facts.map(({ claim_ref }) => claim_ref)), new Set([
    'claim:bathing-wooden-bathhouse-wood',
    'claim:bathing-house-heating-before-washing', 'claim:bathing-washing-water'
  ]));
  assert.ok(slice.facts.every(({ qualifiers }) =>
    qualifiers.confidence === 'medium' && qualifiers.directness === 'inferred'));
  assert.match(slice.context_text, /летописном|Летописное/u);
  assert.match(slice.context_text, /не задаёт.*лечебный эффект/u);
  assert.equal(query(domains, focus, { purpose: 'conversation' }).facts.length, 0);
  assert.equal(query(domains, focus, {
    context: { time: { year: 1500 }, place_refs: ['region_novgorod_land'], actor_facets: {} }
  }).facts.length, 0);
});

test('harvest tools and cereal processing retain regional, inferential and actor-access limits', () => {
  const groups = [
    ['material_culture', ['wk:material_culture:sickle', 'wk:material_culture:sheep-shears',
      'wk:material_culture:scythe'], ['harvest-sickle-crops-grasses',
      'harvest-sickle-wooden-handle', 'harvest-sheep-shearing-scissors',
      'harvest-scythe-iron-steel-specimen']],
    ['material_culture', ['wk:material_culture:barley', 'wk:material_culture:rye'],
      ['food-practices-barley-porridge-soup', 'food-practices-rye-flour-bread']],
    ['craft_technology', ['wk:craft_technology:grain-threshing', 'wk:craft_technology:millet-cleaning'],
      ['food-practices-threshing-chaff', 'food-practices-millet-cleaning-waste']],
    ['architecture_settlement', ['wk:architecture_settlement:grain-processing-area-evidence'],
      ['food-practices-processing-area-inference']]
  ];
  for (const [domain, focus, suffixes] of groups) {
    const refs = suffixes.map(suffix => 'claim:' + suffix);
    for (const query_locale of ['ru', 'en']) {
      const slice = query([domain], focus, { purpose: 'materialization_support', query_locale });
      for (const ref of refs) {
        const claim = slice.facts.find(fact => fact.claim_ref === ref);
        assert.ok(claim, ref);
        assert.equal(claim.qualifiers.confidence, 'medium');
        assert.equal(claim.qualifiers.directness, 'inferred');
      }
      assert.equal(slice.hard_constraints.length, 0);
    }
    for (const purpose of ['npc_decision', 'conversation', 'narration']) {
      assert.ok(query([domain], focus, { purpose }).facts.every(fact => !refs.includes(fact.claim_ref)));
    }
    for (const context of [
      { time: { year: 1600 }, place_refs: ['region_novgorod_land'], actor_facets: {} },
      { time: { year: 1230 }, place_refs: ['outside_novgorod'], actor_facets: {} }
    ]) assert.ok(query([domain], focus, { context }).facts.every(fact => !refs.includes(fact.claim_ref)));
  }
});
