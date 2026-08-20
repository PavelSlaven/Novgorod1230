import assert from 'node:assert/strict';
import test from 'node:test';
import { createLowerDvinaTraceTurnStepRuntimePorts } from
  '../src/runtime/lower-dvina-trace-turn-step-runtime-ports.js';
import { createLowerDvinaTracePlayerSafeWorkingProjectionAuthority } from
  '../src/runtime/lower-dvina-trace-player-safe-working.js';
import { projectLowerDvinaTracePlayerSafeState } from
  '../src/runtime/lower-dvina-trace-player-safe-state.js';

test('sealed A1 output is usable by the next internal step', async () => {
  const actor = { actor_id: 'mikula', attributes: {
    strength: { value: 9, bonus: -1 } }, skills: {}, body: {} };
  const projection = {
    actor_id: 'mikula', position: { location_ref: 'shore' },
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
              semantic_facts: [], operation_history: [] } }, state_version: 1 },
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
  const moved = await ports.executionRegistry.direct(operation)({
    plan: {}, request: { root_turn_id: 'turn:party:1', step_index: 2,
      actor }, operation, working_projection: prepared, check_result: null
  });

  assert.equal(prepared.items[0].name, 'деревянный клин');
  assert.equal(Object.hasOwn(playerSafe.items[0], 'state'), false);
  assert.equal(playerSafe.items[0].semantic_type, 'ordinary_mundane');
  assert.equal(moved.working_projection.inventory.items.includes(
    'a1-wedge'), true);
});
