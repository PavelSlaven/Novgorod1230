import assert from 'node:assert/strict';
import test from 'node:test';
import { createLowerDvinaTraceNpcActorStepOwnerCapabilitiesFactory } from
  '../src/runtime/lower-dvina-trace-npc-actor-step-owner-capabilities.js';
import { createLowerDvinaTraceNpcActorStepModeOwnerCapabilities } from
  '../src/runtime/lower-dvina-trace-npc-actor-step-mode-handoffs.js';
import { hydrateCombatSession } from
  '../src/infrastructure/postgres/combat-session-persistence.js';
import { phase7Command, phase7CommittedState, phase7PlayerInput,
  persistPhase7Consequence } from './lower-dvina-trace-phase-7-runtime-fixture.js';
import { approvedPhase7Contracts, phase7DirectPlan } from
  './lower-dvina-trace-phase-7-contract-fixture.js';
import { runLowerDvinaTraceNpcConversationExchange } from
  '../src/runtime/lower-dvina-trace-npc-initiated-conversation.js';

const npc = { instance_id: 'npc-1', machine_state: {}, perception_snapshot: {
  present_actors: [{ actor_ref: 'visible-1',
    source_event_ref: { entity_kind: 'event', entity_id: 'seen-1' } }]
} };
const state = { party_id: 'party-1', actor_id: 'remote-1', npcs: [npc, {
  instance_id: 'visible-1'
}], party_state: { turn_number: 1, state_version: 1 } };
const contracts = { zhdanko: npc, npcSemanticProfile: {
  profile_id: 'lower_dvina_trace_npc_actor_step_profile_v1', revision: 1,
  status: 'approved', activation_boundary: { phase: 'phase_7',
    npc_participant_slot_ref: 'zhdanko_storehouse_controller' }
} };

test('NPC actor-step mode handoffs expose only NPC-safe visible targets and keep owner execution', async () => {
  let executed = 0;
  const factory = createLowerDvinaTraceNpcActorStepOwnerCapabilitiesFactory({
    createModeOwnerCapabilities: async ({ visibleTargetRefs }) => [{
      operation: 'request_conversation', capability: { owner: '@rus/conversation' },
      supports: ({ operation }) => operation.target_actor_refs[0] === 'visible-1',
      execute: async () => { executed += 1; return { working_projection: {},
        summary: 'conversation handoff', duration_minutes: 0 }; }
    }, { operation: 'request_combat', capability: { owner: '@rus/combat' },
      supports: ({ operation }) => operation.target_actor_refs[0] === 'visible-1',
      execute: async () => ({ working_projection: {}, summary: 'combat handoff',
        duration_minutes: 0 })
    }, { operation: 'emit_interaction', capability: { owner: '@rus/interaction' },
      execute: async () => ({ working_projection: {}, summary: 'interaction handoff',
        duration_minutes: 0 })
    }]
  });
  const capabilities = await factory({ partyId: state.party_id, requestId: 'r',
    inputDigest: 'd', state, phase7Contracts: contracts });
  assert.equal(capabilities.length, 3);
  for (const entry of capabilities) {
    assert.deepEqual(entry.capability.target_actor_refs, ['visible-1']);
    assert.equal(entry.supports({ operation: { op: entry.operation,
      actor_ref: 'npc-1', target_actor_refs: ['remote-1'] } }), false);
  }
  const conversation = capabilities.find(({ operation }) =>
    operation === 'request_conversation');
  assert.equal(conversation.supports({ operation: { op: 'request_conversation',
    actor_ref: 'npc-1', target_actor_refs: ['visible-1'] } }), true);
  await conversation.execute({});
  assert.equal(executed, 1);
});

