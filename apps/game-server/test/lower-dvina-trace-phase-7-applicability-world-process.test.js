import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createTemporalAdvanceOwner, npcTemporalEffectRegistrations } from
  '@rus/turn/temporal-advance';
import {
  phase7AutonomousPlan,
  phase7DirectPlan,
  phase7GenericCheckPlan,
  approvedPhase7Contracts
} from './lower-dvina-trace-phase-7-contract-fixture.js';
import {
  phase7Command,
  phase7CommittedState,
  phase7PlayerInput,
  persistPhase7Consequence
} from './lower-dvina-trace-phase-7-runtime-fixture.js';
import { createLowerDvinaTraceTurnStepGenericOwners } from
  '../src/runtime/lower-dvina-trace-turn-step-generic-owners.js';
import { projectLowerDvinaTraceF1NpcCapability } from
  '../src/runtime/releases/lower-dvina-trace-f1-production.js';
import { createLocalFireAtomicWritePlan } from
  '../src/infrastructure/postgres/local-fire-atomic-write-plan.js';
import { applyLocalFireTemporalProjection,
  lowerDvinaTraceLocalFireTemporalRegistration } from
  '../src/runtime/lower-dvina-trace-local-fire-temporal.js';
import { lowerDvinaTraceTemporalSourceRegistrations } from
  '../src/runtime/lower-dvina-trace-phase-6-temporal-source.js';
import { lowerDvinaTracePhase7TemporalEffectRegistrations } from
  '../src/runtime/lower-dvina-trace-phase-7-temporal-effect-owner.js';

const ownerProfilesUrl = new URL(
  '../../../data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-m1-content/turn-step-owner-profiles.json',
  import.meta.url
);

test('Phase 7 F1 capability',async()=>{
    const state=phase7CommittedState();
    state.items.push(npcFireItem('npc-kindling', 'fuel'),
      npcFireItem('npc-firesteel', 'ignition'));
    const contracts=approvedPhase7Contracts(state);
    assert.notEqual(projectLowerDvinaTraceF1NpcCapability({
      committedState: state, npcSnapshot: contracts.zhdanko,
      loadedProfile: loadedFireProfile(), resolverAvailable: true
    }), null);
    let localPlan=null,ownerCalls=0;
    const temporalOwner=createTemporalAdvanceOwner({source_registrations:
      lowerDvinaTraceTemporalSourceRegistrations([lowerDvinaTraceLocalFireTemporalRegistration(
        loadedFireProfile().profile)]),effect_registrations:[...npcTemporalEffectRegistrations(),
      ...lowerDvinaTracePhase7TemporalEffectRegistrations()]});
    const consequence = await phase7Command({
      state,contracts,
      temporalAdvanceOwner:temporalOwner,
      localFireProfile: loadedFireProfile(),
      worldProcessResolver: async (execution) => {
        ownerCalls+=1;
        assert.equal(execution.plan.schema,'npc_step_plan_v1');
        assert.equal(execution.request.player_safe_state,undefined);
        localPlan=phase7LocalFirePlan(state,execution);
        return{working_projection:applyLocalFireTemporalProjection(
          execution.working_projection,localPlan),summary:'local_fire:started',
          write_fragments:[],local_fire_atomic_write_plans:[localPlan],
          player_response_boundary:true};
      },
      projectNpcWorldProcessCapability:projectLowerDvinaTraceF1NpcCapability,
      model: async (request) => {
        assert.deepEqual(
          request.decision_scope.operation_contract.request_world_process,
          {
            owner: '@rus/world-processes',
            context_ref: 'lower-dvina-trace:f1:local_exact_fire',
            scope_ref: 'storehouse-anchor',
            ignition_basis_refs: ['npc-firesteel'],
            active_process_refs: [],
            allowed: [{ process_action: 'start', process_ref: null,
              process_kind: 'fire', source_refs: ['npc-kindling'],
              target_refs: ['npc-firesteel'] }]
          }
        );
        const operation={op:'request_world_process',actor_ref:request.npc_ref,
          process_action:'start',process_ref:null,process_kind:'fire',
          source_refs:['npc-kindling'],target_refs:['npc-firesteel'],
          description:'разжечь огонь'};
        const plan=phase7AutonomousPlan(request,'wait');
        plan.operations=[operation];
        return plan;
      }
    }).consequence({retrievedState:state,
      playerInput:phase7PlayerInput(state,'npc-fire-capability')});
    assert.equal(ownerCalls,1);assert.deepEqual(
      consequence.local_fire_atomic_write_plans,[localPlan]);
    assert.deepEqual(localPlan.transition_proposal.at_timestamp,
      consequence.phase7.temporal.result.clock_after);
    const duePlan=consequence.phase7.schedule_temporal.result.combined_change_set.proposals
      .flatMap((proposal)=>proposal.local_fire_atomic_write_plans??[])[0];
    assert.equal(duePlan.transition_proposal.process_after.status,'completed');
    assert.deepEqual(duePlan.transition_proposal.at_timestamp,
      consequence.phase7.schedule_temporal.result.clock_after);
    assert.equal(consequence.phase7.schedule_execution.semantic_operation.op,
      'request_world_process');
    assert.equal(projectLowerDvinaTraceF1NpcCapability({
      committedState:state,npcSnapshot:contracts.zhdanko,
      loadedProfile:loadedFireProfile(),resolverAvailable:true,
      priorLocalFirePlans:[localPlan,duePlan]
    }),null);
    const persisted = await persistPhase7Consequence({
      state, contracts, consequence
    });
    assert.deepEqual(persisted.plan.local_fire_atomic_write_plans,
      [localPlan,duePlan]);
    const boundFuel = persisted.snapshot.items.find(
      ({ item_id: id }) => id === 'npc-kindling');
    assert.equal(boundFuel.condition_state, 'retired');
    const reloaded = structuredClone(persisted.snapshot);
    reloaded.local_fire_runtime = [{ party_id: state.party_id,
      process_state: localPlan.transition_proposal.process_after,
      input_pins: localPlan.input_pins }];
    assert.equal(projectLowerDvinaTraceF1NpcCapability({
      committedState: reloaded, npcSnapshot: contracts.zhdanko,
      loadedProfile: loadedFireProfile(), resolverAvailable: true
    }), null);
  });

