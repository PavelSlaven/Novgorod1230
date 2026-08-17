import { deepFreeze, sha256 } from '@rus/kernel';

const QUALITATIVE_CATALOG = Object.freeze([
  Object.freeze({ qualitative_class: 'improvised_puncture_light',
    weapon_danger: 1 }),
  Object.freeze({ qualitative_class: 'improvised_impact_light',
    weapon_danger: 1 }),
  Object.freeze({ qualitative_class: 'improvised_cutting_light',
    weapon_danger: 1 }),
  Object.freeze({ qualitative_class: 'improvised_two_hand_heavy',
    weapon_danger: 2 })
]);
const PROFILE_REF = 'rus.combat.action_produced_improvised_weapon';
const CATALOG_DIGEST = `sha256:${sha256({
  domain: 'rus.combat.action_produced_weapon_catalog.v1',
  entries: QUALITATIVE_CATALOG
})}`;
const INPUT_KEYS = ['classification', 'profile', 'expected_profile_pin'];
const CLASSIFICATION_KEYS = ['schema', 'qualitative_class'];
const PROFILE_KEYS = [
  'schema', 'version', 'status', 'profile_ref', 'profile_version',
  'state_version', 'catalog_digest'
];
const PROFILE_PIN_KEYS = [
  'profile_ref', 'profile_version', 'state_version', 'catalog_digest'
];

export function combatActionProducedWeaponProfile() {
  return deepFreeze({
    schema: 'rus.combat.action_produced_weapon_owner_profile.v1',
    version: 1, status: 'committed', profile_ref: PROFILE_REF,
    profile_version: '1', state_version: 1,
    catalog_digest: CATALOG_DIGEST
  });
}

export function resolveActionProducedCombatWeaponClass(rawInput) {
  const input = snapshot(rawInput);
  if (!exact(input, INPUT_KEYS)) {
    fail('COMBAT_ACTION_PRODUCED_WEAPON_INPUT_INVALID');
  }
  const profile = validateProfile(input.profile);
  const expectedPin = validateProfilePin(input.expected_profile_pin);
  const actualPin = profilePin(profile);
  if (digest(expectedPin) !== digest(actualPin)) {
    fail('COMBAT_ACTION_PRODUCED_WEAPON_PROFILE_STALE');
  }
  const classification = input.classification;
  if (!exact(classification, CLASSIFICATION_KEYS)
      || classification.schema
        !== 'rus.combat.action_produced_weapon_classification.v1') {
    fail('COMBAT_ACTION_PRODUCED_WEAPON_CLASSIFICATION_INVALID');
  }
  const entry = QUALITATIVE_CATALOG.find(({ qualitative_class: value }) =>
    value === classification.qualitative_class);
  if (!entry) fail('COMBAT_ACTION_PRODUCED_WEAPON_CLASSIFICATION_INVALID');
  return deepFreeze({
    schema: 'rus.combat.action_produced_weapon_class_resolution.v1',
    qualitative_class: entry.qualitative_class,
    formal_mechanics: { weapon_danger: entry.weapon_danger },
    profile_pin: actualPin
  });
}

function validateProfile(value) {
  if (!exact(value, PROFILE_KEYS)
      || value.schema
        !== 'rus.combat.action_produced_weapon_owner_profile.v1'
      || value.version !== 1 || value.status !== 'committed'
      || value.profile_ref !== PROFILE_REF || value.profile_version !== '1'
      || value.state_version !== 1
      || value.catalog_digest !== CATALOG_DIGEST) {
    fail('COMBAT_ACTION_PRODUCED_WEAPON_PROFILE_INVALID');
  }
  return value;
}
function validateProfilePin(value) {
  if (!exact(value, PROFILE_PIN_KEYS) || !text(value.profile_ref)
      || !text(value.profile_version)
      || !Number.isSafeInteger(value.state_version)
      || value.state_version < 1 || !text(value.catalog_digest)) {
    fail('COMBAT_ACTION_PRODUCED_WEAPON_PROFILE_PIN_INVALID');
  }
  return value;
}
function profilePin(profile) {
  return {
    profile_ref: profile.profile_ref,
    profile_version: profile.profile_version,
    state_version: profile.state_version,
    catalog_digest: profile.catalog_digest
  };
}
function exact(value, keys) {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === keys.length
    && keys.every((key) => Object.hasOwn(value, key));
}
function text(value) {
  return typeof value === 'string' && value.length > 0
    && value.trim() === value;
}
function digest(value) { return `sha256:${sha256(value)}`; }
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
