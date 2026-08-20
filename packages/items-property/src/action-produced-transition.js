import { deepFreeze } from '@rus/kernel';
import { planFiniteResourceDecrement } from './finite-resource-transition.js';
import { createRuntimeInstanceMechanicsSnapshot } from
  './runtime-instance-mechanics.js';
import { createActionProducedOutputAuthority,
  deriveActionProducedOutputProperty } from
  './action-produced-output-authority.js';
import {
  exactActionProducedFunctionOption,
  frozenActionProducedDataProperty,
  nextActionProducedStateVersion,
  snapshotActionProducedBoundary
} from './action-produced-transition-boundary.js';
import {
  actionProducedRational as rational,
  addActionProducedRational as add,
  compareActionProducedRational as compare,
  zeroActionProducedRational as zero
} from './action-produced-transition-rational.js';
import { validateActionProducedEntitySnapshots as validateSnapshots,
  validateActionProducedOutputDestination as validateOutputDestination,
  validateActionProducedOutputPropertyBasis } from
  './action-produced-transition-entities.js';
import { validateActionProducedOutputClass } from './action-produced-output-class.js';
import { createActionProducedOutputIdentity } from
  './action-produced-output-identity.js';
const INPUT_KEYS = ['handoff', 'source_snapshots', 'tool_snapshots',
  'committed_entity_refs', 'technical_policy', 'output_destination'];
const HANDOFF_KEYS = [
  'schema', 'status', 'request_id', 'root_turn_id', 'action_ref',
  'step_index',
  'profile_ref', 'profile_version', 'context_ref', 'context_state_version',
  'actor_ref', 'identity_mode', 'origin', 'result_class', 'source_pins',
  'tool_pins', 'qualitative_result'
];
const PIN_KEYS = [
  'entity_ref', 'state_version', 'access_state', 'holder_ref',
  'controller_ref', 'mechanics_state_ref', 'property_state_ref',
  'ownership_state_ref', 'ownership_basis_ref', 'property_basis_ref',
  'placement_state_ref'
];
const POLICY_KEYS = ['schema', 'version', 'status', 'policy_ref', 'profile_ref', 'profile_version', 'max_new_entities'];
const RESOLUTION_KEYS = ['schema', 'identity_mode', 'source_effects', 'outputs', 'known_waste'];
const SOURCE_EFFECT_KEYS = ['source_ref', 'requested_decrement', 'mechanics_snapshot_after'];
const OUTPUT_KEYS = ['ordinal', 'property_source_ref', 'mechanics_snapshot', 'material_allocations'];
const ALLOCATION_KEYS = ['source_ref', 'quantity'];
const WASTE_KEYS = ['source_ref', 'quantity'];
const QUALITATIVE_KEYS = ['intended_transformation', 'material_extent', 'result_descriptor', 'output_class'];
const DESCRIPTOR_KEYS = ['display_name', 'physical_description', 'qualitative_facts', 'inscription_text'];
const RESULT_CLASSES = new Set(['ordinary_physical_result',
  'partial_transformation', 'nonworking_construction', 'waste',
  'written_carrier', 'no_useful_result']);
const WEAPON_CLASSES = new Set(['improvised_puncture_light',
  'improvised_impact_light', 'improvised_cutting_light',
  'improvised_two_hand_heavy']);
export function createActionProducedTransitionPlanner(options) {
  const resolveMechanics = exactActionProducedFunctionOption(
    options, 'resolveMechanics');
  return (value) => plan(value, resolveMechanics);
}
export { resolveActionProducedAllocationMechanics } from
  './action-produced-allocation-mechanics.js';
