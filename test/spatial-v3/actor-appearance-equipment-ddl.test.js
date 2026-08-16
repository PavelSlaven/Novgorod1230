import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('world schema normalizes actor appearance profiles and item visual semantics', async () => {
  const ddl = await readFile('infra/world-base/schema/21.sql', 'utf8');
  const entrypoint = await readFile('infra/world-base/schema.sql', 'utf8');
  assert.match(entrypoint, /\\ir schema\/21\.sql/);
  assert.match(ddl, /region_demographic_profile_entries/);
  assert.match(ddl, /region_appearance_profile_entries/);
  assert.match(ddl, /ALTER COLUMN demographic_option_id DROP NOT NULL/);
  assert.match(ddl, /assert_region_demographic_profile_complete/);
  assert.match(ddl, /assert_region_appearance_profile_complete/);
  assert.match(ddl, /'garment_kind'.*'equipment_slot'.*'headwear_kind'/s);
  assert.match(ddl, /item_template_one_active_visual_binding/);
});

test('party migration 020 permits equipped placements for either actor holder', async () => {
  const ddl = await readFile('schemas/party-db/020_party_runtime_actor_equipment.sql', 'utf8');
  assert.match(ddl, /\(physical_position IS NOT NULL\) = \(\s*holder_npc_id IS NOT NULL OR holder_character_id IS NOT NULL/s);
  assert.match(ddl, /physical_position = 'equipped'/);
  assert.match(ddl, /equipment_slot_category_id IS NOT NULL/);
});
