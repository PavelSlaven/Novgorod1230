import assert from 'node:assert/strict';
import test from 'node:test';
import { stateModifier } from '@rus/body-state';
import { createTemporalAdvanceOwner, npcTemporalEffectRegistrations } from
  '@rus/turn/temporal-advance';
import { createTracePhase7FireRestCommand } from
  '../src/runtime/lower-dvina-trace-phase-7-command.js';
import { loadLowerDvinaTraceA1Profile } from
  '../src/internal/lower-dvina-trace-a1-profile.js';
import { createLowerDvinaTraceA1ProductionResolverFactory } from
  '../src/runtime/releases/lower-dvina-trace-a1-production.js';
import { createLowerDvinaTraceNpcActorStepOwnerCapabilitiesFactory } from
  '../src/runtime/lower-dvina-trace-npc-actor-step-owner-capabilities.js';
import { buildLowerDvinaTracePhase7Commit } from
  '../src/infrastructure/postgres/lower-dvina-trace-phase-7-commit.js';
import { createTracePhase7BodyEffect } from
  '../src/runtime/lower-dvina-trace-phase-7-effects.js';
import { lowerDvinaTracePhase7TemporalEffectRegistrations } from
  '../src/runtime/lower-dvina-trace-phase-7-temporal-effect-owner.js';
import { approvedPhase7Contracts, phase7AutonomousPlan,
  phase7GenericCheckPlan } from
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
              summary: 'registered owner', duration_minutes: entry.owner_duration };
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
        .exact_minutes.numerator, String(entry.expected_elapsed));
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

test('Phase 7 composes checked production A1 outcome and semantic time once',
  async () => {
    const operation = genericOwners()[1];
    for (const [roll, changed] of [[0.95, true], [0, false]]) {
      let rngCalls = 0;
      const state = detached(phase7CommittedState());
      state.container_placements = [{ party_id: state.party_id,
        container_id: 'road-bag-1', anchor_id: null, parent_container_id: null,
        holder_npc_id: 'zhdanko-1', holder_character_id: null,
        physical_position: 'worn', equipment_slot_category_id: null }];
      state.container_profiles = [{
        template_id: 'trace_ld_v1_container_road_bag', capacity: 4,
        packing_slot_cost: 1, carry_form: 'regular', mass_grams: 500,
        external_hand_cost: 0
      }];
      state.player_profile = { attributes: { strength: { value: 10 } } };
      const rows = a1Rows();
      state.items.push(...detached(rows));
      state.npcs.find(({ instance_id }) => instance_id === 'zhdanko-1')
        .perception_snapshot = { visible_objects: rows.map(({ item_id }) => ({
          entity_ref: { entity_id: item_id }, source_perception_ref: `p:${item_id}`
        })) };
      const contracts = approvedPhase7Contracts(state);
      contracts.npcSemanticProfile = n1Profile();
      contracts.genericCheckContext.attributes.push({ attribute_ref: 'strength',
        label: 'сила', value: 10 });
      const loadedA1Profile = await loadLowerDvinaTraceA1Profile();
      const npcActorStep = createLowerDvinaTraceNpcActorStepOwnerCapabilitiesFactory({
        createActionProductionOwner: createLowerDvinaTraceA1ProductionResolverFactory({
          pool: a1Pool(state, rows), loadedProfile: loadedA1Profile
        })
      });
      const npcOwnerCapabilities = await npcActorStep({ partyId: state.party_id,
        requestId: 'phase7-generic-owner-request', inputDigest: 'a'.repeat(64),
        state, phase7Contracts: contracts });
      const actionCapability = npcOwnerCapabilities.find(({ operation: name }) =>
        name === 'request_item_use');
      const projectedA1 = actionCapability?.capability.action_production;
      assert.deepEqual(projectedA1.source_refs,
        ['npc-source-twig', 'npc-tool-knife']);
      assert.deepEqual(projectedA1.tool_refs,
        ['npc-source-twig', 'npc-tool-knife']);
      assert.deepEqual(projectedA1.independent_output_source_groups,
        [['npc-source-twig', 'npc-tool-knife']]);
      assert.equal(projectedA1.max_new_entities, 4);
      assert.deepEqual(projectedA1.allowed_identity_modes,
        loadedA1Profile.profile.allowed_identity_modes);
      const consequence = await run({ state, contracts, randomSource: {
        next() { rngCalls += 1; return roll; }
      }, genericCheckContextOwner: checkContext(contracts),
      npcOwnerCapabilities,
      model: async (request) => {
        assert.deepEqual(request.decision_scope.operation_contract.request_item_use
          .alternatives[1].action_production, actionCapability.capability.action_production);
        return checkedA1Plan(request, operation.makeOperation(request.npc_ref));
      } });
      const phase7 = consequence.phase7;
      assert.equal(rngCalls, 1);
      assert.equal(phase7.actor_step_check.result.outcome.band,
        changed ? 'clean_success' : 'failure_with_consequence');
      assert.equal(phase7.actor_step.semantic_operation.op,
        changed ? 'request_item_use' : 'apply_semantic_activity');
      assert.equal(phase7.actor_step.additional_semantic_operations?.length ?? 0,
        changed ? 1 : 0);
      assert.equal(phase7.actor_step.exact_elapsed.exact_minutes.numerator, '1');
      assert.equal(phase7.actor_step_owner_outputs.action_production_atomic_write_plans.length,
        changed ? 1 : 0);
      assert.equal(phase7.actor_step_owner_outputs.write_fragments.length, 0);
      const committed = await commitA1({ state, contracts, consequence });
      assert.equal(Object.hasOwn(committed.plan,
        'action_production_atomic_write_plans'), changed);
      assert.equal(committed.plan.action_production_atomic_write_plans?.length ?? 0,
        changed ? 1 : 0);
      if (!changed) assert.equal([
        ...committed.plan.inserts, ...committed.plan.updates,
        ...committed.plan.appends
      ]
        .some(({ target_table }) => target_table === 'party_items'
          || target_table === 'party_item_placements'), false);
      if (changed) assert.equal(committed.plan.action_production_atomic_write_plans[0]
        .source_updates[0].item_id, 'npc-source-twig');
      if (changed) {
        const tampered = detached(consequence);
        tampered.phase7.actor_step_check.result.outcome.band = 'failure_with_consequence';
        await assert.rejects(() => commitA1({ state, contracts, consequence: tampered }),
          { code: 'TRACE_PHASE_7_OWNER_RESULT_INVALID' });
      }
    }
  });

