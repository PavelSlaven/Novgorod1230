import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveActionProducedAllocationMechanics } from
  '@rus/items-property/action-produced-transition';

test('allocation mechanics conserves two finite sources across two outputs',
  () => {
    const resolution = resolveActionProducedAllocationMechanics({
      mechanics_request: mechanicsRequest(),
      source_mechanics: [
        sourceMechanics('material:a', 400, 2, 2),
        sourceMechanics('material:b', 200, 2, 2)
      ],
      output_count: 2
    });

    assert.deepEqual(resolution.source_effects.map((effect) => ({
      ref: effect.source_ref,
      decrement: effect.requested_decrement,
      mechanics: effect.mechanics_snapshot_after.mechanics
    })), [
      { ref: 'material:a', decrement: quantity(1), mechanics: {
        mass_grams: 200, external_hand_cost: 0, carry_form: 'compact',
        packing_slot_cost: 2, quantity: { value: 1, unit: 'piece' },
        container: null
      } },
      { ref: 'material:b', decrement: quantity(1), mechanics: {
        mass_grams: 100, external_hand_cost: 0, carry_form: 'compact',
        packing_slot_cost: 2, quantity: { value: 1, unit: 'piece' },
        container: null
      } }
    ]);
    assert.deepEqual(resolution.outputs.map((output) => ({
      ordinal: output.ordinal,
      mechanics: output.mechanics_snapshot.mechanics,
      allocations: output.material_allocations
    })), [1, 2].map((ordinal) => ({
      ordinal,
      mechanics: { mass_grams: 150, external_hand_cost: 0,
        carry_form: 'compact', packing_slot_cost: 1,
        quantity: { value: 1, unit: 'item' }, container: null },
      allocations: [
        { source_ref: 'material:a', quantity: quantity(1, 2) },
        { source_ref: 'material:b', quantity: quantity(1, 2) }
      ]
    })));
  });

test('allocation mechanics retires one whole item and derives output carrying',
  () => {
    const resolution = resolveActionProducedAllocationMechanics({
      mechanics_request: mechanicsRequest({
        source_inputs: [{ entity_ref: 'material:board',
          finite_resource: null }]
      }),
      source_mechanics: [{ source_ref: 'material:board', mechanics: {
        mass_grams: 800, external_hand_cost: 1, carry_form: 'regular',
        packing_slot_cost: 3, quantity: null,
        container: null
      } }],
      output_count: 2
    });
    assert.deepEqual(resolution.source_effects, [{
      source_ref: 'material:board', requested_decrement: null,
      mechanics_snapshot_after: null
    }]);
    assert.deepEqual(resolution.outputs.map(({ mechanics_snapshot: snapshot,
      material_allocations: allocations }) => ({
      mechanics: snapshot.mechanics, allocations
    })), [1, 2].map(() => ({ mechanics: {
      mass_grams: 400, external_hand_cost: 1, carry_form: 'regular',
      packing_slot_cost: 2, quantity: { value: 1, unit: 'item' },
      container: null
    }, allocations: [{ source_ref: 'material:board', quantity: {
      numerator: 1, denominator: 2, unit: 'whole_item'
    } }] })));
  });

test('allocation mechanics still fails when known mass cannot split exactly',
  () => {
    assert.throws(() => resolveActionProducedAllocationMechanics({
      mechanics_request: mechanicsRequest({ source_inputs: [{
        entity_ref: 'material:board', finite_resource: null }] }),
      source_mechanics: [{ source_ref: 'material:board', mechanics: {
        mass_grams: 801, external_hand_cost: 1, carry_form: 'regular',
        packing_slot_cost: 3, quantity: null, container: null } }],
      output_count: 2
    }), { code: 'ITEM_ACTION_PRODUCED_MECHANICS_GAP' });
  });

test('preserve source keeps ordinary mechanics without a discrete quantity',
  () => {
    const request = mechanicsRequest({ identity_mode: 'preserve_source',
      origin: null, source_inputs: [sourceInput('item:garment', 1)] });
    const mechanics = { mass_grams: 900, external_hand_cost: 0,
      carry_form: 'regular', packing_slot_cost: 2, quantity: null,
      container: null };
    const resolution = resolveActionProducedAllocationMechanics({
      mechanics_request: request,
      source_mechanics: [{ source_ref: 'item:garment', mechanics }],
      output_count: 0
    });
    assert.deepEqual(resolution.source_effects[0]
      .mechanics_snapshot_after.mechanics, mechanics);
    assert.deepEqual(resolution.outputs, []);
  });

function mechanicsRequest(overrides = {}) {
  return {
    schema: 'rus.items.action_produced_mechanics_request.v1',
    causal_identity: { request_id: 'request', root_turn_id: 'turn',
      action_ref: 'action', step_index: 1 },
    identity_mode: 'independent_outputs', origin: 'crafted',
    result_class: 'ordinary_physical_result',
    source_inputs: [sourceInput('material:a', 2),
      sourceInput('material:b', 2)],
    tool_inputs: [], qualitative_intent: {},
    technical_limits: { policy_ref: 'policy', policy_version: 1,
      max_new_entities: 4 }, ...overrides
  };
}

function sourceInput(entityRef, available) {
  return { entity_ref: entityRef, finite_resource: {
    quantity: quantity(available), state_version: 1,
    source_resource_node_id: `resource:${entityRef}`,
    lifecycle_state: 'active', schema: 'rus.items.finite_resource_snapshot.v1',
    commit_state: 'committed'
  } };
}

function sourceMechanics(sourceRef, mass, quantityValue, packing) {
  return { source_ref: sourceRef, mechanics: {
    mass_grams: mass, external_hand_cost: 0, carry_form: 'compact',
    packing_slot_cost: packing,
    quantity: { value: quantityValue, unit: 'piece' }, container: null
  } };
}

function quantity(numerator, denominator = 1) {
  return { numerator, denominator, unit: 'piece' };
}
