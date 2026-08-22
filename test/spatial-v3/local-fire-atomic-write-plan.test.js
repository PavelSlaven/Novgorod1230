import test from 'node:test';
import assert from 'node:assert/strict';
import { applyLocalFireProjection, createLocalFireAtomicWritePlan,
  localFirePhysicalKeys } from
  '../../apps/game-server/src/infrastructure/postgres/local-fire-atomic-write-plan.js';
import { validLocalFireExtension } from
  '../../apps/game-server/src/infrastructure/postgres/local-fire-write-plan-validation.js';

const clock = (n) => ({ whole_minutes: String(n), subminute_numerator: '0',
  subminute_denominator: '1' });

function itemPin(itemId = 'item:unlisted-fuel', actorRef = 'actor:1') {
  const item = { item_id: itemId, run_id: null, template_id: null,
    profile_id: null, category_id: null, quantity: 1,
    condition_state: 'serviceable', legal_status: 'ordinary', state_version: 1,
    state: { lifecycle_status: 'active', local_fire_fuel: {
      schema: 'rus.items.local_fire_fuel.v1',
      fuel_class: 'ordinary_solid_fuel_unit', whole_unit: true,
      provenance: { source_refs: ['source:wood'] }
    }, runtime_instance_mechanics_snapshot: mechanics(300) } };
  return { item_id: itemId, item,
    placement: { item_id: itemId, anchor_id: null, container_id: null,
      holder_npc_id: null, holder_character_id: actorRef,
      physical_position: 'hands', equipment_slot_category_id: null,
      attached_item_id: null },
    ownership: { ownership_id: `own:${itemId}`, item_id: itemId,
      owner_npc_id: null, owner_character_id: actorRef, owner_party: false,
      controller_npc_id: null, controller_character_id: actorRef,
      claim_state: 'owned' }, bound_process_ref: null };
}

function ignitionPin(actorRef = 'actor:1') {
  const pin = itemPin('item:ignition', actorRef);
  pin.item.state = { lifecycle_status: 'active',
    local_fire_ignition_basis: {
      schema: 'rus.items.local_fire_ignition_basis.v1' } };
  return pin;
}

function fixture() {
  return { schema: 'local_fire_atomic_write_request_v1', party_id: 'party:1',
    base_party_state_version: 2, change_set_id: 'change:1', actor_ref: 'actor:1',
    profile_pin: { profile_ref: 'profile:f1', profile_version: 1,
      context_ref: 'context:f1', scope_ref: 'place:shore',
      ignition_basis_ref: 'item:ignition', policy: {
        schema: 'local_fire_policy_v1', policy_ref: 'policy:f1', version: 1,
        recheck_interval: { exact_minutes: { numerator: '5', denominator: '1' } },
        fuel_unit_mass_grams_min: 100, fuel_unit_mass_grams_max: 1000
      } }, process_state: null, input_pins: [itemPin()],
    ignition_basis_pin: ignitionPin(), action: 'start',
    process_ref: 'local-fire:party:1:turn:1:1', at_timestamp: clock(10),
    cause: { kind: 'actor_step', request_id: 'request:1',
      root_turn_id: 'turn:1', step_index: 1 }, qualitative_outcome: null };
}

test('plain local-fire plan admits unlisted item-owned fuel and detaches input', () => {
  const input = fixture();
  const plan = createLocalFireAtomicWritePlan(input);
  input.input_pins[0].item.state_version = 9;
  assert.equal(plan.input_pins[0].item.state_version, 1);
  assert.equal(plan.transition_proposal.outcome, 'started');
  assert.equal(plan.fuel_placement_transitions.length, 1);
  assert.equal(plan.fuel_placement_transitions[0].after_placement.anchor_id,
    'place:shore');
  const snapshot = { items: [{ ...structuredClone(plan.input_pins[0].item),
    placement: structuredClone(plan.input_pins[0].placement) }] };
  applyLocalFireProjection({ next: snapshot, plan });
  assert.deepEqual(snapshot.items[0].placement, { anchor_id: 'place:shore',
    container_id: null, holder_npc_id: null, holder_character_id: null,
    physical_position: null, equipment_slot_category_id: null,
    attached_item_id: null });
  assert.equal(Object.hasOwn(plan, 'write_plan_digest'), false);
  assert.equal(Object.hasOwn(plan, 'status'), false);
  assert.deepEqual(createLocalFireAtomicWritePlan(
    JSON.parse(JSON.stringify(plan))), plan);
});

test('local-fire physical locks contain only process and current item-owner rows', () => {
  const plan = createLocalFireAtomicWritePlan(fixture());
  assert.deepEqual(localFirePhysicalKeys(plan), [
    'party_runtime.party_local_world_processes:party:1:local-fire:party:1:turn:1:1',
    'party_runtime.party_items:party:1:item:unlisted-fuel',
    'party_runtime.party_item_placements:party:1:item:unlisted-fuel',
    'party_runtime.party_ownership:party:1:own:item:unlisted-fuel',
    'party_runtime.party_items:party:1:item:ignition',
    'party_runtime.party_item_placements:party:1:item:ignition',
    'party_runtime.party_ownership:party:1:own:item:ignition'
  ]);
});

