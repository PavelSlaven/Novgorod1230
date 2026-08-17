import test from 'node:test';
import assert from 'node:assert/strict';
import { computeSpatialV3CanonicalDigest as digest } from
  '@rus/contracts/spatial-v3/registry';
import { createLocalFireAtomicWritePlan, localFirePhysicalKeys } from
  '../../apps/game-server/src/infrastructure/postgres/local-fire-atomic-write-plan.js';
import { validLocalFireExtension } from
  '../../apps/game-server/src/infrastructure/postgres/local-fire-write-plan-validation.js';

const clock = (n) => ({ whole_minutes: String(n), subminute_numerator: '0',
  subminute_denominator: '1' });
function fixture() {
  const mechanics = { schema: 'runtime_instance_mechanics_snapshot_v1',
    mass_grams: 300 };
  const property = { schema: 'property_state_v1' };
  const item = { item_id: 'item:fuel:1', run_id: 'run:1',
    template_id: 'template:fuel', profile_id: 'profile:fuel',
    category_id: 'fuel', quantity: 1, condition_state: null,
    legal_status: 'ordinary', state: { lifecycle_status: 'active',
      runtime_instance_mechanics_snapshot: mechanics, property_state: property,
      local_fire_fuel: { schema: 'rus.items.local_fire_fuel.v1',
        fuel_class: 'ordinary_solid_fuel_unit', whole_unit: true } },
    state_version: 1 };
  const placement = { item_id: item.item_id, anchor_id: 'place:shore',
    container_id: null, holder_npc_id: null, holder_character_id: null,
    physical_position: null, equipment_slot_category_id: null,
    attached_item_id: null };
  const ownership = { ownership_id: 'own:fuel:1', item_id: item.item_id,
    owner_npc_id: null, owner_character_id: 'actor:1', owner_party: false,
    controller_npc_id: null, controller_character_id: 'actor:1',
    claim_state: 'owned' };
  const row = { party_id: 'party:1', context_ref: 'context:f1',
    profile_ref: 'profile:f1', profile_version: '1', policy_ref: 'policy:f1',
    policy_version: 1, scope_ref: 'place:shore',
    ignition_basis_item_id: 'item:ignition',
    approved_fuel_item_ids: [item.item_id],
    recheck_interval: { exact_minutes: { numerator: '5', denominator: '1' } },
    fuel_unit_mass_grams_min: 100, fuel_unit_mass_grams_max: 1000,
    authority_state_version: 1, status: 'committed' };
  const ignitionItem = { ...item, item_id: 'item:ignition',
    template_id: 'template:ignition', profile_id: 'profile:ignition',
    category_id: 'ignition', state: { lifecycle_status: 'active',
      local_fire_ignition_basis: {
        schema: 'rus.items.local_fire_ignition_basis.v1' } } };
  const ignitionPlacement = { ...placement, item_id: ignitionItem.item_id };
  const ignitionOwnership = { ...ownership, item_id: ignitionItem.item_id,
    ownership_id: 'own:ignition' };
  return { schema: 'local_fire_atomic_write_request_v1', party_id: 'party:1',
    base_party_state_version: 2, change_set_id: 'change:1', actor_ref: 'actor:1',
    authority_pin: { persisted_row: row, authority_digest: digest(row) },
    ignition_basis_pin: { item_id: ignitionItem.item_id, item: ignitionItem,
      placement: ignitionPlacement, ownership: ignitionOwnership,
      item_digest: digest(ignitionItem),
      placement_digest: digest(ignitionPlacement),
      ownership_digest: digest(ignitionOwnership) },
    process_state: null, action: 'start', at_timestamp: clock(10),
    causal_identity: { request_id: 'request:1', root_turn_id: 'turn:1',
      action_ref: 'action:1', step_index: 1 }, fuel_pins: [{ item_id: item.item_id,
      item, placement, ownership, item_digest: digest(item),
      placement_digest: digest(placement), ownership_digest: digest(ownership),
      fuel_snapshot: { fuel_ref: item.item_id,
        fuel_class: 'ordinary_solid_fuel_unit', state_version: 1,
        lifecycle_state: 'active', mass_grams: 300, quantity: 1,
        bound_process_ref: null, placement_ref: 'place:shore',
        property_digest: digest(property), mechanics_digest: digest(mechanics) } }] };
}

test('local fire atomic plan seals and detaches exact authority and fuel pins', () => {
  const input = fixture(); const plan = createLocalFireAtomicWritePlan(input);
  input.fuel_pins[0].item.state_version = 9;
  assert.equal(plan.fuel_pins[0].item.state_version, 1);
  assert.equal(Object.isFrozen(plan.transition_proposal), true);
  assert.deepEqual(createLocalFireAtomicWritePlan(
    JSON.parse(JSON.stringify(plan))), plan);
});

