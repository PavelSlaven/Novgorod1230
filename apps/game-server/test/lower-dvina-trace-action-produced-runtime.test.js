import assert from 'node:assert/strict';
import test from 'node:test';
import { createLowerDvinaTraceTurnStepRuntimePorts } from
  '../src/runtime/lower-dvina-trace-turn-step-runtime-ports.js';
import { createLowerDvinaTracePlayerSafeWorkingProjectionAuthority } from
  '../src/runtime/lower-dvina-trace-player-safe-working.js';
import { projectLowerDvinaTracePlayerSafeState } from
  '../src/runtime/lower-dvina-trace-player-safe-state.js';

test('validated A1 output is usable by the next internal step', async () => {
  const actor = { actor_id: 'mikula', attributes: {
    strength: { value: 9, bonus: -1 } }, skills: {}, body: {} };
  const projection = {
    actor_id: 'mikula', position: { location_ref: 'shore',
      anchor_id: 'shore' },
    destination_refs: [], items: [], knowledge: [],
    inventory: { items: [], total_weight: { grams: 0 },
      load_category: 'light', occupied_hands: 0 }
  };
  const snapshot = {
    schema: 'rus.items.runtime_instance_mechanics_snapshot.v1', version: 1,
    provenance: { source_kind: 'ordinary_direct_action_result',
      root_turn_id: 'turn:party:1', step_index: 1,
      operation_ref: 'a1-wedge', origin_kind: 'crafted',
      source_refs: ['board'] },
    mechanics: { mass_grams: 200, external_hand_cost: 0,
      carry_form: 'compact', packing_slot_cost: 1,
      quantity: { value: 1, unit: 'item' }, container: null }
  };
  const authority = createLowerDvinaTracePlayerSafeWorkingProjectionAuthority();
  const ports = createLowerDvinaTraceTurnStepRuntimePorts({
    workingProjectionAuthority: authority });
  const prepared = ports.applyActionProductionProjection({
    working_projection: projection, actor,
    action_production_atomic_write_plan: {
      source_updates: [], result_items: [{
        item_id: 'a1-wedge', mechanics_snapshot: snapshot,
        item_row: { run_id: null, template_id: null, profile_id: null,
          category_id: null, quantity: 1, condition_state: 'serviceable',
          legal_status: 'action_produced_non_authoritative',
          state: { lifecycle_status: 'active',
            runtime_instance_mechanics_snapshot: snapshot,
            ordinary_metadata: { semantic_type: 'ordinary_mundane',
              name: 'деревянный клин', origin: {
                kind: 'action_produced', source_refs: ['board'] },
              semantic_facts: [{ fact_id: 'a1-wedge:fact:1',
                text: 'имеет заострённый конец', operation_id: 'a1-wedge' }],
              operation_history: [] },
            action_production: {
              schema: 'rus.items.action_production_item_state.v1',
              causal_identity: { request_id: 'request',
                root_turn_id: 'turn:party:1', action_ref: 'a1-wedge',
                step_index: 1 },
              result_class: 'partial_transformation',
              output_class: 'ordinary_mundane',
              inscription_text: null, source_ref: 'board',
              material_allocations: [{ source_ref: 'board', quantity: {
                numerator: 200, denominator: 1, unit: 'gram' } }]
            } }, state_version: 1 },
        placement_row: { anchor_id: 'shore', container_id: null,
          holder_npc_id: null, holder_character_id: null,
          physical_position: null, equipment_slot_category_id: null,
          attached_item_id: null }
      }]
    }
  });
  const operation = { op: 'move_entity', entity_ref: 'a1-wedge',
    placement: { relation: 'held_by', target_ref: 'mikula' } };
  const playerSafe = projectLowerDvinaTracePlayerSafeState({
    committed_state: { actor_id: 'mikula', player_profile: {
      attributes: actor.attributes, skills: actor.skills,
      inventory: projection.inventory }, position: projection.position,
      items: [], knowledge: [] }, working_projection: prepared,
    working_projection_authority: authority, actor_id: 'mikula'
  }).player_safe_state;
  const reloaded = projectLowerDvinaTracePlayerSafeState({
    committed_state: { actor_id: 'mikula', player_profile: {
      attributes: actor.attributes, skills: actor.skills,
      inventory: projection.inventory }, position: projection.position,
      items: [{ ...prepared.items[0], state: preparedState(snapshot) }],
      knowledge: [] }, actor_id: 'mikula'
  }).player_safe_state;
  const moved = await ports.executionRegistry.direct(operation)({
    plan: {}, request: { root_turn_id: 'turn:party:1', step_index: 2,
      actor }, operation, working_projection: prepared, check_result: null
  });

  assert.equal(prepared.items[0].name, 'деревянный клин');
  assert.equal(Object.hasOwn(playerSafe.items[0], 'state'), false);
  assert.equal(playerSafe.items[0].semantic_type, 'ordinary_mundane');
  assert.deepEqual(playerSafe.items[0].physical_facts,
    ['имеет заострённый конец']);
  assert.deepEqual(playerSafe.items[0].physical_fact_records, [{
    fact_ref: 'a1-wedge:fact:1', text: 'имеет заострённый конец'
  }]);
  assert.deepEqual(reloaded.items[0].physical_facts,
    ['имеет заострённый конец']);
  assert.deepEqual(reloaded.items[0].physical_fact_records, [{
    fact_ref: 'a1-wedge:fact:1', text: 'имеет заострённый конец'
  }]);
  assert.equal(moved.working_projection.inventory.items.includes(
    'a1-wedge'), true);
});

