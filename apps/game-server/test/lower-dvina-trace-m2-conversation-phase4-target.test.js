import assert from 'node:assert/strict';
import test from 'node:test';
import { semanticNegotiationCommand } from
  '../src/runtime/lower-dvina-trace-phase-4-semantic-command.js';
import { createM2ConversationModels, digest, phase4ArrivalState,
  projectPhase4Negotiation, runPhase4 } from
  './lower-dvina-trace-m2-conversation-fixture.js';

test('a present Phase 4 NPC answers through the common conversation owner',
  async () => {
    const { state, contracts } = phase4ArrivalState();
    const exchange = await runPhase4({ state, contracts,
      rawText: 'Раненый, как тебя зовут?', inputDigest: digest('f'),
      responseKind: 'speech', checkResult: null, offerStage: null,
      checkRequest: null, targetActorRef: 'onisim_boatman' });
    const onisimId = contracts.actors.onisim_boatman.instance_id;
    assert.equal(exchange.npcRequest.npc_ref.entity_id, onisimId);
    assert.deepEqual(exchange.npcRequest.available_resources, []);
    assert.deepEqual(exchange.npcRequest.decision_scope.operation_contract, {});
    const next = projectPhase4Negotiation({ state, contracts,
      result: exchange.result, inputDigest: digest('f') });
    assert.equal(next.interactions.at(-1).speaker_npc_id, onisimId);
    assert.notEqual(next.ratsha_surrendered, true);
  });

test('Phase 4 generic offer does not become a protection promise', async () => {
  const { state, contracts } = phase4ArrivalState();
  const baseModel = createM2ConversationModels().playerConversationModel;
  let playerRequest;
  const command = semanticNegotiationCommand({
    contracts, inputDigest: digest('ordinary-offer'),
    playerConversationModel: async (request) => {
      playerRequest = structuredClone(request);
      const plan = structuredClone(await baseModel(request));
      plan.resolution = 'automatic';
      plan.check = null;
      plan.supporting_operations = [];
      return plan;
    },
    npcSemanticModel: async () => null,
    revalidateStateVersion: async () => state.party_state.state_version
  });
  const availability = await command.availability({
    retrievedState: state,
    playerInput: { raw_text: 'Предлагаю вместе перенести раненого.' },
    modeResolution: { decision_trace: { step_traces: [{ approved_plan: {
      operations: [{ op: 'emit_interaction', interaction_kind: 'offer',
        target_actor_refs: [
          contracts.actors.ratsha_storehouse_helper.instance_id
        ] }]
    } }] } }
  });

  assert.deepEqual(availability.check_requests, []);
  assert.equal(availability.causal_stages.some(
    ({ schema }) => schema === 'rus.trace_promise_offer_stage.v1'
  ), false);
  assert.deepEqual(Object.keys(playerRequest.operation_contract),
    ['offer_conditional_protection']);
});
