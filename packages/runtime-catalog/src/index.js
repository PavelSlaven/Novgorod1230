import recordRegistry from '../../../data/runtime-catalog/item-container-record-registry.v1.json' with { type: 'json' };
import {
  canonicalStringify,
  computeCanonicalRecordDigest,
  computeRecordRegistryDigest,
  projectCanonicalRecord
} from './canonical-records.js';
import {
  computeDependencyAssertionAuditDigest,
  computeDependencyAssertionSemanticDigest,
  computeDependencyAssertionsAuditDigest,
  computeDependencyAssertionsSemanticDigest,
  computeImportAuditDigest,
  computeRecordsDigest,
  computeTablePayloadDigest,
  computeTablesDigest,
  computeTargetCatalogDigest
} from './ledger-digests.js';
import { loadApprovedActorProfileCatalog } from
  './actor-profile-catalog.js';
import {
  deepFreeze,
  fail,
  isDigest,
  isIsoDate,
  rowsFrom,
  RuntimeCatalogError
} from './shared.js';

export { loadApprovedActorProfileCatalog, RuntimeCatalogError };

export const RUNTIME_CATALOG_SCOPE = 'item_container_materialization_v2';

const GRAPH_NODE_CANONICAL_READ_SQL = `SELECT
  id,
  slug,
  title,
  node_type,
  scale_level,
  parent_node_id,
  region_id,
  place_id,
  grid_x,
  grid_y,
  grid_z,
  region_cell_code,
  cell_shape,
  region_cell_status,
  cell_size_km,
  crossing_base_gu,
  crossing_base_time_hours,
  primary_landscape_template_id,
  secondary_landscape_template_ids,
  landscape_mix_notes,
  primary_water_body_template_id,
  secondary_water_body_template_ids,
  hydrology_notes,
  land_use_template_ids,
  place_template_id,
  terrain_profile,
  water_profile,
  road_profile,
  settlement_density,
  dominant_content,
  known_landmarks,
  canonical_corridors,
  neighbor_node_ids,
  historical_status,
  is_known_to_player_default,
  is_known_to_character_default,
  summary,
  status,
  confidence,
  sources,
  audit_notes
FROM world_base.graph_nodes
WHERE id = ANY($1::text[])
ORDER BY id`;

export function createRuntimeCatalogLoader({
  worldBaseReader,
  supportedRuntimeContractDigests
}) {
  if (!worldBaseReader || typeof worldBaseReader.read !== 'function') {
    throw new TypeError('worldBaseReader.read is required.');
  }
  if (!Array.isArray(supportedRuntimeContractDigests)
    || supportedRuntimeContractDigests.length === 0
    || supportedRuntimeContractDigests.some((value) => !isDigest(value))) {
    throw new TypeError('supportedRuntimeContractDigests must contain SHA-256 digests.');
  }

  const supported = new Set(supportedRuntimeContractDigests);
  return Object.freeze({
    loadActivePin: (input) => loadActivePin({
      ...input,
      worldBaseReader,
      supportedRuntimeContractDigests: supported
    }),
    loadApprovedItemCatalog: (input) => loadApprovedItemCatalog({
      ...input,
      worldBaseReader,
      supportedRuntimeContractDigests: supported
    }),
    loadApprovedActorProfileCatalog: (input) =>
      loadApprovedActorProfileCatalog({
        ...input,
        worldBaseReader
      })
  });
}

export function assertCompatibleWorldPin({ domainPin, worldPin }) {
  if (!domainPin
    || domainPin.compatible_world_revision_id !== worldPin?.world_revision_id
    || domainPin.compatible_world_catalog_digest !== worldPin?.world_catalog_digest) {
    throw new RuntimeCatalogError(
      'RUNTIME_CATALOG_BASE_WORLD_PIN_MISMATCH',
      'The domain catalog is not compatible with the full world pin.',
      {
        catalog_scope: domainPin?.catalog_scope ?? null,
        expected_world_revision_id: domainPin?.compatible_world_revision_id ?? null,
        actual_world_revision_id: worldPin?.world_revision_id ?? null
      }
    );
  }
  return domainPin;
}

