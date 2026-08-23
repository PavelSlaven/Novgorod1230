import test from 'node:test';
import assert from 'node:assert/strict';
import { appendTerminal } from
  '../src/infrastructure/postgres/lower-dvina-trace-phase-6-terminal-writes.js';

test('Phase 6 terminal keeps modern first-entry placement out of legacy rows', () => {
  const inserts = [];
  const updates = [];
  appendTerminal({ inserts, updates, appends: [], partyId: 'party',
    state: { actor_id: 'mikula', first_entry_preparation: {
      spatial_v3: { target: { status: 'prepared' } },
      scene: { anchor: { instance_id: 'modern:camp' } }
    } }, next: { position: { g5_anchor_id: 'modern:camp' }, npcs: [{
      instance_id: 'onisim', anchor_id: 'modern:camp', machine_state: {}
    }] }, intent: { terminal_group_ids: ['onisim'], execution_id: 'phase6',
      ratsha_observation: { committed_fact_output: 'ratsha_observed' } },
    changeSetId: 'change', idemId: 'idem' });

  assert.equal(updates.some(({ target_table }) =>
    target_table === 'party_positions'), false);
  assert.equal(updates.find(({ target_table }) =>
    target_table === 'party_npcs').record.anchor_id, null);
});
