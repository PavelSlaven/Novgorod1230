import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalDigest, createRandomSource, deriveSeed } from '../src/core.js';
import { selectSpatialV3Expansion } from '../src/spatial-v3.js';

function input() {
  const profile = { id: 'profile', version: 7, world_revision_id: 'world', status: 'approved' };
  const expansion_rule_sets = [['adjacency_rule_set', 'adjacency', 'through_same_exit'],
    ['connectivity_rule_set', 'connectivity', 'existing_exit_reachable'], ['seed_policy', 'seed', 'mulberry32_v1']]
    .map(([role, rule_kind, strategy]) => {
      profile[`${role}_id`] = role; profile[`${role}_version`] = 2;
      return { id: role, version: 2, dependency_role: role, rule_kind, strategy, status: 'approved',
        world_revision_id: 'world', canonical_digest: 'digest', authoring_digest: 'digest', canonical_ordinal: 0 };
    });
  const slot = { id: 'slot', version: 3, profile_id: 'profile', profile_version: 7, world_revision_id: 'world',
    g4_id: 'g4', g4_version: 4, status: 'approved', continuation_role: 'through', directional_exit_id: 'exit',
    directional_exit_version: 2, max_instances: 3, terminal_policy_id: 'terminal', terminal_policy_version: 1,
    continuation_length_rule_id: 'length', continuation_length_rule_version: 1 };
  return { party_id: 'party', candidate_ordinal: 0, slot_ref: { id: 'slot', version: 3 },
    directional_exit: { id: 'exit', version: 2 }, entry_binding: { id: 'entry', version: 1 },
    snapshot: { sites: [], reservations: [] }, now: Date.parse('2026-01-01T00:00:00Z'),
    closure: { profile, expansion_rule_sets, slots: [slot],
      directional_exits: [{ id: 'exit', version: 2, g4_id: 'g4', g4_version: 4, status: 'approved' }],
      terminal_policies: [{ id: 'terminal', version: 1, status: 'approved', policy_kind: 'world_route_exit',
        target_directional_exit_id: 'exit', target_directional_exit_version: 2 }],
      continuation_length_rules: [{ id: 'length', version: 1, status: 'approved', selection_kind: 'fixed' }],
      continuation_length_candidates: [{ rule_id: 'length', rule_version: 1, terminal_ordinal: 2, weight: 1 }],
      entry_slot_rules: [{ entry_binding_id: 'entry', entry_binding_version: 1, slot_id: 'slot', slot_version: 3 }],
      slot_templates: ['x', 'y'].map((template_id) => ({ slot_id: 'slot', slot_version: 3,
        template_id, template_version: 1, selection_weight: 1 })),
      template_limits: ['x', 'y'].map((template_id) => ({ template_id, template_version: 1, max_count: 3 })),
      successor_frontier_rules: ['x', 'y'].map((g5_template_id) => ({ g5_template_id, g5_template_version: 1,
        source_expansion_slot_id: 'slot', source_expansion_slot_version: 3, successor_kind: 'through_successor',
        target_expansion_slot_id: 'slot', target_expansion_slot_version: 3, terminal_policy_id: 'terminal', terminal_policy_version: 1 })) } };
}

test('approved strategies use structural seed and stable candidate order without request text or clock', () => {
  const request = input();
  const first = selectSpatialV3Expansion(request);
  assert.equal(first.status, 'generation');
  assert.equal(first.terminal_ordinal, 2);
  assert.equal(first.rng_draw_count, 2);
  const identity = { party_id: 'party', world_revision_id: 'world', g4_profile_id: 'profile',
    g4_profile_version: 7, expansion_slot_key: 'slot@3', candidate_ordinal: 0 };
  assert.equal(first.idempotency_key, `resolve_frontier:${canonicalDigest(identity)}`);
  assert.equal(first.seed_digest, deriveSeed({ ...identity, idempotency_basis: first.idempotency_key }).digest);
  const random = createRandomSource({ seed: deriveSeed(first.seed_context).uint32 });
  assert.deepEqual(first.choices.map((choice) => choice.rng_draw), [random.nextUint32(), random.nextUint32()]);
  assert.deepEqual(first.choices.map((choice) => choice.choice_ordinal), [0, 1]);
  assert.deepEqual(first.choices[0].candidate_ids, ['length@1:2']);
  assert.deepEqual(first.choices[1].candidate_ids, ['x@1', 'y@1']);
  assert.equal(first.choices[1].selected_id, `${first.selected_template.template_id}@1`);
  assert.equal(Object.isFrozen(first.choices[1]), true);
  request.closure.slot_templates.reverse();
  request.now += 1000; request.requestId = 'future'; request.player_text = 'choose y';
  const second = selectSpatialV3Expansion(request);
  assert.equal(second.selected_template.template_id, first.selected_template.template_id);
  assert.equal(second.seed_digest, first.seed_digest);
  assert.deepEqual(second.choices, first.choices);
  assert.equal(Object.isFrozen(second.selected_template), true);
});

test('through adjacency and connectivity reject cross-exit, cross-slot and unapproved strategy pins', () => {
  for (const mutate of [
    (r) => { r.closure.expansion_rule_sets[0].strategy = 'unknown'; },
    (r) => { r.closure.expansion_rule_sets[0].version = 1; },
    (r) => { r.closure.expansion_rule_sets[1].status = 'draft'; },
    (r) => { r.closure.terminal_policies[0].target_directional_exit_id = 'other'; },
    (r) => { r.closure.successor_frontier_rules[0].target_expansion_slot_id = 'other'; },
    (r) => { r.entry_binding.id = 'other'; },
    (r) => { r.closure.slot_templates[0].compatibility_rule_id = 'not_evaluated'; }
  ]) {
    const request = input(); mutate(request);
    assert.throws(() => selectSpatialV3Expansion(request), (error) => error.code.startsWith('SPATIAL_EXPANSION_'));
  }
});

test('terminal ordinal is selected once and subsequent frontier requires its committed value', () => {
  const request = input();
  request.closure.continuation_length_candidates[0].terminal_ordinal = 0;
  assert.equal(selectSpatialV3Expansion(request).status, 'terminal');
  assert.equal(selectSpatialV3Expansion(request).choices.length, 1);
  request.candidate_ordinal = 1;
  assert.throws(() => selectSpatialV3Expansion(request), /committed terminal ordinal/);
  request.terminal_ordinal = 2;
  assert.equal(selectSpatialV3Expansion(request).rng_draw_count, 1);
  request.candidate_ordinal = 2;
  assert.equal(selectSpatialV3Expansion(request).status, 'terminal');
  assert.equal(selectSpatialV3Expansion(request).choices.length, 0);
  request.candidate_ordinal = 3;
  assert.throws(() => selectSpatialV3Expansion(request), /committed terminal ordinal/);
});

test('active reservations block selection without changing committed finite capacity', () => {
  const request = input();
  request.snapshot.reservations = Array.from({ length: 3 }, () => ({ status: 'reserved',
    expires_at: '2027-01-01T00:00:00Z', slot_ref: { entity_id: 'slot', authoring_version: '3' },
    selected_template_ref: { entity_id: 'x', authoring_version: '1' } }));
  const result = selectSpatialV3Expansion(request);
  assert.equal(result.ok, false);
  assert.equal(result.code, 'expansion_capacity_temporarily_reserved');
  assert.equal(result.capacity.committed_residual_capacity, 3);
  assert.equal(result.capacity.reservable_residual_capacity, 0);
});
