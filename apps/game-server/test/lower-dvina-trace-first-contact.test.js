import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveTracePhase3Contracts } from
  '../src/runtime/lower-dvina-trace-phase-3-contracts.js';
import { digest, phase3State, ref, revision14Bundle, runPhase3 } from
  './lower-dvina-trace-m2-conversation-fixture.js';

const greeting = (plan) => {
  plan.speech.interaction_tags = ['greeting'];
  return plan;
};

test('direct greeting requires only Eremey first-contact identity and behavior',
  async () => {
    const state = phase3State();
    const contracts = resolveTracePhase3Contracts({ state, bundle: revision14Bundle });
    const eremey = await runPhase3({
      state, contracts, rawText: 'Здравствуйте. Что вы знаете об Онисиме?',
      inputDigest: digest('a'), responseKind: 'withhold',
      transformPlayerPlan: greeting,
      targetActorId: contracts.actors[0].instance_id
    });
    assert.deepEqual(eremey.npcRequest.social_context.first_contact_introduction,
      { canonical_name: 'Еремей' });
    assert.equal(eremey.npcRequest.social_context.npc_behavior.current_stance,
      'guarded');
    assert.equal(eremey.npcRequest.social_context.npc_behavior
      .required_interaction_tag, 'withhold');

    const backgroundState = phase3State();
    const backgroundNpc = backgroundState.npcs.find(({ participant_slot_ref: slot }) =>
      slot === 'background_fisher_1');
    backgroundNpc.identity_state = { canonical_name: 'Фёдор' };
    const backgroundContracts = resolveTracePhase3Contracts({
      state: backgroundState, bundle: revision14Bundle
    });
    const background = await runPhase3({
      state: backgroundState, contracts: backgroundContracts,
      rawText: 'Здравствуйте. Что вы знаете об Онисиме?',
      inputDigest: digest('b'), responseKind: 'speech',
      transformPlayerPlan: greeting,
      targetActorId: backgroundContracts.actors[1].instance_id
    });
    assert.equal(background.npcRequest.social_context.first_contact_introduction,
      undefined);
    assert.equal(background.npcRequest.social_context.npc_behavior, undefined);
  });

test('heard self-introduction is not required again', async () => {
  const state = phase3State();
  const contracts = resolveTracePhase3Contracts({ state, bundle: revision14Bundle });
  const eremey = contracts.actors[0];
  const statementId = 'statement:known-eremey';
  const utterance = 'Я Еремей. Об этом я ничего подтвердить не могу.';
  state.conversation_contributions = [{
    statement_id: statementId,
    speaker_ref: ref('npc', eremey.instance_id),
    utterance_text: utterance
  }];
  state.received_messages = [{
    source_statement_ref: ref('conversation_statement', statementId),
    speaker_ref: ref('npc', eremey.instance_id),
    listener_ref: ref('player_character', state.actor_id),
    comprehension: 'full', utterance_text: utterance
  }];
  const exchange = await runPhase3({
    state, contracts, rawText: 'Здравствуйте ещё раз.',
    inputDigest: digest('c'), responseKind: 'withhold',
    transformPlayerPlan: greeting,
    targetActorId: eremey.instance_id
  });
  assert.equal(exchange.npcRequest.social_context.first_contact_introduction,
    undefined);
});
