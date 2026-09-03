import assert from 'node:assert/strict';
import test from 'node:test';
import {
  bundle, COMPOUND_TURN_10, fixture, npcPlan, playerPlan, ref, turn10State,
  turn10StepPlan
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

test('Turn 10 repairs a player plan missing required listeners', async () => {
  const { state, contracts } = turn10State({ completedRest: false });
  let playerCalls = 0;
  const repairs = [];
  const responseBoundaryActors = [];
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
    playerConversationModel(request, context) {
      playerCalls += 1;
      repairs.push(context.repair);
      const expected = [contracts.actors.eremey,
        contracts.actors.participatingFisher, contracts.actors.otherFisher]
        .map(({ instance_id: id }) => ref('npc', id));
      assert.deepEqual(request.player_safe_context
        .required_intended_addressee_refs, expected);
      const plan = playerPlan(request, contracts);
      return context.repair === null ? {
        ...plan, intended_addressee_refs: [plan.primary_addressee_ref]
      } : plan;
    },
    npcSemanticModel(request) {
      responseBoundaryActors.push(request.npc_ref.entity_id);
      return npcPlan(request, contracts);
    },
    npcAutonomousModel: (request) => phase7AutonomousPlan(request, 'wait')
  });

  await runtimeFixture.runtime.submitTurn({ partyId: runtimeFixture.partyId,
    input: { request_id: 'turn10-required-audience',
      idempotency_key: 'turn10-required-audience', raw_text: COMPOUND_TURN_10 } });

  assert.equal(playerCalls, 2);
  assert.equal(repairs[0], null);
  assert.ok(repairs[1]);
  assert.deepEqual(new Set(responseBoundaryActors), new Set([
    contracts.actors.eremey.instance_id,
    contracts.actors.participatingFisher.instance_id,
    contracts.actors.otherFisher.instance_id,
    contracts.actors.ratsha.instance_id
  ]));
});

test('Turn 10 rejects acceptance that omits its participation binding', async () => {
  const { state, contracts } = turn10State({ completedRest: false });
  let eremeyCalls = 0;
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
      if (request.npc_ref.entity_id !== contracts.actors.eremey.instance_id) {
        return plan;
      }
      eremeyCalls += 1;
      return {
        ...plan,
        speech: { ...plan.speech, dominant_act: 'accept' },
        supporting_operations: []
      };
    },
    npcAutonomousModel: (request) => phase7AutonomousPlan(request, 'wait')
  });

  await assert.rejects(runtimeFixture.runtime.submitTurn({
    partyId: runtimeFixture.partyId,
    input: { request_id: 'turn10-repair-acceptance',
      idempotency_key: 'turn10-repair-acceptance', raw_text: COMPOUND_TURN_10 }
  }), { code: 'TURN_NPC_PLAN_NOT_APPLICABLE' });

  assert.equal(eremeyCalls, 1);
  assert.equal((runtimeFixture.state.route_participant_commitments ?? []).some(
    ({ npc_ref: npc, role }) => npc.entity_id
      === contracts.actors.eremey.instance_id && role === 'guide'
  ), false);
});

test('Turn 10 admits refusal without a participation binding', async () => {
  const { state, contracts } = turn10State({ completedRest: false });
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
      return request.npc_ref.entity_id
        !== contracts.actors.participatingFisher.instance_id ? plan : {
          ...plan,
          speech: { ...plan.speech, utterance_text: 'Не пойду.',
            dominant_act: 'refuse' },
          supporting_operations: []
        };
    },
    npcAutonomousModel: (request) => phase7AutonomousPlan(request, 'wait')
  });

  await runtimeFixture.runtime.submitTurn({ partyId: runtimeFixture.partyId,
    input: { request_id: 'turn10-refuse-without-binding',
      idempotency_key: 'turn10-refuse-without-binding', raw_text: COMPOUND_TURN_10 } });

  assert.equal(runtimeFixture.state.route_participant_commitments.some(
    ({ npc_ref: npc }) => npc.entity_id
      === contracts.actors.participatingFisher.instance_id
  ), false);
});

