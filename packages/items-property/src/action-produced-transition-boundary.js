export function snapshotActionProducedBoundary(value) {
  try { return copy(value, new WeakSet()); } catch { return null; }
}

export function exactActionProducedFunctionOption(value, key) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || Object.getPrototypeOf(value) !== Object.prototype
      || Object.getOwnPropertySymbols(value).length !== 0
      || Object.getOwnPropertyNames(value).length !== 1) fail();
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (descriptor?.enumerable !== true || !Object.hasOwn(descriptor, 'value')
      || typeof descriptor.value !== 'function') fail();
  return descriptor.value;
}

export function frozenActionProducedDataProperty(value, key) {
  const descriptor = value && typeof value === 'object'
    ? Object.getOwnPropertyDescriptor(value, key) : null;
  return descriptor?.enumerable === true && Object.hasOwn(descriptor, 'value')
    && deeplyFrozen(descriptor.value, new WeakSet());
}

export function nextActionProducedStateVersion(value) {
  if (!/^[1-9]\d*$/u.test(value)) fail();
  const current = Number(value);
  if (!Number.isSafeInteger(current) || current === Number.MAX_SAFE_INTEGER) {
    fail();
  }
  return String(current + 1);
}

export function validActionProducedQualitativeResult(value, {
  identityMode, resultClass, sourceCount
}) {
  if (!exact(value, ['intended_transformation', 'material_extent',
    'result_descriptor', 'output_class'])
      || !text(value.intended_transformation)
      || !exact(value.result_descriptor,
        descriptorKeys(value.result_descriptor))) return false;
  const descriptor = value.result_descriptor;
  return validMaterialExtent(value.material_extent, identityMode,
    resultClass, sourceCount)
    && (identityMode === 'independent_outputs'
      ? text(descriptor.display_name) : nullableText(descriptor.display_name))
    && nullableText(descriptor.physical_description)
    && (descriptor.physical_form === null
      || ['compact', 'regular', 'long', 'bulky'].includes(
        descriptor.physical_form))
    && refs(descriptor.qualitative_facts)
    && (!Object.hasOwn(descriptor, 'removed_physical_fact_refs')
      || refs(descriptor.removed_physical_fact_refs)
        && (identityMode === 'preserve_source'
          || descriptor.removed_physical_fact_refs.length === 0))
    && nullableText(descriptor.inscription_text)
    && validSourceFactDelta(descriptor.source_fact_delta,
      identityMode === 'independent_outputs'
        && resultClass === 'partial_transformation')
    && !(identityMode === 'independent_outputs'
      && resultClass === 'partial_transformation' && sourceCount !== 1);
}

function validSourceFactDelta(value, required) {
  if (value === null) return !required;
  return required && exact(value, [
    'physical_description', 'qualitative_facts',
    'removed_physical_fact_refs', 'physical_form'
  ]) && nullableText(value.physical_description)
    && refs(value.qualitative_facts) && refs(value.removed_physical_fact_refs)
    && ['compact', 'regular', 'long', 'bulky'].includes(value.physical_form);
}

function validMaterialExtent(value, identityMode, resultClass, sourceCount) {
  return identityMode === 'preserve_source'
    ? sourceCount > 1 ? ['minor', 'half', 'major', 'whole'].includes(value)
      : value === null
    : identityMode !== 'independent_outputs' ? value === null
    : resultClass === 'partial_transformation'
      ? ['minor', 'half', 'major'].includes(value) : value === 'whole';
}

function descriptorKeys(value) {
  const keys = ['display_name', 'physical_description', 'qualitative_facts',
    'inscription_text', 'physical_form', 'source_fact_delta'];
  if (value != null && Object.hasOwn(value, 'removed_physical_fact_refs')) {
    keys.push('removed_physical_fact_refs');
  }
  return keys;
}

function exact(value, keys) {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === keys.length
    && keys.every((key) => Object.hasOwn(value, key));
}
function text(value) { return typeof value === 'string'
  && value.length > 0 && value.trim() === value; }
function nullableText(value) { return value === null || text(value); }
function refs(value) { return Array.isArray(value) && value.every(text)
  && new Set(value).size === value.length; }

function deeplyFrozen(value, seen) {
  if (value === null || typeof value !== 'object') return true;
  if (seen.has(value) || !Object.isFrozen(value)) return false;
  seen.add(value);
  for (const key of Object.getOwnPropertyNames(value)) {
    if (Array.isArray(value) && key === 'length') continue;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor?.enumerable !== true || !Object.hasOwn(descriptor, 'value')
        || !deeplyFrozen(descriptor.value, seen)) return false;
  }
  return true;
}

function copy(value, seen) {
  if (value === null || typeof value === 'string'
      || typeof value === 'boolean'
      || typeof value === 'number' && Number.isFinite(value)) return value;
  if (!value || typeof value !== 'object' || seen.has(value)) fail();
  seen.add(value);
  const array = Array.isArray(value);
  if (Object.getPrototypeOf(value) !== (array
    ? Array.prototype : Object.prototype)
      || Object.getOwnPropertySymbols(value).length !== 0) fail();
  const names = Object.getOwnPropertyNames(value);
  const result = array ? [] : {};
  if (array && (names.length !== value.length + 1
    || !names.includes('length'))) fail();
  for (const key of names) {
    if (array && key === 'length') continue;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor?.enumerable !== true
        || !Object.hasOwn(descriptor, 'value')) fail();
    const copied = copy(descriptor.value, seen);
    if (array) {
      if (key !== String(result.length)) fail();
      result.push(copied);
    } else result[key] = copied;
  }
  return result;
}

function fail() {
  throw Object.assign(new TypeError('ITEM_ACTION_PRODUCED_TRANSITION_INVALID'),
    { code: 'ITEM_ACTION_PRODUCED_TRANSITION_INVALID' });
}
