import assert from 'node:assert/strict';
import test from 'node:test';
import { recheckOrderedLocalEdgePath } from
  '../src/infrastructure/postgres/first-playable/recheck-site-connection-traversal.js';

const path = [edge('e1', 'p0', 'p1'), edge('e2', 'p1', 'p2')];

test('rechecks ordered local approach edges, reciprocal action facts, capacity and shared baseline', async () => {
  let query;
  const result = await recheckOrderedLocalEdgePath({ transaction: {
    query: async (sql, params) => {
      query = { sql, params };
      return { rowCount: 2, rows: [persisted(path[0]), persisted(path[1], 2)] };
    }
  }, partyId: 'party', path, originPositionId: 'p0', destinationPositionId: 'p2' });

  assert.equal(result, true);
  assert.match(query.sql, /FOR UPDATE OF e,reverse,source,destination,source_g6,destination_g6,baseline/);
  assert.deepEqual(JSON.parse(query.params[1]), path);
});

test('rejects gaps, endpoint mismatch, absent proof and changed persisted facts', async (t) => {
  const good = async (candidate) => recheckOrderedLocalEdgePath({ transaction: {
    query: async (_sql, params) => ({ rowCount: candidate.length,
      rows: JSON.parse(params[1]).map((edge, index) => persisted(edge, index + 1)) })
  }, partyId: 'party', path: candidate, originPositionId: 'p0', destinationPositionId: 'p2' });

  await t.test('gap rejected before database query', async () => {
    const broken = [{ ...path[0] }, { ...path[1], from_position_id: 'other' }];
    assert.equal(await good(broken), false);
  });
  await t.test('wrong destination rejected before database query', async () => {
    assert.equal(await recheckOrderedLocalEdgePath({ transaction: { query: async () => assert.fail() },
      partyId: 'party', path, originPositionId: 'p0', destinationPositionId: 'wrong' }), false);
  });
  await t.test('missing proof rejected before database query', async () => {
    const broken = [{ edge_id: 'e1', from_position_id: 'p0', to_position_id: 'p2' }];
    assert.equal(await good(broken), false);
  });
  await t.test('stale edge version rejected', async () => {
    const result = await recheckOrderedLocalEdgePath({ transaction: { query: async () => ({ rowCount: 2,
      rows: [persisted(path[0], 1, { edge_state_version: 99 }), persisted(path[1], 2)] }) },
    partyId: 'party', path, originPositionId: 'p0', destinationPositionId: 'p2' });
    assert.equal(result, false);
  });
  await t.test('different baselines rejected', async () => {
    const result = await recheckOrderedLocalEdgePath({ transaction: { query: async () => ({ rowCount: 2,
      rows: [persisted(path[0]), persisted(path[1], 2, { scene_baseline_id: 'other' })] }) },
    partyId: 'party', path, originPositionId: 'p0', destinationPositionId: 'p2' });
    assert.equal(result, false);
  });
});

test('empty path means no approach edges and only accepts identical endpoints', async () => {
  const transaction = { query: async () => assert.fail('empty path must not query') };
  assert.equal(await recheckOrderedLocalEdgePath({ transaction, partyId: 'party', path: [],
    originPositionId: 'p0', destinationPositionId: 'p0' }), true);
  assert.equal(await recheckOrderedLocalEdgePath({ transaction, partyId: 'party', path: [],
    originPositionId: 'p0', destinationPositionId: 'p1' }), false);
});

function edge(edge_id, from_position_id, to_position_id) {
  return { edge_id, from_position_id, to_position_id,
    movement_admission: { edge_id, from_position_ref: from_position_id,
      to_position_ref: to_position_id, reverse_edge_id: `reverse:${edge_id}`,
      cost_kind: 'action', action_units: 1, base_minutes: null, edge_capacity: null,
      destination_capacity: 3, edge_state_version: 2, reverse_edge_state_version: 2,
      source_node_state_version: 2, destination_node_state_version: 2,
      transition_environment_profile_ref: { entity_id: 'env', authoring_version: '1' },
      movement_orientation_profile_ref: { entity_id: 'orientation', authoring_version: '1' },
      baseline_movement_method_id: null, movement_method_cost_profile_ref: null,
      dynamic_recheck_policy_ref: null } };
}

function persisted(expected, ordinal = 1, overrides = {}) {
  const admission = expected.movement_admission;
  return { requested_edge_id: expected.edge_id,
    requested_from_position_id: expected.from_position_id,
    requested_to_position_id: expected.to_position_id,
    edge_id: expected.edge_id, from_position_id: expected.from_position_id,
    to_position_id: expected.to_position_id, edge_status: 'active', edge_state_version: 2,
    cost_kind: 'action', action_units: 1, base_minutes: null, edge_capacity: null,
    reverse_edge_id: admission.reverse_edge_id, scene_baseline_id: 'baseline',
    reverse_status: 'active', reverse_state_version: 2,
    reverse_from_position_id: expected.to_position_id,
    reverse_to_position_id: expected.from_position_id,
    reverse_reverse_edge_id: expected.edge_id, reverse_cost_kind: 'action',
    source_status: 'active', source_state_version: 2,
    source_g6_status: 'active', source_g6_baseline_id: 'baseline',
    destination_status: 'active', destination_state_version: 2,
    destination_capacity: 3, destination_g6_status: 'active',
    destination_g6_baseline_id: 'baseline', baseline_status: 'active',
    destination_occupancy: 0,
    transition_environment_profile_ref: admission.transition_environment_profile_ref,
    movement_orientation_profile_ref: admission.movement_orientation_profile_ref,
    baseline_movement_method_id: admission.baseline_movement_method_id,
    movement_method_cost_profile_ref: admission.movement_method_cost_profile_ref,
    dynamic_recheck_policy_ref: admission.dynamic_recheck_policy_ref,
    ...overrides, ordinality: ordinal };
}
