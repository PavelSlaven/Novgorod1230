import { computeSpatialV3CanonicalDigest as digest } from
  '@rus/contracts/spatial-v3/registry';
import {
  INVALID_ACTION_PRODUCED_DATA,
  actionProducedText as text,
  deepFreezeActionProducedPersistenceData as deepFreeze,
  exactActionProducedRecord as exact,
  failActionProducedPersistence as fail,
  snapshotActionProducedPersistenceData as snapshot
} from './action-produced-persistence-boundary.js';
import { validateActionProducedAtomicProposal as validateProposal } from
  './action-produced-atomic-write-plan-validation.js';
import { actionProducedOwnerOutputDestination,
  actionProducedDestinationFits,
  validateActionProducedDestinationPin,
  validateActionProducedRowPins } from
  './action-produced-atomic-write-plan-pins.js';
import { actionProducedPhysicalKeysForSealed } from
  './action-produced-physical-keys.js';
import { deriveActionProducedResultItem as producedItem } from
  './action-produced-result-item.js';
const REQUEST_KEYS = [
  'schema', 'party_id', 'base_party_state_version', 'change_set_id',
  'committed_load', 'transition_proposal'
];
const PLAN_KEYS = [
  'schema', 'party_id', 'base_party_state_version', 'change_set_id',
  'actor_ref', 'output_destination_pin', 'causal_identity',
  'context_pin', 'identity_mode', 'origin', 'result_class', 'transition_proposal',
  'source_pins', 'tool_pins',
  'source_updates', 'result_items', 'result_set_evidence', 'write_plan_digest'
];
const CAUSAL_KEYS = ['request_id', 'root_turn_id', 'action_ref', 'step_index'];
const CONTEXT_KEYS = [
  'context_ref', 'context_state_version', 'profile_ref', 'profile_version'
];
export function createActionProducedAtomicWritePlan(rawInput) {
  const input = snapshot(rawInput);
  if (input === INVALID_ACTION_PRODUCED_DATA) fail('ACTION_PRODUCED_PLAN_INVALID');
  if (input?.schema === 'action_production_atomic_write_plan_v1') {
    validateSealed(input);
    return deepFreeze(input);
  }
  if (!exact(input, REQUEST_KEYS)
      || input.schema !== 'action_production_atomic_write_request_v1'
      || !text(input.party_id) || !text(input.change_set_id)
      || !Number.isSafeInteger(input.base_party_state_version)
      || input.base_party_state_version < 0) fail('ACTION_PRODUCED_PLAN_INVALID');
  const load = validateLoad(input.committed_load, input);
  const proposal = validateProposal(input.transition_proposal, load);
  const sourcePins = load.row_pins.filter(({ role }) => role === 'source');
  const toolPins = load.row_pins.filter(({ role }) => role === 'tool');
  const sourceUpdates = deriveSourceUpdates(proposal, sourcePins);
  const outputDestination = proposal.identity_mode === 'independent_outputs'
      || load.row_pins.some(({ placement }) => placement.anchor_id != null)
    ? load.output_destination_pin : null;
  const resultItems = proposal.identity_mode === 'independent_outputs'
    ? proposal.results.map((result) => producedItem(result, sourcePins,
      proposal, input.change_set_id, outputDestination)) : [];
  const resultEvidence = resultEvidenceFor(proposal, sourcePins, toolPins);
  const plan = {
    schema: 'action_production_atomic_write_plan_v1',
    party_id: input.party_id,
    base_party_state_version: input.base_party_state_version,
    change_set_id: input.change_set_id,
    actor_ref: load.committed_context.actor_ref,
    output_destination_pin: structuredClone(outputDestination),
    causal_identity: structuredClone(proposal.causal_identity),
    context_pin: structuredClone(proposal.context_pin),
    identity_mode: proposal.identity_mode,
    origin: proposal.origin,
    result_class: proposal.result_class,
    transition_proposal: structuredClone(proposal),
    source_pins: structuredClone(sourcePins),
    tool_pins: structuredClone(toolPins),
    source_updates: structuredClone(sourceUpdates),
    result_items: structuredClone(resultItems),
    result_set_evidence: resultEvidence
  };
  const sealed = { ...plan, write_plan_digest: digest(plan) };
  validateSealed(sealed);
  return deepFreeze(sealed);
}

function deriveSourceUpdates(proposal, sourcePins) {
  return proposal.source_transitions.flatMap((transition) => {
    const pin = sourcePins.find(({ item_id: id }) =>
      id === transition.entity_ref);
    const retireSource = proposal.identity_mode === 'independent_outputs'
      && transition.finite_resource_transition === null
      && transition.after.mechanics_snapshot === null;
    const changed = transition.finite_resource_transition !== null
      || transition.after.mechanics_snapshot !== null || retireSource;
    if (!changed) return [];
    const preservedResult = proposal.identity_mode === 'preserve_source'
      ? proposal.results[0] : null;
    const nextState = {
      ...(pin.item.state ?? {}),
      lifecycle_status: retireSource || transition.finite_resource_transition
          ?.lifecycle_state_after === 'depleted' ? 'retired' : 'active',
      ...(transition.after.mechanics_snapshot === null ? {} : {
        runtime_instance_mechanics_snapshot:
          structuredClone(transition.after.mechanics_snapshot)
      }),
      ...(preservedResult === null ? {} : { action_production: {
        schema: 'rus.items.action_production_item_state.v1',
        causal_identity: structuredClone(proposal.causal_identity),
        result_class: proposal.result_class,
        output_class: proposal.qualitative_result.output_class,
        ...(proposal.qualitative_result.result_descriptor
          .weapon_qualitative_class == null ? {} : {
            weapon_qualitative_class: proposal.qualitative_result
              .result_descriptor.weapon_qualitative_class
          }),
        physical_facts: structuredClone(preservedResult.physical_facts),
        inscription_text: preservedResult.inscription_text
      } })
    };
    return [{
      item_id: pin.item_id,
      expected_item_state_version: pin.item.state_version,
      expected_item_digest: pin.item_digest,
      expected_placement_digest: pin.placement_digest,
      expected_ownership_digest: pin.ownership_digest,
      before_item: structuredClone(pin.item),
      after_item: { ...pin.item,
        ...(transition.after.mechanics_snapshot === null ? {} : {
          run_id: null, template_id: null, profile_id: null,
          category_id: null
        }),
        ...(retireSource ? { condition_state: 'retired' } : {}),
        state: nextState,
        state_version: pin.item.state_version + 1 },
      finite_resource_transition: structuredClone(
        transition.finite_resource_transition)
    }];
  });
}

