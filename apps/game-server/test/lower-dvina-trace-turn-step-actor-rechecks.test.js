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
