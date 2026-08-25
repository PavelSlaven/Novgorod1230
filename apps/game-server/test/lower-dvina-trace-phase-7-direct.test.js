import assert from 'node:assert/strict';
import test from 'node:test';
import { stateModifier } from '@rus/body-state';
import { phase7Command, phase7CommittedState, phase7PlayerInput } from
  './lower-dvina-trace-phase-7-runtime-fixture.js';
import { approvedPhase7Contracts, phase7DirectPlan, phase7GenericCheckPlan } from
  './lower-dvina-trace-phase-7-contract-fixture.js';
import { createLowerDvinaTraceNpcActorStepDirectOperations } from
  '../src/runtime/lower-dvina-trace-npc-actor-step-direct-operations.js';
import { createLowerDvinaTraceNpcActorStepOwnerCapabilitiesFactory } from
  '../src/runtime/lower-dvina-trace-npc-actor-step-owner-capabilities.js';
import { matchesOperationContract } from '@rus/npc-runtime';
import { persistPhase7Consequence } from
  './lower-dvina-trace-phase-7-runtime-fixture.js';
import { assertTurnStepBodyHistoryRows } from
  '../src/infrastructure/postgres/lower-dvina-trace-turn-step-body-read.js';
import { buildTracePhase7NpcActionDecisionRequest } from
  '../src/runtime/lower-dvina-trace-phase-7-autonomous.js';

test('Phase 7 executes only registered NPC-safe direct handler', async () => {
  const state = phase7CommittedState();
  const contracts = approvedPhase7Contracts(state);
  let calls = 0;
  const result = await phase7Command({ state, contracts,
    directHandlers: { apply_body_event: (execution) => {
      calls += 1;
      return { working_projection: execution.working_projection,
        summary: 'direct body event', write_fragments: [],
        consequence_fragment: { state_changes: [] } };
    } },
    directOperationContract: { apply_body_event: {
      owner: '@rus/body-state', actor_refs: ['zhdanko-1'],
      mechanisms: ['cold'], severities: ['minor']
    } },
    model: async (request) => {
      assert.equal(Object.hasOwn(request.decision_scope.operation_contract,
        'apply_body_event'), true);
      const plan = phase7DirectPlan(request);
      plan.operations = [{ op: 'apply_body_event', actor_ref: request.npc_ref,
        mechanism: 'cold', severity: 'minor', body_part_ref: null,
        description: 'озяб на ветру' }];
      return plan;
    }
  }).consequence({ retrievedState: state,
    playerInput: phase7PlayerInput(state, 'direct-npc-safe') });
  assert.equal(calls, 1);
  assert.equal(result.phase7.schedule_execution.semantic_operation.op,
    'apply_semantic_activity');
});

test('Phase 7 routes generic-check direct outcome through same handler', async () => {
  const state = phase7CommittedState();
  const contracts = approvedPhase7Contracts(state);
  let calls = 0;
  await phase7Command({ state, contracts, randomSource: { next: () => 0.99 },
    genericCheckContextOwner: genericCheckContext(contracts),
    directHandlers: { apply_body_event: (execution) => {
      calls += 1;
      return { working_projection: execution.working_projection,
        summary: 'direct body event', write_fragments: [], consequence_fragment: { state_changes: [] } };
    } }, directOperationContract: { apply_body_event: {
      owner: '@rus/body-state', actor_refs: ['zhdanko-1'],
      mechanisms: ['cold'], severities: ['minor'] } }, model: async (request) => {
      const plan = phase7GenericCheckPlan(request);
      for (const outcome of Object.values(plan.check.outcomes)) outcome.operations = [{
        op: 'apply_body_event', actor_ref: request.npc_ref, mechanism: 'cold',
        severity: 'minor', body_part_ref: null, description: 'озяб на ветру' }];
      return plan;
    }
  }).consequence({ retrievedState: state,
    playerInput: phase7PlayerInput(state, 'generic-direct-npc-safe') });
  assert.equal(calls, 1);
});

