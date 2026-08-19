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
const SCALED_KEYS = [
  'mass_grams', 'external_hand_cost', 'packing_slot_cost'
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
    if (outputCount !== 0 || request.source_inputs.length !== 1) invalid();
    const source = request.source_inputs[0];
    return resolution(request, [{ source_ref: source.entity_ref,
      requested_decrement: null,
      mechanics_snapshot_after: snapshot(request,
        byRef.get(source.entity_ref), request.causal_identity.action_ref)
    }], []);
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

function independentResolution(request, byRef, outputCount) {
  const sourceRefs = request.source_inputs.map(({ entity_ref: ref }) => ref);
  const consumed = request.source_inputs.map((source) => {
    const finite = source.finite_resource;
    const mechanics = byRef.get(source.entity_ref);
    if (finite?.lifecycle_state !== 'active') gap();
    const quantity = exactFiniteQuantity(finite?.quantity);
    if (mechanics.quantity?.unit !== quantity.unit
        || !Number.isSafeInteger(mechanics.quantity.value)
        || mechanics.quantity.value * quantity.denominator
          !== quantity.numerator || quantity.numerator < quantity.denominator) {
      gap();
    }
    const allocated = scaledMechanics(mechanics,
      quantity.denominator, quantity.numerator);
    return { source, mechanics, quantity, allocated };
  });
  const carryForms = new Set(consumed.map(({ mechanics }) =>
    mechanics.carry_form));
  if (carryForms.size !== 1) gap();
  const outputMechanics = {
    ...Object.fromEntries(SCALED_KEYS.map((key) => [key,
      exactDivide(consumed.reduce((sum, entry) =>
        sum + entry.allocated[key], 0), outputCount)])),
    carry_form: consumed[0].mechanics.carry_form,
    quantity: { value: 1, unit: 'item' }, container: null
  };
  const effects = consumed.map(({ source, mechanics, quantity, allocated }) => {
    const remainingNumerator = quantity.numerator - quantity.denominator;
    const after = {
      ...Object.fromEntries(SCALED_KEYS.map((key) => [key,
        mechanics[key] - allocated[key]])),
      carry_form: mechanics.carry_form,
      quantity: remainingNumerator === 0 ? null : {
        value: remainingNumerator / quantity.denominator,
        unit: quantity.unit
      }, container: null
    };
    return { source_ref: source.entity_ref,
      requested_decrement: rational(1, 1, quantity.unit),
      mechanics_snapshot_after: snapshot(request, after,
        request.causal_identity.action_ref) };
  });
  const outputs = Array.from({ length: outputCount }, (_, index) => {
    const ordinal = index + 1;
    const outputRef = createActionProducedOutputIdentity({
      root_turn_id: request.causal_identity.root_turn_id,
      action_ref: request.causal_identity.action_ref, ordinal
    });
    return { ordinal, property_source_ref: sourceRefs[0],
      mechanics_snapshot: snapshot(request, outputMechanics, outputRef),
      material_allocations: consumed.map(({ source, quantity }) => ({
        source_ref: source.entity_ref,
        quantity: rational(1, outputCount, quantity.unit)
      })) };
  });
  return resolution(request, effects, outputs);
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

function scaledMechanics(mechanics, numerator, denominator) {
  return Object.fromEntries(SCALED_KEYS.map((key) => [key,
    exactRatio(mechanics[key], numerator, denominator)]));
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

function exactRatio(value, numerator, denominator) {
  const product = BigInt(value) * BigInt(numerator);
  const divisor = BigInt(denominator);
  if (product % divisor !== 0n) gap();
  const result = product / divisor;
  if (result > BigInt(Number.MAX_SAFE_INTEGER)) gap();
  return Number(result);
}
function exactDivide(value, divisor) { return exactRatio(value, 1, divisor); }
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