test('invented prepared followup marker repairs once then continues atomically',
  async () => {
    const { state, contracts } = turn10State({ completedRest: false });
    let plannerCalls = 0;
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
      turnStepModel(request) {
        plannerCalls += 1;
        const plan = turn10StepPlan(request, contracts);
        return plannerCalls === 1 ? { ...plan, continuation: {
          ...plan.continuation, prepared_followup_ref: 'invented-marker'
        } } : plan;
      },
      playerConversationModel: (request) => playerPlan(request, contracts),
      npcSemanticModel: (request) => npcPlan(request, contracts),
      npcAutonomousModel: (request) => phase7AutonomousPlan(request, 'wait')
    });
    await runtimeFixture.runtime.submitTurn({ partyId: runtimeFixture.partyId,
      input: { request_id: 'turn10-repaired-rest',
        idempotency_key: 'turn10-repaired-rest', raw_text: COMPOUND_TURN_10 } });

    assert.equal(plannerCalls, 3);
    assert.equal(runtimeFixture.commitCount(), 1);
    const factual = runtimeFixture.lastWritePlan().write_targets.find(
      ({ target }) => target === 'party_state').value;
    assert.equal(factual.consequence.phase7_kind, 'fire_rest');
    assert.equal(factual.consequence.turn10_kind, 'companion_request');
    assert.equal(runtimeFixture.state.phase7_fire_rest.status, 'completed');
    assert.deepEqual(factual.time_update.prepared_effect_ledger.slices.map(
      ({ owner_ref: owner }) => owner), [
      'lower_dvina_trace.rest_by_fire_and_dry_clothing',
      'lower_dvina_trace.request_eremey_and_fisher_to_zhdanko_storehouse'
    ]);
  });

test('either fisher may choose either approved participation binding',
  async () => {
    const { state, contracts } = turn10State({ completedRest: false });
    const preferredFisherRoles = new Map([
      [contracts.actors.participatingFisher.instance_id, 'escort'],
      [contracts.actors.otherFisher.instance_id, 'stay_with_onisim']
    ]);
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
      npcSemanticModel: (request) => npcPlan(
        request, contracts, preferredFisherRoles),
      npcAutonomousModel: (request) => phase7AutonomousPlan(request, 'wait')
    });
    await runtimeFixture.runtime.submitTurn({
      partyId: runtimeFixture.partyId,
      input: {
        request_id: 'turn10-swapped-fisher-roles',
        idempotency_key: 'turn10-swapped-fisher-roles',
        raw_text: COMPOUND_TURN_10
      }
    });
    const commitments = new Map(runtimeFixture.state
      .route_participant_commitments.map(({ npc_ref: npc, role }) =>
        [npc.entity_id, role]));

    assert.equal(commitments.get(
      contracts.actors.participatingFisher.instance_id), 'escort');
    assert.equal(commitments.get(
      contracts.actors.otherFisher.instance_id), 'stay_with_onisim');
  });

test('Turn 10 rejects an unsupported second plan chosen from current state',
  async () => {
    const { state, contracts } = turn10State({ completedRest: false });
    const runtimeFixture = fixture({
      scenarioBundle: bundle,
      materializationBundle: bundle,
      committedState: state,
      temporalAdvanceOwner: createTemporalAdvanceOwner({
        effect_registrations: [
          ...npcTemporalEffectRegistrations(),
          ...lowerDvinaTracePhase7TemporalEffectRegistrations()
        ]
      }),
      turnStepModel(request) {
        const semantic = turn10StepPlan(request, contracts);
        if (request.step_index === 1) semantic.continuation = {
          ...semantic.continuation, prepared_followup_ref: null
        };
        if (request.step_index === 2) {
          semantic.operations = [{
            op: 'request_activity',
            actor_ref: request.actor.actor_id,
            activity_kind: 'recover',
            target_refs: [request.player_safe_state.position.location_ref],
            description: 'снова отдыхать'
          }];
        }
        return semantic;
      },
      npcAutonomousModel: (request) => phase7AutonomousPlan(request, 'wait')
    });
    await assert.rejects(() => runtimeFixture.runtime.submitTurn({
      partyId: runtimeFixture.partyId,
      input: {
        request_id: 'turn10-reservation-mismatch',
        idempotency_key: 'turn10-reservation-mismatch',
        raw_text: COMPOUND_TURN_10
      }
    }), ({ code }) => code === 'TURN_STEP_PREPARED_DOMAIN_PLAN_UNSUPPORTED');
    assert.equal(runtimeFixture.commitCount(), 0);
  });
