import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { generateProceduralV6AuthoringOverlay } from
  '../../../scripts/generate-procedural-v6-authoring-overlay.mjs';

const root = new URL('../../../', import.meta.url).pathname.replace(/^\/(.:)/u, '$1');

test('v6 overlay generation is byte-stable and provenance-complete', async () => {
  const first = await generateProceduralV6AuthoringOverlay(root);
  const second = await generateProceduralV6AuthoringOverlay(root);
  assert.equal(JSON.stringify(first), JSON.stringify(second));
  assert.equal(first.activation_authorized, false);
  assert.equal(first.activation_request, null);
  assert.match(first.compatible_world_pin.world_revision_id, /v6/u);
  assert.equal(first.families.length, 3);
  assert.ok(first.families.every(({ spatial_closure_ref: ref }) =>
    ref.canonical_digest && ref.world_revision_id ===
      first.compatible_world_pin.world_revision_id));
  assert.ok(first.families.flatMap(({ item_audit: audit }) =>
    audit?.entries ?? []).every(({ source_refs: refs, quantity_bounds: bounds,
      selection_weight: weight, quantity_profile: quantity,
      inventory_profile: inventory }) => refs.length > 0
      && bounds.minimum === 1 && bounds.maximum === 1
      && Number.isInteger(weight) && quantity.mass_grams_per_unit > 0
      && inventory.mass_grams > 0
      && Number.isInteger(inventory.external_hand_cost)));
});

test('unapproved owners and non-required V5 rows stay typed data gaps', async () => {
  const overlay = await generateProceduralV6AuthoringOverlay(root);
  assert.equal(overlay.status, 'blocked_data_gap');
  const natural = overlay.families.find(({ family }) =>
    family === 'river_wreck_shore');
  const fishing = overlay.families.find(({ family }) =>
    family === 'fishing_worksite');
  assert.ok(natural.data_gap_codes.some((code) =>
    code.includes('SOURCE_NOT_APPROVED:landscape_templates')));
  assert.equal(fishing.item_audit.required_item_entry_count, 0);
  assert.equal(fishing.item_audit.container_rule_count, 0);
  assert.ok(fishing.data_gap_codes.includes('REQUIRED_FUNCTIONAL_TOOL_MAPPING_MISSING'));
  assert.ok(fishing.data_gap_codes.includes('REQUIRED_STORAGE_MAPPING_MISSING'));
  assert.equal(fishing.actor_basis.name_pool_ref, null);
  const approval = JSON.parse(await readFile(new URL(
    '../../../data/world-catalogs/novgorod/procedural-scene-v2/approval-attestation.json',
    import.meta.url)));
  assert.equal(approval.activation_authorized, false);
  assert.equal(approval.import_authorized, false);
  assert.ok(approval.unresolved_data_gaps.length > 0);
});

test('overlay item audit is semantically equivalent to immutable V5 rows', async () => {
  const overlay = await generateProceduralV6AuthoringOverlay(root);
  const source = JSON.parse(await readFile(new URL(
    '../../../data/knowledge-source/imports/item-container-120-v5/candidate/tables/item_profile_entries.json',
    import.meta.url)));
  for (const family of overlay.families.filter(({ item_audit: audit }) => audit)) {
    for (const entry of family.item_audit.entries) {
      const expected = source.find(({ id }) => id === entry.owner_ref.id);
      assert.deepEqual({ required: entry.required, weight: entry.selection_weight,
        min: entry.quantity_bounds.minimum, max: entry.quantity_bounds.maximum,
        slot: entry.slot_key }, { required: expected.required,
        weight: expected.weight, min: expected.min_quantity,
        max: expected.max_quantity, slot: expected.slot_key });
    }
  }
});
