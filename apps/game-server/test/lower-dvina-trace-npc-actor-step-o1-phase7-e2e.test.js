import assert from 'node:assert/strict';
import test from 'node:test';
import { createLowerDvinaTraceNpcActorStepOwnerCapabilitiesFactory } from
  '../src/runtime/lower-dvina-trace-npc-actor-step-owner-capabilities.js';
import { approvedPhase7Contracts, phase7AutonomousPlan } from
  './lower-dvina-trace-phase-7-contract-fixture.js';
import { phase7Command, phase7CommittedState, phase7PlayerInput,
  persistPhase7Consequence } from
  './lower-dvina-trace-phase-7-runtime-fixture.js';

test('NPC actor-step fails closed for untouched Phase 7 NPC scope without breaking actor step', async () => {
  const state = phase7CommittedState();
  const npc = state.npcs.find(({ instance_id }) => instance_id === 'zhdanko-1');
  assert.notEqual(npc.machine_state.location_ref, state.position.location_ref);
  assert.notEqual(npc.machine_state.spatial_zone_ref, state.position.zone_ref);
  const contracts = approvedPhase7Contracts(state);
  contracts.npcSemanticProfile = n1Profile();
  let enablementLoads = 0;
  let resolverCreates = 0;
  const npcActorStep = createLowerDvinaTraceNpcActorStepOwnerCapabilitiesFactory({
    loadOrdinaryEnablement: async () => { enablementLoads += 1; return null; },
    createOrdinaryDiscoveryResolver: () => { resolverCreates += 1; return null; }
  });
  const consequence = await phase7Command({ state, contracts,
    createBoundaryNpcOwnerCapabilities: ({ state: boundaryState }) => npcActorStep({
      partyId: state.party_id, requestId: 'phase7-o1', inputDigest: 'a'.repeat(64),
      state: boundaryState, phase7Contracts: contracts }),
    model: async (request) => {
      assert.equal(Object.hasOwn(request.decision_scope.operation_contract,
        'request_discovery'), false);
      return phase7AutonomousPlan(request, 'wait');
    }
  }).consequence({ retrievedState: state,
    playerInput: phase7PlayerInput(state, 'npc-actor-step-o1-no-scope') });

  assert.equal(enablementLoads, 0);
  assert.equal(resolverCreates, 0);
  assert.equal(consequence.phase7.actor_step_owner_outputs
    .ordinary_materialization_atomic_write_plan, null);
  assert.equal(consequence.phase7.actor_step_owner_outputs
    .spatial_semantic_atomic_write_plan, null);
  assert.equal(consequence.phase7.schedule_execution.semantic_operation.op,
    'request_activity');
  const committed = await persistPhase7Consequence({ state, contracts, consequence });
  assert.equal(committed.plan.ordinary_materialization_atomic_write_plan, null);
  assert.equal(Object.hasOwn(committed.plan,
    'spatial_semantic_atomic_write_plan'), false);
  assert.equal(committed.snapshot.position.location_ref, state.position.location_ref);
  assert.equal(committed.snapshot.npcs.find(({ instance_id }) =>
    instance_id === npc.instance_id).machine_state.location_ref,
  npc.machine_state.location_ref);
});

function n1Profile() {
  return { profile_id: 'lower_dvina_trace_npc_actor_step_profile_v1',
    revision: 1, status: 'approved', activation_boundary: { phase: 'phase_7',
      npc_participant_slot_ref: 'zhdanko_storehouse_controller' } };
}