export function selectApplicableItemCatalog({
  verifiedCatalog,
  regionId,
  effectiveDate
}) {
  if (!verifiedCatalog || verifiedCatalog.verified !== true) {
    throw new RuntimeCatalogError(
      'RUNTIME_CATALOG_IMPORT_AUDIT_INVALID',
      'Only a fully verified catalog can be projected.'
    );
  }
  if (typeof regionId !== 'string' || regionId.length === 0 || !isIsoDate(effectiveDate)) {
    throw new TypeError('regionId and ISO effectiveDate are required.');
  }

  const recordsByTable = {};
  for (const [tableName, records] of Object.entries(verifiedCatalog.records_by_table ?? {})) {
    if (!Array.isArray(records)) {
      throw new RuntimeCatalogError(
        'RUNTIME_CATALOG_MEMBERSHIP_INVALID',
        'Verified catalog tables must contain record arrays.',
        { table_name: tableName }
      );
    }
    recordsByTable[tableName] = records
      .filter((record) => appliesTo(record, regionId, effectiveDate))
      .map((record) => structuredClone(record));
  }

  return deepFreeze({
    ...structuredClone(verifiedCatalog),
    records_by_table: recordsByTable
  });
}

async function loadActivePin({
  worldBaseReader,
  supportedRuntimeContractDigests,
  catalogScope
}) {
  if (catalogScope !== RUNTIME_CATALOG_SCOPE) {
    fail(
      'RUNTIME_CATALOG_SCOPE_MISMATCH',
      'The requested runtime catalog scope is not supported.',
      { catalog_scope: catalogScope ?? null }
    );
  }

  const activation = singleRow(
    await worldBaseReader.read(
      `SELECT
         event_id,
         event_sequence,
         event_type,
         catalog_scope,
         catalog_revision_id,
         catalog_digest,
         import_id,
         import_audit_digest,
         record_registry_digest,
         runtime_contract_digest,
         compatible_world_revision_id,
         compatible_world_catalog_digest,
         compatible_world_pin_manifest_digest
       FROM world_base.runtime_catalog_activation_events
       WHERE catalog_scope = $1
       ORDER BY event_sequence DESC
       LIMIT 1`,
      [catalogScope]
    ),
    'RUNTIME_CATALOG_ACTIVATION_MISSING',
    'No active runtime catalog exists for the requested scope.'
  );
  if (activation.catalog_scope !== catalogScope || activation.event_type !== 'activate') {
    fail('RUNTIME_CATALOG_SCOPE_MISMATCH', 'The active event has an invalid scope or type.');
  }

  const revision = singleRow(
    await worldBaseReader.read(
      `SELECT
         catalog_revision_id,
         catalog_scope,
         target_catalog_digest,
         compatible_world_revision_id,
         compatible_world_catalog_digest,
         compatible_world_pin_manifest_digest,
         record_registry_digest,
         runtime_contract_digest,
         status
       FROM world_base.domain_catalog_revisions
       WHERE catalog_revision_id = $1
         AND catalog_scope = $2`,
      [activation.catalog_revision_id, catalogScope]
    ),
    'RUNTIME_CATALOG_REVISION_MISMATCH',
    'The active event does not resolve to an approved domain revision.'
  );
  if (revision.catalog_scope !== catalogScope) {
    fail('RUNTIME_CATALOG_SCOPE_MISMATCH', 'The domain revision belongs to another scope.');
  }
  if (revision.status !== 'approved'
    || revision.catalog_revision_id !== activation.catalog_revision_id) {
    fail('RUNTIME_CATALOG_REVISION_MISMATCH', 'The domain revision identity is invalid.');
  }

  assertEqualFields(
    activation,
    {
      catalog_digest: revision.target_catalog_digest,
      compatible_world_revision_id: revision.compatible_world_revision_id,
      compatible_world_catalog_digest: revision.compatible_world_catalog_digest,
      compatible_world_pin_manifest_digest: revision.compatible_world_pin_manifest_digest,
      record_registry_digest: revision.record_registry_digest,
      runtime_contract_digest: revision.runtime_contract_digest
    },
    'RUNTIME_CATALOG_DIGEST_MISMATCH',
    'The active event and domain revision do not contain the same approved tuple.'
  );
  if (!supportedRuntimeContractDigests.has(activation.runtime_contract_digest)) {
    fail(
      'RUNTIME_CATALOG_CONTRACT_UNSUPPORTED',
      'The active catalog runtime contract is not supported.',
      { runtime_contract_digest: activation.runtime_contract_digest }
    );
  }

  return deepFreeze({
    schema: 'rus.runtime_catalog_pin.v2',
    catalog_scope: activation.catalog_scope,
    catalog_revision_id: activation.catalog_revision_id,
    catalog_digest: activation.catalog_digest,
    activation_event_id: activation.event_id,
    import_id: activation.import_id,
    import_audit_digest: activation.import_audit_digest,
    record_registry_digest: activation.record_registry_digest,
    runtime_contract_digest: activation.runtime_contract_digest,
    compatible_world_revision_id: activation.compatible_world_revision_id,
    compatible_world_catalog_digest: activation.compatible_world_catalog_digest,
    compatible_world_pin_manifest_digest: activation.compatible_world_pin_manifest_digest
  });
}

