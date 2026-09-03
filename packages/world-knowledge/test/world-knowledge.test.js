import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { WorldKnowledgeError, createWorldKnowledgeCore, validateWorldKnowledgeQuery } from '../src/index.js';

const bundlePath = new URL('../../../data/world-catalogs/novgorod/world-knowledge/pilot-v1/runtime-bundle.json', import.meta.url);
const baseBundle = JSON.parse(await readFile(bundlePath, 'utf8'));
const productionBundle = JSON.parse(await readFile(new URL('../../../data/world-catalogs/novgorod/world-knowledge/production-v1/runtime-bundle.json', import.meta.url), 'utf8'));

function query(overrides = {}) {
  return {
    schema: 'world_knowledge_query_v1',
    pack_ref: baseBundle.manifest.pack_ref,
    pack_revision: baseBundle.manifest.revision_id,
    purpose: 'semantic_resolution',
    query_locale: 'ru',
    domains: ['economy_trade', 'law_institutions'],
    focus_refs: [],
    requested_predicates: [],
    search_hints: [],
    context: { time: { year: 1230 }, place_refs: ['region_novgorod_land'], actor_facets: {} },
    budget: { max_facts: 24, max_candidates: 12, max_context_chars: 7000 },
    ...overrides
  };
}

test('the normative query shape is valid and resolution is deterministic', () => {
  const core = createWorldKnowledgeCore(baseBundle);
  const input = query({
    domains: ['economy_trade'],
    focus_refs: ['wk:economy:debt_record'],
    requested_predicates: ['attested_use'],
    search_hints: ['долговая запись']
  });
  assert.equal(validateWorldKnowledgeQuery(input, baseBundle).ok, true);
  assert.deepEqual(core.resolveWorldKnowledge(input), core.resolveWorldKnowledge(input));
});

test('exact focus outranks a lexical match and locale does not change canonical identity', () => {
  const core = createWorldKnowledgeCore(baseBundle);
  const ru = core.resolveWorldKnowledge(query({
    focus_refs: ['wk:law:judicial_accusation_record'],
    search_hints: ['долговая запись']
  }));
  const en = core.resolveWorldKnowledge(query({
    query_locale: 'en',
    focus_refs: ['wk:law:judicial_accusation_record'],
    search_hints: ['debt record']
  }));
  assert.equal(ru.facts[0].claim_ref, 'claim:novgorod-1220-1240-judicial-record-attested');
  assert.equal(en.facts[0].claim_ref, ru.facts[0].claim_ref);
  assert.notEqual(en.facts[0].runtime_text, ru.facts[0].runtime_text);
});

test('inapplicable and no-hit queries stay unresolved rather than becoming exclusions', () => {
  const core = createWorldKnowledgeCore(baseBundle);
  const inapplicable = core.resolveWorldKnowledge(query({ context: { time: { year: 1400 }, place_refs: ['region_novgorod_land'], actor_facets: {} } }));
  const noHit = core.resolveWorldKnowledge(query({ search_hints: ['несуществующий термин'] }));
  for (const slice of [inapplicable, noHit]) {
    assert.equal(slice.verdict, 'unresolved');
    assert.deepEqual(slice.hard_constraints, []);
  }
});

