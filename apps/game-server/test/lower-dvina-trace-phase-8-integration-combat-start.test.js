import assert from 'node:assert/strict';
import test from 'node:test';
import { createTemporalAdvanceOwner, npcTemporalEffectRegistrations } from '@rus/turn/temporal-advance';
import { lowerDvinaTraceConversationTemporalEffectRegistrations } from '../src/runtime/lower-dvina-trace-m2-conversation-temporal-effect-owner.js';
import { lowerDvinaTraceCombatTemporalEffectRegistrations } from '../src/runtime/lower-dvina-trace-combat-temporal-effect-owner.js';
import { createTracePhase8Runtime } from '../src/runtime/lower-dvina-trace-phase-8-runtime.js';
import { resolveTracePhase3Contracts } from '../src/runtime/lower-dvina-trace-phase-3-contracts.js';
import { createTraceCombatCommand } from '../src/runtime/lower-dvina-trace-combat-command.js';
import { fixture } from './lower-dvina-trace-phase-2-fixture.js';
import { createM2ConversationModels } from './lower-dvina-trace-m2-conversation-fixture.js';
import { actorIds, bundle, combatPlan, phase8CampState, phase8Plan, phase8StartPlan, ROUTE_TEXT } from './lower-dvina-trace-phase-8-integration-helpers.js';

test('Phase 8 reaches the storehouse, opens combat, and commits one exchange', async () => {
  const state = phase8CampState();
  const ids = actorIds(state);
  const conversation = createM2ConversationModels({ ratshaResponseKind: 'combat_handoff' });
  const runtime = fixture({ scenarioBundle: bundle, materializationBundle: bundle, committedState: state, rollValue: 0.5,
    temporalAdvanceOwner: createTemporalAdvanceOwner({ effect_registrations: [...npcTemporalEffectRegistrations(), ...lowerDvinaTraceConversationTemporalEffectRegistrations(), ...lowerDvinaTraceCombatTemporalEffectRegistrations()] }),
    turnStepModel: (request) => phase8Plan(request, ids), playerConversationModel: conversation.playerConversationModel,
    npcSemanticModel: conversation.npcSemanticModel, npcCombatModel: (request) => combatPlan(request, ids) });
  const startMinute = Number(runtime.state.clock.whole_minutes);
  await runtime.runtime.submitTurn({ partyId: runtime.partyId, input: { request_id: 'phase8-route', idempotency_key: 'phase8-route', raw_text: ROUTE_TEXT } });
  assert.equal(runtime.state.position.location_ref, 'trace_ld_v1_loc_zhdanko_storehouse');
  assert.equal(Number(runtime.state.clock.whole_minutes), startMinute + 12);
  for (const id of [ids.eremey, ids.ratsha, ids.fisher]) assert.equal(runtime.state.npcs.find(({ instance_id }) => instance_id === id).anchor_id, runtime.state.position.g5_anchor_id);
  await runtime.runtime.submitTurn({ partyId: runtime.partyId, input: { request_id: 'phase8-accusation', idempotency_key: 'phase8-accusation', raw_text: 'Обвинить Жданко и потребовать вернуть дорожную сумку.' } });
  assert.equal(Number(runtime.state.clock.whole_minutes), startMinute + 17);
  assert.equal(runtime.state.combat_sessions.length, 1);
  assert.equal(runtime.state.combat_sessions[0].status, 'paused_for_player');
  assert.equal(runtime.state.combat_sessions[0].exchange_ordinal, 0);
  assert.equal(runtime.npcCombatCount(), 4);
  assert.equal(runtime.state.player_response_boundary.kind, 'combat');
  const healthBefore = runtime.state.body_state.health;
  const signalCountBefore = runtime.state.npc_decision_signals?.length ?? 0;
  const response = { request_id: 'phase8-combat-1', idempotency_key: 'phase8-combat-1', raw_text: 'Помочь Еремею обезоружить Жданко, не убивая его.' };
  await runtime.runtime.submitTurn({ partyId: runtime.partyId, input: response });
  assert.equal(Number(runtime.state.clock.whole_minutes), startMinute + 19);
  assert.equal(runtime.state.combat_sessions.length, 0);
  assert.equal(runtime.state.last_turn.consequence.combat.session_after.status, 'ended');
  assert.equal(runtime.state.last_turn.consequence.combat.session_after.participant_states.find(({ actor_ref: actor }) => actor.entity_id === ids.zhdanko).combat_status, 'restrained');
  assert.equal(runtime.state.npcs.find(({ instance_id: id }) =>
    id === ids.zhdanko).machine_state.combat_terminal_status, 'restrained');
  assert.ok(runtime.state.body_state.health < healthBefore);
  const axe = runtime.state.items.find(({ template_id }) => template_id === 'trace_ld_v1_item_zhdanko_axe');
  assert.equal(axe.placement.holder_npc_id, ids.eremey);
  assert.equal(axe.ownership.controller_npc_id, ids.eremey);
  assert.equal(runtime.npcCombatCount(), 4);
  const terminalSignals = runtime.state.last_turn.consequence.combat.signal_records;
  const outcomeEvents = runtime.state.last_turn.consequence.combat.outcome_events;
  const disarmEvent = outcomeEvents.find(({ event_kind: kind }) => kind === 'combat_item_transition_completed');
  const disarmSignal = terminalSignals.find(({ source_event_ref: source }) => source.entity_kind === 'combat_event' && source.entity_id === disarmEvent?.event_id);
  assert.ok(disarmSignal);
  assert.equal(disarmEvent?.event_kind, 'combat_item_transition_completed');
  assert.equal(disarmEvent?.item_ref.entity_id, axe.item_id);
  assert.equal(runtime.state.npc_decision_signals.length, signalCountBefore + terminalSignals.length);
  assert.equal(terminalSignals.every(({ signal_id: id }) => runtime.state.consumed_npc_decision_signal_ids.includes(id)), true);
  assert.equal(runtime.state.last_turn.consequence.combat.session_after.participant_states.find(({ actor_ref: actor }) => actor.entity_id === ids.zhdanko).current_intent, null);
  assert.equal(runtime.state.combat_history.at(-1).outcome_event_refs.some((eventId) => eventId.endsWith(':ended')), true);
  assert.equal(runtime.state.player_response_boundary, null);
  const commitCount = runtime.commitCount();
  const rollCount = runtime.rollCount();
  await runtime.runtime.submitTurn({ partyId: runtime.partyId, input: response });
  assert.equal(runtime.commitCount(), commitCount);
  assert.equal(runtime.rollCount(), rollCount);
  assert.equal(runtime.npcCombatCount(), 4);
  assert.equal(Number(runtime.state.clock.whole_minutes), startMinute + 19);
});

