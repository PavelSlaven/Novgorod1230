import assert from 'node:assert/strict';
import test from 'node:test';
import {
  computeDependencyAssertionsAuditDigest,
  computeDependencyAssertionsSemanticDigest,
  computeImportAuditDigest,
  computeRecordsDigest,
  computeTablePayloadDigest,
  computeTablesDigest,
  computeTargetCatalogDigest
} from '../src/ledger-digests.js';

const digest = (character) => character.repeat(64);

function record(overrides = {}) {
  return {
    table_name: 'fixture_records',
    record_key: '{"id":"one"}',
    operation_kind: 'insert',
    canonical_payload: {
      schema: 'rus.catalog_record_projection.v2',
      table_name: 'fixture_records',
      record_key: { id: 'one' },
      canonical_fields: { id: 'one', value: 'value' }
    },
    record_digest: digest('1'),
    ordinal: 0,
    ...overrides
  };
}

function assertion(overrides = {}) {
  return {
    catalog_scope: 'item_container_materialization_v2',
    target_table: 'graph_nodes',
    record_key: '{"id":"g4-one"}',
    expected_base_record_digest: digest('2'),
    asserted_status: 'approved',
    source_transition_semantic_digest: digest('3'),
    historical_approval_basis_digest: digest('4'),
    semantic_assertion_digest: digest('5'),
    overlay_approval_request_digest: digest('6'),
    overlay_approval_attestation_digest: digest('7'),
    ordinal: 0,
    ...overrides
  };
}

test('ledger digests separate target semantics from approval/import audit metadata', () => {
  const records = [record()];
  const table = {
    table_name: 'fixture_records',
    dependency_order: 0,
    insert_count: 1,
    assert_existing_count: 0,
    record_count: 1,
    payload_digest: computeTablePayloadDigest(records)
  };
  const assertions = [assertion()];
  const targetPayload = {
    schema: 'rus.domain_catalog_payload.v2',
    catalog_scope: 'item_container_materialization_v2',
    target_revision_id: 'target-revision',
    compatible_world_tuple: {
      compatible_world_revision_id: 'world-revision',
      compatible_world_catalog_digest: digest('8'),
      compatible_world_pin_manifest_digest: digest('9')
    },
    record_registry_digest: digest('a'),
    tables: [table],
    dependency_assertions_semantic_digest:
      computeDependencyAssertionsSemanticDigest(assertions)
  };
  const root = {
    schema: 'rus.catalog_import_audit.v2',
    import_id: 'import-one',
    catalog_scope: 'item_container_materialization_v2',
    target_revision_id: 'target-revision',
    target_catalog_digest: computeTargetCatalogDigest(targetPayload),
    record_registry_digest: digest('a'),
    approval_request_digest: digest('6'),
    approval_attestation_digest: digest('7'),
    tables_digest: computeTablesDigest([table]),
    records_digest: computeRecordsDigest(records),
    dependency_assertions_semantic_digest:
      computeDependencyAssertionsSemanticDigest(assertions),
    dependency_assertions_audit_digest:
      computeDependencyAssertionsAuditDigest(assertions),
    imported_at: '2026-07-23T00:00:00.000000Z'
  };

  const changedApproval = [assertion({
    overlay_approval_attestation_digest: digest('b')
  })];
  const laterImport = {
    ...root,
    imported_at: '2030-01-01T00:00:00.000000Z'
  };

  assert.equal(
    computeDependencyAssertionsSemanticDigest(assertions),
    computeDependencyAssertionsSemanticDigest(changedApproval)
  );
  assert.notEqual(
    computeDependencyAssertionsAuditDigest(assertions),
    computeDependencyAssertionsAuditDigest(changedApproval)
  );
  assert.equal(computeImportAuditDigest(root), computeImportAuditDigest(laterImport));
  assert.notEqual(
    computeRecordsDigest(records),
    computeRecordsDigest([record({ operation_kind: 'assert_existing' })])
  );
  assert.match(root.target_catalog_digest, /^[a-f0-9]{64}$/u);
  assert.match(computeImportAuditDigest(root), /^[a-f0-9]{64}$/u);
});
