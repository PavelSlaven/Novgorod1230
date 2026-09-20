import { importApprovedCatalog, registerCatalogBaseline } from
  './operator-executors.js';

export async function importProceduralV6Overlay({ pool, baseline, overlay }) {
  const registered = await registerCatalogBaseline({ pool, ...baseline });
  const imported = await importApprovedCatalog({ pool, ...overlay });
  const readback = (await pool.query(
    `SELECT i.id AS import_id, i.world_revision_id, i.target_catalog_digest,
            d.compatible_world_revision_id, d.compatible_world_catalog_digest,
            (SELECT count(*)::int
               FROM world_base.runtime_catalog_activation_events a
              WHERE a.catalog_revision_id=i.world_revision_id)
              AS activation_event_count
       FROM world_base.catalog_imports i
       JOIN world_base.domain_catalog_revisions d
         ON d.catalog_revision_id=i.world_revision_id
      WHERE i.id=$1`,
    [overlay.ledger.root.import_id]
  )).rows[0];
  if (!readback
      || readback.world_revision_id !== overlay.ledger.root.target_revision_id
      || readback.target_catalog_digest !== overlay.ledger.root.target_catalog_digest
      || readback.compatible_world_revision_id
        !== overlay.ledger.root.compatible_world_revision_id
      || readback.compatible_world_catalog_digest
        !== overlay.ledger.root.compatible_world_catalog_digest
      || readback.activation_event_count !== 0) throw Object.assign(new Error(
    'Procedural v6 overlay import readback mismatch.'), {
    code: 'PROCEDURAL_V6_IMPORT_READBACK_MISMATCH', details: { readback }
  });
  return Object.freeze({ registered, imported,
    readback: Object.freeze({ ...readback }) });
}
