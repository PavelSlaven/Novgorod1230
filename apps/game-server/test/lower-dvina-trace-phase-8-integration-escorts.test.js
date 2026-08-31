import assert from 'node:assert/strict';
import test from 'node:test';
import { createTemporalAdvanceOwner, npcTemporalEffectRegistrations } from '@rus/turn/temporal-advance';
import { lowerDvinaTraceConversationTemporalEffectRegistrations } from '../src/runtime/lower-dvina-trace-m2-conversation-temporal-effect-owner.js';
import { lowerDvinaTraceCombatTemporalEffectRegistrations } from '../src/runtime/lower-dvina-trace-combat-temporal-effect-owner.js';
import { fixture } from './lower-dvina-trace-phase-2-fixture.js';
import { createM2ConversationModels } from './lower-dvina-trace-m2-conversation-fixture.js';
import { actorIds, bundle, combatPlan, openPhase8Combat, phase8CampState, phase8Plan, ref } from './lower-dvina-trace-phase-8-integration-helpers.js';

const temporalAdvanceOwner = () => createTemporalAdvanceOwner({ effect_registrations: [...npcTemporalEffectRegistrations(), ...lowerDvinaTraceConversationTemporalEffectRegistrations(), ...lowerDvinaTraceCombatTemporalEffectRegistrations()] });

test('Phase 8 carries every committed escort into route and combat', async () => {
  const state = phase8CampState();
  const fishers = state.npcs.filter(({ participant_slot_ref: slot }) => /^background_fisher_[12]$/.test(slot));
  const second = fishers.find(({ instance_id: id }) => id !== actorIds(state).fisher);
  const camp = state.prepared_scenes.find(({ location_profile_ref: id }) => id === 'trace_ld_v1_loc_fishing_camp');
  second.anchor_id = camp.anchor.instance_id;
  second.location_profile_ref = camp.location_profile_ref;
  second.zone_ref = 'fire_side';
  second.machine_state = { ...second.machine_state, location_ref: camp.location_profile_ref, spatial_zone_ref: 'fire_side' };
  state.route_participant_commitments.push({ npc_ref: ref(second.instance_id), role: 'escort' });
  const ids = { ...actorIds(state), escorts: fishers.map(({ instance_id: id }) => id) };
  const responders = [];
  const playerRequests = [];
  const conversation = createM2ConversationModels({ ratshaResponseKind: 'combat_handoff', onNpcCall: ({ npc_ref: npc }) => responders.push(npc.entity_id) });
  const runtime = fixture({ scenarioBundle: bundle, materializationBundle: bundle, committedState: state, rollValue: 0.5,
    temporalAdvanceOwner: temporalAdvanceOwner(), turnStepModel: (request) => phase8Plan(request, ids),
    playerConversationModel: (request) => { playerRequests.push(request); return conversation.playerConversationModel(request); },
    npcSemanticModel: conversation.npcSemanticModel, npcCombatModel: (request) => combatPlan(request, ids) });
  await openPhase8Combat(runtime, 'phase8-two-escorts');
  for (const id of ids.escorts) assert.equal(runtime.state.npcs.find(({ instance_id }) => instance_id === id).anchor_id, runtime.state.position.g5_anchor_id);
  const participantIds = runtime.state.combat_sessions[0].participant_states.map(({ actor_ref: actor }) => actor.entity_id);
  assert.deepEqual(playerRequests[0].player_safe_context.required_intended_addressee_refs, [ref(ids.zhdanko)]);
  assert.deepEqual(responders, [ids.zhdanko]);
  assert.equal(ids.escorts.every((id) => participantIds.includes(id)), true);
  assert.equal(runtime.npcCombatCount(), 5);
});

test('Ratsha reaches the factual road bag through the movement owner', async () => {
  const state = phase8CampState();
  const ids = actorIds(state);
  const bag = state.containers.find(({ template_id: id }) => id === 'trace_ld_v1_container_road_bag');
  assert.equal(bag.state.zone_ref, 'storehouse_interior');
  const requests = [];
  const conversation = createM2ConversationModels({ ratshaResponseKind: 'combat_handoff' });
  const runtime = fixture({ scenarioBundle: bundle, materializationBundle: bundle, committedState: state, rollValue: 0.99,
    temporalAdvanceOwner: temporalAdvanceOwner(), turnStepModel: (request) => phase8Plan(request, ids, 'hold'),
    playerConversationModel: conversation.playerConversationModel, npcSemanticModel: conversation.npcSemanticModel,
    npcCombatModel: (request) => { requests.push(structuredClone(request)); return combatPlan(request, ids, { ratsha: 'reach', companions: 'hold' }); } });
  const startMinute = Number(runtime.state.clock.whole_minutes);
  await openPhase8Combat(runtime, 'phase8-reach');
  const ratshaRequest = requests.find(({ npc_ref: npc }) => npc.entity_id === ids.ratsha);
  assert.deepEqual(ratshaRequest.operation_contract.reachable_destination_refs, [{ entity_kind: 'container', entity_id: bag.container_id }]);
  const response = { request_id: 'phase8-reach-combat', idempotency_key: 'phase8-reach-combat', raw_text: 'Помочь Еремею удержать Жданко.' };
  await runtime.runtime.submitTurn({ partyId: runtime.partyId, input: response });
  const ratsha = runtime.state.npcs.find(({ instance_id: id }) => id === ids.ratsha);
  assert.equal(ratsha.location_profile_ref, 'trace_ld_v1_loc_zhdanko_storehouse');
  assert.equal(ratsha.zone_ref, 'storehouse_interior');
  assert.equal(ratsha.machine_state.spatial_zone_ref, 'storehouse_interior');
  assert.equal(Number(runtime.state.clock.whole_minutes), startMinute + 19);
  const movementEvent = runtime.state.last_turn.consequence.combat.outcome_events.find(({ actor_ref: actor, event_kind: kind }) => kind === 'combat_position_transition_completed' && actor?.entity_id === ids.ratsha);
  assert.equal(movementEvent.destination_ref.entity_id, bag.container_id);
  assert.equal(runtime.state.combat_history.at(-1).outcome_event_refs.includes(movementEvent.event_id), true);
  const movementSignal = runtime.state.last_turn.consequence.combat.signal_records.find(({ source_event_ref: source }) => source.entity_kind === 'combat_event' && source.entity_id === movementEvent.event_id);
  assert.equal(movementSignal?.subject_ref.entity_id, ids.ratsha);
  assert.equal(movementSignal?.category, 'objective');
  const ratshaRequests = requests.filter(({ npc_ref: npc }) => npc.entity_id === ids.ratsha);
  assert.equal(ratshaRequests.length, 2);
  assert.equal(ratshaRequests[1].decision_reasons.perceived_changes.some((summary) => summary.includes('достиг выбранного')), true);
  assert.equal(runtime.state.combat_sessions[0].participant_states.find(({ actor_ref: actor }) => actor.entity_id === ids.ratsha).current_intent.intent_kind, 'hold');
  const commitCount = runtime.commitCount();
  await runtime.runtime.submitTurn({ partyId: runtime.partyId, input: response });
  assert.equal(runtime.commitCount(), commitCount);
  assert.equal(runtime.state.npcs.find(({ instance_id: id }) => id === ids.ratsha).zone_ref, 'storehouse_interior');
});