test('hard exclusions rank first and explicit disputes are preserved', () => {
  const bundle = structuredClone(baseBundle);
  const support = bundle.claims[0];
  const exclusion = {
    ...structuredClone(support),
    claim_ref: 'claim:test:exclusion',
    polarity: 'exclude',
    hard_exclusion: { eligible: true, basis_kind: 'not_available_in_region' },
    conflict_group_ref: null
  };
  const disputedA = { ...structuredClone(support), claim_ref: 'claim:test:disputed-a', conflict_group_ref: 'conflict:test' };
  const disputedB = { ...structuredClone(support), claim_ref: 'claim:test:disputed-b', conflict_group_ref: 'conflict:test' };
  bundle.claims.push(exclusion, disputedA, disputedB);
  bundle.exact_indexes.concept_to_claim_refs[support.subject_ref].push(exclusion.claim_ref, disputedA.claim_ref, disputedB.claim_ref);
  bundle.structured_indexes.time_to_claim_refs['range::1220:1240'].push(exclusion.claim_ref, disputedA.claim_ref, disputedB.claim_ref);
  bundle.structured_indexes.place_to_claim_refs.region_novgorod_land.push(exclusion.claim_ref, disputedA.claim_ref, disputedB.claim_ref);
  const slice = createWorldKnowledgeCore(bundle).resolveWorldKnowledge(query({
    domains: ['economy_trade'],
    focus_refs: [support.subject_ref]
  }));
  assert.equal(slice.verdict, 'disputed');
  assert.equal(slice.hard_constraints[0].claim_ref, exclusion.claim_ref);
  assert.deepEqual(slice.disputes[0].claims.map((claim) => claim.claim_ref), [disputedA.claim_ref, disputedB.claim_ref]);
});

test('a conflict group is never truncated to one side', () => {
  const bundle = structuredClone(baseBundle);
  const support = bundle.claims[0];
  const refs = ['claim:test:conflict-a', 'claim:test:conflict-b'];
  bundle.claims.push(...refs.map((claim_ref) => ({ ...structuredClone(support), claim_ref, conflict_group_ref: 'conflict:atomic' })));
  bundle.exact_indexes.concept_to_claim_refs[support.subject_ref].push(...refs);
  bundle.exact_indexes.domain_to_claim_refs.economy_trade.push(...refs);
  bundle.exact_indexes.predicate_to_claim_refs.attested_use.push(...refs);
  bundle.structured_indexes.time_to_claim_refs['range::1220:1240'].push(...refs);
  bundle.structured_indexes.place_to_claim_refs.region_novgorod_land.push(...refs);
  const slice = createWorldKnowledgeCore(bundle).resolveWorldKnowledge(query({
    domains: ['economy_trade'], focus_refs: [support.subject_ref],
    budget: { max_facts: 1, max_candidates: 1, max_context_chars: 7000 }
  }));
  assert.equal(slice.verdict, 'disputed');
  assert.deepEqual(slice.disputes, []);
  assert.deepEqual(slice.gaps.find((gap) => gap.conflict_group_ref === 'conflict:atomic'), {
    domain: 'economy_trade', status: 'conflict_group_exceeds_candidate_budget', conflict_group_ref: 'conflict:atomic'
  });
});

test('coverage, operational availability and actor knowledge are distinct', () => {
  assert.throws(() => createWorldKnowledgeCore(null), (error) => error instanceof WorldKnowledgeError && error.code === 'WORLD_KNOWLEDGE_UNAVAILABLE');
  const invalidBundle = structuredClone(baseBundle);
  invalidBundle.claims[0].hard_exclusion = { eligible: true, basis: 'not_available_in_region' };
  assert.throws(() => createWorldKnowledgeCore(invalidBundle), (error) => error instanceof WorldKnowledgeError && error.code === 'WORLD_KNOWLEDGE_UNAVAILABLE');
  for (const field of ['applicability', 'knowledge_access']) {
    const malformed = structuredClone(baseBundle);
    delete malformed.claims[0][field];
    assert.throws(() => createWorldKnowledgeCore(malformed), (error) => error instanceof WorldKnowledgeError && error.code === 'WORLD_KNOWLEDGE_UNAVAILABLE');
  }
  const malformedProfile = structuredClone(baseBundle);
  malformedProfile.coverage_profiles[0].scope = { places: 'bad' };
  assert.throws(() => createWorldKnowledgeCore(malformedProfile), (error) => error instanceof WorldKnowledgeError && error.code === 'WORLD_KNOWLEDGE_UNAVAILABLE');
  const core = createWorldKnowledgeCore(baseBundle);
  assert.equal(core.resolveWorldKnowledge(query({ domains: ['economy_trade'] })).coverage[0].status, 'partial');
  assert.equal(core.resolveWorldKnowledge(query({
    purpose: 'conversation',
    domains: ['economy_trade'],
    focus_refs: ['wk:economy:debt_record']
  })).verdict, 'unresolved');

  const bundle = structuredClone(baseBundle);
  bundle.claims[0].knowledge_access = { class: 'occupation_bound', required_facets: ['occupation_ref'] };
  const actorCore = createWorldKnowledgeCore(bundle);
  const actorQuery = query({ purpose: 'conversation', domains: ['economy_trade'], focus_refs: ['wk:economy:debt_record'] });
  assert.equal(actorCore.resolveWorldKnowledge(actorQuery).verdict, 'unresolved');
  actorQuery.context.actor_facets.occupation_ref = 'wk:occupation:merchant';
  assert.equal(actorCore.resolveWorldKnowledge(actorQuery).verdict, 'supported');
});

