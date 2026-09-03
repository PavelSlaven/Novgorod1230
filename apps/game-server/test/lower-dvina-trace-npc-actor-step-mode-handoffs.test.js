import assert from 'node:assert/strict';
import test from 'node:test';
import { createTemporalAdvanceOwner, npcTemporalEffectRegistrations } from
  '@rus/turn/temporal-advance';
import { createLowerDvinaTraceNpcActorStepOwnerCapabilitiesFactory,
  projectTracePhase7CurrentBoundaryState } from
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
import { lowerDvinaTraceConversationTemporalEffectRegistrations } from
  '../src/runtime/lower-dvina-trace-m2-conversation-temporal-effect-owner.js';
import { lowerDvinaTracePhase7TemporalEffectRegistrations } from
  '../src/runtime/lower-dvina-trace-phase-7-temporal-effect-owner.js';

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

test('Phase 7 boundary projection replaces consumed temporal candidates', () => {
  const current = projectTracePhase7CurrentBoundaryState({ state: {
    ...state, temporal_boundary_candidates: [{ boundary_id: 'consumed' }]
  }, workingProjection: { clock: { whole_minutes: '125',
    subminute_numerator: '0', subminute_denominator: '1' },
  temporal_boundary_candidates: [{ boundary_id: 'next' }],
  active_npc_actor_steps: [{ npc_ref: 'npc-1', status: 'started' }] } });
  assert.equal(current.clock.whole_minutes, '125');
  assert.deepEqual(current.temporal_boundary_candidates, [{ boundary_id: 'next' }]);
  assert.equal(current.temporal_boundary_candidates.some(
    ({ boundary_id: id }) => id === 'consumed'), false);
  assert.deepEqual(current.active_npc_actor_steps,
    [{ npc_ref: 'npc-1', status: 'started' }]);
});

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
    }, { operation: 'emit_interaction', capability: { owner: '@rus/interaction',
      interaction_contract: {
        content_semantics: 'nonverbal_observable_action_only',
        speech_operation: 'request_conversation'
      } },
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
  const interaction = capabilities.find(({ operation }) =>
    operation === 'emit_interaction');
  assert.deepEqual(interaction.capability.interaction_contract, {
    content_semantics: 'nonverbal_observable_action_only',
    speech_operation: 'request_conversation'
  });
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
  const interaction = capabilities.find(({ operation }) =>
    operation === 'emit_interaction');
  assert.deepEqual(conversation.capability.target_actor_refs,
    ['visible-1', 'visible-2']);
  assert.deepEqual(interaction.capability.interaction_contract, {
    content_semantics: 'nonverbal_observable_action_only',
    speech_operation: 'request_conversation'
  });
  assert.equal(combat, undefined);
  assert.equal(JSON.stringify(capabilities).includes('remote-1'), false);
});

