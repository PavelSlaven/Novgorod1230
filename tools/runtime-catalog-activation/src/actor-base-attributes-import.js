import { canonicalStringify, computeCanonicalRecordDigest,
  computeTablePayloadDigest, projectCanonicalRecord,
  verifyCatalogImportLedger } from '@rus/runtime-catalog';
import { ACTOR_BASE_ATTRIBUTES_OWNER_REGISTRY,
  ACTOR_BASE_ATTRIBUTES_RUNTIME_CONTRACT_DIGEST } from
  '@rus/runtime-catalog/runtime-contract';
import { validateActorBaseAttributesImportApproval } from
  '../../../data/world-catalogs/novgorod/procedural-scene-v2/actor-base-attributes-v1/runtime-import-v1/validate-import-approval.mjs';
import { buildImportLedger, digestEnvelope } from './artifact-contracts.js';
import { ACTOR_BASE_ATTRIBUTES_WORLD_MIGRATION } from
  './forward-migrations.js';
import { SPATIAL_V3_PRODUCTION_V12_RELEASE } from
  './spatial-v3-production-v12-activation.js';

const IMPORT_LOCK = '742019261002';
const IMPORT_ID_PREFIX = 'actor_base_attributes_import_';

export function buildActorBaseAttributesImportLedger({ request,
  attestation }) {
  validateActorBaseAttributesImportApproval({ request, attestation });
  assertCompatibleWorldContract(request);
  const entry = ACTOR_BASE_ATTRIBUTES_OWNER_REGISTRY.entries[0];
  const owner = request.owner_rows[0];
  const projection = projectCanonicalRecord({
    registryEntry: entry,
    row: owner.row
  });
  const importId = `${IMPORT_ID_PREFIX}`
    + attestation.attestation_digest.slice(0, 48);
  const record = {
    import_id: importId,
    table_name: entry.table_name,
    record_key: canonicalStringify(projection.record_key),
    operation_kind: owner.operation,
    canonical_payload: projection,
    record_digest: computeCanonicalRecordDigest(projection),
    ordinal: 0
  };
  const table = {
    import_id: importId,
    table_name: entry.table_name,
    dependency_order: entry.dependency_order,
    insert_count: 1,
    assert_existing_count: 0,
    record_count: 1,
    payload_digest: computeTablePayloadDigest([record])
  };
  return buildImportLedger({
    importId,
    rootFields: {
      catalog_scope: request.catalog_scope,
      parent_revision_id: request.parent_catalog.catalog_revision_id,
      parent_catalog_digest: request.parent_catalog.catalog_digest,
      parent_snapshot_manifest_digest:
        request.parent_catalog.import_readback_digest,
      compatible_world_revision_id:
        request.compatible_world.compatible_world_revision_id,
      compatible_world_catalog_digest:
        request.compatible_world.compatible_world_catalog_digest,
      compatible_world_pin_manifest_digest:
        request.compatible_world.compatible_world_pin_manifest_digest,
      target_revision_id: request.target_revision_id,
      target_catalog_digest: request.target_catalog_digest,
      record_registry_digest: request.record_registry_digest,
      promotion_manifest_digest:
        request.authoring_approval.attestation_digest,
      approval_request_digest: request.request_digest,
      approval_attestation_digest: attestation.attestation_digest,
      schema_migration_digest:
        ACTOR_BASE_ATTRIBUTES_WORLD_MIGRATION.migration_digest
    },
    tables: [table],
    records: [record],
    dependencyAssertions: [],
    importedBy: 'runtime_catalog_importer'
  });
}