async function loadApprovedItemCatalog({
  worldBaseReader,
  supportedRuntimeContractDigests,
  pin
}) {
  assertRuntimePin(pin, supportedRuntimeContractDigests);
  const registryDigest = computeRecordRegistryDigest(recordRegistry);
  if (registryDigest !== pin.record_registry_digest) {
    fail(
      'RUNTIME_CATALOG_IMPORT_AUDIT_INVALID',
      'The runtime record registry does not match the pinned import.',
      {
        expected: pin.record_registry_digest,
        actual: registryDigest
      }
    );
  }

  const revision = singleRow(
    await worldBaseReader.read(
      `SELECT
         catalog_revision_id,
         catalog_scope,
         target_catalog_digest,
         compatible_world_revision_id,
         compatible_world_catalog_digest,
         compatible_world_pin_manifest_digest,
         record_registry_digest,
         runtime_contract_digest,
         status
       FROM world_base.domain_catalog_revisions
       WHERE catalog_revision_id = $1
         AND catalog_scope = $2`,
      [pin.catalog_revision_id, pin.catalog_scope]
    ),
    'RUNTIME_CATALOG_REVISION_MISMATCH',
    'The pinned domain revision is missing.'
  );
  validateRevisionAgainstPin(revision, pin);

  const importRoot = singleRow(
    await worldBaseReader.read(
      `SELECT
         import_id,
         catalog_scope,
         parent_revision_id,
         parent_catalog_digest,
         parent_snapshot_manifest_digest,
         compatible_world_revision_id,
         compatible_world_catalog_digest,
         compatible_world_pin_manifest_digest,
         target_revision_id,
         target_catalog_digest,
         record_registry_digest,
         promotion_manifest_digest,
         approval_request_digest,
         approval_attestation_digest,
         schema_migration_digest,
         tables_digest,
         records_digest,
         dependency_assertions_semantic_digest,
         dependency_assertions_audit_digest,
         import_audit_digest,
         imported_by,
         imported_at
       FROM world_base.catalog_imports
       WHERE import_id = $1`,
      [pin.import_id]
    ),
    'RUNTIME_CATALOG_IMPORT_AUDIT_INVALID',
    'The pinned import audit root is missing.'
  );
  validateImportRootAgainstPin(importRoot, pin);

  const tables = rowsFrom(await worldBaseReader.read(
    `SELECT
       import_id,
       table_name,
       dependency_order,
       insert_count,
       assert_existing_count,
       record_count,
       payload_digest
     FROM world_base.catalog_import_tables
     WHERE import_id = $1
     ORDER BY dependency_order, table_name`,
    [pin.import_id]
  ));
  const records = rowsFrom(await worldBaseReader.read(
    `SELECT
       import_id,
       table_name,
       record_key,
       operation_kind,
       canonical_payload,
       record_digest,
       ordinal
     FROM world_base.catalog_import_records
     WHERE import_id = $1
     ORDER BY table_name, ordinal`,
    [pin.import_id]
  ));
  const assertions = rowsFrom(await worldBaseReader.read(
    `SELECT
       import_id,
       catalog_scope,
       target_table,
       record_key,
       expected_base_canonical_payload,
       expected_base_record_digest,
       asserted_status,
       source_transition_semantic_digest,
       historical_approval_basis_digest,
       semantic_assertion_digest,
       overlay_approval_request_digest,
       overlay_approval_attestation_digest,
       assertion_audit_digest,
       ordinal
     FROM world_base.catalog_import_dependency_assertions
     WHERE import_id = $1
     ORDER BY ordinal`,
    [pin.import_id]
  ));

  try {
    const recordsByTable = validateMembership({
      importId: pin.import_id,
      tables,
      records
    });
    validateDependencyAssertions({
      importId: pin.import_id,
      importRoot,
      assertions
    });
    await validateLiveDependencyAssertions({
      worldBaseReader,
      assertions
    });
    if (computeTablesDigest(tables) !== importRoot.tables_digest
      || computeRecordsDigest(records) !== importRoot.records_digest) {
      fail(
        'RUNTIME_CATALOG_MEMBERSHIP_INVALID',
        'Import membership root digests do not match exact records.'
      );
    }
    if (computeDependencyAssertionsSemanticDigest(assertions)
        !== importRoot.dependency_assertions_semantic_digest
      || computeDependencyAssertionsAuditDigest(assertions)
        !== importRoot.dependency_assertions_audit_digest) {
      fail(
        'RUNTIME_CATALOG_DEPENDENCY_ASSERTION_INVALID',
        'Dependency assertion root digests do not match.'
      );
    }
    const targetPayload = {
      schema: 'rus.domain_catalog_payload.v2',
      catalog_scope: pin.catalog_scope,
      target_revision_id: pin.catalog_revision_id,
      compatible_world_tuple: {
        compatible_world_revision_id: pin.compatible_world_revision_id,
        compatible_world_catalog_digest: pin.compatible_world_catalog_digest,
        compatible_world_pin_manifest_digest:
          pin.compatible_world_pin_manifest_digest
      },
      record_registry_digest: pin.record_registry_digest,
      tables: tables.map((table) => ({
        table_name: table.table_name,
        dependency_order: table.dependency_order,
        insert_count: table.insert_count,
        assert_existing_count: table.assert_existing_count,
        record_count: table.record_count,
        records_digest: table.payload_digest
      })),
      dependency_assertions_semantic_digest:
        importRoot.dependency_assertions_semantic_digest
    };
    if (computeTargetCatalogDigest(targetPayload) !== pin.catalog_digest) {
      fail(
        'RUNTIME_CATALOG_DIGEST_MISMATCH',
        'Reconstructed target catalog digest does not match the pin.'
      );
    }
    if (computeImportAuditDigest(importRoot) !== pin.import_audit_digest) {
      fail(
        'RUNTIME_CATALOG_IMPORT_AUDIT_INVALID',
        'Import audit digest does not match the pinned root.'
      );
    }

    return deepFreeze({
      schema: 'rus.verified_item_catalog.v2',
      verified: true,
      pin: structuredClone(pin),
      import_audit: structuredClone(importRoot),
      records_by_table: recordsByTable,
      dependency_assertions: structuredClone(assertions)
    });
  } catch (error) {
    if (error instanceof RuntimeCatalogError) throw error;
    fail(
      'RUNTIME_CATALOG_IMPORT_AUDIT_INVALID',
      'The immutable import ledger is not canonical.',
      { cause: error.message }
    );
  }
}