test('Phase 7 checked A1 preflights owner before RNG', async () => {
  const state = phase7CommittedState();
  state.items.push({ item_id: 'npc-current-resource' });
  const contracts = approvedPhase7Contracts(state);
  let preflight = 0;
  let rng = 0;
  const capability = genericOwners()[1];
  await assert.rejects(() => run({ state, contracts, randomSource: {
    next() { rng += 1; return 0.95; }
  }, genericCheckContextOwner: checkContext(contracts),
  npcOwnerCapabilities: [{ ...capability,
    preflight: async () => {
      preflight += 1;
      throw Object.assign(new Error('denied'), { code: 'TRACE_A1_PREFLIGHT_DENIED' });
    },
    execute: async ({ working_projection }) => ({ working_projection,
      summary: 'unexpected A1 execution' })
  }], model: async (request) => checkedA1Plan(request,
    capability.makeOperation(request.npc_ref)) }),
  { code: 'TRACE_A1_PREFLIGHT_DENIED' });
  assert.deepEqual({ preflight, rng }, { preflight: 1, rng: 0 });
});

function genericOwners() {
  return [{ operation: 'request_discovery', activity_owner: 'domain',
    owner_duration: 3, expected_elapsed: 3,
    capability: { owner: '@rus/ordinary-materialization', allowed: [{
      discovery_kinds: ['inspect'], target_refs: ['npc-observed-tarp']
    }] }, supports: ({ operation }) => operation.op === 'request_discovery',
    makeOperation: (actor_ref) => ({ op: 'request_discovery', actor_ref,
      discovery_kind: 'inspect', target_refs: ['npc-observed-tarp'],
      query: 'осмотреть навес' }) },
  { operation: 'request_item_use', activity_owner: 'semantic',
    owner_duration: 0, expected_elapsed: 1,
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

function a1Rows() {
  return ['npc-source-twig', 'npc-tool-knife'].map((item_id) => ({
    item_id, run_id: null, template_id: null, profile_id: null, category_id: null,
    quantity: 1, condition_state: 'serviceable', legal_status: 'owned',
    state_version: 1, anchor_id: null, container_id: null,
    holder_npc_id: 'zhdanko-1', holder_character_id: null,
    physical_position: 'hands', equipment_slot_category_id: null,
    placement: { holder_npc_id: 'zhdanko-1', holder_character_id: null,
      container_id: null, physical_position: 'hands' },
    attached_item_id: null, scene_position_id: null,
    scene_occupies_capacity_units: null, scene_state_version: null,
    ownership_id: `ownership:${item_id}`, owner_npc_id: 'zhdanko-1',
    owner_character_id: null, owner_party: false, controller_npc_id: 'zhdanko-1',
    controller_character_id: null, claim_state: 'owned', state: {
      lifecycle_status: 'active', runtime_instance_mechanics_snapshot: {
        schema: 'rus.items.runtime_instance_mechanics_snapshot.v1', version: 1,
        provenance: { source_kind: 'ordinary_direct_action_result',
          root_turn_id: 'turn:source', step_index: 1, operation_ref: 'source',
          origin_kind: 'crafted', source_refs: ['npc-source-twig'] },
        mechanics: { mass_grams: 100, external_hand_cost: 1,
          carry_form: 'regular', packing_slot_cost: 1, quantity: null,
          container: null }
      }
    }
  })).map((row) => ({ ...row,
    runtime_instance_mechanics_snapshot: structuredClone(
      row.state.runtime_instance_mechanics_snapshot) }));
}

async function commitA1({ state, contracts, consequence }) {
  const time_update = { clock_before: state.clock,
    clock_after: consequence.phase7.schedule_temporal.result.clock_after,
    exact_elapsed: { exact_minutes: { numerator: '30', denominator: '1' } } };
  const body_update = createTracePhase7BodyEffect({ contracts,
    fallback: { apply() { throw new Error('unexpected fallback'); } }
  }).apply({ committed_state: state, consequence, time_update });
  return buildLowerDvinaTracePhase7Commit({ partyId: state.party_id,
    factual: { player_input: phase7PlayerInput(state, 'generic-owner'),
      mode_resolution: { option_id: 'rest_by_fire_and_dry_clothing',
        turn_id: consequence.phase7.autonomous.request.root_turn_id,
        decision_trace: { state_version: state.party_state.state_version,
          action_set_digest: 'action-set' } }, consequence, time_update, body_update },
    state, inputDigest: 'a'.repeat(64), visibleContext: { visible_scene: 'ok',
      visible_changes: [], sensory_details: [], visible_npc: [], visible_objects: [],
      known_context: [], uncertainties: [] }, phase7Contracts: contracts });
}

function detached(value) {
  return JSON.parse(JSON.stringify(value));
}

function a1Pool(state, rows) {
  return { query: async (sql, parameters = []) => {
    if (sql.includes('FROM party_runtime.parties')) {
      return { rows: [{ state_version: state.party_state.state_version }] };
    }
    if (sql.includes('FROM party_runtime.party_positions')
        || sql.includes('FROM party_runtime.party_journey_locations')) return { rows: [] };
    if (sql.includes('FROM party_runtime.party_items i')) return { rows: rows.filter(
      ({ item_id }) => parameters[1].includes(item_id)) };
    if (sql.includes('FROM party_runtime.party_resource_nodes')
        || sql.includes('FROM party_runtime.party_containers')) return { rows: [] };
    throw new Error(`Unexpected A1 query: ${sql}`);
  } };
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

async function run({ state, contracts, npcOwnerCapabilities, model,
  randomSource = undefined, genericCheckContextOwner = undefined }) {
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
    } }, genericCheckContextOwner, temporalAdvanceOwner: createTemporalAdvanceOwner({
      effect_registrations: [...npcTemporalEffectRegistrations(),
        ...lowerDvinaTracePhase7TemporalEffectRegistrations()] }),
    revalidateStateVersion: async () => state.party_state.state_version,
    randomSource
  });
  return command.consequence({ retrievedState: state,
    playerInput: phase7PlayerInput(state, 'generic-owner'),
    rootTurnId: `turn:${state.party_id}:${state.party_state.turn_number + 1}` });
}

