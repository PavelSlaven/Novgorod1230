import assert from 'node:assert/strict';
import test from 'node:test';
import { actionProducedResultSemanticContract } from '@rus/items-property';
import { matchesOperationContract } from '@rus/npc-runtime';
import { createLowerDvinaTraceNpcActorStepOwnerCapabilitiesFactory } from
  '../src/runtime/lower-dvina-trace-npc-actor-step-owner-capabilities.js';
import { validateTracePhase7Plan } from
  '../src/runtime/lower-dvina-trace-phase-7-plan-validation.js';
import { mergePhase7Capability } from
  '../src/runtime/lower-dvina-trace-phase-7-owner-registry.js';

test('A1 subset capability merges with item owner', () => {
  const contract = mergePhase7Capability({ owner: '@rus/items-property', allowed: [
    { item_ref: 'road-bag', use_kind: 'operate', target_refs: ['shore'] }
  ] }, { owner: '@rus/items-property', item_refs: ['source', 'tool'],
    use_kinds: ['other'], action_production: {
      source_refs: ['source', 'tool'], tool_refs: ['source', 'tool'] } });
  assert.equal(matchesOperationContract({ op: 'request_item_use', actor_ref: 'npc',
    item_ref: 'road-bag', use_kind: 'operate', target_refs: ['shore'] }, contract), true);
  assert.equal(matchesOperationContract({ op: 'request_item_use', actor_ref: 'npc',
    item_ref: 'source', use_kind: 'other', target_refs: ['tool'], action_production: {
      source_refs: ['source'], tool_refs: ['tool'] } }, contract), true);
  assert.equal(matchesOperationContract({ op: 'request_item_use', actor_ref: 'npc',
    item_ref: 'source', use_kind: 'other', target_refs: ['hidden'], action_production: {
      source_refs: ['source'], tool_refs: ['hidden'] } }, contract), false);
});

test('A1 projects semantic bounds and joint source applicability', async () => {
  const state = committedState();
  let ownerCalls = 0;
  const actionProductionContract = {
    ...structuredClone(actionProducedResultSemanticContract()),
    max_new_entities: 4,
    allowed_identity_modes: ['preserve_source', 'independent_outputs',
      'no_useful_result'],
    allowed_origins: ['direct_partition', 'crafted'],
    allowed_result_classes: ['ordinary_physical_result',
      'partial_transformation', 'nonworking_construction', 'waste',
      'written_carrier', 'no_useful_result'],
    allowed_output_classes: ['ordinary_mundane', 'weapon_capable',
      'money_like_token', 'written_carrier']
  };
  const factory = createLowerDvinaTraceNpcActorStepOwnerCapabilitiesFactory({
    createActionProductionOwner: () => ({
      actionProductionContract,
      referencesApplicable: async () => true,
      referencesJointlyApplicable: async ({ source_refs }) =>
        !source_refs.includes('foreign-source') || source_refs.length === 1,
      preflight: async () => { ownerCalls += 1; },
      execute: async () => { ownerCalls += 1; return {}; }
    })
  });
  const capabilities = await factory({ partyId: 'party', requestId: 'request',
    inputDigest: 'digest', state, phase7Contracts: contracts(state) });
  const action = capabilities.find(({ operation }) =>
    operation === 'request_item_use');
  assert.deepEqual(action.capability.action_production, {
    source_refs: ['safe-source', 'safe-tool', 'foreign-source'],
    tool_refs: ['safe-source', 'safe-tool', 'foreign-source'],
    independent_output_source_groups: [
      ['safe-source', 'safe-tool'], ['foreign-source']
    ],
    ...actionProductionContract
  });

  const compatible = independentOutput(['safe-source', 'safe-tool'], 2);
  const mixed = independentOutput(['safe-source', 'foreign-source'], 2);
  const overProfile = independentOutput(['safe-source'], 5);
  const wrongExtent = independentOutput(['safe-source'], 1);
  wrongExtent.action_production.material_extent = 'minor';
  assert.equal(action.supports({ operation: compatible }), true);
  for (const operation of [mixed, overProfile, wrongExtent]) {
    assert.equal(action.supports({ operation }), false);
    assertRejectedBeforeOwner(operation, action.capability);
  }
  assert.equal(ownerCalls, 0);
});

function assertRejectedBeforeOwner(operation, capability) {
  const operationContract = { request_item_use: capability };
  const validation = validateTracePhase7Plan({ plan: {
    resolution: 'domain_request', operations: [operation]
  }, request: { decision_scope: { operation_contract:
    structuredClone(operationContract) } }, contracts: {}, operationContract });
  assert.equal(validation.pass, false);
  assert.equal(validation.errors[0].code, 'NPC_ITEM_OPERATION_NOT_APPLICABLE');
}

function independentOutput(sourceRefs, requestedOutputCount) {
  return { op: 'request_item_use', actor_ref: 'npc', item_ref: sourceRefs[0],
    use_kind: 'other', target_refs: sourceRefs.slice(1), action_production: {
      source_refs: sourceRefs, tool_refs: [],
      requested_output_count: requestedOutputCount,
      identity_mode: 'independent_outputs', origin: 'crafted',
      result_class: 'ordinary_physical_result', material_extent: 'whole',
      result_descriptor: { display_name: 'новый предмет',
        physical_description: 'отделённый физический результат',
        qualitative_facts: [], removed_physical_fact_refs: [],
        inscription_text: null, physical_form: 'compact',
        source_fact_delta: null }, output_class: 'ordinary_mundane'
    } };
}

function committedState() {
  const npc = { instance_id: 'npc', anchor_id: 'camp-anchor', machine_state: {
    location_ref: 'camp', spatial_zone_ref: 'shore', g6_ref: 'g6:camp',
    load_category: 'light' }, perception_snapshot: { visible_objects: [] } };
  return { party_id: 'party', party_state: { state_version: 1, turn_number: 0 },
    position: { location_ref: 'camp', zone_ref: 'shore',
      g5_anchor_id: 'camp-anchor', g6_ref: 'g6:camp' }, npcs: [npc],
    items: ['safe-source', 'safe-tool', 'foreign-source'].map(npcItem) };
}

function contracts(state) {
  return { zhdanko: state.npcs[0], npcSemanticProfile: {
    profile_id: 'lower_dvina_trace_npc_actor_step_profile_v1', revision: 1,
    status: 'approved', activation_boundary: { phase: 'phase_7',
      npc_participant_slot_ref: 'zhdanko_storehouse_controller' } } };
}

function npcItem(item_id) {
  const mechanics = { schema: 'rus.items.runtime_instance_mechanics_snapshot.v1',
    version: 1, provenance: { source_kind: 'ordinary_direct_action_result',
      root_turn_id: 'turn:source', step_index: 1, operation_ref: 'source',
      origin_kind: 'crafted', source_refs: ['source'] }, mechanics: {
      mass_grams: 100, external_hand_cost: 1, carry_form: 'regular',
      packing_slot_cost: 1, quantity: null, container: null } };
  return { item_id, holder_npc_id: 'npc', condition_state: 'serviceable',
    placement: { holder_npc_id: 'npc', holder_character_id: null,
      container_id: null, physical_position: 'hands' }, state: {
      lifecycle_status: 'active', runtime_instance_mechanics_snapshot: mechanics },
    runtime_instance_mechanics_snapshot: structuredClone(mechanics) };
}
