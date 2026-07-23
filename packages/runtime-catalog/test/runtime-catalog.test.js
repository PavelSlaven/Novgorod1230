import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  RUNTIME_CATALOG_SCOPE,
  RuntimeCatalogError,
  assertCompatibleWorldPin,
  createRuntimeCatalogLoader,
  selectApplicableItemCatalog
} from '../src/index.js';
import {
  canonicalStringify,
  computeCanonicalRecordDigest,
  computeRecordRegistryDigest,
  projectCanonicalRecord
} from '../src/canonical-records.js';
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
} from '../src/ledger-digests.js';

const digest = (character) => character.repeat(64);

function domainPin(overrides = {}) {
  return {
    schema: 'rus.runtime_catalog_pin.v2',
    catalog_scope: RUNTIME_CATALOG_SCOPE,
    catalog_revision_id: 'world_revision_novgorod_1230_item_container_overlay_002',
    catalog_digest: digest('a'),
    activation_event_id: 'runtime_catalog_activation_event_001',
    import_id: 'catalog_import_001',
    import_audit_digest: digest('b'),
    record_registry_digest: digest('c'),
    runtime_contract_digest: digest('d'),
    compatible_world_revision_id: 'world_revision_main_001',
    compatible_world_catalog_digest: digest('e'),
    compatible_world_pin_manifest_digest: digest('f'),
    ...overrides
  };
}

function activeRows(overrides = {}) {
  const pin = domainPin(overrides.pin);
  return {
    runtime_catalog_activation_events: overrides.activation === undefined
      ? [{
        event_id: pin.activation_event_id,
        event_sequence: '1',
        event_type: 'activate',
        catalog_scope: pin.catalog_scope,
        catalog_revision_id: pin.catalog_revision_id,
        catalog_digest: pin.catalog_digest,
        import_id: pin.import_id,
        import_audit_digest: pin.import_audit_digest,
        record_registry_digest: pin.record_registry_digest,
        runtime_contract_digest: pin.runtime_contract_digest,
        compatible_world_revision_id: pin.compatible_world_revision_id,
        compatible_world_catalog_digest: pin.compatible_world_catalog_digest,
        compatible_world_pin_manifest_digest: pin.compatible_world_pin_manifest_digest
      }]
      : overrides.activation,
    domain_catalog_revisions: overrides.domain === undefined
      ? [{
        catalog_revision_id: pin.catalog_revision_id,
        catalog_scope: pin.catalog_scope,
        target_catalog_digest: pin.catalog_digest,
        compatible_world_revision_id: pin.compatible_world_revision_id,
        compatible_world_catalog_digest: pin.compatible_world_catalog_digest,
        compatible_world_pin_manifest_digest: pin.compatible_world_pin_manifest_digest,
        record_registry_digest: pin.record_registry_digest,
        runtime_contract_digest: pin.runtime_contract_digest,
        status: 'approved'
      }]
      : overrides.domain
  };
}

function readerFor(rowsByTable) {
  const calls = [];
  return {
    calls,
    reader: {
      async read(sql, params) {
        calls.push({ sql, params });
        const table = Object.keys(rowsByTable).find((name) => sql.includes(`world_base.${name}`));
        assert.ok(table, `unexpected SQL: ${sql}`);
        return { rows: structuredClone(rowsByTable[table]) };
      }
    }
  };
}