function plan(rawInput, resolveMechanics) {
  const input = snapshotActionProducedBoundary(rawInput);
  if (input == null || !exact(input, INPUT_KEYS)
      || !frozenActionProducedDataProperty(rawInput, 'handoff')) fail();
  const handoff = validateHandoff(input.handoff);
  const policy = validatePolicy(input.technical_policy, handoff);
  const outputDestination = validateOutputDestination(
    input.output_destination, handoff.identity_mode, handoff.actor_ref);
  const committedRefs = refs(input.committed_entity_refs, false);
  const sources = validateSnapshots(input.source_snapshots, 'source',
    handoff.source_pins);
  const tools = validateSnapshots(input.tool_snapshots, 'tool',
    handoff.tool_pins);
  if (committedRefs == null
      || [...sources, ...tools].some((entry) =>
        !committedRefs.includes(entry.entity_ref))) fail();
  const mechanicsRequest = deepFreeze({
    schema: 'rus.items.action_produced_mechanics_request.v1',
    causal_identity: {
      request_id: handoff.request_id,
      root_turn_id: handoff.root_turn_id,
      action_ref: handoff.action_ref,
      step_index: handoff.step_index
    },
    identity_mode: handoff.identity_mode,
    origin: handoff.origin,
    result_class: handoff.result_class,
    source_inputs: sources.map(sanitizedEntity),
    tool_inputs: tools.map(sanitizedEntity),
    qualitative_intent: structuredClone(handoff.qualitative_result),
    technical_limits: {
      policy_ref: policy.policy_ref,
      policy_version: policy.version,
      max_new_entities: policy.max_new_entities
    }
  });
  const resolution = snapshotActionProducedBoundary(
    resolveMechanics(mechanicsRequest));
  if (resolution == null || !exact(resolution, RESOLUTION_KEYS)
      || resolution.schema !== 'rus.items.action_produced_owner_resolution.v1'
      || resolution.identity_mode !== handoff.identity_mode) fail();
  const effects = validateSourceEffects(resolution.source_effects, sources,
    handoff);
  const waste = validateWaste(resolution.known_waste, effects);
  const outputs = validateOutputs(resolution.outputs, effects, handoff,
    policy, committedRefs);
  validateConservation(effects, outputs, waste);
  validateIdentityShape(handoff, effects, outputs);

  const sourceTransitions = effects.map(({ source,
    afterStateVersion,
    finiteTransition, mechanicsSnapshot }) => deepFreeze({
    entity_ref: source.entity_ref,
    before: statePin(source),
    after: {
      state_version: afterStateVersion,
      mechanics_snapshot: mechanicsSnapshot,
      property_state_ref: source.property_state_ref,
      placement_state_ref: source.placement_state_ref,
      holder_ref: source.holder_ref,
      controller_ref: source.controller_ref
    },
    finite_resource_transition: finiteTransition
  }));
  const toolPins = tools.map((tool) => {
    const state = statePin(tool);
    return deepFreeze({
      entity_ref: tool.entity_ref,
      before: state,
      after: structuredClone(state)
    });
  });
  const results = handoff.identity_mode === 'preserve_source'
    ? [preservedResult(handoff, effects[0])]
    : outputs.map((output) => producedResult(handoff, output, sources,
      outputDestination));

  return deepFreeze({
    schema: 'rus.items.action_produced_transition_proposal.v1',
    version: 1,
    status: 'sealed',
    causal_identity: {
      request_id: handoff.request_id,
      root_turn_id: handoff.root_turn_id,
      action_ref: handoff.action_ref,
      step_index: handoff.step_index
    },
    context_pin: {
      context_ref: handoff.context_ref,
      context_state_version: handoff.context_state_version,
      profile_ref: handoff.profile_ref,
      profile_version: handoff.profile_version
    },
    technical_policy_pin: {
      policy_ref: policy.policy_ref,
      version: policy.version,
      max_new_entities: policy.max_new_entities
    },
    identity_mode: handoff.identity_mode,
    origin: handoff.origin,
    result_class: handoff.result_class,
    source_transitions: sourceTransitions,
    tool_state_pins: toolPins,
    results,
    known_waste: waste,
    qualitative_result: structuredClone(handoff.qualitative_result)
  });
}
function validateHandoff(value) {
  if (!exact(value, HANDOFF_KEYS)
      || value.schema !== 'rus.items.action_produced_pending_handoff.v1'
      || value.status !== 'pending_code_owned_mechanics'
      || !refs(value.source_pins, false, validatePin)
      || !refs(value.tool_pins, true, validatePin)
      || !text(value.request_id) || !text(value.root_turn_id)
      || !text(value.action_ref) || !validStepIndex(value.step_index)
      || !text(value.profile_ref)
      || !text(value.profile_version) || !text(value.context_ref)
      || !text(value.context_state_version) || !text(value.actor_ref)
      || !['preserve_source', 'independent_outputs',
        'no_useful_result'].includes(value.identity_mode)
      || value.origin !== null
        && !['direct_partition', 'crafted'].includes(value.origin)
      || !RESULT_CLASSES.has(value.result_class)
      || !validateActionProducedOutputClass(
        value.qualitative_result?.output_class,
        value.result_class, value.identity_mode)
      || (value.qualitative_result?.output_class === 'weapon_capable')
        !== WEAPON_CLASSES.has(value.qualitative_result?.result_descriptor
          ?.weapon_qualitative_class)
      || !validQualitativeResult(value.qualitative_result,
        value.identity_mode, value.result_class)) fail();
  return value;
}
function validQualitativeResult(value, identityMode, resultClass) {
  if (!exact(value, QUALITATIVE_KEYS)
      || !text(value.intended_transformation)
      || !exact(value.result_descriptor,
        descriptorKeys(value.result_descriptor))) return false;
  const descriptor = value.result_descriptor;
  return validMaterialExtent(value, identityMode, resultClass)
    && (identityMode === 'independent_outputs'
      ? text(descriptor.display_name) : nullableText(descriptor.display_name))
    && nullableText(descriptor.physical_description)
    && refs(descriptor.qualitative_facts, true) != null
    && nullableText(descriptor.inscription_text);
}
function validMaterialExtent(value, identityMode, resultClass) {
  return identityMode !== 'independent_outputs' ? value.material_extent === null
    : resultClass === 'partial_transformation'
    ? ['minor', 'half', 'major'].includes(value.material_extent)
    : value.material_extent === 'whole';
}
function descriptorKeys(value) { return value != null
  && Object.hasOwn(value, 'weapon_qualitative_class')
  ? [...DESCRIPTOR_KEYS, 'weapon_qualitative_class'] : DESCRIPTOR_KEYS; }
