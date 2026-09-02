import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveTracePhase9Contracts } from
  '../src/runtime/lower-dvina-trace-phase-9-contracts.js';
import { packetPlan, recoveryPlan } from
  '../src/runtime/lower-dvina-trace-phase-9-command-plans.js';
import { loadScenarioBundle } from './lower-dvina-trace-phase-2-fixture.js';
import { phase8CampState } from
  './lower-dvina-trace-phase-8-integration.test.js';

const bundle = await loadScenarioBundle(18);
const contractsFor = (state) => resolveTracePhase9Contracts({ state, bundle,
  conversationBindings: bundle.conversation_semantic_bindings });

test('Phase 9 does not recover a road bag carried away by Zhdanko', () => {
  const state = phase8CampState(bundle);
  const zhdanko = state.npcs.find(({ participant_slot_ref: slot }) =>
    slot === 'zhdanko_storehouse_controller');
  state.last_turn = { consequence: { combat: { session_after: {
    participant_states: [{ actor_ref: { entity_kind: 'npc',
      entity_id: zhdanko.instance_id }, combat_status: 'left' }] } } } };
  state.knowledge.push({ fact_id: 'zhdanko_fled' });
  const result = recoveryPlan(state, contractsFor(state));
  assert.equal(result.pass, false);
  assert.equal(result.errors[0].code,
    'APPROVED_PROPERTY_TRANSITION_FACT_MISSING');
});

test('Phase 9 preserves an authored destroyed packet branch without intact seal',
  () => {
    const state = phase8CampState(bundle);
    const bag = state.containers.find(({ template_id: id }) =>
      id === 'trace_ld_v1_container_road_bag');
    bag.closure_state = 'open';
    delete bag.holder_npc_id;
    bag.holder_character_id = state.actor_id;
    bag.controller_character_id = state.actor_id;
    bag.state.controller_character_id = state.actor_id;
    delete bag.state.controller_npc_id;
    const packet = state.items.find(({ template_id: id }) =>
      id === 'trace_ld_v1_item_sealed_packet');
    Object.assign(packet.state, { seal_state: 'destroyed',
      document_condition: 'destroyed_unreadable',
      evidence_availability: 'destroyed' });
    const result = packetPlan(state, contractsFor(state));
    assert.equal(result.pass, true, JSON.stringify(result));
    assert.equal(result.proposal.next.state.seal_state, 'destroyed');
    assert.equal(result.proposal.next.state.document_condition,
      'destroyed_unreadable');
    assert.notEqual(result.proposal.next.state.seal_state, 'intact');
  });
