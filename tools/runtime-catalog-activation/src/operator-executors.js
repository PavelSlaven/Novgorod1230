import registry from '../../../data/runtime-catalog/item-container-record-registry.v1.json' with { type: 'json' };
import {
  canonicalStringify,
  computeCanonicalRecordDigest,
  projectCanonicalRecord
} from '@rus/runtime-catalog/canonical-records';
import { createRuntimeCatalogLoader } from '@rus/runtime-catalog';
import {
  buildBaselineRegistrationId,
  buildActivationEvent,
  buildOperatorBaselineSnapshotManifest,
  buildPartyPreflight,
  digestEnvelope,
  verifyDecisionAttestation
} from './artifact-contracts.js';
import { RECORD_ADAPTERS } from './record-adapters.generated.js';

const BASELINE_LOCK = '742019261001';
const IMPORT_LOCK = '742019261002';
const ACTIVATION_LOCK = '742019261003';

export async function registerCatalogBaseline({
  pool,
  request,
  attestation,
  baselineManifest,
  compatibilityManifest,
  runtimeConfigurationTuple,
  registrationId,
  title = 'Operator world_db v2 baseline'
}) {
  const expectedRegistrationId = buildBaselineRegistrationId(request);
  if (registrationId != null && registrationId !== expectedRegistrationId) {
    fail('BASELINE_REGISTRATION_ID_MISMATCH', 'Baseline registration id is not deterministic for the exact request.');
  }
  registrationId = expectedRegistrationId;
  if (request.compatible_world_revision_id !== compatibilityManifest.compatible_world_revision_id
      || request.compatible_world_catalog_digest !== compatibilityManifest.compatible_world_catalog_digest
      || request.compatible_world_pin_manifest_digest
        !== compatibilityManifest.compatible_world_pin_manifest_digest) {
    fail('BASE_WORLD_COMPATIBILITY_MISMATCH', 'Baseline request does not use the verified compatible-world manifest.');
  }
  verifyDecisionAttestation({
    attestation,
    expectedSchema: 'rus.baseline_registration_attestation.v2',
    requestDigestField: 'registration_request_digest',
    expectedRequestDigest: request.registration_request_digest,
    expectedDecision: 'approve_register_baseline',
    expectedBindings: {
      parent_tuple: {
        parent_revision_id: request.parent_revision_id,
        parent_catalog_digest: request.parent_catalog_digest,
        parent_snapshot_manifest_digest: request.parent_snapshot_manifest_digest
      },
      compatible_world_tuple: {
        compatible_world_revision_id: request.compatible_world_revision_id,
        compatible_world_catalog_digest: request.compatible_world_catalog_digest,
        compatible_world_pin_manifest_digest:
          request.compatible_world_pin_manifest_digest
      },
      action: 'register_baseline'
    }
  });
  return transaction(pool, async (client) => {
    await client.query('SELECT pg_advisory_xact_lock($1::bigint)', [BASELINE_LOCK]);
    await verifyBaseWorldCompatibility({
      reader: client,
      manifest: compatibilityManifest,
      runtimeConfigurationTuple
    });
    await verifyOperatorBaselineSnapshot({
      reader: client,
      manifest: baselineManifest,
      request
    });
    const existing = await client.query(
      `SELECT registration_id, parent_revision_id, parent_catalog_digest,
              parent_snapshot_manifest_digest, schema_fingerprint,
              record_registry_digest, compatible_world_revision_id,
              compatible_world_catalog_digest, compatible_world_pin_manifest_digest,
              registration_request_digest, registration_attestation_digest
       FROM world_base.catalog_baseline_registrations
       WHERE parent_revision_id = $1`,
      [request.parent_revision_id]
    );
    if (existing.rows[0]) {
      assertExact(existing.rows[0], baselineRegistrationRow({
        request,
        attestation,
        registrationId
      }), 'BASELINE_REGISTRATION_CONFLICT');
      return Object.freeze({ status: 'already_registered', registration_id: registrationId });
    }
    const parent = await client.query(
      'SELECT id, catalog_digest, status FROM world_base.world_revisions WHERE id = $1',
      [request.parent_revision_id]
    );
    if (parent.rows[0]) {
      fail('BASELINE_PARENT_WITHOUT_REGISTRATION', 'Parent revision exists without exact baseline registration.');
    }
    await client.query(
      `INSERT INTO world_base.world_revisions
         (id, parent_revision_id, title, catalog_digest, status, approved_at)
       VALUES ($1, NULL, $2, $3, 'approved', now())`,
      [request.parent_revision_id, title, request.parent_catalog_digest]
    );
    const row = baselineRegistrationRow({ request, attestation, registrationId });
    await client.query(
      `INSERT INTO world_base.catalog_baseline_registrations
         (registration_id, parent_revision_id, parent_catalog_digest,
          parent_snapshot_manifest_digest, schema_fingerprint, record_registry_digest,
          compatible_world_revision_id, compatible_world_catalog_digest,
          compatible_world_pin_manifest_digest, registration_request_digest,
          registration_attestation_digest, registered_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,current_user)`,
      Object.values(row)
    );
    const readback = await client.query(
      `SELECT registration_id, parent_revision_id, parent_catalog_digest,
              parent_snapshot_manifest_digest, schema_fingerprint,
              record_registry_digest, compatible_world_revision_id,
              compatible_world_catalog_digest, compatible_world_pin_manifest_digest,
              registration_request_digest, registration_attestation_digest
       FROM world_base.catalog_baseline_registrations
       WHERE registration_id = $1`,
      [registrationId]
    );
    assertExact(readback.rows[0], row, 'BASELINE_MANIFEST_MISMATCH');
    return Object.freeze({ status: 'registered', registration_id: registrationId });
  });
}