test('Phase 7 keeps overlong NPC activity active after Mikula rest ends',
  async () => {
    const state = phase7CommittedState();
    const contracts = approvedPhase7Contracts(state);
    let modelCalls = 0;
    const consequence = await phase7Command({ state, contracts,
      model: async (request) => {
        const plan = phase7DirectPlan(request);
        modelCalls += 1;
        plan.activity.duration_class = 'short';
        return plan;
      }
    }).consequence({
      retrievedState: state,
      playerInput: phase7PlayerInput(state, 'overlong-direct-activity')
    });

    assert.equal(modelCalls, 1);
    assert.equal(consequence.status, 'resolved');
    assert.equal(consequence.duration_minutes, 30);
    assert.equal(consequence.phase7.schedule_temporal.elapsed_after_decision, 5);
    assert.equal(
      consequence.phase7.schedule_temporal.projection.active_npc_actor_steps[0]
        .status,
      'started'
    );
    assert.deepEqual(
      consequence.phase7.schedule_temporal.projection.active_npc_actor_steps[0]
        .planned_exact_elapsed.exact_minutes,
      { numerator: '15', denominator: '1' }
    );
    assert.equal(consequence.phase7.schedule_execution.status, 'started');
    assert.deepEqual(
      consequence.phase7.schedule_temporal.result.trace.processed_boundary_ids,
      []
    );

    const { snapshot } = await persistPhase7Consequence({
      state, contracts, consequence
    });
    const zhdanko = snapshot.npcs.find(({ participant_slot_ref: slot }) =>
      slot === 'zhdanko_storehouse_controller');
    assert.equal(snapshot.clock.whole_minutes, '130');
    assert.equal(snapshot.phase7_fire_rest.status, 'completed');
    assert.equal(snapshot.phase7_fire_rest.schedule_result.status, 'started');
    assert.equal(zhdanko.machine_state.status, 'active');
    assert.equal(zhdanko.machine_state.active_npc_actor_step.status, 'started');
    assert.equal(zhdanko.machine_state.spatial_zone_ref, 'storehouse_inside');
    assert.equal(zhdanko.machine_state.last_schedule_execution.status,
      'started');
  });