test('visible Phase 8 Zhdanko can receive a player-started combat handoff', async () => {
  const state = phase8CampState();
  const ids = actorIds(state);
  const conversation = createM2ConversationModels({ ratshaResponseKind: 'speech' });
  const plannerRequests = [];
  const runtime = fixture({ scenarioBundle: bundle, materializationBundle: bundle, committedState: state, rollValue: 0.5,
    temporalAdvanceOwner: createTemporalAdvanceOwner({ effect_registrations: [...npcTemporalEffectRegistrations(), ...lowerDvinaTraceConversationTemporalEffectRegistrations(), ...lowerDvinaTraceCombatTemporalEffectRegistrations()] }),
    turnStepModel: (request) => { plannerRequests.push(structuredClone(request)); return request.root_player_action.includes('объяснений') ? phase8Plan(request, ids) : phase8StartPlan(request, ids); },
    playerConversationModel: conversation.playerConversationModel, npcSemanticModel: conversation.npcSemanticModel,
    npcCombatModel: (request) => combatPlan(request, ids) });
  await runtime.runtime.submitTurn({ partyId: runtime.partyId, input: { request_id: 'phase8-start-route', idempotency_key: 'phase8-start-route', raw_text: ROUTE_TEXT } });
  await runtime.runtime.submitTurn({ partyId: runtime.partyId, input: { request_id: 'phase8-start-speech', idempotency_key: 'phase8-start-speech', raw_text: 'Потребовать у Жданко объяснений.' } });
  assert.equal(runtime.state.combat_sessions?.length ?? 0, 0);
  await runtime.runtime.submitTurn({ partyId: runtime.partyId, input: { request_id: 'phase8-player-combat', idempotency_key: 'phase8-player-combat', raw_text: 'Помочь Еремею обезоружить Жданко, не убивая его.' } });
  const combatRequest = plannerRequests.at(-1);
  assert.equal(combatRequest.available_domain_operations.some((operation) => operation.op === 'request_combat' && operation.target_refs.includes(ids.zhdanko)), true);
  assert.equal(runtime.state.last_turn.consequence.combat_kind, 'start');
  assert.equal(runtime.state.combat_sessions.length, 1);
  assert.equal(runtime.state.combat_sessions[0].status, 'paused_for_player');
  assert.deepEqual(runtime.state.last_turn.consequence.combat_initialization, {
    combat_id: runtime.state.combat_sessions[0].combat_id,
    status: 'paused_for_player', player_response_required: true
  });
  assert.equal(runtime.state.player_response_boundary.kind, 'combat');
  assert.equal(runtime.npcCombatCount(), 4);
});

test('moved visible Phase 8 participants are not offered as combat targets', async () => {
  const state = phase8CampState();
  const ids = actorIds(state);
  const runtime = fixture({ scenarioBundle: bundle, materializationBundle: bundle, committedState: state, turnStepModel: (request) => phase8Plan(request, ids) });
  await runtime.runtime.submitTurn({ partyId: runtime.partyId, input: { request_id: 'phase8-hidden-route', idempotency_key: 'phase8-hidden-route', raw_text: ROUTE_TEXT } });
  const storehouseAnchor = runtime.state.position.g5_anchor_id;
  const zhdanko = runtime.state.npcs.find(({ instance_id: id }) => id === ids.zhdanko);
  zhdanko.anchor_id = 'other-anchor';
  zhdanko.visibility_state = 'visible';
  const phase8 = createTracePhase8Runtime({ state: runtime.state, bundle, phase3Contracts: resolveTracePhase3Contracts({ state: runtime.state, bundle }) });
  const command = createTraceCombatCommand({ state: runtime.state, bundle, inputDigest: 'phase8-hidden', randomSource: { next: () => 0.5 }, phase8Contracts: phase8.contracts, npcCombatModel: async () => null, revalidateStateVersion: async () => runtime.state.party_state.state_version });
  assert.equal(command.availability({ committed_state: runtime.state }).can_attempt, false);
  zhdanko.anchor_id = storehouseAnchor;
  const eremey = runtime.state.npcs.find(({ instance_id: id }) => id === ids.eremey);
  eremey.anchor_id = 'other-anchor';
  eremey.visibility_state = 'visible';
  assert.equal(command.availability({ committed_state: runtime.state }).can_attempt, false);
});
