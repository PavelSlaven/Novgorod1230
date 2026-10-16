import assert from 'node:assert/strict';
import test from 'node:test';
import * as catalog from '@rus/runtime-catalog/approved-record-snapshots';
import { materializeApprovedActorEquipment } from
  '../../materialization/src/approved-actor-equipment.js';

const MODE = 'deterministic_from_approved_bindings';
const LINEN = 'cat_item_material_linen_v1';
const WOOL = 'cat_item_material_wool_v1';
const TEMPLATE = 'item_tpl_nov_trousers_v1';

// Declarative unit fixtures, not a reconstruction of approved database rows.
function bindings() {
  const row = (id, category_id, extra = {}) => ({ id, item_template_id: TEMPLATE,
    category_id, binding_kind: 'material', status: 'approved', ...extra });
  return [row('wool', WOOL), row('linen', LINEN),
    row('draft', 'cat_item_material_clay_v1', { status: 'draft' }),
    row('wrong-kind', 'cat_item_material_clay_v1', { binding_kind: 'condition' }),
    row('wrong-template', 'cat_item_material_clay_v1', { item_template_id: 'other' })];
}

function select(input) {
  assert.equal(typeof catalog.selectApprovedItemMaterial, 'function',
    '@rus/runtime-catalog must expose the one shared material selector');
  return catalog.selectApprovedItemMaterial(input);
}

function carrier(value) {
  if (value == null || typeof value !== 'object') return [];
  return [
    ...(Object.hasOwn(value, 'material_category_id') ? [value] : []),
    ...Object.values(value).flatMap(carrier),
  ];
}

test('D102: selector uses only approved material bindings of the exact template', () => {
  assert.deepEqual(select({ item_template_id: TEMPLATE, bindings: bindings() }),
    { material_category_id: LINEN, mode: MODE });
});

test('D102: first sorted selection is independent of row order and preserves input', () => {
  const input = { item_template_id: TEMPLATE, bindings: bindings() };
  const before = structuredClone(input);
  const selected = select(input);
  assert.deepEqual(input, before);
  assert.deepEqual(selected, select({ ...input, bindings: [...input.bindings].reverse() }));
  input.bindings[1].category_id = WOOL;
  assert.equal(selected.material_category_id, LINEN, 'earlier selection must remain a snapshot');
});

test('D102: another template never inherits material from unrelated bindings', () => {
  assert.deepEqual(select({ item_template_id: 'unbound', bindings: bindings() }), {
    material_category_id: null, mode: 'unknown',
    data_gap: { code: 'ITEM_MATERIAL_BINDING_MISSING', item_template_id: 'unbound' },
  });
});

test('D102: missing and draft-only bindings give explicit unknown and a typed gap', () => {
  for (const rows of [[], bindings().map((row) => ({ ...row, status: 'draft' }))]) {
    assert.deepEqual(select({ item_template_id: TEMPLATE, bindings: rows }), {
      material_category_id: null, mode: 'unknown',
      data_gap: { code: 'ITEM_MATERIAL_BINDING_MISSING', item_template_id: TEMPLATE },
    });
  }
});

function unboundEquipment() {
  const candidate = (id, position, slot) => ({
    equipment_candidate_id: id, target_actor_slot_ref: 'npc:guide',
    item_template_ref: `unbound:${id}`, inventory_profile_ref: `inventory:${id}`,
    ...(slot ? { visual_profile_ref: `visual:${id}` } : {}),
    owner_ref: 'npc:guide', holder_ref: 'npc:guide', controller_ref: 'npc:guide',
    physical_position: position, equipment_slot_category_id: slot,
    condition_state: 'good', legal_status: 'lawful', claim_state: 'personal',
    instance_key: id, status: 'approved',
  });
  return {
    party_id: 'party:d102', world_revision_id: 'world:d102', request_id: 'request:d102',
    run_id: 'run:d102', g4_id: 'g4:d102', catalog_digest: 'a'.repeat(64),
    actor_candidate_instance_map: [{ actor_candidate_id: 'npc:guide',
      actor_instance_id: 'npc:instance', actor_kind: 'npc' }],
    initial_equipment_candidates: [candidate('boots', 'equipped', 'footwear'),
      candidate('rope', 'hands', null)],
    item_templates: ['boots', 'rope'].map((id) => ({
      item_template_id: `unbound:${id}`, display_name: id,
      semantic_category: `category:${id}`, status: 'approved',
    })),
    item_inventory_profiles: ['boots', 'rope'].map((id) => ({
      inventory_profile_id: `inventory:${id}`, item_template_ref: `unbound:${id}`,
      mass_grams: 500, external_hand_cost: id === 'rope' ? 1 : 0, status: 'approved',
    })),
    item_visual_profiles: [{ visual_profile_id: 'visual:boots',
      item_template_ref: 'unbound:boots', status: 'approved',
      visual_profile_snapshot: {
        schema: 'item_visual_profile_snapshot_v1', version: 1,
        garment_kind: 'boots', equipment_slot: 'footwear', neckline: 'not_applicable',
        sleeve_form: 'not_applicable', outer_form: 'boots', visible_fabric: 'leather',
        trim: 'none', main_visible_color: 'brown', secondary_visible_color: 'none',
        headwear_kind: 'not_applicable',
      } }],
  };
}

test('D102: Stage 16 records unknown for unbound equipped and carried NPC items', () => {
  const input = unboundEquipment();
  const before = structuredClone(input);
  const result = materializeApprovedActorEquipment(input);
  assert.equal(result.item_instances.length, 2, 'fixture must reach the existing item owner');
  assert.deepEqual(input, before);
  for (const item of result.item_instances) {
    const selections = carrier(item.state);
    assert.equal(selections.length, 1, `${item.template_id}: one material selection carrier`);
    assert.equal(selections[0].material_category_id, null, 'visual fabric is not material authority');
    assert.equal(selections[0].mode ?? selections[0].material_selection?.mode
      ?? selections[0].variant_selection?.mode, 'unknown');
    assert.equal(selections[0].data_gap?.code, 'ITEM_MATERIAL_BINDING_MISSING');
  }
});