function resultEvidenceFor(proposal, sourcePins, toolPins) {
  return {
    schema: 'rus.items.action_production_result_set_evidence.v1',
    identity_mode: proposal.identity_mode,
    result_item_ids: proposal.results.map(({ entity_ref }) => entity_ref),
    source_item_ids: sourcePins.map(({ item_id }) => item_id),
    tool_item_ids: toolPins.map(({ item_id }) => item_id)
  };
}

export function actionProducedPhysicalKeys(plan) {
  if (plan == null) return [];
  return actionProducedPhysicalKeysForSealed(
    createActionProducedAtomicWritePlan(plan));
}

function validateLoad(value, input) {
  const keys = [
    'schema', 'party_id', 'party_state_version', 'committed_context',
    'output_destination_pin', 'output_destination',
    'admission_profile',
    'technical_policy',
    'source_snapshots', 'tool_snapshots', 'row_pins'
  ];
  if (!exact(value, keys)
      || value.schema !== 'action_produced_committed_context_load_v1'
      || value.party_id !== input.party_id
      || value.party_state_version !== input.base_party_state_version
      || !text(value.committed_context?.actor_ref)
      || !Array.isArray(value.row_pins)
      || value.row_pins.length !== value.source_snapshots.length
        + value.tool_snapshots.length) fail('ACTION_PRODUCED_PLAN_CONTEXT_INVALID');
  const expectedDestination = actionProducedOwnerOutputDestination(
    value.output_destination_pin, value.committed_context.actor_ref);
  if (digest(value.output_destination) !== digest(expectedDestination)) {
    fail('ACTION_PRODUCED_DESTINATION_INVALID');
  }
  return value;
}

function validateSealed(value) {
  if (!exact(value, PLAN_KEYS)
      || value.schema !== 'action_production_atomic_write_plan_v1'
      || !text(value.party_id) || !text(value.change_set_id)
      || !text(value.actor_ref)
      || !Number.isSafeInteger(value.base_party_state_version)
      || value.base_party_state_version < 0
      || !exact(value.causal_identity, CAUSAL_KEYS)
      || !exact(value.context_pin, CONTEXT_KEYS)
      || !Array.isArray(value.source_pins)
      || !Array.isArray(value.tool_pins)
      || !Array.isArray(value.source_updates)
      || !Array.isArray(value.result_items)) {
    fail('ACTION_PRODUCED_PLAN_INVALID');
  }
  const contextVersion = String(value.base_party_state_version);
  const destination = validateActionProducedDestinationPin(
    value.output_destination_pin);
  validateActionProducedRowPins(value.source_pins, 'source', value.actor_ref,
    contextVersion, value.causal_identity, destination?.anchor_id ?? null);
  validateActionProducedRowPins(value.tool_pins, 'tool', value.actor_ref,
    contextVersion, value.causal_identity, destination?.anchor_id ?? null);
  const pinnedItemIds = [...value.source_pins, ...value.tool_pins]
    .map(({ item_id: itemId }) => itemId);
  if (new Set(pinnedItemIds).size !== pinnedItemIds.length) {
    fail('ACTION_PRODUCED_PLAN_INVALID');
  }
  if (value.result_items.length > 0
      && (destination === null || !actionProducedDestinationFits(destination,
        value.source_updates, value.result_items))) {
    fail('ACTION_PRODUCED_DESTINATION_CAPACITY');
  }
  const proposal = validateProposal(value.transition_proposal, {
    committed_context: {
      root_turn_id: value.causal_identity.root_turn_id,
      action_ref: value.causal_identity.action_ref,
      step_index: value.causal_identity.step_index,
      context_ref: value.context_pin.context_ref,
      state_version: value.context_pin.context_state_version
    },
    row_pins: [...value.source_pins, ...value.tool_pins]
  });
  const expectedUpdates = deriveSourceUpdates(proposal, value.source_pins);
  const expectedItems = proposal.identity_mode === 'independent_outputs'
    ? proposal.results.map((result) => producedItem(result,
      value.source_pins, proposal, value.change_set_id,
      value.output_destination_pin)) : [];
  const expectedEvidence = resultEvidenceFor(proposal, value.source_pins,
    value.tool_pins);
  if (digest(value.causal_identity) !== digest(proposal.causal_identity)
      || digest(value.context_pin) !== digest(proposal.context_pin)
      || value.identity_mode !== proposal.identity_mode
      || value.origin !== proposal.origin
      || value.result_class !== proposal.result_class
      || digest(value.source_updates) !== digest(expectedUpdates)
      || digest(value.result_items) !== digest(expectedItems)
      || digest(value.result_set_evidence) !== digest(expectedEvidence)
      || digest(Object.fromEntries(Object.entries(value)
        .filter(([key]) => key !== 'write_plan_digest')))
        !== value.write_plan_digest) fail('ACTION_PRODUCED_PLAN_INVALID');
}
