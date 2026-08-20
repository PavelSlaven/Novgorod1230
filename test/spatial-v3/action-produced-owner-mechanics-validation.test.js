import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveActionProducedAllocationMechanics } from
  '@rus/items-property/action-produced-transition';
import { validateActionProducedOwnerMechanics } from
  '../../apps/game-server/src/infrastructure/postgres/action-produced-mass-conservation.js';

test('P16 replays partial allocation mechanics instead of trusting resealed grams',
  () => {
    const source = sourcePin();
    const causal = { request_id: 'request', root_turn_id: 'turn',
      action_ref: 'action', step_index: 1 };
    const qualitative = { material_extent: 'minor' };
    const resolution = resolveActionProducedAllocationMechanics({
      mechanics_request: { schema:
        'rus.items.action_produced_mechanics_request.v1',
      causal_identity: causal, identity_mode: 'independent_outputs',
      origin: 'crafted', result_class: 'partial_transformation',
      source_inputs: [source.entity_snapshot], tool_inputs: [],
      qualitative_intent: qualitative, technical_limits: {
        policy_ref: 'policy', policy_version: 1, max_new_entities: 4 } },
      source_mechanics: [{ source_ref: source.item_id,
        mechanics: source.item.state.runtime_instance_mechanics_snapshot
          .mechanics }],
      output_count: 2
    });
    const proposal = {
      causal_identity: causal, identity_mode: 'independent_outputs',
      origin: 'crafted', result_class: 'partial_transformation',
      technical_policy_pin: { policy_ref: 'policy', version: 1,
        max_new_entities: 4 }, qualitative_result: qualitative,
      source_transitions: resolution.source_effects.map((effect) => ({
        entity_ref: effect.source_ref, finite_resource_transition: null,
        after: { mechanics_snapshot: effect.mechanics_snapshot_after }
      })),
      results: resolution.outputs.map((output) => ({
        source_ref: output.property_source_ref,
        mechanics_snapshot: output.mechanics_snapshot,
        material_allocations: output.material_allocations
      })), known_waste: []
    };
    assert.doesNotThrow(() =>
      validateActionProducedOwnerMechanics(proposal, [source]));

    const forgedExtent = structuredClone(proposal);
    forgedExtent.source_transitions[0].after.mechanics_snapshot.mechanics
      .mass_grams = 400;
    for (const result of forgedExtent.results) {
      result.mechanics_snapshot.mechanics.mass_grams = 200;
      result.material_allocations[0].quantity.numerator = 200;
    }
    assert.throws(() =>
      validateActionProducedOwnerMechanics(forgedExtent, [source]), {
      code: 'ACTION_PRODUCED_RESULT_INVALID'
    });

    const forgedAllocation = structuredClone(proposal);
    forgedAllocation.results[0].material_allocations[0].quantity.numerator = 1;
    assert.throws(() =>
      validateActionProducedOwnerMechanics(forgedAllocation, [source]), {
      code: 'ACTION_PRODUCED_RESULT_INVALID'
    });
  });

function sourcePin() {
  const mechanics = { schema: 'rus.items.runtime_instance_mechanics_snapshot.v1',
    version: 1, provenance: { source_kind: 'ordinary_direct_action_result',
      root_turn_id: 'previous-turn', step_index: 1,
      operation_ref: 'previous-action', origin_kind: 'crafted',
      source_refs: ['item:board'] }, mechanics: { mass_grams: 800,
      external_hand_cost: 1, carry_form: 'long', packing_slot_cost: 6,
      quantity: null, container: null } };
  return { item_id: 'item:board', item: { template_id: null,
    state: { runtime_instance_mechanics_snapshot: mechanics } },
  entity_snapshot: { entity_ref: 'item:board', state_version: '7',
    mechanics_state_ref: 'mechanics:7', property_state_ref: 'property:7',
    placement_state_ref: 'placement:7', holder_ref: 'actor:mikula',
    controller_ref: 'actor:mikula', finite_resource: null } };
}