async function approvedLedgerFixture() {
  const registry = JSON.parse(await readFile(
    new URL(
      '../../../data/runtime-catalog/item-container-record-registry.v1.json',
      import.meta.url
    ),
    'utf8'
  ));
  const registryDigest = computeRecordRegistryDigest(registry);
  const catalogEntry = registry.entries.find(
    ({ table_name: tableName }) => tableName === 'quantity_unit_definitions'
  );
  const graphEntry = registry.entries.find(
    ({ table_name: tableName }) => tableName === 'graph_nodes'
  );
  const catalogProjection = projectCanonicalRecord({
    registryEntry: catalogEntry,
    row: {
      id: 'quantity-piece',
      dimension: 'count',
      canonical_unit: 'piece',
      conversion_policy: { mode: 'identity', version: 1 },
      status: 'approved'
    }
  });
  const importId = 'catalog-import-one';
  const record = {
    import_id: importId,
    table_name: catalogEntry.table_name,
    record_key: canonicalStringify(catalogProjection.record_key),
    operation_kind: 'insert',
    canonical_payload: catalogProjection,
    record_digest: computeCanonicalRecordDigest(catalogProjection),
    ordinal: 0
  };
  const table = {
    import_id: importId,
    table_name: catalogEntry.table_name,
    dependency_order: catalogEntry.dependency_order,
    insert_count: 1,
    assert_existing_count: 0,
    record_count: 1,
    payload_digest: computeTablePayloadDigest([record])
  };
  const approvalRequestDigest = digest('6');
  const approvalAttestationDigest = digest('7');
  const assertions = Array.from({ length: 9 }, (_, index) => {
    const row = Object.fromEntries(graphEntry.canonical_columns.map((column) => [
      column,
      graphValue(graphEntry.column_normalizers[column], column, index)
    ]));
    const projection = projectCanonicalRecord({ registryEntry: graphEntry, row });
    const semantic = {
      import_id: importId,
      catalog_scope: RUNTIME_CATALOG_SCOPE,
      target_table: 'graph_nodes',
      record_key: canonicalStringify(projection.record_key),
      expected_base_canonical_payload: projection,
      expected_base_record_digest: computeCanonicalRecordDigest(projection),
      asserted_status: 'approved',
      source_transition_semantic_digest: digest('4'),
      historical_approval_basis_digest: digest('5'),
      ordinal: index
    };
    const semanticAssertionDigest =
      computeDependencyAssertionSemanticDigest(semantic);
    const assertion = {
      ...semantic,
      semantic_assertion_digest: semanticAssertionDigest,
      overlay_approval_request_digest: approvalRequestDigest,
      overlay_approval_attestation_digest: approvalAttestationDigest
    };
    return {
      ...assertion,
      assertion_audit_digest:
        computeDependencyAssertionAuditDigest(assertion)
    };
  });
  const targetRevisionId =
    'world_revision_novgorod_1230_item_container_overlay_002';
  const compatibleWorldTuple = {
    compatible_world_revision_id: 'world-revision-main',
    compatible_world_catalog_digest: digest('8'),
    compatible_world_pin_manifest_digest: digest('9')
  };
  const semanticAssertionsDigest =
    computeDependencyAssertionsSemanticDigest(assertions);
  const auditAssertionsDigest =
    computeDependencyAssertionsAuditDigest(assertions);
  const targetPayload = {
    schema: 'rus.domain_catalog_payload.v2',
    catalog_scope: RUNTIME_CATALOG_SCOPE,
    target_revision_id: targetRevisionId,
    compatible_world_tuple: compatibleWorldTuple,
    record_registry_digest: registryDigest,
    tables: [{
      table_name: table.table_name,
      dependency_order: table.dependency_order,
      insert_count: table.insert_count,
      assert_existing_count: table.assert_existing_count,
      record_count: table.record_count,
      records_digest: table.payload_digest
    }],
    dependency_assertions_semantic_digest: semanticAssertionsDigest
  };
  const targetCatalogDigest = computeTargetCatalogDigest(targetPayload);
  const importRoot = {
    import_id: importId,
    catalog_scope: RUNTIME_CATALOG_SCOPE,
    parent_revision_id: 'parent-revision',
    parent_catalog_digest: digest('a'),
    parent_snapshot_manifest_digest: digest('b'),
    ...compatibleWorldTuple,
    target_revision_id: targetRevisionId,
    target_catalog_digest: targetCatalogDigest,
    record_registry_digest: registryDigest,
    promotion_manifest_digest: digest('c'),
    approval_request_digest: approvalRequestDigest,
    approval_attestation_digest: approvalAttestationDigest,
    schema_migration_digest: digest('d'),
    tables_digest: computeTablesDigest([table]),
    records_digest: computeRecordsDigest([record]),
    dependency_assertions_semantic_digest: semanticAssertionsDigest,
    dependency_assertions_audit_digest: auditAssertionsDigest,
    imported_by: 'runtime_catalog_importer',
    imported_at: '2026-07-23T00:00:00.000000Z'
  };
  importRoot.import_audit_digest = computeImportAuditDigest(importRoot);
  const pin = domainPin({
    catalog_revision_id: targetRevisionId,
    catalog_digest: targetCatalogDigest,
    import_id: importId,
    import_audit_digest: importRoot.import_audit_digest,
    record_registry_digest: registryDigest,
    compatible_world_revision_id:
      compatibleWorldTuple.compatible_world_revision_id,
    compatible_world_catalog_digest:
      compatibleWorldTuple.compatible_world_catalog_digest,
    compatible_world_pin_manifest_digest:
      compatibleWorldTuple.compatible_world_pin_manifest_digest
  });
  const domainRevision = {
    catalog_revision_id: targetRevisionId,
    catalog_scope: RUNTIME_CATALOG_SCOPE,
    target_catalog_digest: targetCatalogDigest,
    compatible_world_revision_id: pin.compatible_world_revision_id,
    compatible_world_catalog_digest: pin.compatible_world_catalog_digest,
    compatible_world_pin_manifest_digest:
      pin.compatible_world_pin_manifest_digest,
    record_registry_digest: registryDigest,
    runtime_contract_digest: pin.runtime_contract_digest,
    status: 'approved'
  };
  return {
    pin,
    rows: {
      domain_catalog_revisions: [domainRevision],
      catalog_imports: [importRoot],
      catalog_import_tables: [table],
      catalog_import_records: [record],
      catalog_import_dependency_assertions: assertions,
      graph_nodes: assertions.map(
        ({ expected_base_canonical_payload: payload }) =>
          structuredClone(payload.canonical_fields)
      )
    }
  };
}

