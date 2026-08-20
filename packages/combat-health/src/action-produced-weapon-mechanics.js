import { deepFreeze } from '@rus/kernel';

export const ACTION_PRODUCED_WEAPON_CLASSES = Object.freeze([
  'improvised_puncture_light',
  'improvised_impact_light',
  'improvised_cutting_light',
  'improvised_two_hand_heavy'
]);

const dangerByClass = new Map([
  ['improvised_puncture_light', 1],
  ['improvised_impact_light', 1],
  ['improvised_cutting_light', 1],
  ['improvised_two_hand_heavy', 2]
]);

export function resolveActionProducedCombatWeaponClass(input) {
  const safe = snapshot(input);
  const classification = safe?.classification;
  if (!exact(safe, ['classification'])
      || !exact(classification, [
        'schema', 'request_id', 'qualitative_class'
      ])
      || classification.schema
        !== 'rus.combat.action_produced_weapon_classification.v1'
      || !text(classification.request_id)
      || !dangerByClass.has(classification.qualitative_class)) {
    fail('COMBAT_ACTION_PRODUCED_WEAPON_CLASSIFICATION_INVALID');
  }
  return deepFreeze({
    schema: 'rus.combat.action_produced_weapon_class_resolution.v1',
    request_id: classification.request_id,
    qualitative_class: classification.qualitative_class,
    formal_mechanics: {
      weapon_danger: dangerByClass.get(classification.qualitative_class)
    }
  });
}

function exact(value, keys) {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype
    && Object.keys(value).length === keys.length
    && keys.every((key) => Object.hasOwn(value, key));
}
function text(value) {
  return typeof value === 'string' && value.length > 0
    && value.trim() === value;
}
function snapshot(value) {
  try { return copy(value, new WeakSet()); } catch { return null; }
}
function copy(value, seen) {
  if (value === null || typeof value === 'string'
      || typeof value === 'boolean'
      || typeof value === 'number' && Number.isFinite(value)) return value;
  if (!value || typeof value !== 'object' || seen.has(value)) throw new Error();
  seen.add(value);
  const array = Array.isArray(value);
  if (Object.getPrototypeOf(value) !== (array
    ? Array.prototype : Object.prototype)
      || Object.getOwnPropertySymbols(value).length !== 0) throw new Error();
  const names = Object.getOwnPropertyNames(value);
  const output = array ? [] : {};
  if (array && (names.length !== value.length + 1
    || !names.includes('length'))) throw new Error();
  for (const key of names) {
    if (array && key === 'length') continue;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor?.enumerable !== true || !Object.hasOwn(descriptor, 'value')) {
      throw new Error();
    }
    const copied = copy(descriptor.value, seen);
    if (array) {
      if (key !== String(output.length)) throw new Error();
      output.push(copied);
    } else output[key] = copied;
  }
  return output;
}
function fail(code) { throw Object.assign(new TypeError(code), { code }); }
