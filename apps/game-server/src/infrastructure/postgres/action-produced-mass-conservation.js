import { isDeepStrictEqual } from 'node:util';
import { createRuntimeInstanceMechanicsSnapshot,
  resolveInventoryMechanicsProfile } from '@rus/items-property';
import { resolveActionProducedAllocationMechanics } from
  '@rus/items-property/action-produced-transition';
import { failActionProducedPersistence as fail } from
  './action-produced-persistence-boundary.js';

export function validateActionProducedOwnerMechanics(proposal, sourcePins) {
  let expected;
  try {
    expected = resolveActionProducedAllocationMechanics({
      mechanics_request: mechanicsRequest(proposal, sourcePins),
      source_mechanics: sourcePins.map((pin) => ({
        source_ref: pin.item_id, mechanics: committedMechanics(pin.item)
      })),
      output_count: proposal.results.length
    });
  } catch { fail('ACTION_PRODUCED_RESULT_INVALID'); }
  const actual = {
    schema: 'rus.items.action_produced_owner_resolution.v1',
    identity_mode: proposal.identity_mode,
    source_effects: proposal.source_transitions.map((entry) => {
      const pin = sourcePins.find(({ item_id: itemId }) =>
        itemId === entry.entity_ref);
      const partial = proposal.result_class === 'partial_transformation'
        && entry.finite_resource_transition === null
        && entry.after.mechanics_snapshot !== null;
      return { source_ref: entry.entity_ref,
        requested_decrement: entry.finite_resource_transition
          ?.decrement_quantity ?? (partial
            ? { numerator: actionProducedConsumedMass(entry, pin),
              denominator: 1, unit: 'gram' } : null),
        mechanics_snapshot_after: entry.after.mechanics_snapshot };
    }),
    outputs: proposal.results.map((result, index) => ({ ordinal: index + 1,
      property_source_ref: result.source_ref,
      mechanics_snapshot: result.mechanics_snapshot,
      material_allocations: result.material_allocations })),
    known_waste: proposal.known_waste
  };
  if (!isDeepStrictEqual(actual, expected)) {
    fail('ACTION_PRODUCED_RESULT_INVALID');
  }
}

export function actionProducedConsumedMass(entry, pin) {
  const mechanics = committedMechanics(pin?.item);
  const finite = entry.finite_resource_transition;
  const after = entry.after.mechanics_snapshot == null ? null
    : createRuntimeInstanceMechanicsSnapshot(
      entry.after.mechanics_snapshot).mechanics;
  if (finite !== null && after !== null
      && after.mass_grams !== remainingMass(mechanics.mass_grams,
        finite.after_quantity, finite.before_quantity)) {
    fail('ACTION_PRODUCED_RESULT_INVALID');
  }
  const consumed = after === null ? mechanics.mass_grams
    : mechanics.mass_grams - after.mass_grams;
  if (consumed < 0) fail('ACTION_PRODUCED_RESULT_INVALID');
  return consumed;
}

function committedMechanics(item) {
  if (item == null) fail('ACTION_PRODUCED_RESULT_INVALID');
  const templateId = item.template_id;
  const instance = templateId === null
    ? { template_id: null, runtime_instance_mechanics_snapshot:
      item.state?.runtime_instance_mechanics_snapshot }
    : { template_id: templateId };
  const profiles = templateId === null ? [] : [{
    ...structuredClone(item.state?.inventory_profile_snapshot),
    template_id: templateId
  }];
  const resolved = resolveInventoryMechanicsProfile({ instance, profiles });
  if (!resolved.pass) fail('ACTION_PRODUCED_RESULT_INVALID');
  const { mass_grams, external_hand_cost, carry_form, packing_slot_cost,
    quantity, container } = resolved.profile;
  return { mass_grams, external_hand_cost, carry_form, packing_slot_cost,
    quantity: structuredClone(quantity), container };
}

function mechanicsRequest(proposal, sourcePins) {
  return {
    schema: 'rus.items.action_produced_mechanics_request.v1',
    causal_identity: structuredClone(proposal.causal_identity),
    identity_mode: proposal.identity_mode, origin: proposal.origin,
    result_class: proposal.result_class,
    source_inputs: sourcePins.map(({ entity_snapshot: value }) => ({
      entity_ref: value.entity_ref, state_version: value.state_version,
      holder_ref: value.holder_ref, controller_ref: value.controller_ref,
      finite_resource: structuredClone(value.finite_resource)
    })),
    tool_inputs: [],
    qualitative_intent: structuredClone(proposal.qualitative_result),
    technical_limits: {
      policy_ref: proposal.technical_policy_pin.policy_ref,
      policy_version: proposal.technical_policy_pin.version,
      max_new_entities: proposal.technical_policy_pin.max_new_entities
    }
  };
}

function remainingMass(mass, part, whole) {
  const numerator = BigInt(mass) * BigInt(part.numerator)
    * BigInt(whole.denominator);
  const denominator = BigInt(part.denominator) * BigInt(whole.numerator);
  if (denominator === 0n) fail('ACTION_PRODUCED_RESULT_INVALID');
  const value = numerator / denominator;
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    fail('ACTION_PRODUCED_RESULT_INVALID');
  }
  return Number(value);
}
