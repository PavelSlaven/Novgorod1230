import { add, enumValue, integer, refs, requiredText, strict } from
  './validation.js';

export function validateActionProduction(value, path, errors, trace,
  operation) {
  if (!strict(value, path, [
    'source_refs', 'tool_refs', 'output_count', 'identity_mode', 'origin',
    'result_class', 'material_extent', 'result_descriptor', 'output_class'
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
  if (value.material_extent !== null) enumValue(value.material_extent, [
    'minor', 'half', 'major', 'whole'
  ], `${path}.material_extent`, errors);
  if (value.output_class !== null) enumValue(value.output_class, [
    'ordinary_mundane', 'weapon_capable', 'money_like_token',
    'written_carrier'
  ], `${path}.output_class`, errors);
  validateRefs(value, path, errors, operation);
  validateOutputCount(value, path, errors);
  validateDescriptor(value.result_descriptor, path, errors, trace);
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
      && value.output_count !== 0
      || value.identity_mode === 'independent_outputs'
        && (!Number.isSafeInteger(value.output_count)
          || value.output_count < 1)
      || value.identity_mode === 'no_useful_result'
        && value.output_count !== 0) {
    add(errors, `${path}.output_count`, 'operation_shape',
      'output count must match identity mode');
  }
}

function validateDescriptor(descriptor, path, errors, trace) {
  if (!strict(descriptor, `${path}.result_descriptor`, [
    'display_name', 'physical_description', 'qualitative_facts',
    'removed_physical_fact_refs', 'inscription_text', 'physical_form',
    'source_fact_delta'
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
  refs(descriptor.removed_physical_fact_refs,
    `${path}.result_descriptor.removed_physical_fact_refs`, errors, trace,
    { allowEmpty: true });
  if (descriptor.physical_form !== null) enumValue(descriptor.physical_form,
    ['compact', 'regular', 'long', 'bulky'],
    `${path}.result_descriptor.physical_form`, errors);
  sourceFactDelta(descriptor.source_fact_delta, path, errors, trace);
}

function sourceFactDelta(value, path, errors, trace) {
  const deltaPath = `${path}.result_descriptor.source_fact_delta`;
  if (value === null) return;
  if (!strict(value, deltaPath, [
    'physical_description', 'qualitative_facts',
    'removed_physical_fact_refs'
  ], errors)) return;
  if (value.physical_description !== null) requiredText(
    value.physical_description, `${deltaPath}.physical_description`, errors);
  if (!Array.isArray(value.qualitative_facts)) {
    add(errors, `${deltaPath}.qualitative_facts`, 'type', 'must be an array');
  } else {
    value.qualitative_facts.forEach((fact, index) => requiredText(
      fact, `${deltaPath}.qualitative_facts[${index}]`, errors));
    if (new Set(value.qualitative_facts).size
        !== value.qualitative_facts.length) {
      add(errors, `${deltaPath}.qualitative_facts`, 'unique',
        'must contain unique values');
    }
  }
  refs(value.removed_physical_fact_refs,
    `${deltaPath}.removed_physical_fact_refs`, errors, trace,
    { allowEmpty: true });
}

function validateShape(value, path, errors) {
  const descriptor = value.result_descriptor ?? {};
  if (value.identity_mode !== 'preserve_source'
      && descriptor.removed_physical_fact_refs?.length > 0) {
    add(errors, `${path}.result_descriptor.removed_physical_fact_refs`,
      'identity_shape', 'only a preserved source can remove existing facts');
  }
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
  const partialOutput = value.identity_mode === 'independent_outputs'
    && value.result_class === 'partial_transformation';
  if (partialOutput !== (descriptor.source_fact_delta !== null)) {
    add(errors, `${path}.result_descriptor.source_fact_delta`,
      'identity_shape',
      'only a surviving partial source requires a fact delta');
  }
  const sourceDelta = descriptor.source_fact_delta;
  if (sourceDelta != null && sourceDelta.physical_description === null
      && sourceDelta.qualitative_facts?.length === 0
      && sourceDelta.removed_physical_fact_refs?.length === 0) {
    add(errors, `${path}.result_descriptor.source_fact_delta`,
      'result_shape', 'must change current physical facts');
  }
  const combinedSource = value.identity_mode === 'preserve_source'
    && value.source_refs?.length > 1;
  if (combinedSource
      ? !['minor', 'half', 'major', 'whole'].includes(value.material_extent)
      : partialOutput
      ? !['minor', 'half', 'major'].includes(value.material_extent)
      : value.identity_mode === 'independent_outputs'
        ? value.material_extent !== 'whole'
        : value.material_extent !== null) {
    add(errors, `${path}.material_extent`, 'material_extent_shape',
      'material extent must match the physical identity transition');
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
  if (value.identity_mode === 'independent_outputs'
      && descriptor.physical_form === null) {
    add(errors, `${path}.result_descriptor.physical_form`, 'identity_shape',
      'independent output requires a qualitative physical form');
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
