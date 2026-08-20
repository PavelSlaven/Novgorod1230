import { createRuntimeInstanceMechanicsSnapshot,
  resolveInventoryMechanicsProfile } from '@rus/items-property';
import { failActionProducedPersistence as fail } from
  './action-produced-persistence-boundary.js';

export function validateActionProducedMassConservation(proposal, sourcePins) {
  const consumedMass = proposal.source_transitions.reduce((sum, entry) => {
    const pin = sourcePins.find(({ item_id: itemId }) =>
      itemId === entry.entity_ref);
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
    return sum + consumed;
  }, 0);
  const outputMass = proposal.results.reduce((sum, result) =>
    sum + createRuntimeInstanceMechanicsSnapshot(result.mechanics_snapshot)
      .mechanics.mass_grams, 0);
  if (outputMass > consumedMass
      || proposal.known_waste.length === 0 && outputMass !== consumedMass) {
    fail('ACTION_PRODUCED_RESULT_INVALID');
  }
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
  return resolved.profile;
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
