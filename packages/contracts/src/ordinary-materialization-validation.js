export function exactObject(value, keys, path, errors) {
  if (!plainObject(value)) {
    issue(errors, path, 'type', `${path} must be an object.`);
    return false;
  }
  for (const key of keys) if (!Object.hasOwn(value, key)) issue(errors, path === '$' ? key : `${path}.${key}`, 'required', `${path === '$' ? key : `${path}.${key}`} is required.`);
  for (const key of Object.keys(value)) if (!keys.includes(key)) issue(errors, path === '$' ? key : `${path}.${key}`, 'additional_property', `${path === '$' ? key : `${path}.${key}`} is not allowed.`);
  return true;
}

export function arrayOf(value, path, errors, validator) {
  if (!Array.isArray(value)) {
    issue(errors, path, 'type', `${path} must be an array.`);
    return;
  }
  value.forEach((item, index) => validator(item, `${path}[${index}]`, errors));
}

export function arrayOfStrings(value, path, errors, nonempty = false) {
  arrayOf(value, path, errors, (item, itemPath, itemErrors) => nonemptyString(item, itemPath, itemErrors));
  if (nonempty && Array.isArray(value) && value.length === 0) issue(errors, path, 'min_items', `${path} must not be empty.`);
}

export function arrayOfEnum(value, values, path, errors) {
  arrayOf(value, path, errors, (item, itemPath, itemErrors) => enumValue(item, values, itemPath, itemErrors));
}

export function nonemptyString(value, path, errors) {
  if (typeof value !== 'string' || value.trim() !== value || value.length === 0) issue(errors, path, 'type', `${path} must be a nonempty string.`);
}

export function stringConst(value, constant, path, errors) {
  if (typeof value !== 'string') issue(errors, path, 'type', `${path} must be a string.`);
  else if (value !== constant) issue(errors, path, 'const', `${path} must equal ${constant}.`);
}

export function enumValue(value, values, path, errors) {
  if (typeof value !== 'string') issue(errors, path, 'type', `${path} must be a string.`);
  else if (!values.includes(value)) issue(errors, path, 'enum', `${path} must be one of: ${values.join(', ')}.`);
}

export function nullableEnum(value, values, path, errors) {
  if (value !== null) enumValue(value, values, path, errors);
}

export function boolean(value, path, errors) {
  if (typeof value !== 'boolean') issue(errors, path, 'type', `${path} must be a boolean.`);
}

export function nonnegativeInteger(value, path, errors) {
  if (!Number.isInteger(value) || value < 0) issue(errors, path, 'type', `${path} must be a nonnegative integer.`);
}

export function positiveInteger(value, path, errors) {
  if (!Number.isInteger(value) || value < 1) issue(errors, path, 'type', `${path} must be a positive integer.`);
}

export function boundedInteger(value, min, max, path, errors) {
  if (!Number.isInteger(value) || value < min || value > max) issue(errors, path, 'range', `${path} must be an integer from ${min} to ${max}.`);
}

export function issue(errors, path, code, message) {
  errors.push({ path, code, message });
}

export function assertValid(value, validator, code) {
  const errors = validator(value);
  if (errors.length === 0) return value;
  const error = new TypeError(errors.map(({ message }) => message).join('\n'));
  error.name = 'OrdinaryMaterializationValidationError';
  error.code = code;
  error.validationErrors = errors;
  throw error;
}

export function freezeErrors(errors) {
  return Object.freeze(errors.map((error) => Object.freeze(error))
    .sort((left, right) => `${left.path}\u0000${left.code}\u0000${left.message}`.localeCompare(`${right.path}\u0000${right.code}\u0000${right.message}`)));
}

function plainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype
      || Object.getPrototypeOf(value) === null);
}

export function validateJsonDataBoundary(root) {
  const errors = [];
  const seen = new WeakSet();
  const stack = [{ value: root, path: '$' }];
  while (stack.length !== 0) {
    const { value, path } = stack.pop();
    if (value === null || typeof value === 'string' || typeof value === 'boolean') continue;
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) issue(errors, path, 'data_boundary', `${path} must not be nonfinite.`);
      continue;
    }
    if (typeof value !== 'object') {
      issue(errors, path, 'data_boundary', `${path} must be JSON data.`);
      continue;
    }
    if (seen.has(value)) {
      issue(errors, path, 'data_boundary', `${path} must not contain cycles or aliases.`);
      continue;
    }
    seen.add(value);
    const array = Array.isArray(value);
    const prototype = Object.getPrototypeOf(value);
    if ((array && prototype !== Array.prototype)
        || (!array && prototype !== Object.prototype && prototype !== null)) {
      issue(errors, path, 'data_boundary', `${path} must have a JSON-compatible prototype.`);
      continue;
    }
    const keys = Reflect.ownKeys(value);
    if (keys.some((key) => typeof key === 'symbol')) {
      issue(errors, path, 'data_boundary', `${path} must not contain symbol keys.`);
      continue;
    }
    if (array) {
      const length = Object.getOwnPropertyDescriptor(value, 'length');
      const validKeys = length?.enumerable === false
        && Object.hasOwn(length, 'value')
        && length.value === value.length
        && keys.length === value.length + 1
        && keys.every((key) => key === 'length' || typeof key === 'string'
          && Number.isSafeInteger(Number(key))
          && Number(key) >= 0 && Number(key) < value.length
          && String(Number(key)) === key);
      if (!validKeys) {
        issue(errors, path, 'data_boundary', `${path} must be a dense standard array.`);
        continue;
      }
    }
    for (const key of keys.sort((left, right) => String(left).localeCompare(String(right)))) {
      if (array && key === 'length') continue;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      const childPath = array ? `${path}[${key}]` : `${path}.${key}`;
      if (descriptor?.enumerable !== true || !Object.hasOwn(descriptor ?? {}, 'value')) {
        issue(errors, childPath, 'data_boundary', `${childPath} must be an enumerable data property.`);
        continue;
      }
      stack.push({ value: descriptor.value, path: childPath });
    }
  }
  return errors;
}
