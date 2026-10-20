import assert from 'node:assert/strict';
import test from 'node:test';
import { validateNpcConversationResponseSubject } from '@rus/npc-runtime';
import { resolveTracePhase3Contracts } from
  '../src/runtime/lower-dvina-trace-phase-3-contracts.js';
import {
  checkResult,
  digest,
  phase3State,
  phase4ArrivalState,
  revision14Bundle,
  runPhase3,
  runPhase4,
  withAccessibleBlueWool
} from './lower-dvina-trace-m2-conversation-fixture.js';

const greeting = (plan) => {
  plan.speech.interaction_tags = ['greeting'];
  return plan;
};

const refKeys = (references) => references.map(
  ({ entity_kind: kind, entity_id: id }) => `${kind}:${id}`
);

test('phase 3 request carries the NPC subject in form A', async () => {
  const state = phase3State();
  const contracts = resolveTracePhase3Contracts({
    state, bundle: revision14Bundle
  });
  const eremey = contracts.actors[0];
  const exchange = await runPhase3({
    state, contracts, rawText: 'Здравствуйте. Что вы знаете об Онисиме?',
    inputDigest: digest('a'), responseKind: 'withhold',
    transformPlayerPlan: greeting, targetActorId: eremey.instance_id
  });
  const request = exchange.npcRequest;

  assert.equal(validateNpcConversationResponseSubject(request), true);
  assert.equal(request.npc.identity.name_or_label,
    eremey.identity_state.canonical_name);
  assert.deepEqual(request.npc.goals.map(({ summary }) => summary),
    contracts.npcPolicy.goals);
  assert.deepEqual(request.npc.goals.map(({ goal_ref: goalRef }) => goalRef),
    contracts.npcPolicy.goals);
  assert.deepEqual(request.npc.fears.map(({ summary }) => summary),
    contracts.npcPolicy.fears);
  assert.deepEqual(request.npc.fears.map(({ fear_ref: fearRef }) => fearRef),
    contracts.npcPolicy.fears);
  assert.deepEqual(request.social_context.npc_behavior,
    { required_interaction_tag: 'withhold' });
  assert.deepEqual(request.social_context.first_contact_introduction, {});
  assert.deepEqual(Object.keys(request.knowledge).sort(),
    ['beliefs', 'hypotheses', 'known_facts']);
  assert.equal(Object.hasOwn(request.memory, 'records'), false);
  assert.equal(Object.hasOwn(request.memory, 'received_messages'), true);
  assert.equal(Object.hasOwn(request.memory, 'current_observations'), true);
  assert.equal(refKeys(request.allowed_references.knowledge_refs).includes(
    `npc_identity:${eremey.instance_id}`), true);
  const stance = request.npc.relationships.filter(
    ({ actor_ref: actorRef }) => actorRef === state.actor_id
  );
  assert.equal(stance.length, 1);
  assert.equal(stance[0].status, 'guarded');
  assert.equal(JSON.stringify(request).includes('knowledge_profile_snapshot'),
    false);
});

test('presented evidence turns the stance into cooperation and drops the required tag',
  async () => {
    const state = phase3State();
    const contracts = resolveTracePhase3Contracts({
      state, bundle: revision14Bundle
    });
    withAccessibleBlueWool(state, contracts);
    const exchange = await runPhase3({
      state, contracts, rawText: 'Вот синяя шерсть с берега. Что ты знаешь?',
      inputDigest: digest('4'), responseKind: 'route_disclosure',
      checkResult: checkResult(contracts.check.check_id, 'success'),
      playerPlanOptions: { evidence: true }
    });
    const request = exchange.npcRequest;

    assert.equal(validateNpcConversationResponseSubject(request), true);
    assert.equal(Object.hasOwn(request.social_context, 'npc_behavior'), false);
    assert.equal(request.npc.relationships.find(
      ({ actor_ref: actorRef }) => actorRef === state.actor_id
    )?.status, 'cooperation_enabled');
  });

test('a background fisher request is valid form A without behavior fields',
  async () => {
    const state = phase3State();
    const background = state.npcs.find(({ participant_slot_ref: slot }) =>
      slot === 'background_fisher_1');
    background.identity_state = { canonical_name: 'Фёдор' };
    const contracts = resolveTracePhase3Contracts({
      state, bundle: revision14Bundle
    });
    const exchange = await runPhase3({
      state, contracts, rawText: 'Здравствуйте. Что вы знаете об Онисиме?',
      inputDigest: digest('b'), responseKind: 'speech',
      transformPlayerPlan: greeting,
      targetActorId: contracts.actors[1].instance_id
    });
    const request = exchange.npcRequest;

    assert.equal(validateNpcConversationResponseSubject(request), true);
    assert.equal(request.npc.identity.name_or_label, 'Фёдор');
    assert.deepEqual(request.npc.goals, []);
    assert.deepEqual(request.npc.fears, []);
    assert.equal(Object.hasOwn(request.social_context, 'npc_behavior'), false);
    assert.equal(
      Object.hasOwn(request.social_context, 'first_contact_introduction'),
      false
    );
  });

test('phase 4 requests are valid form A and expose only the NPC own resources',
  async () => {
    const { state, contracts } = phase4ArrivalState();
    const ratsha = await runPhase4({
      state, contracts, rawText: 'Эй, помощник, ты кто?',
      inputDigest: digest('f'), responseKind: 'speech', checkResult: null,
      offerStage: null, checkRequest: null,
      targetActorRef: 'ratsha_storehouse_helper'
    });
    const onisim = await runPhase4({
      state, contracts, rawText: 'Раненый, как тебя зовут?',
      inputDigest: digest('e'), responseKind: 'speech', checkResult: null,
      offerStage: null, checkRequest: null, targetActorRef: 'onisim_boatman'
    });

    assert.equal(validateNpcConversationResponseSubject(ratsha.npcRequest), true);
    assert.equal(validateNpcConversationResponseSubject(onisim.npcRequest), true);
    const ratshaId = contracts.actors.ratsha_storehouse_helper.instance_id;
    assert.equal(ratsha.npcRequest.npc.identity.name_or_label,
      contracts.actors.ratsha_storehouse_helper.identity_state.canonical_name);
    const held = state.items.filter(
      ({ holder_npc_id: holder, placement }) => (holder
        ?? placement?.holder_npc_id) === ratshaId
    );
    assert.equal(held.length, 1);
    assert.deepEqual(
      ratsha.npcRequest.available_resources.map(
        ({ resource_ref: resourceRef }) => resourceRef),
      [held[0].item_id]
    );
    assert.equal(ratsha.npcRequest.available_resources[0].holder_npc_id,
      ratshaId);
    assert.equal(ratsha.npcRequest.available_resources[0].template_ref,
      held[0].template_ref ?? held[0].template_id);
    assert.deepEqual(onisim.npcRequest.available_resources, []);
  });