export async function importApprovedActorBaseAttributes({ pool, request,
  attestation }) {
  const ledger = buildActorBaseAttributesImportLedger({ request,
    attestation });
  return transaction(pool, async (client) => {
    await client.query('SELECT pg_advisory_xact_lock($1::bigint)',
      [IMPORT_LOCK]);
    await assertImportPrerequisites(client, request, ledger);
    const existing = (await client.query(
      `SELECT import_audit_digest FROM world_base.catalog_imports
        WHERE import_id=$1`, [ledger.root.import_id])).rows;
    if (existing.length > 0) {
      if (existing.length !== 1
          || existing[0].import_audit_digest !==
            ledger.root.import_audit_digest) conflict();
      return readActorBaseAttributesImport(client, { request, attestation,
        ledger });
    }
    const target = await client.query(
      `SELECT id FROM world_base.world_revisions WHERE id=$1`,
      [request.target_revision_id]);
    if (target.rows.length !== 0) {
      fail('ACTOR_BASE_ATTRIBUTES_IMPORT_PARTIAL_STATE',
        'Target revision exists without exact import ledger.');
    }
    const parentRegistrationId = await readParentRegistrationId(client,
      request);
    await client.query(
      `INSERT INTO world_base.world_revisions
        (id,parent_revision_id,title,catalog_digest,status,approved_at)
       VALUES ($1,$2,'Actor base attributes v1',$3,'approved',now())`,
      [request.target_revision_id,
        request.parent_catalog.catalog_revision_id,
        request.target_catalog_digest]);
    await client.query(
      `INSERT INTO world_base.domain_catalog_revisions
        (catalog_revision_id,catalog_scope,parent_registration_id,
         target_catalog_digest,compatible_world_revision_id,
         compatible_world_catalog_digest,compatible_world_pin_manifest_digest,
         record_registry_digest,runtime_contract_digest,status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'approved')`,
      [request.target_revision_id, request.catalog_scope,
        parentRegistrationId, request.target_catalog_digest,
        request.compatible_world.compatible_world_revision_id,
        request.compatible_world.compatible_world_catalog_digest,
        request.compatible_world.compatible_world_pin_manifest_digest,
        request.record_registry_digest, request.runtime_contract_digest]);
    const owner = request.owner_rows[0].row;
    await client.query(
      `INSERT INTO world_base.actor_base_attribute_profiles
        (catalog_revision_id,profile_id,profile_digest,profile_payload,status)
       VALUES ($1,$2,$3,$4::jsonb,$5)`,
      [owner.catalog_revision_id, owner.profile_id, owner.profile_digest,
        JSON.stringify(owner.profile_payload), owner.status]);
    await insertLedger(client, ledger);
    return readActorBaseAttributesImport(client, { request, attestation,
      ledger });
  });
}