test('coverage uses the declared temporal precision', () => {
  for (const [time, year, expected] of [
    [{ precision: 'before', year: 1230 }, 1200, 'covered'],
    [{ precision: 'after', year: 1230 }, 1240, 'covered'],
    [{ precision: 'circa', year: 1230 }, 1230, 'covered'],
    [{ precision: 'century_part', from: 1200, to: 1233 }, 1230, 'covered']
  ]) {
    const bundle = structuredClone(baseBundle);
    bundle.coverage_profiles[0] = { ...bundle.coverage_profiles[0], status: 'production', runtime_requirement: 'required_when_selected', scope: { time } };
    const slice = createWorldKnowledgeCore(bundle).resolveWorldKnowledge(query({
      domains: ['economy_trade'], context: { time: { year }, place_refs: [], actor_facets: {} }
    }));
    assert.equal(slice.coverage[0].status, expected);
  }
});

test('structured applicability keeps universal and matching claims only', () => {
  const bundle = structuredClone(baseBundle);
  const source = bundle.claims[0];
  const universal = { ...structuredClone(source), claim_ref: 'claim:test:universal', applicability: { context_scope: 'universal' } };
  const matching = { ...structuredClone(source), claim_ref: 'claim:test:matching', applicability: { time: { precision: 'exact', year: 1230 } } };
  const mismatch = { ...structuredClone(source), claim_ref: 'claim:test:mismatch', applicability: { time: { precision: 'exact', year: 1400 } } };
  bundle.claims.push(universal, matching, mismatch);
  bundle.exact_indexes.concept_to_claim_refs[source.subject_ref].push(universal.claim_ref, matching.claim_ref, mismatch.claim_ref);
  bundle.exact_indexes.domain_to_claim_refs.economy_trade.push(universal.claim_ref, matching.claim_ref, mismatch.claim_ref);
  bundle.exact_indexes.predicate_to_claim_refs.attested_use.push(universal.claim_ref, matching.claim_ref, mismatch.claim_ref);
  bundle.structured_indexes.time_to_claim_refs.universal = [universal.claim_ref];
  bundle.structured_indexes.time_to_claim_refs['exact:1230::'] = [matching.claim_ref];
  bundle.structured_indexes.time_to_claim_refs['exact:1400::'] = [mismatch.claim_ref];
  const slice = createWorldKnowledgeCore(bundle).resolveWorldKnowledge(query({ domains: ['economy_trade'], focus_refs: [source.subject_ref] }));
  assert.deepEqual(new Set(slice.facts.map((claim) => claim.claim_ref)), new Set([source.claim_ref, universal.claim_ref, matching.claim_ref]));
});

test('facts, candidates and context are bounded', () => {
  const slice = createWorldKnowledgeCore(baseBundle).resolveWorldKnowledge(query({
    budget: { max_facts: 1, max_candidates: 1, max_context_chars: 40 }
  }));
  assert.ok(slice.facts.length + slice.hard_constraints.length <= 1);
  assert.ok(slice.candidates.length <= 1);
  assert.ok(slice.context_text.length <= 40);
});

