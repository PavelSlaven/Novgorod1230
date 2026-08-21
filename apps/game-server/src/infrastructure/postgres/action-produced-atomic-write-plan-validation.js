import { isDeepStrictEqual } from 'node:util';
import { actionProducedOutputRequiresTool,
  createRuntimeInstanceMechanicsSnapshot } from '@rus/items-property';
import { planFiniteResourceDecrement } from
  '@rus/items-property/finite-resource-transition';
import { createActionProducedOutputIdentity } from
  '@rus/items-property/action-produced-transition';
import {
  actionProducedText as text,
  exactActionProducedRecord as exact,
  failActionProducedPersistence as fail
} from './action-produced-persistence-boundary.js';
import { validateActionProducedProposalResults } from
  './action-produced-atomic-write-plan-result-validation.js';
import { actionProducedConsumedMass,
  validateActionProducedOwnerMechanics } from
  './action-produced-mass-conservation.js';

const PROPOSAL_KEYS = [
  'schema', 'version', 'causal_identity', 'context_pin',
  'technical_policy_pin', 'identity_mode', 'origin', 'result_class',
  'source_transitions', 'tool_state_pins', 'results', 'known_waste',
  'qualitative_result'
];
const CAUSAL_KEYS = ['request_id', 'root_turn_id', 'action_ref', 'step_index'];
const CONTEXT_KEYS = [
  'context_ref', 'context_state_version', 'profile_ref', 'profile_version'
];
const TECHNICAL_KEYS = ['policy_ref', 'version', 'max_new_entities'];
const SOURCE_TRANSITION_KEYS = [
  'entity_ref', 'before', 'after', 'finite_resource_transition'
];

export function validateActionProducedAtomicProposal(value, load) {
  if (!exact(value, PROPOSAL_KEYS)
      || value.schema !== 'rus.items.action_produced_transition_proposal.v1'
      || value.version !== 1
      || !exact(value.causal_identity, CAUSAL_KEYS)
      || !exact(value.context_pin, CONTEXT_KEYS)
      || !exact(value.technical_policy_pin, TECHNICAL_KEYS)
      || !text(value.technical_policy_pin.policy_ref)
      || value.technical_policy_pin.version !== 1
      || !Number.isSafeInteger(value.technical_policy_pin.max_new_entities)
      || value.technical_policy_pin.max_new_entities < 1
      || value.technical_policy_pin.max_new_entities > 8
      || !text(value.causal_identity.request_id)
      || !text(value.causal_identity.root_turn_id)
      || !text(value.causal_identity.action_ref)
      || !Number.isSafeInteger(value.causal_identity.step_index)
      || value.causal_identity.step_index < 1
      || value.causal_identity.step_index > 8
      || value.causal_identity.root_turn_id
        !== load.committed_context.root_turn_id
      || value.causal_identity.action_ref
        !== load.committed_context.action_ref
      || value.causal_identity.step_index
        !== load.committed_context.step_index
      || value.context_pin.context_ref
        !== load.committed_context.context_ref
      || value.context_pin.context_state_version
        !== load.committed_context.state_version
      || !['preserve_source', 'independent_outputs',
        'no_useful_result'].includes(value.identity_mode)
      || !Array.isArray(value.source_transitions)
      || !Array.isArray(value.tool_state_pins)
      || !Array.isArray(value.results)
      || !Array.isArray(value.known_waste)) {
    fail('ACTION_PRODUCED_PROPOSAL_INVALID');
  }
  const sourcePins = load.row_pins.filter(({ role }) => role === 'source');
  const toolPins = load.row_pins.filter(({ role }) => role === 'tool');
  if (actionProducedOutputRequiresTool(
    value.qualitative_result?.output_class) && toolPins.length === 0) {
    fail('ACTION_PRODUCED_PROPOSAL_INVALID');
  }
  if (value.source_transitions.length !== sourcePins.length
      || value.tool_state_pins.length !== toolPins.length) {
    fail('ACTION_PRODUCED_PROPOSAL_INVALID');
  }
  requireExactCoverage(value.source_transitions, sourcePins);
  requireExactCoverage(value.tool_state_pins, toolPins);
  for (const transition of value.source_transitions) {
    if (!exact(transition, SOURCE_TRANSITION_KEYS)) {
      fail('ACTION_PRODUCED_PROPOSAL_INVALID');
    }
    const pin = sourcePins.find(({ item_id }) =>
      item_id === transition.entity_ref);
    if (!pin || !isDeepStrictEqual(transition.before, statePin(pin))
        || transition.after.holder_ref !== pin.entity_snapshot.holder_ref
        || transition.after.controller_ref
          !== pin.entity_snapshot.controller_ref) {
      fail('ACTION_PRODUCED_SOURCE_PIN_MISMATCH');
    }
    const primaryRef = value.source_transitions[0].entity_ref;
    const retireSource = transition.finite_resource_transition === null
      && pin.finite_resource_row === null
      && transition.after.mechanics_snapshot === null
      && (value.identity_mode === 'independent_outputs'
        || value.identity_mode === 'preserve_source'
          && transition.entity_ref !== primaryRef);
    const changed = transition.finite_resource_transition !== null
      || transition.after.mechanics_snapshot !== null || retireSource;
    const expectedAfterVersion = changed
      ? String(Number(transition.before.state_version) + 1)
      : transition.before.state_version;
    if (transition.after.state_version !== expectedAfterVersion) {
      fail('ACTION_PRODUCED_SOURCE_PIN_MISMATCH');
    }
    validateFinite(transition.finite_resource_transition,
      pin.finite_resource_row, value.causal_identity, transition.entity_ref,
      false);
    if (transition.after.mechanics_snapshot !== null) {
      createRuntimeInstanceMechanicsSnapshot(
        transition.after.mechanics_snapshot);
    }
  }
  for (const tool of value.tool_state_pins) {
    const pin = toolPins.find(({ item_id }) => item_id === tool.entity_ref);
    if (!pin || !isDeepStrictEqual(tool.before, statePin(pin))
        || !isDeepStrictEqual(tool.after, tool.before)) {
      fail('ACTION_PRODUCED_TOOL_PIN_MISMATCH');
    }
  }
  validateActionProducedProposalResults(value, sourcePins);
  if (value.identity_mode === 'preserve_source'
      && (value.results.length !== 1
        || value.results[0].identity_kind !== 'preserved_source'
        || value.results[0].entity_ref
          !== value.source_transitions[0].entity_ref
        || !isDeepStrictEqual(value.results[0].mechanics_snapshot,
          value.source_transitions[0].after.mechanics_snapshot))
      || value.identity_mode === 'independent_outputs'
        && (value.results.length < 1
          || value.results.length > value.technical_policy_pin.max_new_entities
          || value.source_transitions.some((transition) => {
            const pin = sourcePins.find(({ item_id: itemId }) =>
              itemId === transition.entity_ref);
            return transition.finite_resource_transition === null
              && !(pin?.finite_resource_row === null
                && (transition.after.mechanics_snapshot === null
                  || value.result_class === 'partial_transformation'
                    && transition.after.mechanics_snapshot !== null));
          })
          || value.results.some(({ identity_kind }) =>
            identity_kind !== 'independent_output'))
      || value.identity_mode === 'no_useful_result'
        && value.results.length !== 0) fail('ACTION_PRODUCED_RESULT_INVALID');
  validateIndependentConservation(value, sourcePins);
  return value;
}

