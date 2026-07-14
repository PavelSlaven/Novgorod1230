import assert from 'node:assert/strict';
import test from 'node:test';
import { enterG4WithMaterialization } from '../src/first-entry-materialization.js';
import { buildPersistencePlanStage } from '../src/stages/persistence-plan.js';
import { createTurnCommandRegistry } from '../src/command-registry.js';

function registry() { return createTurnCommandRegistry([{ command_id:'move',matches:()=>true,mode:{},availability:()=>({}),consequence:()=>({}),writeTargets:()=>[{ target:'party_current_position',value:{} }] }]); }

test('repeat G4 entry reuses baseline and never rematerializes', async () => {
  let materializeCalls = 0;
  let lockObserved = false;
  const result = await enterG4WithMaterialization({ partyId: 'p', g4Id: 'g4', loadCommittedBaseline: async ({ transaction, lock }) => { lockObserved = transaction.id === 'tx' && lock === 'for_update'; return { run_id: 'baseline' }; }, buildMaterializationRequest: async () => ({}), materialize: () => { materializeCalls += 1; }, transact: async (work) => work({ id: 'tx' }), commitMovement: async (value) => ({ operation: 'move_to_existing_g4', ...value }), commitMaterializationAndMovement: async () => { throw new Error('must not create baseline'); } });
  assert.equal(materializeCalls, 0);
  assert.equal(lockObserved, true);
  assert.equal(result.operation, 'move_to_existing_g4');
});

test('persistence planning derives first-entry materialization from an approved cross-G4 transition', async () => {
  const output = await buildPersistencePlanStage({
    playerInput: { party_id: 'p' }, retrievedState:{party_state:{state_version:0}}, commandRegistry:registry(), modeResolution: { turn_id: 'turn-1', command_id:'move', decision_trace:{decision_protocol:'code_singleton_v1'}, resolution_plan: { expected_writes: ['party_current_position'] } },
    availability: {}, consequence: { position_transition: { from_g4_id: 'g4-old', to_g4_id: 'g4-new', destination_position: { g5_node_id: null, g5_anchor_id: null } } },
    timeUpdate: {}, hiddenUpdate: {}, visibleContext: {}, narration: {}
  });
  assert.deepEqual(output.first_entry_materialization, { g4_id: 'g4-new' });
  assert.deepEqual(output.destination_position, { g5_node_id: null, g5_anchor_id: null });
});

test('persistence planning blocks an implicit G4 movement without a formal transition', async () => {
  await assert.rejects(() => buildPersistencePlanStage({
    playerInput: { party_id: 'p' }, retrievedState:{party_state:{state_version:0}}, commandRegistry:registry(), modeResolution: { turn_id: 'turn-1', command_id:'move', decision_trace:{decision_protocol:'code_singleton_v1'}, resolution_plan: { expected_writes: ['party_current_position'] } },
    availability: {}, consequence: {}, timeUpdate: {}, hiddenUpdate: {}, visibleContext: {}, narration: {}
  }), (error) => error.code === 'TURN_G4_TRANSITION_REQUIRED');
});