test('Phase 7 permits direct batch before one registered domain owner', async () => {
  const state = phase7CommittedState();
  const contracts = approvedPhase7Contracts(state);
  let direct = 0;
  await phase7Command({ state, contracts,
    directHandlers: { apply_body_event: (execution) => {
      direct += 1;
      return { working_projection: execution.working_projection,
        summary: 'direct', write_fragments: [], consequence_fragment: { state_changes: [] } };
    } }, directOperationContract: { apply_body_event: {
      owner: '@rus/body-state', actor_refs: ['zhdanko-1'],
      mechanisms: ['cold'], severities: ['minor'] } },
    npcOwnerCapabilities: [{ operation: 'request_discovery', capability: {
      owner: '@rus/turn', allowed: [{ discovery_kinds: ['inspect'],
        target_refs: ['storehouse_inside'] }] }, supports: () => true,
      execute: async (execution) => ({ working_projection: execution.working_projection,
        summary: 'inspect', duration_minutes: 0 }) }], model: async (request) => {
      const plan = phase7DirectPlan(request);
      plan.resolution = 'domain_request';
      plan.activity = { owner: 'domain', duration_class: null, effort: null };
      plan.operations = [{ op: 'apply_body_event', actor_ref: request.npc_ref,
        mechanism: 'cold', severity: 'minor', body_part_ref: null,
        description: 'озяб' }, { op: 'request_discovery', actor_ref: request.npc_ref,
        discovery_kind: 'inspect', target_refs: ['storehouse_inside'], query: 'осмотреть' }];
      return plan;
    }
  }).consequence({ retrievedState: state,
    playerInput: phase7PlayerInput(state, 'direct-domain-npc-safe') });
  assert.equal(direct, 1);
});

test('Phase 7 production boundary exposes and persists an unseen safe item direct operation', async () => {
  const state = phase7CommittedState();
  state.player_profile = { attributes: { strength: { value: 10 } } };
  state.items.push(runtimeNpcItem('npc-cord', 'fact:frayed'),
    runtimeNpcItem('npc-strap', 'fact:worn'));
  state.container_placements = [{ party_id: state.party_id,
    container_id: 'road-bag-1', anchor_id: null, parent_container_id: null,
    holder_npc_id: 'zhdanko-1', holder_character_id: null,
    physical_position: 'worn', equipment_slot_category_id: null }];
  state.container_profiles = [{
    template_id: 'trace_ld_v1_container_road_bag', capacity: 4,
    packing_slot_cost: 1, carry_form: 'regular', mass_grams: 100,
    external_hand_cost: 0 }];
  const contracts = approvedPhase7Contracts(state);
  contracts.npcSemanticProfile = { profile_id:
    'lower_dvina_trace_npc_actor_step_profile_v1', revision: 1,
    status: 'approved', activation_boundary: { phase: 'phase_7',
      npc_participant_slot_ref: 'zhdanko_storehouse_controller' },
    actor_mechanics_context: { attributes: [{ attribute_ref: 'strength',
      label: 'сила', value: 10 }] } };
  const ownerFactory = createLowerDvinaTraceNpcActorStepOwnerCapabilitiesFactory();
  const consequence = await phase7Command({ state, contracts,
    createBoundaryNpcDirectOperations: (input) =>
      createLowerDvinaTraceNpcActorStepDirectOperations({
        ...input, phase7Contracts: contracts,
        ordinaryResultPolicy: cordFactPolicy
      }),
    createBoundaryNpcOwnerCapabilities: (boundary) => ownerFactory({
      partyId: state.party_id, requestId: 'direct-domain', inputDigest: 'd',
      phase7Contracts: contracts, ...boundary
    }),
    model: async (request) => {
      assert.deepEqual(request.decision_scope.operation_contract
        .change_entity_facts.allowed.map(({ entity_ref }) => entity_ref),
      ['npc-cord', 'npc-strap']);
      assert.equal(request.decision_scope.operation_contract.move_entity.allowed
        .some(({ placement }) => placement.relation === 'worn_by'
          && placement.target_ref === 'zhdanko-1'), true);
      const plan = phase7DirectPlan(request);
      const container = request.decision_scope.operation_contract
        .request_container_access.allowed[0];
      plan.resolution = 'domain_request';
      plan.activity = { owner: 'domain', duration_class: null, effort: null };
      plan.operations = [{ op: 'change_entity_facts',
        entity_ref: 'npc-cord', remove_fact_refs: [], add_facts: [{
          temp_ref: 'fact:new-tie', text: 'шнур подтянут' }] }, {
        op: 'change_entity_facts', entity_ref: 'npc-strap',
        remove_fact_refs: [], add_facts: [{ temp_ref: 'fact:new-knot',
          text: 'шнур подтянут' }] }, { op: 'move_entity',
        entity_ref: 'npc-cord', placement: { relation: 'worn_by',
          target_ref: request.npc_ref } }, { op: 'request_container_access',
        actor_ref: request.npc_ref, container_ref: container.container_ref,
        access_kind: container.access_kinds[0] }];
      return plan;
    }
  }).consequence({ retrievedState: state,
    playerInput: phase7PlayerInput(state, 'real-change-facts') });
  const persisted = await persistPhase7Consequence({ state, contracts,
    consequence });
  const item = persisted.snapshot.items.find(({ item_id: id }) =>
    id === 'npc-cord');
  assert.equal(item.state.ordinary_metadata.semantic_facts.some(
    ({ text }) => text === 'шнур подтянут'), true);
  assert.deepEqual(item.placement, { holder_npc_id: 'zhdanko-1',
    physical_position: 'worn' });
  const strap = persisted.snapshot.items.find(({ item_id: id }) =>
    id === 'npc-strap');
  assert.equal(strap.state.ordinary_metadata.semantic_facts.some(
    ({ text }) => text === 'шнур подтянут'), true);
  assert.equal(persisted.snapshot.knowledge.some(
    ({ text }) => text === 'шнур подтянут'), false);
  assert.equal(persisted.snapshot.last_turn.turn_step_operation_batch
    .operations[0].value.operation_kind, 'change_entity_facts');
  assert.equal(persisted.snapshot.last_turn.turn_step_operation_batch
    .operations.at(-1).value.operation_kind, 'request_container_access');
});

