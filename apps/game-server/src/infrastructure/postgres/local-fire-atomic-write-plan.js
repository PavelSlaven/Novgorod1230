import { admitLocalFireIgnitionBasis, admitLocalFireInput,
  planLocalFireFuelPlacementTransition,
  planLocalFireWholeItemRetirement } from
  '@rus/items-property';
import { resolveLocalExactFire } from '@rus/world-processes/local-exact-fire';

const REQUEST_KEYS = ['schema','party_id','base_party_state_version',
  'change_set_id','actor_ref','profile_pin','process_state','input_pins',
  'ignition_basis_pin','action','process_ref','at_timestamp','cause',
  'qualitative_outcome'];
const PLAN_KEYS = ['schema','party_id','base_party_state_version',
  'change_set_id','actor_ref','profile_pin','input_pins',
  'ignition_basis_pin','transition_proposal','fuel_placement_transitions',
  'item_retirement_transition'];

export function createLocalFireAtomicWritePlan(raw) {
  const input = clone(raw);
  if (exact(input, PLAN_KEYS) && input.schema === 'local_fire_atomic_write_plan_v1') {
    return validatePlan(input);
  }
  if (!exact(input, REQUEST_KEYS)
      || input.schema !== 'local_fire_atomic_write_request_v1'
      || !text(input.party_id) || !text(input.change_set_id)
      || !text(input.actor_ref) || !Number.isSafeInteger(input.base_party_state_version)
      || !Array.isArray(input.input_pins)) fail('LOCAL_FIRE_PLAN_INVALID');
  const profile = validateProfilePin(input.profile_pin);
  validateIgnition(input.ignition_basis_pin, input.action, input.actor_ref,
    profile);
  const admissions = admitInputs(input, profile);
  const proposal = resolveLocalExactFire(transitionRequest(input, profile,
    admissions));
  const admission = admissions.find(({ item }) =>
    item.item_id === proposal.consumed_item_ref);
  const retirement = proposal.consumed_item_ref == null ? null
    : planLocalFireWholeItemRetirement({ admission,
      process_ref: proposal.process_after.process_ref });
  const placements = fuelPlacementTransitions(admissions, proposal);
  return validatePlan({ schema: 'local_fire_atomic_write_plan_v1',
    party_id: input.party_id,
    base_party_state_version: input.base_party_state_version,
    change_set_id: input.change_set_id, actor_ref: input.actor_ref,
    profile_pin: profile, input_pins: input.input_pins,
    ignition_basis_pin: input.ignition_basis_pin,
    transition_proposal: proposal,
    fuel_placement_transitions: placements,
    item_retirement_transition: retirement });
}

export function localFirePhysicalKeys(plan) {
  if (plan == null) return [];
  const value = createLocalFireAtomicWritePlan(plan);
  const party = value.party_id;
  return [
    `party_runtime.party_local_world_processes:${party}:${value.transition_proposal.process_after.process_ref}`,
    ...value.input_pins.flatMap((pin) => [
      `party_runtime.party_items:${party}:${pin.item_id}`,
      `party_runtime.party_item_placements:${party}:${pin.item_id}`,
      `party_runtime.party_ownership:${party}:${pin.ownership.ownership_id}`,
      ...(pin.container==null?[]:[
        `party_runtime.party_containers:${party}:${pin.container.container_id}`])
    ]), ...(value.ignition_basis_pin == null ? [] : [
      `party_runtime.party_items:${party}:${value.ignition_basis_pin.item_id}`,
      `party_runtime.party_item_placements:${party}:${value.ignition_basis_pin.item_id}`,
      `party_runtime.party_ownership:${party}:${value.ignition_basis_pin.ownership.ownership_id}`
    ])
  ];
}