function validatePin(value) {
  return exact(value, PIN_KEYS) && PIN_KEYS.every((key) =>
    ['holder_ref', 'controller_ref'].includes(key)
      ? nullableText(value[key]) : text(value[key]));
}
function validatePolicy(value, handoff) {
  if (!exact(value, POLICY_KEYS)
      || value.schema !== 'rus.items.action_produced_technical_policy.v1'
      || value.version !== 1 || value.status !== 'committed'
      || !text(value.policy_ref)
      || value.profile_ref !== handoff.profile_ref
      || value.profile_version !== handoff.profile_version
      || !Number.isSafeInteger(value.max_new_entities)
      || value.max_new_entities < 1 || value.max_new_entities > 8) fail();
  return value;
}
function validateSourceEffects(values, sources, handoff) {
  if (!Array.isArray(values) || values.length !== sources.length) fail();
  const byRef = new Map(sources.map((source) => [source.entity_ref, source]));
  const seen = new Set();
  return values.map((effect) => {
    if (!exact(effect, SOURCE_EFFECT_KEYS) || seen.has(effect.source_ref)
        || !byRef.has(effect.source_ref)) fail();
    seen.add(effect.source_ref);
    const source = byRef.get(effect.source_ref);
    let finiteTransition = null;
    if (source.finite_resource === null) {
      if (effect.requested_decrement !== null) {
        const partial = rational(effect.requested_decrement, false);
        if (handoff.identity_mode !== 'independent_outputs'
          || handoff.result_class !== 'partial_transformation'
          || partial.unit !== 'gram') fail();
      }
    } else {
      if (effect.requested_decrement !== null) {
        rational(effect.requested_decrement, false);
        finiteTransition = planFiniteResourceDecrement({
          source_resource_node_id:
            source.finite_resource.source_resource_node_id,
          expected_state_version: source.finite_resource.state_version,
          causal_transition_identity:
            `${handoff.action_ref}:source:${source.entity_ref}`,
          source: {
            state_version: source.finite_resource.state_version,
            lifecycle_state: source.finite_resource.lifecycle_state,
            quantity: source.finite_resource.quantity
          },
          requested_decrement: effect.requested_decrement
        });
      }
    }
    const mechanicsSnapshot = effect.mechanics_snapshot_after === null ? null
      : mechanics(effect.mechanics_snapshot_after, handoff, handoff.action_ref);
    const retireSource = handoff.identity_mode === 'independent_outputs'
      && source.finite_resource === null && mechanicsSnapshot === null;
    const partialWholeSource = handoff.identity_mode === 'independent_outputs'
      && handoff.result_class === 'partial_transformation'
      && source.finite_resource === null && mechanicsSnapshot !== null
      && effect.requested_decrement !== null;
    const changed = finiteTransition !== null || mechanicsSnapshot !== null
      || retireSource;
    const afterStateVersion = changed ? nextActionProducedStateVersion(source.state_version)
      : source.state_version;
    return { source, effect, afterStateVersion,
      finiteTransition, mechanicsSnapshot, retireSource, partialWholeSource };
  });
}
function validateOutputs(values, effects, handoff, policy, committedRefs) {
  if (!Array.isArray(values) || values.length > policy.max_new_entities) fail();
  const sources = new Map(effects.map((entry) => [
    entry.source.entity_ref, entry
  ]));
  const outputRefs = new Set();
  return values.map((value, index) => {
    if (!exact(value, OUTPUT_KEYS) || value.ordinal !== index + 1
        || !sources.has(value.property_source_ref)) fail();
    const entityRef = outputRef(handoff, value.ordinal);
    if (committedRefs.includes(entityRef) || outputRefs.has(entityRef)) fail();
    outputRefs.add(entityRef);
    const allocations = allocationsFor(value.material_allocations, sources);
    validateActionProducedOutputPropertyBasis(value.property_source_ref,
      allocations,
      sources);
    const mechanicsSnapshot = mechanics(value.mechanics_snapshot, handoff,
      entityRef);
    return {
      entity_ref: entityRef,
      ordinal: value.ordinal,
      property_source_ref: value.property_source_ref,
      material_allocations: allocations,
      mechanics_snapshot: mechanicsSnapshot
    };
  });
}
function validateWaste(values, effects) {
  if (!Array.isArray(values)) fail();
  const sources = new Map(effects.map((entry) => [
    entry.source.entity_ref, entry
  ]));
  const seen = new Set();
  return values.map((value) => {
    if (!exact(value, WASTE_KEYS) || seen.has(value.source_ref)
        || !sources.has(value.source_ref)) fail();
    seen.add(value.source_ref);
    const source = sources.get(value.source_ref);
    const quantity = rational(value.quantity, false);
    sameFiniteUnit(source, quantity);
    return { source_ref: value.source_ref, quantity };
  });
}
function allocationsFor(values, sources) {
  if (!Array.isArray(values)) fail();
  const seen = new Set();
  return values.map((value) => {
    if (!exact(value, ALLOCATION_KEYS) || seen.has(value.source_ref)
        || !sources.has(value.source_ref)) fail();
    seen.add(value.source_ref);
    const quantity = rational(value.quantity, false);
    sameFiniteUnit(sources.get(value.source_ref), quantity);
    return { source_ref: value.source_ref, quantity };
  });
}
function validateConservation(effects, outputs, waste) {
  for (const source of effects) {
    const conserved = source.finiteTransition?.decrement_quantity
      ?? (source.partialWholeSource ? source.effect.requested_decrement : null)
      ?? (source.retireSource
        ? { numerator: 1, denominator: 1, unit: 'whole_item' } : null);
    if (conserved === null) continue;
    let total = zero(conserved.unit);
    for (const output of outputs) {
      const allocation = output.material_allocations.find((entry) =>
        entry.source_ref === source.source.entity_ref);
      if (allocation) total = add(total, allocation.quantity);
    }
    const discarded = waste.find((entry) =>
      entry.source_ref === source.source.entity_ref);
    if (discarded) total = add(total, discarded.quantity);
    if (compare(total, conserved) > 0) fail();
  }
}
function validateIdentityShape(handoff, effects, outputs) {
  if (handoff.identity_mode === 'preserve_source') {
    if (effects.length !== 1 || outputs.length !== 0
        || effects[0].mechanicsSnapshot === null) fail();
    return;
  }
  if (handoff.identity_mode === 'independent_outputs') {
    if (outputs.length === 0
        || outputs.some((output) => output.material_allocations.length === 0)
        || effects.some((effect) => effect.finiteTransition === null
          && effect.retireSource !== true
          && effect.partialWholeSource !== true)) {
      fail();
    }
    return;
  }
  if (outputs.length !== 0) fail();
}
function mechanics(value, handoff, operationRef) {
  const snapshot = createRuntimeInstanceMechanicsSnapshot(value);
  const provenance = snapshot.provenance;
  const expectedOrigin = handoff.origin ?? 'crafted';
  if (provenance.source_kind !== 'ordinary_direct_action_result'
      || provenance.root_turn_id !== handoff.root_turn_id
      || provenance.step_index !== handoff.step_index
      || provenance.operation_ref !== operationRef
      || provenance.origin_kind !== expectedOrigin
      || !sameRefs(provenance.source_refs,
        handoff.source_pins.map(({ entity_ref: ref }) => ref))) fail();
  return snapshot;
}
function preservedResult(handoff, effect) {
  const source = effect.source;
  return deepFreeze({
    entity_ref: source.entity_ref,
    identity_kind: 'preserved_source',
    source_ref: source.entity_ref,
    mechanics_snapshot: structuredClone(effect.mechanicsSnapshot),
    property_state_ref: source.property_state_ref,
    placement_state_ref: source.placement_state_ref,
    holder_ref: source.holder_ref,
    controller_ref: source.controller_ref,
    physical_facts:
      structuredClone(handoff.qualitative_result.result_descriptor
        .qualitative_facts),
    inscription_text:
      handoff.qualitative_result.result_descriptor.inscription_text,
    output_authority:
      createActionProducedOutputAuthority('preserved_source')
  });
}