test('preserved A1 source exposes its physical change now and after reload', () => {
  const actor = { actor_id: 'mikula', attributes: {
      strength: { value: 9, bonus: -1 } }, skills: {}, body: {} };
  const snapshot = {
    schema: 'rus.items.runtime_instance_mechanics_snapshot.v1', version: 1,
    provenance: { source_kind: 'ordinary_direct_action_result',
      root_turn_id: 'turn:before', step_index: 1, operation_ref: 'find-pole',
      origin_kind: 'ambient_ordinary', source_refs: ['shore'] },
    mechanics: { mass_grams: 800, external_hand_cost: 1,
      carry_form: 'long', packing_slot_cost: 3,
      quantity: { value: 1, unit: 'item' }, container: null }
  };
  const placement = { anchor_id: 'shore', container_id: null,
    holder_npc_id: null, holder_character_id: null,
    physical_position: null, equipment_slot_category_id: null,
    attached_item_id: null };
  const committed = { actor_id: 'mikula', position: {
      location_ref: 'shore', anchor_id: 'shore' },
    items: [{ item_id: 'pole', template_id: null, profile_id: null,
      category_id: 'ordinary_mundane', name: 'жердь', quantity: 1,
      condition_state: 'serviceable', legal_status: 'unowned', placement,
      runtime_instance_mechanics_snapshot: snapshot,
      state: { lifecycle_status: 'active',
        runtime_instance_mechanics_snapshot: snapshot,
        ordinary_metadata: { semantic_type: 'ordinary_mundane', name: 'жердь',
          origin: { kind: 'ambient_ordinary', source_refs: ['shore'] },
          semantic_facts: [], operation_history: [] } } }], knowledge: [] };
  const { state: ignoredState,
    runtime_instance_mechanics_snapshot: ignoredSnapshot,
    ...projectedItem } = committed.items[0];
  void ignoredState; void ignoredSnapshot;
  const projection = { actor_id: 'mikula', position: committed.position,
    destination_refs: [], items: [structuredClone(projectedItem)], knowledge: [],
    inventory: { items: [], total_weight: { grams: 0 },
      load_category: 'light', occupied_hands: 0 } };
  const afterState = structuredClone(committed.items[0].state);
  afterState.ordinary_metadata.semantic_facts = [{
    fact_id: 'sharpen-pole:fact:1', text: 'один конец жерди заострён',
    operation_id: 'sharpen-pole'
  }];
  afterState.action_production = {
    schema: 'rus.items.action_production_item_state.v1',
    causal_identity: { request_id: 'sharpen-pole',
      root_turn_id: 'turn:sharpen', action_ref: 'sharpen-pole', step_index: 1 },
    result_class: 'partial_transformation', output_class: 'ordinary_mundane',
    inscription_text: null
  };
  const authority = createLowerDvinaTracePlayerSafeWorkingProjectionAuthority();
  const ports = createLowerDvinaTraceTurnStepRuntimePorts({ committedState: committed,
    workingProjectionAuthority: authority });
  const prepared = ports.applyActionProductionProjection({
    working_projection: projection, actor,
    action_production_atomic_write_plan: { source_updates: [{ item_id: 'pole',
      after_item: { ...committed.items[0], state: afterState } }],
    result_items: [] } });
  const playerProfile = { attributes: {}, skills: {}, inventory: projection.inventory };
  const current = projectLowerDvinaTracePlayerSafeState({ committed_state: {
      ...committed, player_profile: playerProfile }, working_projection: prepared,
    working_projection_authority: authority, actor_id: 'mikula' }).player_safe_state;
  const reloaded = projectLowerDvinaTracePlayerSafeState({ committed_state: {
      ...committed, player_profile: playerProfile,
      items: [{ ...committed.items[0], state: afterState }] },
    actor_id: 'mikula' }).player_safe_state;

  assert.deepEqual(current.items[0].physical_facts,
    ['один конец жерди заострён']);
  assert.deepEqual(current.items[0].physical_fact_records, [{
    fact_ref: 'sharpen-pole:fact:1', text: 'один конец жерди заострён'
  }]);
  assert.deepEqual(reloaded.items[0].physical_facts,
    ['один конец жерди заострён']);
});

