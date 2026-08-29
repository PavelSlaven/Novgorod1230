import assert from 'node:assert/strict';
import test from 'node:test';
import { createTemporalAdvanceOwner, npcTemporalEffectRegistrations } from '@rus/turn/temporal-advance';
import { lowerDvinaTraceConversationTemporalEffectRegistrations } from '../src/runtime/lower-dvina-trace-m2-conversation-temporal-effect-owner.js';
import { lowerDvinaTraceCombatTemporalEffectRegistrations } from '../src/runtime/lower-dvina-trace-combat-temporal-effect-owner.js';
import { fixture } from './lower-dvina-trace-phase-2-fixture.js';
import { createM2ConversationModels } from './lower-dvina-trace-m2-conversation-fixture.js';
import { actorIds, bundle, combatPlan, openPhase8Combat, phase8CampState, phase8Plan, ROUTE_TEXT } from './lower-dvina-trace-phase-8-integration-helpers.js';

const temporalAdvanceOwner = () => createTemporalAdvanceOwner({ effect_registrations: [...npcTemporalEffectRegistrations(), ...lowerDvinaTraceConversationTemporalEffectRegistrations(), ...lowerDvinaTraceCombatTemporalEffectRegistrations()] });

test('Zhdanko break_contact uses the approved local exit before leaving combat', async () => {
  const state = phase8CampState();
  const ids = actorIds(state);
  const requests = [];
  const conversation = createM2ConversationModels({ ratshaResponseKind: 'combat_handoff' });
  const runtime = fixture({ scenarioBundle: bundle, materializationBundle: bundle, committedState: state, rollValue: 0.99,
    temporalAdvanceOwner: temporalAdvanceOwner(), turnStepModel: (request) => phase8Plan(request, ids),
    playerConversationModel: conversation.playerConversationModel, npcSemanticModel: conversation.npcSemanticModel,
    npcCombatModel: (request) => { requests.push(structuredClone(request)); return combatPlan(request, ids, { zhdanko: 'break_contact', companions: 'hold' }); } });
  const startMinute = Number(runtime.state.clock.whole_minutes);
  await openPhase8Combat(runtime, 'phase8-flight');
  const zhdankoRequest = requests.find(({ npc_ref: npc }) => npc.entity_id === ids.zhdanko);
  const storehouse = runtime.state.prepared_scenes.find(({ location_profile_ref: id }) => id === 'trace_ld_v1_loc_zhdanko_storehouse');
  assert.deepEqual(zhdankoRequest.operation_contract.break_contact_destination_refs, [{ entity_kind: 'location_anchor', entity_id: storehouse.anchor.instance_id }]);
  const response = { request_id: 'phase8-flight-combat-1', idempotency_key: 'phase8-flight-combat-1', raw_text: 'Попытаться удержать Жданко без лишнего вреда.' };
  await runtime.runtime.submitTurn({ partyId: runtime.partyId, input: response });
  let zhdanko = runtime.state.npcs.find(({ instance_id: id }) => id === ids.zhdanko);
  assert.equal(zhdanko.zone_ref, 'storehouse_yard');
  assert.equal(Number(runtime.state.clock.whole_minutes), startMinute + 19);
  assert.equal(runtime.state.active_combat_step_progress.find(({ actor_ref: actor }) => actor.entity_id === ids.zhdanko).elapsed_duration.exact_minutes.numerator, '2');
  assert.equal(runtime.state.last_turn.consequence.combat.outcome_events.some(({ actor_ref: actor, event_kind: kind }) => kind === 'combat_position_transition_completed' && actor?.entity_id === ids.zhdanko), false);
  let finalResponse = response;
  for (let ordinal = 2; ordinal <= 3; ordinal += 1) {
    finalResponse = { ...response, request_id: `phase8-flight-combat-${ordinal}`, idempotency_key: `phase8-flight-combat-${ordinal}` };
    await runtime.runtime.submitTurn({ partyId: runtime.partyId, input: finalResponse });
  }
  zhdanko = runtime.state.npcs.find(({ instance_id: id }) => id === ids.zhdanko);
  assert.equal(zhdanko.anchor_id, storehouse.anchor.instance_id);
  assert.equal(zhdanko.location_profile_ref, storehouse.location_profile_ref);
  assert.equal(zhdanko.zone_ref, 'river_access');
  assert.equal(Number(runtime.state.clock.whole_minutes), startMinute + 22);
  assert.equal(runtime.state.active_combat_step_progress.some(({ actor_ref: actor }) => actor.entity_id === ids.zhdanko), false);
  assert.equal(runtime.state.active_combat_step_progress.length, 0);
  const combat = runtime.state.last_turn.consequence.combat;
  assert.equal(combat.session_after.participant_states.find(({ actor_ref: actor }) => actor.entity_id === ids.zhdanko).combat_status, 'left');
  const movementEvent = combat.outcome_events.find(({ actor_ref: actor, event_kind: kind }) => kind === 'combat_position_transition_completed' && actor?.entity_id === ids.zhdanko);
  assert.equal(movementEvent.movement_ref, 'trace_ld_v1_local_transition_storehouse_to_river_access');
  assert.equal(combat.session_after.status, 'ended');
  const commitCount = runtime.commitCount();
  await runtime.runtime.submitTurn({ partyId: runtime.partyId, input: finalResponse });
  assert.equal(runtime.commitCount(), commitCount);
  assert.equal(runtime.state.npcs.find(({ instance_id: id }) => id === ids.zhdanko).anchor_id, storehouse.anchor.instance_id);
});

