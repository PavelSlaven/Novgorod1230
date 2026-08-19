import assert from 'node:assert/strict';
import test from 'node:test';
import { ordinaryWorldPropertyPlacementContextDigest,
  resolveOrdinaryWorldPropertyPlacement } from '../src/index.js';

const scope_ref = { entity_kind: 'g6', entity_id: 'kitchen-g6' };

function input(overrides = {}) {
  return {
    scope_ref: structuredClone(scope_ref),
    property_catalog_version_ref: 'property-catalog-v1',
    placement_catalog_version_ref: 'placement-catalog-v1',
    item_kind: 'man_made', supporting_basis_ref: 'spoon-source-1',
    causal_basis_refs: ['basis-a'], requested_position_ref: 'kitchen-table',
    personal_communal_refs: ['commune-1'], occupied_site_refs: ['household-1'],
    unowned_cause_refs: ['abandoned-source', 'cause-abandoned'],
    placement_context_refs: ['kitchen-context'],
    property_catalog: [
      { property_basis_ref: 'site-owner', state: 'committed', scope_ref: structuredClone(scope_ref), basis_class: 'occupied_site_default', source_ref: 'household-1', unowned_cause_ref: null },
      { property_basis_ref: 'communal-owner', state: 'committed', scope_ref: structuredClone(scope_ref), basis_class: 'personal_or_communal', source_ref: 'commune-1', unowned_cause_ref: null },
      { property_basis_ref: 'spoon-owner', state: 'committed', scope_ref: structuredClone(scope_ref), basis_class: 'explicit_source_item', source_ref: 'spoon-source-1', unowned_cause_ref: null }
    ],
    placement_catalog: [
      { position_ref: 'kitchen-table', state: 'committed', scope_ref: structuredClone(scope_ref), position_kind: 'scene_position', g6_ref: 'kitchen-g6', containment_depth: 2, placement_context_ref: 'kitchen-context' },
      { position_ref: 'kitchen-floor', state: 'committed', scope_ref: structuredClone(scope_ref), position_kind: 'scene_position', g6_ref: 'kitchen-g6', containment_depth: 1, placement_context_ref: 'kitchen-context' }
    ],
    ...overrides
  };
}

test('O1 resolves explicit property and the narrowest committed scene position', () => {
  const result = resolveOrdinaryWorldPropertyPlacement(input());
  assert.equal(result.pass, true);
  assert.deepEqual(result.evidence, {
    schema: 'rus.items.ordinary_world_property_placement_evidence.v2', version: 2,
    scope_ref, property_placement_context_digest: 'e52fe080d23a16be5367e319d4c0fb8b857718f8764d1e3c1dbe1261b971ae72', property_catalog_version_ref: 'property-catalog-v1',
    placement_catalog_version_ref: 'placement-catalog-v1', property_basis_ref: 'spoon-owner', property_basis_class: 'explicit_source_item',
    property_source_ref: 'spoon-source-1', unowned_cause_ref: null,
    placement_context_ref: 'kitchen-context', placement: { scope_ref: 'kitchen-g6', position_ref: 'kitchen-table' }
  });
  assert.equal(Object.isFrozen(result.evidence), true);
});

test('O1 property precedence is explicit, personal/communal, occupied default, then explicit unowned cause only', () => {
  const cases = [
    [input({ property_catalog: [input().property_catalog[1], input().property_catalog[0]], supporting_basis_ref: 'basis-a' }), 'communal-owner'],
    [input({ property_catalog: [input().property_catalog[0]], supporting_basis_ref: 'basis-a' }), 'site-owner'],
    [input({ property_catalog: [{ property_basis_ref: 'unowned', state: 'committed', scope_ref, basis_class: 'genuinely_unowned', source_ref: 'abandoned-source', unowned_cause_ref: 'cause-abandoned' }], supporting_basis_ref: 'basis-a' }), 'unowned']
  ];
  for (const [candidate, expected] of cases) {
    const result = resolveOrdinaryWorldPropertyPlacement(candidate);
    assert.equal(result.pass, true);
    assert.equal(result.evidence.property_basis_ref, expected);
  }
  assert.equal(resolveOrdinaryWorldPropertyPlacement(input({ property_catalog: [{ property_basis_ref: 'unowned', state: 'committed', scope_ref, basis_class: 'genuinely_unowned', source_ref: 'abandoned-source', unowned_cause_ref: null }] })).pass, false);
});

