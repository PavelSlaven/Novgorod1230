import { EnvironmentFeatureError } from './errors.js';

export function text(value) { return String(value ?? '').trim(); }

export function requiredObject(value, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new EnvironmentFeatureError('ENVIRONMENT_INPUT_INVALID', `${name} must be an object.`);
}

export function requiredValue(value, key) {
  if (value === undefined || value === null || (typeof value === 'string' && !value.trim())) throw new EnvironmentFeatureError('ENVIRONMENT_INPUT_INVALID', `${key} is required.`);
}

export function requiredText(value, code) {
  const result = text(value);
  if (!result) throw new EnvironmentFeatureError(code, 'Approved template requires a public field.');
  return result;
}

export function numberAtLeast(value, minimum, key) {
  if (value === undefined || value === null || value === '') throw new EnvironmentFeatureError('ENVIRONMENT_INPUT_INVALID', `${key} is required.`);
  const number = Number(value);
  if (!Number.isFinite(number) || number < minimum) throw new EnvironmentFeatureError('ENVIRONMENT_INPUT_INVALID', `${key} must be a number >= ${minimum}.`);
  return number;
}

export function finiteOr(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function issue(code, detail) { return { code, detail }; }
export function required(rule) { return rule.required === true || Number(rule.min_count) > 0; }
export function approved(record) { return record?.status === 'approved'; }
export function byId(key) { return (left, right) => text(left[key]).localeCompare(text(right[key])); }
export function emptyRejections() { return { rejected_count: 0, missing_count: 0, unapproved_count: 0, wrong_domain_count: 0 }; }
export function strengthBand(value) { return value >= 0.7 ? 'strong' : value >= 0.2 ? 'weak' : 'faint'; }

export function uniqueBy(items, key, code) {
  if (!Array.isArray(items)) throw new EnvironmentFeatureError(code, `${key} collection must be an array.`);
  const ids = new Set();
  for (const item of items) {
    const id = text(item?.[key]);
    if (!id || ids.has(id)) throw new EnvironmentFeatureError(code, `${key} must be non-empty and unique.`, { key, value: id });
    ids.add(id);
  }
  return items;
}

export function validateUnique(items, key, code, errors) {
  const ids = new Set();
  for (const item of items) {
    const id = text(item?.[key]);
    if (!id || ids.has(id)) errors.push(issue(code, id || 'missing'));
    ids.add(id);
  }
}
