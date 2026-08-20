import { add, enumValue, integer, refs, requiredText, strict } from
  './validation.js';

export function validateActionProduction(value, path, errors, trace,
  operation) {
  if (!strict(value, path, [
    'source_refs', 'tool_refs', 'output_count', 'identity_mode', 'origin',
    'result_class', 'result_descriptor', 'output_class'
  ], errors)) return;
  refs(value.source_refs, `${path}.source_refs`, errors, trace, { min: 1 });
  refs(value.tool_refs, `${path}.tool_refs`, errors, trace,
    { allowEmpty: true });
  integer(value.output_count, 0, `${path}.output_count`, errors);
  if (Number.isSafeInteger(value.output_count) && value.output_count > 8) {
    add(errors, `${path}.output_count`, 'range',
      'must be a safe integer <= 8');
  }
  enumValue(value.identity_mode, [
    'preserve_source', 'independent_outputs', 'no_useful_result'
  ], `${path}.identity_mode`, errors);
  if (value.origin !== null) enumValue(value.origin,
    ['direct_partition', 'crafted'], `${path}.origin`, errors);
  enumValue(value.result_class, [
    'ordinary_physical_result', 'partial_transformation',
    'nonworking_construction', 'waste', 'written_carrier',
    'no_useful_result'
  ], `${path}.result_class`, errors);
  if (value.output_class !== null) enumValue(value.output_class, [
    'ordinary_mundane', 'weapon_capable', 'money_like_token',
    'written_carrier'
  ], `${path}.output_class`, errors);
  validateRefs(value, path, errors, operation);
  validateOutputCount(value, path, errors);
  validateDescriptor(value.result_descriptor, path, errors);
  validateShape(value, path, errors);
}

function validateRefs(value, path, errors, operation) {
  const expectedTargets = [
    ...(Array.isArray(value.source_refs) ? value.source_refs.slice(1) : []),
    ...(Array.isArray(value.tool_refs) ? value.tool_refs : [])
  ];
  if (value.source_refs?.[0] !== operation.item_ref
      || value.source_refs?.some((ref) => value.tool_refs?.includes(ref))
      || !sameRefs(expectedTargets, operation.target_refs)) {
    add(errors, `${path}.source_refs`, 'operation_shape',
      'source/tool refs must exactly partition item_ref and target_refs');
  }
}

function validateOutputCount(value, path, errors) {
  if (value.identity_mode === 'preserve_source'
      && (value.source_refs?.length !== 1 || value.output_count !== 0)
      || value.identity_mode === 'independent_outputs'
        && (!Number.isSafeInteger(value.output_count)
          || value.output_count < 1)
      || value.identity_mode === 'no_useful_result'
        && value.output_count !== 0) {
    add(errors, `${path}.output_count`, 'operation_shape',
      'output count must match identity mode');
  }
}

function validateDescriptor(descriptor, path, errors) {
  if (!strict(descriptor, `${path}.result_descriptor`, [
    'display_name', 'physical_description', 'qualitative_facts',
    'inscription_text', 'weapon_qualitative_class'
  ], errors)) return;
  for (const key of [
    'display_name', 'physical_description', 'inscription_text'
  ]) {
    if (descriptor[key] !== null) requiredText(descriptor[key],
      `${path}.result_descriptor.${key}`, errors);
  }
  if (!Array.isArray(descriptor.qualitative_facts)) {
    add(errors, `${path}.result_descriptor.qualitative_facts`, 'type',
      'must be an array');
  } else {
    descriptor.qualitative_facts.forEach((fact, index) => requiredText(
      fact, `${path}.result_descriptor.qualitative_facts[${index}]`, errors));
    if (new Set(descriptor.qualitative_facts).size
        !== descriptor.qualitative_facts.length) {
      add(errors, `${path}.result_descriptor.qualitative_facts`, 'unique',
        'must contain unique values');
    }
  }
  if (descriptor.weapon_qualitative_class !== null) enumValue(
    descriptor.weapon_qualitative_class, [
      'improvised_puncture_light', 'improvised_impact_light',
      'improvised_cutting_light', 'improvised_two_hand_heavy'
    ], `${path}.result_descriptor.weapon_qualitative_class`, errors);
}

function validateShape(value, path, errors) {
  const descriptor = value.result_descriptor ?? {};
  const noResult = value.identity_mode === 'no_useful_result';
  if (noResult !== (value.result_class === 'no_useful_result')
      || noResult && (value.origin !== null || value.output_class !== null
        || Object.values(descriptor).some((entry) => Array.isArray(entry)
          ? entry.length !== 0 : entry !== null))) {
    add(errors, path, 'result_shape',
      'no useful result must carry no physical result');
  }
  if (value.identity_mode === 'preserve_source' && value.origin !== null
      || value.identity_mode === 'independent_outputs'
        && !['direct_partition', 'crafted'].includes(value.origin)) {
    add(errors, path, 'identity_shape',
      'identity mode and origin are incompatible');
  }
  if (value.identity_mode === 'independent_outputs'
      && typeof descriptor.display_name !== 'string') {
    add(errors, `${path}.result_descriptor.display_name`, 'identity_shape',
      'independent output requires a safe display name');
  }
  if (value.result_class === 'written_carrier') {
    if (value.identity_mode !== 'preserve_source'
        || value.output_class !== 'written_carrier'
        || typeof descriptor.inscription_text !== 'string') {
      add(errors, path, 'writing_shape',
        'written carrier must preserve one physical carrier');
    }
  } else if (descriptor.inscription_text !== null) {
    add(errors, `${path}.result_descriptor.inscription_text`,
      'writing_shape', 'inscription is allowed only for a written carrier');
  }
  const weapon = value.output_class === 'weapon_capable';
  if (weapon !== (descriptor.weapon_qualitative_class !== null)) {
    add(errors, `${path}.result_descriptor.weapon_qualitative_class`,
      'weapon_shape', 'weapon capability requires one closed combat class');
  }
  if (value.output_class === 'money_like_token'
      && value.identity_mode !== 'independent_outputs') {
    add(errors, path, 'token_shape',
      'money-like token must be a new non-authoritative output');
  }
}

function sameRefs(left, right) {
  return Array.isArray(right) && left.length === right.length
    && left.every((value) => right.includes(value));
}
