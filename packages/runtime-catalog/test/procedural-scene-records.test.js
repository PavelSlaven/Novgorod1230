import assert from 'node:assert/strict';
import test from 'node:test';
import { loadApprovedProceduralSceneRecordBundle } from '../src/index.js';

const digest = (char) => char.repeat(64);
const worldPin = { world_revision_id: 'world-v6',
  world_catalog_digest: digest('a') };
const pin = { schema: 'rus.runtime_catalog_pin.v2',
  catalog_scope: 'item_container_materialization_v2',
  catalog_revision_id: 'items-v2', catalog_digest: digest('b'),
  compatible_world_revision_id: worldPin.world_revision_id,
  compatible_world_catalog_digest: worldPin.world_catalog_digest };
const bindings = { schema: 'rus.procedural_scene_authoring_bindings.v1',
  bindings: [{ status: 'approved', landscape_template_ref: 'land',
    water_body_template_ref: 'water', land_use_template_refs: [],
    place_template_ref: 'place', npc_profile_set_ref: null }] };
const itemCatalog = { schema: 'rus.verified_item_catalog.v2', verified: true,
  pin, records_by_table: { item_profile_sets: [], item_profile_entries: [],
    item_templates: [], universal_categories: [] } };

function reader({ activationDigest = pin.catalog_digest } = {}) {
  return { async read(sql) {
    if (sql.includes('world_base.world_revisions')) return { rows: [{
      id: worldPin.world_revision_id, catalog_digest: worldPin.world_catalog_digest,
      status: 'approved' }] };
    if (sql.includes('runtime_catalog_activation_events')) return { rows: [{
      event_id: 'activation-v6', event_type: 'activate',
      catalog_scope: pin.catalog_scope, catalog_revision_id: pin.catalog_revision_id,
      catalog_digest: activationDigest,
      compatible_world_revision_id: worldPin.world_revision_id,
      compatible_world_catalog_digest: worldPin.world_catalog_digest }] };
    if (sql.includes('landscape_templates')) return { rows: [{ id: 'land',
      status: 'approved', soil_ground_type: 'sand', relief_type: 'bank',
      dominant_vegetation: 'grass', base_environment: 'river' }] };
    if (sql.includes('water_body_templates')) return { rows: [{ id: 'water',
      status: 'approved', water_body_type: 'river' }] };
    if (sql.includes('place_templates')) return { rows: [{ id: 'place',
      status: 'approved', place_kind: 'natural_place' }] };
    throw new Error(`Unexpected SQL: ${sql}`);
  } };
}

test('record exporter proves exact active pins before returning owner rows', async () => {
  const result = await loadApprovedProceduralSceneRecordBundle({
    worldBaseReader: reader(), worldPin, runtimeCatalogPin: pin, bindings,
    verifiedItemCatalog: itemCatalog });
  assert.equal(result.activation.event_id, 'activation-v6');
  assert.equal(result.records_by_table.landscape_templates[0].id, 'land');
  assert.ok(Object.isFrozen(result.records_by_table));
});

test('record exporter rejects activation digest drift', async () => {
  await assert.rejects(loadApprovedProceduralSceneRecordBundle({
    worldBaseReader: reader({ activationDigest: digest('c') }), worldPin,
    runtimeCatalogPin: pin, bindings, verifiedItemCatalog: itemCatalog }),
  { code: 'PROCEDURAL_SCENE_ACTIVATION_PIN_MISMATCH' });
});
