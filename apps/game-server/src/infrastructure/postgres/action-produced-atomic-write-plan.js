import { isDeepStrictEqual } from 'node:util';
import { mergeActionProducedPhysicalFacts } from
  '@rus/items-property';
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
import { actionProducedPhysicalKeysForPlan } from
  './action-produced-physical-keys.js';
import { deriveActionProducedResultItem as producedItem } from
  './action-produced-result-item.js';
import { validLowerDvinaTraceActionProductionPlanProfile } from
  '../../internal/lower-dvina-trace-a1-bundle.js';
import { validActionProducedOuterCausalBinding } from
  './action-produced-causal-binding.js';
const REQUEST_KEYS = [
  'schema', 'party_id', 'base_party_state_version', 'change_set_id',
  'committed_load', 'transition_proposal'
];
const PLAN_KEYS = [
  'schema', 'party_id', 'base_party_state_version', 'change_set_id',
  'actor_ref', 'output_destination_pin', 'transition_proposal',
  'source_pins', 'tool_pins',
  'source_updates', 'result_items'
];
export function createActionProducedAtomicWritePlan(rawInput) {
  const input = snapshot(rawInput);
  if (input === INVALID_ACTION_PRODUCED_DATA) fail('ACTION_PRODUCED_PLAN_INVALID');
  if (input?.schema === 'action_production_atomic_write_plan_v1') {
    validatePlan(input);
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
      proposal, input.change_set_id, outputDestination,
      load.committed_context.actor_ref)) : [];
  const plan = {
    schema: 'action_production_atomic_write_plan_v1',
    party_id: input.party_id,
    base_party_state_version: input.base_party_state_version,
    change_set_id: input.change_set_id,
    actor_ref: load.committed_context.actor_ref,
    output_destination_pin: structuredClone(outputDestination),
    transition_proposal: structuredClone(proposal),
    source_pins: structuredClone(sourcePins),
    tool_pins: structuredClone(toolPins),
    source_updates: structuredClone(sourceUpdates),
    result_items: structuredClone(resultItems)
  };
  validatePlan(plan);
  return deepFreeze(plan);
}
function deriveSourceUpdates(proposal, sourcePins) {
  return proposal.source_transitions.flatMap((transition) => {
    const pin = sourcePins.find(({ item_id: id }) =>
      id === transition.entity_ref);
    const primaryRef = proposal.source_transitions[0].entity_ref;
    const retireSource = transition.finite_resource_transition === null
      && transition.after.mechanics_snapshot === null
      && (proposal.identity_mode === 'independent_outputs'
        || proposal.identity_mode === 'preserve_source'
          && transition.entity_ref !== primaryRef);
    const changed = transition.finite_resource_transition !== null
      || transition.after.mechanics_snapshot !== null || retireSource;
    if (!changed) return [];
    const preservedResult = proposal.identity_mode === 'preserve_source'
      && transition.entity_ref === proposal.results[0].entity_ref
      ? proposal.results[0] : null;
    const survivingPartition = proposal.identity_mode === 'independent_outputs' && proposal.result_class === 'partial_transformation'
      && transition.after.mechanics_snapshot !== null && !retireSource
      && transition.finite_resource_transition?.lifecycle_state_after !== 'depleted';
    const descriptor = proposal.qualitative_result.result_descriptor;
    const sourceDelta = survivingPartition ? descriptor.source_fact_delta : null;
    const physicalState = preservedResult === null && !survivingPartition ? null
      : mergeActionProducedPhysicalFacts({ entity_ref: pin.item_id,
        action_ref: proposal.causal_identity.action_ref,
        existing: pin.item.state?.ordinary_metadata?.semantic_facts ?? [],
        existing_inscriptions: pin.item.state?.ordinary_metadata?.physical_inscriptions ?? [],
        physical_description: sourceDelta === null
          ? descriptor.physical_description : sourceDelta.physical_description,
        physical_facts: sourceDelta === null
          ? preservedResult?.physical_facts ?? descriptor.qualitative_facts
          : sourceDelta.qualitative_facts,
        removed_fact_refs: sourceDelta === null
          ? descriptor.removed_physical_fact_refs ?? []
          : sourceDelta.removed_physical_fact_refs,
        inscription_text: preservedResult?.inscription_text ?? null });
    const nextState = {
      ...(pin.item.state ?? {}),
      lifecycle_status: retireSource || transition.finite_resource_transition
          ?.lifecycle_state_after === 'depleted' ? 'retired' : 'active',
      ...(transition.after.mechanics_snapshot === null ? {} : {
        runtime_instance_mechanics_snapshot:
          structuredClone(transition.after.mechanics_snapshot)
      }),
      ...(physicalState === null ? {} : {
        ordinary_metadata: {
          ...(pin.item.state?.ordinary_metadata ?? {}),
          semantic_facts: structuredClone(physicalState.physical_facts),
          physical_inscriptions: structuredClone(physicalState.physical_inscriptions)
        },
        ...(preservedResult === null && !survivingPartition ? {} : {
          action_production: {
          schema: 'rus.items.action_production_item_state.v1',
          causal_identity: structuredClone(proposal.causal_identity),
          result_class: proposal.result_class,
          output_class: proposal.qualitative_result.output_class,
          physical_form: survivingPartition ? sourceDelta.physical_form
            : proposal.qualitative_result.result_descriptor.physical_form
        } })
      })
    };
    return [{
      item_id: pin.item_id,
      expected_item_state_version: pin.item.state_version,
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
export function actionProducedPhysicalKeys(plan) {
  if (plan == null) return [];
  return actionProducedPhysicalKeysForPlan(
    createActionProducedAtomicWritePlan(plan));
}
export function validActionProductionExtension(plan) {
  const actions = plan.action_production_atomic_write_plans ?? [];
  if (!Array.isArray(actions) || actions.length > 8) return false;
  if (actions.length === 0) return true;
  try {
    const actionPlans = actions.map(createActionProducedAtomicWritePlan);
    const ordinary = plan.ordinary_materialization_atomic_write_plan;
    const party = plan.updates?.find((write) =>
      write.target_table === 'parties' && write.id === plan.party_id);
    return party?.record?.party_id === plan.party_id
      && plan.expected_state_versions.some((version) =>
        version.target_table === 'parties' && version.id === plan.party_id
          && actionPlans.every((actionPlan) => version.state_version
            === actionPlan.base_party_state_version))
      && actionPlans.every((actionPlan, index) => {
        const causal = actionPlan.transition_proposal.causal_identity;
        const prior = actionPlans.slice(0, index);
        return actionPlan.party_id === plan.party_id
          && actionPlan.change_set_id === plan.change_set_id
          && (index === 0 || causal.step_index > actionPlans[index - 1]
            .transition_proposal.causal_identity.step_index)
          && validLowerDvinaTraceActionProductionPlanProfile(actionPlan)
          && validActionProducedOuterCausalBinding(plan, actionPlan)
          && [...actionPlan.source_pins, ...actionPlan.tool_pins].every((pin) =>
            preparedPinMatches(pin, ordinary, prior))
          && actionProducedPhysicalKeys(actionPlan).every((key) =>
            plan.physical_keys.includes(key));
      });
  } catch { return false; }
}
function preparedPinMatches(pin, ordinary, priorPlans) {
  if (pin.prepared_ordinary != null) {
    return ordinary?.request_identity === pin.prepared_ordinary.request_identity
      && ordinary.items?.some((item) => item.item_id === pin.item_id);
  }
  if (pin.prepared_action == null) return true;
  const prior = priorPlans.find((candidate) => candidate.transition_proposal
    .causal_identity.step_index === pin.prepared_action.step_index);
  if (prior == null) return false;
  const result = prior.result_items.find(({ item_id: id }) =>
    id === pin.item_id);
  if (result != null) {
    return isDeepStrictEqual(pin.item,
      { item_id: result.item_id, ...result.item_row })
      && isDeepStrictEqual(pin.placement, result.placement_row)
      && isDeepStrictEqual(pin.ownership, result.ownership_row)
      && pin.finite_resource_row === null;
  }
  const update = prior.source_updates.find(({ item_id: id }) =>
    id === pin.item_id);
  const source = prior.source_pins.find(({ item_id: id }) =>
    id === pin.item_id);
  return update != null && source != null
    && isDeepStrictEqual(pin.item, update.after_item)
    && isDeepStrictEqual(pin.placement, source.placement)
    && isDeepStrictEqual(pin.ownership, source.ownership)
    && isDeepStrictEqual(pin.finite_resource_row,
      preparedResourceRow(source.finite_resource_row,
        update.finite_resource_transition));
}
function preparedResourceRow(row, transition) {
  return transition == null ? row : { ...row,
    quantity_numerator: transition.after_quantity.numerator,
    quantity_denominator: transition.after_quantity.denominator,
    lifecycle_state: transition.lifecycle_state_after,
    state_version: transition.next_state_version };
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
  if (!isDeepStrictEqual(value.output_destination, expectedDestination)) {
    fail('ACTION_PRODUCED_DESTINATION_INVALID');
  }
  return value;
}
function validatePlan(value) {
  if (!exact(value, PLAN_KEYS)
      || value.schema !== 'action_production_atomic_write_plan_v1'
      || !text(value.party_id) || !text(value.change_set_id)
      || !text(value.actor_ref)
      || !Number.isSafeInteger(value.base_party_state_version)
      || value.base_party_state_version < 0
      || !Array.isArray(value.source_pins)
      || !Array.isArray(value.tool_pins)
      || !Array.isArray(value.source_updates)
      || !Array.isArray(value.result_items)) {
    fail('ACTION_PRODUCED_PLAN_INVALID');
  }
  const proposal = validateProposal(value.transition_proposal, {
    committed_context: {
      root_turn_id: value.transition_proposal?.causal_identity?.root_turn_id,
      action_ref: value.transition_proposal?.causal_identity?.action_ref,
      step_index: value.transition_proposal?.causal_identity?.step_index,
      context_ref: value.transition_proposal?.context_pin?.context_ref,
      state_version: value.transition_proposal?.context_pin
        ?.context_state_version
    },
    row_pins: [...value.source_pins, ...value.tool_pins]
  });
  const destination = validateActionProducedDestinationPin(
    value.output_destination_pin);
  validateActionProducedRowPins(value.source_pins, 'source', value.actor_ref,
    proposal.causal_identity, destination?.anchor_id ?? null);
  validateActionProducedRowPins(value.tool_pins, 'tool', value.actor_ref,
    proposal.causal_identity, destination?.anchor_id ?? null);
  const pinnedItemIds = [...value.source_pins, ...value.tool_pins]
    .map(({ item_id: itemId }) => itemId);
  if (new Set(pinnedItemIds).size !== pinnedItemIds.length) {
    fail('ACTION_PRODUCED_PLAN_INVALID');
  }
  if (value.result_items.length > 0
      && (destination === null || !actionProducedDestinationFits(destination,
        value.source_updates, value.result_items, value.source_pins))) {
    fail('ACTION_PRODUCED_DESTINATION_CAPACITY');
  }
  const expectedUpdates = deriveSourceUpdates(proposal, value.source_pins);
  const expectedItems = proposal.identity_mode === 'independent_outputs'
    ? proposal.results.map((result) => producedItem(result,
      value.source_pins, proposal, value.change_set_id,
      value.output_destination_pin, value.actor_ref)) : [];
  if (!isDeepStrictEqual(value.source_updates, expectedUpdates)
      || !isDeepStrictEqual(value.result_items, expectedItems)) {
    fail('ACTION_PRODUCED_PLAN_INVALID');
  }
}