export async function verifyOperatorBaselineSnapshot({ reader, manifest, request }) {
  if (!reader || typeof reader.query !== 'function') {
    throw new TypeError('Baseline snapshot verification requires a PostgreSQL reader.');
  }
  const {
    parent_snapshot_manifest_digest: claimedDigest,
    ...manifestPayload
  } = manifest ?? {};
  if (manifestPayload.schema !== 'rus.operator_baseline_snapshot_manifest.v2'
      || claimedDigest !== digestEnvelope(manifestPayload)
      || request.parent_snapshot_manifest_digest !== claimedDigest
      || request.parent_catalog_digest !== manifestPayload.records_aggregate_digest
      || request.schema_fingerprint !== manifestPayload.schema_fingerprint
      || request.record_registry_digest !== manifestPayload.record_registry_digest) {
    fail('BASELINE_MANIFEST_MISMATCH', 'Baseline request and snapshot manifest are inconsistent.');
  }
  const rowsByTable = {};
  for (const table of manifestPayload.included_tables ?? []) {
    const adapter = RECORD_ADAPTERS[table.table_name];
    if (!adapter?.select_all_sql) {
      fail('BASELINE_MANIFEST_MISMATCH', 'Baseline manifest contains an unregistered table.');
    }
    rowsByTable[table.table_name] = (await reader.query(adapter.select_all_sql)).rows;
  }
  const recomputed = buildOperatorBaselineSnapshotManifest({
    schemaFingerprint: manifestPayload.schema_fingerprint,
    registry,
    rowsByTable
  });
  if (canonicalStringify(recomputed) !== canonicalStringify(manifest)) {
    fail('BASELINE_MANIFEST_MISMATCH', 'Restored database does not reproduce the exact baseline manifest.');
  }
  return Object.freeze({
    pass: true,
    parent_snapshot_manifest_digest: claimedDigest,
    parent_catalog_digest: manifestPayload.records_aggregate_digest
  });
}