test('local-fire plan rejects stale input, access gaps and hostile descriptors', () => {
  const stale = fixture(); stale.input_pins[0].item.state.lifecycle_status = 'retired';
  assert.throws(() => createLocalFireAtomicWritePlan(stale), {
    code: 'LOCAL_FIRE_INPUT_NOT_ADMITTED'
  });
  const foreign = fixture();
  foreign.input_pins[0].ownership.owner_character_id = 'actor:foreign';
  assert.equal(createLocalFireAtomicWritePlan(foreign)
    .input_pins[0].ownership.owner_character_id,'actor:foreign');
  let reads = 0; const hostile = fixture();
  Object.defineProperty(hostile, 'input_pins', { enumerable: true,
    get() { reads += 1; return []; } });
  assert.throws(() => createLocalFireAtomicWritePlan(hostile));
  assert.equal(reads, 0);
});

test('water affect retires whole portion and remains bound to trace operation', () => {
  const input = fixture();
  const started = createLocalFireAtomicWritePlan(input).transition_proposal;
  const water = itemPin('item:water');
  delete water.item.state.local_fire_fuel;
  water.item.condition_state = 'ordinary_runtime_instance';
  water.item.state.ordinary_metadata = { semantic_type: 'water_portion',
    semantic_category: 'ordinary_mundane' };
  water.item.state.runtime_instance_mechanics_snapshot = {
    schema: 'rus.items.runtime_instance_mechanics_snapshot.v2', version: 2,
    provenance: { source_kind: 'ordinary_world_materialization',
      causal_ref: 'cause:water', request_id: 'request:water',
      candidate_key: 'candidate:water', coverage_key: 'coverage:water',
      context_version: '1', policy_ref: 'policy:water',
      source_refs: ['source:river'] },
    mechanics: { mass_grams: 700, external_hand_cost: 1,
      carry_form: 'compact', packing_slot_cost: 1,
      quantity: { value: 1, unit: 'item' }, container: null }
  };
  input.action = 'affect'; input.process_ref = started.process_after.process_ref;
  input.process_state = started.process_after; input.input_pins = [water];
  input.ignition_basis_pin = null; input.qualitative_outcome = 'complete';
  const plan = createLocalFireAtomicWritePlan(input);
  assert.equal(plan.transition_proposal.outcome, 'complete');
  assert.equal(plan.item_retirement_transition.after_item.condition_state,
    'retired');
  const snapshot = { items: [structuredClone(water.item)] };
  applyLocalFireProjection({ next: snapshot, plan });
  assert.equal(snapshot.items[0].condition_state, 'retired');
  assert.equal(snapshot.items[0].state.lifecycle_status, 'retired');
  assert.equal(snapshot.items[0].state_version, 2);

  const approved = approvedPlan({ process_action: 'affect',
    process_ref: input.process_ref, source_refs: ['item:water'], target_refs: [] });
  assert.equal(validLocalFireExtension(outerPlan(plan, approved)), true);
});

test('outer trace identity rejects actor substitution', () => {
  const plan = createLocalFireAtomicWritePlan(fixture());
  const approved = approvedPlan();
  assert.equal(validLocalFireExtension(outerPlan(plan, approved)), true);
  assert.equal(validLocalFireExtension(outerPlan(plan, approved, 'actor:other')),
    false);
});

function approvedPlan(overrides = {}) {
  return { schema: 'turn_step_plan_v1', request_id: 'request:1', step_index: 1,
    operations: [{ op: 'request_world_process', actor_ref: 'actor:1',
      process_action: 'start', process_ref: null, process_kind: 'fire',
      source_refs: ['item:unlisted-fuel'], target_refs: ['item:ignition'],
      ...overrides }] };
}

function mechanics(mass){return{schema:
  'rus.items.runtime_instance_mechanics_snapshot.v1',version:1,provenance:{
    source_kind:'ordinary_direct_action_result',root_turn_id:'turn:source',
    step_index:1,operation_ref:'operation:source',origin_kind:'direct_partition',
    source_refs:['source:wood']},mechanics:{mass_grams:mass,
    external_hand_cost:1,carry_form:'compact',packing_slot_cost:1,
    quantity:{value:1,unit:'item'},container:null}};}

function outerPlan(localFire, approved, actorRef = 'actor:1') {
  return { local_fire_atomic_write_plans: [localFire],
    operation_kind: 'trace_turn_step', request_id: 'request:1',
    idempotency_key: 'idem:1', party_id: 'party:1', change_set_id: 'change:1',
    owner_keys: [`actor:${actorRef}`],
    visible_package_envelope: { turn_id: 'turn:1' },
    semantic_command_snapshot: { semantic_trace: { step_traces: [{
      step_index: 1, approved_plan: approved }] } },
    updates: [{ target_table: 'parties', id: 'party:1',
      record: { party_id: 'party:1' } }], inserts: [], deletes: [],
    expected_state_versions: [{ target_table: 'parties', id: 'party:1',
      state_version: 2 }], physical_keys: localFirePhysicalKeys(localFire) };
}