test('A1 hydrates a same-turn prepared ordinary source from its exact pin', () => {
  const snapshot = {
    schema: 'rus.items.runtime_instance_mechanics_snapshot.v2', version: 2,
    provenance: { source_kind: 'ordinary_world_materialization',
      request_id: 'turn:party:1:ordinary:presence',
      causal_ref: 'shore:driftwood', candidate_key: 'driftwood',
      coverage_key: 'shore:material', context_version: 'shore:1',
      policy_ref: 'ordinary:shore', source_refs: ['shore'] },
    mechanics: { mass_grams: 800, external_hand_cost: 1,
      carry_form: 'long', packing_slot_cost: 3,
      quantity: { value: 1, unit: 'item' }, container: null }
  };
  const placement = { anchor_id: 'shore', container_id: null,
    holder_npc_id: null, holder_character_id: null, physical_position: null,
    equipment_slot_category_id: null, attached_item_id: null };
  const before = { item_id: 'driftwood', template_id: null, profile_id: null,
    category_id: 'ordinary_object_candidate', quantity: 1,
    condition_state: 'serviceable', legal_status: 'unowned', state_version: 1,
    state: { lifecycle_status: 'active',
      runtime_instance_mechanics_snapshot: snapshot,
      ordinary_metadata: { semantic_type: 'ordinary_object_candidate',
        name: 'длинный обломок доски', semantic_facts: [],
        physical_inscriptions: [], operation_history: [] } } };
  const after = structuredClone(before);
  after.state.ordinary_metadata.semantic_facts = [{
    fact_id: 'support:fact:1', text: 'приспособлен как опора для плеча',
    operation_id: 'support'
  }];
  const authority = createLowerDvinaTracePlayerSafeWorkingProjectionAuthority();
  const ports = createLowerDvinaTraceTurnStepRuntimePorts({
    workingProjectionAuthority: authority });
  const result = ports.applyActionProductionProjection({
    working_projection: { actor_id: 'mikula', items: [], inventory: {
      items: [], total_weight: { grams: 0 }, load_category: 'light',
      occupied_hands: 0 } },
    actor: { actor_id: 'mikula', attributes: { strength: { value: 9 } } },
    action_production_atomic_write_plan: {
      source_pins: [{ item_id: 'driftwood', item: before, placement,
        prepared_ordinary: { schema:
          'action_production_prepared_ordinary_pin_v2' } }],
      source_updates: [{ item_id: 'driftwood', after_item: after }],
      result_items: []
    }
  });
  assert.equal(result.items[0].placement.anchor_id, 'shore');
  assert.deepEqual(result.items[0].physical_facts,
    ['приспособлен как опора для плеча']);
});

function preparedState(snapshot) {
  return {
    lifecycle_status: 'active', runtime_instance_mechanics_snapshot: snapshot,
    ordinary_metadata: { semantic_type: 'ordinary_mundane',
      name: 'деревянный клин', origin: {
        kind: 'action_produced', source_refs: ['board'] },
      semantic_facts: [{ fact_id: 'a1-wedge:fact:1',
        text: 'имеет заострённый конец', operation_id: 'a1-wedge' }],
      operation_history: [] },
    action_production: {
      schema: 'rus.items.action_production_item_state.v1',
      causal_identity: { request_id: 'request',
        root_turn_id: 'turn:party:1', action_ref: 'a1-wedge', step_index: 1 },
      result_class: 'partial_transformation',
      output_class: 'ordinary_mundane',
      inscription_text: null,
      source_ref: 'board', material_allocations: [{ source_ref: 'board',
        quantity: { numerator: 200, denominator: 1, unit: 'gram' } }]
    }
  };
}