export function applyLocalFireProjection({ next, plan }) {
  const value = createLocalFireAtomicWritePlan(plan);
  for (const placement of value.fuel_placement_transitions) {
    const item = next?.items?.find(({ item_id: id }) => id === placement.item_id);
    if (item == null) fail('LOCAL_FIRE_PROJECTION_INVALID');
    const current = physicalPlacement(item.placement ?? item);
    const before = physicalPlacement(placement.before_placement);
    const after = physicalPlacement(placement.after_placement);
    if (JSON.stringify(current) === JSON.stringify(after)) continue;
    if (JSON.stringify(current) !== JSON.stringify(before)) {
      fail('LOCAL_FIRE_PROJECTION_INVALID');
    }
    item.placement = clone(after);
  }
  const transition = value.item_retirement_transition;
  if (transition == null) return next;
  const item = next?.items?.find(
    ({ item_id: id }) => id === transition.item_id);
  if (item == null) fail('LOCAL_FIRE_PROJECTION_INVALID');
  const fields = ({ condition_state, state, state_version }) =>
    ({ condition_state, state, state_version });
  const current = fields(item), before = fields(transition.before_item);
  const after = fields(transition.after_item);
  if (JSON.stringify(current) === JSON.stringify(after)) return next;
  if (JSON.stringify(current) !== JSON.stringify(before)) {
    fail('LOCAL_FIRE_PROJECTION_INVALID');
  }
  Object.assign(item, clone(after));
  return next;
}

function validatePlan(value) {
  if (!exact(value, PLAN_KEYS) || value.schema !== 'local_fire_atomic_write_plan_v1'
      || !text(value.party_id) || !text(value.change_set_id)
      || !text(value.actor_ref) || !Number.isSafeInteger(value.base_party_state_version)
      || !Array.isArray(value.input_pins)) fail('LOCAL_FIRE_PLAN_INVALID');
  const profile = validateProfilePin(value.profile_pin);
  const proposal = value.transition_proposal;
  validateIgnition(value.ignition_basis_pin, proposal?.action, value.actor_ref,
    profile);
  const admissions = admitInputs({ actor_ref: value.actor_ref,
    process_ref: proposal?.process_before?.process_ref ?? null,
    process_state: proposal?.process_before ?? null,
    action: proposal?.action, input_pins: value.input_pins,
    at_timestamp: proposal?.at_timestamp, cause: proposal?.cause,
    qualitative_outcome: proposal?.action === 'affect' ? proposal.outcome : null },
  profile);
  const expected = resolveLocalExactFire(transitionRequest({
    actor_ref: value.actor_ref, process_ref: proposal?.process_after?.process_ref,
    process_state: proposal?.process_before ?? null, action: proposal?.action,
    at_timestamp: proposal?.at_timestamp, cause: proposal?.cause,
    qualitative_outcome: proposal?.action === 'affect' ? proposal.outcome : null
  }, profile, admissions));
  if (JSON.stringify(expected) !== JSON.stringify(proposal)) fail('LOCAL_FIRE_PLAN_INVALID');
  const admission = admissions.find(({ item }) =>
    item.item_id === proposal.consumed_item_ref);
  const retirement = proposal.consumed_item_ref == null ? null
    : planLocalFireWholeItemRetirement({ admission,
      process_ref: proposal.process_after.process_ref });
  if (JSON.stringify(retirement) !== JSON.stringify(value.item_retirement_transition)) {
    fail('LOCAL_FIRE_PLAN_INVALID');
  }
  if (JSON.stringify(fuelPlacementTransitions(admissions, proposal))
      !== JSON.stringify(value.fuel_placement_transitions)) {
    fail('LOCAL_FIRE_PLAN_INVALID');
  }
  return freeze(value);
}

function fuelPlacementTransitions(admissions, proposal) {
  const added = new Set(proposal.added_fuel_refs);
  return admissions.filter(({ item }) => added.has(item.item_id))
    .map((admission) => planLocalFireFuelPlacementTransition({ admission,
      scope_ref: proposal.process_after.scope_ref })).filter(Boolean);
}

function physicalPlacement(value) {
  return { anchor_id: value?.anchor_id ?? null,
    container_id: value?.container_id ?? null,
    holder_npc_id: value?.holder_npc_id ?? null,
    holder_character_id: value?.holder_character_id ?? null,
    physical_position: value?.physical_position ?? null,
    equipment_slot_category_id: value?.equipment_slot_category_id ?? null,
    attached_item_id: value?.attached_item_id ?? null };
}