test('Phase 7 executes a valid autonomous generic check without blocking rest',
  async () => {
    const state = phase7CommittedState();
    const contracts = approvedPhase7Contracts(state);
    const rawProfiles = await readFile(ownerProfilesUrl);
    const owners = createLowerDvinaTraceTurnStepGenericOwners({
      profiles: JSON.parse(rawProfiles),
      artifactPin: {
        digest: createHash('sha256').update(rawProfiles).digest('hex')
      }
    });
    let rolls = 0;
    const consequence = await phase7Command({
      state,
      contracts,
      genericCheckContextOwner: owners.genericCheckContextOwner,
      randomSource: { next() { rolls += 1; return 0.95; } },
      model: async (request) => phase7GenericCheckPlan(request)
    }).consequence({
      retrievedState: state,
      playerInput: phase7PlayerInput(state, 'generic-check')
    });

    assert.equal(consequence.status, 'resolved');
    assert.equal(consequence.duration_minutes, 30);
    assert.equal(rolls, 1);
    assert.equal(consequence.phase7.actor_step_check.result.outcome.band,
      'clean_success');
    assert.equal(consequence.phase7.actor_step_check.result.modifiers
      .equipment, -1);
    assert.equal(consequence.phase7.schedule_temporal.result.clock_after
      .whole_minutes, '130');
    const persisted = await persistPhase7Consequence({
      state, contracts, consequence
    });
    assert.equal(persisted.snapshot.clock.whole_minutes, '130');
    const attempt = [
      ...persisted.plan.inserts,
      ...persisted.plan.updates,
      ...persisted.plan.appends
    ].find(({ target_table: table }) =>
      table === 'party_timed_activity_attempts').record;
    assert.equal(attempt.trace.npc_actor_step_check.result.outcome.band,
      'clean_success');
  });

test('Phase 7 generic check uses live NPC body and load, not binding snapshot',
  async () => {
    const state = phase7CommittedState();
    const zhdanko = state.npcs.find(
      ({ instance_id: id }) => id === 'zhdanko-1'
    );
    zhdanko.check_body_state = {
      health: 10, satiety: 100, energy: 10, active_conditions: []
    };
    zhdanko.machine_state.load_category = 'heavy';
    const contracts = approvedPhase7Contracts(state);
    assert.equal(Object.hasOwn(contracts.genericCheckContext, 'body'), false);
    assert.equal(Object.hasOwn(contracts.genericCheckContext, 'inventory'),
      false);
    const rawProfiles = await readFile(ownerProfilesUrl);
    const owners = createLowerDvinaTraceTurnStepGenericOwners({
      profiles: JSON.parse(rawProfiles),
      artifactPin: {
        digest: createHash('sha256').update(rawProfiles).digest('hex')
      }
    });
    const consequence = await phase7Command({
      state,
      contracts,
      genericCheckContextOwner: owners.genericCheckContextOwner,
      randomSource: { next() { return 0.95; } },
      model: async (request) => phase7GenericCheckPlan(request)
    }).consequence({
      retrievedState: state,
      playerInput: phase7PlayerInput(state, 'generic-check-live')
    });
    const modifiers = consequence.phase7.actor_step_check.result.modifiers;
    assert.equal(modifiers.state, -2);
    assert.equal(modifiers.equipment, -2);
  });

test('Phase 7 suppresses generic check without live body',
  async () => {
    const state = phase7CommittedState();
    const zhdanko = state.npcs.find(
      ({ instance_id: id }) => id === 'zhdanko-1'
    );
    delete zhdanko.check_body_state;
    const contracts = approvedPhase7Contracts(state);
    const requests = [];
    let calls = 0;
    const consequence = await phase7Command({
      state,
      contracts,
      model: async (request, { repair }) => {
        requests.push(request);
        calls += 1;
        if (calls === 1) {
          assert.equal(repair, null);
          return phase7GenericCheckPlan(request);
        }
        assert.notEqual(repair, null);
        return phase7DirectPlan(request);
      }
    }).consequence({
      retrievedState: state,
      playerInput: phase7PlayerInput(state, 'generic-check-data-gap')
    });

    assert.deepEqual(requests[0].decision_scope.allowed_attribute_refs, []);
    assert.deepEqual(requests[0].decision_scope.allowed_skill_refs, []);
    assert.equal(calls, 2);
    assert.equal(consequence.status, 'resolved');
    assert.equal(consequence.phase7.autonomous.proposal.plan.resolution,
      'direct');
  });

