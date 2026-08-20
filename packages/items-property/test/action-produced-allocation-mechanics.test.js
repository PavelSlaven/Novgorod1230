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
      mass_grams: 400, external_hand_cost: 0, carry_form: 'compact',
      packing_slot_cost: 1, quantity: { value: 1, unit: 'item' },
      container: null
    }, allocations: [{ source_ref: 'material:board', quantity: {
      numerator: 1, denominator: 2, unit: 'whole_item'
    } }] })));
  });

test('allocation mechanics conserves odd mass without inheriting board shape',
  () => {
    const resolution = resolveActionProducedAllocationMechanics({
      mechanics_request: mechanicsRequest({ source_inputs: [{
        entity_ref: 'material:board', finite_resource: null }] }),
      source_mechanics: [{ source_ref: 'material:board', mechanics: {
        mass_grams: 801, external_hand_cost: 1, carry_form: 'regular',
        packing_slot_cost: 3, quantity: null, container: null } }],
      output_count: 2
    });
    assert.deepEqual(resolution.outputs.map(({ mechanics_snapshot: value }) =>
      value.mechanics), [{ mass_grams: 401, external_hand_cost: 0,
      carry_form: 'compact', packing_slot_cost: 1,
      quantity: { value: 1, unit: 'item' }, container: null }, {
      mass_grams: 400, external_hand_cost: 0, carry_form: 'compact',
      packing_slot_cost: 1, quantity: { value: 1, unit: 'item' },
      container: null }]);
  });

test('partial outputs consume a grounded minor extent and preserve source',
  () => {
    const resolution = resolveActionProducedAllocationMechanics({
      mechanics_request: mechanicsRequest({
        result_class: 'partial_transformation',
        qualitative_intent: { material_extent: 'minor',
          result_descriptor: { physical_form: 'compact' } },
        source_inputs: [{ entity_ref: 'material:board',
          finite_resource: null }] }),
      source_mechanics: [{ source_ref: 'material:board', mechanics: {
        mass_grams: 800, external_hand_cost: 1,
        carry_form: 'long', packing_slot_cost: 6, quantity: null,
        container: null } }],
      output_count: 2
    });

    assert.deepEqual(resolution.source_effects, [{
      source_ref: 'material:board',
      requested_decrement: { numerator: 200, denominator: 1, unit: 'gram' },
      mechanics_snapshot_after: {
        schema: 'rus.items.runtime_instance_mechanics_snapshot.v1',
        version: 1,
        provenance: { source_kind: 'ordinary_direct_action_result',
          root_turn_id: 'turn', step_index: 1, operation_ref: 'action',
          origin_kind: 'crafted', source_refs: ['material:board'] },
        mechanics: { mass_grams: 600, external_hand_cost: 1,
          carry_form: 'long', packing_slot_cost: 6, quantity: null,
          container: null }
      }
    }]);
    assert.deepEqual(resolution.outputs.map((output) => ({
      mechanics: output.mechanics_snapshot.mechanics,
      allocations: output.material_allocations
    })), [1, 2].map(() => ({
      mechanics: { mass_grams: 100, external_hand_cost: 0,
        carry_form: 'compact', packing_slot_cost: 1,
        quantity: { value: 1, unit: 'item' }, container: null },
      allocations: [{ source_ref: 'material:board', quantity: {
        numerator: 100, denominator: 1, unit: 'gram'
      } }]
    })));
});