export async function verifyBaseWorldCompatibility({
  reader,
  manifest,
  runtimeConfigurationTuple
}) {
  if (!reader || typeof reader.query !== 'function') {
    throw new TypeError('Compatible-world verification requires a PostgreSQL reader.');
  }
  const {
    compatible_world_pin_manifest_digest: claimedDigest,
    ...manifestPayload
  } = manifest ?? {};
  if (manifestPayload.schema !== 'rus.base_world_compatibility_manifest.v1'
      || claimedDigest !== digestEnvelope(manifestPayload)
      || runtimeConfigurationTuple?.compatible_world_revision_id
        !== manifestPayload.compatible_world_revision_id
      || runtimeConfigurationTuple?.compatible_world_catalog_digest
        !== manifestPayload.compatible_world_catalog_digest
      || runtimeConfigurationTuple?.source_runtime_configuration_digest
        !== manifestPayload.source_runtime_configuration_digest) {
    fail('BASE_WORLD_COMPATIBILITY_MISMATCH', 'Compatible-world manifest or runtime configuration tuple is invalid.');
  }
  const result = await reader.query(
    `SELECT id, catalog_digest, status
     FROM world_base.world_revisions
     WHERE id=$1`,
    [manifestPayload.compatible_world_revision_id]
  );
  const row = result.rows[0];
  if (result.rows.length !== 1
      || row.catalog_digest !== manifestPayload.compatible_world_catalog_digest
      || row.status !== 'approved') {
    fail('BASE_WORLD_COMPATIBILITY_MISMATCH', 'Restored database does not contain the exact approved compatible-world tuple.');
  }
  return Object.freeze({
    pass: true,
    compatible_world_revision_id: row.id,
    compatible_world_catalog_digest: row.catalog_digest,
    compatible_world_pin_manifest_digest: claimedDigest
  });
}

export async function importApprovedCatalog({
  pool,
  ledger,
  domainRevision,
  approvalAttestation
}) {
  verifyDecisionAttestation({
    attestation: approvalAttestation,
    expectedSchema: 'rus.item_container_overlay_approval_attestation.v2',
    requestDigestField: 'approval_request_digest',
    expectedRequestDigest: ledger.root.approval_request_digest,
    expectedDecision: 'approve_overlay_import'
  });
  if (approvalAttestation.activation_authorized !== false) {
    fail('OVERLAY_APPROVAL_INVALID', 'Overlay import approval must not authorize activation.');
  }
  return transaction(pool, async (client) => {
    await client.query('SELECT pg_advisory_xact_lock($1::bigint)', [IMPORT_LOCK]);
    const existing = await client.query(
      `SELECT import_id, import_audit_digest
       FROM world_base.catalog_imports
       WHERE import_id = $1`,
      [ledger.root.import_id]
    );
    if (existing.rows[0]) {
      if (existing.rows[0].import_audit_digest !== ledger.root.import_audit_digest) {
        fail('CATALOG_IMPORT_CONFLICT', 'Existing import id has another audit digest.');
      }
      await verifyImportedCatalog(
        client,
        ledger.root,
        domainRevision.runtime_contract_digest
      );
      return Object.freeze({ status: 'already_applied', import_id: ledger.root.import_id });
    }
    const target = await client.query(
      'SELECT id FROM world_base.world_revisions WHERE id = $1',
      [ledger.root.target_revision_id]
    );
    if (target.rows[0]) {
      fail('CATALOG_IMPORT_PARTIAL_STATE', 'Target revision exists without exact import audit.');
    }
    const parent = await client.query(
      `SELECT registration_id, parent_catalog_digest, parent_snapshot_manifest_digest
       FROM world_base.catalog_baseline_registrations
       WHERE parent_revision_id = $1`,
      [ledger.root.parent_revision_id]
    );
    assertExact(parent.rows[0], {
      registration_id: domainRevision.parent_registration_id,
      parent_catalog_digest: ledger.root.parent_catalog_digest,
      parent_snapshot_manifest_digest: ledger.root.parent_snapshot_manifest_digest
    }, 'BASELINE_REGISTRATION_MISSING');

    await client.query(
      `INSERT INTO world_base.world_revisions
         (id, parent_revision_id, title, catalog_digest, status, approved_at)
       VALUES ($1,$2,$3,$4,'approved',now())`,
      [
        ledger.root.target_revision_id,
        ledger.root.parent_revision_id,
        domainRevision.title ?? 'Item/container materialization v2 overlay',
        ledger.root.target_catalog_digest
      ]
    );
    await client.query(
      `INSERT INTO world_base.domain_catalog_revisions
         (catalog_revision_id, catalog_scope, parent_registration_id,
          target_catalog_digest, compatible_world_revision_id,
          compatible_world_catalog_digest, compatible_world_pin_manifest_digest,
          record_registry_digest, runtime_contract_digest, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'approved')`,
      [
        ledger.root.target_revision_id,
        ledger.root.catalog_scope,
        domainRevision.parent_registration_id,
        ledger.root.target_catalog_digest,
        ledger.root.compatible_world_revision_id,
        ledger.root.compatible_world_catalog_digest,
        ledger.root.compatible_world_pin_manifest_digest,
        ledger.root.record_registry_digest,
        domainRevision.runtime_contract_digest
      ]
    );

    for (const record of orderedRecords(ledger)) {
      await applyMembershipRecord(client, record);
    }
    for (const assertion of ledger.dependency_assertions) {
      await assertCanonicalRecord(client, {
        table_name: assertion.target_table,
        canonical_payload: assertion.expected_base_canonical_payload,
        record_digest: assertion.expected_base_record_digest
      });
    }
    await insertImportLedger(client, ledger);
    await verifyImportedCatalog(
      client,
      ledger.root,
      domainRevision.runtime_contract_digest
    );
    return Object.freeze({ status: 'applied', import_id: ledger.root.import_id });
  });
}

