import { createRuntimeInstanceMechanicsSnapshot,
  deriveActionProducedOutputProperty,
  validateActionProducedOutputAuthority,
  validateActionProducedOutputClass } from '@rus/items-property';
import { validateActionProducedOutputPropertyBasis } from
  '@rus/items-property/action-produced-transition';
import {
  actionProducedText as text,
  exactActionProducedRecord as exact,
  failActionProducedPersistence as fail
} from './action-produced-persistence-boundary.js';

const RESULT_KEYS = [
  'entity_ref', 'identity_kind', 'source_ref', 'mechanics_snapshot',
  'holder_ref', 'controller_ref', 'physical_facts', 'inscription_text',
  'output_authority'
];
const QUALITATIVE_KEYS = [
  'intended_transformation', 'material_extent', 'result_descriptor',
  'output_class'
];
const DESCRIPTOR_KEYS = [
  'display_name', 'physical_description', 'qualitative_facts',
  'inscription_text', 'physical_form'
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
    if (result.identity_kind === 'independent_output') {
      deriveActionProducedOutputProperty(
        sourcePin?.entity_snapshot.ownership_snapshot, result.entity_ref,
        result.controller_ref);
    }
    if (result.inscription_text
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
    && (proposal.identity_mode === 'preserve_source'
      ? proposal.source_transitions.length > 1
        ? ['minor', 'half', 'major', 'whole'].includes(value.material_extent)
        : value.material_extent === null
      : proposal.identity_mode !== 'independent_outputs'
      ? value.material_extent === null
      : proposal.result_class === 'partial_transformation'
        ? ['minor', 'half', 'major'].includes(value.material_extent)
        : value.material_extent === 'whole')
    && exact(descriptor, descriptorKeys(descriptor))
    && (proposal.identity_mode === 'independent_outputs'
      ? text(descriptor.display_name) : descriptor.display_name === null
        || text(descriptor.display_name))
    && (descriptor.physical_description === null
      || text(descriptor.physical_description))
    && Array.isArray(descriptor.qualitative_facts)
    && descriptor.qualitative_facts.every(text)
    && new Set(descriptor.qualitative_facts).size
      === descriptor.qualitative_facts.length
    && (!Object.hasOwn(descriptor, 'removed_physical_fact_refs')
      || Array.isArray(descriptor.removed_physical_fact_refs)
        && descriptor.removed_physical_fact_refs.every(text)
        && new Set(descriptor.removed_physical_fact_refs).size
          === descriptor.removed_physical_fact_refs.length
        && (proposal.identity_mode === 'preserve_source'
          || descriptor.removed_physical_fact_refs.length === 0))
    && (descriptor.inscription_text === null
      || text(descriptor.inscription_text))
    && (descriptor.physical_form === null
      || ['compact', 'regular', 'long', 'bulky'].includes(
        descriptor.physical_form))
    && validateActionProducedOutputClass(value.output_class,
      proposal.result_class, proposal.identity_mode);
}

function descriptorKeys(value) {
  const keys = [...DESCRIPTOR_KEYS];
  if (value != null && Object.hasOwn(value, 'removed_physical_fact_refs')) {
    keys.push('removed_physical_fact_refs');
  }
  return keys;
}

function validatePropertyBasis(result, selectedPin, sourcePins) {
  if (!selectedPin || !Array.isArray(result.material_allocations)
      || !result.material_allocations.some(({ source_ref: ref }) =>
        ref === selectedPin.item_id)) {
    fail('ACTION_PRODUCED_RESULT_INVALID');
  }
  const sources = new Map(sourcePins.map((pin) => [pin.item_id, {
    source: pin.entity_snapshot
  }]));
  try {
    validateActionProducedOutputPropertyBasis(result.source_ref,
      result.material_allocations, sources);
  } catch { fail('ACTION_PRODUCED_RESULT_INVALID'); }
}