test('local fire physical locks use exact placement and ownership row identities', () => {
  const plan = createLocalFireAtomicWritePlan(fixture());
  assert.deepEqual(localFirePhysicalKeys(plan), [
    'party_runtime.party_local_fire_authorities:party:1:context:f1',
    `party_runtime.party_local_world_processes:party:1:${
      plan.transition_proposal.process_after.process_ref}`,
    'party_runtime.party_items:party:1:item:ignition',
    'party_runtime.party_item_placements:party:1:item:ignition',
    'party_runtime.party_ownership:party:1:own:ignition',
    'party_runtime.party_items:party:1:item:fuel:1',
    'party_runtime.party_item_placements:party:1:item:fuel:1',
    'party_runtime.party_ownership:party:1:own:fuel:1'
  ]);
  const second = fixture();
  second.party_id = 'party:2';
  second.authority_pin.persisted_row.party_id = 'party:2';
  second.authority_pin.authority_digest = digest(
    second.authority_pin.persisted_row);
  const secondKeys = localFirePhysicalKeys(
    createLocalFireAtomicWritePlan(second));
  const firstKeys = localFirePhysicalKeys(plan);
  assert.equal(secondKeys.length, firstKeys.length);
  assert.deepEqual(secondKeys.filter((key) => firstKeys.includes(key)), []);
});

test('local fire atomic plan rejects authority/pin/proposal tamper and hostile descriptors', () => {
  for (const mutate of [
    (x) => { x.authority_pin.persisted_row.approved_fuel_item_ids = []; },
    (x) => { x.fuel_pins[0].fuel_snapshot.mass_grams = 99; },
    (x) => { x.fuel_pins[0].item.state_version = 2; }
  ]) { const value = fixture(); mutate(value); assert.throws(() =>
    createLocalFireAtomicWritePlan(value)); }
  let reads = 0; const hostile = fixture();
  Object.defineProperty(hostile, 'fuel_pins', { enumerable: true,
    get() { reads += 1; return []; } });
  assert.throws(() => createLocalFireAtomicWritePlan(hostile));
  assert.equal(reads, 0);
});

test('actor transition requires exact ownership and local placement access', () => {
  const foreign = fixture();
  foreign.fuel_pins[0].ownership.owner_character_id = 'actor:foreign';
  foreign.fuel_pins[0].ownership.controller_character_id = 'actor:1';
  foreign.fuel_pins[0].ownership_digest = digest(
    foreign.fuel_pins[0].ownership);
  assert.throws(() => createLocalFireAtomicWritePlan(foreign), {
    code: 'LOCAL_FIRE_FUEL_INVALID'
  });

  const remote = fixture();
  remote.fuel_pins[0].placement.anchor_id = 'place:remote';
  remote.fuel_pins[0].placement_digest = digest(remote.fuel_pins[0].placement);
  assert.throws(() => createLocalFireAtomicWritePlan(remote), {
    code: 'LOCAL_FIRE_FUEL_INVALID'
  });
});

test('trace outer actor and owner lock cannot be jointly replaced', () => {
  const approvedPlan = { schema: 'turn_step_plan_v1', request_id: 'request:1',
    step_index: 1, operations: [{ op: 'request_world_process',
      actor_ref: 'actor:1', process_action: 'start', process_ref: null,
      process_kind: 'fire', source_refs: ['item:fuel:1'],
      target_refs: ['item:ignition'] }] };
  const input = fixture();
  input.causal_identity.action_ref = `local-fire-action:${digest({
    domain: 'rus.world_processes.local_fire.trace_action_ref.v1',
    root_turn_id: 'turn:1', step_index: 1, approved_plan: approvedPlan
  })}`;
  const sealed = createLocalFireAtomicWritePlan(input);
  const outer = outerPlan(sealed, approvedPlan, 'actor:1');
  assert.equal(validLocalFireExtension(outer), true);

  const forged = fixture();
  forged.actor_ref = 'actor:foreign';
  for (const pin of [forged.ignition_basis_pin, ...forged.fuel_pins]) {
    pin.ownership.owner_character_id = 'actor:foreign';
    pin.ownership.controller_character_id = 'actor:foreign';
    pin.ownership_digest = digest(pin.ownership);
  }
  forged.causal_identity.action_ref = input.causal_identity.action_ref;
  const jointlyTampered = createLocalFireAtomicWritePlan(forged);
  assert.equal(validLocalFireExtension(
    outerPlan(jointlyTampered, approvedPlan, 'actor:foreign')), false);
});

function outerPlan(sealed, approvedPlan, actorRef) {
  return { local_fire_atomic_write_plan: sealed,
    operation_kind: 'trace_turn_step', request_id: 'request:1',
    idempotency_key: 'idem:1', party_id: 'party:1',
    change_set_id: 'change:1', owner_keys: [`actor:${actorRef}`],
    visible_package_envelope: { turn_id: 'turn:1' },
    semantic_command_snapshot: { semantic_trace: { step_traces: [{
      step_index: 1, approved_plan: approvedPlan }] } },
    updates: [{ target_table: 'parties', id: 'party:1',
      record: { party_id: 'party:1' } }],
    inserts: [], deletes: [],
    expected_state_versions: [{ target_table: 'parties', id: 'party:1',
      state_version: 2 }],
    physical_keys: localFirePhysicalKeys(sealed) };
}
