import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  canonicalRecordKey,
  canonicalStringify,
  computeCanonicalRecordDigest,
  computeRecordRegistryDigest,
  projectCanonicalRecord
} from '../src/canonical-records.js';

const root = new URL('../../../', import.meta.url);

const registryEntry = Object.freeze({
  table_name: 'fixture_records',
  operation_domain: 'test',
  primary_key_fields: ['scope_id', 'record_id'],
  canonical_columns: [
    'scope_id',
    'record_id',
    'quantity',
    'ratio',
    'effective_date',
    'observed_at',
    'payload',
    'enabled',
    'label'
  ],
  excluded_operational_columns: ['created_at', 'updated_at'],
  column_normalizers: {
    scope_id: 'text_nfc',
    record_id: 'integer_decimal',
    quantity: 'numeric_decimal',
    ratio: 'numeric_decimal',
    effective_date: 'date',
    observed_at: 'timestamptz_microseconds',
    payload: 'jsonb',
    enabled: 'boolean',
    label: 'text_nfc'
  },
  canonical_row_schema_version: 'rus.catalog_record_projection.v2',
  dependency_order: 1,
  reader_adapter_id: 'fixture-records-reader-v1',
  writer_adapter_id: 'fixture-records-writer-v1'
});

test('canonical projection table normalizes simple/composite keys and semantic values', () => {
  const logicallyEquivalentRows = [
    {
      scope_id: 'cafe\u0301',
      record_id: 7,
      quantity: '0012.3400',
      ratio: '-0.000',
      effective_date: '1230-04-01',
      observed_at: '1230-04-01T10:20:30.12Z',
      payload: { z: 1, a: { second: true, first: null }, list: [3, 1, 2] },
      enabled: true,
      label: 'e\u0301quipement',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-02T00:00:00Z'
    },
    {
      updated_at: '2030-02-02T00:00:00Z',
      label: 'équipement',
      enabled: true,
      payload: { list: [3, 1, 2], a: { first: null, second: true }, z: 1 },
      observed_at: '1230-04-01T10:20:30.120000Z',
      effective_date: '1230-04-01',
      ratio: '0',
      quantity: '12.34',
      record_id: '7',
      scope_id: 'café',
      created_at: '2030-01-01T00:00:00Z'
    }
  ];

  const projections = logicallyEquivalentRows.map((row) =>
    projectCanonicalRecord({ registryEntry, row })
  );

  assert.deepEqual(projections[0], projections[1]);
  assert.deepEqual(projections[0], {
    schema: 'rus.catalog_record_projection.v2',
    table_name: 'fixture_records',
    record_key: { scope_id: 'café', record_id: '7' },
    canonical_fields: {
      scope_id: 'café',
      record_id: '7',
      quantity: '12.34',
      ratio: '0',
      effective_date: '1230-04-01',
      observed_at: '1230-04-01T10:20:30.120000Z',
      payload: { a: { first: null, second: true }, list: [3, 1, 2], z: 1 },
      enabled: true,
      label: 'équipement'
    }
  });
  assert.equal(
    canonicalRecordKey({ registryEntry, row: logicallyEquivalentRows[0] }),
    '{"record_id":"7","scope_id":"café"}'
  );
  assert.equal(
    computeCanonicalRecordDigest(projections[0]),
    computeCanonicalRecordDigest(projections[1])
  );
});

test('canonical digests preserve array order and bind meaningful row/registry changes', () => {
  const base = {
    scope_id: 'scope',
    record_id: 1,
    quantity: '1.0',
    ratio: '2.50',
    effective_date: '1230-01-01',
    observed_at: '1230-01-01T00:00:00Z',
    payload: { ordered: ['a', 'b'] },
    enabled: false,
    label: 'base'
  };
  const projection = projectCanonicalRecord({ registryEntry, row: base });
  const changedArray = projectCanonicalRecord({
    registryEntry,
    row: { ...base, payload: { ordered: ['b', 'a'] } }
  });
  const changedField = projectCanonicalRecord({
    registryEntry,
    row: { ...base, label: 'changed' }
  });
  const changedRegistry = {
    ...registryEntry,
    dependency_order: 2
  };

  assert.notEqual(
    computeCanonicalRecordDigest(projection),
    computeCanonicalRecordDigest(changedArray)
  );
  assert.notEqual(
    computeCanonicalRecordDigest(projection),
    computeCanonicalRecordDigest(changedField)
  );
  assert.notEqual(
    computeRecordRegistryDigest([registryEntry]),
    computeRecordRegistryDigest([changedRegistry])
  );
  assert.equal(
    canonicalStringify({ b: 2, a: 1 }),
    canonicalStringify({ a: 1, b: 2 })
  );
});

test('versioned item/container registry exactly covers PR17 tables and graph-node assertions', async () => {
  const candidateRoot = new URL(
    'data/knowledge-source/imports/item-container-120-v5/candidate/',
    root
  );
  const manifest = JSON.parse(
    await readFile(new URL('manifest.json', candidateRoot), 'utf8')
  );
  const registry = JSON.parse(
    await readFile(
      new URL('data/runtime-catalog/item-container-record-registry.v1.json', root),
      'utf8'
    )
  );
  const expectedTables = [
    ...manifest.datasets.map(({ table }) => table),
    'graph_nodes'
  ].sort();

  assert.equal(registry.schema, 'rus.catalog_record_registry.v1');
  assert.equal(registry.catalog_scope, 'item_container_materialization_v2');
  assert.deepEqual(
    registry.entries.map(({ table_name }) => table_name).sort(),
    expectedTables
  );
  assert.equal(
    new Set(registry.entries.map(({ reader_adapter_id }) => reader_adapter_id)).size,
    registry.entries.length
  );
  for (const entry of registry.entries) {
    assert.ok(entry.primary_key_fields.length > 0, entry.table_name);
    assert.ok(entry.canonical_columns.length > 0, entry.table_name);
    assert.equal(
      entry.canonical_columns.every((column) => entry.column_normalizers[column]),
      true,
      entry.table_name
    );
    assert.match(entry.reader_adapter_id, /^[a-z0-9-]+-reader-v1$/u);
    assert.match(entry.writer_adapter_id, /^[a-z0-9-]+-(?:writer|assertion)-v1$/u);
  }
  const graphNodes = registry.entries.find(({ table_name }) => table_name === 'graph_nodes');
  assert.equal(graphNodes.operation_domain, 'dependency_assertion');
  assert.ok(graphNodes.canonical_columns.includes('status'));
  assert.deepEqual(
    graphNodes.excluded_operational_columns.sort(),
    ['created_at', 'updated_at']
  );
  assert.match(computeRecordRegistryDigest(registry), /^[a-f0-9]{64}$/u);
});
