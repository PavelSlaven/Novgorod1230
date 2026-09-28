import { fail, isDigest, rowsFrom } from './shared.js';

function gap(code) {
  fail(code, 'Exact approved world catalog activation is required.');
}

/** Fail closed unless world pin and latest runtime-catalog activation match. */
export async function assertApprovedWorldCatalogActivation({
  worldBaseReader,
  worldPin,
  runtimeCatalogPin,
} = {}) {
  if (typeof worldBaseReader?.read !== 'function'
      || !isDigest(worldPin?.world_catalog_digest)
      || !worldPin?.world_revision_id
      || runtimeCatalogPin?.schema !== 'rus.runtime_catalog_pin.v2'
      || runtimeCatalogPin.compatible_world_revision_id !== worldPin.world_revision_id
      || runtimeCatalogPin.compatible_world_catalog_digest !== worldPin.world_catalog_digest) {
    throw new TypeError('Exact worldPin and runtimeCatalogPin are required.');
  }
  const worldRows = rowsFrom(await worldBaseReader.read(
    `SELECT id,catalog_digest,status FROM world_base.world_revisions
      WHERE id=$1 AND catalog_digest=$2 AND status='approved'`,
    [worldPin.world_revision_id, worldPin.world_catalog_digest],
  ));
  if (worldRows.length !== 1) gap('M2C_NPC_WAVE_WORLD_PIN_MISSING');
  const events = rowsFrom(await worldBaseReader.read(
    `SELECT event_id,event_type,catalog_scope,catalog_revision_id,catalog_digest,
            compatible_world_revision_id,compatible_world_catalog_digest
       FROM world_base.runtime_catalog_activation_events
      WHERE catalog_scope=$1 ORDER BY event_sequence DESC LIMIT 1`,
    [runtimeCatalogPin.catalog_scope],
  ));
  if (events.length !== 1) gap('M2C_NPC_WAVE_ACTIVATION_MISSING');
  const activation = events[0];
  if (activation.event_type !== 'activate'
      || activation.catalog_revision_id !== runtimeCatalogPin.catalog_revision_id
      || activation.catalog_digest !== runtimeCatalogPin.catalog_digest
      || activation.compatible_world_revision_id !== worldPin.world_revision_id
      || activation.compatible_world_catalog_digest !== worldPin.world_catalog_digest) {
    gap('M2C_NPC_WAVE_ACTIVATION_PIN_MISMATCH');
  }
}

export async function assertSpatialV3WorldRevisionPin({
  worldBaseReader,
  spatialWorldPin,
} = {}) {
  if (typeof worldBaseReader?.read !== 'function'
      || !spatialWorldPin?.world_revision_id
      || !isDigest(spatialWorldPin?.catalog_digest)) {
    throw new TypeError('spatialWorldPin with world_revision_id and catalog_digest is required.');
  }
  const rows = rowsFrom(await worldBaseReader.read(
    `SELECT id,catalog_digest,status FROM world_base.spatial_v3_world_revisions
      WHERE id=$1 AND catalog_digest=$2 AND status='approved' LIMIT 2`,
    [spatialWorldPin.world_revision_id, spatialWorldPin.catalog_digest],
  ));
  if (rows.length !== 1) gap('M2C_NPC_WAVE_SPATIAL_PIN_MISSING');
}
