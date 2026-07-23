import assert from 'node:assert/strict';
import test from 'node:test';
import {
  RuntimeCatalogToolingError,
  compileOverlaySemanticPayload
} from '../src/overlay-compiler.js';

const digest = (character) => character.repeat(64);
const entry = (tableName, dependencyOrder, canonicalColumns = ['id', 'value']) => ({
  table_name: tableName,
  operation_domain: tableName === 'graph_nodes'
    ? 'dependency_assertion'
    : 'catalog_membership',
  primary_key_fields: ['id'],
  canonical_columns: canonicalColumns,
  excluded_operational_columns: [],
  column_normalizers: Object.fromEntries(
    canonicalColumns.map((column) => [column, 'text_nfc'])
  ),
  canonical_row_schema_version: 'rus.catalog_record_projection.v2',
  dependency_order: dependencyOrder,
  reader_adapter_id: `${tableName}-reader-v1`,
  writer_adapter_id: tableName === 'graph_nodes'
    ? `${tableName}-assertion-v1`
    : `${tableName}-writer-v1`
});

const registry = {
  schema: 'rus.catalog_record_registry.v1',
  catalog_scope: 'item_container_materialization_v2',
  entries: [
    entry('parent_records', 0),
    entry('child_records', 1, ['id', 'parent_id', 'value']),
    entry('graph_nodes', 2, ['id', 'status'])
  ]
};

function input(overrides = {}) {
  return {
    registry,
    parentTuple: {
      parent_revision_id: 'parent-revision',
      parent_catalog_digest: digest('1'),
      parent_snapshot_manifest_digest: digest('2')
    },
    compatibleWorldTuple: {
      compatible_world_revision_id: 'world-revision',
      compatible_world_catalog_digest: digest('3'),
      compatible_world_pin_manifest_digest: digest('4')
    },
    targetRevisionId: 'target-revision',
    parentRowsByTable: {
      parent_records: [{ id: 'existing', value: 'same' }],
      child_records: [],
      graph_nodes: Array.from({ length: 9 }, (_, index) => ({
        id: `g4-${index + 1}`,
        status: 'draft'
      }))
    },
    candidateRowsByTable: {
      parent_records: [
        { id: 'existing', value: 'same' },
        { id: 'new', value: 'inserted' }
      ],
      child_records: [{
        id: 'child',
        parent_id: 'existing',
        value: 'dependent'
      }]
    },
    dependencyLinks: [{
      source_table: 'child_records',
      source_column: 'parent_id',
      target_table: 'parent_records',
      target_column: 'id'
    }],
    g4Transitions: Array.from({ length: 9 }, (_, index) => ({
      graph_node_id: `g4-${index + 1}`,
      asserted_status: 'approved',
      source_transition_semantic_digest: digest('5'),
      historical_approval_basis_digest: digest('6')
    })),
    ...overrides
  };
}

test('delta compiler classifies records, closes dependencies and emits nine scoped assertions', () => {
  const compiled = compileOverlaySemanticPayload(input());
  const parentOperations = compiled.record_operations_by_table
    .find(({ table_name }) => table_name === 'parent_records').records;

  assert.deepEqual(
    parentOperations.map(({ record_key, operation_kind, ordinal }) => ({
      record_key,
      operation_kind,
      ordinal
    })),
    [
      { record_key: '{"id":"existing"}', operation_kind: 'assert_existing', ordinal: 0 },
      { record_key: '{"id":"new"}', operation_kind: 'insert', ordinal: 1 }
    ]
  );
  assert.equal(compiled.dependency_assertions.length, 9);
  assert.equal(
    compiled.dependency_assertions.every(
      ({ target_table, asserted_status }) =>
        target_table === 'graph_nodes' && asserted_status === 'approved'
    ),
    true
  );
  assert.equal(
    compiled.record_operations_by_table.some(({ table_name }) => table_name === 'graph_nodes'),
    false
  );
  assert.match(compiled.target_catalog_digest, /^[a-f0-9]{64}$/u);
});

for (const scenario of [
  {
    name: 'existing key changed',
    mutate: (value) => {
      value.candidateRowsByTable.parent_records[0].value = 'different';
    },
    code: 'OVERLAY_RECORD_CONFLICT'
  },
  {
    name: 'transitive dependency is outside membership',
    mutate: (value) => {
      value.candidateRowsByTable.parent_records =
        value.candidateRowsByTable.parent_records.filter(({ id }) => id !== 'existing');
    },
    code: 'OVERLAY_DEPENDENCY_OUTSIDE_MEMBERSHIP'
  },
  {
    name: 'G4 transition count is not exact',
    mutate: (value) => {
      value.g4Transitions.pop();
    },
    code: 'OVERLAY_G4_ASSERTION_SET_INVALID'
  },
  {
    name: 'graph nodes are proposed as writes',
    mutate: (value) => {
      value.candidateRowsByTable.graph_nodes = [{ id: 'g4-1', status: 'approved' }];
    },
    code: 'OVERLAY_GRAPH_NODE_WRITE_FORBIDDEN'
  }
]) {
  test(`delta compiler fails closed: ${scenario.name}`, () => {
    const value = input();
    scenario.mutate(value);
    assert.throws(
      () => compileOverlaySemanticPayload(value),
      (error) => error instanceof RuntimeCatalogToolingError
        && error.code === scenario.code
    );
  });
}

test('parent mutation propagates through candidate semantics but not target content identity', () => {
  const original = compileOverlaySemanticPayload(input());
  const changedInput = input();
  changedInput.parentTuple.parent_catalog_digest = digest('9');
  const changed = compileOverlaySemanticPayload(changedInput);

  assert.notEqual(original.semantic_payload_digest, changed.semantic_payload_digest);
  assert.equal(original.target_catalog_digest, changed.target_catalog_digest);
});
