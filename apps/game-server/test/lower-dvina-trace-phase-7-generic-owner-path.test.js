import assert from 'node:assert/strict';
import test from 'node:test';
import { createTemporalAdvanceOwner, npcTemporalEffectRegistrations } from
  '@rus/turn/temporal-advance';
import { createTracePhase7FireRestCommand } from
  '../src/runtime/lower-dvina-trace-phase-7-command.js';
import { lowerDvinaTracePhase7TemporalEffectRegistrations } from
  '../src/runtime/lower-dvina-trace-phase-7-temporal-effect-owner.js';
import { approvedPhase7Contracts, phase7AutonomousPlan } from
  './lower-dvina-trace-phase-7-contract-fixture.js';
import { phase7CommittedState, phase7PlayerInput } from
  './lower-dvina-trace-phase-7-runtime-fixture.js';

test('Phase 7 routes generic O1 and A1 owners through one actor-step path',
  async () => {
    for (const entry of genericOwners()) {
      const state = phase7CommittedState();
      state.items.push({ item_id: 'npc-current-resource' },
        { item_id: 'npc-source-twig', holder_npc_id: 'zhdanko-1' },
        { item_id: 'npc-tool-knife', holder_npc_id: 'zhdanko-1' });
      state.npcs.find(({ instance_id }) => instance_id === 'zhdanko-1')
        .perception_snapshot = { visible_objects: [{
          entity_ref: { entity_id: 'npc-observed-tarp' },
          source_perception_ref: 'perception:tarp'
        }] };
      const contracts = approvedPhase7Contracts(state);
      const calls = { model: 0, owner: [] };
      const consequence = await run({ state, contracts,
        npcOwnerCapabilities: [{ ...entry, isApplicable: ({ state }) =>
          state.items.some(({ item_id }) => item_id === 'npc-current-resource'),
          execute: async (execution) => {
            calls.owner.push(execution);
            return { working_projection: execution.working_projection,
              summary: 'registered owner', duration_minutes: 3 };
          } }],
        model: async (request) => {
          calls.model += 1;
          const operation = entry.makeOperation(request.npc_ref);
          assert.equal(Object.hasOwn(request.decision_scope.operation_contract,
            operation.op), true);
          return domainPlan(request, operation, entry.activity_owner);
        }
      });
      assert.equal(calls.model, 1);
      assert.equal(calls.owner.length, 1);
      assert.equal(calls.owner[0].plan.schema, 'npc_step_plan_v1');
      assert.equal(calls.owner[0].request.player_safe_state, undefined);
      assert.equal(consequence.phase7.actor_step.semantic_operation.op,
        entry.makeOperation('zhdanko-1').op);
      assert.equal(consequence.phase7.actor_step.exact_elapsed
        .exact_minutes.numerator, '3');
      assert.deepEqual(consequence.phase7.actor_step_owner_outputs, {
        write_fragments: [], consequence_fragment: null,
        ordinary_materialization_atomic_write_plan: null,
        action_production_atomic_write_plans: [],
        local_fire_atomic_write_plans: [],
        spatial_semantic_atomic_write_plan: null
      });
    }

    const state = phase7CommittedState();
    const contracts = approvedPhase7Contracts(state);
    let contract;
    await run({ state, contracts, npcOwnerCapabilities: [{
      ...genericOwners()[0], isApplicable: ({ state }) =>
        state.items.some(({ item_id }) => item_id === 'npc-current-resource'),
      execute: async () => { throw new Error('unavailable owner ran'); }
    }], model: async (request) => {
      contract = request.decision_scope.operation_contract;
      return phase7AutonomousPlan(request, 'wait');
    } });
    assert.equal(Object.hasOwn(contract, 'request_discovery'), false);
  });

test('Phase 7 rejects invalid registered owner time and unavailable owner operation',
  async () => {
    const state = phase7CommittedState();
    state.items.push({ item_id: 'npc-current-resource' });
    const contracts = approvedPhase7Contracts(state);
    await assert.rejects(() => run({ state, contracts, npcOwnerCapabilities: [{
      ...genericOwners()[0], isApplicable: () => true,
      execute: async (execution) => ({
        working_projection: execution.working_projection,
        summary: 'registered owner', duration_minutes: -1
      })
    }], model: async (request) => domainPlan(request,
      genericOwners()[0].makeOperation(request.npc_ref), 'domain') }),
    { code: 'TRACE_PHASE_7_OWNER_TIME_INVALID' });

    await assert.rejects(() => run({ state, contracts, npcOwnerCapabilities: [{
      ...genericOwners()[0], isApplicable: () => false,
      execute: async () => assert.fail('unavailable owner ran')
    }], model: async (request) => domainPlan(request,
      genericOwners()[0].makeOperation(request.npc_ref), 'domain') }),
    { code: 'TURN_NPC_PLAN_INVALID' });
});