test('production handoffs expose only current NPC-safe actor targets', async () => {
  const current = structuredClone(state);
  const actor = current.npcs[0];
  current.npcs.push({ instance_id: 'visible-2' });
  actor.perception_snapshot.present_actors.push({ actor_ref: 'visible-2',
    source_perception_ref: 'seen-2' });
  const factory = createLowerDvinaTraceNpcActorStepOwnerCapabilitiesFactory({
    createModeOwnerCapabilities: createLowerDvinaTraceNpcActorStepModeOwnerCapabilities
  });
  const capabilities = await factory({ partyId: current.party_id,
    requestId: 'r', inputDigest: 'd', state: current,
    phase7Contracts: contracts });
  const conversation = capabilities.find(({ operation }) =>
    operation === 'request_conversation');
  const combat = capabilities.find(({ operation }) =>
    operation === 'request_combat');
  assert.deepEqual(conversation.capability.target_actor_refs,
    ['visible-1', 'visible-2']);
  assert.deepEqual(combat.capability.target_actor_refs,
    ['visible-1', 'visible-2']);
  assert.equal(combat.supports({ operation: { op: 'request_combat',
    actor_ref: 'npc-1', target_actor_refs: ['remote-1'] } }), false);
  assert.equal(JSON.stringify(capabilities).includes('remote-1'), false);
});

test('Phase 7 persists combat as an owner handoff without resolving the mode', async () => {
  const current = phase7CommittedState();
  const speaker = current.npcs.find(({ instance_id: id }) => id === 'zhdanko-1');
  current.npcs.push({ instance_id: 'guard-1',
    machine_state: { location_ref: 'trace_ld_v1_loc_storehouse',
      spatial_zone_ref: 'storehouse_inside' } });
  speaker.perception_snapshot = { present_actors: [{ actor_ref: 'guard-1',
    source_event_ref: { entity_kind: 'event', entity_id: 'seen:guard' } }] };
  speaker.relationships.push({ actor_ref: 'guard-1', hostility: 'hostile' });
  const phase7Contracts = approvedPhase7Contracts(current);
  phase7Contracts.npcSemanticProfile = contracts.npcSemanticProfile;
  const factory = createLowerDvinaTraceNpcActorStepOwnerCapabilitiesFactory({
    createModeOwnerCapabilities: createLowerDvinaTraceNpcActorStepModeOwnerCapabilities
  });
  const consequence = await phase7Command({ state: current,
    contracts: phase7Contracts,
    createBoundaryNpcOwnerCapabilities: (boundary) => factory({
      partyId: current.party_id, requestId: 'mode-handoff', inputDigest: 'd',
      phase7Contracts, ...boundary }),
    model: async (request) => {
      const plan = phase7DirectPlan(request);
      plan.resolution = 'domain_request';
      plan.activity = { owner: 'domain', duration_class: null, effort: null };
      plan.operations = [{ op: 'request_combat', actor_ref: request.npc_ref,
        target_actor_refs: ['guard-1'], combat_intent: 'остановить нападение' }];
      return plan;
    }
  }).consequence({ retrievedState: current,
    playerInput: phase7PlayerInput(current, 'request_combat') });
  const persisted = await persistPhase7Consequence({ state: current,
    contracts: phase7Contracts, consequence });
  const last = persisted.snapshot.npcs.find(({ instance_id: id }) =>
    id === 'zhdanko-1').machine_state.last_schedule_execution;
  assert.equal(last.semantic_operation.op, 'request_combat');
  assert.equal(last.exact_elapsed.exact_minutes.numerator, '0');
  const session = persisted.snapshot.combat_sessions.at(-1);
  assert.equal(session.status, 'paused_for_decisions');
  assert.equal(session.player_response_required, false);
  assert.equal(session.exchange_ordinal, 0);
  assert.equal(session.last_exchange_ref, null);
  assert.equal(session.participant_states.every(
    ({ current_intent }) => current_intent === null), true);
  assert.equal(persisted.snapshot.combat_history, undefined);
  const write = persisted.plan.inserts.find(({ target_table }) =>
    target_table === 'party_combat_sessions');
  assert.deepEqual(hydrateCombatSession(write.record), session);
  assert.equal(persisted.snapshot.last_turn.turn_step_operation_batch,
    undefined);
});

