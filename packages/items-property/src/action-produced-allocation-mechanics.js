import { createRuntimeInstanceMechanicsSnapshot } from
  './runtime-instance-mechanics.js';
import { createActionProducedOutputIdentity } from
  './action-produced-output-identity.js';
import { snapshotActionProducedBoundary } from
  './action-produced-transition-boundary.js';

const MECHANICS_KEYS = [
  'mass_grams', 'external_hand_cost', 'carry_form', 'packing_slot_cost',
  'quantity', 'container'
];

export function resolveActionProducedAllocationMechanics(rawInput) {
  const input = snapshotActionProducedBoundary(rawInput);
  const request = input?.mechanics_request;
  const sources = input?.source_mechanics;
  const outputCount = input?.output_count;
  if (!exact(input, ['mechanics_request', 'source_mechanics', 'output_count'])
      || request?.schema !== 'rus.items.action_produced_mechanics_request.v1'
      || !Array.isArray(request.source_inputs)
      || request.source_inputs.length === 0
      || !Number.isSafeInteger(request.technical_limits?.max_new_entities)
      || request.technical_limits.max_new_entities < 1
      || request.technical_limits.max_new_entities > 8
      || !Array.isArray(sources)
      || !Number.isSafeInteger(outputCount) || outputCount < 0
      || outputCount > request.technical_limits.max_new_entities) invalid();
  const byRef = sourceMechanics(sources, request.source_inputs);
  if (request.identity_mode === 'preserve_source') {
    return preserveResolution(request, byRef, outputCount);
  }
  if (request.identity_mode === 'no_useful_result') {
    if (outputCount !== 0) invalid();
    return resolution(request, request.source_inputs.map((source) => ({
      source_ref: source.entity_ref, requested_decrement: null,
      mechanics_snapshot_after: null
    })), []);
  }
  if (request.identity_mode !== 'independent_outputs' || outputCount < 1) {
    invalid();
  }
  return independentResolution(request, byRef, outputCount);
}

function preserveResolution(request, byRef, outputCount) {
  if (outputCount !== 0) invalid();
  const [primary, ...materials] = request.source_inputs;
  const extent = request.qualitative_intent?.material_extent;
  const physicalForm = request.qualitative_intent?.result_descriptor
    ?.physical_form ?? null;
  if (materials.length === 0) {
    if (extent !== null) invalid();
    const mechanics = byRef.get(primary.entity_ref);
    const after = physicalForm === null ? mechanics
      : derivedMechanics(mechanics.mass_grams, 0, mechanics.quantity,
        physicalForm);
    return resolution(request, [{ source_ref: primary.entity_ref,
      requested_decrement: null,
      mechanics_snapshot_after: snapshot(request,
        after, request.causal_identity.action_ref)
    }], []);
  }
  if (!['minor', 'half', 'major', 'whole'].includes(extent)) gap();
  const consumed = materials.map((source) => consumeSource(source,
    byRef.get(source.entity_ref), extent, 0));
  const primaryMechanics = byRef.get(primary.entity_ref);
  const mass = primaryMechanics.mass_grams + consumed.reduce((sum, entry) =>
    sum + entry.consumedMass, 0);
  const packing = Math.ceil(primaryMechanics.packing_slot_cost
    + consumed.reduce((sum, entry) => sum + entry.consumedPacking, 0));
  const afterPrimary = derivedMechanics(mass,
    physicalForm === null ? packing : 0, primaryMechanics.quantity,
    physicalForm ?? primaryMechanics.carry_form);
  return resolution(request, [{ source_ref: primary.entity_ref,
    requested_decrement: null,
    mechanics_snapshot_after: snapshot(request, afterPrimary,
      request.causal_identity.action_ref)
  }, ...consumed.map((entry) => sourceEffect(request, entry))], []);
}

function independentResolution(request, byRef, outputCount) {
  const sourceRefs = request.source_inputs.map(({ entity_ref: ref }) => ref);
  const partial = request.result_class === 'partial_transformation';
  const extent = request.qualitative_intent?.material_extent;
  const physicalForm = request.qualitative_intent?.result_descriptor
    ?.physical_form ?? null;
  const sourcePhysicalForm = request.qualitative_intent?.result_descriptor
    ?.source_fact_delta?.physical_form ?? null;
  if ((partial ? !['minor', 'half', 'major'].includes(extent)
    : extent !== 'whole') || physicalForm === null
      || partial && (request.source_inputs.length !== 1
        || sourcePhysicalForm === null)) gap();
  const consumed = request.source_inputs.map((source) => consumeSource(source,
    byRef.get(source.entity_ref), partial ? extent : 'whole', outputCount));
  const totalMass = consumed.reduce((sum, entry) =>
    sum + entry.consumedMass, 0);
  if (totalMass < outputCount) gap();
  const baseMass = Math.floor(totalMass / outputCount);
  const remainderMass = totalMass % outputCount;
  const effects = consumed.map((entry) => sourceEffect(request, entry,
    partial ? sourcePhysicalForm : null));
  const outputs = Array.from({ length: outputCount }, (_, index) => {
    const ordinal = index + 1;
    const outputRef = createActionProducedOutputIdentity({
      root_turn_id: request.causal_identity.root_turn_id,
      action_ref: request.causal_identity.action_ref, ordinal
    });
    const outputMechanics = derivedMechanics(
      baseMass + Number(index < remainderMass), 0,
      { value: 1, unit: 'item' }, physicalForm);
    return { ordinal, property_source_ref: sourceRefs[0],
      mechanics_snapshot: snapshot(request, outputMechanics, outputRef),
      material_allocations: consumed.map(({ source, allocations }) => ({
        source_ref: source.entity_ref,
        quantity: structuredClone(allocations[index])
      })) };
  });
  return resolution(request, effects, outputs);
}