test('inapplicable high-ranked noise cannot evict an applicable claim', () => {
  const bundle = structuredClone(baseBundle);
  const support = bundle.claims[0];
  const noise = {
    ...structuredClone(support),
    claim_ref: 'claim:aaa:inapplicable-hard',
    polarity: 'exclude',
    applicability: { time: { precision: 'exact', year: 1400 } },
    hard_exclusion: { eligible: true, basis_kind: 'introduced_after_context' }
  };
  bundle.claims.push(noise);
  bundle.exact_indexes.concept_to_claim_refs[support.subject_ref].push(noise.claim_ref);
  const slice = createWorldKnowledgeCore(bundle).resolveWorldKnowledge(query({
    domains: ['economy_trade'],
    focus_refs: [support.subject_ref],
    budget: { max_facts: 1, max_candidates: 1, max_context_chars: 7000 }
  }));
  assert.equal(slice.verdict, 'supported');
  assert.equal(slice.facts[0].claim_ref, support.claim_ref);
});

test('query rejects unknown fields and revision mismatches', () => {
  assert.equal(validateWorldKnowledgeQuery({ ...query(), surprise: true }, baseBundle).ok, false);
  assert.equal(validateWorldKnowledgeQuery(query({ pack_revision: 'revision:other' }), baseBundle).ok, false);
  assert.equal(validateWorldKnowledgeQuery(query({ requested_predicates: ['invented'] }), baseBundle).ok, false);
  assert.equal(validateWorldKnowledgeQuery(query({ context: { time: { year: 1230 }, place_refs: [], actor_facets: {}, conditions: { invented: true } } }), baseBundle).ok, false);
  assert.equal(validateWorldKnowledgeQuery(query({ context: { time: { year: 1230, precision: 'exact' }, place_refs: [], actor_facets: {} } }), baseBundle).ok, false);
});

test('production pack grounds historical and physical premises without asserting presence', () => {
  const core = createWorldKnowledgeCore(productionBundle);
  const historical = core.resolveWorldKnowledge(query({
    pack_ref: productionBundle.manifest.pack_ref,
    pack_revision: productionBundle.manifest.revision_id,
    domains: ['environment'], focus_refs: [], requested_predicates: [],
    search_hints: ['рыбных ресурсов'],
    context: { time: { year: 1230 },
      place_refs: ['region_novgorod_land'], actor_facets: {} }
  }));
  assert.equal(historical.coverage[0].status, 'covered');
  assert.equal(historical.verdict, 'supported');
  assert.ok(historical.facts.some(({ claim_ref }) =>
    claim_ref === 'claim:regional-fish-exploitation'));
  assert.ok(historical.context_text.includes('не устанавливает'));

  const physical = core.resolveWorldKnowledge(query({
    pack_ref: productionBundle.manifest.pack_ref,
    pack_revision: productionBundle.manifest.revision_id,
    domains: ['physics_material_science'], focus_refs: [],
    requested_predicates: [], search_hints: ['трение движение'],
    context: { time: { year: 1230 }, place_refs: [], actor_facets: {} }
  }));
  assert.equal(physical.coverage[0].status, 'covered');
  assert.ok(physical.facts.some(({ claim_ref }) =>
    claim_ref === 'claim:dry-friction'));
  assert.deepEqual(physical.candidates, []);
});

test('production hard exclusion rejects anachronistic legal backport', () => {
  const slice = createWorldKnowledgeCore(productionBundle)
    .resolveWorldKnowledge(query({
      pack_ref: productionBundle.manifest.pack_ref,
      pack_revision: productionBundle.manifest.revision_id,
      domains: ['social_law_economy'], focus_refs: [],
      requested_predicates: [], search_hints: ['судная грамота'],
      context: { time: { year: 1230 },
        place_refs: ['region_novgorod_land'], actor_facets: {} }
    }));
  assert.equal(slice.verdict, 'excluded');
  assert.equal(slice.hard_constraints[0].claim_ref,
    'claim:later-novgorod-judicial-charter');
});