test('Phase 7 persists factual nonverbal interaction without target reaction', async () => {
  const current = phase7CommittedState();
  const speaker = current.npcs.find(({ instance_id: id }) => id === 'zhdanko-1');
  current.npcs.push({ instance_id: 'guard-1', machine_state: {
    location_ref: 'trace_ld_v1_loc_storehouse',
    spatial_zone_ref: 'storehouse_inside' } });
  speaker.perception_snapshot = { present_actors: [{ actor_ref: 'guard-1',
    source_event_ref: { entity_kind: 'event', entity_id: 'seen:guard' } }] };
  const phase7Contracts = approvedPhase7Contracts(current);
  phase7Contracts.npcSemanticProfile = contracts.npcSemanticProfile;
  const factory = createLowerDvinaTraceNpcActorStepOwnerCapabilitiesFactory({
    createModeOwnerCapabilities: createLowerDvinaTraceNpcActorStepModeOwnerCapabilities
  });
  const consequence = await phase7Command({ state: current,
    contracts: phase7Contracts,
    createBoundaryNpcOwnerCapabilities: (boundary) => factory({
      partyId: current.party_id, requestId: 'interaction', inputDigest: 'd',
      phase7Contracts, ...boundary }),
    model: async (request) => {
      const plan = phase7DirectPlan(request);
      plan.resolution = 'domain_request';
      plan.activity = { owner: 'domain', duration_class: null, effort: null };
      plan.operations = [{ op: 'emit_interaction', actor_ref: request.npc_ref,
        target_actor_refs: ['guard-1'], interaction_kind: 'gesture',
        content: 'Жданко жестом показывает остановиться', instrument_refs: [] }];
      return plan;
    }
  }).consequence({ retrievedState: current,
    playerInput: phase7PlayerInput(current, 'interaction') });
  const persisted = await persistPhase7Consequence({ state: current,
    contracts: phase7Contracts, consequence });
  const interaction = persisted.snapshot.interactions.at(-1);
  assert.deepEqual(interaction.target_actor_ids, ['guard-1']);
  assert.equal(interaction.content,
    'Жданко жестом показывает остановиться');
  assert.equal(interaction.visible, false);
  for (const forbidden of ['reaction', 'target_reaction', 'outcome']) {
    assert.equal(Object.hasOwn(interaction, forbidden), false);
  }
  assert.equal(persisted.plan.inserts.some(({ target_table }) =>
    ['party_conversation_sessions', 'party_combat_sessions']
      .includes(target_table)), false);
});