test('Phase 7 persists generic-check body direct without NPC items', async () => {
  const state = phase7CommittedState();
  state.npcs.find(({ instance_id }) => instance_id === 'zhdanko-1')
    .check_body_state.active_conditions = [{
      id: 'tired', status: 'active', severity: 'minor', summary: 'устал'
    }];
  const contracts = approvedPhase7Contracts(state);
  contracts.npcSemanticProfile = { profile_id:
    'lower_dvina_trace_npc_actor_step_profile_v1', revision: 1,
    status: 'approved', activation_boundary: { phase: 'phase_7',
      npc_participant_slot_ref: 'zhdanko_storehouse_controller' } };
  const owner = { resolve: ({ actor }) => ({
    body_effect_ref: 'body:cold:minor',
    composite_body_effect_ref: 'trace_ld_v1_turn_step_generic_body_effect_v1',
    payload: { body_effect_ref: 'body:cold:minor', profile_pin: {
      artifact_id: 'body', revision: 1, digest: 'a'.repeat(64) },
    selected_context: { kind: 'direct_body_event', mechanism: 'cold',
      severity: 'minor', body_part_ref: null }, exact_deltas: {
      health: 0, satiety: 0, energy: -1 }, state_after: {
      ...actor.body, energy: actor.body.energy - 1,
      active_conditions: actor.body.active_conditions.map((condition) => ({
        ...condition, id: 'cold', effect: 'chilled', cause: 'body:cold:minor'
      })) }, condition_transitions: [{
      from: 'tired', to: 'cold', outcome: 'chilled'
    }],
    selection_policy: 'fixed_approved_effect', rng_consumption: 'forbidden' }
  }) };
  const consequence = await phase7Command({ state, contracts,
    randomSource: { next: () => 0.99 },
    genericCheckContextOwner: genericCheckContext(contracts),
    createBoundaryNpcDirectOperations: (input) =>
      createLowerDvinaTraceNpcActorStepDirectOperations({ ...input,
        phase7Contracts: contracts, bodyEventOwner: owner }),
    model: async (request) => {
      assert.ok(request.decision_scope.operation_contract.apply_body_event);
      const plan = phase7GenericCheckPlan(request);
      for (const outcome of Object.values(plan.check.outcomes)) {
        outcome.operations = [{ op: 'apply_body_event',
          actor_ref: request.npc_ref, mechanism: 'cold', severity: 'minor',
          body_part_ref: null, description: 'озяб' }];
      }
      return plan;
    }
  }).consequence({ retrievedState: state,
    playerInput: phase7PlayerInput(state, 'body-no-items') });
  assert.equal(consequence.phase7.actor_step_owner_outputs.write_fragments[0]
    .value.operation_kind, 'apply_body_event');
  assert.equal(consequence.phase7.actor_step_owner_outputs.write_fragments[0]
    .value.payload.payload.state_after.energy, 49);
  const persisted = await persistPhase7Consequence({ state, contracts,
    consequence });
  assert.equal(persisted.snapshot.npcs.find(({ instance_id }) =>
    instance_id === 'zhdanko-1').check_body_state.energy, 49);
  const reloaded = structuredClone(persisted.snapshot);
  const priorRequest = consequence.phase7.autonomous.request;
  const request = buildTracePhase7NpcActionDecisionRequest({
    state: reloaded, contracts,
    boundary: consequence.phase7.autonomous.boundary,
    orderedSignals: [consequence.phase7.autonomous.signal],
    operationContract: priorRequest.decision_scope.operation_contract,
    rootTurnId: 'turn:phase7-party:reload',
    waitingTransition: consequence.phase7.temporal.waiting_transition,
    perceivedChanges: priorRequest.perception.perceived_changes
  });
  assert.deepEqual(request.npc.body_state.conditions, [{
    condition_ref: 'cold', status: 'active', severity: 'minor',
    summary: 'устал'
  }]);
  assert.equal(persisted.snapshot.body_state.energy, 33);
  const history = persisted.plan.appends.find(({ target_table: table,
    record }) => table === 'party_body_temporal_history'
      && record.subject_kind === 'npc')?.record;
  assert.equal(history?.subject_kind, 'npc');
  assert.equal(history?.subject_id, 'zhdanko-1');
  const npcWrite = persisted.plan.updates.find(({ target_table: table,
    record }) => table === 'party_npcs' && record.npc_id === 'zhdanko-1');
  assert.equal(npcWrite.record.machine_state.check_body_state.energy, 49);
  assert.equal(Object.hasOwn(npcWrite.record, 'semantic_state'), false);
  await assert.doesNotReject(() => assertTurnStepBodyHistoryRows({
    async query() { return { rows: [structuredClone(history)] }; }
  }, persisted.snapshot, {
    body_state_version: String(persisted.snapshot.party_state.body_state_version),
    body_health: String(persisted.snapshot.body_state.health),
    body_energy: String(persisted.snapshot.body_state.energy),
    body_satiety: String(persisted.snapshot.body_state.satiety),
    body_updated_change_set_id: persisted.snapshot.last_turn.change_set_id
  }));
});

