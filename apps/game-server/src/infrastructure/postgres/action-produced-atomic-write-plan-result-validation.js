import { createRuntimeInstanceMechanicsSnapshot,
  deriveActionProducedOutputProperty,
  validateActionProducedOutputAuthority,
  validateActionProducedOutputClass } from '@rus/items-property';
import {
  actionProducedText as text,
  exactActionProducedRecord as exact,
  failActionProducedPersistence as fail
} from './action-produced-persistence-boundary.js';

const RESULT_KEYS = [
  'entity_ref', 'identity_kind', 'source_ref', 'mechanics_snapshot',
  'property_state_ref', 'placement_state_ref', 'holder_ref',
  'controller_ref', 'physical_facts', 'inscription_text', 'output_authority'
];
const QUALITATIVE_KEYS = [
  'intended_transformation', 'result_descriptor', 'output_class'
];
const DESCRIPTOR_KEYS = [
  'display_name', 'physical_description', 'qualitative_facts',
  'inscription_text'
];

export function validateActionProducedProposalResults(proposal, sourcePins) {
  if (!validQualitative(proposal.qualitative_result, proposal)) {
    fail('ACTION_PRODUCED_PROPOSAL_INVALID');
  }
  for (const result of proposal.results) {
    const keys = result.identity_kind === 'independent_output'
      ? [...RESULT_KEYS, 'material_allocations'] : RESULT_KEYS;
    if (!exact(result, keys)
        || !validateActionProducedOutputAuthority(result.output_authority,
          result.identity_kind)) fail('ACTION_PRODUCED_RESULT_INVALID');
    const sourcePin = sourcePins.find(({ item_id: itemId }) =>
      itemId === result.source_ref);
    const expectedPropertyRef = result.identity_kind === 'preserved_source'
      ? sourcePin?.entity_snapshot.property_state_ref
      : sourcePin == null ? null : deriveActionProducedOutputProperty(
        sourcePin.entity_snapshot.ownership_snapshot, result.entity_ref)
        .property_state_ref;
    if (result.property_state_ref !== expectedPropertyRef
        || result.inscription_text
          !== proposal.qualitative_result.result_descriptor.inscription_text) {
      fail('ACTION_PRODUCED_RESULT_INVALID');
    }
    if (result.identity_kind === 'independent_output') {
      validatePropertyBasis(result, sourcePin, sourcePins);
    }
    createRuntimeInstanceMechanicsSnapshot(result.mechanics_snapshot);
  }
}

function validQualitative(value, proposal) {
  const descriptor = value?.result_descriptor;
  return exact(value, QUALITATIVE_KEYS)
    && text(value.intended_transformation)
    && exact(descriptor, DESCRIPTOR_KEYS)
    && (descriptor.display_name === null || text(descriptor.display_name))
    && (descriptor.physical_description === null
      || text(descriptor.physical_description))
    && Array.isArray(descriptor.qualitative_facts)
    && descriptor.qualitative_facts.every(text)
    && new Set(descriptor.qualitative_facts).size
      === descriptor.qualitative_facts.length
    && (descriptor.inscription_text === null
      || text(descriptor.inscription_text))
    && validateActionProducedOutputClass(value.output_class,
      proposal.result_class, proposal.identity_mode);
}

function validatePropertyBasis(result, selectedPin, sourcePins) {
  if (!selectedPin || !Array.isArray(result.material_allocations)
      || !result.material_allocations.some(({ source_ref: ref }) =>
        ref === selectedPin.item_id)) {
    fail('ACTION_PRODUCED_RESULT_INVALID');
  }
  for (const allocation of result.material_allocations) {
    const contributor = sourcePins.find(({ item_id: id }) =>
      id === allocation?.source_ref);
    if (!contributor
        || contributor.entity_snapshot.ownership_basis_ref
          !== selectedPin.entity_snapshot.ownership_basis_ref
        || contributor.entity_snapshot.property_basis_ref
          !== selectedPin.entity_snapshot.property_basis_ref) {
      fail('ACTION_PRODUCED_RESULT_INVALID');
    }
  }
}