test('O1 fails closed for ambiguous rank, unknown item kind, and invalid positions', () => {
  const sameRank = input({ property_catalog: [
    input().property_catalog[2], { property_basis_ref: 'other-spoon-owner', state: 'committed', scope_ref, basis_class: 'explicit_source_item', source_ref: 'spoon-source-1', unowned_cause_ref: null }
  ] });
  assert.equal(resolveOrdinaryWorldPropertyPlacement(sameRank).pass, false);
  assert.equal(resolveOrdinaryWorldPropertyPlacement(input({
    item_kind: 'natural_resource_portion' })).pass, true);
  assert.equal(resolveOrdinaryWorldPropertyPlacement(input({ item_kind: 'natural' })).pass, false);
  for (const placement_catalog of [
    [],
    [input().placement_catalog[0], { ...input().placement_catalog[0], position_ref: 'other-position' }],
    [{ ...input().placement_catalog[0], scope_ref: { entity_kind: 'g6', entity_id: 'foreign' } }],
    [{ ...input().placement_catalog[0], position_kind: 'g4' }],
    [{ ...input().placement_catalog[0], position_kind: 'g5' }],
    [{ ...input().placement_catalog[0], relevance_rank: 0 }]
  ]) assert.equal(resolveOrdinaryWorldPropertyPlacement(input({ placement_catalog })).pass, false);
});

test('O1 property/placement resolution never reads getters or writes graph/baseline input', () => {
  const candidate = input(); let reads = 0;
  Object.defineProperty(candidate.property_catalog[0], 'basis_class', { enumerable: true, get() { reads += 1; return 'explicit_source_item'; } });
  const before = structuredClone(input());
  assert.equal(resolveOrdinaryWorldPropertyPlacement(candidate).pass, false);
  assert.equal(reads, 0);
  const ordinary = input(); resolveOrdinaryWorldPropertyPlacement(ordinary);
  assert.deepEqual(ordinary, before);
});

function v2Input(overrides = {}) {
  return {
    schema: 'rus.items.ordinary_world_property_placement_context.v2', version: 2,
    scope_ref: structuredClone(scope_ref), property_catalog_version_ref: 'property-catalog-v2',
    placement_catalog_version_ref: 'placement-catalog-v2', item_kind: 'man_made',
    supporting_basis_ref: 'item-source', causal_basis_refs: ['item-source'],
    requested_position_ref: 'kitchen-table', explicit_item_source_refs: ['item-source'],
    personal_possession_refs: ['person-a'], communal_public_service_refs: ['service-a'],
    container_property_refs: ['container-a'], occupied_site_refs: ['household-a'],
    unowned_cause_refs: ['discarded-group', 'discarded-cause'],
    placement_context_refs: ['kitchen-context'],
    property_catalog: [], placement_catalog: [input().placement_catalog[0]], ...overrides
  };
}
function v2Property(property_basis_ref, basis_class, source_ref, unowned_cause_ref = null,
  unowned_cause_kind = null) {
  return { property_basis_ref, state: 'committed', scope_ref: structuredClone(scope_ref),
    basis_class, source_ref, unowned_cause_ref, unowned_cause_kind };
}