test('Phase 7 persists NPC-first conversation contribution and its signal lineage', async () => {
  const current = phase7CommittedState();
  const speaker = current.npcs.find(({ instance_id }) => instance_id === 'zhdanko-1');
  speaker.identity_state = { canonical_name: 'Жданко' };
  speaker.ref = { entity_kind: 'npc', entity_id: 'zhdanko-1' };
  speaker.knowledge_profile_snapshot = {};
  speaker.knowledge_records = [];
  speaker.semantic_state = {};
  speaker.perception_snapshot = { present_actors: [{ actor_ref: 'mikula',
    source_event_ref: { entity_kind: 'event', entity_id: 'seen:player' } }] };
  speaker.machine_state = { ...speaker.machine_state, speech_capability: 'full' };
  const phase7Contracts = approvedPhase7Contracts(current);
  phase7Contracts.npcSemanticProfile = contracts.npcSemanticProfile;
  const conversationBindings = { fallback_policy: 'forbidden',
    legacy_bounded_production_path: 'forbidden', max_contributions_per_exchange: 8 };
  const conversationActivity = { profile_id: 'approved-talk',
    duration_minutes: 5 };
  let modelCalls = 0;
  const model = async (request) => {
    modelCalls += 1;
    assert.equal(request.social_context.conversation_goal, 'узнать, всё ли спокойно');
    return npcFirstSpeechPlan(request, 'mikula');
  };
  const factory = createLowerDvinaTraceNpcActorStepOwnerCapabilitiesFactory({
    createModeOwnerCapabilities: createLowerDvinaTraceNpcActorStepModeOwnerCapabilities
  });
  const consequence = await phase7Command({ state: current,
    contracts: phase7Contracts,
    conversationBindings, conversationActivity,
    createBoundaryNpcOwnerCapabilities: (boundary) => factory({
      partyId: current.party_id, requestId: 'conversation-e2e', inputDigest: 'd',
      phase7Contracts, ...boundary }),
    runNpcConversationExchange: (input) => runLowerDvinaTraceNpcConversationExchange({
      ...input, npcSemanticModel: model, revalidateStateVersion: async () => 7,
      temporalAdvanceOwner: conversationTemporalOwner() }),
    model: async (request) => {
      const plan = phase7DirectPlan(request);
      plan.resolution = 'domain_request';
      plan.activity = { owner: 'domain', duration_class: null, effort: null };
      plan.operations = [{ op: 'request_conversation', actor_ref: request.npc_ref,
        target_actor_refs: ['mikula'], conversation_goal: 'узнать, всё ли спокойно' }];
      return plan;
    }
  }).consequence({ retrievedState: current,
    playerInput: phase7PlayerInput(current, 'conversation-e2e') });
  const semantic = consequence.phase7.actor_step_owner_outputs.consequence_fragment
    .state_changes[0].mode_handoff.result;
  assert.equal(modelCalls, 1);
  assert.equal(semantic.exchange.stop_reason, 'player_response');
  assert.equal(semantic.new_signal_records.length, 1);
  const persisted = await persistPhase7Consequence({ state: current,
    contracts: phase7Contracts, consequence });
  const session = persisted.snapshot.conversation_sessions.at(-1);
  assert.notEqual(session.last_contribution_ref, null);
  assert.equal(persisted.snapshot.player_response_boundary?.kind, 'conversation');
  assert.equal(persisted.snapshot.npc_decision_signals.some(({ signal }) =>
    signal.signal_id === semantic.new_signal_records[0].signal.signal_id), true);
  assert.equal(persisted.plan.appends.some(({ target_table }) =>
    target_table === 'party_conversation_contributions'), true);
});

function npcFirstSpeechPlan(request, playerId) {
  return { schema: 'conversation_contribution_plan_v1', request_id: request.request_id,
    boundary_id: request.boundary_id, conversation_id: request.conversation_id,
    exchange_id: request.exchange_id, state_version: request.state_version,
    speaker_ref: request.npc_ref, contribution_kind: 'speech',
    primary_addressee_ref: { entity_kind: 'player_character', entity_id: playerId },
    intended_addressee_refs: [{ entity_kind: 'player_character', entity_id: playerId }],
    affected_actor_refs: [], speech: { utterance_text: 'Всё ли спокойно?',
      dominant_act: 'question', interaction_tags: [], topic_refs: [], claims: [],
      response_expectation: { kind: 'none', target_refs: [] } },
    interpretation: { intent: 'начать разговор', grounded_contribution: 'вопрос',
      adaptation: 'literal' }, resolution: 'automatic',
    activity: { duration_class: 'domain_owned', effort: 'none' },
    supporting_operations: [], check: null, handoff: null, reason: 'Нужен ответ.' };
}

function conversationTemporalOwner() {
  return { advance({ request }) {
    return { result: { clock_after: request.inclusive_limit_timestamp,
      trace: { processed_boundary_ids: [], stopped_after_current_batch: false } },
    state_projection: { conversation_state:
      request.relevant_state_projection.conversation_state } };
  } };
}
