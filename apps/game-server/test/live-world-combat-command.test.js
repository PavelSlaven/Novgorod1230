import test from 'node:test';
import { loadApprovedMaterializedNpcBodyInitializationProfile } from
  '../src/runtime/combat-min-data.js';
import assert from 'node:assert/strict';
import { createTurnCommandRegistry, validateTurnModeResolution } from '@rus/turn';
import { resolveConsequenceStage } from '../../../packages/turn/src/stages/consequence.js';
import { bindTurnStepWorkflowDraft } from '../../../packages/turn/src/turn-step-workflow-draft.js';
import { liveWorldTurnRegistry } from '../src/runtime/lower-dvina-trace-phase-2.js';
import { createLiveWorldCombatCommand } from '../src/runtime/live-world-combat-command.js';

const partyId = 'party-1';
const actorId = 'player-1';

function state({ targetId = 'npc-1', bodyPersisted = false,
  anchorId = 'anchor-1', readbackPresent = true, extraNpcs = [] } = {}) {
  return {
    party_id: partyId,
    actor_id: actorId,
    position: { g5_anchor_id: 'anchor-1' },
    npcs: [{ instance_id: targetId, anchor_id: anchorId,
      body_state_persisted: bodyPersisted,
      scene_readback_present: readbackPresent }, ...extraNpcs],
    current_visible_context: { visible_npc: [{
      entity_ref: { entity_kind: 'npc', entity_id: targetId }
    }] }
  };
}

function operation(targetId = 'npc-1') {
  return { op: 'request_combat', actor_ref: actorId,
    intent_kind: 'engage', target_refs: [targetId], protected_refs: [],
    scope_ref: null, destination_ref: null, force_limit: 'ordinary',
    risk_posture: 'ordinary' };
}

function fixture(currentState, commandOptions = {}) {
  let reads = 0;
  const repository = { async loadPhase2State() { reads += 1; return currentState; } };
  const command = createLiveWorldCombatCommand({ state: state(), repository,
    partyId, idempotencyKey: 'idem-1', ...commandOptions });
  return { command, reads: () => reads };
}

test('one generic binding admits current scene NPC refs without per-actor bindings', () => {
  const { command } = fixture(state());
  assert.ok(command);
  assert.equal(command.semantic_binding.operation, 'request_combat');
  assert.equal(Object.hasOwn(command.semantic_binding, 'operation_dto'), false);
  assert.equal(Object.hasOwn(command.semantic_binding, 'operation_dtos'), false);
  const registry = createTurnCommandRegistry([command]);
  assert.equal(registry.registered().length, 1);
  assert.equal(command.semantic_binding.matches({ operation: operation() }), true);
  assert.equal(command.semantic_binding.matches({
    operation: operation('npc-outside-scene')
  }), false);
  assert.deepEqual(command.availability({ committed_state: state() }), {
    version: 1, schema: 'turn_availability_decision', status: 'blocked',
    can_attempt: false, reasons: ['combat_actor_execution_profile_required'],
    check_requests: []
  });
});

test('live-world registry ignores an unrelated scene NPC without a body row',
  async () => {
    const currentState = state({ bodyPersisted: true, extraNpcs: [{
      instance_id: 'npc-unrelated', anchor_id: 'anchor-1',
      body_state_persisted: false, scene_readback_present: true
    }] });
    assert.equal(currentState.npcs[0].scene_readback_present, true);
    const registry = await liveWorldTurnRegistry({ state: currentState,
      repository: { async loadPhase2State() { return currentState; } },
      partyId, idempotencyKey: 'idem-1',
      spatialExpansionRuntime: null, spatialLocalSceneRuntime: null });
    assert.equal(registry.registered().some(({ command_id: id }) =>
      id === 'live_world.request_combat'), true);
    assert.deepEqual(registry.stateBlocks(), [
      'current_position', 'party_state', 'relevant_npcs'
    ]);
    const modeResolution = { schema: 'turn_mode_resolution', turn_id: 'turn-1',
      selected_primary_mode: 'attention', secondary_modes: [],
      intent: { player_words_are_world_facts: false },
      resolution_plan: { subsystems: [], checks_to_run: [],
        state_blocks_to_load: registry.stateBlocks(), expected_writes: [] } };
    assert.equal(validateTurnModeResolution(modeResolution).ok, true);
    assert.deepEqual(createLiveWorldCombatCommand({ state: state(),
      repository: { async loadPhase2State() { return state(); } }, partyId,
      idempotencyKey: 'idem-1' }).mode.resolution_plan.state_blocks_to_load,
    ['party_state', 'current_position', 'relevant_npcs']);
  });

test('consequence rereads scene and returns typed gap when the target disappeared',
  async () => {
    const { command, reads } = fixture(state({ readbackPresent: false }));
    await assert.rejects(command.consequence({ semanticPlan: {
      operations: [operation()]
    } }), { code: 'combat_actor_unavailable' });
    assert.equal(reads(), 1);
  });