function graphValue(normalizer, column, index) {
  if (column === 'id') return `g4-${index + 1}`;
  if (column === 'status') return 'draft';
  if (normalizer === 'text_nfc') return `${column}-${index + 1}`;
  if (normalizer === 'integer_decimal' || normalizer === 'numeric_decimal') return '0';
  if (normalizer === 'jsonb') return { column, index };
  if (normalizer === 'boolean') return false;
  if (normalizer === 'date' || normalizer === 'timestamptz_microseconds') return null;
  throw new Error(`unsupported fixture normalizer: ${normalizer}`);
}

test('public loader boundary exposes only immutable read operations', () => {
  const loader = createRuntimeCatalogLoader({
    worldBaseReader: { read: async () => ({ rows: [] }) },
    supportedRuntimeContractDigests: [digest('d')]
  });

  assert.deepEqual(
    Object.keys(loader).sort(),
    ['loadActivePin', 'loadApprovedItemCatalog']
  );
  assert.equal(Object.isFrozen(loader), true);
});

test('active pin uses static reads and returns the exact immutable approved tuple', async () => {
  const rows = activeRows();
  const { reader, calls } = readerFor(rows);
  const loader = createRuntimeCatalogLoader({
    worldBaseReader: reader,
    supportedRuntimeContractDigests: [digest('d')]
  });

  const pin = await loader.loadActivePin({ catalogScope: RUNTIME_CATALOG_SCOPE });

  assert.deepEqual(pin, domainPin());
  assert.equal(Object.isFrozen(pin), true);
  assert.deepEqual(calls.map(({ params }) => params), [
    [RUNTIME_CATALOG_SCOPE],
    [domainPin().catalog_revision_id, RUNTIME_CATALOG_SCOPE]
  ]);
  assert.equal(calls.every(({ sql }) => !sql.includes(RUNTIME_CATALOG_SCOPE)), true);
});

test('historical pin reconstructs only exact immutable import snapshots', async () => {
  const fixture = await approvedLedgerFixture();
  const { reader, calls } = readerFor(fixture.rows);
  const loader = createRuntimeCatalogLoader({
    worldBaseReader: reader,
    supportedRuntimeContractDigests: [digest('d')]
  });

  const catalog = await loader.loadApprovedItemCatalog({ pin: fixture.pin });

  assert.equal(catalog.verified, true);
  assert.equal(Object.isFrozen(catalog), true);
  assert.deepEqual(
    catalog.records_by_table.quantity_unit_definitions.map(({ id }) => id),
    ['quantity-piece']
  );
  assert.equal(catalog.dependency_assertions.length, 9);
  assert.deepEqual(
    calls.map(({ sql }) => Object.keys(fixture.rows).find(
      (table) => sql.includes(`world_base.${table}`)
    )),
    [
      'domain_catalog_revisions',
      'catalog_imports',
      'catalog_import_tables',
      'catalog_import_records',
      'catalog_import_dependency_assertions',
      'graph_nodes'
    ]
  );
  assert.equal(
    calls.every(({ sql }) =>
      !sql.includes('runtime_catalog_activation_events')
      && !sql.includes('quantity_unit_definitions')),
    true
  );
});