function assertRuntimePin(pin, supportedRuntimeContractDigests) {
  if (!pin || pin.schema !== 'rus.runtime_catalog_pin.v2'
    || pin.catalog_scope !== RUNTIME_CATALOG_SCOPE
    || !isDigest(pin.catalog_digest)
    || !isDigest(pin.import_audit_digest)
    || !isDigest(pin.record_registry_digest)
    || !isDigest(pin.runtime_contract_digest)) {
    fail('RUNTIME_CATALOG_SCOPE_MISMATCH', 'The runtime catalog pin is invalid.');
  }
  if (!supportedRuntimeContractDigests.has(pin.runtime_contract_digest)) {
    fail(
      'RUNTIME_CATALOG_CONTRACT_UNSUPPORTED',
      'The pinned runtime contract is not supported.'
    );
  }
}

function validateRevisionAgainstPin(revision, pin) {
  if (revision.catalog_scope !== pin.catalog_scope) {
    fail('RUNTIME_CATALOG_SCOPE_MISMATCH', 'Pinned revision scope mismatch.');
  }
  if (revision.status !== 'approved'
    || revision.catalog_revision_id !== pin.catalog_revision_id) {
    fail('RUNTIME_CATALOG_REVISION_MISMATCH', 'Pinned revision identity mismatch.');
  }
  assertEqualFields(
    revision,
    {
      target_catalog_digest: pin.catalog_digest,
      compatible_world_revision_id: pin.compatible_world_revision_id,
      compatible_world_catalog_digest: pin.compatible_world_catalog_digest,
      compatible_world_pin_manifest_digest:
        pin.compatible_world_pin_manifest_digest,
      record_registry_digest: pin.record_registry_digest,
      runtime_contract_digest: pin.runtime_contract_digest
    },
    'RUNTIME_CATALOG_REVISION_MISMATCH',
    'Pinned revision tuple mismatch.'
  );
}

