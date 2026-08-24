import assert from 'node:assert/strict';
import test from 'node:test';
import { firstPlayableCommitRecheck } from
  '../src/infrastructure/postgres/first-playable/recheck.js';
import { buildActorInstanceRechecks } from
  '../src/infrastructure/postgres/lower-dvina-trace-turn-step-actor-rechecks.js';

test('actor-held item and container updates seal exact common P16 sources',
  async () => {
    const state = {
      items: [{
        item_id: 'knife', condition_state: 'serviceable',
        placement: { holder_npc_id: 'ratsha', physical_position: 'hands' },
        ownership: { owner_npc_id: 'ratsha', controller_npc_id: 'ratsha',
          claim_state: 'owned' }
      }],
      containers: [{
        container_id: 'bag', condition_state: 'serviceable',
        closure_state: 'closed', holder_npc_id: 'ratsha',
        physical_position: 'worn_quick',
        ownership: { owner_npc_id: 'ratsha', controller_npc_id: 'ratsha',
          claim_state: 'owned' }
      }]
    };
    const checks = buildActorInstanceRechecks(state, { updates: [
      { target_table: 'party_item_placements', id: 'knife' },
      { target_table: 'party_containers', id: 'bag' }
    ] });
    assert.deepEqual(checks.map(({ kind }) => kind), ['item', 'container']);
    const check = checks[1];
    assert.equal(check.container_id, 'bag');
    assert.equal(check.expected_holder_npc_id, 'ratsha');
    assert.equal(check.expected_physical_position, 'worn_quick');
    assert.equal(check.expected_ownership.owner_npc_id, 'ratsha');
    assert.equal(check.expected_ownership.controller_npc_id, 'ratsha');

    const row = {
      condition_state: 'serviceable', closure_state: 'closed',
      holder_npc_id: 'ratsha', holder_character_id: null,
      physical_position: 'worn_quick', equipment_slot_category_id: null,
      owner_npc_id: 'ratsha', owner_character_id: null, owner_party: false,
      owner_external_ref: null, controller_npc_id: 'ratsha',
      controller_character_id: null, claim_state: 'owned'
    };
    const recheck = (value) => firstPlayableCommitRecheck({
      party_id: 'p', check,
      transaction: { query: async () => ({ rowCount: 1, rows: [value] }) }
    });
    assert.deepEqual(await recheck(row),
      { ok: true, code: 'state_version_conflict' });
    assert.deepEqual(await recheck({ ...row, owner_npc_id: 'other' }),
      { ok: false, code: 'state_version_conflict' });
  });

test('S1 local movement locks exact journey, edge, and endpoints', async () => {
  const check = { kind: 's1_local_movement', actor_id: 'player',
    journey_location_id: 'journey:player', expected_journey_state_version: 4,
    from_position_ref: 'position:shore', to_position_ref: 'position:inside',
    movement_edge_ref: 'edge:shore:inside', movement_admission: admission() };
  const current = { journey_state_version: 4, journey_position_id: 'position:shore',
    from_position_id: 'position:shore', to_position_id: 'position:inside',
    edge_status: 'active', ...admission(), reverse_from_position_id: 'position:inside',
    reverse_to_position_id: 'position:shore', reverse_reverse_edge_id: 'edge:shore:inside',
    reverse_edge_status: 'active', source_status: 'active', destination_status: 'active' };
  const query = recheckQuery(current);
  assert.deepEqual(await firstPlayableCommitRecheck({ party_id: 'party', check,
    transaction: { query } }), { ok: true, code: 'state_version_conflict' });
  assert.deepEqual(await firstPlayableCommitRecheck({ party_id: 'party', check,
    transaction: { query: recheckQuery({ ...current, to_position_id: 'position:forged' }) } }),
  { ok: false, code: 'state_version_conflict' });
  for (const stale of [{ edge_state_version: 1 },
    { reverse_reverse_edge_id: 'edge:forged' }]) {
    assert.deepEqual(await firstPlayableCommitRecheck({ party_id: 'party', check,
      transaction: { query: recheckQuery({ ...current, ...stale }) } }),
    { ok: false, code: 'state_version_conflict' });
  }
  assert.deepEqual(await firstPlayableCommitRecheck({ party_id: 'party', check,
    transaction: { query: recheckQuery(current, 2) } }),
  { ok: false, code: 'state_version_conflict' });
});

function recheckQuery(row, destination_occupancy = 0) {
  let calls = 0;
  return async (sql, params) => {
    calls += 1;
    if (calls === 1) {
      assert.match(sql, /FOR UPDATE OF l,e,reverse,source,destination/u);
      assert.doesNotMatch(sql, /FOR UPDATE OF[^;]*occupancy/u);
      assert.deepEqual(params, ['party', 'journey:player', 'player',
        'edge:shore:inside']);
      return { rowCount: 1, rows: [row] };
    }
    assert.match(sql, /SUM\(occupies_capacity_units\)/u);
    assert.deepEqual(params, ['party', 'position:inside']);
    return { rowCount: 1, rows: [{ destination_occupancy }] };
  };
}

function admission() { return { edge_id: 'edge:shore:inside', reverse_edge_id: 'edge:inside:shore',
  edge_state_version: 0, reverse_edge_state_version: 0, source_node_state_version: 0,
  destination_node_state_version: 0, cost_kind: 'action', action_units: 1,
  base_minutes: null, edge_capacity: 1, destination_capacity: 2,
  transition_footprint_units: 1, transition_environment_profile_ref: { id: 'environment', version: 1 },
  movement_orientation_profile_ref: { id: 'orientation', version: 1 },
  baseline_movement_method_id: null, movement_method_cost_profile_ref: null,
  dynamic_recheck_policy_ref: null, from_position_ref: 'position:shore',
  to_position_ref: 'position:inside', destination_occupancy: 0 }; }