test('Phase 7 completes an instant registered owner at its decision boundary',
  async () => {
    const state = phase7CommittedState();
    state.items.push({ item_id: 'npc-current-resource' });
    const contracts = approvedPhase7Contracts(state);
    const consequence = await run({ state, contracts, npcOwnerCapabilities: [{
      ...genericOwners()[0], isApplicable: () => true,
      execute: async (execution) => ({
        working_projection: execution.working_projection,
        summary: 'instant registered owner'
      })
    }], model: async (request) => domainPlan(request,
      genericOwners()[0].makeOperation(request.npc_ref), 'domain') });
    assert.equal(consequence.phase7.actor_step.exact_elapsed
      .exact_minutes.numerator, '0');
    assert.equal(consequence.phase7.schedule_execution.status, 'executed');
    assert.deepEqual(consequence.phase7.schedule_execution.clock_after,
      consequence.phase7.temporal.result.clock_after);
  });

function genericOwners() {
  return [{ operation: 'request_discovery', activity_owner: 'domain',
    capability: { owner: '@rus/ordinary-materialization', allowed: [{
      discovery_kinds: ['inspect'], target_refs: ['npc-observed-tarp']
    }] }, supports: ({ operation }) => operation.op === 'request_discovery',
    makeOperation: (actor_ref) => ({ op: 'request_discovery', actor_ref,
      discovery_kind: 'inspect', target_refs: ['npc-observed-tarp'],
      query: 'осмотреть навес' }) },
  { operation: 'request_item_use', activity_owner: 'domain',
    capability: { owner: '@rus/items-property',
      item_refs: ['npc-source-twig', 'npc-tool-knife'], use_kinds: ['other'],
      action_production: { source_refs: ['npc-source-twig', 'npc-tool-knife'],
        tool_refs: ['npc-source-twig', 'npc-tool-knife'] } },
    supports: ({ operation }) => operation.op === 'request_item_use',
    makeOperation: (actor_ref) => ({ op: 'request_item_use', actor_ref,
      item_ref: 'npc-source-twig', use_kind: 'other',
      target_refs: ['npc-tool-knife'], action_production: {
        source_refs: ['npc-source-twig'], tool_refs: ['npc-tool-knife'],
        requested_output_count: null, identity_mode: 'preserve_source',
        origin: null, result_class: 'ordinary_physical_result',
        material_extent: null, output_class: 'ordinary_mundane',
        result_descriptor: { display_name: null, physical_description: 'срез',
          qualitative_facts: [], removed_physical_fact_refs: [],
          inscription_text: null, physical_form: 'regular',
          source_fact_delta: null } } }) }];
}

function domainPlan(request, operation, owner) {
  return { schema: 'npc_step_plan_v1', request_id: request.request_id,
    root_turn_id: request.root_turn_id, boundary_id: request.boundary_id,
    committed_state_version: request.committed_state_version,
    working_revision: request.working_revision,
    decision_index: request.decision_index, npc_ref: request.npc_ref,
    interpretation: { npc_goal: 'проверить доступное',
      grounded_attempt: 'выполнить доступное действие', adaptation: 'literal' },
    resolution: 'domain_request', goal_result: 'pending',
    activity: owner === 'semantic'
      ? { owner, duration_class: 'moment', effort: 'none' }
      : { owner, duration_class: null, effort: null },
    operations: [operation], check: null, reason_code: 'generic_owner',
    reason: 'Действие проходит через зарегистрированного владельца.' };
}

async function run({ state, contracts, npcOwnerCapabilities, model }) {
  const command = createTracePhase7FireRestCommand({
    contracts, inputDigest: 'a'.repeat(64), npcAutonomousModel: model,
    npcOwnerCapabilities, semanticActivityScheduleOwner: { resolve({ activity }) {
      const profile = contracts.semanticActivityProfiles.find((candidate) =>
        candidate.duration_class === activity.duration_class
          && candidate.effort === activity.effort);
      return { profile_ref: profile.profile_ref,
        profile_pin: structuredClone(profile.profile_pin),
        duration_class: profile.duration_class, effort: profile.effort,
        duration_minutes: profile.duration_minutes };
    } }, temporalAdvanceOwner: createTemporalAdvanceOwner({
      effect_registrations: [...npcTemporalEffectRegistrations(),
        ...lowerDvinaTracePhase7TemporalEffectRegistrations()] }),
    revalidateStateVersion: async () => state.party_state.state_version
  });
  return command.consequence({ retrievedState: state,
    playerInput: phase7PlayerInput(state, 'generic-owner'),
    rootTurnId: `turn:${state.party_id}:${state.party_state.turn_number + 1}` });
}
