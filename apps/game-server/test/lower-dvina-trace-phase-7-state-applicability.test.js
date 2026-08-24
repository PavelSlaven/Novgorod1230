import assert from 'node:assert/strict';
import test from 'node:test';
import { approvedPhase7Contracts, phase7AutonomousPlan } from
  './lower-dvina-trace-phase-7-contract-fixture.js';
import { phase7Command, phase7CommittedState, phase7PlayerInput } from
  './lower-dvina-trace-phase-7-runtime-fixture.js';

test('Phase 7 omits base capabilities rejected by current owner state',
  async () => {
    const staleBagState = phase7CommittedState();
    staleBagState.containers[0].state.zone_ref = 'river_access';
    const staleBagContracts = approvedPhase7Contracts(staleBagState);
    await phase7Command({ state: staleBagState, contracts: staleBagContracts,
      model: async (request) => {
        const contract = request.decision_scope.operation_contract;
        assert.deepEqual(contract.request_activity.allowed,
          [{ activity_kind: 'wait', target_refs: [] }]);
        assert.equal(Object.hasOwn(contract, 'request_item_use'), false);
        assert.equal(Object.hasOwn(contract, 'request_movement'), true);
        return phase7AutonomousPlan(request, 'wait');
      }
    }).consequence({ retrievedState: staleBagState,
      playerInput: phase7PlayerInput(staleBagState, 'stale-bag-zone') });

    const staleNpcState = phase7CommittedState();
    staleNpcState.npcs.find(({ instance_id: id }) => id === 'zhdanko-1')
      .machine_state.spatial_zone_ref = 'river_access';
    const staleNpcContracts = approvedPhase7Contracts(staleNpcState);
    await phase7Command({ state: staleNpcState, contracts: staleNpcContracts,
      model: async (request) => {
        const contract = request.decision_scope.operation_contract;
        assert.deepEqual(contract.request_activity.allowed,
          [{ activity_kind: 'wait', target_refs: [] }]);
        assert.equal(Object.hasOwn(contract, 'request_item_use'), true);
        assert.equal(Object.hasOwn(contract, 'request_movement'), false);
        return phase7AutonomousPlan(request, 'wait');
      }
    }).consequence({ retrievedState: staleNpcState,
      playerInput: phase7PlayerInput(staleNpcState, 'stale-npc-zone') });
  });

test('Phase 7 does not hide malformed base owner contracts', async () => {
  const state = phase7CommittedState();
  const contracts = approvedPhase7Contracts(state);
  contracts.localTransition.schema = 'malformed';
  await assert.rejects(() => phase7Command({ state, contracts,
    model: async () => assert.fail('model must not receive malformed contract')
  }).consequence({ retrievedState: state,
    playerInput: phase7PlayerInput(state, 'malformed-owner-contract') }),
  ({ code, details }) => code === 'TRACE_PHASE_7_MOVEMENT_OWNER_REJECTED'
    && details?.[0]?.code === 'APPROVED_LOCAL_TRANSITION_INVALID');
});

test('Phase 7 builds NPC capabilities at temporal decision boundary', async () => {
  const state = phase7CommittedState();
  const contracts = approvedPhase7Contracts(state);
  let boundary = null;
  await phase7Command({ state, contracts,
    createBoundaryNpcOwnerCapabilities: async (input) => {
      boundary = input;
      return [];
    },
    model: async (request) => phase7AutonomousPlan(request, 'wait')
  }).consequence({ retrievedState: state,
    playerInput: phase7PlayerInput(state, 'boundary-capabilities') });
  assert.equal(boundary.workingProjection.cumulative_elapsed_minutes, 25);
  assert.deepEqual(boundary.priorLocalFirePlans, []);
});