test('health zero persists one closed self signal without a combat LLM request', async () => {
  const state = phase8CampState();
  const ids = actorIds(state);
  const zhdanko = state.npcs.find(({ instance_id: id }) => id === ids.zhdanko);
  zhdanko.machine_state = { ...zhdanko.machine_state, body_condition: { ...zhdanko.machine_state.body_condition, health: 5 } };
  const conversation = createM2ConversationModels({ ratshaResponseKind: 'combat_handoff' });
  const runtime = fixture({ scenarioBundle: bundle, materializationBundle: bundle, committedState: state, rollValue: 0.99,
    temporalAdvanceOwner: temporalAdvanceOwner(), turnStepModel: (request) => phase8Plan(request, ids, 'engage'),
    playerConversationModel: conversation.playerConversationModel, npcSemanticModel: conversation.npcSemanticModel,
    npcCombatModel: (request) => combatPlan(request, ids) });
  await runtime.runtime.submitTurn({ partyId: runtime.partyId, input: { request_id: 'phase8-zero-route', idempotency_key: 'phase8-zero-route', raw_text: ROUTE_TEXT } });
  await runtime.runtime.submitTurn({ partyId: runtime.partyId, input: { request_id: 'phase8-zero-accusation', idempotency_key: 'phase8-zero-accusation', raw_text: 'Обвинить Жданко и потребовать вернуть дорожную сумку.' } });
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
  const thresholdSignals = newSignals.filter(({ signal }) => signal.category === 'self' && signal.subject_ref.entity_id === ids.zhdanko && signal.source_event_ref.entity_kind === 'body_threshold_crossing');
  assert.equal(thresholdSignals.length, 1);
  assert.equal(runtime.state.consumed_npc_decision_signal_ids.includes(thresholdSignals[0].signal.signal_id), true);
  assert.equal(runtime.state.npc_decision_terminal_outcomes.some((outcome) => outcome.npc_ref.entity_id === ids.zhdanko && outcome.signal_ids_to_consume.includes(thresholdSignals[0].signal.signal_id)), true);
  assert.equal(runtime.state.last_turn.consequence.combat.signal_records.some(({ signal_id: id }) => id === thresholdSignals[0].signal.signal_id), true);
  await runtime.runtime.submitTurn({ partyId: runtime.partyId, input: response });
  assert.equal(runtime.commitCount(), commitsBefore + 1);
  assert.equal(runtime.npcCombatCount(), combatCalls);
  assert.equal(runtime.state.npc_decision_signals.filter(({ signal }) => signal.signal_id === thresholdSignals[0].signal.signal_id).length, 1);
});