function validateImportRootAgainstPin(root, pin) {
  assertEqualFields(
    root,
    {
      import_id: pin.import_id,
      catalog_scope: pin.catalog_scope,
      compatible_world_revision_id: pin.compatible_world_revision_id,
      compatible_world_catalog_digest: pin.compatible_world_catalog_digest,
      compatible_world_pin_manifest_digest:
        pin.compatible_world_pin_manifest_digest,
      target_revision_id: pin.catalog_revision_id,
      target_catalog_digest: pin.catalog_digest,
      record_registry_digest: pin.record_registry_digest,
      import_audit_digest: pin.import_audit_digest
    },
    'RUNTIME_CATALOG_IMPORT_AUDIT_INVALID',
    'Pinned import root mismatch.'
  );
}

function validateMembership({ importId, tables, records }) {
  const entryByTable = new Map(
    recordRegistry.entries.map((entry) => [entry.table_name, entry])
  );
  const tableByName = new Map();
  for (const table of tables) {
    const entry = entryByTable.get(table.table_name);
    if (table.import_id !== importId || !entry
      || entry.operation_domain !== 'catalog_membership'
      || tableByName.has(table.table_name)
      || table.dependency_order !== entry.dependency_order) {
      fail(
        'RUNTIME_CATALOG_MEMBERSHIP_INVALID',
        'Import table membership is invalid.',
        { table_name: table.table_name }
      );
    }
    tableByName.set(table.table_name, table);
  }
  const grouped = new Map(tables.map(({ table_name: tableName }) => [tableName, []]));
  for (const record of records) {
    const entry = entryByTable.get(record.table_name);
    const tableRecords = grouped.get(record.table_name);
    if (record.import_id !== importId || !entry || !tableRecords
      || !['insert', 'assert_existing'].includes(record.operation_kind)) {
      fail(
        'RUNTIME_CATALOG_MEMBERSHIP_INVALID',
        'Import record belongs to an unknown membership table.'
      );
    }
    const projected = projectCanonicalRecord({
      registryEntry: entry,
      row: record.canonical_payload?.canonical_fields
    });
    if (record.canonical_payload?.schema
        !== entry.canonical_row_schema_version
      || record.canonical_payload.table_name !== record.table_name
      || canonicalStringify(projected) !== canonicalStringify(record.canonical_payload)
      || canonicalStringify(projected.record_key) !== record.record_key
      || computeCanonicalRecordDigest(projected) !== record.record_digest) {
      fail(
        'RUNTIME_CATALOG_MEMBERSHIP_INVALID',
        'Import record canonical payload or digest is invalid.',
        { table_name: record.table_name, record_key: record.record_key }
      );
    }
    tableRecords.push(record);
  }

  const recordsByTable = {};
  for (const [tableName, table] of tableByName) {
    const tableRecords = grouped.get(tableName)
      .sort((left, right) => left.ordinal - right.ordinal);
    const insertCount = tableRecords.filter(
      ({ operation_kind: kind }) => kind === 'insert'
    ).length;
    const assertCount = tableRecords.length - insertCount;
    if (table.record_count !== tableRecords.length
      || table.insert_count !== insertCount
      || table.assert_existing_count !== assertCount
      || computeTablePayloadDigest(tableRecords) !== table.payload_digest) {
      fail(
        'RUNTIME_CATALOG_MEMBERSHIP_INVALID',
        'Import table counts, ordinals or payload digest are invalid.',
        { table_name: tableName }
      );
    }
    recordsByTable[tableName] = tableRecords.map(
      ({ canonical_payload: payload }) => structuredClone(payload.canonical_fields)
    );
  }
  return recordsByTable;
}

