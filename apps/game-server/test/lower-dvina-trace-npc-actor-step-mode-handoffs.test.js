import assert from 'node:assert/strict';
import test from 'node:test';
import { createLowerDvinaTraceNpcActorStepOwnerCapabilitiesFactory } from
  '../src/runtime/lower-dvina-trace-npc-actor-step-owner-capabilities.js';
import { createLowerDvinaTraceNpcActorStepModeOwnerCapabilities } from
  '../src/runtime/lower-dvina-trace-npc-actor-step-mode-handoffs.js';
import { hydrateCombatSession } from
  '../src/infrastructure/postgres/combat-session-persistence.js';
import { assertChangeSetLineage } from
  '../src/infrastructure/postgres/lower-dvina-trace-semantic-conversation-read-rows.js';
import { phase7Command, phase7CommittedState, phase7PlayerInput,
  persistPhase7Consequence } from './lower-dvina-trace-phase-7-runtime-fixture.js';
import { approvedPhase7Contracts, phase7DirectPlan } from
  './lower-dvina-trace-phase-7-contract-fixture.js';

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

for (const operation of ['request_conversation', 'request_combat']) {
  test(`Phase 7 persists ${operation} as an owner handoff without resolving the mode`, async () => {
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
        plan.operations = [{ op: operation, actor_ref: request.npc_ref,
          target_actor_refs: ['guard-1'], ...(operation === 'request_combat'
            ? { combat_intent: 'остановить нападение' }
            : { conversation_goal: 'выяснить причину тревоги' }) }];
        return plan;
      }
    }).consequence({ retrievedState: current,
      playerInput: phase7PlayerInput(current, operation) });
    const persisted = await persistPhase7Consequence({ state: current,
      contracts: phase7Contracts, consequence });
    const last = persisted.snapshot.npcs.find(({ instance_id: id }) =>
      id === 'zhdanko-1').machine_state.last_schedule_execution;
    assert.equal(last.semantic_operation.op, operation);
    assert.equal(last.exact_elapsed.exact_minutes.numerator, '0');
    if (operation === 'request_conversation') {
      const session = persisted.snapshot.conversation_sessions.at(-1);
      assert.equal(session.status, 'active');
      assert.deepEqual(session.initiator_ref,
        { entity_kind: 'npc', entity_id: 'zhdanko-1' });
      assert.deepEqual(session.active_participant_refs.map(
        ({ entity_id }) => entity_id), ['zhdanko-1', 'guard-1']);
      assert.equal(session.last_contribution_ref, null);
      const write = persisted.plan.inserts.find(({ target_table }) =>
        target_table === 'party_conversation_sessions');
      assert.equal(write.record.conversation_id, session.conversation_id);
      assert.doesNotThrow(() => assertChangeSetLineage(
        [write.record], [], [], []));
    } else {
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
    }
    assert.equal(persisted.snapshot.last_turn.turn_step_operation_batch,
      undefined);
  });
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
