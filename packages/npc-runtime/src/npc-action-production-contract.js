import { actionProducedOutputRequiresTool,
  validateActionProducedOutputClass } from '@rus/items-property';
import { exactKeys, stableId, uniqueStableIds } from './internal.js';
import {
  finiteInteger,
  jsonSafe,
  nullableStableId,
  nullableText,
  text
} from './semantic-decision-request-contract.js';

export function validateNpcActionProduction(value, operation) {
  if (!exactKeys(value, [
    'source_refs', 'tool_refs', 'requested_output_count', 'identity_mode',
    'origin', 'result_class', 'material_extent', 'result_descriptor',
    'output_class'
  ]) || !uniqueStableIds(value.source_refs) || value.source_refs.length === 0
    || !uniqueStableIds(value.tool_refs)
    || (value.requested_output_count !== null
      && (!finiteInteger(value.requested_output_count, 1)
        || value.requested_output_count > 8))
    || !stableId(value.identity_mode)
    || (value.origin !== null && !stableId(value.origin))
    || !stableId(value.result_class)
    || (value.material_extent !== null && !stableId(value.material_extent))
    || (value.output_class !== null && !stableId(value.output_class))
    || !validateDescriptor(value.result_descriptor)
    || !validateActionProducedOutputClass(value.output_class, value.result_class,
      value.identity_mode)) return false;
  return value.source_refs[0] === operation.item_ref
    && !value.source_refs.some((ref) => value.tool_refs.includes(ref))
    && sameRefSet(operation.target_refs, [
      ...value.source_refs.slice(1), ...value.tool_refs
    ]) && (!actionProducedOutputRequiresTool(value.output_class)
      || value.tool_refs.length > 0);
}

export function npcActionProductionRefs(value) {
  return [
    ...(value?.source_refs ?? []),
    ...(value?.tool_refs ?? []),
    ...(value?.result_descriptor?.removed_physical_fact_refs ?? []),
    ...(value?.result_descriptor?.source_fact_delta?.removed_physical_fact_refs ?? [])
  ];
}

function sameRefSet(left, right) {
  return left.length === right.length && left.every((ref) => right.includes(ref));
}

function validateDescriptor(value) {
  return exactKeys(value, [
    'display_name', 'physical_description', 'qualitative_facts',
    'removed_physical_fact_refs', 'inscription_text', 'physical_form',
    'source_fact_delta'
  ]) && nullableText(value.display_name)
    && nullableText(value.physical_description)
    && Array.isArray(value.qualitative_facts)
    && value.qualitative_facts.every(text)
    && new Set(value.qualitative_facts).size === value.qualitative_facts.length
    && uniqueStableIds(value.removed_physical_fact_refs)
    && nullableText(value.inscription_text)
    && nullableStableId(value.physical_form)
    && (value.source_fact_delta === null || validateSourceFactDelta(value.source_fact_delta));
}

function validateSourceFactDelta(value) {
  return exactKeys(value, [
    'physical_description', 'qualitative_facts',
    'removed_physical_fact_refs', 'physical_form'
  ]) && nullableText(value.physical_description)
    && Array.isArray(value.qualitative_facts)
    && value.qualitative_facts.every(text)
    && new Set(value.qualitative_facts).size === value.qualitative_facts.length
    && uniqueStableIds(value.removed_physical_fact_refs)
    && stableId(value.physical_form);
}