function requireExactCoverage(values, pins) {
  const actual = values.map(({ entity_ref: entityRef }) => entityRef);
  const expected = pins.map(({ item_id: itemId }) => itemId);
  if (new Set(actual).size !== actual.length
      || actual.some((entityRef, index) => entityRef !== expected[index])) {
    fail('ACTION_PRODUCED_PROPOSAL_INVALID');
  }
}

function validateFinite(value, row, causal, itemId, required) {
  if (value === null) {
    if (required) fail('ACTION_PRODUCED_RESOURCE_PIN_MISMATCH');
    return;
  }
  const keys = [
    'schema', 'source_resource_node_id', 'expected_state_version',
    'causal_transition_identity', 'before_quantity', 'decrement_quantity',
    'after_quantity', 'next_state_version', 'lifecycle_state_after'
  ];
  const unit = row?.quantity_unit_ref?.entity_id;
  if (!row || !exact(value, keys)
      || value.schema !== 'rus.items.finite_resource_decrement.v1'
      || value.source_resource_node_id !== row.resource_node_id
      || value.expected_state_version !== row.state_version
      || value.before_quantity.numerator !== row.quantity_numerator
      || value.before_quantity.denominator !== row.quantity_denominator
      || value.before_quantity.unit !== unit
      || value.next_state_version !== row.state_version + 1
      || !['active', 'depleted'].includes(value.lifecycle_state_after)) {
    fail('ACTION_PRODUCED_RESOURCE_PIN_MISMATCH');
  }
  let expected;
  try {
    expected = planFiniteResourceDecrement({
      source_resource_node_id: row.resource_node_id,
      expected_state_version: row.state_version,
      causal_transition_identity: `${causal.action_ref}:source:${itemId}`,
      source: { state_version: row.state_version,
        lifecycle_state: row.lifecycle_state,
        quantity: { numerator: row.quantity_numerator,
          denominator: row.quantity_denominator, unit } },
      requested_decrement: value.decrement_quantity
    });
  } catch { fail('ACTION_PRODUCED_RESOURCE_PIN_MISMATCH'); }
  if (!isDeepStrictEqual(expected, value)) {
    fail('ACTION_PRODUCED_RESOURCE_PIN_MISMATCH');
  }
}