test('Phase 7 composes an approved generic-check additional activity',
  async () => {
    const state = phase7CommittedState();
    const contracts = approvedPhase7Contracts(state);
    const rawProfiles = await readFile(ownerProfilesUrl);
    const owners = createLowerDvinaTraceTurnStepGenericOwners({
      profiles: JSON.parse(rawProfiles),
      artifactPin: {
        digest: createHash('sha256').update(rawProfiles).digest('hex')
      }
    });
    const consequence = await phase7Command({
      state,
      contracts,
      genericCheckContextOwner: owners.genericCheckContextOwner,
      randomSource: { next() { return 0.2; } },
      model: async (request) => phase7GenericCheckPlan(request, {
        successWithCostActivity: {
          duration_class: 'short', effort: 'none'
        }
      })
    }).consequence({
      retrievedState: state,
      playerInput: phase7PlayerInput(state, 'generic-check-additional')
    });

    assert.equal(consequence.status, 'resolved');
    assert.equal(consequence.duration_minutes, 30);
    assert.equal(consequence.phase7.actor_step_check.result.outcome.band,
      'success_with_cost');
    assert.deepEqual(
      consequence.phase7.schedule_execution.exact_elapsed.exact_minutes,
      { numerator: '16', denominator: '1' }
    );
    assert.deepEqual(
      consequence.phase7.schedule_execution.additional_semantic_operations,
      [{ op: 'apply_semantic_activity', activity: {
        owner: 'semantic', duration_class: 'short', effort: 'none'
      } }]
    );
    assert.equal(consequence.phase7.schedule_execution.status, 'started');
    assert.equal(consequence.phase7.schedule_temporal.result.clock_after
      .whole_minutes, '130');
    const persisted = await persistPhase7Consequence({
      state, contracts, consequence
    });
    const attempt = [
      ...persisted.plan.inserts,
      ...persisted.plan.updates,
      ...persisted.plan.appends
    ].find(({ target_table: table }) =>
      table === 'party_timed_activity_attempts').record;
    assert.deepEqual(
      attempt.trace.npc_schedule_result.additional_semantic_operations,
      consequence.phase7.schedule_execution.additional_semantic_operations
    );
    const forgedCheck = structuredClone(consequence);
    forgedCheck.phase7.actor_step_check.result.total += 1;
    await assert.rejects(() => persistPhase7Consequence({
      state, contracts, consequence: forgedCheck
    }), { code: 'TRACE_PHASE_7_OWNER_RESULT_INVALID' });

    const omittedCost = structuredClone(consequence);
    const phase7 = omittedCost.phase7;
    delete phase7.actor_step.additional_semantic_operations;
    delete phase7.schedule_execution.additional_semantic_operations;
    delete phase7.schedule_temporal.projection.active_npc_actor_steps[0]
      .additional_semantic_operations;
    phase7.actor_step.exact_elapsed.exact_minutes.numerator = '1';
    phase7.schedule_execution.exact_elapsed.exact_minutes.numerator = '1';
    const active = phase7.schedule_temporal.projection.active_npc_actor_steps[0];
    active.planned_exact_elapsed.exact_minutes.numerator = '1';
    active.status = 'completed';
    active.completed_at = { whole_minutes: '126',
      subminute_numerator: '0', subminute_denominator: '1' };
    phase7.schedule_execution.status = 'executed';
    phase7.schedule_execution.clock_after = structuredClone(
      active.completed_at);
    phase7.schedule_temporal.completion_candidate.scheduled_at =
      structuredClone(active.completed_at);
    await assert.rejects(() => persistPhase7Consequence({
      state, contracts, consequence: omittedCost
    }), { code: 'TRACE_PHASE_7_OWNER_RESULT_INVALID' });
  });

