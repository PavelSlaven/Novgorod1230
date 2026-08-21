import { deepFreeze } from '@rus/kernel';
import { resolveInventoryMechanicsProfile } from
  './runtime-instance-mechanics.js';
import { runtimeItemIsTerminal } from './runtime-item-visibility.js';

export function admitLocalFireInput({ item, placement, ownership,
  bound_process_ref: boundProcessRef = null, actor_ref: actorRef,
  scope_ref: scopeRef, fuel_mass_grams_min: minimum,
  fuel_mass_grams_max: maximum, process_ref: processRef = null } = {}) {
  const due = text(processRef);
  if ((!due && !text(actorRef)) || !text(scopeRef) || !plain(item) || !plain(placement)
      || !plain(ownership) || placement.item_id !== item.item_id
      || ownership.item_id !== item.item_id || runtimeItemIsTerminal(item)
      || item.state?.lifecycle_status !== 'active'
      || !Number.isSafeInteger(item.state_version) || item.state_version < 0
      || (due ? boundProcessRef !== processRef : boundProcessRef !== null)
      || (!due && !accessible(placement, ownership, actorRef, scopeRef))) {
    return denied();
  }
  const classification = item.state?.local_fire_fuel;
  if (classification?.schema === 'rus.items.local_fire_fuel.v1'
      && classification.fuel_class === 'ordinary_solid_fuel_unit'
      && classification.whole_unit === true && item.quantity === 1
      && Number.isSafeInteger(classification.mechanics?.mass_grams)
      && classification.mechanics.mass_grams >= minimum
      && classification.mechanics.mass_grams <= maximum) {
    return admitted('fuel_unit', item, placement, ownership, {
      fuel_ref: item.item_id, fuel_class: classification.fuel_class,
      state_version: item.state_version, lifecycle_state: 'active',
      mass_grams: classification.mechanics.mass_grams, quantity: 1,
      bound_process_ref: boundProcessRef
    });
  }
  if (due) return denied();
  const mechanics = resolveInventoryMechanicsProfile({
    instance: { template_id: item.template_id,
      ...(item.template_id == null ? {
        runtime_instance_mechanics_snapshot:
          item.state?.runtime_instance_mechanics_snapshot
      } : {}) },
    profiles: []
  });
  if (item.state?.ordinary_metadata?.semantic_type !== 'water_portion'
      || item.quantity !== 1 || !mechanics.pass
      || mechanics.profile.quantity?.value !== 1) return denied();
  return admitted('water_portion', item, placement, ownership, {
    item_ref: item.item_id, state_version: item.state_version,
    mass_grams: mechanics.profile.mass_grams, quantity: 1
  });
}

export function planLocalFireWholeItemRetirement({ admission,
  process_ref: processRef } = {}) {
  if (admission?.pass !== true || !text(processRef)
      || !plain(admission.item) || runtimeItemIsTerminal(admission.item)) {
    throw coded('ITEM_LOCAL_FIRE_RETIREMENT_INVALID');
  }
  const item = admission.item;
  return deepFreeze({ item_id: item.item_id,
    expected_item_state_version: item.state_version,
    before_item: structuredClone(item),
    after_item: { ...structuredClone(item), condition_state: 'retired',
      state: { ...structuredClone(item.state), lifecycle_status: 'retired' },
      state_version: item.state_version + 1 } });
}

function admitted(inputKind, item, placement, ownership, snapshot) {
  return deepFreeze({ pass: true, input_kind: inputKind,
    item: structuredClone(item), placement: structuredClone(placement),
    ownership: structuredClone(ownership), snapshot, errors: [] });
}
function denied() {
  return deepFreeze({ pass: false, input_kind: null, item: null,
    placement: null, ownership: null, snapshot: null,
    errors: [{ code: 'ITEM_LOCAL_FIRE_INPUT_NOT_ADMITTED' }] });
}
function accessible(placement, ownership, actorRef, scopeRef) {
  const held = actorField(placement, 'holder') === actorRef;
  const local = placement.anchor_id === scopeRef
    && placement.container_id == null && placement.holder_npc_id == null
    && placement.holder_character_id == null
    && placement.attached_item_id == null;
  const controlled = actorField(ownership, 'controller') === actorRef;
  const owned = actorField(ownership, 'owner') === actorRef
    || ownership.owner_party === true;
  return (held || local) && controlled && owned;
}
function actorField(value, prefix) {
  const character = value?.[`${prefix}_character_id`];
  const npc = value?.[`${prefix}_npc_id`];
  return text(character) && !text(npc) ? character
    : text(npc) && !text(character) ? npc : null;
}
function plain(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}
function text(value) {
  return typeof value === 'string' && value.trim() === value && value;
}
function coded(code) { return Object.assign(new TypeError(code), { code }); }