test('preserve source keeps ordinary mechanics without a discrete quantity',
  () => {
    const request = mechanicsRequest({ identity_mode: 'preserve_source',
      origin: null, qualitative_intent: { material_extent: null },
      source_inputs: [sourceInput('item:garment', 1)] });
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

test('preserve source can consume another material into the same identity',
  () => {
    const request = mechanicsRequest({ identity_mode: 'preserve_source',
      origin: null, qualitative_intent: { material_extent: 'whole' },
      source_inputs: [{ entity_ref: 'item:handle', finite_resource: null },
        { entity_ref: 'item:wrap', finite_resource: null }] });
    const resolution = resolveActionProducedAllocationMechanics({
      mechanics_request: request,
      source_mechanics: [{ source_ref: 'item:handle', mechanics: {
        mass_grams: 600, external_hand_cost: 0, carry_form: 'regular',
        packing_slot_cost: 2, quantity: null, container: null } },
      { source_ref: 'item:wrap', mechanics: {
        mass_grams: 100, external_hand_cost: 0, carry_form: 'compact',
        packing_slot_cost: 1, quantity: null, container: null } }],
      output_count: 0
    });

    assert.deepEqual(resolution.source_effects.map((effect) => ({
      ref: effect.source_ref, after: effect.mechanics_snapshot_after?.mechanics
        ?? null
    })), [{ ref: 'item:handle', after: {
      mass_grams: 700, external_hand_cost: 1, carry_form: 'regular',
      packing_slot_cost: 3, quantity: null, container: null
    } }, { ref: 'item:wrap', after: null }]);
    assert.deepEqual(resolution.outputs, []);
  });

test('equal mass uses qualitative physical form for inventory mechanics', () => {
  const resolve = (physicalForm) => resolveActionProducedAllocationMechanics({
    mechanics_request: mechanicsRequest({
      qualitative_intent: { material_extent: 'whole',
        result_descriptor: { physical_form: physicalForm } },
      source_inputs: [{ entity_ref: 'material:one', finite_resource: null }]
    }),
    source_mechanics: [{ source_ref: 'material:one', mechanics: {
      mass_grams: 800, external_hand_cost: 1, carry_form: 'long',
      packing_slot_cost: 6, quantity: null, container: null } }],
    output_count: 1
  }).outputs[0].mechanics_snapshot.mechanics;

  assert.deepEqual(resolve('compact'), { mass_grams: 800,
    external_hand_cost: 0, carry_form: 'compact', packing_slot_cost: 1,
    quantity: { value: 1, unit: 'item' }, container: null });
  assert.deepEqual(resolve('long'), { mass_grams: 800,
    external_hand_cost: 1, carry_form: 'long', packing_slot_cost: 3,
    quantity: { value: 1, unit: 'item' }, container: null });
});

test('preserve source can change inventory geometry without changing mass', () => {
  const resolution = resolveActionProducedAllocationMechanics({
    mechanics_request: mechanicsRequest({ identity_mode: 'preserve_source',
      origin: null, qualitative_intent: { material_extent: null,
        result_descriptor: { physical_form: 'compact' } },
      source_inputs: [{ entity_ref: 'item:pole', finite_resource: null }] }),
    source_mechanics: [{ source_ref: 'item:pole', mechanics: {
      mass_grams: 900, external_hand_cost: 1, carry_form: 'long',
      packing_slot_cost: 6, quantity: null, container: null } }],
    output_count: 0
  });
  assert.deepEqual(resolution.source_effects[0].mechanics_snapshot_after
    .mechanics, { mass_grams: 900, external_hand_cost: 0,
    carry_form: 'compact', packing_slot_cost: 1, quantity: null,
    container: null });
});

test('finite A1 sources consume one discrete committed unit per action', () => {
  const resolve = (resultClass, extent) =>
    resolveActionProducedAllocationMechanics({
      mechanics_request: mechanicsRequest({ result_class: resultClass,
        qualitative_intent: { material_extent: extent,
          result_descriptor: { physical_form: 'compact' } },
        source_inputs: [sourceInput('material:finite', 2)] }),
      source_mechanics: [sourceMechanics('material:finite', 400, 2, 2)],
      output_count: 1
    }).source_effects[0].requested_decrement;
  assert.deepEqual(resolve('partial_transformation', 'minor'), quantity(1));
  assert.deepEqual(resolve('ordinary_physical_result', 'whole'), quantity(1));
});

function mechanicsRequest(overrides = {}) {
  const request = {
    schema: 'rus.items.action_produced_mechanics_request.v1',
    causal_identity: { request_id: 'request', root_turn_id: 'turn',
      action_ref: 'action', step_index: 1 },
    identity_mode: 'independent_outputs', origin: 'crafted',
    result_class: 'ordinary_physical_result',
    source_inputs: [sourceInput('material:a', 2),
      sourceInput('material:b', 2)],
    tool_inputs: [], qualitative_intent: { material_extent: 'whole',
      result_descriptor: { physical_form: 'compact' } },
    technical_limits: { policy_ref: 'policy', policy_version: 1,
      max_new_entities: 4 }, ...overrides
  };
  return request;
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
