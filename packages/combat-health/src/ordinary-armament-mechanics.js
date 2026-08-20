import { deepFreeze } from '@rus/kernel';

export const ORDINARY_ARMAMENT_MECHANICS_CAPABILITY =
  'rus.combat.ordinary_armament.light.v1';

export function resolveOrdinaryArmamentMechanics(input = {}) {
  const value = copyData(input);
  if (!value || Object.keys(value).length !== 2
      || value.mechanics_capability_ref
        !== ORDINARY_ARMAMENT_MECHANICS_CAPABILITY
      || !['serviceable', 'damaged'].includes(value.condition_state)) {
    return null;
  }
  const usable = value.condition_state === 'serviceable';
  return deepFreeze({
    schema: 'rus.combat.ordinary_armament_mechanics_snapshot.v1',
    version: 1,
    mechanics_capability_ref: ORDINARY_ARMAMENT_MECHANICS_CAPABILITY,
    condition_state: value.condition_state,
    combat_usable: usable,
    weapon_danger: usable ? 1 : 0
  });
}

export function ordinaryArmamentWeaponDanger(snapshot) {
  const value = copyData(snapshot);
  if (!value || Object.keys(value).length !== 6
      || value.schema !== 'rus.combat.ordinary_armament_mechanics_snapshot.v1'
      || value.version !== 1
      || value.mechanics_capability_ref
        !== ORDINARY_ARMAMENT_MECHANICS_CAPABILITY
      || !['serviceable', 'damaged'].includes(value.condition_state)
      || value.combat_usable !== (value.condition_state === 'serviceable')
      || value.weapon_danger !== (value.combat_usable ? 1 : 0)) return null;
  return value.weapon_danger;
}

function copyData(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || Object.getPrototypeOf(value) !== Object.prototype
      || Object.getOwnPropertySymbols(value).length) return null;
  const output = {};
  for (const key of Object.getOwnPropertyNames(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')
        || !['string', 'number', 'boolean'].includes(typeof descriptor.value)) {
      return null;
    }
    output[key] = descriptor.value;
  }
  return output;
}