test('O2a v2 applies every property tier in code-owned order', () => {
  const tiers = [
    v2Property('site', 'occupied_site_default', 'household-a'),
    v2Property('container', 'container_property', 'container-a'),
    v2Property('service', 'communal_public_service', 'service-a'),
    v2Property('personal', 'personal_possession', 'person-a'),
    v2Property('explicit', 'explicit_source_item', 'item-source')
  ];
  const result = resolveOrdinaryWorldPropertyPlacement(v2Input({ property_catalog: tiers }));
  assert.equal(result.pass, true);
  assert.equal(result.evidence.property_basis_ref, 'explicit');
  assert.equal(result.evidence.property_basis_class, 'explicit_source_item');
  assert.equal(result.evidence.schema, 'rus.items.ordinary_world_property_placement_evidence.v3');
  assert.equal(result.evidence.property_context_version, 2);
  assert.equal(ordinaryWorldPropertyPlacementContextDigest(v2Input({ property_catalog: tiers })),
    result.evidence.property_placement_context_digest);
  for (const [catalog, expected] of [
    [tiers.slice(0, 4), 'personal'], [tiers.slice(0, 3), 'service'],
    [tiers.slice(0, 2), 'container'], [tiers.slice(0, 1), 'site']
  ]) assert.equal(resolveOrdinaryWorldPropertyPlacement(v2Input({ property_catalog: catalog }))
    .evidence.property_basis_ref, expected);
});

test('O2a v2 ignores a lower authored property ref and derives precedence from the source', () => {
  const result = resolveOrdinaryWorldPropertyPlacement(v2Input({
    supporting_basis_ref: 'item-source', causal_basis_refs: ['item-source'],
    property_catalog: [
      v2Property('site', 'occupied_site_default', 'household-a'),
      v2Property('personal', 'personal_possession', 'person-a'),
      v2Property('explicit', 'explicit_source_item', 'item-source')
    ]
  }));
  assert.equal(result.pass, true);
  assert.equal(result.evidence.property_basis_ref, 'explicit');
});

test('O2a v2 only reports property evidence and never transfers legal ownership', () => {
  const candidate = v2Input({ property_catalog: [
    v2Property('personal', 'personal_possession', 'person-a')
  ] });
  const before = structuredClone(candidate);
  const result = resolveOrdinaryWorldPropertyPlacement(candidate);
  assert.equal(result.pass, true);
  assert.equal(result.evidence.property_source_ref, 'person-a');
  assert.deepEqual(candidate, before);
});

test('O2a v2 grants genuinely unowned only for a committed closed cause', () => {
  const valid = v2Property('discarded', 'genuinely_unowned', 'discarded-group',
    'discarded-cause', 'discarded');
  assert.equal(resolveOrdinaryWorldPropertyPlacement(v2Input({ property_catalog: [valid] }))
    .pass, true);
  for (const cause of [null, 'unknown', 'lost_by_absence', 'battlefield']) {
    const candidate = { ...valid, unowned_cause_kind: cause };
    assert.equal(resolveOrdinaryWorldPropertyPlacement(v2Input({ property_catalog: [candidate] }))
      .pass, false);
  }
  assert.equal(resolveOrdinaryWorldPropertyPlacement(v2Input({ property_catalog: [
    { ...valid, source_ref: 'owner-not-in-frame' }
  ] })).pass, false);
});

test('O2a v2 fails closed for ambiguous property, prototype, symbols, and getters', () => {
  const ambiguous = v2Input({ property_catalog: [
    v2Property('personal-a', 'personal_possession', 'person-a'),
    v2Property('personal-b', 'personal_possession', 'person-a')
  ] });
  assert.equal(resolveOrdinaryWorldPropertyPlacement(ambiguous).pass, false);
  const proto = v2Input({ property_catalog: [v2Property('site', 'occupied_site_default', 'household-a')] });
  Object.setPrototypeOf(proto.property_catalog[0], { inherited: true });
  assert.equal(resolveOrdinaryWorldPropertyPlacement(proto).pass, false);
  const symbol = v2Input({ property_catalog: [v2Property('site', 'occupied_site_default', 'household-a')] });
  symbol.property_catalog[0][Symbol('hidden')] = true;
  assert.equal(resolveOrdinaryWorldPropertyPlacement(symbol).pass, false);
  const getter = v2Input({ property_catalog: [v2Property('site', 'occupied_site_default', 'household-a')] });
  let reads = 0;
  Object.defineProperty(getter.property_catalog[0], 'basis_class', {
    enumerable: true, get() { reads += 1; return 'occupied_site_default'; }
  });
  assert.equal(resolveOrdinaryWorldPropertyPlacement(getter).pass, false);
  assert.equal(reads, 0);
});