function producedResult(handoff, output, sources, destination) {
  const propertySource = sources.find((source) =>
    source.entity_ref === output.property_source_ref);
  const outputProperty = deriveActionProducedOutputProperty(
    propertySource.ownership_snapshot, output.entity_ref,
    destination.controller_ref);
  return deepFreeze({
    entity_ref: output.entity_ref,
    identity_kind: 'independent_output',
    source_ref: output.property_source_ref,
    mechanics_snapshot: structuredClone(output.mechanics_snapshot),
    property_state_ref: outputProperty.property_state_ref,
    placement_state_ref: destination.placement_state_ref,
    holder_ref: destination.holder_ref,
    controller_ref: destination.controller_ref,
    physical_facts:
      structuredClone(handoff.qualitative_result.result_descriptor
        .qualitative_facts),
    inscription_text:
      handoff.qualitative_result.result_descriptor.inscription_text,
    output_authority:
      createActionProducedOutputAuthority('independent_output'),
    material_allocations: output.material_allocations
  });
}

function statePin(value) {
  return deepFreeze({
    state_version: value.state_version,
    mechanics_state_ref: value.mechanics_state_ref,
    property_state_ref: value.property_state_ref,
    placement_state_ref: value.placement_state_ref,
    holder_ref: value.holder_ref,
    controller_ref: value.controller_ref
  });
}
function sanitizedEntity(value) {
  return {
    entity_ref: value.entity_ref,
    state_version: value.state_version,
    mechanics_state_ref: value.mechanics_state_ref,
    property_state_ref: value.property_state_ref,
    placement_state_ref: value.placement_state_ref,
    holder_ref: value.holder_ref,
    controller_ref: value.controller_ref,
    finite_resource: structuredClone(value.finite_resource)
  };
}
function sameFiniteUnit(effect, quantity) {
  const unit = effect.finiteTransition?.decrement_quantity.unit ??
    (effect.partialWholeSource ? effect.effect.requested_decrement.unit
      : effect.retireSource ? 'whole_item' : null);
  if (unit !== quantity.unit) fail();
}
function outputRef(handoff, ordinal) {
  return createActionProducedOutputIdentity({
    root_turn_id: handoff.root_turn_id,
    action_ref: handoff.action_ref,
    ordinal
  });
}
export { createActionProducedOutputIdentity } from
  './action-produced-output-identity.js';
function sameRefs(left, right) {
  return left.length === right.length
    && left.every((value, index) => value === right[index]);
}
function refs(value, allowEmpty, validate = text) {
  if (!Array.isArray(value) || !allowEmpty && value.length === 0
      || !value.every(validate)) return null;
  const identities = value.map((entry) => typeof entry === 'string'
    ? entry : entry.entity_ref);
  return new Set(identities).size === identities.length ? value : null;
}
function exact(value, keys) {
  return record(value) && Object.keys(value).length === keys.length
    && keys.every((key) => Object.hasOwn(value, key));
}
function record(value) { return value != null && typeof value === 'object'
  && !Array.isArray(value); }
function nullableText(value) { return value === null || text(value); }
function validStepIndex(value) { return Number.isSafeInteger(value)
  && value >= 1 && value <= 8; }
function text(value) { return typeof value === 'string' && value.length > 0
  && value.trim() === value; }
function fail() { throw Object.assign(new TypeError(
  'ITEM_ACTION_PRODUCED_TRANSITION_INVALID'),
{ code: 'ITEM_ACTION_PRODUCED_TRANSITION_INVALID' }); }