function consumeSource(source, mechanics, extent, outputCount) {
    const finite = source.finite_resource;
    if (finite === null) {
      if (mechanics.quantity !== null
          && (mechanics.quantity.value !== 1
            || mechanics.quantity.unit !== 'item')) gap();
      const partial = extent !== 'whole';
      const consumedMass = partial
        ? partialMass(mechanics.mass_grams, extent,
          Math.max(1, outputCount))
        : mechanics.mass_grams;
      if (outputCount > 0 && consumedMass < outputCount) gap();
      return { source, mechanics,
        quantity: partial
          ? rational(consumedMass, 1, 'gram')
          : rational(1, 1, 'whole_item'),
        allocations: outputCount === 0 ? [] : partial
          ? distribute(consumedMass, outputCount, 'gram')
          : Array.from({ length: outputCount }, () =>
              rational(1, outputCount, 'whole_item')),
        consumedMass, consumedPacking: mechanics.packing_slot_cost
          * consumedMass / mechanics.mass_grams,
        retire: !partial };
    }
    if (finite.lifecycle_state !== 'active') gap();
    const quantity = exactFiniteQuantity(finite?.quantity);
    if (mechanics.quantity?.unit !== quantity.unit
        || !Number.isSafeInteger(mechanics.quantity.value)
        || mechanics.quantity.value * quantity.denominator
          !== quantity.numerator || quantity.numerator < quantity.denominator) {
      gap();
    }
    return { source, mechanics, quantity,
      allocations: Array.from({ length: outputCount }, () =>
        rational(1, outputCount, quantity.unit)),
      consumedMass: ceilRatio(mechanics.mass_grams,
        quantity.denominator, quantity.numerator),
      consumedPacking: mechanics.packing_slot_cost * quantity.denominator
        / quantity.numerator, retire: false };
}

function sourceEffect(request, { source, mechanics, quantity, consumedMass,
  retire }, physicalForm = null) {
    if (retire) return { source_ref: source.entity_ref,
      requested_decrement: null, mechanics_snapshot_after: null };
    if (source.finite_resource === null) {
      const after = physicalForm === null ? { ...mechanics,
        mass_grams: mechanics.mass_grams - consumedMass }
        : derivedMechanics(mechanics.mass_grams - consumedMass, 0,
          mechanics.quantity, physicalForm);
      return { source_ref: source.entity_ref,
        requested_decrement: rational(consumedMass, 1, 'gram'),
        mechanics_snapshot_after: snapshot(request, after,
          request.causal_identity.action_ref) };
    }
    const remainingNumerator = quantity.numerator - quantity.denominator;
    const remainingQuantity = remainingNumerator === 0 ? null : {
        value: remainingNumerator / quantity.denominator,
        unit: quantity.unit
      };
    const after = remainingNumerator === 0 ? {
      mass_grams: 0, external_hand_cost: 0, packing_slot_cost: 0,
      carry_form: mechanics.carry_form, quantity: null, container: null
    } : physicalForm === null ? {
      mass_grams: mechanics.mass_grams - consumedMass,
      external_hand_cost: mechanics.external_hand_cost,
      packing_slot_cost: mechanics.packing_slot_cost,
      carry_form: mechanics.carry_form,
      quantity: remainingQuantity, container: null
    } : derivedMechanics(mechanics.mass_grams - consumedMass, 0,
      remainingQuantity, physicalForm);
    return { source_ref: source.entity_ref,
      requested_decrement: rational(1, 1, quantity.unit),
      mechanics_snapshot_after: snapshot(request, after,
        request.causal_identity.action_ref) };
}

function partialMass(mass, extent, outputCount) {
  if (!Number.isSafeInteger(mass) || mass < 1) gap();
  const [numerator, denominator] = extent === 'minor' ? [1, 4]
    : extent === 'half' ? [1, 2] : [3, 4];
  const consumed = ceilRatio(mass, numerator, denominator);
  if (consumed < outputCount || consumed >= mass) gap();
  return consumed;
}

