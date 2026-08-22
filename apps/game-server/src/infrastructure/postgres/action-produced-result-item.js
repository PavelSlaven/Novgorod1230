import {
  actionProducedOutputPlacement,
  actionProducedOwnerOutputDestination,
  validateActionProducedDestinationPin
} from './action-produced-atomic-write-plan-pins.js';
import { deriveActionProducedOutputProperty,
  deriveLocalFireFuelClassification,
  resolvePhysicalItemCondition,
  validateActionProducedOutputAuthority } from '@rus/items-property';
import { mergeActionProducedPhysicalFacts } from
  '@rus/items-property';
import { failActionProducedPersistence as fail } from
  './action-produced-persistence-boundary.js';

export function deriveActionProducedResultItem(result, sourcePins, proposal,
  changeSetId, destinationPin, actorRef) {
  const source = sourcePins.find(({ item_id: itemId }) =>
    itemId === result.source_ref);
  if (!source) fail('ACTION_PRODUCED_RESULT_SOURCE_INVALID');
  const destination = validateActionProducedDestinationPin(destinationPin);
  if (destination === null) fail('ACTION_PRODUCED_DESTINATION_INVALID');
  const placement = actionProducedOutputPlacement(destination);
  const expected = actionProducedOwnerOutputDestination(destination,
    actorRef);
  if (result.holder_ref !== expected.holder_ref
      || result.controller_ref !== expected.controller_ref
      || placement.anchor_id !== expected.target_ref) {
    fail('ACTION_PRODUCED_DESTINATION_INVALID');
  }
  if (!validateActionProducedOutputAuthority(result.output_authority,
    'independent_output')) {
    fail('ACTION_PRODUCED_RESULT_AUTHORITY_INVALID');
  }
  const outputProperty = deriveActionProducedOutputProperty(
    source.entity_snapshot.ownership_snapshot, result.entity_ref, actorRef);
  const condition = resolvePhysicalItemCondition(source.item);
  if (condition === null) fail('ACTION_PRODUCED_RESULT_CONDITION_INVALID');
  const physicalState = mergeActionProducedPhysicalFacts({
    entity_ref: result.entity_ref,
    action_ref: proposal.causal_identity.action_ref,
    existing: [],
    physical_description: proposal.qualitative_result.result_descriptor
      .physical_description,
    physical_facts: result.physical_facts,
    inscription_text: result.inscription_text
  });
  const sourceRefs = result.material_allocations.length === 0
    ? [result.source_ref] : [...new Set(result.material_allocations.map(
      ({ source_ref: sourceRef }) => sourceRef))];
  const fuel = deriveLocalFireFuelClassification({
    source_items: sourcePins.map(({ item }) => item), source_refs: sourceRefs,
    mechanics_snapshot: result.mechanics_snapshot
  });
  const state = {
    lifecycle_status: 'active',
    runtime_instance_mechanics_snapshot: result.mechanics_snapshot,
    ordinary_metadata: {
      semantic_type: 'ordinary_mundane',
      name: proposal.qualitative_result.result_descriptor.display_name,
      origin: { kind: 'action_produced',
        source_refs: sourceRefs },
      semantic_facts: structuredClone(physicalState.physical_facts),
      physical_inscriptions:
        structuredClone(physicalState.physical_inscriptions),
      operation_history: []
    },
    ...(fuel === null ? {} : { local_fire_fuel: fuel }),
    semantic_category: 'ordinary_mundane',
    property_state: outputProperty.property_state,
    action_production: {
      schema: 'rus.items.action_production_item_state.v1',
      causal_identity: structuredClone(proposal.causal_identity),
      result_class: proposal.result_class,
      output_class: proposal.qualitative_result.output_class,
      physical_form: proposal.qualitative_result.result_descriptor
        .physical_form,
      source_ref: result.source_ref,
      material_allocations: structuredClone(result.material_allocations)
    },
    created_change_set_id: changeSetId
  };
  return {
    item_id: result.entity_ref, source_ref: result.source_ref,
    item_row: {
      run_id: null, template_id: null, profile_id: null, category_id: null,
      quantity: 1, condition_state: condition,
      legal_status: 'action_produced_non_authoritative',
      state, state_version: 1
    },
    placement_row: placement,
    ownership_row: structuredClone(outputProperty.ownership),
    mechanics_snapshot: structuredClone(result.mechanics_snapshot),
    material_allocations: structuredClone(result.material_allocations)
  };
}
