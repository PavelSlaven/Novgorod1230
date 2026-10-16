import { buildIdentityRows } from '../../scripts/v17-npc-identity-stage.mjs';

/** The catalog the loader reads back from world_base after the v17 stage, built from the same rows. */
export async function approvedNpcIdentityCatalog() {
  const tables = new Map((await buildIdentityRows()).map(({ table, rows }) => [table, rows]));
  const bindings = tables.get('npc_regional_context_name_bindings');
  const bound = (row) => bindings.some((binding) => binding.name_pool_id === row.name_pool_id && binding.people_ref === row.people_ref);
  return { schema: 'rus.npc_identity_catalog.v1',
    name_bindings: bindings.map(({ regional_context_id, name_pool_id, people_ref }) => ({ regional_context_id, name_pool_id, people_ref })),
    name_entries: tables.get('region_name_pool_entries').filter((row) => row.status === 'approved'
      && row.selection_class === 'ordinary' && bound(row)),
    scale_entries: tables.get('npc_psychology_scale_entries'),
    character_items: tables.get('occupation_character_items') };
}