function validateIndependentConservation(proposal, sourcePins) {
  if (proposal.identity_mode === 'independent_outputs'
      || proposal.identity_mode === 'preserve_source'
        && sourcePins.length > 1) {
    validateActionProducedOwnerMechanics(proposal, sourcePins);
  }
  if (proposal.identity_mode !== 'independent_outputs') return;
  const transitions = new Map(proposal.source_transitions.map((entry) => {
    const pin = sourcePins.find(({ item_id: itemId }) =>
      itemId === entry.entity_ref);
    const partialWhole = proposal.result_class === 'partial_transformation'
      && entry.finite_resource_transition === null
      && entry.after.mechanics_snapshot !== null;
    return [entry.entity_ref, entry.finite_resource_transition ?? {
      decrement_quantity: partialWhole
        ? { numerator: actionProducedConsumedMass(entry, pin),
          denominator: 1, unit: 'gram' }
        : { numerator: 1, denominator: 1, unit: 'whole_item' }
    }];
  }));
  const seenResults = new Set();
  const totals = new Map();
  for (let index = 0; index < proposal.results.length; index += 1) {
    const result = proposal.results[index];
    const expectedId = createActionProducedOutputIdentity({
      root_turn_id: proposal.causal_identity.root_turn_id,
      action_ref: proposal.causal_identity.action_ref,
      ordinal: index + 1
    });
    if (result.entity_ref !== expectedId || seenResults.has(result.entity_ref)
        || !Array.isArray(result.material_allocations)
        || result.material_allocations.length === 0) {
      fail('ACTION_PRODUCED_RESULT_INVALID');
    }
    seenResults.add(result.entity_ref);
    const seenSources = new Set();
    for (const allocation of result.material_allocations) {
      const transition = transitions.get(allocation?.source_ref);
      if (!transition || seenSources.has(allocation.source_ref)
          || !rational(allocation.quantity, false)
          || allocation.quantity.unit !== transition.decrement_quantity.unit) {
        fail('ACTION_PRODUCED_RESULT_INVALID');
      }
      seenSources.add(allocation.source_ref);
      totals.set(allocation.source_ref, addRational(
        totals.get(allocation.source_ref) ?? {
          numerator: 0, denominator: 1, unit: allocation.quantity.unit
        }, allocation.quantity));
    }
  }
  for (const waste of proposal.known_waste) {
    const transition = transitions.get(waste?.source_ref);
    if (!transition || !rational(waste.quantity, false)
        || waste.quantity.unit !== transition.decrement_quantity.unit) {
      fail('ACTION_PRODUCED_RESULT_INVALID');
    }
    totals.set(waste.source_ref, addRational(
      totals.get(waste.source_ref) ?? {
        numerator: 0, denominator: 1, unit: waste.quantity.unit
      }, waste.quantity));
  }
  for (const [sourceRef, transition] of transitions) {
    const total = totals.get(sourceRef) ?? { numerator: 0, denominator: 1,
      unit: transition.decrement_quantity.unit };
    if (compareRational(total, transition.decrement_quantity) > 0) {
      fail('ACTION_PRODUCED_RESULT_INVALID');
    }
  }
}

function statePin(pin) {
  const value = pin.entity_snapshot;
  return { state_version: value.state_version,
    holder_ref: value.holder_ref, controller_ref: value.controller_ref };
}
function rational(value, allowZero) {
  return exact(value, ['numerator', 'denominator', 'unit'])
    && Number.isSafeInteger(value.numerator)
    && value.numerator >= (allowZero ? 0 : 1)
    && Number.isSafeInteger(value.denominator) && value.denominator >= 1
    && text(value.unit);
}
function addRational(left, right) {
  if (left.unit !== right.unit) fail('ACTION_PRODUCED_RESULT_INVALID');
  const numerator = BigInt(left.numerator) * BigInt(right.denominator)
    + BigInt(right.numerator) * BigInt(left.denominator);
  const denominator = BigInt(left.denominator) * BigInt(right.denominator);
  if (numerator > BigInt(Number.MAX_SAFE_INTEGER)
      || denominator > BigInt(Number.MAX_SAFE_INTEGER)) {
    fail('ACTION_PRODUCED_RESULT_INVALID');
  }
  return { numerator: Number(numerator), denominator: Number(denominator),
    unit: left.unit };
}
function compareRational(left, right) {
  const delta = BigInt(left.numerator) * BigInt(right.denominator)
    - BigInt(right.numerator) * BigInt(left.denominator);
  return delta === 0n ? 0 : delta < 0n ? -1 : 1;
}
