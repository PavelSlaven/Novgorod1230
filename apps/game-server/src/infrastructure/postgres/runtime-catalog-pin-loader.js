import { serverError } from '../../errors.js';
import { canonicalStringify } from '@rus/runtime-catalog/canonical-records';
import { createHash } from 'node:crypto';

const V2 = Object.freeze({
  revision: 'procedural_scene_final_candidate_v2_001',
  catalog: '6fcf5c50d01bd56605a037de3d79cd1aa5e56a1c520db70bd0ab5b6ade6b1361',
  candidate: '65d973f8f06ab78a38b5bda7b24cf8661da1b8b9a581742c224cfa8b1c39bdc6',
  importApproval: '2917b993a9e9c63e1989725cee35e63bd0ed32dfece583a782dfb27f1c3f4772',
  allocationApproval: '692960ad7561b60a0793f1f3fb097e757f8975aa91ec42251296edc6213b552a',
  predecessorRevision: 'procedural_scene_final_candidate_v1_001',
  predecessorCatalog: '4ece07fb44abff19490f998a8712144ff18c76daa3080489b51f1df3e705950c'
});

export async function loadActiveRuntimeCatalogPin(
  worldPool,
  catalogScope
) {
  const result = await worldPool.query(
    `SELECT
       e.event_id,e.event_sequence,e.catalog_scope,e.catalog_revision_id,e.catalog_digest,
       e.import_id,e.import_audit_digest,e.record_registry_digest,
       e.runtime_contract_digest,e.compatible_world_revision_id,
       e.compatible_world_catalog_digest,
       e.compatible_world_pin_manifest_digest,e.attestation_digest,
       e.request_digest,e.expected_previous_event_id,e.runtime_release_id,i.provenance,
       p.event_sequence AS predecessor_event_sequence,
       p.catalog_revision_id AS predecessor_revision_id,
       p.catalog_digest AS predecessor_catalog_digest,
       p.import_audit_digest AS predecessor_import_audit_digest,
       p.attestation_digest AS predecessor_activation_attestation_digest
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
     LEFT JOIN world_base.runtime_catalog_activation_events p
       ON p.event_id=e.expected_previous_event_id
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
  const digestFields = ['catalog_digest', 'import_audit_digest',
    'record_registry_digest', 'runtime_contract_digest',
    'compatible_world_catalog_digest',
    'compatible_world_pin_manifest_digest'];
  if (row.catalog_scope !== catalogScope
      || ['event_id', 'catalog_revision_id', 'import_id',
        'compatible_world_revision_id'].some((field) =>
        typeof row[field] !== 'string' || row[field].length === 0)
      || digestFields.some((field) =>
        !/^[a-f0-9]{64}$/u.test(String(row[field] ?? '')))) {
    throw serverError('RUNTIME_CATALOG_ACTIVE_PIN_INVALID',
      'Latest runtime-catalog activation has an invalid exact pin.');
  }
  const policy = row.provenance?.development_activation_policy ?? null;
  if (row.catalog_revision_id === 'procedural_scene_final_candidate_v1_001'
      && (policy?.schema !==
          'rus.procedural_final_development_activation_policy.v1'
        || policy.activation_scope !== 'new_development_parties_only'
        || policy.production_deploy_authorized !== false
        || policy.existing_party_migration_authorized !== false
        || policy.old_save_rematerialization_authorized !== false
        || policy.compatible_world_pin_manifest_digest !==
          row.compatible_world_pin_manifest_digest)) {
    throw serverError('RUNTIME_CATALOG_ACTIVE_SCOPE_INVALID',
      'Final procedural activation lacks exact development-only metadata.');
  }
  if (row.catalog_revision_id === V2.revision && !validV2Activation(row)) {
    throw serverError('RUNTIME_CATALOG_ACTIVE_SCOPE_INVALID',
      'V2 activation lacks exact development-only attestation or predecessor.');
  }
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
      row.compatible_world_pin_manifest_digest,
    activation_scope: policy?.activation_scope ?? null
  });
}

function validV2Activation(row) {
  if (row.catalog_digest !== V2.catalog
      || row.expected_previous_event_id == null
      || row.predecessor_revision_id !== V2.predecessorRevision
      || row.predecessor_catalog_digest !== V2.predecessorCatalog
      || Number(row.event_sequence) !== Number(row.predecessor_event_sequence) + 1) {
    return false;
  }
  const payload = {
    schema: 'rus.runtime_catalog_activation_attestation.v2',
    activation_request_digest: row.request_digest,
    catalog_scope: row.catalog_scope,
    target_revision_id: row.catalog_revision_id,
    target_catalog_digest: row.catalog_digest,
    import_id: row.import_id,
    import_audit_digest: row.import_audit_digest,
    runtime_contract_digest: row.runtime_contract_digest,
    runtime_release_id: row.runtime_release_id,
    decision: 'approve_activation',
    activation_scope: 'new_development_parties_only',
    v2_candidate_digest: V2.candidate,
    v2_import_approval_attestation_digest: V2.importApproval,
    actor_allocation_approval_attestation_digest: V2.allocationApproval,
    predecessor_activation_event_id: row.expected_previous_event_id,
    predecessor_revision_id: row.predecessor_revision_id,
    predecessor_catalog_digest: row.predecessor_catalog_digest,
    predecessor_import_audit_digest: row.predecessor_import_audit_digest,
    predecessor_activation_attestation_digest:
      row.predecessor_activation_attestation_digest,
    existing_party_migration_authorized: false,
    old_save_rematerialization_authorized: false,
    production_deploy_authorized: false,
    runtime_item_creation_authorized: false,
    attested_by: 'user_authorization_current_task'
  };
  return row.attestation_digest === createHash('sha256')
    .update(canonicalStringify(payload)).digest('hex');
}