export async function readActorBaseAttributesImport(client, { request,
  attestation, ledger = null, expectedActivationEventCount = 0 }) {
  const approvedLedger = buildActorBaseAttributesImportLedger({ request,
    attestation });
  if (ledger != null && canonicalStringify(ledger)
      !== canonicalStringify(approvedLedger)) readbackFail();
  ledger = approvedLedger;
  const parentRegistrationId = await readParentRegistrationId(client,
    request);
  const domainRows = (await client.query(
    `SELECT catalog_revision_id,catalog_scope,parent_registration_id,
            target_catalog_digest,
            compatible_world_revision_id,compatible_world_catalog_digest,
            compatible_world_pin_manifest_digest,record_registry_digest,
            runtime_contract_digest,status
      FROM world_base.domain_catalog_revisions
      WHERE catalog_revision_id=$1`, [request.target_revision_id])).rows;
  const revisionRows = (await client.query(
    `SELECT id,parent_revision_id,title,catalog_digest,status
       FROM world_base.world_revisions WHERE id=$1`,
    [request.target_revision_id])).rows;
  const importRows = (await client.query(
    `SELECT import_id,catalog_scope,parent_revision_id,parent_catalog_digest,
            parent_snapshot_manifest_digest,compatible_world_revision_id,
            compatible_world_catalog_digest,
            compatible_world_pin_manifest_digest,target_revision_id,
            target_catalog_digest,record_registry_digest,
            promotion_manifest_digest,approval_request_digest,
            approval_attestation_digest,schema_migration_digest,
            tables_digest,records_digest,
            dependency_assertions_semantic_digest,
            dependency_assertions_audit_digest,import_audit_digest,
            imported_by,imported_at,approval_status
       FROM world_base.catalog_imports WHERE import_id=$1`,
    [ledger.root.import_id])).rows;
  const tables = (await client.query(
    `SELECT import_id,table_name,dependency_order,insert_count,
            assert_existing_count,record_count,payload_digest
       FROM world_base.catalog_import_tables WHERE import_id=$1
      ORDER BY dependency_order,table_name`, [ledger.root.import_id])).rows;
  const records = (await client.query(
    `SELECT import_id,table_name,record_key,operation_kind,
            canonical_payload,record_digest,ordinal
       FROM world_base.catalog_import_records WHERE import_id=$1
      ORDER BY table_name,ordinal`, [ledger.root.import_id])).rows;
  const ownerRows = (await client.query(
    `SELECT catalog_revision_id,profile_id,profile_digest,
            profile_payload,status
       FROM world_base.actor_base_attribute_profiles
      WHERE catalog_revision_id=$1 ORDER BY profile_id`,
    [request.target_revision_id])).rows;
  const activationCount = Number((await client.query(
    `SELECT count(*) AS count
       FROM world_base.runtime_catalog_activation_events
      WHERE catalog_scope=$1`, [request.catalog_scope])).rows[0].count);
  if (![0, 1].includes(expectedActivationEventCount)) readbackFail();
  if (domainRows.length !== 1 || revisionRows.length !== 1
      || importRows.length !== 1
      || ownerRows.length !== 1
      || activationCount !== expectedActivationEventCount) readbackFail();
  const domain = domainRows[0];
  const { approval_status: approvalStatus, ...importRoot } = importRows[0];
  const owner = request.owner_rows[0].row;
  if (approvalStatus !== 'approved'
      || canonicalStringify(revisionRows[0]) !== canonicalStringify({
        id: request.target_revision_id,
        parent_revision_id: request.parent_catalog.catalog_revision_id,
        title: 'Actor base attributes v1',
        catalog_digest: request.target_catalog_digest,
        status: 'approved'
      })
      || canonicalStringify(domain) !== canonicalStringify({
        catalog_revision_id: request.target_revision_id,
        catalog_scope: request.catalog_scope,
        parent_registration_id: parentRegistrationId,
        target_catalog_digest: request.target_catalog_digest,
        compatible_world_revision_id:
          request.compatible_world.compatible_world_revision_id,
        compatible_world_catalog_digest:
          request.compatible_world.compatible_world_catalog_digest,
        compatible_world_pin_manifest_digest:
          request.compatible_world.compatible_world_pin_manifest_digest,
        record_registry_digest: request.record_registry_digest,
        runtime_contract_digest:
          ACTOR_BASE_ATTRIBUTES_RUNTIME_CONTRACT_DIGEST,
        status: 'approved'
      })
      || canonicalStringify(ownerRows[0]) !== canonicalStringify(owner)) {
    readbackFail();
  }
  try {
    verifyCatalogImportLedger({
      registry: ACTOR_BASE_ATTRIBUTES_OWNER_REGISTRY,
      importRoot,
      tables,
      records
    });
  } catch {
    readbackFail();
  }
  const { schema: ignoredSchema, ...expectedImportRoot } = ledger.root;
  if (canonicalStringify(importRoot) !== canonicalStringify({
    ...expectedImportRoot,
    imported_at: importRoot.imported_at
  })) readbackFail();
  const payload = readbackPayload({ request, attestation, ledger });
  return Object.freeze({ ...payload, result_digest: digestEnvelope(payload) });
}

export function validateActorBaseAttributesImportResult({ result, request,
  attestation }) {
  const ledger = buildActorBaseAttributesImportLedger({ request,
    attestation });
  const payload = readbackPayload({ request, attestation, ledger });
  if (canonicalStringify(result) !== canonicalStringify({
    ...payload,
    result_digest: digestEnvelope(payload)
  })) fail('ACTOR_BASE_ATTRIBUTES_IMPORT_RESULT_INVALID',
    'Actor base-attribute import result differs from exact approved import.');
  return true;
}

