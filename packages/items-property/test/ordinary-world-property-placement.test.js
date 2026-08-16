import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveOrdinaryWorldPropertyPlacement } from '../src/index.js';

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

test('O1 fails closed for ambiguous rank, non-man-made scope, and invalid positions', () => {
  const sameRank = input({ property_catalog: [
    input().property_catalog[2], { property_basis_ref: 'other-spoon-owner', state: 'committed', scope_ref, basis_class: 'explicit_source_item', source_ref: 'spoon-source-1', unowned_cause_ref: null }
  ] });
  assert.equal(resolveOrdinaryWorldPropertyPlacement(sameRank).pass, false);
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