function transitionRequest(input, profile, admissions) {
  return { schema: 'rus.world_processes.local_fire_transition_request.v1',
    action: input.action, process_ref: input.process_ref,
    at_timestamp: input.at_timestamp, scope_ref: profile.scope_ref,
    causal_basis_ref: profile.ignition_basis_ref, cause: input.cause,
    policy: profile.policy, process: input.process_state,
    fuel_units: admissions.filter((entry) => entry.input_kind === 'fuel_unit')
      .map((entry) => entry.snapshot),
    affect: input.action === 'affect' ? {
      process_outcome: input.qualitative_outcome,
      consumed_item_ref: admissions.find((entry) =>
        entry.input_kind === 'water_portion')?.item.item_id ?? null
    } : null };
}

function admitInputs(input, profile) {
  const due = input.action === 'due_boundary';
  const admissions = input.input_pins.map((pin) => admitLocalFireInput({
    item: pin.item, placement: pin.placement, ownership: pin.ownership,
    container: pin.container,
    bound_process_ref: pin.bound_process_ref,
    actor_ref: due ? null : input.actor_ref, scope_ref: profile.scope_ref,
    fuel_mass_grams_min: profile.policy.fuel_unit_mass_grams_min,
    fuel_mass_grams_max: profile.policy.fuel_unit_mass_grams_max,
    process_ref: due ? input.process_ref : null
  }));
  if (admissions.some(({ pass }) => !pass)) fail('LOCAL_FIRE_INPUT_NOT_ADMITTED');
  if (input.action === 'affect'
      && (admissions.length !== 1
        || admissions[0].input_kind !== 'water_portion')
      || input.action !== 'affect'
        && admissions.some(({ input_kind: kind }) => kind !== 'fuel_unit')) {
    fail('LOCAL_FIRE_INPUT_NOT_ADMITTED');
  }
  return admissions;
}

function validateProfilePin(value) {
  if (!exact(value, ['profile_ref','profile_version','context_ref','scope_ref',
    'ignition_basis_ref','policy']) || ![value.profile_ref,value.context_ref,
    value.scope_ref,value.ignition_basis_ref].every(text)
      || value.profile_version !== 1 || !plain(value.policy)) {
    fail('LOCAL_FIRE_PROFILE_PIN_INVALID');
  }
  return value;
}
function validateIgnition(pin, action, actorRef, profile) {
  if (action !== 'start') {
    if (pin !== null) fail('LOCAL_FIRE_IGNITION_BASIS_INVALID');
    return;
  }
  if (pin?.item_id !== profile.ignition_basis_ref
      || !admitLocalFireIgnitionBasis({ item: pin.item,
        placement: pin.placement, ownership: pin.ownership,
        container: pin.container,
        actor_ref: actorRef, scope_ref: profile.scope_ref }).pass) {
    fail('LOCAL_FIRE_IGNITION_BASIS_INVALID');
  }
}
function clone(value) {
  const seen = new WeakSet();
  function visit(entry) {
    if (entry === null || typeof entry === 'string'
        || typeof entry === 'boolean'
        || typeof entry === 'number' && Number.isFinite(entry)) return entry;
    const array = Array.isArray(entry);
    if (!entry || typeof entry !== 'object' || seen.has(entry)
        || Object.getPrototypeOf(entry)
          !== (array ? Array.prototype : Object.prototype)
        || Object.getOwnPropertySymbols(entry).length) return undefined;
    seen.add(entry);
    const output = array ? [] : {};
    const names = Object.getOwnPropertyNames(entry);
    if (array && (names.length !== entry.length + 1
        || !names.includes('length'))) return undefined;
    for (const key of names) {
      if (array && key === 'length') continue;
      const descriptor = Object.getOwnPropertyDescriptor(entry, key);
      if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) {
        return undefined;
      }
      const child = visit(descriptor.value);
      if (child === undefined) return undefined;
      if (array) {
        if (key !== String(output.length)) return undefined;
        output.push(child);
      } else output[key] = child;
    }
    return output;
  }
  return visit(value) ?? null;
}
function exact(value, keys) { return plain(value)
  && Object.keys(value).length === keys.length
  && keys.every((key) => Object.hasOwn(value, key)); }
function plain(value) { return value != null && typeof value === 'object'
  && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype; }
function text(value) { return typeof value === 'string' && value.length > 0; }
function freeze(value) { if (value && typeof value === 'object' && !Object.isFrozen(value)) {
  for (const child of Object.values(value)) freeze(child); Object.freeze(value); }
  return value; }
function fail(code) { throw Object.assign(new Error(code), { code }); }