function readbackPayload({ request, attestation, ledger }) {
  const owner = request.owner_rows[0].row;
  return {
    schema: 'rus.actor_base_attributes_import_readback_result.v1',
    status: 'imported_exact_readback_verified',
    request_digest: request.request_digest,
    import_approval_attestation_digest: attestation.attestation_digest,
    import_id: ledger.root.import_id,
    import_audit_digest: ledger.root.import_audit_digest,
    target_revision_id: request.target_revision_id,
    target_catalog_digest: request.target_catalog_digest,
    record_registry_digest: request.record_registry_digest,
    runtime_contract_digest: request.runtime_contract_digest,
    owner_row_digest: digestEnvelope(owner),
    profile_id: owner.profile_id,
    profile_digest: owner.profile_digest,
    tables_digest: ledger.root.tables_digest,
    records_digest: ledger.root.records_digest,
    activation_event_count: 0,
    runtime_authorized: false,
    activation_authorized: false,
    production_authorized: false,
    equipment_allocation_activation_authorized: false,
    functional_allocation_runtime_selection_authorized: false,
    runtime_item_creation_authorized: false,
    existing_party_migration_authorized: false,
    old_save_rematerialization_authorized: false,
    world_schema_migration_authorized: false,
    party_schema_migration_authorized: false
  };
}

async function assertImportPrerequisites(client, request, ledger) {
  const migration = (await client.query(
    `SELECT migration_digest FROM world_base.schema_migrations
      WHERE migration_id=$1`,
    [ACTOR_BASE_ATTRIBUTES_WORLD_MIGRATION.migration_id])).rows[0];
  if (migration?.migration_digest !== ledger.root.schema_migration_digest) {
    fail('ACTOR_BASE_ATTRIBUTES_IMPORT_SCHEMA_MISSING',
      'Exact actor base-attribute owner migration is required.');
  }
  await readParentRegistrationId(client, request);
  const world = (await client.query(
    `SELECT id,catalog_digest,status FROM world_base.world_revisions
      WHERE id=$1`,
    [request.compatible_world.compatible_world_revision_id])).rows[0];
  if (canonicalStringify(world) !== canonicalStringify({
    id: request.compatible_world.compatible_world_revision_id,
    catalog_digest: request.compatible_world.compatible_world_catalog_digest,
    status: 'approved'
  })) fail('ACTOR_BASE_ATTRIBUTES_IMPORT_WORLD_MISMATCH',
    'Compatible world tuple is unavailable.');
}

async function readParentRegistrationId(client, request) {
  const rows = (await client.query(
    `SELECT parent_registration_id,target_catalog_digest,
            compatible_world_revision_id,compatible_world_catalog_digest,
            compatible_world_pin_manifest_digest,status
       FROM world_base.domain_catalog_revisions
      WHERE catalog_revision_id=$1 AND catalog_scope=$2`,
    [request.parent_catalog.catalog_revision_id,
      request.parent_catalog.catalog_scope])).rows;
  const row = rows[0];
  if (rows.length !== 1
      || row.target_catalog_digest !== request.parent_catalog.catalog_digest
      || row.compatible_world_revision_id !==
        request.compatible_world.compatible_world_revision_id
      || row.compatible_world_catalog_digest !==
        request.compatible_world.compatible_world_catalog_digest
      || row.compatible_world_pin_manifest_digest !==
        SPATIAL_V3_PRODUCTION_V12_RELEASE.worldManifestSha256
      || row.status !== 'approved') {
    fail('ACTOR_BASE_ATTRIBUTES_IMPORT_PARENT_MISMATCH',
      'Exact approved parent catalog is unavailable.', {
        actual: row ?? null,
        expected_parent: request.parent_catalog,
        expected_compatible_world: request.compatible_world
      });
  }
  const registrations = (await client.query(
    `SELECT registration_id,compatible_world_revision_id,
            compatible_world_catalog_digest,
            compatible_world_pin_manifest_digest
       FROM world_base.catalog_baseline_registrations
      WHERE registration_id=$1`, [row.parent_registration_id])).rows;
  if (registrations.length !== 1
      || canonicalStringify(registrations[0]) !== canonicalStringify({
        registration_id: row.parent_registration_id,
        compatible_world_revision_id:
          request.compatible_world.compatible_world_revision_id,
        compatible_world_catalog_digest:
          request.compatible_world.compatible_world_catalog_digest,
        compatible_world_pin_manifest_digest:
          SPATIAL_V3_PRODUCTION_V12_RELEASE.worldManifestSha256
      })) {
    fail('ACTOR_BASE_ATTRIBUTES_IMPORT_PARENT_REGISTRATION_MISMATCH',
      'Exact approved parent registration is unavailable.');
  }
  return row.parent_registration_id;
}