function checkContext(contracts) {
  return { resolve({ check, actor }) {
    const policy = contracts.genericCheckModifierPolicy;
    return { attribute_value: actor.attributes[check.attribute_ref].value,
      skill_bonus: actor.skills[check.skill_ref].bonus,
      state_modifier: stateModifier(actor.body,
        policy.state_relevance_by_attribute[check.attribute_ref]),
      equipment_modifier: policy.load_category_modifiers.moderate,
      circumstance_modifier: 0,
      policy_profile_ref: policy.profile_ref,
      policy_profile_pin: structuredClone(policy.profile_pin),
      check_policy_ref: structuredClone(policy.check_policy_ref),
      consequence_policy_ref: structuredClone(policy.consequence_policy_ref) };
  } };
}

function checkedA1Plan(request, operation) {
  const plan = phase7GenericCheckPlan(request);
  for (const [band, outcome] of Object.entries(plan.check.outcomes)) {
    outcome.operations = band === 'clean_success' ? [operation] : [];
  }
  return plan;
}

function n1Profile() {
  return { profile_id: 'lower_dvina_trace_npc_actor_step_profile_v1',
    revision: 1, status: 'approved', activation_boundary: { phase: 'phase_7',
      npc_participant_slot_ref: 'zhdanko_storehouse_controller' },
    actor_mechanics_context: { attributes: [{ attribute_ref: 'strength',
      label: 'сила', value: 10 }] } };
}
