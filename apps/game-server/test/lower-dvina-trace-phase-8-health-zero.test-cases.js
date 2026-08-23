import assert from 'node:assert/strict';
import test from 'node:test';

export function registerPhase8HealthZeroTest({
  ROUTE_TEXT,
  actorIds,
  bundle,
  combatPlan,
  createM2ConversationModels,
  createTemporalAdvanceOwner,
  fixture,
  lowerDvinaTraceCombatTemporalEffectRegistrations,
  lowerDvinaTraceConversationTemporalEffectRegistrations,
  npcTemporalEffectRegistrations,
  phase8CampState,
  phase8Plan,
}) {
  test('health zero persists one closed self signal without a combat LLM request', async () => {
    const state = phase8CampState();
    const ids = actorIds(state);
    const zhdanko = state.npcs.find(({ instance_id: id }) => id === ids.zhdanko);
    zhdanko.machine_state = { ...zhdanko.machine_state, body_condition: { ...zhdanko.machine_state.body_condition, health: 5 } };
    const conversation = createM2ConversationModels({
      ratshaResponseKind: 'combat_handoff',
    });
    const runtime = fixture({
      scenarioBundle: bundle,
      materializationBundle: bundle,
      committedState: state,
      rollValue: 0.99,
      temporalAdvanceOwner: createTemporalAdvanceOwner({
        effect_registrations: [...npcTemporalEffectRegistrations(), ...lowerDvinaTraceConversationTemporalEffectRegistrations(), ...lowerDvinaTraceCombatTemporalEffectRegistrations()],
      }),
      turnStepModel: (request) => phase8Plan(request, ids, 'engage'),
      playerConversationModel: conversation.playerConversationModel,
      npcSemanticModel: conversation.npcSemanticModel,
      npcCombatModel: (request) => combatPlan(request, ids),
    });

    await runtime.runtime.submitTurn({
      partyId: runtime.partyId,
      input: {
        request_id: 'phase8-zero-route',
        idempotency_key: 'phase8-zero-route',
        raw_text: ROUTE_TEXT,
      },
    });
    await runtime.runtime.submitTurn({
      partyId: runtime.partyId,
      input: {
        request_id: 'phase8-zero-accusation',
        idempotency_key: 'phase8-zero-accusation',
        raw_text: 'Обвинить Жданко и потребовать вернуть дорожную сумку.',
      },
    });
    const combatCalls = runtime.npcCombatCount();
    const signalIdsBefore = new Set((runtime.state.npc_decision_signals ?? []).map(({ signal }) => signal.signal_id));
    const response = { request_id: 'phase8-zero-combat', idempotency_key: 'phase8-zero-combat', raw_text: 'Ударить Жданко, чтобы немедленно прекратить сопротивление.' };
    const commitsBefore = runtime.commitCount();
    await runtime.runtime.submitTurn({ partyId: runtime.partyId, input: response });

    assert.equal(runtime.commitCount(), commitsBefore + 1);
    assert.equal(runtime.npcCombatCount(), combatCalls);
    assert.equal(runtime.state.combat_sessions.length, 0);
    assert.equal(runtime.state.last_turn.consequence.combat.session_after.participant_states.find(({ actor_ref: actor }) => actor.entity_id === ids.zhdanko).combat_status, 'incapacitated');
    assert.deepEqual(runtime.state.last_turn.consequence.combat.decision_records, []);
    const newSignals = runtime.state.npc_decision_signals.filter(({ signal }) => !signalIdsBefore.has(signal.signal_id));
    const thresholdSignals = newSignals.filter(
      ({ signal }) => signal.category === 'self' && signal.subject_ref.entity_id === ids.zhdanko && signal.source_event_ref.entity_kind === 'body_threshold_crossing',
    );
    assert.equal(thresholdSignals.length, 1);
    assert.equal(runtime.state.consumed_npc_decision_signal_ids.includes(thresholdSignals[0].signal.signal_id), true);
    assert.equal(
      runtime.state.npc_decision_terminal_outcomes.some((outcome) => outcome.npc_ref.entity_id === ids.zhdanko && outcome.signal_ids_to_consume.includes(thresholdSignals[0].signal.signal_id)),
      true,
    );
    assert.equal(
      runtime.state.last_turn.consequence.combat.signal_records.some(({ signal_id: id }) => id === thresholdSignals[0].signal.signal_id),
      true,
    );

    await runtime.runtime.submitTurn({ partyId: runtime.partyId, input: response });
    assert.equal(runtime.commitCount(), commitsBefore + 1);
    assert.equal(runtime.npcCombatCount(), combatCalls);
    assert.equal(runtime.state.npc_decision_signals.filter(({ signal }) => signal.signal_id === thresholdSignals[0].signal.signal_id).length, 1);
  });
}