function assertCompatibleWorldContract(request) {
  const release = SPATIAL_V3_PRODUCTION_V12_RELEASE;
  const runtimeConfigurationDigest = digestEnvelope({
    schema: 'rus.actor_base_attributes_runtime_world_configuration.v1',
    release_id: release.releaseId,
    world_revision_id: release.worldRevision,
    world_catalog_digest: release.worldCatalogDigest,
    world_manifest_sha256: release.worldManifestSha256,
    runtime_contract_digest: ACTOR_BASE_ATTRIBUTES_RUNTIME_CONTRACT_DIGEST
  });
  if (request.compatible_world.compatible_world_revision_id !==
        release.worldRevision
      || request.compatible_world.compatible_world_catalog_digest !==
        release.worldCatalogDigest
      || request.compatible_world.source_runtime_configuration_digest !==
        runtimeConfigurationDigest) {
    fail('ACTOR_BASE_ATTRIBUTES_IMPORT_COMPATIBILITY_MISMATCH',
      'Approved actor compatibility does not bind canonical V12 world.');
  }
}

async function insertLedger(client, ledger) {
  const root = ledger.root;
  await client.query(
    `INSERT INTO world_base.catalog_imports
      (id,world_revision_id,manifest_schema_version,manifest_digest,
       approval_status,deletion_mode,provenance,validation_report,imported_at,
       catalog_scope,parent_revision_id,parent_catalog_digest,
       parent_snapshot_manifest_digest,compatible_world_revision_id,
       compatible_world_catalog_digest,compatible_world_pin_manifest_digest,
       target_catalog_digest,record_registry_digest,promotion_manifest_digest,
       approval_request_digest,approval_attestation_digest,
       schema_migration_digest,tables_digest,records_digest,
       dependency_assertions_semantic_digest,
       dependency_assertions_audit_digest,import_audit_digest,imported_by)
     VALUES ($1,$2,'rus.catalog_import_audit.v2',$3,'approved','none',$4::jsonb,
       '{}'::jsonb,now(),$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,
       $18,$19,$20,$21,$22,$23)`,
    [root.import_id, root.target_revision_id, root.promotion_manifest_digest,
      JSON.stringify({ approval_request_digest: root.approval_request_digest,
        import_only: true }), root.catalog_scope, root.parent_revision_id,
      root.parent_catalog_digest, root.parent_snapshot_manifest_digest,
      root.compatible_world_revision_id, root.compatible_world_catalog_digest,
      root.compatible_world_pin_manifest_digest, root.target_catalog_digest,
      root.record_registry_digest, root.promotion_manifest_digest,
      root.approval_request_digest, root.approval_attestation_digest,
      root.schema_migration_digest, root.tables_digest, root.records_digest,
      root.dependency_assertions_semantic_digest,
      root.dependency_assertions_audit_digest, root.import_audit_digest,
      root.imported_by]);
  const table = ledger.tables[0];
  await client.query(
    `INSERT INTO world_base.catalog_import_tables
      (import_id,table_name,dependency_order,insert_count,
       assert_existing_count,record_count,payload_digest)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`, [table.import_id, table.table_name,
      table.dependency_order, table.insert_count,
      table.assert_existing_count, table.record_count,
      table.payload_digest]);
  const record = ledger.records[0];
  await client.query(
    `INSERT INTO world_base.catalog_import_records
      (import_id,table_name,record_key,operation_kind,canonical_payload,
       record_digest,ordinal)
     VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7)`, [record.import_id,
      record.table_name, record.record_key, record.operation_kind,
      JSON.stringify(record.canonical_payload), record.record_digest,
      record.ordinal]);
}

async function transaction(pool, operation) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await operation(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

function conflict() {
  fail('ACTOR_BASE_ATTRIBUTES_IMPORT_CONFLICT',
    'Existing import id has another audit digest.');
}
function readbackFail() {
  fail('ACTOR_BASE_ATTRIBUTES_IMPORT_READBACK_MISMATCH',
    'Exact actor base-attribute import readback failed.');
}
function fail(code, message, details = {}) {
  throw Object.assign(new Error(message), { code, details });
}
