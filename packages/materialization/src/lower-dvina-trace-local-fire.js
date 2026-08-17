import { canonicalDigest } from './core.js';
import { failLowerDvinaTraceMaterialization as fail } from
  './lower-dvina-trace-contract.js';

export function materializeLocalFireActivation(partyId, actorRef, anchorId,
  runId, profile, deterministicInstanceId) {
  validate(profile);
  const ignitionId = deterministicInstanceId(partyId, runId, 'item',
    profile.ignition_basis.authored_ref, 0);
  const fuelItems = profile.fuel_units.map((fuel, ordinal) => item({
    descriptor: fuel, instanceId: deterministicInstanceId(partyId, runId,
      'item', fuel.authored_ref, ordinal), anchorId, actorRef, fuel: true
  }));
  const ignition = item({ descriptor: profile.ignition_basis,
    instanceId: ignitionId, anchorId, actorRef, fuel: false });
  const row = { party_id: partyId, context_ref: profile.context_ref,
    profile_ref: profile.profile_id, profile_version: String(profile.revision),
    policy_ref: profile.policy_ref, policy_version: profile.policy_version,
    scope_ref: anchorId, ignition_basis_item_id: ignitionId,
    approved_fuel_item_ids: fuelItems.map(({ instance_id: id }) => id),
    recheck_interval: structuredClone(profile.recheck_interval),
    fuel_unit_mass_grams_min: profile.fuel_unit_mass_grams_min,
    fuel_unit_mass_grams_max: profile.fuel_unit_mass_grams_max,
    authority_state_version: 1, status: 'committed' };
  return { items: [ignition, ...fuelItems],
    authority: { ...row, authority_digest: `sha256:${canonicalDigest(row)}` } };
}

function item({ descriptor, instanceId, anchorId, actorRef, fuel }) {
  const mechanics = { mass_grams: descriptor.mass_grams,
    external_hand_cost: 0, carry_form: 'compact', packing_slot_cost: 1,
    quantity: 1, container: null };
  return { instance_id: instanceId, template_id: descriptor.template_id,
    profile_id: descriptor.profile_id,
    category_id: fuel ? 'ordinary_solid_fuel_unit' : 'ordinary_ignition_basis',
    quantity: 1, condition_state: 'serviceable', legal_status: 'owned',
    claim_state: 'owned', anchor_id: fuel ? anchorId : null,
    holder_character_id: fuel ? null : actorRef,
    physical_position: fuel ? null : 'hands',
    owner_character_id: actorRef, controller_character_id: actorRef,
    state: { lifecycle_status: 'active', display_name: descriptor.display_name,
      inventory_profile_snapshot: {
        inventory_profile_id: descriptor.profile_id,
        item_template_ref: descriptor.template_id,
        mass_grams: descriptor.mass_grams,
        carry_form: mechanics.carry_form,
        external_hand_cost: mechanics.external_hand_cost,
        packing_slot_cost: mechanics.packing_slot_cost
      },
      property_state: { schema: 'rus.items.local_fire_property_state.v1',
        authority: 'authored', mutable: true },
      ...(fuel ? { local_fire_fuel: {
        schema: 'rus.items.local_fire_fuel.v1',
        fuel_class: 'ordinary_solid_fuel_unit', whole_unit: true, mechanics
      } } : { local_fire_ignition_basis: {
        schema: 'rus.items.local_fire_ignition_basis.v1',
        ignition_kind: 'authored_manual', mechanics } }) } };
}

function validate(value) {
  const keys = ['schema', 'profile_id', 'revision', 'status', 'context_ref',
    'policy_ref', 'policy_version', 'scope_binding', 'recheck_interval',
    'fuel_unit_mass_grams_min', 'fuel_unit_mass_grams_max', 'ignition_basis',
    'fuel_units', 'allowed_actions', 'water_extinguish_policy', 'process_owner',
    'time_owner', 'persistence_owner', 'fallback_policy'];
  if (!exact(value, keys)
      || value.schema !== 'rus.lower_dvina_trace_local_fire_profile.v1'
      || value.revision !== 1 || value.status !== 'approved'
      || value.policy_version !== 1
      || value.scope_binding !== 'initial_party_anchor'
      || !Array.isArray(value.fuel_units) || value.fuel_units.length < 2
      || new Set(value.fuel_units.map(({ authored_ref: ref }) => ref)).size
        !== value.fuel_units.length
      || JSON.stringify(value.allowed_actions) !== JSON.stringify(['start','add_fuel'])
      || value.water_extinguish_policy
        !== 'disabled_missing_exact_finite_water_authority'
      || value.process_owner !== '@rus/world-processes'
      || value.time_owner !== '@rus/time-events-history'
      || value.persistence_owner !== 'P16_combined_atomic_committer'
      || value.fallback_policy !== 'forbidden'
      || !descriptor(value.ignition_basis)
      || !value.fuel_units.every(descriptor)) {
    fail('TRACE_LOCAL_FIRE_PROFILE_INVALID',
      'Revision 22 requires one exact approved local-fire profile.');
  }
}
function descriptor(value) { return exact(value, ['authored_ref','template_id',
  'profile_id','display_name','mass_grams']) && Number.isSafeInteger(value.mass_grams)
  && value.mass_grams > 0; }
function exact(value, keys) { return value && typeof value === 'object'
  && !Array.isArray(value) && Object.keys(value).length === keys.length
  && keys.every((key) => Object.hasOwn(value, key)); }
