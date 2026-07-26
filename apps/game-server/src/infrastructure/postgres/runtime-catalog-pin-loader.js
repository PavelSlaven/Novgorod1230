import { serverError } from '../../errors.js';

export async function loadActiveRuntimeCatalogPin(
  worldPool,
  catalogScope
) {
  const result = await worldPool.query(
    `SELECT
       e.event_id,e.catalog_scope,e.catalog_revision_id,e.catalog_digest,
       e.import_id,e.import_audit_digest,e.record_registry_digest,
       e.runtime_contract_digest,e.compatible_world_revision_id,
       e.compatible_world_catalog_digest,
       e.compatible_world_pin_manifest_digest
     FROM world_base.runtime_catalog_activation_events e
     JOIN world_base.domain_catalog_revisions r
       ON r.catalog_revision_id=e.catalog_revision_id
      AND r.catalog_scope=e.catalog_scope
      AND r.status='approved'
      AND r.target_catalog_digest=e.catalog_digest
     JOIN world_base.catalog_imports i
       ON i.import_id=e.import_id
      AND i.approval_status='approved'
      AND i.catalog_scope=e.catalog_scope
      AND i.target_revision_id=e.catalog_revision_id
      AND i.import_audit_digest=e.import_audit_digest
     WHERE e.catalog_scope=$1
     ORDER BY e.event_sequence DESC
     LIMIT 1`,
    [catalogScope]
  );
  if (result.rows?.length !== 1) {
    throw serverError(
      'RUNTIME_CATALOG_ACTIVE_PIN_MISSING',
      'Exactly one latest approved runtime-catalog activation is required.'
    );
  }
  const row = result.rows[0];
  return Object.freeze({
    schema: 'rus.runtime_catalog_pin.v2',
    catalog_scope: row.catalog_scope,
    catalog_revision_id: row.catalog_revision_id,
    catalog_digest: row.catalog_digest,
    activation_event_id: row.event_id,
    import_id: row.import_id,
    import_audit_digest: row.import_audit_digest,
    record_registry_digest: row.record_registry_digest,
    runtime_contract_digest: row.runtime_contract_digest,
    compatible_world_revision_id: row.compatible_world_revision_id,
    compatible_world_catalog_digest:
      row.compatible_world_catalog_digest,
    compatible_world_pin_manifest_digest:
      row.compatible_world_pin_manifest_digest
  });
}