for (const scenario of [
  {
    name: 'record digest tampering',
    mutate: (rows) => {
      rows.catalog_import_records[0].record_digest = digest('0');
    },
    code: 'RUNTIME_CATALOG_MEMBERSHIP_INVALID'
  },
  {
    name: 'G4 base snapshot tampering',
    mutate: (rows) => {
      const assertion = rows.catalog_import_dependency_assertions[0];
      const payload = structuredClone(assertion.expected_base_canonical_payload);
      payload.canonical_fields.status = 'approved';
      assertion.expected_base_canonical_payload = payload;
    },
    code: 'RUNTIME_CATALOG_DEPENDENCY_ASSERTION_INVALID'
  },
  {
    name: 'live G4 base row drift after import',
    mutate: (rows) => {
      rows.graph_nodes[0].status = 'approved';
    },
    code: 'RUNTIME_CATALOG_DEPENDENCY_ASSERTION_INVALID'
  }
]) {
  test(`historical reconstruction fails closed: ${scenario.name}`, async () => {
    const fixture = await approvedLedgerFixture();
    scenario.mutate(fixture.rows);
    const { reader } = readerFor(fixture.rows);
    const loader = createRuntimeCatalogLoader({
      worldBaseReader: reader,
      supportedRuntimeContractDigests: [digest('d')]
    });

    await assert.rejects(
      () => loader.loadApprovedItemCatalog({ pin: fixture.pin }),
      (error) => error instanceof RuntimeCatalogError && error.code === scenario.code
    );
  });
}

for (const scenario of [
  {
    name: 'missing activation',
    rows: activeRows({ activation: [] }),
    code: 'RUNTIME_CATALOG_ACTIVATION_MISSING'
  },
  {
    name: 'missing domain revision',
    rows: activeRows({ domain: [] }),
    code: 'RUNTIME_CATALOG_REVISION_MISMATCH'
  },
  {
    name: 'scope mismatch',
    rows: activeRows({
      domain: [{
        ...activeRows().domain_catalog_revisions[0],
        catalog_scope: 'other_scope'
      }]
    }),
    code: 'RUNTIME_CATALOG_SCOPE_MISMATCH'
  },
  {
    name: 'unsupported runtime contract',
    rows: activeRows({
      pin: { runtime_contract_digest: digest('9') }
    }),
    code: 'RUNTIME_CATALOG_CONTRACT_UNSUPPORTED'
  }
]) {
  test(`active pin fails closed: ${scenario.name}`, async () => {
    const { reader } = readerFor(scenario.rows);
    const loader = createRuntimeCatalogLoader({
      worldBaseReader: reader,
      supportedRuntimeContractDigests: [digest('d')]
    });

    await assert.rejects(
      () => loader.loadActivePin({ catalogScope: RUNTIME_CATALOG_SCOPE }),
      (error) => error instanceof RuntimeCatalogError && error.code === scenario.code
    );
  });
}

test('compatible world check is fail-closed and preserves separate identities', () => {
  const pin = domainPin();
  const worldPin = {
    world_revision_id: pin.compatible_world_revision_id,
    world_catalog_digest: pin.compatible_world_catalog_digest
  };

  assert.equal(assertCompatibleWorldPin({ domainPin: pin, worldPin }), pin);
  assert.throws(
    () => assertCompatibleWorldPin({
      domainPin: pin,
      worldPin: { ...worldPin, world_catalog_digest: digest('0') }
    }),
    (error) => error instanceof RuntimeCatalogError
      && error.code === 'RUNTIME_CATALOG_BASE_WORLD_PIN_MISMATCH'
  );
});

test('applicable projection is pure, immutable and filters only verified records', () => {
  const verifiedCatalog = Object.freeze({
    schema: 'rus.verified_item_catalog.v2',
    verified: true,
    records_by_table: Object.freeze({
      item_profile_candidates: Object.freeze([
        Object.freeze({
          id: 'novgorod-spring',
          region_id: 'region_novgorod_land',
          valid_from: '1230-01-01',
          valid_to: '1230-12-31'
        }),
        Object.freeze({
          id: 'other-region',
          region_id: 'region_other',
          valid_from: '1200-01-01',
          valid_to: null
        })
      ])
    })
  });

  const projected = selectApplicableItemCatalog({
    verifiedCatalog,
    regionId: 'region_novgorod_land',
    effectiveDate: '1230-04-01'
  });

  assert.deepEqual(
    projected.records_by_table.item_profile_candidates.map(({ id }) => id),
    ['novgorod-spring']
  );
  assert.equal(Object.isFrozen(projected), true);
  assert.equal(verifiedCatalog.records_by_table.item_profile_candidates.length, 2);
});