function validateDependencyAssertions({ importId, importRoot, assertions }) {
  if (assertions.length !== 9) {
    fail(
      'RUNTIME_CATALOG_DEPENDENCY_ASSERTION_INVALID',
      'Exactly nine G4 dependency assertions are required.'
    );
  }
  const graphEntry = recordRegistry.entries.find(
    ({ table_name: tableName }) => tableName === 'graph_nodes'
  );
  const seen = new Set();
  for (const assertion of assertions) {
    const projected = projectCanonicalRecord({
      registryEntry: graphEntry,
      row: assertion.expected_base_canonical_payload?.canonical_fields
    });
    if (assertion.import_id !== importId
      || assertion.catalog_scope !== RUNTIME_CATALOG_SCOPE
      || assertion.target_table !== 'graph_nodes'
      || assertion.asserted_status !== 'approved'
      || seen.has(assertion.record_key)
      || canonicalStringify(projected)
        !== canonicalStringify(assertion.expected_base_canonical_payload)
      || canonicalStringify(projected.record_key) !== assertion.record_key
      || computeCanonicalRecordDigest(projected)
        !== assertion.expected_base_record_digest
      || computeDependencyAssertionSemanticDigest(assertion)
        !== assertion.semantic_assertion_digest
      || assertion.overlay_approval_request_digest
        !== importRoot.approval_request_digest
      || assertion.overlay_approval_attestation_digest
        !== importRoot.approval_attestation_digest
      || computeDependencyAssertionAuditDigest(assertion)
        !== assertion.assertion_audit_digest) {
      fail(
        'RUNTIME_CATALOG_DEPENDENCY_ASSERTION_INVALID',
        'A G4 dependency assertion is invalid.',
        { record_key: assertion.record_key }
      );
    }
    seen.add(assertion.record_key);
  }
}

async function validateLiveDependencyAssertions({
  worldBaseReader,
  assertions
}) {
  const graphEntry = recordRegistry.entries.find(
    ({ table_name: tableName }) => tableName === 'graph_nodes'
  );
  const ids = assertions.map(
    ({ expected_base_canonical_payload: payload }) =>
      payload?.record_key?.id
  );
  if (ids.some((id) => typeof id !== 'string' || id.length === 0)) {
    fail(
      'RUNTIME_CATALOG_DEPENDENCY_ASSERTION_INVALID',
      'A G4 dependency assertion has no canonical graph-node key.'
    );
  }
  const liveRows = rowsFrom(await worldBaseReader.read(
    GRAPH_NODE_CANONICAL_READ_SQL,
    [ids]
  ));
  const liveById = new Map();
  for (const row of liveRows) {
    if (liveById.has(row.id)) {
      fail(
        'RUNTIME_CATALOG_DEPENDENCY_ASSERTION_INVALID',
        'A live G4 dependency row is duplicated.',
        { graph_node_id: row.id ?? null }
      );
    }
    liveById.set(row.id, row);
  }
  if (liveById.size !== assertions.length) {
    fail(
      'RUNTIME_CATALOG_DEPENDENCY_ASSERTION_INVALID',
      'The live G4 dependency set is incomplete.',
      {
        expected_count: assertions.length,
        actual_count: liveById.size
      }
    );
  }
  for (const assertion of assertions) {
    const graphNodeId =
      assertion.expected_base_canonical_payload.record_key.id;
    const liveRow = liveById.get(graphNodeId);
    if (!liveRow) {
      fail(
        'RUNTIME_CATALOG_DEPENDENCY_ASSERTION_INVALID',
        'A live G4 dependency row is missing.',
        { graph_node_id: graphNodeId }
      );
    }
    const liveProjection = projectCanonicalRecord({
      registryEntry: graphEntry,
      row: liveRow
    });
    if (canonicalStringify(liveProjection)
        !== canonicalStringify(assertion.expected_base_canonical_payload)
      || computeCanonicalRecordDigest(liveProjection)
        !== assertion.expected_base_record_digest) {
      fail(
        'RUNTIME_CATALOG_DEPENDENCY_ASSERTION_INVALID',
        'A live G4 dependency row differs from the approved canonical base snapshot.',
        { graph_node_id: graphNodeId }
      );
    }
  }
}

function appliesTo(record, regionId, effectiveDate) {
  if (record?.region_id != null && record.region_id !== regionId) return false;
  if (record?.valid_from != null && record.valid_from > effectiveDate) return false;
  if (record?.valid_to != null && record.valid_to < effectiveDate) return false;
  return true;
}

function singleRow(result, code, message) {
  if (!result || !Array.isArray(result.rows) || result.rows.length !== 1) {
    fail(code, message, { row_count: Array.isArray(result?.rows) ? result.rows.length : null });
  }
  return result.rows[0];
}

function assertEqualFields(left, right, code, message) {
  for (const [field, expected] of Object.entries(right)) {
    if (left[field] !== expected) {
      fail(code, message, { field, expected, actual: left[field] ?? null });
    }
  }
}