test('missing persisted NPC body initializes from profile then keeps execution gate closed', async () => {
  const initializationProfile = { schema:
    'rus.body_state.initialization_profile.v1', status: 'approved',
  profile_ref: { entity_ref: { entity_kind: 'body_state_profile',
    entity_id: 'combat-min-materialized-npc-default-v1' }, authoring_version: '1' },
  initial_state: { health: 100, satiety: 70, energy: 80 } };
  const current = state();
  const { command, reads } = fixture(current, {
    loadBodyInitializationProfile: async () => initializationProfile
  });
  await assert.rejects(command.consequence({ semanticPlan: {
    operations: [operation()]
  } }), { code: 'combat_actor_execution_profile_required' });
  assert.equal(reads(), 1);
});

test('body profile source gap stays scoped to the combat participant', async () => {
  const current = state({ extraNpcs: [{ instance_id: 'npc-unrelated',
    anchor_id: 'anchor-1', body_state_persisted: true,
    scene_readback_present: true }] });
  const { command } = fixture(current, {
    loadBodyInitializationProfile: () =>
      loadApprovedMaterializedNpcBodyInitializationProfile({
        readFileImpl: async () => Buffer.from('{}\n')
      })
  });
  await assert.rejects(command.consequence({ semanticPlan: {
    operations: [operation()]
  } }), { code: 'combat_actor_body_state_profile_gap' });
});

test('live-world registry registers persisted target and keeps the execution gate',
  async () => {
    const currentState = state({ bodyPersisted: true });
    const registry = await liveWorldTurnRegistry({ state: currentState,
      repository: { async loadPhase2State() { return currentState; } },
      partyId, idempotencyKey: 'idem-1', spatialExpansionRuntime: null,
      spatialLocalSceneRuntime: null });
    const command = registry.registered().find(({ command_id: id }) =>
      id === 'live_world.request_combat');
    assert.ok(command);
    assert.deepEqual(registry.stateBlocks(), [
      'current_position', 'party_state', 'relevant_npcs'
    ]);
    assert.equal(registry.stateBlocks().includes('combat_state'), false);
    await assert.rejects(command.consequence({ semanticPlan: {
      operations: [operation()]
    } }), { code: 'combat_actor_execution_profile_required' });
  });

test('persisted body without an approved generic profile remains fail-closed',
  async () => {
    const { command } = fixture(state({ bodyPersisted: true }));
    await assert.rejects(command.consequence({ semanticPlan: {
      operations: [operation()]
    } }), { code: 'combat_actor_execution_profile_required' });
  });

test('consequence stage passes the last applied player-boundary plan to combat',
  async () => {
    for (const { current, expected } of [
      { current: state(), expected: 'combat_actor_execution_profile_required' },
      { current: state({ readbackPresent: false }),
        expected: 'combat_actor_unavailable' }
    ]) {
      const { command, reads } = fixture(current);
      const registry = createTurnCommandRegistry([command]);
      const modeResolution = { command_id: command.command_id };
      bindTurnStepWorkflowDraft(modeResolution, {
        selected_command_id: command.command_id,
        loop_result: { status: 'resolved', completed_steps: [],
          clarification: null, step_traces: [{ applied: true,
            player_response_boundary: true,
            approved_plan: { operations: [operation()] } }] }
      });
      await assert.rejects(resolveConsequenceStage({ playerInput: {},
        modeResolution, retrievedState: state(), availability: {},
        checks: {}, commandRegistry: registry }), { code: expected });
      assert.equal(reads(), 1);
    }
  });

test('other consequence handlers ignore the optional semantic plan', async () => {
  const approvedPlan = { operations: [operation()] };
  const registry = createTurnCommandRegistry([{
    command_id: 'ordinary.command', option_id: 'ordinary.command',
    matches: () => false, availability: () => ({ version: 1,
      schema: 'turn_availability_decision', status: 'available',
      can_attempt: true, reasons: [], check_requests: [] }),
    async consequence(context) {
      assert.deepEqual(context.semanticPlan, approvedPlan);
      return { version: 1,
      schema: 'turn_consequence_package', status: 'resolved',
      duration_minutes: 0, visible_seed: {}, hidden_update: {},
      state_changes: [], suggested_actions: [] };
    },
    writeTargets: () => []
  }]);
  const modeResolution = { command_id: 'ordinary.command' };
  bindTurnStepWorkflowDraft(modeResolution, { selected_command_id:
    'ordinary.command', loop_result: { status: 'resolved',
      completed_steps: [], clarification: null, step_traces: [{
        applied: true, player_response_boundary: true,
        approved_plan: approvedPlan
      }] } });
  const result = await resolveConsequenceStage({ playerInput: {},
    modeResolution, retrievedState: {}, availability: {}, checks: {},
    commandRegistry: registry });
  assert.equal(result.status, 'resolved');
  assert.equal(result.duration_minutes, 0);
  assert.deepEqual(result.visible_seed, { completed_steps: [],
    clarification: null });
});