function distribute(total, count, unit) {
  const base = Math.floor(total / count);
  const remainder = total % count;
  return Array.from({ length: count }, (_, index) =>
    rational(base + Number(index < remainder), 1, unit));
}

function derivedMechanics(mass, packing, quantity, physicalForm = null) {
  const rank = ['compact', 'regular', 'long', 'bulky'];
  const massForm = mass <= 2_000 && packing <= 2 ? 'compact'
    : mass <= 15_000 && packing <= 8 ? 'regular' : 'bulky';
  const carryForm = rank[Math.max(rank.indexOf(massForm),
    rank.indexOf(physicalForm ?? massForm))];
  const minimumPacking = { compact: 1, regular: 2, long: 3, bulky: 9 }[
    carryForm];
  const packingSlotCost = Math.max(Math.ceil(packing), minimumPacking);
  const weightHandCost = mass <= 2_000 && packingSlotCost <= 2 ? 0
    : mass <= 15_000 && packingSlotCost <= 8 ? 1 : 2;
  const formHandCost = carryForm === 'long' ? 1
    : carryForm === 'bulky' ? 2 : 0;
  const externalHandCost = Math.max(weightHandCost, formHandCost);
  return { mass_grams: mass, external_hand_cost: externalHandCost,
    carry_form: carryForm, packing_slot_cost: packingSlotCost,
    quantity: structuredClone(quantity), container: null };
}

function sourceMechanics(values, inputs) {
  if (values.length !== inputs.length) invalid();
  const expected = new Set(inputs.map(({ entity_ref: ref }) => ref));
  const byRef = new Map();
  for (const entry of values) {
    if (!exact(entry, ['source_ref', 'mechanics'])
        || !expected.has(entry.source_ref) || byRef.has(entry.source_ref)
        || !validMechanics(entry.mechanics)) invalid();
    byRef.set(entry.source_ref, entry.mechanics);
  }
  return byRef;
}

function snapshot(request, mechanics, operationRef) {
  return createRuntimeInstanceMechanicsSnapshot({
    schema: 'rus.items.runtime_instance_mechanics_snapshot.v1', version: 1,
    provenance: { source_kind: 'ordinary_direct_action_result',
      root_turn_id: request.causal_identity.root_turn_id,
      step_index: request.causal_identity.step_index,
      operation_ref: operationRef, origin_kind: request.origin ?? 'crafted',
      source_refs: request.source_inputs.map(({ entity_ref: ref }) => ref) },
    mechanics
  });
}

function resolution(request, sourceEffects, outputs) {
  return { schema: 'rus.items.action_produced_owner_resolution.v1',
    identity_mode: request.identity_mode, source_effects: sourceEffects,
    outputs, known_waste: [] };
}

function validMechanics(value) {
  return exact(value, MECHANICS_KEYS)
    && Number.isSafeInteger(value.mass_grams) && value.mass_grams >= 0
    && [0, 1, 2].includes(value.external_hand_cost)
    && Number.isSafeInteger(value.packing_slot_cost)
    && value.packing_slot_cost >= 0
    && ['compact', 'regular', 'long', 'bulky'].includes(value.carry_form)
    && (value.quantity === null
      || (exact(value.quantity, ['value', 'unit'])
        && Number.isSafeInteger(value.quantity.value)
        && value.quantity.value > 0 && text(value.quantity.unit)))
    && value.container === null;
}

function exactFiniteQuantity(value) {
  if (!exact(value, ['numerator', 'denominator', 'unit'])
      || !Number.isSafeInteger(value.numerator) || value.numerator < 1
      || !Number.isSafeInteger(value.denominator) || value.denominator < 1
      || !text(value.unit)) gap();
  return value;
}

function ceilRatio(value, numerator, denominator) {
  const product = BigInt(value) * BigInt(numerator);
  const divisor = BigInt(denominator);
  const result = (product + divisor - 1n) / divisor;
  if (result > BigInt(Number.MAX_SAFE_INTEGER)) gap();
  return Number(result);
}
function rational(numerator, denominator, unit) {
  const divisor = gcd(numerator, denominator);
  return { numerator: numerator / divisor, denominator: denominator / divisor,
    unit };
}
function gcd(left, right) {
  while (right) [left, right] = [right, left % right];
  return left || 1;
}
function exact(value, keys) {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === keys.length
    && keys.every((key) => Object.hasOwn(value, key));
}
function text(value) { return typeof value === 'string'
  && value.length > 0 && value.trim() === value; }
function invalid() { throw Object.assign(new TypeError(
  'ITEM_ACTION_PRODUCED_MECHANICS_INPUT_INVALID'),
{ code: 'ITEM_ACTION_PRODUCED_MECHANICS_INPUT_INVALID' }); }
function gap() { throw Object.assign(new TypeError(
  'ITEM_ACTION_PRODUCED_MECHANICS_GAP'),
{ code: 'ITEM_ACTION_PRODUCED_MECHANICS_GAP' }); }