test('NPC actor-step exposes ambient create_entity without a runtime item', () => {
  const state = phase7CommittedState();
  state.items = [];
  state.npcs.find(({ instance_id }) => instance_id === 'zhdanko-1')
    .machine_state.g6_ref = 'trace_ld_v1_g6_storehouse';
  const contracts = approvedPhase7Contracts(state);
  contracts.npcSemanticProfile = { profile_id:
    'lower_dvina_trace_npc_actor_step_profile_v1', revision: 1,
    status: 'approved', activation_boundary: { phase: 'phase_7',
      npc_participant_slot_ref: 'zhdanko_storehouse_controller' } };
  const direct = createLowerDvinaTraceNpcActorStepDirectOperations({ state,
    phase7Contracts: contracts, ordinaryResultPolicy: cordFactPolicy,
    createAmbientOrdinaryPortionAdmission: ({ committedState }) => {
      assert.equal(committedState.actor_id, 'zhdanko-1');
      assert.equal(committedState.position.location_ref,
        'trace_ld_v1_loc_storehouse');
      return Object.assign(async () => ({ pass: false }), { supports: () => true });
    } });
  assert.deepEqual(direct.operationContract.create_entity.allowed, [{
    origin_kind: 'ambient_ordinary',
    source_refs: ['trace_ld_v1_loc_storehouse'],
    placement: { relation: 'held_by', target_ref: 'zhdanko-1' }
  }]);
});

