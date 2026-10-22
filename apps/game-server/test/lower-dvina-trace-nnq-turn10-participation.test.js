import assert from 'node:assert/strict';
import test from 'node:test';
import {
  bundle, COMPOUND_TURN_10, fixture, npcPlan, playerPlan,
  turn10State, turn10StepPlan
} from './lower-dvina-trace-turn-10-conversation-fixture.js';
import {
  createTemporalAdvanceOwner,
  npcTemporalEffectRegistrations
} from '@rus/turn/temporal-advance';
import { lowerDvinaTracePhase7TemporalEffectRegistrations } from
  '../src/runtime/lower-dvina-trace-phase-7-temporal-effect-owner.js';
import { lowerDvinaTraceConversationTemporalEffectRegistrations } from
  '../src/runtime/lower-dvina-trace-m2-conversation-temporal-effect-owner.js';
import { phase7AutonomousPlan } from
  './lower-dvina-trace-phase-7-contract-fixture.js';

function turn10Fixture(actor, transform) {
  const { state, contracts } = turn10State({ completedRest: false });
  const targetId = contracts.actors[actor].instance_id;
  const calls = [];
  const runtimeFixture = fixture({
    scenarioBundle: bundle,
    materializationBundle: bundle,
    committedState: state,
    temporalAdvanceOwner: createTemporalAdvanceOwner({
      effect_registrations: [
        ...npcTemporalEffectRegistrations(),
        ...lowerDvinaTraceConversationTemporalEffectRegistrations(),
        ...lowerDvinaTracePhase7TemporalEffectRegistrations()
      ]
    }),
    turnStepModel: (request) => turn10StepPlan(request, contracts),
    playerConversationModel: (request) => playerPlan(request, contracts),
    npcSemanticModel(request) {
      const plan = npcPlan(request, contracts);
      if (request.npc_ref.entity_id !== targetId) return plan;
      calls.push(request);
      return transform(plan, request);
    },
    npcAutonomousModel: (request) => phase7AutonomousPlan(request, 'wait')
  });
  return { runtimeFixture, contracts, targetId, calls };
}

function semanticExchange(runtimeFixture) {
  const factual = runtimeFixture.lastWritePlan().write_targets.find(
    ({ target }) => target === 'party_state')?.value;
  assert.ok(factual);
  return factual.consequence.conversation.semantic_exchange;
}

function targetOutcome(semantic, targetId) {
  const entry = semantic.npc_outcomes.find(({ npc_ref: npc }) =>
    npc.entity_id === targetId);
  assert.ok(entry);
  assert.equal(entry.applied, true);
  return entry.outcome;
}

function targetCommitments(runtimeFixture, targetId) {
  return (runtimeFixture.state.route_participant_commitments ?? []).filter(
    ({ npc_ref: npc }) => npc.entity_id === targetId);
}

async function submit(runtimeFixture, id) {
  return runtimeFixture.runtime.submitTurn({
    partyId: runtimeFixture.partyId,
    input: { request_id: id, idempotency_key: id, raw_text: COMPOUND_TURN_10 }
  });
}

for (const actor of ['eremey', 'participatingFisher']) {
  for (const variant of [
    { name: 'promise', dominantAct: 'promise', tags: [],
      text: 'Позже пойду с вами.' },
    { name: 'accept', dominantAct: 'accept', tags: [],
      text: 'Согласен пойти позже.' },
    { name: 'accept with agreement', dominantAct: 'accept',
      tags: ['agreement'], text: 'Согласен пойти позже.' }
  ]) {
    test(`Turn 10 admits ${actor} ${variant.name} as speech without a binding`,
      async () => {
        const { runtimeFixture, targetId, calls } = turn10Fixture(actor,
          (plan) => ({
            ...plan,
            speech: {
              ...plan.speech,
              utterance_text: variant.text,
              dominant_act: variant.dominantAct,
              interaction_tags: variant.tags
            },
            supporting_operations: []
          }));
        const id = `nnq-turn10-${actor}-${variant.name.replaceAll(' ', '-')}`;
        await submit(runtimeFixture, id).catch((error) => {
          assert.fail(`Turn 10 rejected future speech (${error?.code}): ${
            JSON.stringify(error?.details ?? null)
          }`);
        });
        assert.equal(calls.length, 1);
        assert.deepEqual(targetCommitments(runtimeFixture, targetId), []);
        const semantic = semanticExchange(runtimeFixture);
        assert.equal(targetOutcome(semantic, targetId).kind, 'speech');
        if (actor === 'eremey') {
          assert.equal(semantic.response_kind, 'speech');
        }
        assert.equal(semantic.statements.some(({ speaker_ref: speaker,
          utterance_text: text }) => speaker.entity_id === targetId
            && text === variant.text), true);
      });
  }
}

test('Turn 10 commits an accepted exact participation binding', async () => {
  const { runtimeFixture, targetId, calls } = turn10Fixture('eremey',
    (plan) => ({
      ...plan,
      speech: {
        ...plan.speech,
        utterance_text: 'Согласен присоединиться сейчас.',
        dominant_act: 'accept'
      }
    }));
  await submit(runtimeFixture, 'nnq-turn10-exact-binding');
  assert.equal(calls.length, 1);
  assert.deepEqual(targetCommitments(runtimeFixture, targetId).map(
    ({ role }) => role), ['guide']);
  const semantic = semanticExchange(runtimeFixture);
  assert.equal(targetOutcome(semantic, targetId).kind, 'route_participation');
});

test('Turn 10 rejects an accepted binding outside the allowed set', async () => {
  const { runtimeFixture, targetId, calls } = turn10Fixture('eremey',
    (plan) => ({
      ...plan,
      speech: {
        ...plan.speech,
        utterance_text: 'Согласен присоединиться сейчас.',
        dominant_act: 'accept'
      },
      supporting_operations: [{
        ...plan.supporting_operations[0],
        role: 'escort'
      }]
    }));
  await assert.rejects(submit(runtimeFixture,
    'nnq-turn10-invalid-binding'), {
    code: 'TURN_NPC_PLAN_NOT_APPLICABLE'
  });
  assert.equal(calls.length, 1);
  assert.deepEqual(targetCommitments(runtimeFixture, targetId), []);
});
