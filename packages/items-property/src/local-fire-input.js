import { deepFreeze } from '@rus/kernel';
import { resolveInventoryMechanicsProfile } from
  './runtime-instance-mechanics.js';
import { runtimeItemIsTerminal } from './runtime-item-visibility.js';

export function admitLocalFireIgnitionBasis({ item, placement, ownership,
  container = null,
  actor_ref: actorRef, scope_ref: scopeRef } = {}) {
  const pass = plain(item) && plain(placement) && plain(ownership)
    && placement.item_id === item.item_id && ownership.item_id === item.item_id
    && item.state?.local_fire_ignition_basis?.schema
      === 'rus.items.local_fire_ignition_basis.v1'
    && item.state?.lifecycle_status === 'active'
    && itemPlacementIsPhysicallyAccessible({ placement, container,
      actor_ref: actorRef, scope_ref: scopeRef });
  return deepFreeze({ pass, errors: pass ? [] : [{
    code: 'ITEM_LOCAL_FIRE_IGNITION_BASIS_NOT_ADMITTED'
  }] });
}

export function deriveLocalFireFuelClassification({ source_items: sourceItems,
  source_refs: sourceRefs, mechanics_snapshot: mechanicsSnapshot } = {}) {
  if (!Array.isArray(sourceItems) || !Array.isArray(sourceRefs)
      || sourceRefs.length === 0 || new Set(sourceRefs).size !== sourceRefs.length) {
    return null;
  }
  const byRef = new Map(sourceItems.map((item) => [item?.item_id, item]));
  if (sourceRefs.some((ref) => !validFuelMarker(
    byRef.get(ref)?.state?.local_fire_fuel))) return null;
  const mechanics = resolveInventoryMechanicsProfile({ instance: {
    template_id: null, runtime_instance_mechanics_snapshot: mechanicsSnapshot
  }, profiles: [] });
  if (!mechanics.pass || mechanics.profile.container !== null
      || mechanics.profile.quantity?.value !== 1
      || mechanics.profile.quantity.unit !== 'item') return null;
  return deepFreeze({ schema: 'rus.items.local_fire_fuel.v1',
    fuel_class: 'ordinary_solid_fuel_unit', whole_unit: true,
    provenance: { source_refs: [...sourceRefs] } });
}

export function admitLocalFireInput({ item, placement, ownership,
  container = null,
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
      || (!due && !itemPlacementIsPhysicallyAccessible({ placement,container,
        actor_ref: actorRef, scope_ref: scopeRef }))) {
    return denied();
  }
  const classification = item.state?.local_fire_fuel;
  const mechanics = currentMechanics(item);
  if (classification?.schema === 'rus.items.local_fire_fuel.v1'
      && classification.fuel_class === 'ordinary_solid_fuel_unit'
      && classification.whole_unit === true && item.quantity === 1
      && mechanics.pass && mechanics.profile.container === null
      && mechanics.profile.quantity?.value === 1
      && mechanics.profile.quantity.unit === 'item'
      && Number.isSafeInteger(mechanics.profile.mass_grams)
      && mechanics.profile.mass_grams >= minimum
      && mechanics.profile.mass_grams <= maximum) {
    return admitted('fuel_unit', item, placement, ownership, {
      fuel_ref: item.item_id, fuel_class: classification.fuel_class,
      state_version: item.state_version, lifecycle_state: 'active',
      mass_grams: mechanics.profile.mass_grams, quantity: 1,
      bound_process_ref: boundProcessRef
    });
  }
  if (due) return denied();
  if (item.state?.ordinary_metadata?.semantic_type !== 'water_portion'
      || item.quantity !== 1 || !mechanics.pass
      || mechanics.profile.quantity?.value !== 1) return denied();
  return admitted('water_portion', item, placement, ownership, {
    item_ref: item.item_id, state_version: item.state_version,
    mass_grams: mechanics.profile.mass_grams, quantity: 1
  });
}

function currentMechanics(item) {
  if (item.template_id == null) return resolveInventoryMechanicsProfile({
    instance: { template_id: null, runtime_instance_mechanics_snapshot:
      item.state?.runtime_instance_mechanics_snapshot }, profiles: []
  });
  const profile = item.state?.inventory_profile_snapshot;
  const pass = plain(profile) && profile.item_template_ref === item.template_id
    && Number.isSafeInteger(profile.mass_grams) && profile.mass_grams > 0;
  return pass ? { pass: true, profile: { ...structuredClone(profile),
    quantity: { value: item.quantity, unit: 'item' }, container: null } }
    : { pass: false, profile: null };
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

export function planLocalFireFuelPlacementTransition({ admission,
  scope_ref: scopeRef } = {}) {
  if (admission?.pass !== true || admission.input_kind !== 'fuel_unit'
      || !text(scopeRef) || !plain(admission.placement)) {
    throw coded('ITEM_LOCAL_FIRE_PLACEMENT_INVALID');
  }
  const before = structuredClone(admission.placement);
  const after = { item_id: admission.item.item_id, anchor_id: scopeRef,
    container_id: null, holder_npc_id: null, holder_character_id: null,
    physical_position: null, equipment_slot_category_id: null,
    attached_item_id: null };
  if (JSON.stringify(before) === JSON.stringify(after)) return null;
  return deepFreeze({ owner: '@rus/items-property',
    transition_kind: 'local_fire_fuel_placement',
    item_id: admission.item.item_id, before_placement: before,
    after_placement: after, owner_change: 'forbidden' });
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
function validFuelMarker(value) {
  return value?.schema === 'rus.items.local_fire_fuel.v1'
    && value.fuel_class === 'ordinary_solid_fuel_unit'
    && value.whole_unit === true
    && Array.isArray(value.provenance?.source_refs)
    && value.provenance.source_refs.length > 0;
}
export function itemPlacementIsPhysicallyAccessible({ placement,container=null,
  actor_ref: actorRef, scope_ref: scopeRef } = {}) {
  if (!plain(placement) || !text(actorRef) || !text(scopeRef)) return false;
  const held = actorField(placement, 'holder') === actorRef;
  const local = placement.anchor_id === scopeRef
    && placement.container_id == null && placement.holder_npc_id == null
    && placement.holder_character_id == null
    && placement.attached_item_id == null;
  if(held||local)return true;
  return placement.container_id===container?.container_id
    &&container.closure_state==='open'&&container.parent_container_id==null
    &&(actorField(container,'holder')===actorRef
      ||container.anchor_id===scopeRef&&container.holder_npc_id==null
        &&container.holder_character_id==null);
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