test('NPC actor-step rejects raw physical transforms before persistence', () => {
  const state = phase7CommittedState();
  state.items.push(runtimeNpcItem('npc-unseen', 'fact:unseen', 1000),
    runtimeNpcItem('npc-unseen-2', 'fact:unseen-2'));
  const phase7Contracts = approvedPhase7Contracts(state);
  phase7Contracts.npcSemanticProfile = { profile_id:
    'lower_dvina_trace_npc_actor_step_profile_v1', revision: 1,
    status: 'approved', activation_boundary: { phase: 'phase_7',
      npc_participant_slot_ref: 'zhdanko_storehouse_controller' } };
  const direct = createLowerDvinaTraceNpcActorStepDirectOperations({ state, phase7Contracts,
    ordinaryResultPolicy: cordFactPolicy,
    createAmbientOrdinaryPortionAdmission: () =>
      Object.assign(async () => ({ pass: false }), { supports: () => true }) });
  const move = direct.operationContract.move_entity;
  const npcRef = 'zhdanko-1';
  const locationRef = 'trace_ld_v1_loc_storehouse';

  assert.equal(Object.hasOwn(direct.operationContract, 'create_entity'), false);
  assert.equal(Object.hasOwn(direct.operationContract, 'set_entity_mechanics'), false);
  assert.equal(Object.hasOwn(direct.operationContract, 'retire_entity'), false);
  assert.equal(Object.hasOwn(direct.handlers, 'create_entity'), false);
  assert.equal(Object.hasOwn(direct.handlers, 'set_entity_mechanics'), false);
  assert.equal(Object.hasOwn(direct.handlers, 'retire_entity'), false);
  assert.equal(matchesOperationContract({ op: 'create_entity', temp_ref: 'half-board',
    semantic_type: 'wood_piece', name: 'половина доски', facts: [],
    origin: { kind: 'crafted', source_refs: ['npc-unseen'] }, mechanics: {
      mass_grams: 500, external_hand_cost: 0, carry_form: 'compact',
      packing_slot_cost: 1, quantity: null, container: null },
    placement: { relation: 'held_by', target_ref: npcRef } },
  direct.operationContract.create_entity), false);
  assert.equal(matchesOperationContract({ op: 'create_entity', origin: {
    kind: 'direct_partition', source_refs: ['npc-unseen'] },
  placement: { relation: 'held_by', target_ref: npcRef } },
  direct.operationContract.create_entity), false);
  assert.equal(matchesOperationContract({ op: 'set_entity_mechanics',
    entity_ref: 'npc-unseen', mechanics: { mass_grams: 5000,
      external_hand_cost: 1, carry_form: 'regular', packing_slot_cost: 5,
      quantity: null, container: null }, reason: 'сделать тяжелее' },
  direct.operationContract.set_entity_mechanics), false);
  assert.equal(matchesOperationContract({ op: 'retire_entity',
    entity_ref: 'npc-unseen' }, direct.operationContract.retire_entity), false);
  assert.equal(matchesOperationContract({ op: 'move_entity', entity_ref: 'npc-unseen',
    placement: { relation: 'worn_by', target_ref: locationRef } }, move), false);
  assert.equal(matchesOperationContract({ op: 'move_entity', entity_ref: 'npc-unseen',
    placement: { relation: 'located_at', target_ref: npcRef } }, move), false);
  assert.equal(matchesOperationContract({ op: 'move_entity', entity_ref: 'npc-unseen',
    placement: { relation: 'worn_by', target_ref: npcRef } }, move), true);
});

