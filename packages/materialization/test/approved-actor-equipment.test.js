import test from 'node:test';
import assert from 'node:assert/strict';
import { materializeApprovedActorEquipment } from '../src/approved-actor-equipment.js';

function input() {
  const candidate = (id, position, slot) => ({
    equipment_candidate_id: id, target_actor_slot_ref: 'npc:guide',
    item_template_ref: `template:${id}`, inventory_profile_ref: `inventory:${id}`,
    ...(slot ? { visual_profile_ref: `visual:${id}` } : {}),
    owner_ref: 'npc:guide', holder_ref: 'npc:guide', controller_ref: 'npc:guide',
    physical_position: position, equipment_slot_category_id: slot,
    condition_state: 'good', legal_status: 'lawful', claim_state: 'personal',
    instance_key: id, status: 'approved'
  });
  return {
    party_id: 'party:test', world_revision_id: 'world:test', request_id: 'request:test',
    run_id: 'run:test', g4_id: 'g4:test', catalog_digest: 'a'.repeat(64),
    actor_candidate_instance_map: [{ actor_candidate_id: 'npc:guide',
      actor_instance_id: 'npc:instance', actor_kind: 'npc' }],
    initial_equipment_candidates: [candidate('boots', 'equipped', 'footwear'),
      candidate('rope', 'hands', null)],
    item_templates: ['boots', 'rope'].map((id) => ({
      item_template_id: `template:${id}`, display_name: id,
      semantic_category: `category:${id}`, status: 'approved'
    })),
    item_inventory_profiles: ['boots', 'rope'].map((id) => ({
      inventory_profile_id: `inventory:${id}`, item_template_ref: `template:${id}`,
      mass_grams: 500, external_hand_cost: id === 'rope' ? 1 : 0, status: 'approved'
    })),
    item_visual_profiles: [{ visual_profile_id: 'visual:boots',
      item_template_ref: 'template:boots', status: 'approved',
      visual_profile_snapshot: {
        schema: 'item_visual_profile_snapshot_v1', version: 1,
        garment_kind: 'boots', equipment_slot: 'footwear', neckline: 'not_applicable',
        sleeve_form: 'not_applicable', outer_form: 'boots', visible_fabric: 'leather',
        trim: 'none', main_visible_color: 'brown', secondary_visible_color: 'none',
        headwear_kind: 'not_applicable'
      } }]
  };
}

test('Stage 16 provisions NPC footwear and carried tools with exact actor property and replay', () => {
  const source = input();
  const result = materializeApprovedActorEquipment(source);
  assert.deepEqual(result, materializeApprovedActorEquipment(structuredClone(source)));
  assert.equal(result.item_instances.length, 2);
  const boots = result.item_instances.find(({ template_id: id }) => id === 'template:boots');
  const rope = result.item_instances.find(({ template_id: id }) => id === 'template:rope');
  assert.equal(boots.physical_position, 'equipped');
  assert.equal(boots.equipment_slot_category_id, 'footwear');
  assert.equal(boots.state.visual_profile_snapshot.visible_fabric, 'leather');
  assert.equal(rope.physical_position, 'hands');
  assert.equal(rope.equipment_slot_category_id, undefined);
  assert.equal(rope.state.visual_profile_snapshot, undefined);
  assert.equal(rope.state.source_equipment_candidate_ref, 'rope');
  for (const item of result.item_instances) {
    assert.equal(item.quantity, 1);
    assert.equal(item.owner_npc_id, 'npc:instance');
    assert.equal(item.holder_npc_id, 'npc:instance');
    assert.equal(item.controller_npc_id, 'npc:instance');
  }
  assert.equal(result.materialization_run.validation_report.pass, true);
  assert.equal(result.materialization_run.created_refs.reduce(
    (sum, item) => sum + item.total_mass_grams, 0), 1000);
});

test('Stage 16 rejects mismatched visual slots and malformed carried ownership', () => {
  for (const mutate of [
    (value) => { value.item_visual_profiles[0].visual_profile_snapshot.equipment_slot = 'headwear'; },
    (value) => { value.initial_equipment_candidates[1].owner_ref = 'npc:other'; },
    (value) => { value.initial_equipment_candidates[1].equipment_slot_category_id = 'footwear'; },
    (value) => { value.initial_equipment_candidates[1].physical_position = 'underwater'; },
    (value) => { value.initial_equipment_candidates.push(value.initial_equipment_candidates[0]); }
  ]) {
    const value = input();
    mutate(value);
    assert.throws(() => materializeApprovedActorEquipment(value),
      (error) => error.code?.startsWith('INITIAL_ACTOR_EQUIPMENT_'));
  }
});