function npcFireItem(itemId, kind) {
  return {
    item_id: itemId,
    run_id: null, template_id: null, profile_id: null, category_id: null,
    condition_state: 'serviceable', legal_status: 'ordinary',
    quantity: 1, state_version: 1,
    placement: { item_id: itemId, holder_npc_id: 'zhdanko-1',
      holder_character_id: null, anchor_id: null, container_id: null,
      physical_position: 'hands', equipment_slot_category_id: null,
      attached_item_id: null },
    ownership: { ownership_id: `own:${itemId}`, item_id: itemId,
      owner_npc_id: 'zhdanko-1',
      owner_character_id: null, owner_party: false,
      controller_npc_id: 'zhdanko-1', controller_character_id: null,
      claim_state: 'owned' },
    state: { lifecycle_status: 'active',
      ...(kind === 'fuel' ? { local_fire_fuel: {
        schema: 'rus.items.local_fire_fuel.v1',
        fuel_class: 'ordinary_solid_fuel_unit', whole_unit: true,
        provenance: { source_refs: ['source:wood'] }
      }, runtime_instance_mechanics_snapshot: {
        schema:'rus.items.runtime_instance_mechanics_snapshot.v1',version:1,
        provenance:{source_kind:'ordinary_direct_action_result',
          root_turn_id:'turn:source',step_index:1,
          operation_ref:'operation:source',origin_kind:'direct_partition',
          source_refs:['source:wood']},mechanics:{mass_grams:300,
          external_hand_cost:1,carry_form:'compact',packing_slot_cost:1,
          quantity:{value:1,unit:'item'},container:null}
      } } : { local_fire_ignition_basis: {
        schema: 'rus.items.local_fire_ignition_basis.v1'
      } }) }
  };
}

function phase7LocalFirePlan(state, execution) {
  const operation = execution.operation;
  const byId = new Map(state.items.map((item) => [item.item_id, item]));
  const pin = (ref) => {
    const item = byId.get(ref);
    const { placement, ownership, ...stored } = item;
    return { item_id: ref, item: structuredClone(stored),
      placement: structuredClone(item.placement),
      ownership: structuredClone(item.ownership), bound_process_ref: null };
  };
  return createLocalFireAtomicWritePlan({
    schema: 'local_fire_atomic_write_request_v1', party_id: state.party_id,
    base_party_state_version: state.party_state.state_version,
    change_set_id: `change:${state.party_id}:trace-phase7:${
      state.party_state.turn_number + 1}`,
    actor_ref: execution.request.npc_ref,
    profile_pin: { profile_ref: 'lower-dvina-fire', profile_version: 1,
      context_ref: 'lower-dvina-trace:f1:local_exact_fire',
      scope_ref: 'storehouse-anchor', ignition_basis_ref: 'npc-firesteel',
      policy: { schema: 'local_fire_policy_v1',
        policy_ref: 'lower-dvina-fire-policy', version: 1,
        recheck_interval: { exact_minutes: {
          numerator: '5', denominator: '1' } },
        fuel_unit_mass_grams_min: 100,
        fuel_unit_mass_grams_max: 1000 } },
    process_state: null, input_pins: [pin('npc-kindling')],
    ignition_basis_pin: pin('npc-firesteel'), action: 'start',
    process_ref: `local-fire:${state.party_id}:${
      execution.request.root_turn_id}:${execution.request.decision_index}`,
    at_timestamp: execution.request.occurred_at,
    cause: { kind: 'actor_step', request_id: execution.request.request_id,
      root_turn_id: execution.request.root_turn_id,
      step_index: execution.request.decision_index },
    qualitative_outcome: null
  });
}

function loadedFireProfile(){return{schema:'rus.lower_dvina_trace_f1_loaded_profile.v1',
profile:{schema:'rus.lower_dvina_trace_local_fire_profile.v1',profile_id:'lower-dvina-fire',
revision:1,status:'approved',context_ref:'lower-dvina-trace:f1:local_exact_fire',
policy_ref:'lower-dvina-fire-policy',policy_version:1,allowed_actions:['start','affect'],
recheck_interval:{exact_minutes:{numerator:'5',denominator:'1'}},
fuel_unit_mass_grams_min:100,fuel_unit_mass_grams_max:1000}};}
