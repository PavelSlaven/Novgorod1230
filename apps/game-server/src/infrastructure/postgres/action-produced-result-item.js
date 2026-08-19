import {
  actionProducedOutputPlacement,
  actionProducedOwnerOutputDestination,
  validateActionProducedDestinationPin
} from './action-produced-atomic-write-plan-pins.js';
import { deriveActionProducedOutputProperty,
  validateActionProducedOutputAuthority } from '@rus/items-property';
import { failActionProducedPersistence as fail } from
  './action-produced-persistence-boundary.js';

export function deriveActionProducedResultItem(result, sourcePins, proposal,
  changeSetId, destinationPin) {
  const source = sourcePins.find(({ item_id: itemId }) =>
    itemId === result.source_ref);
  if (!source) fail('ACTION_PRODUCED_RESULT_SOURCE_INVALID');
  const destination = validateActionProducedDestinationPin(destinationPin);
  if (destination === null) fail('ACTION_PRODUCED_DESTINATION_INVALID');
  const placement = actionProducedOutputPlacement(destination);
  const expected = actionProducedOwnerOutputDestination(destination,
    source.entity_snapshot.controller_ref);
  if (result.holder_ref !== expected.holder_ref
      || result.controller_ref !== expected.controller_ref
      || result.placement_state_ref !== expected.placement_state_ref
      || placement.anchor_id !== expected.target_ref) {
    fail('ACTION_PRODUCED_DESTINATION_INVALID');
  }
  if (!validateActionProducedOutputAuthority(result.output_authority,
    'independent_output')) {
    fail('ACTION_PRODUCED_RESULT_AUTHORITY_INVALID');
  }
  const outputProperty = deriveActionProducedOutputProperty(
    source.entity_snapshot.ownership_snapshot, result.entity_ref);
  if (result.property_state_ref !== outputProperty.property_state_ref) {
    fail('ACTION_PRODUCED_RESULT_PROPERTY_INVALID');
  }
  const state = {
    lifecycle_status: 'active',
    runtime_instance_mechanics_snapshot: result.mechanics_snapshot,
    property_state: outputProperty.property_state,
    action_production: {
      schema: 'rus.items.action_production_item_state.v1',
      causal_identity: structuredClone(proposal.causal_identity),
      result_class: proposal.result_class,
      output_class: proposal.qualitative_result.output_class,
      ...(proposal.qualitative_result?.result_descriptor
        ?.weapon_qualitative_class == null ? {} : {
          weapon_qualitative_class: proposal.qualitative_result
            .result_descriptor.weapon_qualitative_class
        }),
      physical_facts: structuredClone(result.physical_facts),
      inscription_text: result.inscription_text,
      source_ref: result.source_ref,
      material_allocations: structuredClone(result.material_allocations)
    },
    created_change_set_id: changeSetId
  };
  return {
    item_id: result.entity_ref, source_ref: result.source_ref,
    item_row: {
      run_id: null, template_id: null, profile_id: null, category_id: null,
      quantity: 1, condition_state: source.item.condition_state,
      legal_status: 'action_produced_non_authoritative',
      state, state_version: 1
    },
    placement_row: placement,
    placement_evidence: {
      schema: 'action_production_output_placement_evidence_v1',
      holder_ref: result.holder_ref, controller_ref: result.controller_ref,
      placement_state_ref: result.placement_state_ref,
      destination_digest: destination.destination_digest
    },
    ownership_row: structuredClone(outputProperty.ownership),
    mechanics_snapshot: structuredClone(result.mechanics_snapshot),
    material_allocations: structuredClone(result.material_allocations)
  };
}