test('Phase 7 initializes an approved NPC combat handoff before player response', async () => {
  const current = phase7CommittedState();
  const speaker = current.npcs.find(({ instance_id: id }) => id === 'zhdanko-1');
  speaker.machine_state.location_ref = current.position.location_ref;
  speaker.machine_state.spatial_zone_ref = current.position.zone_ref;
  speaker.perception_snapshot = { present_actors: [{ actor_ref: 'mikula',
    source_event_ref: { entity_kind: 'event', entity_id: 'seen:player' } }] };
  const phase7Contracts = approvedPhase7Contracts(current);
  phase7Contracts.campLocationRef = 'trace_ld_v1_loc_zhdanko_storehouse';
  phase7Contracts.npcSemanticProfile = contracts.npcSemanticProfile;
  const factory = createLowerDvinaTraceNpcActorStepOwnerCapabilitiesFactory({
    createModeOwnerCapabilities: createLowerDvinaTraceNpcActorStepModeOwnerCapabilities
  });
  const consequence = await phase7Command({ state: current,
    contracts: phase7Contracts,
    createBoundaryNpcOwnerCapabilities: (boundary) => factory({
      partyId: current.party_id, requestId: 'mode-handoff', inputDigest: 'd',
      phase7Contracts, bundle: approvedCombatBundle(),
      npcCombatModel: approvedNpcCombatModel, revalidateStateVersion: async () => 7,
      ...boundary }),
    model: async (request) => {
      const plan = phase7DirectPlan(request);
      plan.resolution = 'domain_request';
      plan.activity = { owner: 'domain', duration_class: null, effort: null };
      plan.operations = [{ op: 'request_combat', actor_ref: request.npc_ref,
        target_actor_refs: ['mikula'], combat_intent: 'остановить нападение' }];
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
  assert.equal(session.status, 'paused_for_player');
  assert.equal(session.player_response_required, true);
  assert.equal(session.exchange_ordinal, 0);
  assert.equal(session.last_exchange_ref, null);
  assert.equal(session.participant_states.find(({ actor_ref: ref }) =>
    ref.entity_id === 'zhdanko-1').current_intent.intent_kind, 'engage');
  assert.equal(persisted.snapshot.player_response_boundary?.kind, 'combat');
  assert.equal(persisted.snapshot.combat_history, undefined);
  const write = persisted.plan.inserts.find(({ target_table }) =>
    target_table === 'party_combat_sessions');
  assert.deepEqual(hydrateCombatSession(write.record), session);
  assert.equal(persisted.snapshot.last_turn.turn_step_operation_batch,
    undefined);
});

const approvedNpcCombatModel = async (request) => ({
  schema: 'npc_combat_intent_plan_v1', request_id: request.request_id,
  boundary_id: request.boundary_id, state_version: request.state_version,
  combat_id: request.combat_id, npc_ref: request.npc_ref,
  decision: { intent_summary: 'Остановить противника.',
    grounded_goal: 'Удержать игрока на расстоянии.', adaptation: 'literal' },
  operation: { op: 'set_combat_intent', intent_kind: 'engage',
    target_refs: [{ entity_kind: 'player_character', entity_id: 'mikula' }],
    protected_refs: [], scope_ref: null, destination_ref: null,
    force_limit: 'ordinary', risk_posture: 'ordinary' },
  combat_statement: null, reason: 'Непосредственная угроза.'
});

function approvedCombatBundle() {
  return { combat_semantic_bindings: { phase_4: null, phase_8: {
    actor_slot: 'zhdanko_storehouse_controller',
    scope_location_ref: 'trace_ld_v1_loc_fishing_camp',
    signal_descriptor: { category: 'objective', significance: 'material',
      perception_required: false },
    operation_contract: { allowed_intent_kinds: ['engage'],
      allowed_force_limits: ['ordinary'], allowed_risk_postures: ['ordinary'],
      surrender_available: false, cease_hostility_available: false,
      combat_statement_available: false }
  } } };
}

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

test('NPC-first conversation composes Phase 7 parent time once', async () => {
  const current = phase7CommittedState();
  const speaker = current.npcs.find(({ instance_id }) => instance_id === 'zhdanko-1');
  Object.assign(speaker, { ref: { entity_kind: 'npc', entity_id: 'zhdanko-1' },
    knowledge_profile_snapshot: {}, knowledge_records: [], semantic_state: {},
    perception_snapshot: { present_actors: [{ actor_ref: 'mikula',
      source_event_ref: { entity_kind: 'event', entity_id: 'seen:player' } }] },
    machine_state: { ...speaker.machine_state, speech_capability: 'full' } });
  const phase7Contracts = approvedPhase7Contracts(current);
  phase7Contracts.npcSemanticProfile = contracts.npcSemanticProfile;
  const calls = [];
  const owner = createTemporalAdvanceOwner({ effect_registrations: [
    ...npcTemporalEffectRegistrations(),
    ...lowerDvinaTracePhase7TemporalEffectRegistrations(),
    ...lowerDvinaTraceConversationTemporalEffectRegistrations()
  ] });
  const temporalAdvanceOwner = { advance(input) {
    calls.push(input);
    return owner.advance(input);
  } };
  const consequence = await phase7Command({ state: current,
    contracts: phase7Contracts,
    conversationBindings: { fallback_policy: 'forbidden',
      legacy_bounded_production_path: 'forbidden', max_contributions_per_exchange: 1 },
    conversationActivity: { profile_id: 'approved-talk', duration_minutes: 5 },
    temporalAdvanceOwner,
    createBoundaryNpcOwnerCapabilities: (boundary) =>
      createLowerDvinaTraceNpcActorStepOwnerCapabilitiesFactory({
        createModeOwnerCapabilities: createLowerDvinaTraceNpcActorStepModeOwnerCapabilities
      })({ partyId: current.party_id, requestId: 'conversation-parent',
        inputDigest: 'd', phase7Contracts, ...boundary }),
    runNpcConversationExchange: (input) => runLowerDvinaTraceNpcConversationExchange({
      ...input, npcSemanticModel: async (request) =>
        npcFirstSpeechPlan(request, 'mikula'),
      revalidateStateVersion: async () => 7, temporalAdvanceOwner }),
    model: async (request) => {
      const plan = phase7DirectPlan(request);
      plan.resolution = 'domain_request';
      plan.activity = { owner: 'domain', duration_class: null, effort: null };
      plan.operations = [{ op: 'request_conversation', actor_ref: request.npc_ref,
        target_actor_refs: ['mikula'], conversation_goal: 'предупредить' }];
      return plan;
    }
  }).consequence({ retrievedState: current,
    playerInput: phase7PlayerInput(current, 'conversation-parent') });
  const conversationCall = calls.find(({ engine_version: version }) =>
    version === 'lower-dvina-trace-conversation-temporal-adapter-v1');
  assert.equal(conversationCall.request.clock_before.whole_minutes, '125');
  assert.equal(conversationCall.registered_effects.length, 1);
  assert.equal(conversationCall.continuous_effects.length, 2);
  assert.equal(calls.filter(({ engine_version: version }) =>
    version === 'lower-dvina-trace-phase-7-temporal-adapter-v1').length, 1);
  assert.equal(consequence.phase7.schedule_temporal.result.clock_after.whole_minutes,
    '130');
  assert.equal(consequence.phase7.schedule_execution.status, 'executed');
  assert.equal(consequence.phase7.schedule_temporal.projection
    .active_npc_actor_steps.filter(({ npc_ref: ref }) => ref === 'zhdanko-1').length, 1);
  const persisted = await persistPhase7Consequence({ state: current,
    contracts: phase7Contracts, consequence });
  assert.equal(persisted.snapshot.clock.whole_minutes, '130');
  assert.equal(persisted.snapshot.active_npc_actor_steps[0].status, 'completed');
});

test('NPC-first conversation keeps selected NPC scope and receives its reply', async () => {
  const current = phase7CommittedState();
  current.position.g5_anchor_id = 'storehouse';
  const zhdanko = current.npcs.find(({ instance_id }) => instance_id === 'zhdanko-1');
  Object.assign(zhdanko, { anchor_id: 'storehouse', ref: { entity_kind: 'npc', entity_id: 'zhdanko-1' },
    identity_state: { canonical_name: 'Жданко' }, knowledge_profile_snapshot: {},
    knowledge_records: [], semantic_state: {}, machine_state: {
      ...zhdanko.machine_state, speech_capability: 'full' } });
  current.npcs.push({ instance_id: 'guard-1', ref: { entity_kind: 'npc',
    entity_id: 'guard-1' }, identity_state: { canonical_name: 'Страж' },
    knowledge_profile_snapshot: {}, knowledge_records: [], semantic_state: {},
    anchor_id: 'storehouse', machine_state: { speech_capability: 'full' } }, { instance_id: 'remote-1',
    ref: { entity_kind: 'npc', entity_id: 'remote-1' }, identity_state: {
      canonical_name: 'Дальний' }, knowledge_profile_snapshot: {},
    knowledge_records: [], semantic_state: {}, machine_state: {
      speech_capability: 'full' } });
  const modelRequests = [];
  const result = await runLowerDvinaTraceNpcConversationExchange({ state: current,
    npc: zhdanko, operation: { op: 'request_conversation', actor_ref: 'zhdanko-1',
      target_actor_refs: ['guard-1'], conversation_goal: 'предупредить' },
    actor_step_request: { request_id: 'npc-to-npc' }, conversation_bindings: {
      fallback_policy: 'forbidden', legacy_bounded_production_path: 'forbidden',
      max_contributions_per_exchange: 2 }, conversation_activity: {
      profile_id: 'approved-talk', duration_minutes: 5 },
    revalidateStateVersion: async () => 7,
    temporalAdvanceOwner: conversationTemporalOwner(), npcSemanticModel: async (request) => {
      modelRequests.push(request);
      const plan = npcFirstSpeechPlan(request,
        request.npc_ref.entity_id === 'zhdanko-1' ? 'guard-1' : 'zhdanko-1', 'npc');
      if (request.npc_ref.entity_id === 'zhdanko-1') {
        plan.speech.response_expectation = { kind: 'answer', target_refs: [
          { entity_kind: 'npc', entity_id: 'guard-1' }
        ] };
      }
      return plan;
    } });
  assert.equal(modelRequests.length, 2);
  assert.deepEqual(result.exchange.working_state.active_participant_refs, [
    { entity_kind: 'npc', entity_id: 'guard-1' },
    { entity_kind: 'npc', entity_id: 'zhdanko-1' }
  ]);
  assert.equal(result.exchange.stop_reason, 'exchange_limit');
});

function npcFirstSpeechPlan(request, playerId, entityKind = 'player_character') {
  return { schema: 'conversation_contribution_plan_v1', request_id: request.request_id,
    boundary_id: request.boundary_id, conversation_id: request.conversation_id,
    exchange_id: request.exchange_id, state_version: request.state_version,
    speaker_ref: request.npc_ref, contribution_kind: 'speech',
    primary_addressee_ref: { entity_kind: entityKind, entity_id: playerId },
    intended_addressee_refs: [{ entity_kind: entityKind, entity_id: playerId }],
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
    state_projection: { ...request.relevant_state_projection,
      conversation_state: request.relevant_state_projection.conversation_state } };
  } };
}
