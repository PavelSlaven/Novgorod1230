import assert from 'node:assert/strict';
import test from 'node:test';
import { dryRunProceduralActorEquipment, finalizeProceduralActorEquipment } from
  '../src/stages/stage-16-item-placement/finalize-procedural-actor-equipment.js';

const profile = (id, template, mass = 100, hands = 0) => ({ id, item_template_id: template,
  status: 'approved', mass_grams: mass, external_hand_cost: hands,
  carry_form: 'regular', packing_slot_cost: 1, packing_bundle_size: 1,
  quantity: { value: 1, unit: 'item' }, container: null });
function base(items = [], strength = 10) { return { party_id: 'party', npcs: [{ instance_id: 'npc',
  actor_kind: 'npc', base_attributes: { values: { strength } } }], items, containers: [] }; }
function item(id, template, p, position = 'external') { return { instance_id: id, template_id: template,
  inventory_profile_ref: p.id, quantity: 1, physical_position: position,
  owner_npc_id: 'npc', holder_npc_id: 'npc', controller_npc_id: 'npc',
  state: { inventory_profile_snapshot: p } }; }
function plan(allocations) { return { actor_instance_id: 'npc', allocations }; }
function alloc(id, template, profileId, disposition = 'create', position = 'external') {
  return { item_instance_id: id, item_template_ref: template, inventory_profile_ref: profileId,
    quantity: 1, disposition, physical_position: position };
}
function run(allocationPlan, immediate, profiles) { return dryRunProceduralActorEquipment({ allocationPlan,
  immediate, scenePackage: { inventory_profiles: profiles } }); }

test('Stage16 dry-run reuses and creates without mutating immediate inventory', () => {
  const reused = profile('reuse-profile', 'rope');
  const created = profile('create-profile', 'net', 500);
  const immediate = base([item('item:rope', 'rope', reused)]);
  const before = structuredClone(immediate);
  const result = run(plan([alloc('item:rope', 'rope', 'reuse-profile', 'reuse'),
    alloc('item:net', 'net', 'create-profile')]), immediate, [created]);
  assert.equal(result.pass, true);
  assert.deepEqual(immediate, before);
  assert.equal(result.trace.schema, 'inventory_foundation_trace');
  assert.equal(result.trace.summary.total_mass_grams, 600);
  assert.equal(result.readiness, 'pending_runtime_inventory_owner_validation');
});

test('Stage16 dry-run reports missing create profile as DATA_GAP', () => {
  const result = run(plan([alloc('item:x', 'unknown', 'missing')]), base(), []);
  assert.equal(result.pass, false);
  assert.equal(result.concerns[0].code, 'PROCEDURAL_NPC_EQUIPMENT_DATA_GAP');
});

test('Stage16 dry-run rejects collision and stale reuse as INVALID', () => {
  const p = profile('p', 'rope');
  const collision = run(plan([alloc('item:x', 'rope', 'p')]), base([item('item:x', 'rope', p)]), [p]);
  assert.equal(collision.concerns[0].code, 'PROCEDURAL_NPC_EQUIPMENT_INVALID');
  const stale = run(plan([alloc('item:x', 'rope', 'p', 'reuse')]), base([item('item:x', 'other', p)]), [p]);
  assert.equal(stale.concerns[0].code, 'PROCEDURAL_NPC_EQUIPMENT_INVALID');
});

test('Stage16 dry-run rejects hands overflow and overload', () => {
  const hand = profile('hand', 'tool', 100, 1);
  const hands = run(plan(['a', 'b', 'c'].map((id) => alloc(id, 'tool', 'hand', 'create', 'hands'))), base(), [hand]);
  assert.equal(hands.concerns[0].code, 'PROCEDURAL_NPC_EQUIPMENT_INVALID');
  const heavy = profile('heavy', 'stone', 7000);
  const overload = run(plan([alloc('stone', 'stone', 'heavy')]), base([], 1), [heavy]);
  assert.equal(overload.concerns[0].code, 'PROCEDURAL_NPC_EQUIPMENT_INVALID');
  assert.equal(overload.trace, null);
});

test('Stage16 dry-run accepts canonical immediate instance/profile ids', () => {
  const p = profile('p', 'rope');
  const bag = { ...profile('bag', 'bag', 100), capacity: 12,
    inventory_role: 'primary_container', closure_state: 'open' };
  const immediate = base([{ instance_id: 'item:rope', template_id: 'rope', profile_id: 'p',
    quantity: 1, physical_position: 'external', owner_npc_id: 'npc', holder_npc_id: 'npc',
    controller_npc_id: 'npc', state: { inventory_profile_snapshot: p } }]);
  immediate.containers.push({ instance_id: 'container:bag', template_id: 'bag', profile_id: 'bag',
    state: { inventory_profile_snapshot: bag }, physical_position: 'external',
    owner_npc_id: 'npc', holder_npc_id: 'npc', controller_npc_id: 'npc' });
  const result = run(plan([alloc('item:rope', 'rope', 'p', 'reuse')]), immediate, []);
  assert.equal(result.pass, true);
  assert.equal(result.trace.summary.total_mass_grams, 200);
});

test('Stage16 finalize dry-runs allocations then keeps inactive creation gate', () => {
  const created = profile('create-profile', 'net', 500);
  const party = {
    party_id: 'party',
    immediate: base(),
    procedural_scene_packages: {
      packages: [{
        inventory_profiles: [created],
        allocation_policy: {
          status: 'approved_for_stage16_materialization',
          actor_instance_id: 'npc',
          allocations: [alloc('item:net', 'net', 'create-profile')]
        }
      }]
    }
  };
  assert.throws(() => finalizeProceduralActorEquipment(party),
    { code: 'PROCEDURAL_NPC_EQUIPMENT_DATA_GAP' });
});
