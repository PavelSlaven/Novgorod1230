import { createHash } from 'node:crypto';

import { canonicalStringify, computeCanonicalRecordDigest,
  projectCanonicalRecord, verifyCatalogImportLedger } from
  '@rus/runtime-catalog';
import { ACTOR_BASE_ATTRIBUTES_OWNER_REGISTRY,
  ACTOR_BASE_ATTRIBUTES_OWNER_REGISTRY_DIGEST,
  ACTOR_BASE_ATTRIBUTES_RUNTIME_CONTRACT_DIGEST } from
  '@rus/runtime-catalog/runtime-contract';
import { serverError } from '../../errors.js';

export const ACTOR_BASE_ATTRIBUTES_CATALOG_SCOPE =
  'actor_base_attributes_v1';

export async function loadActiveActorBaseAttributesProfile(worldPool) {
  let activationRows, revisionRows, importRows, tables, records, profileRows;
  try {
    activationRows = (await worldPool.query(
      `SELECT event_id,event_sequence,event_type,catalog_scope,
              catalog_revision_id,catalog_digest,import_id,
              import_audit_digest,record_registry_digest,
              runtime_contract_digest,compatible_world_revision_id,
              compatible_world_catalog_digest,
              compatible_world_pin_manifest_digest,request_digest,
              attestation_digest,expected_previous_event_id,
              runtime_release_id,operator_principal,event_digest
         FROM world_base.runtime_catalog_activation_events
        WHERE catalog_scope=$1
        ORDER BY event_sequence DESC LIMIT 1`,
      [ACTOR_BASE_ATTRIBUTES_CATALOG_SCOPE]
    )).rows;
    if (activationRows.length === 0) gap();
    const activation = activationRows[0];
    revisionRows = (await worldPool.query(
      `SELECT catalog_revision_id,catalog_scope,target_catalog_digest,
              compatible_world_revision_id,compatible_world_catalog_digest,
              compatible_world_pin_manifest_digest,record_registry_digest,
              runtime_contract_digest,status
         FROM world_base.domain_catalog_revisions
        WHERE catalog_revision_id=$1 AND catalog_scope=$2`,
      [activation.catalog_revision_id, ACTOR_BASE_ATTRIBUTES_CATALOG_SCOPE]
    )).rows;
    importRows = (await worldPool.query(
      `SELECT import_id,catalog_scope,parent_revision_id,
              parent_catalog_digest,parent_snapshot_manifest_digest,
              compatible_world_revision_id,compatible_world_catalog_digest,
              compatible_world_pin_manifest_digest,target_revision_id,
              target_catalog_digest,record_registry_digest,
              promotion_manifest_digest,approval_request_digest,
              approval_attestation_digest,schema_migration_digest,
              tables_digest,records_digest,
              dependency_assertions_semantic_digest,
              dependency_assertions_audit_digest,import_audit_digest,
              imported_by,imported_at,approval_status AS import_approval_status
         FROM world_base.catalog_imports WHERE import_id=$1`,
      [activation.import_id]
    )).rows;
    tables = (await worldPool.query(
      `SELECT import_id,table_name,payload_digest,record_count,
              dependency_order,insert_count,assert_existing_count
         FROM world_base.catalog_import_tables
        WHERE import_id=$1 ORDER BY dependency_order,table_name`,
      [activation.import_id]
    )).rows;
    records = (await worldPool.query(
      `SELECT import_id,table_name,record_key,operation_kind,
              canonical_payload,record_digest,ordinal
         FROM world_base.catalog_import_records
        WHERE import_id=$1 ORDER BY table_name,ordinal`,
      [activation.import_id]
    )).rows;
    profileRows = (await worldPool.query(
      `SELECT catalog_revision_id,profile_id,profile_digest,
              profile_payload,status
         FROM world_base.actor_base_attribute_profiles
        WHERE catalog_revision_id=$1 AND status='approved'
        ORDER BY profile_id`,
      [activation.catalog_revision_id]
    )).rows;
  } catch (error) {
    if (error?.code === 'ACTOR_BASE_ATTRIBUTES_RUNTIME_PROFILE_DATA_GAP') {
      throw error;
    }
    if (error?.code !== '42P01' && error?.code !== '42703') throw error;
    gap();
  }
  if (activationRows.length !== 1 || revisionRows.length !== 1
      || importRows.length !== 1) invalid();
  if (profileRows.length === 0) gap();
  if (profileRows.length !== 1) invalid();
  const activation = activationRows[0];
  const eventEnvelope = {
    schema: 'rus.runtime_catalog_activation_event.v2',
    event_sequence: Number(activation.event_sequence),
    event_type: activation.event_type,
    catalog_scope: activation.catalog_scope,
    catalog_revision_id: activation.catalog_revision_id,
    catalog_digest: activation.catalog_digest,
    import_id: activation.import_id,
    import_audit_digest: activation.import_audit_digest,
    record_registry_digest: activation.record_registry_digest,
    runtime_contract_digest: activation.runtime_contract_digest,
    compatible_world_revision_id: activation.compatible_world_revision_id,
    compatible_world_catalog_digest:
      activation.compatible_world_catalog_digest,
    compatible_world_pin_manifest_digest:
      activation.compatible_world_pin_manifest_digest,
    request_digest: activation.request_digest,
    attestation_digest: activation.attestation_digest,
    expected_previous_event_id: activation.expected_previous_event_id,
    runtime_release_id: activation.runtime_release_id,
    operator_principal: activation.operator_principal
  };
  const eventDigest = digest(eventEnvelope);
  const revision = revisionRows[0];
  const { import_approval_status: importApprovalStatus,
    ...importRoot } = importRows[0];
  const row = profileRows[0];
  const profile = row.profile_payload;
  const entry = ACTOR_BASE_ATTRIBUTES_OWNER_REGISTRY.entries[0];
  const canonicalPayload = projectCanonicalRecord({
    registryEntry: entry,
    row: {
      catalog_revision_id: row.catalog_revision_id,
      profile_id: row.profile_id,
      profile_digest: row.profile_digest,
      profile_payload: profile,
      status: row.status
    }
  });
  const record = records?.[0], table = tables?.[0];
  if (activation.event_type !== 'activate'
      || Number(activation.event_sequence) !== 1
      || activation.expected_previous_event_id !== null
      || activation.event_digest !== eventDigest
      || activation.event_id !==
        `runtime_catalog_activation_${eventDigest.slice(0, 32)}`
      || activation.catalog_scope !== ACTOR_BASE_ATTRIBUTES_CATALOG_SCOPE
      || activation.catalog_revision_id !== revision.catalog_revision_id
      || activation.catalog_digest !== revision.target_catalog_digest
      || activation.compatible_world_revision_id !==
        revision.compatible_world_revision_id
      || activation.compatible_world_catalog_digest !==
        revision.compatible_world_catalog_digest
      || activation.compatible_world_pin_manifest_digest !==
        revision.compatible_world_pin_manifest_digest
      || activation.record_registry_digest !== revision.record_registry_digest
      || activation.runtime_contract_digest !== revision.runtime_contract_digest
      || revision.catalog_scope !== ACTOR_BASE_ATTRIBUTES_CATALOG_SCOPE
      || revision.status !== 'approved'
      || importApprovalStatus !== 'approved'
      || importRoot.import_id !== activation.import_id
      || importRoot.catalog_scope !== activation.catalog_scope
      || importRoot.target_revision_id !== activation.catalog_revision_id
      || importRoot.target_catalog_digest !== activation.catalog_digest
      || importRoot.compatible_world_revision_id !==
        activation.compatible_world_revision_id
      || importRoot.compatible_world_catalog_digest !==
        activation.compatible_world_catalog_digest
      || importRoot.compatible_world_pin_manifest_digest !==
        activation.compatible_world_pin_manifest_digest
      || importRoot.record_registry_digest !==
        activation.record_registry_digest
      || importRoot.import_audit_digest !== activation.import_audit_digest
      || activation.record_registry_digest !==
        ACTOR_BASE_ATTRIBUTES_OWNER_REGISTRY_DIGEST
      || activation.runtime_contract_digest !==
        ACTOR_BASE_ATTRIBUTES_RUNTIME_CONTRACT_DIGEST
      || row.catalog_revision_id !== activation.catalog_revision_id
      || row.profile_id !== profile?.profile_id
      || row.profile_digest !== digest(profile)
      || row.status !== 'approved'
      || tables?.length !== 1 || records?.length !== 1
      || table.import_id !== activation.import_id
      || table.table_name !== entry.table_name
      || table.dependency_order !== entry.dependency_order
      || table.insert_count !== 1 || table.assert_existing_count !== 0
      || table.record_count !== 1
      || record.import_id !== activation.import_id
      || record.table_name !== entry.table_name
      || record.operation_kind !== 'insert' || record.ordinal !== 0
      || record.record_key !== canonicalStringify(canonicalPayload.record_key)
      || canonicalStringify(record.canonical_payload) !==
        canonicalStringify(canonicalPayload)
      || record.record_digest !==
        computeCanonicalRecordDigest(canonicalPayload)) invalid();
  try {
    verifyCatalogImportLedger({
      registry: ACTOR_BASE_ATTRIBUTES_OWNER_REGISTRY,
      importRoot,
      tables,
      records
    });
  } catch {
    invalid();
  }
  return Object.freeze({
    schema: 'rus.actor_base_attributes_runtime_profile.v1',
    catalog_scope: ACTOR_BASE_ATTRIBUTES_CATALOG_SCOPE,
    catalog_revision_id: row.catalog_revision_id,
    catalog_digest: activation.catalog_digest,
    activation_event_id: activation.event_id,
    import_id: activation.import_id,
    import_audit_digest: activation.import_audit_digest,
    record_registry_digest: activation.record_registry_digest,
    runtime_contract_digest: activation.runtime_contract_digest,
    profile_id: row.profile_id,
    profile_digest: row.profile_digest,
    profile: Object.freeze(structuredClone(profile))
  });
}

function digest(value) {
  return createHash('sha256').update(canonicalStringify(value)).digest('hex');
}
function invalid() {
  throw serverError('ACTOR_BASE_ATTRIBUTES_RUNTIME_PROFILE_INVALID',
    'Active actor base attribute profile membership is invalid.');
}
function gap() {
  throw serverError('ACTOR_BASE_ATTRIBUTES_RUNTIME_PROFILE_DATA_GAP',
    'No exact active actor base attribute runtime profile is available.');
}