export async function activateApprovedCatalog({
  worldPool,
  partyPool,
  request,
  attestation
}) {
  return transaction(worldPool, async (client) => {
    await client.query('SELECT pg_advisory_xact_lock($1::bigint)', [ACTIVATION_LOCK]);
    const latest = await client.query(
      `SELECT event_id, event_sequence, request_digest
       FROM world_base.runtime_catalog_activation_events
       WHERE catalog_scope = 'item_container_materialization_v2'
       ORDER BY event_sequence DESC
       LIMIT 1`
    );
    if (latest.rows[0]?.request_digest === request.activation_request_digest) {
      return Object.freeze({ status: 'already_active', event_id: latest.rows[0].event_id });
    }
    const counts = await partyPool.query(
      `SELECT
         (SELECT count(*)::int FROM party_runtime.parties) AS party_count,
         (SELECT count(DISTINCT party_id)::int
            FROM party_runtime.party_catalog_pins
           WHERE catalog_scope = 'item_container_materialization_v2') AS pinned_party_count,
         (SELECT count(*)::int
            FROM party_runtime.parties p
            LEFT JOIN party_runtime.party_catalog_pins c
              ON c.party_id = p.party_id
             AND c.catalog_scope = 'item_container_materialization_v2'
           WHERE c.party_id IS NULL) AS missing_domain_pin_count,
         (SELECT count(*)::int
            FROM party_runtime.commit_idempotency
           WHERE status IN ('reserved','transaction_committed')) AS inflight_count`
    );
    const row = counts.rows[0];
    const preflight = buildPartyPreflight({
      partyCount: Number(row.party_count),
      pinnedPartyCount: Number(row.pinned_party_count),
      missingDomainPinCount: Number(row.missing_domain_pin_count),
      inflightStage24Stage25Count: Number(row.inflight_count),
      runtimeReleaseId: request.runtime_release_id,
      runtimeContractDigest: request.runtime_contract_digest
    });
    if (preflight.party_preflight_digest !== request.party_preflight_digest) {
      fail('ACTIVATION_PARTY_PREFLIGHT_STALE', 'Party preflight changed after activation request.');
    }
    const principal = (await client.query('SELECT current_user AS principal')).rows[0].principal;
    const event = buildActivationEvent({
      request,
      attestation,
      previousEvent: latest.rows[0] ?? null,
      operatorPrincipal: principal
    });
    await client.query(
      `INSERT INTO world_base.runtime_catalog_activation_events
         (event_id,event_sequence,event_type,catalog_scope,catalog_revision_id,
          catalog_digest,import_id,import_audit_digest,record_registry_digest,
          runtime_contract_digest,compatible_world_revision_id,
          compatible_world_catalog_digest,compatible_world_pin_manifest_digest,
          request_digest,attestation_digest,expected_previous_event_id,
          runtime_release_id,operator_principal,event_digest)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
      [
        event.event_id, event.event_sequence, event.event_type, event.catalog_scope,
        event.catalog_revision_id, event.catalog_digest, event.import_id,
        event.import_audit_digest, event.record_registry_digest,
        event.runtime_contract_digest, event.compatible_world_revision_id,
        event.compatible_world_catalog_digest, event.compatible_world_pin_manifest_digest,
        event.request_digest, event.attestation_digest, event.expected_previous_event_id,
        event.runtime_release_id, event.operator_principal, event.event_digest
      ]
    );
    return Object.freeze({ status: 'activated', event_id: event.event_id, event_sequence: event.event_sequence });
  });
}

async function applyMembershipRecord(client, record) {
  const adapter = RECORD_ADAPTERS[record.table_name];
  if (!adapter) fail('CATALOG_IMPORT_TABLE_UNKNOWN', 'No compiled adapter for import table.');
  if (record.operation_kind === 'assert_existing') {
    return assertCanonicalRecord(client, record);
  }
  if (record.operation_kind !== 'insert' || !adapter.insert_sql) {
    fail('CATALOG_IMPORT_OPERATION_INVALID', 'Import record operation is invalid.');
  }
  await client.query(
    adapter.insert_sql,
    adapter.canonical_columns.map((column) =>
      record.canonical_payload.canonical_fields[column])
  );
}

async function assertCanonicalRecord(client, record) {
  const adapter = RECORD_ADAPTERS[record.table_name];
  const entry = registry.entries.find(({ table_name: table }) => table === record.table_name);
  if (!adapter || !entry) fail('CATALOG_IMPORT_TABLE_UNKNOWN', 'No compiled adapter for asserted row.');
  const result = await client.query(
    adapter.select_by_key_sql,
    adapter.primary_key_fields.map((column) =>
      record.canonical_payload.record_key[column])
  );
  if (result.rows.length !== 1) {
    fail('CATALOG_IMPORT_ASSERT_EXISTING_MISSING', 'Asserted canonical row is absent.');
  }
  const projection = projectCanonicalRecord({ registryEntry: entry, row: result.rows[0] });
  if (computeCanonicalRecordDigest(projection) !== record.record_digest) {
    fail('CATALOG_IMPORT_ASSERT_EXISTING_MISMATCH', 'Asserted canonical row digest differs.');
  }
}

async function insertImportLedger(client, ledger) {
  const root = ledger.root;
  await client.query(
    `INSERT INTO world_base.catalog_imports
       (id,world_revision_id,manifest_schema_version,manifest_digest,
        approval_status,deletion_mode,provenance,validation_report,imported_at,
        catalog_scope,parent_revision_id,parent_catalog_digest,
        parent_snapshot_manifest_digest,compatible_world_revision_id,
        compatible_world_catalog_digest,compatible_world_pin_manifest_digest,
        target_catalog_digest,record_registry_digest,promotion_manifest_digest,
        approval_request_digest,approval_attestation_digest,schema_migration_digest,
        tables_digest,records_digest,dependency_assertions_semantic_digest,
        dependency_assertions_audit_digest,import_audit_digest,imported_by)
     VALUES ($1,$2,'rus.catalog_import_audit.v2',$3,'approved','none',$4::jsonb,
             '{}'::jsonb,now(),$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,
             $17,$18,$19,$20,$21,$22,$23)`,
    [
      root.import_id, root.target_revision_id, root.promotion_manifest_digest,
      JSON.stringify({ approval_request_digest: root.approval_request_digest }),
      root.catalog_scope, root.parent_revision_id, root.parent_catalog_digest,
      root.parent_snapshot_manifest_digest, root.compatible_world_revision_id,
      root.compatible_world_catalog_digest, root.compatible_world_pin_manifest_digest,
      root.target_catalog_digest, root.record_registry_digest,
      root.promotion_manifest_digest, root.approval_request_digest,
      root.approval_attestation_digest, root.schema_migration_digest,
      root.tables_digest, root.records_digest,
      root.dependency_assertions_semantic_digest,
      root.dependency_assertions_audit_digest, root.import_audit_digest,
      root.imported_by
    ]
  );
  for (const table of ledger.tables) {
    await client.query(
      `INSERT INTO world_base.catalog_import_tables
         (import_id,table_name,payload_digest,record_count,dependency_order,
          insert_count,assert_existing_count)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [
        root.import_id, table.table_name, table.payload_digest,
        table.record_count, table.dependency_order, table.insert_count,
        table.assert_existing_count
      ]
    );
  }
  for (const record of ledger.records) {
    await client.query(
      `INSERT INTO world_base.catalog_import_records
         (import_id,table_name,record_key,operation_kind,canonical_payload,
          record_digest,ordinal)
       VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7)`,
      [
        root.import_id, record.table_name, record.record_key,
        record.operation_kind, JSON.stringify(record.canonical_payload),
        record.record_digest, record.ordinal
      ]
    );
  }
  for (const assertion of ledger.dependency_assertions) {
    await client.query(
      `INSERT INTO world_base.catalog_import_dependency_assertions
         (import_id,catalog_scope,target_table,record_key,
          expected_base_canonical_payload,expected_base_record_digest,
          asserted_status,source_transition_semantic_digest,
          historical_approval_basis_digest,semantic_assertion_digest,
          overlay_approval_request_digest,overlay_approval_attestation_digest,
          assertion_audit_digest,ordinal)
       VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [
        root.import_id, assertion.catalog_scope, assertion.target_table,
        assertion.record_key, JSON.stringify(assertion.expected_base_canonical_payload),
        assertion.expected_base_record_digest, assertion.asserted_status,
        assertion.source_transition_semantic_digest,
        assertion.historical_approval_basis_digest,
        assertion.semantic_assertion_digest, assertion.overlay_approval_request_digest,
        assertion.overlay_approval_attestation_digest,
        assertion.assertion_audit_digest, assertion.ordinal
      ]
    );
  }
}

async function verifyImportedCatalog(client, root, runtimeContractDigest) {
  const loader = createRuntimeCatalogLoader({
    worldBaseReader: {
      read: (sql, parameters) => client.query(sql, parameters)
    },
    supportedRuntimeContractDigests: [runtimeContractDigest]
  });
  await loader.loadApprovedItemCatalog({
    pin: {
      schema: 'rus.runtime_catalog_pin.v2',
      catalog_scope: root.catalog_scope,
      catalog_revision_id: root.target_revision_id,
      catalog_digest: root.target_catalog_digest,
      activation_event_id: 'pre-activation-readback',
      import_id: root.import_id,
      import_audit_digest: root.import_audit_digest,
      record_registry_digest: root.record_registry_digest,
      runtime_contract_digest: runtimeContractDigest,
      compatible_world_revision_id: root.compatible_world_revision_id,
      compatible_world_catalog_digest: root.compatible_world_catalog_digest,
      compatible_world_pin_manifest_digest: root.compatible_world_pin_manifest_digest
    }
  });
}

function orderedRecords(ledger) {
  const order = new Map(ledger.tables.map((table) => [table.table_name, table.dependency_order]));
  return [...ledger.records].sort((left, right) =>
    order.get(left.table_name) - order.get(right.table_name)
    || left.ordinal - right.ordinal);
}

function baselineRegistrationRow({ request, attestation, registrationId }) {
  return {
    registration_id: registrationId,
    parent_revision_id: request.parent_revision_id,
    parent_catalog_digest: request.parent_catalog_digest,
    parent_snapshot_manifest_digest: request.parent_snapshot_manifest_digest,
    schema_fingerprint: request.schema_fingerprint,
    record_registry_digest: request.record_registry_digest,
    compatible_world_revision_id: request.compatible_world_revision_id,
    compatible_world_catalog_digest: request.compatible_world_catalog_digest,
    compatible_world_pin_manifest_digest: request.compatible_world_pin_manifest_digest,
    registration_request_digest: request.registration_request_digest,
    registration_attestation_digest: attestation.attestation_digest
  };
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

function assertExact(actual, expected, code) {
  if (!actual || Object.entries(expected).some(([key, value]) => actual[key] !== value)) {
    fail(code, 'Exact database readback mismatch.', { expected, actual: actual ?? null });
  }
}

function fail(code, message, details = {}) {
  throw Object.assign(new Error(message), { code, details });
}