test('NPC actor-step derives unseen inside and attached placements from NPC-safe current state', async () => {
  const state = phase7CommittedState();
  state.player_profile = { attributes: { strength: { value: 10 } } };
  state.items.push(runtimeNpcItem('npc-unseen', 'fact:unseen'),
    runtimeNpcItem('npc-anchor', 'fact:anchor'));
  state.containers[0].open_state = 'open';
  state.container_placements = [{ party_id: state.party_id,
    container_id: 'road-bag-1', anchor_id: null, parent_container_id: null,
    holder_npc_id: 'zhdanko-1', holder_character_id: null,
    physical_position: 'worn', equipment_slot_category_id: null }];
  state.container_profiles = [{
    template_id: 'trace_ld_v1_container_road_bag', capacity: 4,
    packing_slot_cost: 1, carry_form: 'regular', mass_grams: 100,
    external_hand_cost: 0 }];
  const phase7Contracts = approvedPhase7Contracts(state);
  phase7Contracts.npcSemanticProfile = { profile_id:
    'lower_dvina_trace_npc_actor_step_profile_v1', revision: 1,
    status: 'approved', activation_boundary: { phase: 'phase_7',
      npc_participant_slot_ref: 'zhdanko_storehouse_controller' },
    actor_mechanics_context: { attributes: [{ attribute_ref: 'strength',
      label: 'сила', value: 10 }] } };
  const move = createLowerDvinaTraceNpcActorStepDirectOperations({ state, phase7Contracts,
    ordinaryResultPolicy: cordFactPolicy }).operationContract.move_entity;

  assert.equal(matchesOperationContract({ op: 'move_entity',
    entity_ref: 'npc-unseen', placement: { relation: 'inside',
      target_ref: 'road-bag-1' } }, move), true);
  assert.equal(matchesOperationContract({ op: 'move_entity',
    entity_ref: 'npc-unseen', placement: { relation: 'attached_to',
      target_ref: 'npc-anchor' } }, move), true);
  assert.equal(matchesOperationContract({ op: 'move_entity',
    entity_ref: 'npc-unseen', placement: { relation: 'inside',
      target_ref: 'missing-bag' } }, move), false);
  assert.equal(matchesOperationContract({ op: 'move_entity',
    entity_ref: 'npc-unseen', placement: { relation: 'attached_to',
      target_ref: 'npc-unseen' } }, move), false);

  const consequence = await phase7Command({ state, contracts: phase7Contracts,
    createBoundaryNpcDirectOperations: (input) =>
      createLowerDvinaTraceNpcActorStepDirectOperations({ ...input, state,
        phase7Contracts, ordinaryResultPolicy: cordFactPolicy,
        packingCalculator: () => ({ pass: true, required_slots: 1 }) }),
    model: async (request) => {
      const plan = phase7DirectPlan(request);
      plan.operations = [{ op: 'move_entity', entity_ref: 'npc-unseen',
        placement: { relation: 'inside', target_ref: 'road-bag-1' } }, {
        op: 'move_entity', entity_ref: 'npc-anchor',
        placement: { relation: 'attached_to', target_ref: 'npc-unseen' } }];
      return plan;
    }
  }).consequence({ retrievedState: state,
    playerInput: phase7PlayerInput(state, 'unseen-placements') });
  const moves = consequence.phase7.actor_step_owner_outputs.write_fragments
    .map(({ value }) => value.payload.placement);
  assert.deepEqual(moves, [{ container_id: 'road-bag-1' },
    { attached_item_id: 'npc-unseen' }]);
});

const cordFactPolicy = Object.freeze({
  schema: 'rus.items.ordinary_result_admission_policy.v1', version: 1,
  status: 'approved', candidates: [{ semantic_type: 'cord', name: 'шнур',
    significance: 'ordinary', allowed_origin_kinds: ['crafted'],
    approved_fact_texts: ['шнур подтянут'] }]
});

function runtimeNpcItem(itemId, factId, mass_grams = 20) {
  const snapshot = {
    schema: 'rus.items.runtime_instance_mechanics_snapshot.v1', version: 1,
    provenance: { source_kind: 'ordinary_direct_action_result',
      root_turn_id: 'turn:source', step_index: 1,
      operation_ref: 'operation:source', origin_kind: 'crafted',
      source_refs: ['safe-source'] },
    mechanics: { mass_grams, external_hand_cost: 1,
      carry_form: 'regular', packing_slot_cost: 1, quantity: null,
      container: null }
  };
  const semanticFacts = [{ fact_id: factId, text: 'шнур обтрёпан' }];
  return { item_id: itemId, template_id: null, profile_id: null,
    category_id: null, name: 'шнур', quantity: 1,
    condition_state: 'ordinary_runtime_instance', legal_status: 'owned',
    placement: { holder_npc_id: 'zhdanko-1', holder_character_id: null,
      physical_position: 'hands' },
    runtime_instance_mechanics_snapshot: snapshot,
    semantic_facts: semanticFacts,
    state: { lifecycle_status: 'active',
      runtime_instance_mechanics_snapshot: structuredClone(snapshot),
      ordinary_metadata: { semantic_type: 'cord', name: 'шнур',
        origin: { kind: 'crafted', source_refs: ['safe-source'] },
        semantic_facts: semanticFacts,
        operation_history: [] } } };
}

function genericCheckContext(contracts) {
  return { resolve({ check, actor, working_projection: projection }) {
    const policy = contracts.genericCheckModifierPolicy;
    return { attribute_value: actor.attributes[check.attribute_ref].value,
      skill_bonus: actor.skills[check.skill_ref].bonus,
      state_modifier: stateModifier(actor.body,
        policy.state_relevance_by_attribute[check.attribute_ref]),
      equipment_modifier:
        policy.load_category_modifiers[projection.inventory.load_category],
      circumstance_modifier: 0, policy_profile_ref: policy.profile_ref,
      policy_profile_pin: structuredClone(policy.profile_pin),
      check_policy_ref: structuredClone(policy.check_policy_ref),
      consequence_policy_ref:
        structuredClone(policy.consequence_policy_ref) };
  } };
}
