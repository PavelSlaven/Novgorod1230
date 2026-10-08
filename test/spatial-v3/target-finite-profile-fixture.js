import { readFile } from 'node:fs/promises';
import { buildTargetFiniteCompiledRecords } from '../../tools/runtime-catalog-activation/src/target-finite-profile.js';

/** Unit/P16 fixture only. Issued-catalog acceptance uses the actual operator loader. */
export async function targetFiniteProfileCatalogFixture() {
  const root = new URL('../../data/world-catalogs/novgorod/', import.meta.url);
  const records = buildTargetFiniteCompiledRecords({
    mappedBytes: await readFile(new URL('live-world-runtime-v17/m2c-finite-only-ordinary-base-approved.json', root), 'utf8'),
    manifestBytes: await readFile(new URL('live-world-runtime-v17/m2c-finite-only-ordinary-base-manifest.json', root), 'utf8'),
    approval: JSON.parse(await readFile(new URL('m2c-sol-data-approval.json', root), 'utf8')) });
  const pin = { schema: 'rus.runtime_catalog_pin.v2', catalog_scope: 'item_container_materialization_v2',
    catalog_revision_id: 'isolated-finite-fixture', activation_event_id: 'isolated-finite-event',
    import_id: 'isolated-finite-import', compatible_world_revision_id: records[0].payload.world_revision_id };
  for (const key of ['catalog_digest','import_audit_digest','record_registry_digest','runtime_contract_digest',
    'compatible_world_catalog_digest','compatible_world_pin_manifest_digest']) pin[key] = 'a'.repeat(64);
  return { schema: 'rus.verified_item_catalog.v2', verified: true, pin,
    records_by_table: { procedural_scene_compiled_records: records } };
}
